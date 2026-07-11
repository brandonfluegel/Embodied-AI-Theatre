# Wall-E & EVE — Physical AI Theatre

Two Mattel action figures sit on a desk. They talk to each other, argue, agree, and move their bodies while they do it — all driven automatically by a live AI website with no human touching anything once it starts.

This project connects the text generation playground at [shape-models.com/play/tone](https://www.shape-models.com/play/tone) to a pair of real servo motors hidden inside and beneath the toys. When the AI finishes writing a sentence, a browser script reads it out loud through the computer speakers and simultaneously fires rapid movement signals to the motors so Wall-E bobs his head in sync with every word spoken.

---

## The Software Pieces — What Does What?

**`browser/wall_e_eve.user.js`** — The browser script

This is a Tampermonkey userscript that lives inside Google Chrome. It watches the AI website in the background and does three things at once:

- Waits for the AI to finish writing a response, then reads the completed text out loud through the computer speakers using the browser's built-in voice engine
- While the voice is speaking, sends a rapid stream of movement signals to the local Python server so Wall-E's head bobs in time with the speech
- Reads the six tone dials on the page (WARMTH, VERBOSITY, ENERGY, DIRECTNESS, CONCRETENESS, STRUCTURE) to shape how fast the voice speaks and how sharply the motors move

**`server/relay.py`** — The local data bridge

This is a small Python program that runs quietly in your terminal the whole time the theatre is running. It:

- Opens a local WebSocket server on your machine so the browser script has somewhere to send its signals
- Picks those signals up and immediately forwards them down the USB cable to the ESP32 chip
- Has a built-in **`MOCK_MODE` flag** at the top of the file — when set to `True`, it prints the simulated motor data to your terminal instead of looking for real hardware, so you can test everything without any physical parts connected

**`firmware/esp32_servo_controller/esp32_servo_controller.ino`** — The motor firmware

This is the code that lives on the ESP32 microcontroller chip itself. It:

- Listens to the USB cable at 115200 baud for incoming commands
- Reads each command (formatted as `S0:90`, `S3:45`, and so on)
- Tells the PCA9685 driver board to move the correct motor to the correct angle, instantly

---

## Motor Channel Map

| Channel | Toy | Body Part | Notes |
|---|---|---|---|
| 0 | Wall-E | Head bob | Animates automatically while Wall-E is speaking |
| 1 | Wall-E | Waist twist | Rotates the full torso left and right |
| 2 | Wall-E | Arm lift | Tendon-pulled — raises arm for emphasis |
| 3 | EVE | Head tilt | Tips her head side to side |
| 4 | EVE | Body lean | Forward and back lean |
| 5 | EVE | Arm lift | Tendon-pulled — raises arm for gesture |

Channels 0 and 4 are driven automatically by the speech animation loop. Channels 1–3 and 5 are driven by the tone dial values from the webpage.

---

## Getting Started — Test It Right Now (No Hardware Needed)

You can run the full pipeline today using mock mode. No ESP32, no motors, no wiring required. You just need Chrome and Python.

**Step 1 — Install the browser script**

- Install the [Tampermonkey](https://www.tampermonkey.net/) extension in Google Chrome
- Click the Tampermonkey icon in your toolbar and choose **Create a new script**
- Delete all the placeholder code in the editor
- Open `browser/wall_e_eve.user.js`, copy the entire contents, and paste it in
- Press **Ctrl+S** to save — Tampermonkey will confirm the script is active

**Step 2 — Start the local server**

- Open the terminal in VS Code (`Terminal → New Terminal` from the menu bar)
- Run this command and leave it running in the background:

```
python server/relay.py
```

You should see:

```
[relay] MOCK MODE — no serial hardware required.
[ws] Listening on ws://localhost:8765  (Ctrl+C to stop)
```

**Step 3 — Open the AI playground**

- In Chrome, go to **https://www.shape-models.com/play/tone**
- Confirm the Tampermonkey icon shows the script as **enabled** on this page (the icon will show a number badge)
- The VS Code terminal should print `[Wall-E/EVE] Relay connected.` within a second or two

**Step 4 — Trigger a response and watch it run**

- On the webpage, type anything into the user message box (or use the default prompt already there)
- Click the black **Run with this tone** button
- **Listen** — your computer speakers should start reading the AI's response out loud
- **Watch the terminal** — you will see a live stream of simulated motor commands like this:

```
[Wall-E/EVE] Stream complete → Welcome to the app! This is your first step…
[MOCK STREAM] Received from Browser: {"channel":0,"angle":100} -> Outbound: S0:100
[MOCK STREAM] Received from Browser: {"channel":0,"angle":80}  -> Outbound: S0:80
[MOCK STREAM] Received from Browser: {"channel":0,"angle":100} -> Outbound: S0:100
```

Those lines are exactly what would be sent to the physical motors in real life. The faster Wall-E is speaking, the faster those lines scroll.

---

## When the Hardware Is Ready

When the ESP32 and servos are wired up and plugged in:

1. Open `server/relay.py` and change line `MOCK_MODE: bool = True` to `MOCK_MODE: bool = False`
2. The script will auto-detect the COM port the ESP32 is on
3. If auto-detection picks the wrong port, set `SERIAL_PORT = "COM3"` (or whichever port yours uses) at the top of the file
4. Everything else stays the same — the browser script and the Arduino firmware do not need any changes

---

## Full Technical Reference

For the complete architectural blueprint — wiring diagrams, servo calibration values, the data pipeline spec, and the development roadmap — see **`MASTER_PLAN.md`** in this folder.
