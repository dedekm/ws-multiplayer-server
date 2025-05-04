let ws = new WebSocket("ws://" + location.host + "/");

ws.onopen = () => console.log("connected to server");
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const element = document.querySelector(".logs");

  switch (data.event) {
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
  action: false,
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
    console.log(inputDiff);
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
    action: false,
  };

  if (keysPressed["ArrowLeft"]) input.x -= 1;
  if (keysPressed["ArrowRight"]) input.x += 1;
  if (keysPressed["ArrowUp"]) input.y += 1;
  if (keysPressed["ArrowDown"]) input.y -= 1;
  if (keysPressed["Space"]) input.action = true;

  sendInput(input);
}, 1000 / 30);

function moveUp() {
  keysPressed["ArrowUp"] = true;
}

function moveRight() {
  keysPressed["ArrowRight"] = true;
}

function moveLeft() {
  keysPressed["ArrowLeft"] = true;
}

function moveDown() {
  keysPressed["ArrowDown"] = true;
}

function moveUpNot() {
  keysPressed["ArrowUp"] = false;
}

function moveRightNot() {
  keysPressed["ArrowRight"] = false;
}

function moveLeftNot() {
  keysPressed["ArrowLeft"] = false;
}

function moveDownNot() {
  keysPressed["ArrowDown"] = false;
}

function action() {
  keysPressed["Space"] = true;
}

function actionNot() {
  keysPressed["Space"] = false;
}
