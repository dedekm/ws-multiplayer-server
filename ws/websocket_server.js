const crypto = require("crypto");
const WebSocket = require("ws");
const PlayersManager = require("../utils/players_manager");

const logConn = require("debug")("ws-multiplayer-server:conn");
const logGame = require("debug")("ws-multiplayer-server:game");
const logPlayer = require("debug")("ws-multiplayer-server:player");

// Largest accepted message (ws sums fragments); above this it closes the socket with 1009.
const MAX_PAYLOAD_BYTES = 4096;

// Application close code (4000-4999 is the private range) for a game connection replaced by a
// newer one; game clients must not reconnect on exactly this code, otherwise two game instances
// replace each other in a loop. The reason text is informational.
const CLOSE_REPLACED = 4000;

function canSend(ws) {
  return ws && ws.readyState === WebSocket.OPEN;
}

function setupWebSocket(server, { heartbeatIntervalMs = 15000 } = {}) {
  const wss = new WebSocket.Server({ server, maxPayload: MAX_PAYLOAD_BYTES });

  let gameWs = null;
  const players = new PlayersManager();

  // Heartbeat: a socket that did not answer the previous ping with a pong is
  // terminated; terminate() fires the regular "close" handlers below.
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        logConn("terminating unresponsive socket");
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, heartbeatIntervalMs);
  heartbeat.unref();
  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws, req) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    ws.on("error", (err) => {
      logConn("socket error: %s", err.message);
    });

    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch (e) {
      logConn("rejected connection: invalid url %s", req.url);
      ws.close(1008, "invalid url");
      return;
    }
    const params = Object.fromEntries(url.searchParams);

    if ("game" in params) {
      const gameToken = process.env.GAME_TOKEN || "";
      if (gameToken && params.game !== gameToken) {
        logConn("rejected game connection: bad token");
        ws.close(1008, "invalid game token");
        return;
      }
      if (canSend(gameWs)) {
        logGame("replacing existing game connection");
        gameWs.close(CLOSE_REPLACED, "replaced by new game connection");
      }

      gameWs = ws;
      logGame("game connected");

      for (const [id, { data }] of players.all()) {
        logGame("replaying create for %s", id);
        ws.send(JSON.stringify({ ...data, event: "create", id }));
      }
      ws.send(JSON.stringify({ event: "replay_done" }));
      logGame("replay done");

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
                ...message.data,
                event: "create",
                id: id
              }));
            }
            break;
          case "update":
            if (!players.get(id)) return;
            if (canSend(gameWs)) {
              gameWs.send(JSON.stringify({
                ...message.input,
                event: "update",
                id: id
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

  return wss;
}

module.exports = { setupWebSocket };
