// eslint-disable-next-line max-classes-per-file

import { CorePlugin } from "@ulixee/hero-plugin-utils";
import { IOnClientCommandMeta } from "@ulixee/hero-interfaces/ICorePlugin";
import { ISendToCoreFn } from "@ulixee/hero-interfaces/IClientPlugin";
import ClientPlugin from "@ulixee/hero-plugin-utils/lib/ClientPlugin";
import type Hero from "@ulixee/hero";
import type Tab from "@ulixee/hero/lib/Tab";
import type FrameEnvironment from "@ulixee/hero/lib/FrameEnvironment";
import { IPage } from "@ulixee/unblocked-specification/agent/browser/IPage";
import { IFrame } from "@ulixee/unblocked-specification/agent/browser/IFrame";

import process from "process";
import type { JSONObject } from "./types";
import { UnboundedBlockingQueue } from "./UnboundedBlockingQueue";

type ObservedMutationSerializable = {"observerName": string, "payload": JSONObject};
type ObserversMap<T extends JSONObject> = {
    [observerName: string]: {
        callback: (data: T) => void,
        active: boolean
    }
}

let micros = () => {
    const hrTime = process.hrtime();
    return hrTime[0] * 1000000 + hrTime[1] / 1000
}

export class registerObserverClientPlugin extends ClientPlugin {
    public static override id = "observerMax";
    public static coreDependencyIds = ["observerMax"];
    
    private isObserving = false;
    private observers: ObserversMap<JSONObject> = {};
    
    
    public async onHero(hero: Hero, sendToCore: ISendToCoreFn) {
        hero.registerObserver = this.registerObserver.bind(this, sendToCore);
        hero.observe = this.observe.bind(this, sendToCore);
        hero.disconnect = this.disconnect.bind(this, sendToCore);
    }
    
    public onTab(hero: Hero, tab: Tab, sendToCore: ISendToCoreFn): void {
        tab.registerObserver = this.registerObserver.bind(this, sendToCore);
        tab.observe = this.observe.bind(this, sendToCore);
        tab.disconnect = this.disconnect.bind(this, sendToCore);
    }
    
    public onFrameEnvironment(hero: Hero, frameEnvironment: FrameEnvironment, sendToCore: ISendToCoreFn): void {
        frameEnvironment.registerObserver = this.registerObserver.bind(this, sendToCore);
        frameEnvironment.observe = this.observe.bind(this, sendToCore);
        frameEnvironment.disconnect = this.disconnect.bind(this, sendToCore);
    }

    private observe(sendToCore: ISendToCoreFn, observerName: string) {
        let sent = sendToCore(this.id, <IRegisterObserverArgs>{
            action: EOnClientCommandActions.OBSERVE,
            observerName,
            isolateFromWebPageEnvironment: true,
        });

        this.observers[observerName].active = true;
        
        const checkForChanges = async () => {
            this.isObserving = true;
            while (Object.values(this.observers).some(o => o.active)) {
                const pollResult: ObservedMutationSerializable = await sendToCore(this.id, <IRegisterObserverArgs>{
                    action: EOnClientCommandActions.POLL,
                    observerName: "", // Does not matter in this case.
                    isolateFromWebPageEnvironment: true,
                })
                
                let polledObserverName = pollResult["observerName"];
                let payload = pollResult["payload"];
                
                // Do the callback
                this.observers[polledObserverName].callback(payload);
            }
            this.isObserving = false;
        };
        if (!this.isObserving)
            checkForChanges();

        return sent;
    }
    
    private disconnect(sendToCore: ISendToCoreFn, observerName: string) {
        this.observers[observerName].active = false;
        return sendToCore(this.id, <IRegisterObserverArgs>{
            action: EOnClientCommandActions.DISCONNECT,
            observerName,
            isolateFromWebPageEnvironment: true,
        });
    }
    
    private registerObserver<T extends any[]>(
        sendToCore: ISendToCoreFn,
        observerName: string,
        processMutations: (
            mutations: MutationRecord[],
        ) => JSONObject,
        dataCallback: (data: JSONObject) => void,
        ...args: T
    ): Promise<any> {
        this.observers[observerName] = {
            callback: dataCallback,
            active: true
        };

        let mutationCallbackSerialized = `${processMutations.toString()}`;
        sendToCore(this.id, <IRegisterObserverArgs>{
            action: EOnClientCommandActions.REGISTER,
            observerName: observerName,
            mutationCallbackSerialized,
            args,
            isolateFromWebPageEnvironment: true,
        });
        
        return Promise.resolve();
    }
}



export class registerObserverCorePlugin extends CorePlugin {
    public static override id = "observerMax";
    
    public observedQueue = new UnboundedBlockingQueue<ObservedMutationSerializable>();
    
    public async onClientCommand(
        { frame, page }: IOnClientCommandMeta,
        args: IOnClientCommandArgs,
    ): Promise<any> {
        switch (args.action) {
            case EOnClientCommandActions.REGISTER:
            return this.registerObserver(
                { frame, page },
                args as IRegisterObserverArgs,
            );
            case EOnClientCommandActions.OBSERVE:
            return this.observerObserve(
                { frame, page },
                args as IObserverConnectArgs,
            );
            case EOnClientCommandActions.DISCONNECT:
            return this.observerDisconnect(
                { frame, page },
                args as IOnClientCommandArgs,
            );
            case EOnClientCommandActions.POLL:
            return this.pollEvents();
        }
    }
    
    private pollEvents() {
        let event = this.observedQueue.dequeue();
        return event;
    }
    
    private async observerObserve(
        { frame, page }: IOnClientCommandMeta,
        args: IObserverConnectArgs,
    ): Promise<any> {
        const { observerName: fnName, targetNode, config } = args;
        frame ??= page.mainFrame;
        
        const result = await frame.evaluate<any>(
            `window['HERO_OBSERVERS']["${fnName}"].observer.observe(${targetNode || "document"}, ${JSON.stringify(config || { childList: true, subtree: true })});`,
            args.isolateFromWebPageEnvironment,
            {
                includeCommandLineAPI: true,
            },
        );
        
        if ((result as any)?.error) {
            this.logger.error<any>(fnName, { error: result.error });
            throw new Error((result as any).error as string);
        } else {
            return result as any;
        }
    }
    
    private async observerDisconnect(
        { frame, page }: IOnClientCommandMeta,
        args: IOnClientCommandArgs,
    ): Promise<any> {
        const { observerName: fnName } = args;
        frame ??= page.mainFrame;
        
        const result = await frame.evaluate<any>(
            `window['HERO_OBSERVERS']["${fnName}"].observer.disconnect();`,
            args.isolateFromWebPageEnvironment,
            {
                includeCommandLineAPI: true,
            },
        );
        
        if ((result as any)?.error) {
            this.logger.error<any>(fnName, { error: result.error });
            throw new Error((result as any).error as string);
        } else {
            return result as any;
        }
    }
    
    private async registerObserver(
        { frame, page }: IOnClientCommandMeta,
        args: IRegisterObserverArgs,
    ): Promise<any> {
        const {
            observerName,
            mutationCallbackSerialized,
            isolateFromWebPageEnvironment,
        } = args;
        frame ??= page.mainFrame;
        
        const result = await frame.evaluate<any>(
            `window['HERO_OBSERVERS']["${observerName}"] = { 
                mutationCallback: ${mutationCallbackSerialized},
            };`,
            isolateFromWebPageEnvironment,
            {
                includeCommandLineAPI: true,
            },
        );
        
        if ((result as any)?.error) {
            this.logger.error<any>(observerName, { error: result.error });
            throw new Error((result as any).error as string);
        }
        const createObserverResult = await frame.evaluate<any>(
            `window['HERO_OBSERVERS']["${observerName}"]['observer'] = new MutationObserver((mutations) => {
                window['HERO_LOG'](
                    JSON.stringify({
                        "observerName": "${observerName}",
                        "payload": JSON.stringify(window['HERO_OBSERVERS']["${observerName}"].mutationCallback(mutations)) 
                    })
                )   
            });`,
            isolateFromWebPageEnvironment,
            {
                includeCommandLineAPI: true,
            },
        );
        
        if ((result as any)?.error) {
            this.logger.error<any>(`${observerName}Callback`, {
                error: createObserverResult.error,
            });
            throw new Error((createObserverResult as any).error as string);
        } else {
            return result as any;
        }
    }
    
    private async LogFromPage(fullPayloadString: string, frame: IFrame) {
        let fullPayload = JSON.parse(fullPayloadString);
        fullPayload['payload'] = JSON.parse(fullPayload['payload']);
        this.observedQueue.enqueue(fullPayload);
    }
    
    public onNewPage(page: IPage): Promise<any> {
        const addCallbackPromise = page.addPageCallback(
            "HERO_LOG",
            (payload, frame) => {
                return this.LogFromPage(payload, frame);
            },
            true,
        );
        
        const addHeroObserversObject = page.addNewDocumentScript(
            "window['HERO_OBSERVERS'] = {};",
            true,
        );
        
        return Promise.all([addCallbackPromise, addHeroObserversObject]);
    }
}

interface IRegisterObserverArgs extends IOnClientCommandArgs {
    mutationCallbackSerialized: string;
}

interface IObserverConnectArgs extends IOnClientCommandArgs {
    targetNode: Node;
    config: MutationObserverInit;
}

interface IOnClientCommandArgs {
    action: EOnClientCommandActions;
    observerName: string;
    isolateFromWebPageEnvironment: boolean;
    args: any[];
}

enum EOnClientCommandActions {
    REGISTER,
    OBSERVE,
    DISCONNECT,
    POLL,
}

interface IregisterObserverPlugin {
    registerObserver: <T extends any[]>(
        mutationCallbackName: string,
        processMutations: (
            mutations: MutationRecord[],
        ) => JSONObject,
        dataCallback: (data: JSONObject) => void,
        ...args: T
    ) => Promise<any>;
    observe: (observerName: string) => Promise<any>;
    disconnect: (observerName: string) => Promise<any>;
}

declare module "@ulixee/hero/lib/extendables" {
    interface Hero extends IregisterObserverPlugin {}
    interface Tab extends IregisterObserverPlugin {}
    interface FrameEnvironment extends IregisterObserverPlugin {}
}
