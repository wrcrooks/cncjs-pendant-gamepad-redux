const HID = require('node-hid');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const devices = HID.devices();
const controllerInfo = devices.find(d => d.vendorId === 1133 || d.vendorId === 1356);

if (!controllerInfo) {
    console.log("Controller not found.");
    process.exit();
}

const device = new HID.HID(controllerInfo.path);

let buttonStates = {}; 
let lastAxisState = { x: "neutral", y: "neutral" };

const DEADZONE = 50;
const CENTER = 128;
const IDLE_OFFSET = 8; // Your controller's base value for data[5]

console.log(`Connected to ${controllerInfo.product}. Ready!`);

device.on("data", (data) => {
    // --- 1. AXIS LOGIC (Bytes 3 and 4) ---
    handleAxis('left_stick_x', data[3], 'x');
    handleAxis('left_stick_y', data[4], 'y');

    // --- 2. BUTTON LOGIC (Normalized to 0-11) ---
    // Subtract the idle offset so 'no buttons' equals 0
    const buttonByte = data[5] - IDLE_OFFSET;

    // Check bits 0 through 11 (covers all buttons in your JSON)
    for (let i = 0; i <= 11; i++) {
        // Check if the i-th bit is set
        const isPressed = (buttonByte & (1 << i)) !== 0;

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