# Logitech F710 Gamepad Support for CNCjs
The intent of this NodeJS project is to interface the Logitech F710 Wireless Gamepad with CNCjs as a pendant (physical interface for homing, jogging, tool-changing operations, etc.)

## Controller Support
Only GRBL is supported at the moment.

## Gamepad Support
- Logitech F710 Gamepad
- DualShock 3 (PlayStation 3 Controller) [**WIP**]

## Button Map
[Button Mapping Image **WIP**]

**CNC Controller Key Mappings**
| Key / Axis | Command / Function |
| :--- | :--- |
| **X** | Tool Change |
| **A** | Zero Work Coordinate System (WCS) |
| **B** | Controller Reset |
| **Y** | Move to Zero WCS |
| **L1** | Spindle ON |
| **R1** | Spindle OFF |
| **L2** | Decrease Step Size |
| **R2** | Increase Step Size |
| **BACK** | Perform Homing |
| **START** | Program Start |
| **LEFT JS Y MINUS (Inverted)** | Move Z+ (Up) |
| **LEFT JS Y PLUS (Inverted)** | Move Z- (Down) |
| **RIGHT JS X MINUS** | Move X- (Left) |
| **RIGHT JS X PLUS** | Move X+ (Right) |
| **RIGHT JS Y MINUS (Inverted)** | Move Y- (Forward/Away) |
| **RIGHT JS Y PLUS (Inverted)** | Move Y+ (Backward/Toward) |

## Gamepad Setup
The Logitech F710 has an included USB dongle. It should be Plug-N-Play.

### Connection Test
Run:
```
ls /dev/input
```
You should see `js0` listed.

### Debugging Button/Axis Mappings
Run:
```
# Install
sudo apt-get -y install joystick

# Joystick Test
jstest /dev/input/js0
```
This application provides a live output of the gamepad's buttons, joysticks, and hat buttons (D-Pad). Use `Ctrl-C` to exit the application

These numbers map to the cncjs-pendant-gamepad-redux application via the `ButtonMapping.json` file.

## Installation
cd ~/ && git clone https://github.com/wrcrooks/cncjs-pendant-gamepad-redux.git && cd cncjs-pendant-gamepad-redux

## Running the Application
The program accepts several optional arguments. Too see all options run:
```
sudo node app.js --help
```

### Typical Arguments
- **--url** This is the WebSocket URL of the CNCjs instance, in the format of `ws://[IP]:[PORT]`
- **--port** This is the port of the CNC machine, as the CNCjs instance sees it; Can be verified by looking in the 'Port' drop-down under the 'Connection' widget within the CNCjs web interface
- **--secret** If the CNCjs configuration does not exist at `/root/.cncrc` and `app.js` is being run via `sudo`, be sure to pass through the CNCjs secret via the `--secret '<secret>'` argument. The app will try to automatically load the secret via that file, but it needs to be in that specific location.

Example:
```
sudo node app.js --url ws://127.0.0.1:80 --port /dev/ttyACM0 --secret '<secret from .cncrc file>'
```

## Configure as a Service
Commands:
```
sudo touch /etc/systemd/system/cncjs-pendant-gamepad-redux.service
sudo chmod 664 /etc/systemd/system/cncjs-pendant-gamepad-redux.service
sudo nano /etc/systemd/system/cncjs-pendant-gamepad-redux.service
```
Place the Following in `/etc/systemd/system/cncjs-pendant-gamepad-redux.service`. Be sure to modify the `ExecStart=` line to fit your use case (app.js file location and CNCjs secret, if necessary)
```
[Unit]
Description=CNCjs Gamepad Pendant Redux
After=network-online.target

[Service]
ExecStart=$(which node) /home/<user>/cncjs-pendant-gamepad-redux/app.js --url ws://127.0.0.1:80 --port /dev/ttyACM0 --secret '<secret>'
Restart=always

[Install]
WantedBy=multi-user.target
```
`Ctrl-C`, `y` key, `ENTER` key