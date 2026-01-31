const HID = require('node-hid');
const fs = require('fs');

// 1. Load Config
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// 2. Find the Controller
const devices = HID.devices();
// Look for Logitech (VendorID 1133 or 0x046D) or Sony (VendorID 1356 or 0x054C)
const controllerInfo = devices.find(d => d.vendorId === 1133 || d.vendorId === 1356);

if (!controllerInfo) {
    console.log("No compatible controller found. Connected devices:");
    console.log(devices.map(d => `${d.product} (VID: ${d.vendorId})`));
    process.exit();
}

console.log(`Connected to: ${controllerInfo.product}`);
const device = new HID.HID(controllerInfo.path);

// 3. Listen for Data
device.on("data", (data) => {
    /**
     * RAW DATA EXPLAINED:
     * 'data' is a Buffer (array of bytes).
     * When you press a button, one of these bytes changes.
     */
    
    // For most controllers, buttons start around byte 3 or 5
    // Let's check byte 3 for this example:
    const buttonByte = data[3]; 

    if (config.mappings[buttonByte]) {
        console.log(`Action: ${config.mappings[buttonByte]}`);
    } else if (buttonByte !== 0) {
        // This helps you find the ID to put in your JSON
        console.log(`Unknown button pressed. Byte 3 value is: ${buttonByte}`);
    }
});

device.on("error", (err) => {
    console.error("HID Error:", err);
});