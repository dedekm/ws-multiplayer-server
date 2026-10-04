const http = require("http");
const net = require("net");
const baseTest = require("node:test");
const assert = require("node:assert/strict");
const WebSocket = require("ws");
const { setupWebSocket } = require("../ws/websocket_server");

// A test that waits forever must fail, not hang the run. `--test-timeout` is per file in
// Node 22, so every test gets its own default timeout; explicit options still win.
function test(name, options, fn) {
  if (typeof options === "function") [options, fn] = [{}, options];
  return baseTest(name, { timeout: 3000, ...options }, fn);
}

// Starts a relay on a free port and registers its teardown on `t`. Whether the test
// passes, fails or times out, the teardown then drops every connection the relay has
// accepted (websocket clients, raw sockets, half-finished handshakes), closes wss
// (which clears the heartbeat interval) and waits for the HTTP server to close.
async function startServer(t, options) {
  const server = http.createServer();
  const wss = setupWebSocket(server, options);
  const rawSockets = [];
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const srv = { server, wss, rawSockets, url: `ws://127.0.0.1:${server.address().port}` };
  t.after(() => stopServer(srv));
  return srv;
}

async function stopServer({ server, wss, rawSockets }) {
  for (const socket of rawSockets) socket.destroy();
  for (const client of wss.clients) client.terminate();
  // "close" fires once the last client is gone and runs the heartbeat clearInterval hook.
  await new Promise((resolve) => wss.close(resolve));
  const closed = new Promise((resolve) => server.close(resolve));
  // A client still mid-handshake is not in wss.clients, and wss.close() removed the
  // "upgrade" listener, so nothing would ever answer it and server.close() would wait forever.
  server.closeAllConnections();
  await closed;
}

function open(ws) {
  return new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    const onMsg = (raw) => { cleanup(); resolve(JSON.parse(raw.toString())); };
    const onClose = (code, reason) => { cleanup(); reject(new Error(`closed ${code} ${reason}`)); };
    const cleanup = () => { ws.off("message", onMsg); ws.off("close", onClose); };
    ws.once("message", onMsg);
    ws.once("close", onClose);
  });
}

// The next `count` messages, collected in order. Several messages can arrive in the same
// tick, so a wait for each one in turn would miss the later ones.
function nextMessages(ws, count) {
  return new Promise((resolve, reject) => {
    const received = [];
    const onMsg = (raw) => {
      received.push(JSON.parse(raw.toString()));
      if (received.length === count) { cleanup(); resolve(received); }
    };
    const onClose = (code, reason) => { cleanup(); reject(new Error(`closed ${code} ${reason}`)); };
    const cleanup = () => { ws.off("message", onMsg); ws.off("close", onClose); };
    ws.on("message", onMsg);
    ws.once("close", onClose);
  });
}

// Connects a game while no player exists and checks that the replay is only the replay_done
// marker. It listens before "open" because the marker can arrive in the same tick.
async function openGame(url) {
  const game = new WebSocket(url + "/?game");
  const [, [first]] = await Promise.all([open(game), nextMessages(game, 1)]);
  assert.deepEqual(first, { event: "replay_done" });
  return game;
}

function nextClose(ws) {
  return new Promise((resolve) => ws.once("close", (code) => resolve(code)));
}

function close(ws) {
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    return new Promise((resolve) => { ws.once("close", resolve); ws.close(); });
  }
  return Promise.resolve();
}

test("player create is relayed to game with id + data", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game = await openGame(url);

  const player = new WebSocket(url + "/");
  await open(player);
  player.send(JSON.stringify({ event: "create", data: { team: 1 } }));

  const msg = await nextMessage(game);
  assert.equal(msg.event, "create");
  assert.equal(msg.team, 1);
  assert.match(msg.id, /^[0-9a-f-]{36}$/);

  await close(player);
  await close(game);
});

test("player update is relayed with same id", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game = await openGame(url);
  const player = new WebSocket(url + "/");
  await open(player);

  player.send(JSON.stringify({ event: "create", data: { team: 2 } }));
  const created = await nextMessage(game);

  player.send(JSON.stringify({ event: "update", input: { x: 0.5, y: -0.25, action: true } }));
  const upd = await nextMessage(game);
  assert.equal(upd.event, "update");
  assert.equal(upd.id, created.id);
  assert.equal(upd.x, 0.5);
  assert.equal(upd.y, -0.25);
  assert.equal(upd.action, true);

  await close(player);
  await close(game);
});

test("player disconnect sends destroy", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game = await openGame(url);
  const player = new WebSocket(url + "/");
  await open(player);

  player.send(JSON.stringify({ event: "create", data: { team: 1 } }));
  const created = await nextMessage(game);

  player.close();
  const destroy = await nextMessage(game);
  assert.equal(destroy.event, "destroy");
  assert.equal(destroy.id, created.id);

  await close(game);
});

test("game → player targeted message routes by id", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game = await openGame(url);
  const player = new WebSocket(url + "/");
  await open(player);

  player.send(JSON.stringify({ event: "create", data: { team: 1 } }));
  const created = await nextMessage(game);

  game.send(JSON.stringify({ id: created.id, event: "damaged", health: 42 }));
  const got = await nextMessage(player);
  assert.equal(got.event, "damaged");
  assert.equal(got.health, 42);

  await close(player);
  await close(game);
});

test("duplicate create is ignored", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game = await openGame(url);
  const player = new WebSocket(url + "/");
  await open(player);

  player.send(JSON.stringify({ event: "create", data: { team: 1 } }));
  const first = await nextMessage(game);

  // Second create should NOT produce another create; send an update afterwards
  // and assert the next message is the update, not another create.
  player.send(JSON.stringify({ event: "create", data: { team: 2 } }));
  player.send(JSON.stringify({ event: "update", input: { x: 0.1 } }));

  const next = await nextMessage(game);
  assert.equal(next.event, "update");
  assert.equal(next.id, first.id);

  await close(player);
  await close(game);
});

test("GAME_TOKEN rejects bad token", async (t) => {
  process.env.GAME_TOKEN = "secret123";
  t.after(() => { delete process.env.GAME_TOKEN; });
  const { url } = await startServer(t);

  const bad = new WebSocket(url + "/?game=wrong");
  bad.on("error", () => {}); // a handshake reset then fails the close-code assertion below instead of throwing unhandled
  const code = await nextClose(bad);
  assert.equal(code, 1008);

  const good = new WebSocket(url + "/?game=secret123");
  await open(good);
  await close(good);
});

test("invalid JSON does not crash the socket", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game = await openGame(url);
  const player = new WebSocket(url + "/");
  await open(player);

  player.send("not json");
  player.send(JSON.stringify({ event: "create", data: { team: 1 } }));
  const msg = await nextMessage(game);
  assert.equal(msg.event, "create");

  await close(player);
  await close(game);
});

test("reconnecting game replays create for existing players", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game1 = await openGame(url);

  const player = new WebSocket(url + "/");
  await open(player);
  player.send(JSON.stringify({ event: "create", data: { team: 3, name: "alice" } }));
  const created = await nextMessage(game1);

  await close(game1);

  const game2 = new WebSocket(url + "/?game");
  const [, [replayed, replayDone]] = await Promise.all([open(game2), nextMessages(game2, 2)]);
  assert.equal(replayed.event, "create");
  assert.equal(replayed.id, created.id);
  assert.equal(replayed.team, 3);
  assert.equal(replayed.name, "alice");
  assert.deepEqual(replayDone, { event: "replay_done" });

  // Exactly one replay_done: the next message is the live update, not a second marker.
  player.send(JSON.stringify({ event: "update", input: { x: 0.2 } }));
  const upd = await nextMessage(game2);
  assert.equal(upd.event, "update");
  assert.equal(upd.id, created.id);

  await close(player);
  await close(game2);
});

test("game connecting with no players gets replay_done as its first message", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game = new WebSocket(url + "/?game");
  const [, [first]] = await Promise.all([open(game), nextMessages(game, 1)]);
  assert.deepEqual(first, { event: "replay_done" });

  await close(game);
});

test("game connecting with two players gets both creates, then replay_done last", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  // The first game only learns the relay-assigned ids, then goes away.
  const game1 = await openGame(url);
  const alice = new WebSocket(url + "/");
  await open(alice);
  alice.send(JSON.stringify({ event: "create", data: { team: 1, name: "alice" } }));
  const createdAlice = await nextMessage(game1);
  const bob = new WebSocket(url + "/");
  await open(bob);
  bob.send(JSON.stringify({ event: "create", data: { team: 2, name: "bob" } }));
  const createdBob = await nextMessage(game1);
  await close(game1);

  const game2 = new WebSocket(url + "/?game");
  const [, replay] = await Promise.all([open(game2), nextMessages(game2, 3)]);
  assert.deepEqual(replay, [
    { event: "create", id: createdAlice.id, team: 1, name: "alice" },
    { event: "create", id: createdBob.id, team: 2, name: "bob" },
    { event: "replay_done" },
  ]);

  await close(alice);
  await close(bob);
  await close(game2);
});

test("new game connection replaces the old one", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game1 = await openGame(url);

  const closedP = nextClose(game1);
  const game2 = await openGame(url);

  const code = await closedP;
  assert.equal(code, 4000);

  const player = new WebSocket(url + "/");
  await open(player);
  player.send(JSON.stringify({ event: "create", data: { team: 1 } }));
  const msg = await nextMessage(game2);
  assert.equal(msg.event, "create");

  await close(player);
  await close(game2);
});

function rawUpgrade(srv, target) {
  const { port } = srv.server.address();
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    srv.rawSockets.push(socket);
    let buffered = Buffer.alloc(0);
    socket.once("error", reject);
    const onData = (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf("\r\n\r\n");
      if (end === -1) return;
      socket.off("data", onData);
      const head = buffered.subarray(0, end).toString();
      if (!head.startsWith("HTTP/1.1 101")) {
        socket.destroy();
        reject(new Error(`unexpected response: ${head}`));
        return;
      }
      resolve({ socket, rest: buffered.subarray(end + 4) });
    };
    socket.on("data", onData);
    socket.write(
      `GET ${target} HTTP/1.1\r\n` +
      "Host: 127.0.0.1\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
      "Sec-WebSocket-Version: 13\r\n" +
      "\r\n"
    );
  });
}

function readBytes(socket, initial, count) {
  return new Promise((resolve, reject) => {
    let buffered = initial;
    if (buffered.length >= count) return resolve(buffered);
    const cleanup = () => { socket.off("data", onData); socket.off("close", onClose); };
    const onData = (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length >= count) { cleanup(); resolve(buffered); }
    };
    const onClose = () => { cleanup(); reject(new Error("socket closed early")); };
    socket.on("data", onData);
    socket.on("close", onClose);
  });
}

async function assertRelayStillWorks(url) {
  const game = await openGame(url);
  const player = new WebSocket(url + "/");
  await open(player);
  player.send(JSON.stringify({ event: "create", data: {} }));
  const msg = await nextMessage(game);
  assert.equal(msg.event, "create");
  await close(player);
  await close(game);
}

test("malformed request URL is rejected without crashing the relay", async (t) => {
  delete process.env.GAME_TOKEN;
  const srv = await startServer(t);

  const { socket, rest } = await rawUpgrade(srv, "http://[");
  const bytes = await readBytes(socket, rest, 4);
  assert.equal(bytes[0], 0x88);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0xf0);
  // A rejected socket must still have an error listener.
  const closed = new Promise((resolve) => socket.once("close", resolve));
  socket.write(Buffer.from([0x81, 0x02, 0x68, 0x69]));
  await closed;

  await assertRelayStillWorks(srv.url);
});

test("bad GAME_TOKEN rejection leaves an error listener on the socket", async (t) => {
  process.env.GAME_TOKEN = "secret";
  t.after(() => { delete process.env.GAME_TOKEN; });
  const srv = await startServer(t);

  const { socket, rest } = await rawUpgrade(srv, "/?game=wrong");
  const bytes = await readBytes(socket, rest, 4);
  assert.equal(bytes[0], 0x88);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0xf0);
  // A rejected socket must still have an error listener.
  const closed = new Promise((resolve) => socket.once("close", resolve));
  socket.write(Buffer.from([0x81, 0x02, 0x68, 0x69]));
  await closed;

  // assertRelayStillWorks connects the game without a token, so GAME_TOKEN must be unset by now.
  delete process.env.GAME_TOKEN;
  await assertRelayStillWorks(srv.url);
});

for (const target of ["/", "/?game"]) {
  test(`protocol error on a socket (${target}) does not crash the relay`, async (t) => {
    delete process.env.GAME_TOKEN;
    const srv = await startServer(t);

    const { socket, rest } = await rawUpgrade(srv, target);
    // Unmasked client text frame violates the protocol.
    socket.write(Buffer.from([0x81, 0x02, 0x68, 0x69]));
    // A game socket first receives the replay_done text frame (2-byte header + payload).
    const skip = target === "/" ? 0 : 2 + JSON.stringify({ event: "replay_done" }).length;
    // Only an early close without a close frame is tolerated.
    const bytes = await readBytes(socket, rest, skip + 1).catch(() => null);
    if (bytes) assert.equal(bytes[skip], 0x88);
    socket.destroy();

    await assertRelayStillWorks(srv.url);
  });
}

test("player cannot override event or id in update", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game = await openGame(url);
  const player = new WebSocket(url + "/");
  await open(player);

  player.send(JSON.stringify({ event: "create", data: {} }));
  const created = await nextMessage(game);

  player.send(JSON.stringify({ event: "update", input: { event: "destroy", id: "spoofed", x: 0.3 } }));
  const upd = await nextMessage(game);
  assert.equal(upd.event, "update");
  assert.equal(upd.id, created.id);
  assert.equal(upd.x, 0.3);

  await close(player);
  await close(game);
});

test("player cannot override event or id in create", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game = await openGame(url);
  const player = new WebSocket(url + "/");
  await open(player);

  player.send(JSON.stringify({ event: "create", data: { event: "destroy", id: "spoofed", name: "x" } }));
  const msg = await nextMessage(game);
  assert.equal(msg.event, "create");
  assert.match(msg.id, /^[0-9a-f-]{36}$/);
  assert.notEqual(msg.id, "spoofed");
  assert.equal(msg.name, "x");

  await close(player);
  await close(game);
});

test("replayed create keeps the relay-assigned id", async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game1 = await openGame(url);
  const player = new WebSocket(url + "/");
  await open(player);

  player.send(JSON.stringify({ event: "create", data: { event: "destroy", id: "spoofed" } }));
  const created = await nextMessage(game1);

  await close(game1);

  const game2 = new WebSocket(url + "/?game");
  const [, [replayed, replayDone]] = await Promise.all([open(game2), nextMessages(game2, 2)]);
  assert.equal(replayed.event, "create");
  assert.equal(replayed.id, created.id);
  assert.deepEqual(replayDone, { event: "replay_done" });

  await close(player);
  await close(game2);
});

test("heartbeat terminates a player that never pongs and game gets destroy", { timeout: 2000 }, async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t, { heartbeatIntervalMs: 50 });

  const game = await openGame(url);
  const player = new WebSocket(url + "/", { autoPong: false });
  await open(player);

  player.send(JSON.stringify({ event: "create", data: { team: 1 } }));
  const created = await nextMessage(game);

  const playerClosed = nextClose(player);
  const destroy = await nextMessage(game);
  assert.equal(destroy.event, "destroy");
  assert.equal(destroy.id, created.id);
  await playerClosed;

  await close(player);
  await close(game);
});

test("heartbeat keeps a responsive player connected", { timeout: 2000 }, async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t, { heartbeatIntervalMs: 100 });

  const game = await openGame(url);
  const player = new WebSocket(url + "/");
  let pings = 0;
  player.on("ping", () => { pings++; });
  await open(player);

  player.send(JSON.stringify({ event: "create", data: { team: 1 } }));
  await nextMessage(game);

  const received = [];
  game.on("message", (raw) => received.push(JSON.parse(raw.toString())));

  // Several heartbeat intervals pass (100 ms each).
  await new Promise((resolve) => setTimeout(resolve, 550));

  assert.ok(pings >= 3, `expected at least 3 pings, got ${pings}`);
  assert.equal(player.readyState, WebSocket.OPEN);
  assert.equal(game.readyState, WebSocket.OPEN);
  assert.deepEqual(received, []);

  await close(player);
  await close(game);
});

test("oversized frame closes the player with 1009 and game gets destroy", { timeout: 2000 }, async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game = await openGame(url);
  const player = new WebSocket(url + "/");
  await open(player);

  player.send(JSON.stringify({ event: "create", data: { team: 1 } }));
  const created = await nextMessage(game);

  const playerClosed = nextClose(player);
  player.send("x".repeat(4097));

  const destroy = await nextMessage(game);
  assert.equal(destroy.event, "destroy");
  assert.equal(destroy.id, created.id);
  assert.equal(await playerClosed, 1009);

  await close(player);
  await close(game);
});

test("normal-sized create (~1 KB data) is still relayed unchanged", { timeout: 2000 }, async (t) => {
  delete process.env.GAME_TOKEN;
  const { url } = await startServer(t);

  const game = await openGame(url);
  const player = new WebSocket(url + "/");
  await open(player);

  const blob = "a".repeat(1024);
  player.send(JSON.stringify({ event: "create", data: { name: blob } }));
  const msg = await nextMessage(game);
  assert.equal(msg.event, "create");
  assert.equal(msg.name, blob);

  await close(player);
  await close(game);
});
