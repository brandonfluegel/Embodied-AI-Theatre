# MASTER PLAN
## Darth Vader & Imperial Stormtrooper — Autonomous Physical-Digital AI Theatre
### Architectural Blueprint & Source of Truth
### Current Version: v5.4.0 — Enclosed Stage Commissioning Controls

---

## 1. Overall Vision

We are building an autonomous, closed-loop, physical-digital AI theatre that runs on a table. The project gives Darth Vader and an Imperial Stormtrooper physical forms, voices, and coordinated bodily gestures.

The two characters engage in real-time, hands-free spoken debates. The text output of one agent automatically becomes the prompt for the other, creating a self-sustaining conversational loop. The entire pipeline — from language model output, to synthesized speech, to servo-driven physical movement — runs without human intervention once started.

**Core design principles:**

- Every layer of the system (web, Python, firmware) must be as low-latency as possible
- Hardware mechanics are hidden; only natural-looking motion is visible
- The loop must be recoverable — if any single component fails, the others keep running
- All six shape-models.com playgrounds are driven from one browser tab through a same-origin hidden iframe matrix

---

## 2. Toy Specifications & Scale

| Property | Darth Vader (Character A) | Imperial Stormtrooper (Character B) |
|---|---|---|
| Manufacturer | Hasbro | Hasbro |
| Product line | Star Wars The Black Series (6-inch, 1/12 scale) | Star Wars The Black Series (6-inch, 1/12 scale) |
| Height | ~6 inches (~15 cm) | ~6 inches (~15 cm) |
| Weight | ~100 g (0.1 kg) | ~110 g |
| Frame type | Highly articulated plastic body with standard joint hinges | Highly articulated plastic body with standard joint hinges |
| Tendon routing | Antagonistic pull-pull pairs in PTFE Bowden tubes; arm lines redirected up the acrylic gantry | Antagonistic pull-pull pairs in PTFE Bowden tubes; arm lines redirected up the acrylic gantry |

**Key mechanical implication:** Both Black Series figures feature built-in mechanical pivot pins at the neck, shoulders, and torso. Each pivot is now driven by an **antagonistic pair** of tendons tied directly to the plastic joint hinge — one line pulls the joint one way, its partner pulls it back — so no gesture depends on gravity to reset. Every tendon runs inside a low-friction PTFE (Teflon) Bowden tube anchored to the back of the figure via heat-melted channels and 0.5 mm brass wire; arm lines are redirected up the Transparent Acrylic Gantry fixed to the service-side box wall behind the closed stage to pull the shoulders up and out, while the remaining lines route down through the display stage base to the 16 servos hidden beneath the deck. See Section 3 for the full antagonistic strategy and channel map.

---

## 3. Mechanical Movement Strategy — 16-Servo Antagonistic Design

Physical movement is driven by a full **16-servo antagonistic (pull-pull) system** — eight channels per character — mounted beneath the stage deck and driven by a single PCA9685 board using all 16 of its channels.

Every axis of motion is controlled by **two opposing tendons** — one servo winds line to pull the joint one way while its partner pays out line, and the roles reverse to drive it back. Because tension is always held on both sides, each joint holds an absolute, jitter-free 3D position.

### Antagonistic Tendon Routing

Each degree of freedom is a matched servo pair working in opposition:

- One servo winds line to pull the joint in one direction (e.g. head nod down)
- Its antagonist winds the opposing line to pull it back (e.g. head lifts back up)
- Neutral is a balance point where both tendons hold equal tension
- The controller drives the pair in complementary directions, so there is always active tension on both sides and zero backlash

To eliminate the friction losses that would otherwise fight the antagonistic tension, every tendon now runs inside a **PTFE (Teflon) Bowden tube — 2 mm OD / 1 mm ID**. The tubes are anchored to the backs of the plastic figures by using a heated needle to melt tiny channels directly through the PVC/ABS plastic of each figure, then physically securing each PTFE Bowden tube with 0.5 mm brass wire or micro zip-ties threaded through those channels for high-tension stability. This mechanical anchoring prevents tube pull-out under the sustained antagonistic tension loads that would eventually defeat an adhesive bond.

### The Transparent Acrylic Gantry

Pulling the arms *upward and outward* is impossible from below the stage without a redirection point. A **Transparent Acrylic Gantry** provides one, mounted invisibly behind the figures:

- A 1/8" (3 mm) clear cast-acrylic board cut into a "T" shape is fixed to the lower box wall at the service side, behind the two figures when the lid is closed
- Because it is optically clear, it disappears against the backdrop under stage lighting
- The PTFE Bowden tubes route from the moving lid stage to the fixed gantry and over its top edge, which acts as a **high-angle pulley**
- Servos hidden beneath the stage can now pull a figure's arm up and out along a high tendon angle, producing lifelike shoulder raises and reaching gestures that a straight bottom pull could never achieve

### Channel Assignment — 16-Channel Max-Out

The PCA9685's full 16 channels are now used: **Darth Vader occupies channels 0–7, the Imperial Stormtrooper occupies channels 8–15.** Each character has four antagonistic joint pairs (8 channels) covering head nod, torso twist, shoulder, and elbow.

| Channel | Character | Joint | Antagonistic role |
|---|---|---|---|
| 0 | Darth Vader | Head nod | Pull down |
| 1 | Darth Vader | Head nod | Pull back |
| 2 | Darth Vader | Torso twist | Pull left |
| 3 | Darth Vader | Torso twist | Pull right |
| 4 | Darth Vader | Shoulder | Pull up-forward |
| 5 | Darth Vader | Shoulder | Pull down-back |
| 6 | Darth Vader | Elbow | Curl in |
| 7 | Darth Vader | Elbow | Extend out |
| 8 | Imperial Stormtrooper | Head nod | Pull down |
| 9 | Imperial Stormtrooper | Head nod | Pull back |
| 10 | Imperial Stormtrooper | Torso twist | Pull left |
| 11 | Imperial Stormtrooper | Torso twist | Pull right |
| 12 | Imperial Stormtrooper | Shoulder | Pull up-forward |
| 13 | Imperial Stormtrooper | Shoulder | Pull down-back |
| 14 | Imperial Stormtrooper | Elbow | Curl in |
| 15 | Imperial Stormtrooper | Elbow | Extend out |

Each pair is driven complementarily: to nod Vader's head down, ch 0 winds in while ch 1 pays out; to lift it back, the roles reverse. The same pattern applies to all four joints on both characters, giving each figure absolute positional control across head, torso, shoulder, and elbow.

> **Software integration note (v5.4.0):** The browser animation layer (`vader_trooper.user.js`) drives the antagonistic pairs via `sendJoint(pair, angle)`, which looks up a per-joint `CALIBRATION_CURVES` piecewise spline to derive the physically correct `pullA` and `pullB` servo angles independently. Browser trajectory damping ramps changes larger than 20° in 1°/15 ms steps. The firmware independently enforces per-channel soft limits and a 1500 ms PWM-release timeout. Repeated identical commands no longer postpone that release, while a command received after release re-energizes the channel. Boot homing energizes one antagonistic pair at a time to reduce inrush, the PCA9685 I²C bus runs at 400 kHz, and malformed, overflowed, or incomplete serial frames are discarded before motion.

---

## 4. Embodied Speech & Interactive Conversation Loop

### The Cloud API Mandate

**The local "Free (in browser)" WebGPU model MUST NOT be used for this project.**

The shape-models.com playground offers a "Free (in browser)" option that runs a language model entirely inside the browser via WebGPU. While convenient for casual use, this model is fundamentally incompatible with the physical theatre system for one critical reason: **WebGPU model inference executes on the browser's main thread**. JavaScript is single-threaded — when the local model is generating tokens it saturates main-thread execution time, starving the servo animation `setInterval` callbacks. The result is that the 50 ms head-bob and gesture animation intervals slip to hundreds of milliseconds, completely destroying the syllable-synchronised physical movement that is the core of this project.

**Required model: Claude Haiku 4.5**

Before starting the autonomous loop the operator must manually select **"Claude Haiku 4.5"** from the model drop-down on the shape-models.com `/play/tone` page. Claude Haiku 4.5 is the mandated model because it offers the best balance of **ultra-low latency token streaming**, **cost-effectiveness for infinite loops**, and **superior theatrical persona retention**. Its cloud-side inference keeps the browser's main thread free, ensuring the 50 ms servo animation intervals fire without slip while the userscript observes the site's explicit `Streaming` and `Done` states.

| Model type | Main-thread impact | Servo animation | Dead-air gap |
|---|---|---|---|
| Free (in browser) / WebGPU | **HIGH — blocks JS event loop** | Stutters, drops frames | Unpredictable |
| Claude Haiku 4.5 (cloud) | None — network I/O only | Smooth 50 ms intervals | Near zero |

The `vader_trooper.user.js` guardrail will prompt the operator with a warning dialog if it detects that a local model appears to be selected when the **Start Loop** button is clicked. The operator may override the warning, but degraded physical performance is expected.

---

### Stage 1 — Real-Time Text Generation Hook

The userscript does not track mouse clicks or raw slider positions to trigger speech. Instead, it deploys a `MutationObserver` targeted directly at the generation output box at the bottom of the shape-models.com playground. The observer fires the exact millisecond new tokens begin streaming onto the screen after the **Run with this tone** button is pressed.

Each submitted generation captures its intended speaker. The observer waits for the output card to move from `Streaming` to `Done`, then extracts the final text and routes it to that captured speaker. A conservative 2.5-second quiet-window fallback is used only if the site removes its status badge. This prevents a slow stream pause from becoming a false extra turn.

### Stage 2 — Relay-Backed Text-to-Speech

The userscript sends each completed text block to `relay.py` as a `tts_request`. The relay uses ElevenLabs to synthesize the selected character voice and plays it through the host computer with `pygame`. This requires a valid `ELEVENLABS_API_KEY`, network access, and a working host audio device. The relay emits `tts_started` and `tts_complete`; the userscript begins physical animation only after `tts_started` and schedules the next turn only after `tts_complete`.

The interaction operates as a **closed-loop automated theatre**. When relay playback completes, the userscript copies the completed text block, programmatically inputs it into the opposing character's prompt window, and triggers the next generation phase. The debate alternates between Darth Vader and the Imperial Stormtrooper indefinitely without manual input.

### Stage 3 — Syllable-Synchronized Mechanical Bursts

Physical movement is dynamically coupled to active speech synthesis. The moment `utterance.onstart` fires, the userscript launches two simultaneous effects on the **active speaker's channels only**. The silent character holds its last position throughout the opposing turn.

**Head animation:** An oscillation loop sends commands to the active speaker's head nod pair — the **Vader head nod pair (ch 0/1)** while Vader speaks, the **Trooper head nod pair (ch 8/9)** while the Trooper speaks. Driven through the `sendJoint()` helper, the pair alternates between **100° and 80°** around the 90° neutral center — one channel winds in while its antagonist pays out.

**Arm gesture:** A single dramatic tendon raise is scheduled at approximately 40% through the estimated utterance duration (capped at 2 seconds). The speaker's shoulder pair — the **Vader shoulder pair (ch 4/5)** or the **Trooper shoulder pair (ch 12/13)** — is driven by `sendJoint()` to **135°** for 700 ms, lifting the arm up-and-out over the acrylic gantry, then returns to 90°. Duration is estimated from word count and the live speech rate so faster speech produces an earlier gesture cue.

The tick interval is now computed from three sources — ENERGY dial, VERBOSITY dial, and the HUD Bob Speed slider:

```
dialDriver  = (ENERGY + VERBOSITY) / 2          // 0-100
driver      = (dialDriver + BOB_SPEED_HUD) / 2   // blends dial speed with manual override
interval_ms = 200 − (driver / 100) × 150         // 200 ms (slow) → 50 ms (fast)
```

The moment `utterance.onend` fires, `clearInterval` terminates the head loop instantly and the active speaker's head nod pair snaps back to 90° neutral. The opposing character's joints are not touched. No servo motion persists between spoken turns.

### Conversation Handoff Flow

```
[shape-models.com generates text]
    ↓  MutationObserver fires on output box
    ↓  Shape output status changes from Streaming to Done
    ↓  text stripped of UI labels
    ↓
[relay.py plays ElevenLabs audio — character-specific voice selected]
    ↓  tts_started  → stopNoiseInterval() — Temperature noise silenced
    ↓                     → head-bob loop starts on active speaker's head nod pair (ch 0/1 Vader | ch 8/9 Trooper)
    ↓                     → arm gesture scheduled at ~40% through utterance (shoulder pair ch 4/5 Vader | ch 12/13 Trooper → 135° for 700 ms)
    ↓  tts_complete      → loop cleared, speaker head → S<ch>:90, entry pushed to sessionLog
    ↓                     → pushToEval() writes live transcript + scoring criteria to /play/eval
    ↓
[scheduleHandoff]
    ↓  resolveDiffUncertainty() if diff divergence is currently active
    ↓  detectSentiment(completedText) → updateSentimentDisplay()
    ↓  syncPersonaField('NAME', …) + injectPersonaModifier() → /play/persona backstory
    ↓
    ↓  ── v5.4.0: Dynamic Tone Dial Profiling ──────────────────────────────────────
    ↓  During the inter-turn silence, the system actively overwrites the 6 live
    ↓  dialValues entries to match the upcoming speaker's personality profile:
    ↓    • Vader next   → ENERGY=85, VERBOSITY=75, WARMTH=20
    ↓                     (high dominance, high verbosity, cold/menacing)
    ↓    • Trooper next → DIRECTNESS=80, STRUCTURE=75, WARMTH=60
    ↓                     (clipped authority, structured, warmer inflection)
    ↓  Each updated dial is immediately propagated via pushDialToMainPage() to
    ↓  the native slider on /play/tone and via sendJoint() to the physical servos,
    ↓  so the figures shift posture during silence rather than mid-speech.
    ↓
    ↓  ── v5.4.0: Rolling Dialogue History Construction ─────────────────────────
    ↓  Shape's tone playground is single-turn, so the script reads sessionLog
    ↓  and slices the last 20 turn objects. Each entry is mapped to a labelled
    ↓  line using a character script format:
    ↓      DARTH VADER: "[text]"
    ↓      STORMTROOPER: "[text]"
    ↓  A [SYSTEM: …] directive naming the exact next speaker is prepended,
    ↓  followed by the 20-turn history block and an explicit [NEXT SPEAKER] marker.
    ↓  The scene premise is repeated on every request. On turn 1, the history block
    ↓  is omitted and Darth Vader is explicitly selected as the opening speaker.
    ↓
    ↓  startNoiseInterval() — Temperature noise resumes during inter-turn gap
    ↓  waits hudTurnPause delay (200–3000 ms, HUD-controlled)
    ↓  injects fully-framed prompt (directive + premise + 20-turn history + next speaker)
    ↓  triggers next generation phase
    ↓
[loop repeats indefinitely]
```

> **v5.4.0 — Execution Seeding:** Clicking **♾️ Start Loop** captures the main-page prompt as the persistent scene premise. If it is empty or shorter than 5 characters, the script uses a default Death Star security-failure premise. The first request explicitly names Darth Vader as the next speaker, preventing the generated opening response from being assigned to the wrong character.
>
> Local conversation state advances even when `relay.py` or the ESP32 is offline; telemetry transmission is optional and no longer controls whether a turn enters `sessionLog`.

### Stage 4 — Dramatic Refusal Triggers

The /play/refusal playground lets you define boundary phrases — words or patterns the AI should refuse to engage with. When the MutationObserver detects one of these patterns in the streaming output, the script does not continue the normal speech-and-animation flow. Instead it executes a defensive interrupt sequence:

1. The active relay TTS playback is immediately cancelled
2. All servo animation intervals are cleared
3. A defensive posture command sequence fires over the WebSocket via the `sendJoint()` helper:
   - The **Vader head nod pair (ch 0/1)** is commanded to 60° — Darth Vader bows his head down ominously
   - The **Trooper head nod pair (ch 8/9)** is commanded to 120° — the Stormtrooper snaps his head to a defensive stance
4. Both postures hold until the user resumes the session or a configurable timeout clears them

This gives the live performance a visually dramatic physical reaction to sensitive content, reinforcing the character boundaries in a way the audience can see and feel.

### Stage 5 — Telemetry & Performance Logging

Every completed spoken turn is written to `server/performance_logs.json` by the Python relay server. Each log entry records:

| Field | Description |
|---|---|
| `timestamp` | ISO 8601 time of the completed turn |
| `speaker` | `"vader"` or `"trooper"` |
| `text` | Full spoken text block |
| `char_count` | Character length of `text` |
| `turn_number` | Sequential turn index in the current session |
| `dial_snapshot` | All six normalized dial values at generation time |
| `speech_rate` | Speech rate used for playback |

## 5. Multimodal Dial Modifiers

### Temperature Slider as a Physical Noise Source
The shape-models.com playground has a **Temperature** slider at the top of the page above the six tone dials. The `getToneDialsSection` and `findDialName` guards keep it deliberately excluded from tone-dial binding so it never interferes with the six named dials.

A separate `findTemperatureSlider()` function captures it using inverse DOM logic: it scans for a range input whose ancestor contains “TEMPERATURE” but none of the six dial names. The normalised value (0–100) is displayed in the HUD **TEMP** indicator and stored in `temperatureValue`, which drives the physical noise engine described in Stage 6 above.

The six named dials (WARMTH, VERBOSITY, ENERGY, DIRECTNESS, CONCRETENESS, STRUCTURE) remain fully isolated from Temperature through the existing `findDialName` guard that returns `null` the moment “TEMPERATURE” appears in any ancestor within 4 DOM levels.

### The Six Dials as Global Performance Modifiers

The six tone dials do **not** directly command individual servo positions in real time. They function as persistent parameter stores that shape the character's physical and vocal performance. Every time a dial moves, two things happen:

1. The raw slider value is normalized to a **0–100 integer** and stored in the script's live `dialValues` state object.
2. The equivalent servo angle (0–180°) is forwarded to `relay.py` so the physical limb reflects the dial's approximate position.

The stored 0–100 values are then read continuously by the speech engine and the animation loop:

| Dial | Antagonistic joint pair | Normalized value drives |
|---|---|---|
| WARMTH | Vader head nod (ch 0/1) | Voice pitch (0.85 → 1.15) — dial sets resting position; head animation loop takes command priority during active speech |
| VERBOSITY | Vader torso twist (ch 2/3) | Head-bob animation density (contributes 50 % to tick interval) |
| ENERGY | Vader shoulder (ch 4/5) | Speech rate (0.75 → 1.40) + head-bob speed (contributes 50 % to tick interval) |
| DIRECTNESS | Trooper head nod (ch 8/9) | Language sharpness (affects language model prompt) |
| CONCRETENESS | Trooper torso twist (ch 10/11) | Specificity of AI output (affects language model prompt) |
| STRUCTURE | Trooper shoulder (ch 12/13) | Prose vs. formatted output (affects language model prompt) |

Each dial forwards its position to a joint through `sendJoint()`, which resolves the correct `pullA` and `pullB` angles via the per-joint `CALIBRATION_CURVES` piecewise spline. The elbow pairs (ch 6/7, ch 14/15) are reserved for future gestures and are not currently dial-bound.

### Animation Speed — Energy, Verbosity, and Bob Speed

The head animation tick interval is driven by three sources: the ENERGY dial, VERBOSITY dial, and the HUD Bob Speed slider. The dial pair is averaged first, then blended 50/50 with the manual Bob Speed override:

```
dialDriver  = (dialValues.ENERGY + dialValues.VERBOSITY) / 2
driver      = (dialDriver + hudBobSpeed) / 2
interval_ms = 200 − (driver / 100) × 150
```

- **All three at 100** → driver = 100 → interval = **50 ms** (20 sharp bursts/sec)
- **All three at 0**   → driver = 0   → interval = **200 ms** (5 slow nods/sec)
- **Mixed values** land proportionally between those extremes

This means a high-energy, high-verbosity scene with Bob Speed pushed up produces rapid, staccato bursts on the active speaker's head channel. A calm scene with low values produces slow, deliberate motion that matches the languid speech rate. Bob Speed gives the operator a direct override that bypasses the dial values entirely when manual control is preferred.

### Unified Master HUD

The unified control interface is not a separate HTML file — it is injected directly into the `/play/tone` tab as a floating overlay sidebar. This means all controls live inside the same browser tab with direct JavaScript access to the page's own DOM.

The HUD is a fixed-position panel, 272 px wide, anchored to the right edge of the screen at the maximum CSS z-index. It collapses to a 34 px sliver via a toggle button so it never permanently blocks the page content.

| HUD Section | Function |
|---|---|
| Tone Dials | Six sliders mirroring the main page dials; changes push to main page AND all iframes |
| Persona | Darth Vader and Stormtrooper name fields; the incoming speaker's name is auto-pushed to /play/persona's NAME field on every conversation handoff so the model always generates from the correct character identity |
| Pacing | Bob Speed blends live with ENERGY+VERBOSITY to set animation tick rate; Turn Pause maps 0–100 → 200–3000 ms inter-turn gap; both push values to /play/choreographer on every change |
| Refusal Threshold | Pushes live to /play/refusal's first boundary range control via React-compatible setter |
| Evaluation | “📊 Score Session” pushes `sessionLog` + five-dimension scoring criteria to `/play/eval` and clicks generate; “📋 Load Replay” fetches `performance_logs.json` from relay.py and populates `/play/eval` for scoring of past sessions |
| Iframe Status | Live 🟢/🟡/🔴 indicator for each of the five background iframes |
| Sync All | Calls `syncAll()` — pushes Tone Dials, Pacing, and Refusal Threshold to the main `/play/tone` DOM **and** every ready iframe simultaneously; also fires automatically on page load once all 5 iframes reach Ready, eliminating HUD-vs-page startup desync without a manual click |
| Generate | Triggers the main page's Run button from the HUD without touching the keyboard |

---

## 6. Single-Tab Matrix Interface

### Same-Origin Hidden Iframe Architecture

All six shape-models.com playgrounds are loaded and controlled from inside the single `/play/tone` browser tab. Five `<iframe>` elements are appended to the page body and styled with `display:none; width:0; height:0;` so they are completely invisible and have zero impact on the visible page layout.

| iframe key | URL loaded | Purpose |
|---|---|---|
| `persona` | `/play/persona` | Character backstory, voice, and name definitions |
| `choreographer` | `/play/choreographer` | Conversation pacing and turn-taking rules — receives HUD Bob Speed (slot 0) and Turn Pause (slot 1) on every slider change |
| `refusal` | `/play/refusal` | Boundary phrase configuration and safety settings |
| `diff` | `/play/diff` | Side-by-side prompt comparison — `initDiffMonitor()` watches for divergent outputs (Jaccard similarity < 0.35) and triggers Trooper torso-twist shake (ch 10/11) + Vader shoulder raise-and-hold (ch 4/5) |
| `eval` | `/play/eval` | Automated quality scoring of completed dialogue sessions |

Because every URL shares the exact same origin (`shape-models.com`), the browser applies no CORS restrictions. JavaScript running in the parent `/play/tone` tab can freely read and write into each iframe's `contentDocument` and `contentWindow` as if they were part of the same page.

### Iframe Loading & React Hydration

The iframes load a full React application on each URL. After the HTML arrives and `iframe.onload` fires, a 2500 ms timer allows React to complete component mounting before the parent marks the iframe as ready. If the `contentDocument` is inaccessible when the timer fires (for example if the page returns a 404 or sends an X-Frame-Options header), the iframe is marked as Blocked and shown with a red indicator in the HUD.

### HUD Status Feed

Every iframe has a live status row in the Master HUD:

- 🟡 Loading — iframe has been appended but has not finished loading
- 🟢 Ready — React has hydrated and the DOM can be driven by the parent
- 🔴 Blocked — the page returned an error or refused iframe embedding

### Auto Initial-State Sync

A persistent startup desync previously existed between the HUD's default values and the native page state. The values only aligned when the operator manually clicked ↺ Sync all iframes.

This is resolved by a readiness gate inside `injectIframes()`. After each iframe's 2500 ms hydration timer fires and marks the frame Ready, the script checks `Object.values(iframes).every(f => f.ready)`. When the last of the 5 iframes crosses that threshold, `syncAll()` runs once automatically:

1. **Tone dials** — `pushDialToMainPage` writes each of the 6 dials to the native sliders on the main page; `syncAllDials` mirrors them to all iframes.
2. **Pacing** — `syncChoreographerSlider(0, hudBobSpeed)` and `syncChoreographerSlider(1, hudTurnPause)` push the HUD defaults to the choreographer iframe.
3. **Refusal threshold** — `syncRefusalThreshold` reads the HUD slider value and pushes it to the refusal iframe.

The ↺ Sync all iframes HUD button is now bound directly to `syncAll()`, covering all three steps including the main page tone-dial sliders and pacing/refusal controls.

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

`syncAll()` performs all four cascades (Model, Tone Dials, Pacing, Refusal Threshold) in a single call. It fires automatically once all 5 iframes reach Ready on initial page load and is also bound to the ↺ Sync all iframes HUD button.

---

## 8. Hardware Infrastructure

### Component Overview

| Component | Part | Role |
|---|---|---|
| Enclosure | 13 in x 10 in x 6.5 in unfinished pine box with hinged lid and metal clasps | Low-voltage enclosure; the clasp wall is the Service Edge / Service Wall, the lid is the display stage, and the base houses the removable tray |
| Removable tray | 8 in x 10 in x 1/4 in MDF board | Serviceable internal mounting panel for the 16 servos, controller boards, terminal block, and cable anchors |
| Microcontroller | ESP32 Type-C development board | Receives serial commands, drives PCA9685 via I2C |
| PWM driver | PCA9685 16-channel board | Converts I2C commands to 50 Hz PWM signals for all 16 channels |
| Servos (×16) | MG90S micro servo, metal/brass gear, 3-pin harness | Antagonistic actuation — one servo on each PCA9685 channel `CH00` through `CH15` |
| Servo power supply | 5 V / 15 A (75 W) switching adapter | Dedicated high-current rail for 16 servos under antagonistic tension |
| Power connector | Female barrel-to-screw-terminal block | Breaks the adapter barrel jack out to the PCA9685 V+ rail |
| Power harness | 30 ft 14 AWG stranded red/black two-conductor wire | High-current 5 V and ground distribution from the barrel terminal to PCA9685 V+ and GND |
| Logic harness | 40x 20 cm female-to-female Dupont jumper wires | Low-current ESP32-to-PCA9685 3.3 V, ground, SDA, and SCL connections; spares support tidy service loops |
| Tendon line | 20 lb black braided PE fishing line | Zero-stretch, zero-memory tendon — holds antagonistic tension precisely |
| Tendon sheath | PTFE tubing, 1 mm ID × 2 mm OD (3 m) | Low-friction Bowden routing on the backs of the figures |
| Gantry | 1/8" (3 mm) clear cast acrylic sheet, 12" × 12" | Invisible "T" board — high-angle pulley for arm lifts |
| Tube anchoring | 0.5 mm brass wire + micro zip-ties | Physically anchor PTFE Bowden tubes through heat-melted channels in the figures' PVC/ABS plastic |
| Cable management | Mini zip ties | Bundles the 16 servo leads and tendon runs |
| Host computer | Lenovo ThinkPad | Runs relay.py, browser userscripts, and HTML dashboard |

### Phase 3 MG90S Actuator Specification

The actuator set is **16 MG90S metal/brass-geared micro servos**, assigned one per PCA9685 channel, `CH00` through `CH15`. Each servo has a three-pin lead:

| Harness conductor | Function | PCA9685 servo header connection |
|---|---|---|
| Brown | Ground | `GND` |
| Red | 5 V servo power | `V+` |
| Orange | PWM control signal | Channel signal pin |

> **Polarity note:** Verify the silkscreen on the specific PCA9685 board before connecting any servo. Do not assume header orientation from board position alone; an inverted servo plug can damage the servo or controller.

Each MG90S package supplies the following hardware for its servo. For the full 16-servo set, this yields 32 wood screws, 16 spline machine screws, and 16 of each horn style.

| Package item per servo | Quantity | Phase 3 disposition |
|---|---:|---|
| Pointy self-tapping wood screw | 2 | Use both screws to fasten the servo's plastic side tabs directly to the MDF tray. Make starter dints, then drive the screws manually; do not pre-drill or use power tools for this operation. |
| Flat-top M2 spline machine screw | 1 | Reserve until electrical centering. Use it only to secure the selected horn to the brass output spline. |
| Double-arm straight horn | 1 | **Required.** Install after centering and use as the attachment point for the 20 lb braided PE fishing-line tendon. |
| Single-arm horn | 1 | Spare/reserved; do not install for the Phase 3 tendon layout. |
| Four-point cross horn | 1 | Spare/reserved; do not install for the Phase 3 tendon layout. |

> **Horn timing rule:** Mount every servo bare. Do not attach a plastic horn or its M2 spline screw during tray mounting. Horns are fitted only after the electrical-centering procedure in Phase 3 Step 5, then the mandated double-arm horn is secured with its M2 screw before a tendon is attached.

### Phase 3 Servo Assembly Procedure

1. Verify the hand-drawn tray layout against the measured coordinates below before making any mounting dints: the 1.5 in tendon corridor, 3.5 in x 3.5 in Power & Controller Zone, and the 4 x 4 `CH00`–`CH15` servo grid are already marked.
2. Set every servo into its labeled grid position with its brass/white output spline uniformly down toward the bottom Service Wall tendon corridor. Confirm that the future double-arm horns have clearance from each other and from the controller zone.
3. At each servo's two plastic side tabs, make starter dints in the MDF. Do not pre-drill the tray.
4. Manually drive the two supplied pointy self-tapping wood screws through the side tabs into the starter dints. Do not use power tools. Leave every servo bare: no horn and no M2 spline screw.
5. Connect and electrically center one labeled channel at a time using the conservative commissioning range. With the servo at its verified center, fit the required double-arm straight horn in the intended tendon-neutral orientation and secure it with the supplied flat-top M2 machine screw.
6. Attach and label the 20 lb braided PE tendon only after the centered double-arm horn is secured. Retain the single-arm and four-point cross horns as spares.

### Enclosed Stage Architecture

The **13 in x 10 in x 6.5 in unfinished pine box** replaces the unspecified stage base. Its hinged lid is the visible display stage. To avoid ambiguous use of "front," this build uses two fixed edge names:

- **Service Edge / Service Wall** — the **front** edge of the pine box, with the dark metal clasps and the 1/4 in power-entry hole. It is the matching lower-box wall behind the lid edge. Fix the clear acrylic T gantry to this lower-box wall, not to the lid. It sits behind the actors from the audience viewpoint when the lid is closed.
- **Audience Edge / hinge edge** — the **back** edge of the pine box, opposite the clasps. This is the hinge edge and stage front; position the actors so they face this edge.

When the clasps are unlatched, the lid pivots forward toward the audience around the audience/hinge edge. The gantry remains fixed on the service-side lower box wall. Both figures sit between the two edges, with their backs and PTFE tube exits toward the gantry/service edge. The box base remains a low-voltage service enclosure.

The **8 in x 10 in x 1/4 in MDF board** will sit flat inside the box as a single removable internal tray for the 16 MG90S servos, PCA9685, ESP32, barrel-to-screw-terminal block, and cable-management anchors. **Current build status:** the pine-box setup is complete; all tray-zone boundaries, the 4 x 4 servo grid, and `CH00`–`CH15` channel labels have been hand-measured and penciled. The PCA9685 driver, barrel-to-screw-terminal block, and ESP32 are laid out in their intended Power & Controller Zone positions, with the ESP32 USB-C port facing left; none is mechanically fastened yet, and no servos are mounted. For every spatial instruction and diagram, use a top-down view with the Service Wall at the **bottom**. Use the bottom-left tray corner as origin `(x=0, y=0)`, with `x` increasing left-to-right and `y` increasing from the Service Wall toward the Audience Edge. Reserve these finalized areas:

- A **1.5 in-wide tendon corridor** at `y=0.0–1.5 in` along the full bottom edge, adjacent to the Service Wall / clasps. It carries the PTFE tubes and fishing lines descending from the figures and fixed gantry. The open tendon-routing portion is `x=3.5–10.0 in`; keep it clear of mounted hardware, power wiring, and logic wiring.
- A **3.5 in x 3.5 in Power & Controller Zone** at `x=0.0–3.5 in`, `y=0.0–3.5 in`: barrel terminal, fuse holder, distribution block if required, bulk capacitor, PCA9685, and ESP32. It intentionally occupies the left 3.5 in of the corridor baseline (`y=0.0–1.5 in`) to sit directly next to the Service Wall power-entry hole; this occupied overlap is not available for tendon routing. Mount the ESP32 with its USB-C port facing left toward the outer box wall.
- A **6.5 in x 6.5 in, 4 x 4 servo field** at `x=3.5–10.0 in`, `y=1.5–8.0 in`. It is divided into sixteen uniform **1.625 in x 1.625 in (1-5/8 in x 1-5/8 in)** cells. Mark and mount `CH00` through `CH15` in the row-major channel order below. Every brass/white output spline must point uniformly **down** toward the bottom tendon corridor, with enough space for each double-arm horn to rotate without touching its neighbor.

| Grid row, top to bottom | `y` bounds (in) | Cell 1 | Cell 2 | Cell 3 | Cell 4 |
|---|---:|---|---|---|---|
| Row 1 | `6.375–8.000` | `CH00` | `CH01` | `CH02` | `CH03` |
| Row 2 | `4.750–6.375` | `CH04` | `CH05` | `CH06` | `CH07` |
| Row 3 | `3.125–4.750` | `CH08` | `CH09` | `CH10` | `CH11` |
| Row 4 | `1.500–3.125` | `CH12` | `CH13` | `CH14` | `CH15` |

| Grid column, left to right | `x` bounds (in) |
|---|---:|
| Column 1 | `3.500–5.125` |
| Column 2 | `5.125–6.750` |
| Column 3 | `6.750–8.375` |
| Column 4 | `8.375–10.000` |

```text
Top-down tray view: 10 in wide x 8 in high; Audience Edge / hinges = BACK (top)
Service Wall / clasps = FRONT (bottom); origin (0,0) is bottom-left

                                                 AUDIENCE EDGE / HINGES (BACK)
    +----------------------------------------------------------------+
    |                     CH00     CH01     CH02     CH03          |
    |                     CH04     CH05     CH06     CH07          |
    |                     CH08     CH09     CH10     CH11          |
    |  +----------------+ CH12     CH13     CH14     CH15          |
    |  | POWER &        |                splines point DOWN        |
    |  | CONTROLLER     |                      v v v v              |
    |  | 3.5 x 3.5 in   |                                           |
    |  | USB-C LEFT     |                                           |
    |  +----------------+-------------------------------------------|
    |  zone overlap     | 1.5 in OPEN TENDON CORRIDOR (x=3.5–10.0)  |
    +----------------------------------------------------------------+
        SERVICE WALL / DARK CLASPS / POWER ENTRY HOLE (FRONT, BOTTOM)
```

> **Spatial rule:** Never place the Service Wall at the top of a spatial diagram or instruction. In every top-down view, it is the bottom edge; consequently, all MG90S output splines point down toward it.

Keep the audience/hinge edge clear of fixed hardware, cable ties, and cable-entry holes. The fixed gantry and moving lid require a deliberate service-motion check: with the 5 V adapter unplugged and tendons initially slack, open the lid through its full forward swing and confirm the figures, tube exits, PTFE tubes, and service loops do not bind on the fixed gantry, box, table, or audience-side surface. Do not open the lid with tensioned tendons until this slack-path check has passed. Lift the tray vertically out through the open top without individually unplugging servo leads; do not depend on an audience-edge removal path because the open lid occupies that side.

Route tendons from the lid stage to the tray through the tendon corridor and route electrical wiring outside it. Leave a restrained service loop at the lid-to-box transition so the lid can open fully and the tray can be removed. Secure slack away from servo horns, tendon spools, PTFE tubing, and the acrylic gantry. Label each tray position, PCA9685 port, servo lead, and matching tendon pair `CH00` through `CH15` using the channel map in Section 3.

The 5 V / 15 A adapter remains **external**. The low-voltage power-entry hole is already drilled with a **1/4 in bit** in the lower Service Wall / clasp-side wall: its center is **2 in from the left corner** and **1.5 in up from the bottom edge**. This places it beside the tray's bottom-left power/controller zone and outside the tendon corridor. Because the 1/4 in opening is too small for a 1/2 in rubber grommet, route the 14 AWG red/black power wires directly through the hole and wrap the wire at the hole with electrical tape for strain relief and chafing protection. Inspect the tape before every powered session and replace it if it loosens, splits, or exposes wire insulation. Do not install AC mains wiring, an AC inlet, or an internal mains power supply in the wooden enclosure.

### Bill of Materials (Phase 3 Enclosed Antagonistic Build)

- **13 in x 10 in x 6.5 in unfinished pine hinged/clasp box** — low-voltage enclosure; lid is the display stage
- **8 in x 10 in x 1/4 in MDF board** — removable servo/controller mounting tray
- **ESP32 + PCA9685** — controller stack using all 16 channels
- **16× MG90S micro servos** (metal gear)
- **5 V / 15 A (75 W) switching adapter** with a female barrel-to-screw-terminal block
- **30 ft 14 AWG stranded red/black two-conductor wire** — high-current 5 V distribution only
- **40x 20 cm female-to-female Dupont jumper wires** — ESP32-to-PCA9685 low-current logic harness only
- **20 lb black braided PE fishing line** (zero stretch, zero memory)
- **3 m of 1 mm ID × 2 mm OD PTFE tubing**
- **1/8" (3 mm) clear cast acrylic sheet, 12" × 12"**
- **0.5 mm brass wire** + **micro zip-ties** — physically anchor each PTFE Bowden tube through heat-melted channels in the figures' PVC/ABS plastic for high-tension stability (do **not** use CA glue; it cannot hold sustained antagonistic pull loads)

### Wiring Diagram

```
ThinkPad (USB)
    │
    └── ESP32
            ├── Dupont: 3.3 V ───────────────────── PCA9685 VCC (logic)
            ├── Dupont: GND ─────────────────────── PCA9685 GND
            ├── Dupont: GPIO 21 / SDA ───────────── PCA9685 SDA
            └── Dupont: GPIO 22 / SCL ───────────── PCA9685 SCL
                                                        │
External 5 V / 15 A adapter                            │
    │                                                   │
    └── secured low-voltage entry ── fused distribution ┤
             ├── 14 AWG red: +5 V ─────────────────── PCA9685 V+
             └── 14 AWG black: GND ────────────────── PCA9685 GND
                                                        │
                                                        └── all 16 servo channels
```

### Power Isolation & Current Budget

With all 16 MG90S servos under constant antagonistic tension, all channels can simultaneously be under load. The supply is a dedicated **5 V / 15 A (75 W)** switching adapter.

- The adapter's barrel jack terminates in a **female barrel-to-screw-terminal block**, which breaks out to the PCA9685 **V+ rail** with a solid screwed connection rated for the higher current.
- Use the red 14 AWG conductor only for `+5 V` and the black 14 AWG conductor only for `GND` between the terminal block and PCA9685 rail. Dupont jumpers must never carry servo power.
- The 15 A supply feeds **only** the PCA9685 V+ rail; the ThinkPad USB port provides logic power to the ESP32 only — no servo current passes through the USB bus.
- All grounds (ESP32 GND, PCA9685 GND, and adapter GND) are connected at a single shared ground point.
- The four required Dupont connections are ESP32 `3.3 V -> VCC`, `GND -> GND`, `GPIO 21 -> SDA`, and `GPIO 22 -> SCL` on the PCA9685. Keep this low-current harness physically separate from 14 AWG power wiring and moving tendons.
- Mini zip ties bundle the 16 servo leads, while cable anchors secure the power and logic harnesses to the MDF tray. Run the 14 AWG harness directly from the 1/4 in Service Wall entry to the bottom-left power/controller zone; route the Dupont logic harness along the outside of the servo field; keep both outside the 1.5 in tendon corridor. Provide a restrained service loop so the tray can be removed and the lid can open without stressing connectors.
- With the external adapter unplugged, inspect all terminals, verify red/black polarity at the PCA9685 rail, confirm continuity between ESP32/PCA9685/adapter negative, and verify there is no `+5 V`-to-ground short. Check that electrical tape completely protects both wires at the 1/4 in entry hole, then tug-test the cable entry and tray anchors before applying power.
- Unplug the external adapter before opening the box, changing wiring, or removing the MDF tray.
- Add a DC-rated inline fuse at the positive lead near the barrel terminal and a low-ESR bulk capacitor at the servo rail. Select fuse size only after measuring normal and peak current, and use components rated above 5 V and the expected current.
- Verify the exact PCA9685 board's terminal block and PCB traces are rated for the measured servo current. If they are not, use a separately rated fused distribution block and route only the board's local servo supply connection through its terminal.

### Communication Stack

| Layer | Protocol | Baud / Port | Direction |
|---|---|---|---|
| Browser → Python | WebSocket | `ws://localhost:8765` | Browser userscript → relay.py |
| Python → ESP32 | USB Serial | 115200 baud | relay.py → ESP32 |
| ESP32 → PCA9685 | I2C | 400 kHz (fast mode) | ESP32 → PCA9685 |
| PCA9685 → Servos | PWM | 50 Hz | PCA9685 → MG90S ×16 |

### Serial Command Format

All frames include a mandatory 8-bit XOR checksum that protects against electrical inductive noise generated by the servo array. The checksum is computed by XOR-folding every ASCII byte of the payload — the characters between `S` and `*` — and appending the result as a two-digit uppercase hex value:

```
S<channel>:<angle>*<2-digit-hex-checksum>\n

Examples:
  S0:90*03    →  Vader head nod — neutral position
  S0:120*39   →  Vader head nod — pull-down tendon winds in
  S1:60*0D    →  Vader head nod — pull-back tendon pays out
  S8:120*31   →  Trooper head nod — pull-down tendon winds in
  S12:135*0E  →  Trooper shoulder — pull up-forward (arm lifts via gantry)
```

The firmware's `processLine()` locates the `*` delimiter, recomputes the XOR checksum over the payload, and compares it to the received two-hex-digit value. Any frame that is missing the `*` delimiter, has a truncated checksum field, or whose checksum does not match is discarded silently without calling `moveServo()`. The relay builds checksummed frames automatically via `serial_checksum()` in `relay.py`, so manual calculation is only needed during direct serial-terminal diagnostics. Angles are clamped first by `processLine()`, then by each channel's `SOFT_MIN_ANGLE` / `SOFT_MAX_ANGLE` inside `moveServo()`. Channels 0–15 are valid; edit the 16-entry soft-limit arrays in the firmware and reflash during Phase 4 to match each figure's physical stop points and prevent antagonistic over-tension. An `ACK:S<channel>:<angle>:APPLIED` response confirms that firmware updated PWM; `:UNCHANGED` means the requested PWM was already active. Neither response proves physical motion, so visually verify each channel. All other channels are silently ignored.

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
│   └── vader_trooper.user.js           ← v5.4.0 unified matrix userscript
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

> **Status as of 2026-07-24 — v5.4.0. The userscript supplies the conversation state missing from Shape's single-turn tone playground. Every request carries the scene premise, up to 20 labelled turns, and an explicit next speaker. Generation is request-bound and completes on Shape's `Done` state, with a 2.5-second compatibility fallback. The loop can therefore complete at least ten turns per character before its context window rolls forward. Local history remains active when the hardware relay is offline. Awaiting physical hardware build (Phase 3).**
> Digital stack complete with five active dynamic behaviour layers.
> Both figures animate independently per speaker. Temperature drives physical noise between turns. Dialogue
> sentiment automatically modulates the /play/persona backstory. The eval iframe feeds a closed-loop score
> monitor that adjusts live dial values. The /play/diff iframe triggers physical uncertainty responses.
> Firmware has per-servo soft limits and 1500 ms PWM stall timeout; relay.py has a sweep-test; HUD has a full Calibration panel.
> All 5 iframes auto-sync HUD defaults on load; Claude Haiku 4.5 API mandate enforced at Start Loop.

### Phase 1 — Digital Pipeline (software only)
- [x] `relay.py` — WebSocket server receives dial data, forwards to ESP32 via serial
- [x] `esp32_servo_controller.ino` — ESP32 firmware parses `S<ch>:<angle>*<hex>` commands; `processLine()` verifies the 8-bit XOR checksum before calling `moveServo()`, silently discarding frames with a missing `*` delimiter or a checksum mismatch
- [x] `vader_trooper.user.js` — Tampermonkey userscript binds to tone dials on shape-models.com

### Phase 2 — Speech & Loop (browser automation)
- [x] Web Speech API voice synthesis integrated into userscript
- [x] Syllable-synchronized head-bob loop (ENERGY + VERBOSITY scaled interval, ch 0/1)
- [x] MutationObserver output-stream detection using Shape's `Streaming`/`Done` states, with a 2.5-second compatibility fallback
- [x] Dial values normalized to 0–100 and stored as live speech/animation parameters
- [x] Floating Master HUD sidebar with tone dials, model select, persona fields, pacing, refusal, and iframe status
- [x] Five same-origin hidden iframes loaded in background (`/play/persona`, `/play/diff`, `/play/refusal`, `/play/eval`, `/play/choreographer`)
- [x] React-compatible native prototype value sync from HUD to all iframes
- [x] Refusal trigger pattern matching → defensive posture servo commands (ch 0/1 → 60°, ch 8/9 → 120°)
- [x] Telemetry logging in `relay.py` → `server/performance_logs.json` (NDJSON, append-only)
- [x] Automatic conversation handoff — Darth Vader ↔ Stormtrooper loop with variable pause (200–3000 ms, HUD-controlled)
- [x] Dual-character head animation — ch 0/1 animates while Vader speaks; ch 8/9 animates while Trooper speaks; silent character holds still
- [x] Per-speaker voice differentiation — `pickVoice(speaker)` selects deep male voices for Vader, distinct sharp voices for Trooper
- [x] Arm gesture auto-triggers — tendon pairs (ch 4/5 Vader, ch 12/13 Trooper) raise to 135° at ~40% through each utterance, return to 90° after 700 ms
- [x] HUD Pacing sliders live — Bob Speed blends with ENERGY+VERBOSITY for animation interval; Turn Pause maps 0–100 → 200–3000 ms
- [x] HUD Refusal Threshold slider pushes live to /play/refusal iframe boundary range control
- [x] Choreographer iframe integrated — Bob Speed → slot 0, Turn Pause → slot 1 pushed on every HUD slider change
- [x] Persona sync on handoff — active speaker's name pushed to /play/persona NAME field before each generation fires
- [x] /play/eval live feed — `sessionLog` accumulates per-turn records; `pushToEval()` writes formatted transcript to eval iframe after every completed turn
- [x] Model list updated — Claude Sonnet/Opus 4, GPT-4.1, Llama 4 Maverick/Scout added as primary options
- [x] Temperature slider integrated — `findTemperatureSlider()` captures it outside the tone-dials scope; drives physical noise engine (random ±8° servo deviations at 500–2000 ms intervals, scaled by temperature value) during inter-turn silence
- [x] Sentiment-driven persona injection — `detectSentiment()` classifies completed turns; `injectPersonaModifier()` appends intensity tag to the largest `/play/persona` textarea when 2+ aggressive patterns match
- [x] Eval closed-loop feedback — `monitorEvalOutput()` reads the eval iframe stream; `applyEvalFeedback()` lowers ENERGY and VERBOSITY dials and returns both heads to neutral when avg score < 6.0/10
- [x] Diff uncertainty visualization — `initDiffMonitor()` watches `/play/diff`; Jaccard similarity < 0.35 triggers Trooper torso-twist side-shake (ch 10/11) and Vader shoulder raise-and-hold (ch 4/5) until outputs converge
- [x] Firmware serial ACK — `processLine()` echoes `ACK:S<ch>:<applied_angle>` after every `moveServo()` call; `relay.py` `read_serial_acks()` background task logs each echo for live Phase 3 wiring verification
- [x] Single-channel test — `run_channel_test()` in relay.py sweeps one servo in isolation; HUD **▶ Test CH** button sends `test_channel` message; `channel_test_complete` response confirms
- [x] Calibration limit recorder — **↓ Set Min** and **↑ Set Max** buttons in HUD CALIBRATION record the current slider angle and display the exact `SOFT_MIN_ANGLE[ch]`/`SOFT_MAX_ANGLE[ch]` firmware edit
- [x] Loop health watchdog — 15-second interval checks elapsed time since last turn; HUD shows ⚠️ Loop stalled after 90 s of inactivity
- [x] Session timer + animation tick-rate meter — HUD displays elapsed loop time (m:ss) updated each turn; live ticks/s display refreshes every 2 s during speech for Phase 4 speed calibration
- [x] `.gitignore` created — `server/performance_logs.json`, Python bytecode, Arduino build artefacts, and OS files excluded
- [x] Auto initial-state sync on load — `syncAll()` fires automatically once all 5 iframes reach Ready; pushes HUD defaults for Model (main page + all iframes via native prototype setter + bubbling events), Tone Dials (main page + all iframes), Pacing (choreographer iframe), and Refusal Threshold (refusal iframe); eliminates the startup desync between HUD defaults and the native page state; ↺ Sync all iframes button now calls `syncAll()` directly, also covering the main page model selector and pacing/refusal controls that the previous two-liner missed
- [x] Serial checksum integrity — `relay.py` `serial_checksum()` XOR-folds the `<channel>:<angle>` payload into a 2-digit uppercase hex value; all three serial frame builders (`handle_client`, `run_sweep_test`, `run_channel_test`) append `*<checksum>` before `\n`; firmware `processLine()` rejects any frame missing `*` or with a mismatched checksum, discarding silently without calling `moveServo()`
- [x] Browser memory saturation protection — `sessionLog` array capped at 50 entries via rolling shift-on-push inside `sendTelemetry()`; memory footprint changes from O(N) linear growth to O(1) flat; disk-based NDJSON logging in `relay.py` is unaffected — every turn still persists to `performance_logs.json`
- [x] Joint trajectory damping engine — `sendJoint()` tracks last commanded angle per pair in `lastJointAngle` Map; any delta > 20° is decomposed into 1° increments dispatched across 15 ms `setTimeout` windows; an incoming override immediately aborts the running transition via `clearTimeout` before starting its own; protects MG90S gear stacks from mechanical fatigue under large dial steps and refusal-posture snap commands
- [x] Continuous-operation firmware hardening — repeated identical commands are deduplicated without refreshing thermal timers; released channels re-energize on demand; antagonistic pairs home in staggered 80 ms groups; I²C runs at 400 kHz; strict checksum framing, 100 ms partial-frame timeout, and overflow discard prevent corrupted motion commands
- [x] Dynamic tone dial profiling on handoff — `scheduleHandoff()` applies per-character `dialValues` presets before the inter-turn pause fires: Vader next → ENERGY=85, VERBOSITY=75, WARMTH=20; Trooper next → DIRECTNESS=80, STRUCTURE=75, WARMTH=60; each updated value is propagated via `pushDialToMainPage()` and `sendJoint()` so the main-page UI, all iframes, and physical servos all reflect the incoming speaker's profile before their turn begins
- [x] Rolling dialogue history construction — `scheduleHandoff()` builds each single-turn Shape request from the persistent scene premise, `sessionLog.slice(-20)`, labelled dialogue lines, and an explicit `[NEXT SPEAKER]` marker; the first request explicitly assigns Darth Vader
- [x] Execution seeding on loop start — the `vt-loop-start` listener inspects the main-page `textarea` before firing the first generate click; if the field is empty or < 5 characters, `setReactValue()` injects a Death Star security-failure scenario seed to ensure deterministic, context-rich generation on turn 1; pre-typed operator scenarios (≥ 5 characters) are left untouched

> **All software tooling for Phases 3 and 4 is complete (v5.4.0, 2026-07-24).** The loop carries a 20-turn history, binds every request to its speaker, advances without relay connectivity, and waits for Shape's explicit completion state. Dynamic tone dial profiling applies per-character presets during inter-turn silence. Serial checksum integrity is enforced end-to-end (`S<ch>:<angle>*<hex>` format). Browser `sessionLog` remains capped at 50 turns. `sendJoint()` trajectory damping protects gear stacks on all delta > 20° transitions. The firmware has
> per-servo soft limits, echoes `ACK:S<ch>:<angle>` after each command, and cuts PWM after 1500 ms
> of static hold. `relay.py` has a full sweep, single-channel test, and live serial-ACK reader. The
> HUD CALIBRATION panel has per-channel slider, ▶ Test CH, ↓ Set Min, ↑ Set Max, and Sweep All.
> The loop section shows a session timer, live animation ticks/s, and a health watchdog. Claude Haiku 4.5
> API mandate enforced at Start Loop. Awaiting hardware.

### Phase 3 — Physical Build (enclosed, removable 16-servo stage)
- [x] Establish orientation: the metal-clasp wall with the 1/4 in entry hole is the front Service Edge / Service Wall. The opposite unclasped hinge wall is the back Audience Edge. In every top-down layout, draw the Service Wall at the bottom. Actors will face the Audience Edge, with backs toward the Service Wall.
- [x] Prepare the 13 in × 10 in × 6.5 in pine box: its lid is the display stage and the lid has been checked through its forward swing toward the audience. Clearance is preserved along the audience/hinge edge. The existing 1/4 in power-entry hole is in the lower Service Wall, centered 2 in from the left corner and 1.5 in up from the bottom; the future 14 AWG wires require electrical-tape strain relief and chafing protection, not a rubber grommet.
- [ ] Cut and mount the clear acrylic "T" gantry rigidly to the lower box wall at the metal-clasp service edge, not to the lid. With the figures and temporary PTFE paths in place, unplug 5 V power, leave tendons slack, open the lid fully forward, and confirm the moving figures, tubes, tendons, and service loops do not bind on the fixed gantry, box, table, or audience-side surface.
- [x] Verify the completed pencil layout before drilling or mounting hardware. The full-width, 1.5 in bottom tendon corridor, 3.5 in x 3.5 in bottom-left Power & Controller Zone, and `CH00`–`CH15` grid are marked. The PCA9685 driver, barrel-to-screw-terminal block, and ESP32 are laid out in the controller zone; the ESP32 USB-C port faces left toward the outer wall. The controller-zone bounds are `x=0.0–3.5 in`, `y=0.0–3.5 in`; its lower 1.5 in overlap is excluded from tendon routing. The 6.5 in x 6.5 in servo field is `x=3.5–10.0 in`, `y=1.5–8.0 in`, divided into sixteen 1.625 in cells in the documented row-major order. Every future brass/white servo output spline faces down toward the bottom tendon corridor.
- [ ] Mount the bare servos before installing controller hardware. At each marked servo position, make two starter dints and manually drive the two supplied pointy self-tapping wood screws through the plastic side tabs into the MDF; do not pre-drill or use power tools. Do not install any plastic horn or M2 spline screw at this stage. Confirm the tray lifts vertically out through the open top without unplugging individual servo leads and that every lead has a restrained service loop.
- [ ] Secure the already positioned PCA9685 driver, ESP32, and barrel-to-screw-terminal block in the marked 3.5 in x 3.5 in Power & Controller Zone. Preserve their current positions, keep the ESP32 USB-C port facing the left outer wall, and retain clearance for the 14 AWG harness, fuse holder, capacitor, and required distribution hardware.
- [ ] Build the high-current harness: connect the external adapter's barrel terminal to PCA9685 `V+` and `GND` with 14 AWG red/black wire only. Enter through the existing 1/4 in Service Wall hole, keep the electrical-tape protection intact, secure and label polarity at both ends, and keep this harness outside the 1.5 in tendon corridor.
- [ ] Build the logic harness with female-to-female Dupont jumpers only: ESP32 `3.3 V → VCC`, `GND → GND`, `GPIO 21 → SDA`, and `GPIO 22 → SCL` on the PCA9685. Route these jumpers along the outer edge of the servo field, away from 14 AWG runs, the tendon corridor, and moving mechanisms.
- [ ] Route and tie down the 16 servo leads along the tray perimeter. Keep all power, logic, servo, and tendon paths clear of servo horns, tendon spools, PTFE tubing, the lid hinge, and the power-entry hole.
- [ ] Anchor PTFE Bowden tubes (1 mm ID × 2 mm OD) to figure backs using heat-melted PVC/ABS channels plus 0.5 mm brass wire or micro zip-ties. Route arm tubes over the gantry as high-angle pulleys.
- [ ] Electrically center one labeled servo at a time using the conservative commissioning range. Once its centered position and clear travel are verified, install its mandated double-arm straight horn on the brass spline with the supplied flat-top M2 machine screw. Then install and label the 20 lb braided PE antagonistic tendon pairs between each joint hinge and its opposing double-arm horn. Keep the single-arm and four-point cross horns as spares, and set initial tendon tension with the external 5 V adapter unplugged.
- [ ] Complete the power-off inspection: no `+5 V`-to-ground short, correct rail polarity, shared ground continuity, secured terminals, strain relief, and no wire/tendon interference through the lid and tray range of motion.
- [ ] Connect the external 5 V adapter and verify one conservatively limited channel at a time before any all-channel command. Confirm label, direction, clearance, and absence of connector heating for `CH00` through `CH15`.

### Phase 4 — Integration & Calibration
- [x] Browser animation layer drives all 16-channel antagonistic pairs via `sendJoint(pair, angle)` with per-joint `CALIBRATION_CURVES` piecewise spline interpolation — head bob, arm raise, refusal postures, noise engine, diff response, and dial forwarding all address joints by name (Vader 0–7, Trooper 8–15); HUD Calibration dropdown lists all 16 channels
- [ ] First-power commissioning: run the relay's 85°–95° neutral-centered sequence on one labeled channel at a time, confirming direction, clearance, and no connector heating before proceeding to the next channel.
- [ ] Per-servo angle limits tuned — move each figure joint by hand to find physical stops; update `SOFT_MIN_ANGLE` / `SOFT_MAX_ANGLE` for all 16 channels in firmware to prevent antagonistic over-tension; use HUD Calibration slider to confirm servo obeys limits
- [ ] Per-pair calibration curves measured — after all 16 soft limits are installed, tune the five browser `CALIBRATION_CURVES` waypoints for each of the eight antagonistic pairs against the completed lid, gantry, tray, and tendon routing.
- [ ] Tone dial → servo speed mapping calibrated — run the autonomous loop and adjust the ENERGY/VERBOSITY animation interval formula until head-bob speed matches speech cadence
- [ ] Full autonomous loop tested for 10+ minutes without intervention

### Phase 5 — Evaluation & Scoring
- [x] `/play/eval` live feed connected — `sessionLog` + `pushToEval()` writes running transcript to iframe after each turn; `relay.py` continues writing NDJSON to `performance_logs.json`
- [x] Automated scoring criteria defined — five-dimension `EVAL_SCORING_CRITERIA` constant prepended to every eval submission; `runEvalScoring()` pushes transcript + criteria to `/play/eval` and triggers generation via HUD button
- [x] Session replay from `performance_logs.json` verified — `relay.py` `send_replay()` reads NDJSON on demand and sends all entries back over the WebSocket; `loadReplay()` in browser populates `/play/eval` with full log + scoring criteria; HUD “Load Replay” button triggers the end-to-end pipeline

---

*Last updated: 2026-07-24 — v5.4.0: Phase 3 uses a 13 in x 10 in x 6.5 in pine box with a lid-stage and a removable 8 in x 10 in x 1/4 in MDF motor/control tray. The external 5 V adapter, 14 AWG high-current harness, and Dupont logic harness are explicitly separated and included in the build checklist. Relay TTS, PCA9685 health checks, serialized commissioning, measured-range validation, and required power-distribution protection are documented. Final servo limits and tendon curves remain pending physical measurement.*
