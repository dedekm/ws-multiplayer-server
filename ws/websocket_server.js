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

      ws.on("message", (rawMessage) => {
        const message = JSON.parse(rawMessage);

        if (message.id) {
          console.log("message from server:", message);

          const { id, ...messageWithoutId } = message;
          const player = players.get(id);
          if (player) player.send(JSON.stringify(messageWithoutId));
        }
      });
    } else {
      const id = Math.random().toString(36).substring(2, 15);

      ws.on("message", (rawMessage) => {
        try {
          const message = JSON.parse(rawMessage);

          switch (message.event) {
            case "create":
              players.add(id, ws);
              console.log("player", id, "created", message.data);
              
              if (gameWs) {
                gameWs.send(JSON.stringify({
                  event: "create",
                  id: id,
                  ...message.data
                }));
              }
              break;
            case "update":
              console.log("player", id, "updated", message.input);

              if (gameWs) {
                gameWs.send(JSON.stringify({
                  event: "update",
                  id: id,
                  ...message.input
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
