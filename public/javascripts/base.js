function initializeWebSocket(data = {}) {
  const ws = new WebSocket("ws://" + location.host + "/");

  ws.onopen = () => {
    console.log("connected to server");

    ws.send(JSON.stringify({
      event: "create",
      data: data
    }));
  };

  return ws;
}