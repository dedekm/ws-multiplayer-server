const game = {}

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
    const evolutionLine = Number(card.dataset.evolutionLine);
    
    const nicknameInput = document.querySelector(".nickname-input");
    const nickname = nicknameInput.value.trim();
    
    if (!nickname) {
      nicknameInput.focus();
      return;
    }

    game.ws = initializeWebSocket({ 
      evolution_line: evolutionLine,
      nickname: nickname
    });

    game.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.event) {
        case "update":
          if (data.params && data.params.health) {
            console.log("current health", data.params.health);
            updateHealthBar(data.params.health);
          }
          break;
        case "evolved":
          handleEvolution(evolutionLine);
          break;
        case "death":
          console.log("death");
          handleDeath();
          break;
        default:
          console.log(`Unknown event: ${data.event}`);
      }
    };

    initializeControls(getComputedStyle(card).backgroundColor, nickname);
    showActiveSpecies(card);

    document.querySelector(".species-selection").style.display = "none";
  });
});

// Add restart button handler
document.querySelector(".restart-button").addEventListener("click", () => {
  // Hide death screen
  document.querySelector(".death-screen").style.display = "none";
  
  // Show species selection
  document.querySelector(".species-selection").style.display = "flex";
  
  // Close WebSocket connection if it exists
  if (game.ws) {
    game.ws.close();
    game.ws = null;
  }
});

function initializeControls(color, nickname) {
  // initialize joystick
  game.joystick = new JoystickController.default(
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

  // show controls and set initial state
  document.querySelector(".controls-container").style.display = "flex";
  document.querySelector(".controls-container .btn-action").style.backgroundColor = color;
  document.querySelector(".player-nickname").textContent = nickname;
  document.querySelector(".player-info").style.display = "flex";
  document.querySelector(".health-bar").style.display = "flex";
  updateHealthBar(1.0);

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

function handleEvolution(evolutionLine) {
  // Hide the level 1 card
  const level1Card = document.querySelector(`.species-selection-card[data-evolution-line="${evolutionLine}"][data-level="1"]`);
  if (level1Card) {
    level1Card.style.display = 'none';
  }

  // Show the level 2 card
  const level2Card = document.querySelector(`.species-selection-card[data-evolution-line="${evolutionLine}"][data-level="2"]`);
  if (level2Card) {
    level2Card.style.display = 'flex';
    // Update the action button color to match the evolved form
    document.querySelector(".controls-container .btn-action").style.backgroundColor = getComputedStyle(level2Card).backgroundColor;
    // Update the active species card
    showActiveSpecies(level2Card);
  }
}

function showActiveSpecies(card) {
  const container = document.querySelector('.active-species-container');
  container.style.display = 'block';
  
  // Clear any existing cards
  container.innerHTML = '';
  
  // Clone the card and add it to the container
  const activeCard = card.cloneNode(true);
  container.appendChild(activeCard);
}

function sendInput(input) {
  const inputDiff = {};

  Object.keys(input).forEach((key) => {
    if (currentInput[key] !== input[key]) inputDiff[key] = input[key];
  });

  if (Object.keys(inputDiff).length !== 0 && game.ws) {
    game.ws.send(JSON.stringify({
      event: "update",
      input: inputDiff
    }));
  }

  currentInput = input;
}

function updateHealthBar(health) {
  const healthBar = document.querySelector('.health-bar-fill');
  const percentage = Math.round(Math.max(0, Math.min(100, health * 100)));
  healthBar.style.width = `${percentage}%`;
  
  // Change color based on health level
  if (percentage > 60) {
    healthBar.style.backgroundColor = '#2ecc71'; // Green
  } else if (percentage > 30) {
    healthBar.style.backgroundColor = '#f1c40f'; // Yellow
  } else {
    healthBar.style.backgroundColor = '#e74c3c'; // Red
  }
}

function handleDeath() {
  // Hide game elements
  document.querySelector(".controls-container").style.display = "none";
  document.querySelector(".player-info").style.display = "none";
  
  // Show death screen
  document.querySelector(".death-screen").style.display = "block";

  // Remove joystick
  if (game.joystick) {
    game.joystick.destroy();
    game.joystick = null;
  }
}

document.addEventListener("contextmenu", function (e) {
  e.preventDefault()
  e.stopPropagation()
});