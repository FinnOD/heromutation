import HeroCore from "@ulixee/hero-core";
import Hero, { ConnectionToHeroCore } from "@ulixee/hero";
import { TransportBridge } from "@ulixee/net";

import { registerObserverClientPlugin, registerObserverCorePlugin, JSONObject } from "./plugin-Observer";

// This function is serialized and injected into the browser
// It needs to turn the mutations into a serializable (JSONObject) object
function processMutations(mutations: MutationRecord[]) {
    let outData = { times: [] as string[] };
    console.log(mutations);
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

// Process the serializable object from the processMutations script in the browser
// Unfortunately this type 'JSONObject' is not the same as the return type of processMutations
async function dataCallback(data: JSONObject): Promise<void> {
    console.log(data["times"]);
}

async function main() {
    // Connect to hero core with the plugin
    const bridge = new TransportBridge();
    const connection = new ConnectionToHeroCore(bridge.transportToCore);
    HeroCore.addConnection(bridge.transportToClient);
    const hero = new Hero({ connectionToCore: connection, showChrome: true, userAgent: "~ chrome && mac >= 13.0" });
    hero.use(registerObserverClientPlugin);

    await hero.goto("https://www.timeanddate.com/worldclock/");
    await hero.waitForPaintingStable();

    // Register observer, but don't start it yet.
    // It would be good if the plugin could make sure that processMutations returntype is the same as dataCallback input type.
    await hero.registerObserver("M", processMutations, dataCallback);
    await hero.observe("M", "/html/body/div[5]/section[1]/div/div[1]/div[1]/div", {
        subtree: true, //yes to monitor all subtree
        childList: true, //idc about added nodes
        characterData: true,
        characterDataOldValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await hero.disconnect("M");

    await hero.close();
}

require("events").EventEmitter.defaultMaxListeners = 1000;
HeroCore.use(registerObserverCorePlugin);
HeroCore.start()
    .then(main)
    .then(() => process.exit())
    .catch(console.error);
