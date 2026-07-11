# MASTER PLAN
## Wall-E & EVE — Autonomous Physical-Digital AI Theatre
### Architectural Blueprint & Source of Truth

---

## 1. Overall Vision

We are building an autonomous, closed-loop, physical-digital AI theatre that runs on a desktop. The project breaks the glass screen of traditional AI chatbots by giving two digital personas — Wall-E and EVE — physical forms, voices, and coordinated bodily gestures.

The two characters engage in real-time, hands-free spoken debates. The text output of one agent automatically becomes the prompt for the other, creating a self-sustaining conversational loop. The entire pipeline — from language model output, to synthesized speech, to servo-driven physical movement — runs without human intervention once started.

**Core design principles:**

- Every layer of the system (web, Python, firmware) must be as low-latency as possible
- Hardware mechanics are hidden; only natural-looking motion is visible
- The loop must be recoverable — if any single component fails, the others keep running

---

## 2. Toy Specifications & Scale

| Property | Wall-E (Character A) | EVE (Character B) |
|---|---|---|
| Manufacturer | Mattel Disney-Pixar | Mattel Disney-Pixar |
| Height | ~3.5 inches | ~4.25 inches |
| Width | ~3.0 inches | ~2.5 inches |
| Depth | ~3.0 inches | ~2.0 inches |
| Frame type | Pre-molded loose ball joints | Hollow egg-shaped capsule |
| Tendon routing | Through joint gaps and base holes | Through hollow interior and base holes |

**Key mechanical implication:** Wall-E's pre-molded ball joints give natural pivot points for tendon attachment. EVE's hollow capsule shell provides a clean internal channel for routing fishing line from the servo arm to her limbs with no visible hardware.

---

## 3. Mechanical Movement Strategy — 6-Servo Design

To achieve lifelike body expression without adding excessive weight inside the toy frames, physical movement is split across six independent MG90S micro servos mounted beneath the stage deck. All servos are driven by a single PCA9685 PWM board.

### Channel Assignment

| Channel | Character | Joint | Gesture |
|---|---|---|---|
| 0 | Wall-E | Head | Up/down bobbing — creates syllable speech illusion |
| 1 | Wall-E | Waist | Left/right twist — full torso rotation |
| 2 | Wall-E | Arm | Tendon pull — lifts arm for emphasis |
| 3 | EVE | Head | Side tilt — attentive listening and reaction |
| 4 | EVE | Body | Forward/back lean — body-lean engagement mechanism |
| 5 | EVE | Arm | Tendon pull — actuates arm for gesture |

### Tendon Mechanics

Servo channels 2 and 5 use a hidden tendon system rather than a rigid linkage:

- Clear nylon fishing line is tied directly to the target limb
- The line is routed invisibly down through the hollow toy body
- The line passes through a small drilled hole in the underside of the display stage base
- The other end is anchored to the servo motor arm hidden beneath the stage deck
- When the servo rotates, it winds or releases the line, lifting or lowering the limb
- A return spring or gravity resets the limb when tension is released

This approach keeps all hardware completely out of sight and adds no visible mass to the figures.

---

## 4. Embodied Speech & Interactive Conversation Loop

### Stage 1 — Real-Time Text Generation Hook

The userscript does not track mouse clicks or raw slider positions to trigger speech. Instead, it deploys a `MutationObserver` targeted directly at the generation output box at the bottom of the shape-models.com playground. The observer fires the exact millisecond new tokens begin streaming onto the screen after the **Run with this tone** button is pressed.

A debounce timer (850 ms) resets on every incoming chunk. When the page goes quiet for 850 ms — meaning the stream has genuinely ended and not merely paused — the full text block is extracted, stripped of UI chrome (model name, "IDLE" label, "OUTPUT" heading), and passed downstream as a clean prose string.

### Stage 2 — Web Speech Text-to-Speech

The cleaned text string is immediately handed to the browser's native `window.speechSynthesis` API — no external service, no API key, no network round-trip. A local US-English voice is selected automatically.

Two dial parameters shape the utterance in real time before each sentence is spoken:

| Dial | Voice effect | Range |
|---|---|---|
| ENERGY | Speech rate | 0.75 (slow) → 1.40 (rapid) |
| WARMTH | Pitch | 0.85 (low) → 1.15 (warm) |

The interaction operates as a **closed-loop automated theatre**. When the active utterance fires its `onend` event, the userscript copies the completed text block, programmatically inputs it into the opposing character's prompt window, and triggers the next generation phase. The debate alternates between Wall-E and EVE indefinitely without any manual user action.

### Stage 3 — Syllable-Synchronized Mechanical Bursts

Physical movement is dynamically coupled to active speech synthesis. The moment `utterance.onstart` fires, a high-frequency animation loop begins inside the userscript. On every tick it sends an oscillating positional command to `ws://localhost:8765` on **Channel 0** (Wall-E's head servo), alternating between **100°** and **80°** around the 90° neutral center.

The tick interval is computed from the live ENERGY and VERBOSITY dial values:

```
driver = (ENERGY + VERBOSITY) / 2        // 0-100
interval_ms = 200 - (driver / 100) × 150  // 200 ms (slow) → 50 ms (fast)
```

The moment `utterance.onend` fires, `clearInterval` terminates the loop instantly and a final `S0:90` command snaps Wall-E's head back to the neutral resting position. No servo motion persists between spoken turns.

### Conversation Handoff Flow

```
[shape-models.com generates text]
    ↓  MutationObserver fires on output box
    ↓  850 ms debounce confirms stream end
    ↓  text stripped of UI labels
    ↓
[window.speechSynthesis.speak(utterance)]
    ↓  utterance.onstart  → setInterval head-bob loop starts (ch 0)
    ↓  utterance.onend   → clearInterval, S0:90 sent, head returns to rest
    ↓
[userscript copies text → pastes into opposing character's prompt]
    ↓  triggers next generation phase
    ↓
[loop repeats indefinitely]
```

---

## 5. Multimodal Dial Modifiers

### The Temperature Slider Is Explicitly Ignored

The shape-models.com playground has a **Temperature** slider at the top of the page above the six tone dials. The userscript's DOM scoping logic (`getToneDialsSection`) finds the tightest container that holds only the six named dials. The Temperature slider lives outside this section and is structurally unreachable. An additional hard-exclusion guard inside `findDialName` returns `null` the moment the word "TEMPERATURE" appears in any ancestor within 4 DOM levels of a slider element.

### The Six Dials as Global Performance Modifiers

The six tone dials do **not** directly command individual servo positions in real time. They function as persistent parameter stores that shape the character's physical and vocal performance. Every time a dial moves, two things happen:

1. The raw slider value is normalized to a **0–100 integer** and stored in the script's live `dialValues` state object.
2. The equivalent servo angle (0–180°) is forwarded to `relay.py` so the physical limb reflects the dial's approximate position.

The stored 0–100 values are then read continuously by the speech engine and the animation loop:

| Dial | Servo channel | Normalized value drives |
|---|---|---|
| WARMTH | ch 0 Wall-E head | Voice pitch (0.85 → 1.15) |
| VERBOSITY | ch 1 Wall-E waist | Head-bob animation density (contributes 50 % to tick interval) |
| ENERGY | ch 2 Wall-E arm | Speech rate (0.75 → 1.40) + head-bob speed (contributes 50 % to tick interval) |
| DIRECTNESS | ch 3 EVE head | Language sharpness (affects language model prompt) |
| CONCRETENESS | ch 4 EVE body | Specificity of AI output (affects language model prompt) |
| STRUCTURE | ch 5 EVE arm | Prose vs. formatted output (affects language model prompt) |

### Energy and Verbosity as Animation Speed Controllers

The head-bob tick interval is the primary mechanical performance variable driven by dials:

```
driver       = (dialValues.ENERGY + dialValues.VERBOSITY) / 2
interval_ms  = 200 − (driver / 100) × 150
```

- **ENERGY = 100, VERBOSITY = 100** → driver = 100 → interval = **50 ms** (20 sharp nods/sec)
- **ENERGY = 0,   VERBOSITY = 0**   → driver = 0   → interval = **200 ms** (5 slow nods/sec)
- **Mixed values** land proportionally between those extremes

This means a high-energy, high-verbosity scene produces rapid, staccato mechanical bursts. A low-energy, calm scene produces slow, deliberate nods that match the languid speech rate.

### Unified Control Dashboard

A local HTML file runs in the ThinkPad browser alongside the shape-models.com tabs. It provides:

- Global system prompt sliders for both characters on one screen
- Live override of any individual tone parameter mid-session
- A master pause/resume button that halts the conversation handoff loop
- Connection status indicators for the WebSocket relay and serial port

---

## 6. Hardware Infrastructure

### Component Overview

| Component | Part | Role |
|---|---|---|
| Microcontroller | ESP32 Type-C development board | Receives serial commands, drives PCA9685 via I2C |
| PWM driver | PCA9685 16-channel board | Converts I2C commands to 50 Hz PWM signals for all 6 servos |
| Servos (×6) | MG90S micro servo | Physical actuation of joints and tendons |
| Host computer | Lenovo ThinkPad | Runs relay.py, browser userscripts, and HTML dashboard |
| Servo power supply | 5 V / 3 A wall adapter | Dedicated power rail for all servo current draw |

### Wiring Diagram

```
ThinkPad (USB)
    │
    └── ESP32 (GPIO 21 SDA, GPIO 22 SCL)
            │
            └── PCA9685
                    │
                    ├── CH 0 ── Wall-E head bob servo
                    ├── CH 1 ── Wall-E waist twist servo
                    ├── CH 2 ── Wall-E arm tendon servo
                    ├── CH 3 ── EVE head tilt servo
                    ├── CH 4 ── EVE body lean servo
                    └── CH 5 ── EVE arm tendon servo

5V/3A Wall Adapter ── PCA9685 V+ power rail (isolated from ThinkPad logic)
```

### Power Isolation

The 5 V / 3 A wall adapter feeds **only the PCA9685 V+ terminal rail**. The six MG90S servos draw their operating current entirely from this external supply. The ThinkPad USB port provides logic power to the ESP32 only — no servo current passes through the USB bus. All grounds (ESP32 GND, PCA9685 GND, and wall adapter GND) are connected at a single shared ground point.

### Communication Stack

| Layer | Protocol | Baud / Port | Direction |
|---|---|---|---|
| Browser → Python | WebSocket | `ws://localhost:8765` | Browser userscript → relay.py |
| Python → ESP32 | USB Serial | 115200 baud | relay.py → ESP32 |
| ESP32 → PCA9685 | I2C | 400 kHz (fast mode) | ESP32 → PCA9685 |
| PCA9685 → Servos | PWM | 50 Hz | PCA9685 → MG90S ×6 |

### Serial Command Format

```
S<channel>:<angle>\n

Examples:
  S0:90    →  Wall-E head to center
  S0:110   →  Wall-E head nod forward
  S3:60    →  EVE head tilt left
  S5:135   →  EVE arm raise
```

Angles are clamped to 0–180°. Only channels 0–5 are accepted by the firmware. All other channels are silently ignored.

---

## 7. File & Folder Structure

```
RobotProject/
│
├── README.md                           ← quick-start guide
├── MASTER_PLAN.md                      ← architectural blueprint (this file)
├── .gitignore
│
├── browser/
│   └── wall_e_eve.user.js              ← Tampermonkey userscript for shape-models.com
│
├── server/
│   └── relay.py                        ← Python WebSocket server + serial relay
│
└── firmware/
    └── esp32_servo_controller/
        └── esp32_servo_controller.ino  ← Arduino firmware for ESP32 + PCA9685
```

### Planned additions (not yet created)

```
RobotProject/
│
├── dashboard/
│   └── index.html                      ← Local HTML master control board
│
└── docs/
    └── wiring_photos/                  ← Reference images for physical assembly
```

---

## 8. Development Checklist

### Phase 1 — Digital Pipeline (software only)
- [x] `relay.py` — WebSocket server receives dial data, forwards to ESP32 via serial
- [x] `esp32_servo_controller.ino` — ESP32 firmware parses `S<ch>:<angle>` commands
- [x] `wall_e_eve.user.js` — Tampermonkey userscript binds to tone dials on shape-models.com

### Phase 2 — Speech & Loop (browser automation)
- [x] Web Speech API voice synthesis integrated into userscript
- [x] Syllable-synchronized head-bob loop (ENERGY + VERBOSITY scaled interval, ch 0)
- [x] MutationObserver output-stream detection with 850 ms debounce
- [x] Dial values normalized to 0-100 and stored as live speech/animation parameters
- [ ] Automatic conversation handoff between Wall-E and EVE tabs (next milestone)

### Phase 3 — Physical Build (hardware)
- [ ] Stage base constructed with servo mounting positions
- [ ] Tendon lines routed through both toy bodies
- [ ] All 6 servos wired to PCA9685 and tested independently
- [ ] Power supply isolated and verified safe

### Phase 4 — Integration & Calibration
- [ ] Per-servo angle limits tuned to physical stop points of each figure
- [ ] Tone dial → servo speed mapping calibrated
- [ ] Full autonomous loop tested for 10+ minutes without intervention

### Phase 5 — Master Control Dashboard
- [ ] Local HTML dashboard built and tested
- [ ] Global prompt controls wired to relay.py API
- [ ] Live override verified during active conversation loop

---

*Last updated: 2026-07-10 — Sections 4 & 5 revised to reflect automated text-driven pipeline (v2.0.0 userscript)*
