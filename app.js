const HID = require('node-hid');
const fs = require('fs');

// 1. Load Config
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// 2. Setup Device
const devices = HID.devices();
const controllerInfo = devices.find(d => d.vendorId === 1133 || d.vendorId === 1356);

if (!controllerInfo) {
    console.log("No controller found.");
    process.exit();
}

const device = new HID.HID(controllerInfo.path);

// State tracking
let buttonStates = {}; 
let lastAxisState = { x: "neutral", y: "neutral" };

const DEADZONE = 50;
const CENTER = 128;
const IDLE_OFFSET = 8; 

console.log(`Mapping ${controllerInfo.product} indices...`);

device.on("data", (data) => {
    // --- 1. AXIS LOGIC ---
    
    // Left Joystick (likely bytes 1 and 2)
    handleAxis('left_stick_x', data[1], 'lx');
    handleAxis('left_stick_y', data[2], 'ly');

    // Right Joystick (the ones you confirmed working on 3 and 4)
    handleAxis('right_stick_x', data[3], 'rx');
    handleAxis('right_stick_y', data[4], 'ry');

    // --- 2. BUTTON LOGIC ---
    let combinedButtons = data[5] | (data[6] << 8);
    let normalizedButtons = (combinedButtons - IDLE_OFFSET) >> 4;

    for (let i = 0; i <= 11; i++) {
        const isPressed = (normalizedButtons & (1 << i)) !== 0;

        if (isPressed && !buttonStates[i]) {
            const msg = config.mappings[i.toString()];
            if (msg) console.log(`>>> BUTTON ${i}: ${msg}`);
            buttonStates[i] = true;
        } 
        else if (!isPressed && buttonStates[i]) {
            buttonStates[i] = false;
        }
    }
});

// Updated helper to track multiple sticks independently
function handleAxis(axisName, value, stateKey) {
    let currentState = "neutral";
    if (value < (CENTER - DEADZONE)) currentState = "low";
    else if (value > (CENTER + DEADZONE)) currentState = "high";

    if (currentState !== lastAxisState[stateKey]) {
        // Look for mapping in config.axis_mappings
        const axisConfig = config.axis_mappings[axisName];
        if (currentState !== "neutral" && axisConfig) {
            const msg = axisConfig[currentState];
            if (msg) console.log(`>>> AXIS ${axisName}: ${msg}`);
        }
        lastAxisState[stateKey] = currentState;
    }
}