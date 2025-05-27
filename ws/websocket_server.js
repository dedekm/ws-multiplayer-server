const WebSocket = require("ws");
const PlayersManager = require("../utils/players_manager");

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  let gameWs;
  const players = new PlayersManager();

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const params = Object.fromEntries(url.searchParams);

    if (params.game) {
      console.log("main game connected");
      gameWs = ws;

      ws.on("close", () => {
        console.log("main game disconnected");
      });

      ws.on("message", (message) => {
        const data = JSON.parse(message);

        if (data.id) {
          console.log("message from server:", data);

          const { id, ...dataWithoutId } = data;
          const player = players.get(id);
          if (player) player.send(JSON.stringify(dataWithoutId));
        }
      });
    } else {
      const id = Math.random().toString(36).substring(2, 15);

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message);

          console.log("message from player:", id, data);

          switch (data.event) {
            case "create":
              players.add(id, ws);
              console.log("player", id, "created");
              
              if (gameWs) {
                gameWs.send(JSON.stringify({
                  event: "create",
                  id: id,
                  ...data.attributes
                }));
              }
              break;
            case "update":
              console.log("player", id, "updated");

              if (gameWs) {
                gameWs.send(JSON.stringify({
                  event: "update",
                  id: id,
                  ...data.input
                }));
              }
              break;
          }
        } catch (e) {
          console.error("error", e);
        }
      });

      ws.on("close", () => {
        if (players.get(id)) {
          if (gameWs) {
            gameWs.send(
              JSON.stringify({
                event: "destroy",
                id: id
              })
            );
          }

          players.remove(id);

          console.log("player", id, "disconnected");
        }
      });
    }
  });
}

module.exports = { setupWebSocket };
