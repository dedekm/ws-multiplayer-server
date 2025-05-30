// Testing functions for simulating player movements
function startMovementTest(pattern = 'circle') {
  let testInterval;
  let angle = 0;
  
  function stopTest() {
    if (testInterval) {
      clearInterval(testInterval);
      testInterval = null;
    }
    // Reset inputs
    joystickInput.x = 0;
    joystickInput.y = 0;
    keysPressed.Space = false;
  }

  function circlePattern() {
    // Create circular movement
    joystickInput.x = Math.cos(angle);
    joystickInput.y = Math.sin(angle);
    angle += 0.1;
    
    // Trigger action every 2 seconds
    keysPressed.Space = Math.floor(Date.now() / 2000) % 2 === 0;
  }

  function zigzagPattern() {
    // Create zigzag movement
    joystickInput.x = Math.sin(angle * 2);
    joystickInput.y = Math.cos(angle);
    angle += 0.05;
    
    // Trigger action at pattern peaks
    keysPressed.Space = Math.abs(Math.sin(angle * 2)) > 0.9;
  }

  function randomPattern() {
    // Random movement every second
    if (Math.floor(angle) !== Math.floor(angle + 0.1)) {
      joystickInput.x = (Math.random() * 2) - 1;
      joystickInput.y = (Math.random() * 2) - 1;
      keysPressed.Space = Math.random() > 0.7;
    }
    angle += 0.1;
  }

  // Stop any existing test
  stopTest();

  // Start new test based on pattern
  testInterval = setInterval(() => {
    switch (pattern) {
      case 'circle':
        circlePattern();
        break;
      case 'zigzag':
        zigzagPattern();
        break;
      case 'random':
        randomPattern();
        break;
    }
  }, 50);

  // Return the stop function for later use
  return stopTest;
}

// Initialize testing mode based on URL parameters
function initializeTestingMode() {
  const urlParams = new URLSearchParams(window.location.search);
  const testPattern = urlParams.get('test');
  
  if (!testPattern) return; // Not in testing mode
  
  // Default test configuration
  const testConfig = {
    pattern: testPattern,
    nickname: urlParams.get('nickname') || 'TestBot',
    evolutionLine: urlParams.get('species') || 1
  };

  // Wait for DOM to be fully loaded
  document.addEventListener('DOMContentLoaded', () => {
    // Set nickname
    const nicknameInput = document.querySelector('.nickname-input');
    if (nicknameInput) {
      nicknameInput.value = testConfig.nickname;
    }

    // Select species and start the game
    setTimeout(() => {
      const speciesCard = document.querySelector(`.species-selection-card[data-evolution-line="${testConfig.evolutionLine}"]`);
      if (speciesCard) {
        speciesCard.click();
        // Start movement pattern after a short delay to ensure game is initialized
        setTimeout(() => {
          startMovementTest(testConfig.pattern);
        }, 1000);
      }
    }, 500);
  });
}

// Start testing mode initialization
initializeTestingMode();

// Example URL parameters for testing:
// ?test=circle&nickname=TestBot&species=0
// ?test=zigzag&nickname=ZigZagger&species=1