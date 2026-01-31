const HID = require('node-hid');
const fs = require('fs');
const io = require('socket.io-client');

const argv = require('yargs/yargs')(process.argv.slice(2))
    .option('url', {
        alias: 'u',
        description: 'CNCjs Server URL',
        default: 'http://localhost:80'
    })
    .option('port', {
        alias: 'p',
        description: 'Serial Port (e.g., /dev/ttyUSB0 or COM3)',
        default: '/dev/ttyACM0',
        demandOption: true
    })
    .help()
    .argv;

const socket = io(argv.url);

// 1. Load Mappings
const buttonMapping = JSON.parse(fs.readFileSync('ButtonMapping.json', 'utf8'));
const actionMapping = JSON.parse(fs.readFileSync('ActionMapping.json', 'utf8'));

// State Management
let device = null;
let buttonStates = {};
let lastAxisState = { lx: "neutral", ly: "neutral", rx: "neutral", ry: "neutral", dx: "neutral", dy: "neutral" };

const DEADZONE = 50;
const CENTER = 128;

socket.on('connect', () => {
    console.log(`Connected to ${serverAddr}`);
    
    // Graceful exit after sending
    setTimeout(() => process.exit(0), 1000);
});

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
            const button = buttonMapping.mappings[i.toString()];
            const action = actionMapping.mappings[button];
            if (button) {
                console.log(`>>> ${button} : ${action}`);
                switch (action) {
                    case "performHoming":
                        socket.emit('write', argv.port, '$H\n');
                        break;
                }
            }
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
        const axisConfig = buttonMapping.axis_mappings[axisName];
        if (currentState !== "neutral" && axisConfig && axisConfig[currentState]) {
            const axesState = axisConfig[currentState];
            const action = actionMapping.mappings[axesState];
            console.log(`>>> ${axesState} : ${action}`);
        }
        lastAxisState[stateKey] = currentState;
    }
}

// --- Graceful Shutdown Logic ---
process.on('SIGINT', () => {
    console.log('\nGracefully shutting down...');
    
    if (socket.connected) {
        socket.disconnect();
        console.log('Socket disconnected.');
    }
    
    process.exit(0); // Manually exit the process
});
// -------------------------------

// Start the initial connection attempt
connect();