function initializeWebSocket(data = {}, onMessage = null) {
  const ws = new WebSocket("ws://" + location.host + "/");

  ws.onopen = () => {
    console.log("connected to server");
    ws.send(JSON.stringify({ event: "create", data: data }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (onMessage) onMessage(msg);
  };

  ws.onclose = () => {
    console.log("disconnected from server");
  };

  return ws;
}
