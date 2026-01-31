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

/**
 * Main function to find and connect to the controller
 */
function connect() {
    console.log("Searching for controller...");
    
    const devices = HID.devices();
    const controllerInfo = devices.find(d => d.vendorId === 1133 || d.vendorId === 1356);

    if (!controllerInfo) {
        // No controller found, wait 3 seconds and try again
        setTimeout(connect, 3000);
        return;
    }

    try {
        device = new HID.HID(controllerInfo.path);
        console.log(`Connected to: ${controllerInfo.product}`);

        // Handle incoming data
        device.on("data", handleData);

        // Handle disconnection/errors
        device.on("error", (err) => {
            console.log("Controller disconnected or error occurred.");
            cleanupAndReconnect();
        });

        device.on("end", () => {
            console.log("Device stream ended.");
            cleanupAndReconnect();
        });

    } catch (err) {
        console.error("Could not open device:", err.message);
        setTimeout(connect, 3000);
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

// ... include handleHatSwitch, handleAxis, and processAxisEvent functions from previous response ...

// Start the initial connection attempt
connect();