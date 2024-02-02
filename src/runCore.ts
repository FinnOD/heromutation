import HeroCore from "@ulixee/hero-core";
import WsTransportToClient from "@ulixee/net/lib/WsTransportToClient";
import * as WebSocket from "ws";
import * as http from "http";
import * as https from "https";

import { CoreHelloPlugin } from "./plugins.js";

const heroCore = new HeroCore();
HeroCore.use(CoreHelloPlugin);

// Attach Hero to your Http or Https Server
async function bindHeroCore(yourHttpServer: http.Server | https.Server) {
    console.log("Binding HeroCore to server");
    const wsServer = new WebSocket.Server({
        server: yourHttpServer,
    });
    wsServer.on("connection", (ws, req) => {
        // OPTIONAl: it's configured to listen on a path
        if (req.url?.startsWith("/hero")) {
            const transport = new WsTransportToClient(ws, req);
            heroCore.addConnection(transport);
        }
    });
}

async function main() {
    const server = new http.Server();
    const url = await server.listen(8080);
    await bindHeroCore(server);
}

main().catch((error) => console.log(error));
