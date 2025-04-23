let ws = new WebSocket("ws://" + location.host + "/");

ws.onopen = () => console.log("connected to server");
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const element = document.querySelector('.logs');

  switch(data.action) {
    case 'damaged':
      element.innerHTML += `<p>damaged, current health: ${data.health}</p>`;
      const title = document.querySelector('.title');

      title.style.backgroundColor = 'red';
      title.style.transition = 'background-color 0.1s linear';

      setTimeout(() => {
        title.style.transition = 'background-color 1s ease-out';
        title.style.backgroundColor = '';
      }, 600);

      break;
    default:
      console.log(`Unknown action: ${data.action}`);
  }
}
function sendInput(x, y, shoot) {
  ws.send(JSON.stringify({ x: x, y: y, shoot: shoot }));
}

const keysPressed = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
  Space: false,
};

document.addEventListener("keydown", (e) => {
  if (e.code in keysPressed) {
    keysPressed[e.code] = true;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code in keysPressed) {
    keysPressed[e.code] = false;
  }
});

setInterval(() => {
  let x = 0;
  let y = 0;
  let shoot = false;

  if (keysPressed["ArrowLeft"]) x += 1;
  if (keysPressed["ArrowRight"]) x -= 1;
  if (keysPressed["ArrowUp"]) y += 1;
  if (keysPressed["ArrowDown"]) y -= 1;
  if (keysPressed["Space"]) shoot = true;

  if (x !== 0 || y !== 0 || shoot) sendInput(x, y, shoot);
}, 1000 / 30);
