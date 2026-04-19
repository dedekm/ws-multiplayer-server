const crypto = require("crypto");
const WebSocket = require("ws");
const PlayersManager = require("../utils/players_manager");

const logConn = require("debug")("ws-multiplayer-server:conn");
const logGame = require("debug")("ws-multiplayer-server:game");
const logPlayer = require("debug")("ws-multiplayer-server:player");

function canSend(ws) {
  return ws && ws.readyState === WebSocket.OPEN;
}

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  let gameWs = null;
  const players = new PlayersManager();

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const params = Object.fromEntries(url.searchParams);

    if ("game" in params) {
      const gameToken = process.env.GAME_TOKEN || "";
      if (gameToken && params.game !== gameToken) {
        logConn("rejected game connection: bad token");
        ws.close(1008, "invalid game token");
        return;
      }
      if (!gameToken) {
        logConn("warning: GAME_TOKEN is not set — game channel is unauthenticated");
      }
      if (canSend(gameWs)) {
        logGame("replacing existing game connection");
        gameWs.close(1000, "replaced by new game connection");
      }

      gameWs = ws;
      logGame("game connected");

      for (const [id, { data }] of players.all()) {
        logGame("replaying create for %s", id);
        ws.send(JSON.stringify({ event: "create", id, ...data }));
      }

      ws.on("close", () => {
        logGame("game disconnected");
        if (gameWs === ws) gameWs = null;
      });

      ws.on("message", (rawMessage) => {
        let message;
        try {
          message = JSON.parse(rawMessage);
        } catch (e) {
          logGame("invalid JSON from game: %s", e.message);
          return;
        }

        if (!message || !message.id) return;

        const { id, ...messageWithoutId } = message;
        logGame("→ player %s: %o", message.id, messageWithoutId);

        const entry = players.get(id);
        if (entry && canSend(entry.ws)) entry.ws.send(JSON.stringify(messageWithoutId));
      });
    } else {
      const id = crypto.randomUUID();
      logConn("player %s connected", id);

      ws.on("message", (rawMessage) => {
        let message;
        try {
          message = JSON.parse(rawMessage);
        } catch (e) {
          logPlayer("%s: invalid JSON: %s", id, e.message);
          return;
        }

        if (!message || typeof message.event !== "string") return;

        switch (message.event) {
          case "create":
            if (players.get(id)) {
              logPlayer("%s: duplicate create ignored", id);
              return;
            }
            players.add(id, ws, message.data);
            logPlayer("%s: created", id);

            if (canSend(gameWs)) {
              gameWs.send(JSON.stringify({
                event: "create",
                id: id,
                ...message.data
              }));
            }
            break;
          case "update":
            if (!players.get(id)) return;
            if (canSend(gameWs)) {
              gameWs.send(JSON.stringify({
                event: "update",
                id: id,
                ...message.input
              }));
            }
            break;
          default:
            logPlayer("%s: unknown event %s", id, message.event);
        }
      });

      ws.on("close", () => {
        if (players.get(id)) {
          if (canSend(gameWs)) {
            gameWs.send(JSON.stringify({ event: "destroy", id: id }));
          }
          players.remove(id);
          logPlayer("%s: disconnected", id);
        }
      });
    }
  });
}

module.exports = { setupWebSocket };
