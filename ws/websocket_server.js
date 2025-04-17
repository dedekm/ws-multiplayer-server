const WebSocket = require("ws");

let wss;
let gameWs;

function setupWebSocket(server) {
  wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const params = Object.fromEntries(url.searchParams);

    if (params.game) {
      console.log("main game connected");
      gameWs = ws;

      ws.on("close", () => {
        console.log("main game disconnected");
      });
    } else {
      const id = Math.random().toString(36).substring(2, 15);
      console.log("player connected", id);

      if (gameWs) {
        gameWs.send(JSON.stringify({ action: "create", id: id }));
      }

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message);

          if (gameWs) {
            gameWs.send(
              JSON.stringify({
                action: "update",
                id: id,
                x: data.x,
                y: data.y,
              }),
            );
          }
        } catch (e) {
          console.error("error", e);
        }
      });

      ws.on("close", () => {
        // removePlayer(id);

        if (gameWs) {
          gameWs.send(JSON.stringify({ action: "destroy", id: id }));
        }

        console.log("player disconnected");
      });
    }
  });
}

module.exports = { setupWebSocket };
