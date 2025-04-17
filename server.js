const express = require("express");
const { setupWebSocket } = require("./ws/websocket_server");

const app = express();
const port = 8082;

var debug = require("debug")("ws-multiplayer-server:server");

app.use(express.static("public"));

const server = app.listen(port, () => {
  debug(`server running on http://localhost:${port}`);
});

setupWebSocket(server);
