let ws = new WebSocket("ws://" + location.host + "/");

ws.onopen = () => console.log("connected to server");
ws.onmessage = (event) => console.log("data received:", event.data);

function sendInput(x, y) {
  ws.send(JSON.stringify({ x: x, y: y }));
}

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") sendInput(1, 0);
  if (e.key === "ArrowRight") sendInput(-1, 0);
  if (e.key === "ArrowUp") sendInput(0, 1);
  if (e.key === "ArrowDown") sendInput(0, -1);
});