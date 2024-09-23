import { CorePlugin } from "@ulixee/hero-plugin-utils";
import { IOnClientCommandMeta } from "@ulixee/hero-interfaces/ICorePlugin";
import { ISendToCoreFn } from "@ulixee/hero-interfaces/IClientPlugin";
import ClientPlugin from "@ulixee/hero-plugin-utils/lib/ClientPlugin";
import type Hero from "@ulixee/hero";
import type Tab from "@ulixee/hero/lib/Tab";
import type FrameEnvironment from "@ulixee/hero/lib/FrameEnvironment";
import { IPage } from "@ulixee/unblocked-specification/agent/browser/IPage";
import { IFrame } from "@ulixee/unblocked-specification/agent/browser/IFrame";

export type JSONObject = { [Key in string]: JSONValue } & { [Key in string]?: JSONValue | undefined };
export type JSONArray = JSONValue[] | readonly JSONValue[];
export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;

type ObserversMap<T> = {
    [observerName: string]: {
        callback: (data: T) => Promise<void> | void;
        active: boolean;
    };
};

export class registerObserverClientPlugin extends ClientPlugin {
    public static override id = "PLUGIN_OBSERVER";
    public static coreDependencyIds = ["PLUGIN_OBSERVER"];

    private isObserving = false;
    private observers: ObserversMap<JSONObject> = {};

    public onHero(hero: Hero, sendToCore: ISendToCoreFn) {
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

    private observe(
        sendToCore: ISendToCoreFn,
        observerName: string,
        targetNodeSelector?: string,
        config?: MutationObserverInit,
    ) {
        const sent = sendToCore(this.id, <IObserverConnectDisconnectArgs>{
            action: EOnClientCommandActions.OBSERVE,
            observerName,
            isolateFromWebPageEnvironment: true,
            targetNodeSelector,
            config,
        });

        const currentObserver = this.observers[observerName];
        if (currentObserver === undefined)
            throw new Error(`Observer ${observerName} is not registered. Please register it first.`);
        currentObserver.active = true;

        const checkForChanges = async () => {
            this.isObserving = true;
            while (Object.values(this.observers).some((o) => o.active)) {
                const pollResult = (await sendToCore(this.id, <IObserverConnectDisconnectArgs>{
                    action: EOnClientCommandActions.POLL,
                    observerName: "", // Does not matter in this case.
                    isolateFromWebPageEnvironment: true,
                })) as Passing; //I can do this since its typed in the core plugin

                const polledObserverName = pollResult["observerName"];
                const payload = pollResult["payload"];

                // Do the callback
                const currentObserver = this.observers[observerName];
                if (currentObserver === undefined)
                    throw new Error(`Observer ${observerName} is not registered. Please register it first.`);
                if (currentObserver.active) await currentObserver.callback(payload);
                else console.log(`Received data for inactive observer ${polledObserverName}`);
            }
            this.isObserving = false;
        };
        if (!this.isObserving) checkForChanges().catch(console.error);

        return sent;
    }

    private disconnect(sendToCore: ISendToCoreFn, observerName: string) {
        const currentObserver = this.observers[observerName];
        if (currentObserver === undefined)
            throw new Error(`Observer ${observerName} is not registered. Please register it first.`);
        currentObserver.active = false;

        return sendToCore(this.id, <IRegisterObserverArgs>{
            action: EOnClientCommandActions.DISCONNECT,
            observerName,
            isolateFromWebPageEnvironment: true,
        });
    }

    private registerObserver<T extends JSONObject>(
        sendToCore: ISendToCoreFn,
        observerName: string,
        processMutations: (mutations: MutationRecord[]) => T,
        dataCallback: (data: JSONObject) => Promise<void> | void,
    ) {
        this.observers[observerName] = {
            callback: dataCallback,
            active: true,
        };

        const mutationCallbackSerialized = `${processMutations.toString()}`;
        sendToCore(this.id, <IRegisterObserverArgs>{
            action: EOnClientCommandActions.REGISTER,
            observerName: observerName,
            mutationCallbackSerialized,
            isolateFromWebPageEnvironment: true,
        }).catch(console.error);

        return Promise.resolve();
    }
}

type Passing = {
    observerName: string;
    payload: JSONObject;
};
type PassingHalf = {
    observerName: string;
    payload: string;
};
export class registerObserverCorePlugin<T> extends CorePlugin {
    public static override id = "PLUGIN_OBSERVER";

    public observedQueue = new UnboundedBlockingQueue<Passing>();

    public async onClientCommand(
        { frame, page }: IOnClientCommandMeta,
        args: IOnClientCommandArgs,
    ): Promise<undefined | Passing> {
        switch (args.action) {
            case EOnClientCommandActions.REGISTER:
                return this.registerObserver({ frame, page }, args as IRegisterObserverArgs);
            case EOnClientCommandActions.OBSERVE:
                return this.observerObserve({ frame, page }, args as IObserverConnectDisconnectArgs);
            case EOnClientCommandActions.DISCONNECT:
                return this.observerDisconnect({ frame, page }, args as IObserverConnectDisconnectArgs);
            case EOnClientCommandActions.POLL:
                return this.pollEvents();
        }
    }

    private pollEvents() {
        const event = this.observedQueue.dequeue();
        return event;
    }

    private async observerObserve(
        { frame, page }: IOnClientCommandMeta,
        args: IObserverConnectDisconnectArgs,
    ): Promise<undefined> {
        const { observerName, targetNodeSelector, config } = args;
        frame ??= page.mainFrame;

        let targetingText = "document";
        if (targetNodeSelector !== undefined)
            targetingText = `document.evaluate("${targetNodeSelector}", document, null, 7, null).snapshotItem(0)`;

        // Add cb for error for can't find the node from xpath ^
        const result = await frame.evaluate<unknown>(
            `window['HERO_OBSERVERS']["${observerName}"].observer.observe(${targetingText}, ${JSON.stringify(config || {})});`,
            args.isolateFromWebPageEnvironment,
            {
                includeCommandLineAPI: true,
            },
        );

        if (result instanceof Error) {
            console.log(observerName, result);
            throw result;
        }
    }

    private async observerDisconnect(
        { frame, page }: IOnClientCommandMeta,
        args: IOnClientCommandArgs,
    ): Promise<undefined> {
        const { observerName } = args;
        frame ??= page.mainFrame;

        const result = await frame.evaluate<unknown>(
            `window['HERO_OBSERVERS']["${observerName}"].observer.disconnect();`,
            args.isolateFromWebPageEnvironment,
            {
                includeCommandLineAPI: true,
            },
        );

        if (result instanceof Error) {
            console.log(observerName, result);
            throw result;
        }
    }

    private async registerObserver(
        { frame, page }: IOnClientCommandMeta,
        args: IRegisterObserverArgs,
    ): Promise<undefined> {
        const { observerName, mutationCallbackSerialized, isolateFromWebPageEnvironment } = args;
        frame ??= page.mainFrame;

        const result = await frame.evaluate<unknown>(
            `window['HERO_OBSERVERS']["${observerName}"] = { 
                mutationCallback: ${mutationCallbackSerialized},
            };`,
            isolateFromWebPageEnvironment,
            {
                includeCommandLineAPI: true,
            },
        );

        if (result instanceof Error) {
            console.log(observerName, result);
            throw result;
        }

        const createObserverResult = await frame.evaluate<unknown>(
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

        if (createObserverResult instanceof Error) {
            console.log(observerName, createObserverResult);
            throw createObserverResult;
        }
    }

    private LogFromPage(fullPayloadString: string, frame: IFrame) {
        const halfParsed = JSON.parse(fullPayloadString) as PassingHalf;
        const fullParsed: Passing = {
            observerName: halfParsed.observerName,
            payload: JSON.parse(halfParsed.payload) as JSONObject,
        };
        return this.observedQueue.enqueue(fullParsed);
    }

    public onNewPage(page: IPage) {
        const addCallbackPromise = page.addPageCallback(
            "HERO_LOG",
            (payload, frame) => {
                return this.LogFromPage(payload, frame);
            },
            true,
        );

        const addHeroObserversObject = page.addNewDocumentScript("window['HERO_OBSERVERS'] = {};", true);

        return Promise.all([addCallbackPromise, addHeroObserversObject]);
    }
}

interface IRegisterObserverArgs extends IOnClientCommandArgs {
    mutationCallbackSerialized: string;
}

interface IObserverConnectDisconnectArgs extends IOnClientCommandArgs {
    targetNodeSelector: string;
    config: MutationObserverInit;
}

interface IOnClientCommandArgs {
    action: EOnClientCommandActions;
    observerName: string;
    isolateFromWebPageEnvironment: boolean;
    args: IRegisterObserverArgs | IObserverConnectDisconnectArgs;
}

enum EOnClientCommandActions {
    REGISTER,
    OBSERVE,
    DISCONNECT,
    POLL,
}

interface IObserverPlugin {
    registerObserver: <T extends JSONObject>(
        mutationCallbackName: string,
        processMutations: (mutations: MutationRecord[]) => T,
        dataCallback: (data: JSONObject) => Promise<void> | void,
    ) => Promise<void>;
    observe: (observerName: string, targetNodeSelector?: string, config?: MutationObserverInit) => Promise<void>;
    disconnect: (observerName: string) => Promise<void>;
}

declare module "@ulixee/hero/lib/extendables" {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Hero extends IObserverPlugin {}
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Tab extends IObserverPlugin {}
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface FrameEnvironment extends IObserverPlugin {}
}

class UnboundedBlockingQueue<T> {
    private queue: T[] = [];
    private resolvers: Array<(value: T | PromiseLike<T>) => void> = [];

    // Does not block
    enqueue(item: T): void {
        if (this.resolvers.length > 0) {
            const resolve = this.resolvers.shift();
            if (resolve) resolve(item);
        } else {
            this.queue.push(item);
        }
    }

    //  eslint-disable-next-line @typescript-eslint/no-non-null-assertion

    // Blocks if the queue is empty
    async dequeue(): Promise<T> {
        const shifted = this.queue.shift();
        if (shifted !== undefined) {
            return shifted;
        } else {
            return new Promise<T>((resolve) => {
                this.resolvers.push(resolve);
            });
        }
    }

    size(): number {
        return this.queue.length;
    }
}
