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
    // 1. JOYSICK AXES
    handleAxis('left_stick_x',  data[1], 'lx');
    handleAxis('left_stick_y',  data[2], 'ly');
    handleAxis('right_stick_x', data[3], 'rx');
    handleAxis('right_stick_y', data[4], 'ry');

    // 2. D-PAD / HAT SWITCH LOGIC
    // Most controllers put the Hat Switch in the lower 4 bits of data[5]
    const hatValue = data[5] & 0x0F; 
    handleHatSwitch(hatValue);

    // 3. BUTTON LOGIC
    // We mask out the Hat Switch (0x0F) and keep the buttons
    let rawButtons = (data[5] & 0xF0) | (data[6] << 8);
    let normalizedButtons = rawButtons >> 4;

    for (let i = 0; i <= 11; i++) {
        const isPressed = (normalizedButtons & (1 << i)) !== 0;
        if (isPressed && !buttonStates[i]) {
            const msg = config.mappings[i.toString()];
            if (msg) console.log(`>>> BUTTON ${i}: ${msg}`);
            buttonStates[i] = true;
        } else if (!isPressed && buttonStates[i]) {
            buttonStates[i] = false;
        }
    }
});

function handleHatSwitch(value) {
    // 0=Up, 1=UpRight, 2=Right, 3=DownRight, 4=Down, 5=DownLeft, 6=Left, 7=UpLeft, 8=Neutral
    let stateX = "neutral";
    let stateY = "neutral";

    if (value === 0 || value === 1 || value === 7) stateY = "low";  // Up
    if (value === 3 || value === 4 || value === 5) stateY = "high"; // Down
    if (value === 5 || value === 6 || value === 7) stateX = "low";  // Left
    if (value === 1 || value === 2 || value === 3) stateX = "high"; // Right

    processDpadAxis('dpad_x', stateX, 'dx');
    processDpadAxis('dpad_y', stateY, 'dy');
}

function processDpadAxis(axisName, currentState, stateKey) {
    if (currentState !== lastAxisState[stateKey]) {
        const axisConfig = config.axis_mappings[axisName];
        if (currentState !== "neutral" && axisConfig) {
            const msg = axisConfig[currentState];
            if (msg) console.log(`>>> ${msg}`);
        }
        lastAxisState[stateKey] = currentState;
    }
}

// We ensure stateKey is unique for every axis to prevent "crosstalk"
function handleAxis(axisName, value, stateKey) {
    let currentState = "neutral";
    
    // Logic: Up/Left are low (near 0), Down/Right are high (near 255)
    if (value < (CENTER - DEADZONE)) currentState = "low";
    else if (value > (CENTER + DEADZONE)) currentState = "high";

    if (currentState !== lastAxisState[stateKey]) {
        const axisConfig = config.axis_mappings[axisName];
        if (currentState !== "neutral" && axisConfig) {
            const msg = axisConfig[currentState];
            if (msg) console.log(`>>> ${msg}`);
        }
        lastAxisState[stateKey] = currentState;
    }
}