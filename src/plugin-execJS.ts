// eslint-disable-next-line max-classes-per-file

import { CorePlugin } from "@ulixee/hero-plugin-utils";
import { IOnClientCommandMeta } from "@ulixee/hero-interfaces/ICorePlugin";
import { ISendToCoreFn } from "@ulixee/hero-interfaces/IClientPlugin";
import ClientPlugin from "@ulixee/hero-plugin-utils/lib/ClientPlugin";
import type Hero from "@ulixee/hero";
import type Tab from "@ulixee/hero/lib/Tab";
import type FrameEnvironment from "@ulixee/hero/lib/FrameEnvironment";

export class ExecuteJsClientPlugin extends ClientPlugin {
    public static override id = "execJS";
    public static coreDependencyIds = ["execJS"];

    public async onHero(hero: Hero, sendToCore: ISendToCoreFn) {
        console.log("Hello Hero %s", await hero.sessionId);
        hero.executeJs = this.executeJs.bind(this, sendToCore);

        hero.yeet = this.yeet;
    }

    public onTab(hero: Hero, tab: Tab, sendToCore: ISendToCoreFn): void {
        tab.executeJs = this.executeJs.bind(this, sendToCore);

        tab.yeet = this.yeet;
    }

    public yeet() {
        console.log("yeet");
    }

    public onFrameEnvironment(
        hero: Hero,
        frameEnvironment: FrameEnvironment,
        sendToCore: ISendToCoreFn,
    ): void {
        frameEnvironment.executeJs = this.executeJs.bind(this, sendToCore);

        frameEnvironment.yeet = this.yeet;
    }

    // PRIVATE

    private executeJs<T extends any[]>(
        sendToCore: ISendToCoreFn,
        fn: string | ((...args: T) => any),
        ...args: T
    ): Promise<any> {
        let fnName = "";
        let fnSerialized = fn as string;
        if (typeof fn !== "string") {
            fnName = fn.name;
            fnSerialized = `(${fn.toString()})(${JSON.stringify(args).slice(1, -1)});`;
        }
        console.log("executeJs: %s", fnName || "anonymous function");
        console.log("executeJs - fn: %s", fnSerialized);
        console.log("executeJs - args: %o", args);

        return sendToCore(this.id, <IExecuteJsArgs>{
            fnName,
            fnSerialized,
            args,
            isolateFromWebPageEnvironment: false,
        });
    }
}

export class ExecuteJsCorePlugin extends CorePlugin {
    public static override id = "execJS";

    public async onClientCommand(
        { frame, page }: IOnClientCommandMeta,
        args: IExecuteJsArgs,
    ): Promise<any> {
        console.log("received");
        const { fnName, fnSerialized, isolateFromWebPageEnvironment } = args;
        frame ??= page.mainFrame;
        const result = await frame.evaluate<any>(
            fnSerialized,
            isolateFromWebPageEnvironment,
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
}

interface IExecuteJsArgs {
    fnName: string;
    fnSerialized: string;
    args: any[];
    isolateFromWebPageEnvironment: boolean;
}

interface IExecuteJsPlugin {
    executeJs<T extends any[]>(
        fn: string | ((...args: T) => any),
        ...args: T
    ): void;

    yeet(): void;
}

declare module "@ulixee/hero/lib/extendables" {
    interface Hero extends IExecuteJsPlugin {}
    interface Tab extends IExecuteJsPlugin {}
    interface FrameEnvironment extends IExecuteJsPlugin {}
}
