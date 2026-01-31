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

    // --- BUTTON LOGIC WITH SHIFTING ---
    // 1. Remove the D-Pad idle value (8)
    // 2. Shift Right by 4 (>> 4) to move bit 4 into the 0 position
    const normalizedButtons = (data[5] - IDLE_OFFSET) >> 4;

    for (let i = 0; i <= 11; i++) {
        // Check if the i-th bit is set after the shift
        const isPressed = (normalizedButtons & (1 << i)) !== 0;

        if (isPressed && !buttonStates[i]) {
            const msg = config.mappings[i.toString()];
            if (msg) {
                console.log(`>>> BUTTON ${i}: ${msg}`);
            } else {
                console.log(`>>> BUTTON ${i} pressed (No mapping in JSON)`);
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