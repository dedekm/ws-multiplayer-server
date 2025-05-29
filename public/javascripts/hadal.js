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


document.querySelectorAll(".species-selection-card").forEach(card => {
  card.addEventListener("click", (e) => {
    window.gameWs = initializeWebSocket({ evolution_line: Number(card.dataset.evolutionLine) });

    initializeControls(getComputedStyle(card).backgroundColor);

    document.querySelector(".species-selection").remove();
  });
});

function initializeControls(color) {
  // initialize joystick
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

  // show & colorize action button
  document.querySelector(".controls-container").style.display = "flex";
  document.querySelector(".controls-container .btn-action").style.backgroundColor = color;

  // keep keyboard controls as fallback
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

  const btnAction = document.getElementById("btn-action");
  btnAction.addEventListener("mousedown", (e) => {
    keysPressed["Space"] = true;
  });
  btnAction.addEventListener("mouseup", (e) => {
    keysPressed["Space"] = false;
  });

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
}

function sendInput(input) {
  const inputDiff = {};

  Object.keys(input).forEach((key) => {
    if (currentInput[key] !== input[key]) inputDiff[key] = input[key];
  });

  if (Object.keys(inputDiff).length !== 0 && window.gameWs) {
    window.gameWs.send(JSON.stringify({
      event: "update",
      input: inputDiff
    }));
  }

  currentInput = input;
}

document.addEventListener("contextmenu", function (e) {
  e.preventDefault()
  e.stopPropagation()
});