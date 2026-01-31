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
    // --- 1. JOYSICK AXES (1-4) ---
    handleAxis('left_stick_x',  data[1], 'lx');
    handleAxis('left_stick_y',  data[2], 'ly');
    handleAxis('right_stick_x', data[3], 'rx');
    handleAxis('right_stick_y', data[4], 'ry');

    // --- 2. D-PAD AXES (7-8) ---
    handleAxis('dpad_x', data[7], 'dx');
    handleAxis('dpad_y', data[8], 'dy');

    // --- 3. BUTTON LOGIC (Fixed Masking) ---
    
    // Combine data[5] and data[6]
    let rawValue = data[5] | (data[6] << 8);

    /**
     * THE FIX:
     * 0xFFF0 is a mask that looks like 1111111111110000 in binary.
     * It keeps all the button bits but turns the D-Pad bits (0-3) into zeros.
     */
    let buttonsOnly = (rawValue & 0xFFF0); 
    
    // Now shift right by 4 so Button 4 (Square) becomes Index 0
    let normalizedButtons = buttonsOnly >> 4;

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