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
- **/play/choreographer** is loaded in the background for conversation pacing. The HUD Bob Speed and Turn Pause sliders push their values into the choreographer's range controls in real time.

All five background playgrounds run as hidden iframes inside the main tone tab. A floating HUD injected into the page provides unified control over all of them without switching tabs.

**The hardware side:** two Hasbro Star Wars Black Series figures on a custom stage, six MG90S servos mounted beneath the deck, tendon lines routed up through the base to the joint hinges of each figure. An ESP32 running over USB serial receives positional commands from a local Python server and drives a PCA9685 PWM board to move all six channels.

---

## The Software Pieces — What Does What?

**`browser/vader_trooper.user.js`** — The browser script

This is a Tampermonkey userscript that lives inside Google Chrome. It drives the full embodied AI theatre loop:

- Waits for the AI to finish writing a response, then reads it out loud — Darth Vader with a deep male voice, the Stormtrooper with a sharper, distinct voice
- While each character speaks, animates that character’s head servo (Vader ch 0 bobs, Trooper ch 3 turns) and fires a dramatic arm-tendon raise at ~40% through the utterance
- Reads the six tone dials and the Temperature slider: dials shape voice rate and motor intervals; Temperature drives a physical noise engine that twitches servos at random intervals during silence
- Detects aggressive dialogue sentiment and injects emotional intensity modifiers into the /play/persona backstory in real time
- Monitors the /play/eval iframe’s scoring output and automatically lowers ENERGY and VERBOSITY dials if session quality drops below threshold
- Watches the /play/diff iframe for wildly divergent outputs and triggers a Stormtrooper head-pan and Vader arm-hold response
- Provides a floating HUD sidebar with sections for model selection, tone dials, persona, pacing, refusal threshold, evaluation, calibration, and iframe status

**`server/relay.py`** — The local data bridge

This is a small Python program that runs in the background the whole time the theatre is running. It:

- Opens a local WebSocket server so the browser script has somewhere to send commands
- Forwards servo commands (`S<ch>:<angle>`) down the USB cable to the ESP32
- Reads ACK responses echoed back by the ESP32 and logs them to the terminal
- Handles a full sweep test and a single-channel isolation test for Phase 3 wiring verification
- Handles session replay requests: reads `performance_logs.json` and sends the full log back to the browser
- Logs eval-feedback events when the eval AI score triggers automatic dial adjustments
- Has a built-in **`MOCK_MODE` flag** at the top of the file — when `True`, it prints simulated commands instead of opening a serial port, so you can run the full pipeline without hardware

**`firmware/esp32_servo_controller/esp32_servo_controller.ino`** — The motor firmware

This is the code that lives on the ESP32 microcontroller chip itself. It:

- Listens to the USB cable at 115200 baud for incoming `S<ch>:<angle>` commands
- Clamps each angle to per-servo soft limits (`SOFT_MIN_ANGLE` / `SOFT_MAX_ANGLE` arrays) before moving — edit these during Phase 4 calibration
- Tells the PCA9685 driver board to move the correct servo to the clamped angle
- Echoes `ACK:S<ch>:<applied_angle>` back over serial so relay.py can log the effective angle

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

Channels 0 and 3 animate automatically during speech — Vader's head bobs (ch 0) while he speaks, the Trooper's head turns (ch 3) while it speaks. Channels 2 and 5 also fire automatically mid-utterance as arm-tendon raises, then return to rest. Channels 1 and 4 (torso servos) follow the tone dial values.

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
[Vader/Trooper] Stream complete → The Emperor’s will shall be done…
[MOCK STREAM] Received from Browser: {"channel":0,"angle":100} -> Outbound: S0:100
[MOCK STREAM] Received from Browser: {"channel":0,"angle":80}  -> Outbound: S0:80
[MOCK STREAM] Received from Browser: {"channel":2,"angle":135} -> Outbound: S2:135
[MOCK STREAM] Received from Browser: {"channel":0,"angle":100} -> Outbound: S0:100
[telemetry] Turn 1 logged — speaker: vader — chars: 42
[Vader/Trooper] Stream complete → As you command, Lord Vader…
[MOCK STREAM] Received from Browser: {"channel":3,"angle":60}  -> Outbound: S3:60
[MOCK STREAM] Received from Browser: {"channel":3,"angle":120} -> Outbound: S3:120
[MOCK STREAM] Received from Browser: {"channel":5,"angle":135} -> Outbound: S5:135
[telemetry] Turn 2 logged — speaker: trooper — chars: 38
```

Vader’s head bobs (ch 0) while he speaks and the Trooper’s head turns (ch 3) while it speaks. Both arm servos raise (ch 2, ch 5) mid-utterance. Telemetry is written to `server/performance_logs.json` after each turn.

---

## When the Hardware Is Ready

### Phase 3 — Wiring and first-power verification

1. Open `server/relay.py` and change `MOCK_MODE: bool = True` to `MOCK_MODE: bool = False`
2. The relay auto-detects the ESP32’s COM port — or set `SERIAL_PORT = "COM3"` manually if needed
3. Power up the 5 V / 3 A wall adapter to the PCA9685 V+ rail **before** plugging in the ESP32
4. In Chrome, open the HUD **CALIBRATION** panel. Select each channel in the dropdown and click **▶ Test CH** one by one — watch the servo move to confirm the wire is connected to the right channel
5. Click **⚙ Sweep All Channels** as a final full-wiring check. The relay terminal prints `ch0 → 90°` etc., and the ESP32 echoes `ACK:S0:90` for every command so you can see both ends of the pipeline are working

### Phase 4 — Calibration

1. Select a channel in the CALIBRATION dropdown and drag the **Angle** slider slowly toward one extreme until the figure’s joint reaches its physical stop
2. Note the angle value shown, then click **↓ Set Min** or **↑ Set Max** — the limits display shows the suggested firmware values for that channel
3. Open `firmware/esp32_servo_controller/esp32_servo_controller.ino`, update `SOFT_MIN_ANGLE[ch]` and `SOFT_MAX_ANGLE[ch]` for the channel, and reflash
4. Repeat for all 6 channels
5. Start the autonomous loop and let it run uninterrupted for 10+ minutes to confirm stable operation before any live demonstration

---

## Full Technical Reference

For the complete architectural blueprint — wiring diagrams, servo calibration values, the data pipeline spec, and the development roadmap — see **`MASTER_PLAN.md`** in this folder.
