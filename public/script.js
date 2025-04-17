let ws = new WebSocket("ws://" + location.host + "/");

ws.onopen = () => console.log("connected to server");
ws.onmessage = (event) => console.log("data received:", event.data);

function sendInput(x, y) {
  ws.send(JSON.stringify({ x: x, y: y }));
}

const keysPressed = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
};

document.addEventListener("keydown", (e) => {
  if (e.key in keysPressed) {
    keysPressed[e.key] = true;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key in keysPressed) {
    keysPressed[e.key] = false;
  }
});

setInterval(() => {
  let x = 0;
  let y = 0;

  if (keysPressed["ArrowLeft"]) x += 1;
  if (keysPressed["ArrowRight"]) x -= 1;
  if (keysPressed["ArrowUp"]) y += 1;
  if (keysPressed["ArrowDown"]) y -= 1;

  if (x !== 0 || y !== 0) sendInput(x, y);
}, 1000 / 30);
