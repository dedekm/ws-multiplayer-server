let players = {};

function createPlayer(id, x, y) {
    players[id] = { x: x, y: y };
}

function updatePlayer(id, data) {
    players[id].y += data.y;
    players[id].x += data.x;
}

function removePlayer(id) {
    delete players[id];
}

function getPlayers() {
    return players;
}

module.exports = { createPlayer, updatePlayer, removePlayer, getPlayers };