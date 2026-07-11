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

### Autonomous Orchestration

A Tampermonkey browser userscript runs continuously on the shape-models.com tone playground. It manages the full turn-taking loop without any manual input:

1. Wall-E's AI tab finishes streaming a text response
2. The userscript reads the completed text and passes it to the browser's built-in Web Speech API
3. Wall-E's voice plays aloud through the ThinkPad speakers
4. While audio plays, the userscript streams high-frequency servo commands to create speech-synchronized head motion
5. When Wall-E finishes speaking, the userscript automatically copies his response text
6. It pastes that text into EVE's input field and triggers her reply
7. EVE streams her response, speaks, moves, and hands the conversation back to Wall-E
8. The cycle repeats indefinitely

### Cadence Bobbing

While a character is speaking, the userscript sends positional updates to `ws://localhost:8765` every **30 milliseconds**. These micro-adjustments oscillate the head servo between a small positive and negative offset around a center angle, creating a natural nodding rhythm that mimics syllable stress. The oscillation amplitude and speed are controlled by the active tone dial values.

### Conversation Handoff Summary

```
Wall-E speaks → head bobs → speech ends
    → userscript copies Wall-E's text
    → pastes into EVE's input → EVE generates reply
    → EVE speaks → head tilts → speech ends
    → userscript copies EVE's text
    → pastes into Wall-E's input → loop repeats
```

---

## 5. Dynamic Tone Dials & Hybrid Master Control

### The Six Tone Parameters

The shape-models.com tone playground exposes six dial parameters that the system reads and acts on simultaneously. Each parameter affects language output, voice output, and servo behavior at the same time.

| Dial | Character mapped | Effect on language | Effect on voice | Effect on servos |
|---|---|---|---|---|
| WARMTH | Wall-E ch 0 | Warmer, more personal phrasing | Softer, slower delivery | Slower, rounder head bobs |
| VERBOSITY | Wall-E ch 1 | Longer or shorter responses | Longer or shorter pauses | Wider or tighter waist twist range |
| ENERGY | Wall-E ch 2 | More exclamatory vs. composed | Faster rate, higher pitch | High-frequency micro-jitters on arm |
| DIRECTNESS | EVE ch 3 | Blunt vs. hedged statements | More clipped cadence | Sharper, faster head tilts |
| CONCRETENESS | EVE ch 4 | Abstract vs. specific examples | Even, measured delivery | Slow, smooth body-lean transitions |
| STRUCTURE | EVE ch 5 | Flowing prose vs. bullet-point | Longer sentence rhythm | Sustained arm hold vs. quick retract |

### Multimodal Translation Logic

- **High urgency / high energy:** spoken audio rate increases, micro-jitter commands fire at maximum frequency, servo transitions use hard linear interpolation
- **Low urgency / low warmth:** voice drops to a slower cadence, servo commands use a low-pass filter so transitions are gradual and smooth

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
├── MASTER_PLAN.md                   ← this file
│
├── relay.py                         ← Python WebSocket server + serial relay
│
├── wall_e_eve.user.js               ← Tampermonkey userscript for shape-models.com
│
└── esp32_servo_controller/
    └── esp32_servo_controller.ino   ← Arduino firmware for ESP32 + PCA9685
```

### Planned additions (not yet created)

```
RobotProject/
│
├── dashboard/
│   └── index.html                   ← Local HTML master control board
│
└── docs/
    └── wiring_photos/               ← Reference images for physical assembly
```

---

## 8. Development Checklist

### Phase 1 — Digital Pipeline (software only)
- [x] `relay.py` — WebSocket server receives dial data, forwards to ESP32 via serial
- [x] `esp32_servo_controller.ino` — ESP32 firmware parses `S<ch>:<angle>` commands
- [x] `wall_e_eve.user.js` — Tampermonkey userscript binds to tone dials on shape-models.com

### Phase 2 — Speech & Loop (browser automation)
- [ ] Web Speech API voice synthesis integrated into userscript
- [ ] Cadence bobbing (30 ms servo pulse loop during speech playback)
- [ ] Automatic conversation handoff between Wall-E and EVE tabs

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

*Last updated: 2026-07-10*
