const HID = require('node-hid');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const devices = HID.devices();
const controllerInfo = devices.find(d => d.vendorId === 1133 || d.vendorId === 1356);

if (!controllerInfo) { process.exit(); }
const device = new HID.HID(controllerInfo.path);

// State tracking
let lastButtonValue = 0;
let lastAxisState = { x: "neutral", y: "neutral" };

const DEADZONE = 50; // Ignore small movements near the center (128)
const CENTER = 128;

console.log("Listening for Buttons and Axes...");

device.on("data", (data) => {
    // --- 1. BUTTON LOGIC (Byte 3 based on your previous test) ---
    console.log("Raw Data:", data);
    
    const currentButtonValue = data[3]; 
    if (currentButtonValue !== lastButtonValue) {
        if (currentButtonValue !== 0) {
            const msg = config.mappings[currentButtonValue.toString()];
            if (msg) console.log(`>>> ${msg}`);
        }
        lastButtonValue = currentButtonValue;
    }

    // --- 2. AXIS LOGIC (Example: Left Stick X = Byte 0, Y = Byte 1) ---
    // Note: You might need to experiment to see which byte is which stick!
    const rawX = data[0];
    const rawY = data[1];

    handleAxis('left_stick_x', rawX, 'x');
    handleAxis('left_stick_y', rawY, 'y');
});

function handleAxis(axisName, value, stateKey) {
    let currentState = "neutral";

    if (value < (CENTER - DEADZONE)) currentState = "low";
    else if (value > (CENTER + DEADZONE)) currentState = "high";

    // Only trigger on state change (e.g., neutral -> high)
    if (currentState !== lastAxisState[stateKey]) {
        if (currentState !== "neutral") {
            const msg = config.axis_mappings[axisName][currentState];
            if (msg) console.log(`>>> AXIS: ${msg}`);
        }
        lastAxisState[stateKey] = currentState;
    }
}