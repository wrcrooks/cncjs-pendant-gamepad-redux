const HID = require('node-hid');
const fs = require('fs');

// 1. Load Config
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// State Management
let device = null;
let buttonStates = {};
let lastAxisState = { lx: "neutral", ly: "neutral", rx: "neutral", ry: "neutral", dx: "neutral", dy: "neutral" };

const DEADZONE = 50;
const CENTER = 128;

// Add this helper function at the bottom of your app.js
function vibrate(hidDevice) {
    console.log("Sending connection rumble...");

    // The DualShock 3 vibration packet (standard HID output report)
    // Byte 3 is the right (small) motor (0 or 1)
    // Byte 5 is the left (large) motor (0 to 255)
    const report = Buffer.alloc(32);
    report[0] = 0x01; // Report ID
    report[2] = 0x00;
    report[3] = 0x01; // Small motor on
    report[4] = 0x00;
    report[5] = 0xff; // Large motor at max power
    report[6] = 0x00;
    
    try {
        // Send the rumble
        hidDevice.write(report);

        // Turn it off after 500ms
        setTimeout(() => {
            const stopReport = Buffer.alloc(32);
            stopReport[0] = 0x01;
            hidDevice.write(stopReport);
        }, 500);
    } catch (err) {
        console.log("Vibration not supported on this specific device/mode.");
    }
}

/**
 * Main function to find and connect to the controller
 */
function connect() {
    console.log("Searching for controller...");
    const devices = HID.devices();
    const controllerInfo = devices.find(d => d.vendorId === 1133 || d.vendorId === 1356);

    if (!controllerInfo) {
        setTimeout(connect, 3000);
        return;
    }

    try {
        device = new HID.HID(controllerInfo.path);
        console.log(`Connected to: ${controllerInfo.product}`);

        // Trigger the vibration on connection
        vibrate(device);

        device.on("data", handleData);
        device.on("error", () => cleanupAndReconnect());
        device.on("end", () => cleanupAndReconnect());
    } catch (err) {
        console.error("Could not open device:", err.message);
        setTimeout(connect, 1000);
    }
}

function cleanupAndReconnect() {
    if (device) {
        device.close();
        device = null;
    }
    // Reset states so buttons don't stay "stuck" in the app memory
    buttonStates = {};
    setTimeout(connect, 3000);
}

function handleData(data) {
    // --- AXIS LOGIC ---
    handleAxis('left_stick_x',  data[1], 'lx');
    handleAxis('left_stick_y',  data[2], 'ly');
    handleAxis('right_stick_x', data[3], 'rx');
    handleAxis('right_stick_y', data[4], 'ry');

    // --- D-PAD LOGIC ---
    const hatValue = data[5] & 0x0F; 
    handleHatSwitch(hatValue);

    // --- BUTTON LOGIC ---
    let rawButtons = (data[5] & 0xF0) | (data[6] << 8);
    let normalizedButtons = rawButtons >> 4;

    for (let i = 0; i <= 11; i++) {
        const isPressed = (normalizedButtons & (1 << i)) !== 0;
        if (isPressed && !buttonStates[i]) {
            const msg = config.mappings[i.toString()];
            if (msg) console.log(`>>> ${msg}`);
            buttonStates[i] = true;
        } else if (!isPressed && buttonStates[i]) {
            buttonStates[i] = false;
        }
    }
}

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

// Start the initial connection attempt
connect();