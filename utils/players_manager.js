class PlayersManager {
  constructor() {
    this.players = {};
  }

  add(id, ws, data) {
    this.players[id] = { ws, data };
  }

  remove(id) {
    delete this.players[id];
  }

  get(id) {
    return this.players[id];
  }

  all() {
    return Object.entries(this.players);
  }
}
module.exports = PlayersManager;
