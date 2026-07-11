# Embodied AI Theatre -- Featuring Darth Vader & Stormtrooper

A personal project by **Brandon Fluegel**, human factors researcher.

**The research question:** Does giving an AI a physical body change how people experience it? Screen-based AI is perceived as a tool. An AI that occupies shared physical space, moves while it speaks, and reacts with its body to what another character just said reads differently to observers. This project is a working prototype to study that difference firsthand.

**How shape-models.com is being used:**

shape-models.com is an AI behavior design platform built around a set of interactive playgrounds. This project treats it as the full generative backbone of a two-character debate system and drives all six of its playgrounds simultaneously from a single browser tab:

- **/play/tone** is the main control surface. Six dials (Warmth, Verbosity, Energy, Directness, Concreteness, Structure) are read continuously. Each dial value shapes AI language output, adjusts the voice synthesis parameters, and controls the speed and character of the servo movements in real time.
- **/play/persona** is used to define each character's identity, backstory, and voice. Darth Vader and the Stormtrooper are configured as distinct AI personas that maintain consistent speech patterns across the debate.
- **/play/refusal** handles content boundaries. When a refusal phrase is detected in the output stream, the script cancels speech and moves both figures into a defined defensive posture rather than continuing.
- **/play/diff** provides side-by-side prompt comparison to test how parameter changes affect output quality and character consistency.
- **/play/eval** receives the session telemetry log after each run for automated scoring of the dialogue.
- **/play/choreographer** is loaded in the background for future pacing and turn-taking configuration.

All five background playgrounds run as hidden iframes inside the main tone tab. A floating HUD injected into the page provides unified control over all of them without switching tabs.

**The hardware side:** two Hasbro Star Wars Black Series figures on a custom stage, six MG90S servos mounted beneath the deck, tendon lines routed up through the base to the joint hinges of each figure. An ESP32 running over USB serial receives positional commands from a local Python server and drives a PCA9685 PWM board to move all six channels.

---

## The Software Pieces — What Does What?

**`browser/vader_trooper.user.js`** — The browser script

This is a Tampermonkey userscript that lives inside Google Chrome. It watches the AI website in the background and does three things at once:

- Waits for the AI to finish writing a response, then reads the completed text out loud through the computer speakers using the browser's built-in voice engine
- While the voice is speaking, sends a rapid stream of movement signals to the local Python server so Darth Vader's head bobs in time with the speech
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
| 0 | Darth Vader | Head move | Animates automatically while Darth Vader is speaking |
| 1 | Darth Vader | Torso twist | Rotates the full torso left and right |
| 2 | Darth Vader | Arm gesture | Tendon-pulled — raises arm for dramatic emphasis |
| 3 | Stormtrooper | Head turn | Side-to-side reaction and listening |
| 4 | Stormtrooper | Torso lean | Forward and back engagement lean |
| 5 | Stormtrooper | Arm gesture | Tendon-pulled — blaster hand raise or pointing motion |

Channels 0 and 4 are driven automatically by the speech animation loop. Channels 1–3 and 5 are driven by the tone dial values from the webpage.

---

## Getting Started — Test It Right Now (No Hardware Needed)

You can run the full pipeline today using mock mode. No ESP32, no motors, no wiring required. You just need Chrome and Python.

**Step 1 — Install the browser script**

- Install the [Tampermonkey](https://www.tampermonkey.net/) extension in Google Chrome
- Click the Tampermonkey icon in your toolbar and choose **Create a new script**
- Delete all the placeholder code in the editor
- Open `browser/vader_trooper.user.js`, copy the entire contents, and paste it in
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
- The VS Code terminal should print `[Vader/Trooper] Relay connected.` within a second or two

**Step 4 — Trigger a response and watch it run**

- On the webpage, type anything into the user message box (or use the default prompt already there)
- Click the black **Run with this tone** button
- **Listen** — your computer speakers should start reading the AI's response out loud
- **Watch the terminal** — you will see a live stream of simulated motor commands like this:

```
[Vader/Trooper] Stream complete → The Emperor's will shall be done…
[MOCK STREAM] Received from Browser: {"channel":0,"angle":100} -> Outbound: S0:100
[MOCK STREAM] Received from Browser: {"channel":0,"angle":80}  -> Outbound: S0:80
[MOCK STREAM] Received from Browser: {"channel":0,"angle":100} -> Outbound: S0:100
```

Those lines are exactly what would be sent to the physical motors in real life. The faster Darth Vader is speaking, the faster those lines scroll.

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
