import Hero from "@ulixee/hero";

import "./runCore.js";

function cb(val1: string) {
    console.log("hello from callback: ", val1);
    return 5;
}

function codeToRun() {
    return document.querySelectorAll("div").length;
}

async function main() {
    const hero = new Hero({
        showChrome: false,
        connectionToCore: "http://localhost:1337",
    });
    hero.use(require("./plugin-execJS"));

    await hero.goto("https://ulixee.org");
    await hero.waitForPaintingStable();
    await hero.waitForMillis(2000);

    const divs = hero.executeJs(codeToRun);
    console.log(await divs);
    hero.yeet();

    await hero.close();
}

main().catch((error) => console.log(error));
