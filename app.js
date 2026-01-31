const HID = require('node-hid');
const fs = require('fs');

// 1. Load Config
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

const devices = HID.devices();
const controllerInfo = devices.find(d => d.vendorId === 1133 || d.vendorId === 1356);

if (!controllerInfo) {
    console.log("No controller found.");
    process.exit();
}

const device = new HID.HID(controllerInfo.path);

// 2. State Tracking
// This variable remembers what was pressed in the last 'tick'
let lastButtonValue = 0;

console.log(`Listening for inputs on ${controllerInfo.product}...`);

device.on("data", (data) => {
    // We are looking at Byte 3 based on your test
    const currentButtonValue = data[3]; 

    // 3. Logic: Only trigger if the value CHANGED and is not 0 (released)
    if (currentButtonValue !== lastButtonValue) {
        if (currentButtonValue !== 0) {
            const mapping = config.mappings[currentButtonValue.toString()];
            
            if (mapping) {
                console.log(`>>> OUTPUT: ${mapping}`);
            } else {
                console.log(`New Button ID detected: ${currentButtonValue}`);
            }
        }
        // Update the state so we don't repeat the message
        lastButtonValue = currentButtonValue;
    }
});