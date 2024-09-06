import HeroCore from '@ulixee/hero-core';
import Hero, {
  ConnectionToHeroCore,
} from '@ulixee/hero';
import { TransportBridge } from '@ulixee/net';

import { registerObserverClientPlugin, registerObserverCorePlugin } from './plugin-Observer';
import type { JSONObject } from "./types";

function processMutations(mutations: MutationRecord[]): JSONObject {

    let outData = {"times": [] as string[]};
    for (const mutation of mutations) {
        if ((mutation.target as Element).classList.contains("my-city__seconds")) {
            let inner = mutation.target.parentElement?.parentElement?.innerText;
            if (inner !== undefined) {
                outData["times"].push(inner);
            }
        }
    }
    
    return outData;
}

async function dataCallback(data: ReturnType<typeof processMutations>): Promise<void> {
    console.log(data);
}

async function main() {
    // Connect to hero core with the plugin
    const bridge = new TransportBridge();
    const connection = new ConnectionToHeroCore(bridge.transportToCore);
    HeroCore.addConnection(bridge.transportToClient);
    const hero = new Hero({connectionToCore: connection, showChrome: true, userAgent: "~ chrome && mac >= 13.0"});  
    hero.use(registerObserverClientPlugin);

    await hero.goto("https://www.timeanddate.com/worldclock/");
    await hero.waitForPaintingStable();

    // Register observer, but don't start it yet.
    await hero.registerObserver(
        "M",
        processMutations,
        dataCallback,
    );
    await hero.waitForMillis(1_000);

    // Start observer, wait 5 seconds, then disconnect.
    // This should be seen in the console how its only 5 seconds worth? ie. it can be turned off.
    await hero.observe("M");
    // await hero.waitForMillis(5_000);
    await new Promise(resolve => setTimeout(resolve, 5_000));
    await hero.disconnect("M");

    await hero.waitForMillis(1_000);
    await hero.close();
}


require("events").EventEmitter.defaultMaxListeners = 1000;
HeroCore.use(registerObserverCorePlugin);
HeroCore.start().then(main).then(() => process.exit()).catch(console.error);