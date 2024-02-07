import HeroCore from "@ulixee/hero-core";
import WsTransportToClient from "@ulixee/net/lib/WsTransportToClient";
import * as WebSocket from "ws";
import * as http from "http";
import * as https from "https";

const heroCore = new HeroCore();
heroCore.use(require("./plugin-execJS"));

async function bindHeroCore(yourHttpServer: http.Server | https.Server) {
    console.log("Binding HeroCore to server");
    const wsServer = new WebSocket.Server({
        server: yourHttpServer,
    });
    wsServer.on("connection", (ws, req) => {
        const transport = new WsTransportToClient(ws, req);
        heroCore.addConnection(transport);
    });
}

async function main() {
    const server = new http.Server();
    const url = await server.listen(1337);
    await bindHeroCore(server);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    //shutdown server and exit
    server.close();
    process.exit();
}

main().catch((error) => console.log(error));
