const HID = require('node-hid');
const fs = require('fs');

// 1. Load Configuration
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// 2. Initialize Device
const devices = HID.devices();
const controllerInfo = devices.find(d => d.vendorId === 1133 || d.vendorId === 1356);

if (!controllerInfo) {
    console.error("No compatible controller found. Please check your connection.");
    process.exit(1);
}

const device = new HID.HID(controllerInfo.path);

// 3. State Management
let buttonStates = {}; 
let lastAxisState = { lx: "neutral", ly: "neutral", rx: "neutral", ry: "neutral", dx: "neutral", dy: "neutral" };

const DEADZONE = 50;
const CENTER = 128;

console.log(`Successfully mapped: ${controllerInfo.product}`);
console.log("Listening for inputs...");

device.on("data", (data) => {
    // --- AXIS LOGIC (Joysticks) ---
    handleAxis('left_stick_x',  data[1], 'lx');
    handleAxis('left_stick_y',  data[2], 'ly');
    handleAxis('right_stick_x', data[3], 'rx');
    handleAxis('right_stick_y', data[4], 'ry');

    // --- D-PAD / HAT SWITCH LOGIC ---
    const hatValue = data[5] & 0x0F; 
    handleHatSwitch(hatValue);

    // --- BUTTON LOGIC ---
    // Mask out D-Pad (0x0F) and combine with second button byte
    let rawButtons = (data[5] & 0xF0) | (data[6] << 8);
    let normalizedButtons = rawButtons >> 4;

    for (let i = 0; i <= 11; i++) {
        const isPressed = (normalizedButtons & (1 << i)) !== 0;

        if (isPressed && !buttonStates[i]) {
            const msg = config.mappings[i.toString()];
            if (msg) console.log(`>>> ${msg}`);
            buttonStates[i] = true;
        } 
        else if (!isPressed && buttonStates[i]) {
            buttonStates[i] = false;
        }
    }
});

function handleHatSwitch(value) {
    // Standard HID Hat Switch: 0=Up, 2=Right, 4=Down, 6=Left, 8=Neutral
    let stateX = "neutral";
    let stateY = "neutral";

    if (value === 0 || value === 1 || value === 7) stateY = "low";
    if (value === 3 || value === 4 || value === 5) stateY = "high";
    if (value === 5 || value === 6 || value === 7) stateX = "low";
    if (value === 1 || value === 2 || value === 3) stateX = "high";

    processAxisEvent('dpad_x', stateX, 'dx');
    processAxisEvent('dpad_y', stateY, 'dy');
}

function handleAxis(axisName, value, stateKey) {
    let currentState = "neutral";
    if (value < (CENTER - DEADZONE)) currentState = "low";
    else if (value > (CENTER + DEADZONE)) currentState = "high";
    processAxisEvent(axisName, currentState, stateKey);
}

function processAxisEvent(axisName, currentState, stateKey) {
    if (currentState !== lastAxisState[stateKey]) {
        const axisConfig = config.axis_mappings[axisName];
        if (currentState !== "neutral" && axisConfig && axisConfig[currentState]) {
            console.log(`>>> ${axisConfig[currentState]}`);
        }
        lastAxisState[stateKey] = currentState;
    }
}

device.on("error", (err) => console.error("HID Error:", err));