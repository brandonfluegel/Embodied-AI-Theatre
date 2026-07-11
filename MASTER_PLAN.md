# MASTER PLAN
## Wall-E & EVE — Autonomous Physical-Digital AI Theatre
### Architectural Blueprint & Source of Truth
### Current Version: v3.0.0 — Single-Tab Matrix Interface

---

## 1. Overall Vision

We are building an autonomous, closed-loop, physical-digital AI theatre that runs on a desktop. The project breaks the glass screen of traditional AI chatbots by giving two digital personas — Wall-E and EVE — physical forms, voices, and coordinated bodily gestures.

The two characters engage in real-time, hands-free spoken debates. The text output of one agent automatically becomes the prompt for the other, creating a self-sustaining conversational loop. The entire pipeline — from language model output, to synthesized speech, to servo-driven physical movement — runs without human intervention once started.

**Core design principles:**

- Every layer of the system (web, Python, firmware) must be as low-latency as possible
- Hardware mechanics are hidden; only natural-looking motion is visible
- The loop must be recoverable — if any single component fails, the others keep running
- All six shape-models.com playgrounds are driven from one browser tab through a same-origin hidden iframe matrix

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

### Stage 4 — Dramatic Refusal Triggers

The /play/refusal playground lets you define boundary phrases — words or patterns the AI should refuse to engage with. When the MutationObserver detects one of these patterns in the streaming output, the script does not continue the normal speech-and-animation flow. Instead it executes a defensive interrupt sequence:

1. The running `speechSynthesis` utterance is immediately cancelled
2. All servo animation intervals are cleared
3. A defensive posture command sequence fires over the WebSocket:
   - Channel 0 drops to 60° — Wall-E bows his head down
   - Channel 3 tilts to 120° — EVE turns her head away
4. Both postures hold until the user resumes the session or a configurable timeout clears them

This gives the live performance a visually dramatic physical reaction to sensitive content, reinforcing the character boundaries in a way the audience can see and feel.

### Stage 5 — Telemetry & Performance Logging

Every completed spoken turn is written to `server/performance_logs.json` by the Python relay server. Each log entry records:

| Field | Description |
|---|---|
| `timestamp` | ISO 8601 time of the completed turn |
| `speaker` | `"wall-e"` or `"eve"` |
| `text` | The full spoken text block |
| `char_count` | Character length of the text |
| `turn_number` | Sequential turn index in the current session |
| `dial_snapshot` | All six dial normalized values (0–100) at generation time |
| `speech_rate` | Computed `utterance.rate` value used for playback |

This log is designed to be dropped directly into the /play/eval iframe for automated quality scoring of the dialogue session.

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

### Unified Master HUD

The unified control interface is not a separate HTML file — it is injected directly into the `/play/tone` tab as a floating overlay sidebar. This means all controls live inside the same browser tab with direct JavaScript access to the page's own DOM.

The HUD is a fixed-position panel, 272 px wide, anchored to the right edge of the screen at the maximum CSS z-index. It collapses to a 34 px sliver via a toggle button so it never permanently blocks the page content.

| HUD Section | Function |
|---|---|
| Model Selection | Syncs the chosen AI model to all five background iframes simultaneously |
| Tone Dials | Six sliders mirroring the main page dials; changes push to main page AND all iframes |
| Persona | Wall-E and EVE name fields; pushes to the /play/persona iframe's NAME and ROLE inputs |
| Pacing | Bob speed and Turn pause sliders for future choreography timing control |
| Refusal Threshold | Slider targeted at the /play/refusal iframe's boundary configuration |
| Iframe Status | Live 🟢/🟡/🔴 indicator for each of the five background iframes |
| Sync All | Force-pushes all current HUD values to every ready iframe at once |
| Generate | Triggers the main page's Run button from the HUD without touching the keyboard |

---

## 6. Single-Tab Matrix Interface

### Same-Origin Hidden Iframe Architecture

All six shape-models.com playgrounds are loaded and controlled from inside the single `/play/tone` browser tab. Five `<iframe>` elements are appended to the page body and styled with `display:none; width:0; height:0;` so they are completely invisible and have zero impact on the visible page layout.

| iframe key | URL loaded | Purpose |
|---|---|---|
| `persona` | `/play/persona` | Character backstory, voice, and name definitions |
| `choreographer` | `/play/choreographer` | Conversation pacing and turn-taking rules |
| `refusal` | `/play/refusal` | Boundary phrase configuration and safety settings |
| `diff` | `/play/diff` | Side-by-side prompt comparison and A/B testing |
| `eval` | `/play/eval` | Automated quality scoring of completed dialogue sessions |

Because every URL shares the exact same origin (`shape-models.com`), the browser applies no CORS restrictions. JavaScript running in the parent `/play/tone` tab can freely read and write into each iframe's `contentDocument` and `contentWindow` as if they were part of the same page.

### Iframe Loading & React Hydration

The iframes load a full React application on each URL. After the HTML arrives and `iframe.onload` fires, a 2500 ms timer allows React to complete component mounting before the parent marks the iframe as ready. If the `contentDocument` is inaccessible when the timer fires (for example if the page returns a 404 or sends an X-Frame-Options header), the iframe is marked as Blocked and shown with a red indicator in the HUD.

### HUD Status Feed

Every iframe has a live status row in the Master HUD:

- 🟡 Loading — iframe has been appended but has not finished loading
- 🟢 Ready — React has hydrated and the DOM can be driven by the parent
- 🔴 Blocked — the page returned an error or refused iframe embedding

---

## 7. React-Compatible DOM Mirroring

### Why Direct Value Assignment Fails

shape-models.com is a React application. React manages input values through its internal fiber state tree, not through the native DOM `value` property. When external code sets `input.value = 'x'` directly, the DOM updates but React's state engine does not fire a change, so the prompt system ignores the new value entirely.

### The Native Prototype Setter Technique

The correct way to update a React-controlled input from outside is a two-step process:

1. **Call the native prototype setter** — retrieve `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` and invoke it on the element. This bypasses React's property interception and marks the element as dirty at the browser engine level.
2. **Fire a real DOM event** — dispatch a native `new Event('input', { bubbles: true })` on the element. This travels through the same event delegation path React registered and triggers the state update.

**Critical detail:** The prototype setter must come from the element's **own window object**, not from the parent tab's window. Iframes running a React app each have their own `HTMLInputElement.prototype` instance. Using the parent's prototype setter on an iframe's element silently fails in Chromium because the ownership check on the internal slot does not match. The `setReactValue(el, value, frameWin)` helper accepts the iframe's `contentWindow` specifically to handle this.

### Sync Cascade

Every value change on the Master HUD triggers a three-level cascade:

```
HUD slider moves
    ↓  pushDialToMainPage()     — updates the native slider on /play/tone
    ↓  syncDialInDoc() × 5      — updates matching sliders in each ready iframe
    ↓  sendServo()              — sends S<ch>:<angle> to relay.py over WebSocket
```

Model selection and persona field changes follow the same pattern, targeting `<select>` / `[role="combobox"]` elements and `<input type="text">` elements respectively.

---

## 8. Hardware Infrastructure

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

## 9. File & Folder Structure

```
RobotProject/
│
├── README.md                           ← quick-start guide
├── MASTER_PLAN.md                      ← architectural blueprint (this file)
├── .gitignore
│
├── browser/
│   └── wall_e_eve.user.js              ← v3.0.0 unified matrix userscript
│
├── server/
│   ├── relay.py                        ← Python WebSocket server + serial relay
│   └── performance_logs.json           ← auto-generated telemetry (gitignored)
│
└── firmware/
    └── esp32_servo_controller/
        └── esp32_servo_controller.ino  ← Arduino firmware for ESP32 + PCA9685
```

### Planned additions (not yet created)

```
RobotProject/
│
└── docs/
    └── wiring_photos/                  ← Reference images for physical assembly
```

---

## 10. Development Checklist

### Phase 1 — Digital Pipeline (software only)
- [x] `relay.py` — WebSocket server receives dial data, forwards to ESP32 via serial
- [x] `esp32_servo_controller.ino` — ESP32 firmware parses `S<ch>:<angle>` commands
- [x] `wall_e_eve.user.js` — Tampermonkey userscript binds to tone dials on shape-models.com

### Phase 2 — Speech & Loop (browser automation)
- [x] Web Speech API voice synthesis integrated into userscript
- [x] Syllable-synchronized head-bob loop (ENERGY + VERBOSITY scaled interval, ch 0)
- [x] MutationObserver output-stream detection with 850 ms debounce
- [x] Dial values normalized to 0–100 and stored as live speech/animation parameters
- [x] Floating Master HUD sidebar with tone dials, model select, persona fields, pacing, refusal, and iframe status
- [x] Five same-origin hidden iframes loaded in background (`/play/persona`, `/play/diff`, `/play/refusal`, `/play/eval`, `/play/choreographer`)
- [x] React-compatible native prototype value sync from HUD to all iframes
- [ ] Refusal trigger pattern matching → defensive posture servo commands
- [ ] Telemetry logging in `relay.py` → `server/performance_logs.json`
- [ ] Automatic conversation handoff between Wall-E and EVE

### Phase 3 — Physical Build (hardware)
- [ ] Stage base constructed with servo mounting positions
- [ ] Tendon lines routed through both toy bodies
- [ ] All 6 servos wired to PCA9685 and tested independently
- [ ] Power supply isolated and verified safe

### Phase 4 — Integration & Calibration
- [ ] Per-servo angle limits tuned to physical stop points of each figure
- [ ] Tone dial → servo speed mapping calibrated
- [ ] Full autonomous loop tested for 10+ minutes without intervention

### Phase 5 — Evaluation & Scoring
- [ ] performance_logs.json pipeline connected to /play/eval iframe
- [ ] Automated scoring criteria defined and tested
- [ ] Session replay from log file verified

---

*Last updated: 2026-07-10 — v3.0.0: Single-Tab Matrix Interface, React DOM Mirroring, Refusal Triggers, Telemetry Logging architecture documented*
