const HID = require('node-hid');
const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');
const jwt = require('jsonwebtoken');

const argv = require('yargs/yargs')(process.argv.slice(2))
    .option('url', {
        alias: 'u',
        description: 'CNCjs Server URL',
        default: 'http://localhost:8000'
    })
    .option('port', {
        alias: 'p',
        description: 'Serial Port (e.g., /dev/ttyUSB0 or COM3)',
        default: '/dev/ttyACM0'
    })
    .option('secret', {
        alias: 's',
        description: 'CNCJS Secret (Found in ~/.cncrc)'
    })
    .help()
    .argv;

const payload = { id: '', name: 'cncjs-pendant' };
const activeTimeouts = [];
stepSizes = [0.1, 0.2, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 20.0];
selectedStep = 4;

//#region Functions
const getUserHome = function() {
    return process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
};
//#endregion

if (!argv.secret) {
    const cncrc = path.resolve(getUserHome(), '.cncrc');
    try {
        const config = JSON.parse(fs.readFileSync(cncrc, 'utf8'));
        argv.secret = config.secret;
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

console.log(`>>> SECRET : ${argv.secret}`);
console.log(`>>> URL : ${argv.url}`);
const token = jwt.sign(payload, argv.secret, { expiresIn: '30d' });

console.log(`Generated Token: ${token}`);

socket = io.connect(argv.url, {
    'query': 'token=' + token
});

socket.on('connect', () => {
    console.log("HERE");
    console.log(`Connected to ${argv.url}`);
    socket.emit('open', argv.port, {
        baudrate: 115200,
        controllerType: 'Grbl'
    });
    // Start the initial connection attempt
    connect();
});

socket.on('error', (err) => {
    console.error(`Connection error: ${err.message}`);
    if (socket) {
        socket.destroy();
        socket = null;
    }
});

socket.on('close', () => {
    console.log('Connection closed.');
});

socket.on('serialport:open', function(argv) {
    options = argv || {};

    console.log('Connected to port "' + options.port + '" (Baud rate: ' + options.baudrate + ')');

    // callback(null, socket);
});

socket.on('serialport:error', function(argv) {
    console.log('Error opening serial port "' + argv.port + '"');
    // callback(new Error('Error opening serial port "' + argv.port + '"'));
});

// 1. Load Mappings
const buttonMapping = JSON.parse(fs.readFileSync('ButtonMapping.json', 'utf8'));
const actionMapping = JSON.parse(fs.readFileSync('ActionMapping.json', 'utf8'));

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
        activeTimeouts.push(setTimeout(connect, 3000));
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
        activeTimeouts.push(setTimeout(connect, 1000));
    }
}

function cleanupAndReconnect() {
    if (device) {
        device.close();
        device = null;
    }
    // Reset states so buttons don't stay "stuck" in the app memory
    buttonStates = {};
    activeTimeouts.push(setTimeout(connect, 3000));
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
                        // socket.emit('write', argv.port, '$H\n');
                        socket.emit('command', argv.port, 'homing');
                        break;
                    case "programStart":
                        socket.emit('command', argv.port, 'start');
                        break;
                    case "controllerReset":
                        socket.emit('command', argv.port, 'reset');
                        break;
                    case "spindleOff":
                        socket.emit('command', argv.port, 'gcode', 'M5');
                        break;
                    case "spindleOn":
                        socket.emit('command', argv.port, 'gcode', 'M3 S13000');
                        break;
                    case "toolChange":
                        socket.emit('command', argv.port, 'gcode', 'T0M6');
                        break;
                    case "zeroWCS":
                        socket.emit('command', argv.port, 'gcode', 'G10 L2 P1 X0 Y0 Z0');
                        break;
                    case "moveToZeroWCS":
                        socket.emit('command', argv.port, 'gcode', 'G53 G0 G90 Z0');
                        socket.emit('command', argv.port, 'gcode', 'G54 G0 G90 X0 Y0 Z0');
                        break;
                    case "decreaseStep":
                        selectedStep -= 1;
                        if (selectedStep < 0) {
                            selectedStep = stepSizes.length - 1;
                        }
                        console.log(`>>> STEP SIZE: ${stepSizes[selectedStep]}`);
                        break;
                    case "increaseStep":
                        selectedStep += 1;
                        if (selectedStep >= stepSizes.length) {
                            selectedStep = 0;
                        }
                        console.log(`>>> STEP SIZE: ${stepSizes[selectedStep]}`);
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
            switch (action) {
                case "moveXMinus":
                    socket.emit('command', argv.port, 'gcode', 'G21');
                    socket.emit('command', argv.port, 'gcode', `G91 G0 X-${stepSizes[selectedStep]}`);
                    socket.emit('command', argv.port, 'gcode', 'G90');
                    break;
                case "moveXPlus":
                    socket.emit('command', argv.port, 'gcode', 'G21');
                    socket.emit('command', argv.port, 'gcode', `G91 G0 X${stepSizes[selectedStep]}`);
                    socket.emit('command', argv.port, 'gcode', 'G90');
                    break;
                case "moveYMinus":
                    socket.emit('command', argv.port, 'gcode', 'G21');
                    socket.emit('command', argv.port, 'gcode', `G91 G0 Y-${stepSizes[selectedStep]}`);
                    socket.emit('command', argv.port, 'gcode', 'G90');
                    break;
                case "moveYPlus":
                    socket.emit('command', argv.port, 'gcode', 'G21');
                    socket.emit('command', argv.port, 'gcode', `G91 G0 Y${stepSizes[selectedStep]}`);
                    socket.emit('command', argv.port, 'gcode', 'G90');
                    break;
                case "moveZMinus":
                    socket.emit('command', argv.port, 'gcode', 'G21');
                    socket.emit('command', argv.port, 'gcode', `G91 G0 Z-${stepSizes[selectedStep]}`);
                    socket.emit('command', argv.port, 'gcode', 'G90');
                    break;
                case "moveZPlus":
                    socket.emit('command', argv.port, 'gcode', 'G21');
                    socket.emit('command', argv.port, 'gcode', `G91 G0 Z${stepSizes[selectedStep]}`);
                    socket.emit('command', argv.port, 'gcode', 'G90');
                    break;
            }
        }
        lastAxisState[stateKey] = currentState;
    }
}

function clearAllTimeouts() {
  activeTimeouts.forEach(id => {
    clearTimeout(id);
  });
  activeTimeouts.length = 0; // Clear the array after cancelling
  console.log('All timeouts cleared.');
}

// --- Graceful Shutdown Logic ---
process.on('SIGINT', () => {
    console.log('\nGracefully shutting down...');
    
    if (socket.connected) {
        socket.destroy();
        console.log('Socket disconnected.');
    }
    
    console.log('Clearing all timeouts');
    clearAllTimeouts();
    process.exit(1); // Manually exit the process
});
// -------------------------------
