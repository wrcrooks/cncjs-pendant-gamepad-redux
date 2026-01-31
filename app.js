const gamepad = require("gamepad");
const fs = require("fs");

// 1. Load your configuration
let config;
try {
    const rawData = fs.readFileSync('config.json');
    config = JSON.parse(rawData);
} catch (err) {
    console.error("Error reading config.json:", err);
    process.exit(1);
}

// 2. Initialize the library
gamepad.init();

console.log("--- Gamepad Listener Started ---");
console.log("Detected devices:", gamepad.numDevices());

// Create a loop to poll for events
setInterval(gamepad.processEvents, 16);
// Scan for new gamepads every few seconds
setInterval(gamepad.detectDevices, 5000);

// 3. Listen for button presses
gamepad.on("down", (deviceID, buttonID) => {
    const mapping = config.mappings[buttonID];
    
    if (mapping) {
        console.log(`Button ${buttonID} pressed: ${mapping}`);
    } else {
        console.log(`Button ${buttonID} pressed (No mapping found).`);
    }
});