const http = require("http");
const test = require("node:test");
const assert = require("node:assert/strict");
const WebSocket = require("ws");
const { setupWebSocket } = require("../ws/websocket_server");

function startServer() {
  const server = http.createServer();
  setupWebSocket(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `ws://127.0.0.1:${port}` });
    });
  });
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
  const { server, url } = await startServer();
  t.after(() => server.close());

  const game = new WebSocket(url + "/?game");
  await open(game);

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
  const { server, url } = await startServer();
  t.after(() => server.close());

  const game = new WebSocket(url + "/?game");
  await open(game);
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
  const { server, url } = await startServer();
  t.after(() => server.close());

  const game = new WebSocket(url + "/?game");
  await open(game);
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
  const { server, url } = await startServer();
  t.after(() => server.close());

  const game = new WebSocket(url + "/?game");
  await open(game);
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
  const { server, url } = await startServer();
  t.after(() => server.close());

  const game = new WebSocket(url + "/?game");
  await open(game);
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
  const { server, url } = await startServer();
  t.after(() => server.close());

  const bad = new WebSocket(url + "/?game=wrong");
  const code = await nextClose(bad);
  assert.equal(code, 1008);

  const good = new WebSocket(url + "/?game=secret123");
  await open(good);
  await close(good);
});

test("invalid JSON does not crash the socket", async (t) => {
  delete process.env.GAME_TOKEN;
  const { server, url } = await startServer();
  t.after(() => server.close());

  const game = new WebSocket(url + "/?game");
  await open(game);
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
  const { server, url } = await startServer();
  t.after(() => server.close());

  const game1 = new WebSocket(url + "/?game");
  await open(game1);

  const player = new WebSocket(url + "/");
  await open(player);
  player.send(JSON.stringify({ event: "create", data: { team: 3, name: "alice" } }));
  const created = await nextMessage(game1);

  await close(game1);

  const game2 = new WebSocket(url + "/?game");
  const replayedP = nextMessage(game2);
  await open(game2);
  const replayed = await replayedP;
  assert.equal(replayed.event, "create");
  assert.equal(replayed.id, created.id);
  assert.equal(replayed.team, 3);
  assert.equal(replayed.name, "alice");

  player.send(JSON.stringify({ event: "update", input: { x: 0.2 } }));
  const upd = await nextMessage(game2);
  assert.equal(upd.event, "update");
  assert.equal(upd.id, created.id);

  await close(player);
  await close(game2);
});

test("new game connection replaces the old one", async (t) => {
  delete process.env.GAME_TOKEN;
  const { server, url } = await startServer();
  t.after(() => server.close());

  const game1 = new WebSocket(url + "/?game");
  await open(game1);

  const closedP = nextClose(game1);
  const game2 = new WebSocket(url + "/?game");
  await open(game2);

  const code = await closedP;
  assert.equal(code, 1000);

  const player = new WebSocket(url + "/");
  await open(player);
  player.send(JSON.stringify({ event: "create", data: { team: 1 } }));
  const msg = await nextMessage(game2);
  assert.equal(msg.event, "create");

  await close(player);
  await close(game2);
});
