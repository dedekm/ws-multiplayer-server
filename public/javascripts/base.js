let ws = new WebSocket("ws://" + location.host + "/");

ws.onopen = () => {
  console.log("connected to server");

  ws.send(JSON.stringify({
    event: "create",
    attributes: {
      color: Math.floor(Math.random()*16777215).toString(16)
    }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const element = document.querySelector(".logs");

  switch (data.event) {
    case "damaged":
      element.innerHTML += `<p>damaged, current health: ${data.health}</p>`;

      element.style.backgroundColor = "red";
      element.style.transition = "background-color 0.1s linear";

      setTimeout(() => {
        element.style.transition = "background-color 1s ease-out";
        element.style.backgroundColor = "";
      }, 600);

      break;
    default:
      console.log(`Unknown event: ${data.event}`);
  }
};

let currentInput = {
  x: 0,
  y: 0,
  action: false
};

const joystickInput = {
  x: 0,
  y: 0,
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
    ws.send(JSON.stringify({
      event: "update",
      input: inputDiff
    }));
  }

  currentInput = input;
}

// Initialize joystick
const joystick = new JoystickController.default(
  {
    radius: 100,
    joystickRadius: 40,
    maxRange: 50,
    containerClass: "joystick-container",
    controllerClass: "joystick-controller",
    opacity: 0.8,
    level: 10,
    x: "30%",
    y: "50%",
  },
  ({ leveledX, leveledY }) => {
    joystickInput.x = leveledX / 10;
    joystickInput.y = leveledY / 10;
  }
);

// Keep keyboard controls as fallback
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

function action() {
  keysPressed["Space"] = true;
}

function actionNot() {
  keysPressed["Space"] = false;
}

setInterval(() => {
  const input = {
    x: joystickInput.x,
    y: joystickInput.y,
    action: false,
  };

  if (keysPressed["ArrowLeft"]) input.x = 1;
  if (keysPressed["ArrowRight"]) input.x = -1;
  if (keysPressed["ArrowUp"]) input.y = 1;
  if (keysPressed["ArrowDown"]) input.y = -1;
  if (keysPressed["Space"]) input.action = true;

  sendInput(input);
}, 1000 / 30);


document.addEventListener("contextmenu", function (e) {
  e.preventDefault()
  e.stopPropagation()
});
