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
    // --- AXIS LOGIC ---
    handleAxis('left_stick_x', data[3], 'x');
    handleAxis('left_stick_y', data[4], 'y');

    // --- BUTTON LOGIC ---
    
    // 1. Combine data[5] and data[6] into a single 16-bit integer
    // We use (data[6] << 8) to put the second byte "above" the first byte
    let combinedButtons = data[5] | (data[6] << 8);

    // 2. Clear the Idle Offset (8) and Shift by 4 to align Square to 0
    // We use a bitwise mask to ensure the D-Pad bits (the first 4) don't interfere
    let normalizedButtons = (combinedButtons - IDLE_OFFSET) >> 4;

    // 3. Loop through all 12 potential buttons in your JSON
    for (let i = 0; i <= 11; i++) {
        const isPressed = (normalizedButtons & (1 << i)) !== 0;

        if (isPressed && !buttonStates[i]) {
            const msg = config.mappings[i.toString()];
            if (msg) {
                console.log(`>>> BUTTON ${i}: ${msg}`);
            } else {
                console.log(`>>> BUTTON ${i} pressed (No mapping)`);
            }
            buttonStates[i] = true;
        } 
        else if (!isPressed && buttonStates[i]) {
            buttonStates[i] = false;
        }
    }
});

function handleAxis(axisName, value, stateKey) {
    let currentState = "neutral";
    if (value < (CENTER - DEADZONE)) currentState = "low";
    else if (value > (CENTER + DEADZONE)) currentState = "high";

    if (currentState !== lastAxisState[stateKey]) {
        if (currentState !== "neutral") {
            const msg = config.axis_mappings[axisName][currentState];
            if (msg) console.log(`>>> AXIS: ${msg}`);
        }
        lastAxisState[stateKey] = currentState;
    }
}