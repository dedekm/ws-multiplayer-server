const express = require("express");
const { setupWebSocket } = require("./ws/websocket_server");

const app = express();
const port = 8082;

app.use(express.static("public"));

const server = app.listen(port, () => {
    console.log(`server running on http://localhost:${port}`);
});

setupWebSocket(server);