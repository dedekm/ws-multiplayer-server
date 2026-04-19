let currentInput = { x: 0, y: 0 };
const joystickInput = { x: 0, y: 0 };
const keysPressed = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };

const PING_COOLDOWN = 3000;
let pingReady = true;

function joinGame() {
  window.gameWs = initializeWebSocket({}, onMessage);

  document.getElementById("join-screen").style.display = "none";
  document.getElementById("game-screen").style.display = "flex";

  initControls();
}

function onMessage(msg) {
  switch (msg.event) {
    case "set_color":
      setColor(msg.color);
      break;
    case "failure":
      showFailure();
      break;
    default:
      console.log("unhandled event:", msg.event);
  }
}

function showFailure() {
  if (window.gameWs) {
    window.gameWs.close();
    window.gameWs = null;
  }
  document.getElementById("game-screen").style.display = "none";
  document.getElementById("failure-screen").style.display = "flex";
}

function setColor(hex) {
  const dot = document.getElementById("color-dot");
  dot.style.background = hex;
}

function sendPing() {
  if (!pingReady || !window.gameWs) return;
  window.gameWs.send(JSON.stringify({ event: "update", input: { ping: true } }));

  pingReady = false;
  const btn = document.getElementById("btn-ping");
  btn.disabled = true;

  let remaining = PING_COOLDOWN / 1000;
  btn.textContent = `Ping (${remaining}s)`;
  const interval = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      btn.textContent = `Ping (${remaining}s)`;
    } else {
      clearInterval(interval);
      btn.textContent = "Ping";
      btn.disabled = false;
      pingReady = true;
    }
  }, 1000);
}

function initControls() {
  const joystickArea = document.getElementById("joystick-area");

  new JoystickController.default(
    {
      radius: 80,
      joystickRadius: 32,
      maxRange: 45,
      opacity: 0.7,
      level: 10,
      x: "50%",
      y: "50%",
    },
    ({ leveledX, leveledY }) => {
      joystickInput.x = leveledX / 10;
      joystickInput.y = leveledY / 10;
    }
  );

  document.addEventListener("keydown", (e) => {
    if (e.code in keysPressed) keysPressed[e.code] = true;
  });
  document.addEventListener("keyup", (e) => {
    if (e.code in keysPressed) keysPressed[e.code] = false;
  });

  setInterval(sendInput, 1000 / 30);
}

function sendInput() {
  const kbX = (keysPressed.ArrowRight ? 1 : 0) - (keysPressed.ArrowLeft ? 1 : 0);
  const kbY = (keysPressed.ArrowUp ? 1 : 0) - (keysPressed.ArrowDown ? 1 : 0);

  const input = {
    x: kbX !== 0 ? kbX : joystickInput.x,
    y: kbY !== 0 ? kbY : joystickInput.y,
  };

  const diff = {};
  for (const key of Object.keys(input)) {
    if (currentInput[key] !== input[key]) diff[key] = input[key];
  }

  if (Object.keys(diff).length > 0 && window.gameWs) {
    window.gameWs.send(JSON.stringify({ event: "update", input: diff }));
  }

  currentInput = input;
}

document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
});
