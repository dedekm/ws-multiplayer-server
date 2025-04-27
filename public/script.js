let ws = new WebSocket("ws://" + location.host + "/");

ws.onopen = () => console.log("connected to server");
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const element = document.querySelector(".logs");

  switch (data.action) {
    case "damaged":
      element.innerHTML += `<p>damaged, current health: ${data.health}</p>`;
      const title = document.querySelector(".title");

      title.style.backgroundColor = "red";
      title.style.transition = "background-color 0.1s linear";

      setTimeout(() => {
        title.style.transition = "background-color 1s ease-out";
        title.style.backgroundColor = "";
      }, 600);

      break;
    default:
      console.log(`Unknown action: ${data.action}`);
  }
};

let currentInput = {
  x: 0,
  y: 0,
  shoot: false,
};

const keysPressed = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
  Space: false,
};

function sendInput(input) {
  const inputDiff = {};

  Object.keys(input).forEach((key) => {
    if (currentInput[key] !== input[key]) inputDiff[key] = input[key];
  });

  if (Object.keys(inputDiff).length !== 0) {
    ws.send(JSON.stringify(inputDiff));
  }

  currentInput = input;
}

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
  const input = {
    x: 0,
    y: 0,
    shoot: false,
  };

  if (keysPressed["ArrowLeft"]) input.x -= 1;
  if (keysPressed["ArrowRight"]) input.x += 1;
  if (keysPressed["ArrowUp"]) input.y += 1;
  if (keysPressed["ArrowDown"]) input.y -= 1;
  if (keysPressed["Space"]) input.shoot = true;

  sendInput(input);
}, 1000 / 30);
