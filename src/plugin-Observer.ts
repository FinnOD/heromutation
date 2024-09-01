// eslint-disable-next-line max-classes-per-file

import { CorePlugin } from "@ulixee/hero-plugin-utils";
import { IOnClientCommandMeta } from "@ulixee/hero-interfaces/ICorePlugin";
import { ISendToCoreFn } from "@ulixee/hero-interfaces/IClientPlugin";
import ClientPlugin from "@ulixee/hero-plugin-utils/lib/ClientPlugin";
import type Hero from "@ulixee/hero";
import type Tab from "@ulixee/hero/lib/Tab";
import type FrameEnvironment from "@ulixee/hero/lib/FrameEnvironment";
import { IPage } from "@ulixee/unblocked-specification/agent/browser/IPage";

export class registerObserverClientPlugin extends ClientPlugin {
    public static override id = "observer";
    public static coreDependencyIds = ["observer"];

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

    public onFrameEnvironment(
        hero: Hero,
        frameEnvironment: FrameEnvironment,
        sendToCore: ISendToCoreFn,
    ): void {
        frameEnvironment.registerObserver = this.registerObserver.bind(
            this,
            sendToCore,
        );
        frameEnvironment.observe = this.observe.bind(this, sendToCore);
        frameEnvironment.disconnect = this.disconnect.bind(this, sendToCore);
    }

    // PRIVATE

    private observe(sendToCore: ISendToCoreFn, observerName: string) {
        return sendToCore(this.id, <IRegisterObserverArgs>{
            action: EOnClientCommandActions.OBSERVE,
            observerName,
            isolateFromWebPageEnvironment: true,
        });
    }

    private disconnect(sendToCore: ISendToCoreFn, observerName: string) {
        return sendToCore(this.id, <IRegisterObserverArgs>{
            action: EOnClientCommandActions.DISCONNECT,
            observerName,
            isolateFromWebPageEnvironment: true,
        });
    }

    private registerObserver<T extends any[]>(
        sendToCore: ISendToCoreFn,
        observerName: string,
        mutationCallback: (
            dataCallback: (data: any) => void,
        ) => MutationCallback,
        dataCallback: (data: any) => void,
        ...args: T
    ): Promise<any> {
        let mutationCallbackSerialized = `${mutationCallback.toString()}`;
        let dataCallbackSerialized = `${dataCallback.toString()}`;

        return sendToCore(this.id, <IRegisterObserverArgs>{
            action: EOnClientCommandActions.REGISTER,
            observerName: observerName,
            mutationCallbackSerialized: mutationCallbackSerialized,
            dataCallbackSerialized,
            args,
            isolateFromWebPageEnvironment: true,
        });
    }
}

export class registerObserverCorePlugin extends CorePlugin {
    public static override id = "observer";

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
        }
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
                mutationCallback: ${mutationCallbackSerialized}(${args.dataCallbackSerialized}), 
                mutationCallbackRaw: ${mutationCallbackSerialized}, 
                dataCallbackRaw: ${args.dataCallbackSerialized}
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
            `window['HERO_OBSERVERS']["${observerName}"]['observer'] = new MutationObserver(window['HERO_OBSERVERS']["${observerName}"].mutationCallback);`,
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

    public onNewPage(page: IPage): Promise<any> {
        const addHeroObserversObject = page.addNewDocumentScript(
            "window['HERO_OBSERVERS'] = {};",
            true,
        );

        return Promise.all([addHeroObserversObject]);
    }
}

interface IRegisterObserverArgs extends IOnClientCommandArgs {
    mutationCallbackSerialized: string;
    dataCallbackSerialized: string;
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
}

interface IregisterObserverPlugin {
    registerObserver: <T extends any[]>(
        mutationCallbackName: string,
        mutationCallback: (
            dataCallback: (data: any) => void,
        ) => MutationCallback,
        dataCallback: (data: any) => void,
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
