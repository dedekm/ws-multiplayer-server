class PlayersManager {
  constructor() {
    this.players = {};
  }

  add(id, ws) {
    this.players[id] = ws;
  }

  remove(id) {
    delete this.players[id];
  }

  get(id) {
    return this.players[id];
  }

  getAll() {
    return this.players;
  }
}
module.exports = PlayersManager;
