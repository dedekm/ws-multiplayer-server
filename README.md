# ws-multiplayer-server

A WebSocket relay between phones and a game. Phones open a controller page served by this server; their joystick input is forwarded to one game client, and the game client can send messages back to individual phones. The game itself (its display and logic) is a separate application that connects to the relay as a WebSocket client; it is not served by this server. The relay keeps no game state and runs no simulation.

## Requirements

Node.js as pinned in `.node-version` (v22.14.0).

## Run

```sh
npm install
npm start      # node server.js, listens on port 8082
npm run dev    # nodemon, restarts on changes, all debug channels on
npm test       # node --test test/*.test.js
```

The port 8082 is hard-coded in `server.js`. Tests start their own relay on a free port, so they need no environment and do not touch 8082.

## Environment variables

These are the only variables the code reads.

| Variable | Effect |
| --- | --- |
| `GAME_TOKEN` | The game must connect with `/?game=<GAME_TOKEN>`; any other value is closed with 1008. If it is empty or unset, the game channel is unauthenticated (anyone can take over the game connection) and the server prints a warning at startup. Set it in production. |
| `DEBUG` | Log channels of the `debug` package: `ws-multiplayer-server:conn` (connections, rejects, heartbeat terminations), `ws-multiplayer-server:game` (game connect, replace, replay, messages to players), `ws-multiplayer-server:player` (create, disconnect, invalid input), `ws-multiplayer-server:server` (the "server running" line). `ws-multiplayer-server:*` turns all on. Without `DEBUG` the server prints nothing except the token warning. |

`NODE_ENV` is only set by `npm run dev` (to `development`); the relay's own code does not read it.

```sh
# replace the quoted placeholder with your token
GAME_TOKEN='<GAME_TOKEN>' DEBUG=ws-multiplayer-server:* npm start
```

## Phones

Open `/` on the server (for example `http://localhost:8082/` or the public HTTPS domain) and press Connect. The page needs a secure context (HTTPS or `localhost`) because the vendored joystick library calls `crypto.randomUUID()`; over plain http on a LAN address, Connect does nothing.

## Connecting a game client

The game client connects with a WebSocket URL that carries the token:

- `ws://<host>:8082/?game=<GAME_TOKEN>` straight to the relay, e.g. on a development machine;
- `wss://<domain>/?game=<GAME_TOKEN>` behind a reverse proxy that terminates TLS. The relay itself speaks plain `ws`. The proxy must forward WebSocket upgrades and keep its read timeout above 15 s, the relay's heartbeat interval.

Keep the real token out of source control.

Do not reconnect automatically after close code 4000 (a newer game connection replaced this one) or 1008 (rejected); see [PROTOCOL.md section 6](PROTOCOL.md#6-close-codes).

## More

- [PROTOCOL.md](PROTOCOL.md): messages, input conventions, close codes, reconnect and replay, liveness. It is the contract for a game client.
