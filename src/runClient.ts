import Hero from "@ulixee/hero";

async function runHero(serverIpAndPort: string) {
    // hero will dial your IP:PORT/<OPTIONAL PATH>
    const hero = new Hero({
        connectionToCore: { host: `${serverIpAndPort}/hero` },
        showChrome: true,
    });

    hero.use(require.resolve("./plugins"));
    await hero.hello("World");
    console.log("done helloing");

    await hero.goto("https://ulixee.org");
    await hero.waitForPaintingStable();
    await new Promise((r) => setTimeout(r, 2000));
    await hero.close();
}

async function main() {
    await runHero("localhost:8080");
}

main().catch((error) => console.log(error));
