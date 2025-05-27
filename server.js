const express = require("express");
const { setupWebSocket } = require("./ws/websocket_server");
const routes = require('./routes');

const app = express();
const port = 8082;

var debug = require("debug")("ws-multiplayer-server:server");

app.use(express.static("public"));
app.use('/', routes);

const server = app.listen(port, () => {
  debug(`server running on http://localhost:${port}`);
});

setupWebSocket(server);
