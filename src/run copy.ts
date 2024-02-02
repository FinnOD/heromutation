import Hero from "@ulixee/hero";
import ExecuteJsPlugin from "@ulixee/execute-js-plugin";

async function main() {
    const hero = new Hero({
        showChrome: true,
    });
    hero.use(ExecuteJsPlugin);

    await hero.goto("https://ulixee.org");
    await hero.activeTab.waitForPaintingStable();
    const divs = await hero.executeJs(() => {
        return document.querySelectorAll("div").length;
    });
    console.log(divs);
    await hero.close();
}

main().catch((error) => console.log(error));
