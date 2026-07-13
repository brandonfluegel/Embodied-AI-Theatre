# MASTER PLAN
## Darth Vader & Imperial Stormtrooper — Autonomous Physical-Digital AI Theatre
### Architectural Blueprint & Source of Truth
### Current Version: v4.0.0 — Phase 3 Antagonistic 16-Servo Hardware Pivot

---

## 1. Overall Vision

We are building an autonomous, closed-loop, physical-digital AI theatre that runs on a desktop. The project breaks the glass screen of traditional AI chatbots by giving two digital personas — Darth Vader and an Imperial Stormtrooper — physical forms, voices, and coordinated bodily gestures.

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

**Key mechanical implication:** Both Black Series figures feature built-in mechanical pivot pins at the neck, shoulders, and torso. Each pivot is now driven by an **antagonistic pair** of tendons tied directly to the plastic joint hinge — one line pulls the joint one way, its partner pulls it back — so no gesture depends on gravity to reset. Every tendon runs inside a low-friction PTFE (Teflon) Bowden tube glued to the back of the figure; arm lines are redirected up the Transparent Acrylic Gantry mounted behind the stage to pull the shoulders up and out, while the remaining lines route down through the display stage base to the 16 servos hidden beneath the deck. See Section 3 for the full antagonistic strategy and channel map.

---

## 3. Mechanical Movement Strategy — 16-Servo Antagonistic Design

Physical movement is driven by a full **16-servo antagonistic (pull-pull) system** — eight channels per character — mounted beneath the stage deck and driven by a single PCA9685 board using all 16 of its channels. This replaces the earlier 6-servo single-tendon "pull and let gravity drop" approach.

The previous design pulled each limb with a single tendon and relied on gravity (or a return spring) to reset it. Gravity return is slow, imprecise, and jittery: the limb sags to wherever the figure's own weight settles and light plastic joints bounce. The antagonistic design eliminates this entirely. Every axis of motion is controlled by **two opposing tendons** — one servo winds line to pull the joint one way while its partner pays out line, and the roles reverse to drive it back. Because tension is always held on both sides, each joint holds an absolute, jitter-free 3D position with no dependence on gravity.

### Antagonistic Tendon Routing

Each degree of freedom is a matched servo pair working in opposition:

- One servo winds line to pull the joint in one direction (e.g. head nod down)
- Its antagonist winds the opposing line to pull it back (e.g. head lifts back up)
- Neutral is a balance point where both tendons hold equal tension
- The controller drives the pair in complementary directions, so there is always active tension on both sides and zero backlash

To eliminate the friction losses that would otherwise fight the antagonistic tension, every tendon now runs inside a **PTFE (Teflon) Bowden tube — 2 mm OD / 1 mm ID**. The tubes are glued flat to the backs of the plastic figures with thick CA glue so each line slides through a low-friction sheath from the joint anchor all the way down to the servo horn, rather than dragging across plastic edges.

### The Transparent Acrylic Gantry

Pulling the arms *upward and outward* is impossible from below the stage without a redirection point. A **Transparent Acrylic Gantry** provides one, mounted invisibly behind the figures:

- A 1/8" (3 mm) clear cast-acrylic board cut into a "T" shape stands behind the two figures
- Because it is optically clear, it disappears against the backdrop under stage lighting
- The PTFE Bowden tubes route up the gantry and over its top edge, which acts as a **high-angle pulley**
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

> **Software integration note:** As of v4.0.0 the browser animation layer (`vader_trooper.user.js`) drives the antagonistic pairs directly. A `sendJoint(pair, angle)` helper sends each joint's target angle to `pullA` and its complement (180−angle) to `pullB`. The head-bob loop, arm-raise gesture (shoulder pair lifted up-and-out over the gantry), refusal postures, temperature-noise engine, diff-uncertainty response, and dial→servo forwarding all address joints by name (`JOINTS.VADER_HEAD`, `JOINTS.TROOPER_SHOULDER`, …). Per-servo tension limits are still tuned during Phase 4 calibration.

---

## 4. Embodied Speech & Interactive Conversation Loop

### Stage 1 — Real-Time Text Generation Hook

The userscript does not track mouse clicks or raw slider positions to trigger speech. Instead, it deploys a `MutationObserver` targeted directly at the generation output box at the bottom of the shape-models.com playground. The observer fires the exact millisecond new tokens begin streaming onto the screen after the **Run with this tone** button is pressed.

A debounce timer (850 ms) resets on every incoming chunk. When the page goes quiet for 850 ms — meaning the stream has genuinely ended and not merely paused — the full text block is extracted, stripped of UI chrome (model name, "IDLE" label, "OUTPUT" heading), and passed downstream as a clean prose string.

### Stage 2 — Web Speech Text-to-Speech

The cleaned text string is immediately handed to the browser's native `window.speechSynthesis` API — no external service, no API key, no network round-trip. A dedicated US-English voice is selected per character. Darth Vader targets deep male voices (David, Mark, Guy, James on Windows); the Stormtrooper targets sharper voices (Zira, Hazel, Aria, Jenny) and actively avoids Vader's voice set. Both fall through gracefully to any available en-US voice if the preferred names are not installed on the host OS.

Two dial parameters shape the utterance in real time before each sentence is spoken:

| Dial | Voice effect | Range |
|---|---|---|
| ENERGY | Speech rate | 0.75 (slow) → 1.40 (rapid) |
| WARMTH | Pitch | 0.85 (low) → 1.15 (warm) |

The interaction operates as a **closed-loop automated theatre**. When the active utterance fires its `onend` event, the userscript copies the completed text block, programmatically inputs it into the opposing character's prompt window, and triggers the next generation phase. The debate alternates between Darth Vader and the Imperial Stormtrooper indefinitely without any manual user action.

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
    ↓  850 ms debounce confirms stream end
    ↓  text stripped of UI labels
    ↓
[window.speechSynthesis.speak(utterance) — character-specific voice selected]
    ↓  utterance.onstart  → stopNoiseInterval() — Temperature noise silenced
    ↓                     → head-bob loop starts on active speaker's head nod pair (ch 0/1 Vader | ch 8/9 Trooper)
    ↓                     → arm gesture scheduled at ~40% through utterance (shoulder pair ch 4/5 Vader | ch 12/13 Trooper → 135° for 700 ms)
    ↓  utterance.onend   → loop cleared, speaker head → S<ch>:90, entry pushed to sessionLog
    ↓                     → pushToEval() writes live transcript + scoring criteria to /play/eval
    ↓
[scheduleHandoff]
    ↓  resolveDiffUncertainty() if diff divergence is currently active
    ↓  detectSentiment(completedText) → updateSentimentDisplay()
    ↓  syncPersonaField('NAME', …) + injectPersonaModifier() → /play/persona backstory
    ↓  startNoiseInterval() — Temperature noise resumes during inter-turn gap
    ↓  waits hudTurnPause delay (200–3000 ms, HUD-controlled)
    ↓  pastes completed text into opposing character's prompt
    ↓  triggers next generation phase
    ↓
[loop repeats indefinitely]
```

### Stage 4 — Dramatic Refusal Triggers

The /play/refusal playground lets you define boundary phrases — words or patterns the AI should refuse to engage with. When the MutationObserver detects one of these patterns in the streaming output, the script does not continue the normal speech-and-animation flow. Instead it executes a defensive interrupt sequence:

1. The running `speechSynthesis` utterance is immediately cancelled
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
| `text` | The full spoken text block |
| `char_count` | Character length of the text |
| `turn_number` | Sequential turn index in the current session |
| `dial_snapshot` | All six dial normalized values (0–100) at generation time |
| `speech_rate` | Computed `utterance.rate` value used for playback |

This log persists to disk across sessions. A parallel in-memory `sessionLog` array mirrors the same records inside the browser. After every completed turn, `pushToEval()` formats the full session as a running `[Turn N] SPEAKER: text…` transcript and writes it directly into the `/play/eval` iframe's prompt input for real-time automated scoring — no manual file handling required.

### Stage 6 — Dynamic Real-Time Adaptations

Four autonomous behaviour systems run in parallel with the core speech loop, reading live conversation data and adjusting the physical performance in real time.

**Temperature Noise Engine** — `findTemperatureSlider()` captures the Temperature slider outside the tone-dials section using inverse DOM logic (ancestor contains “TEMPERATURE” but none of the six dial names). The normalised value (0–100) is stored in `temperatureValue`. During inter-turn silence, `startNoiseInterval()` fires `applyTemperatureNoise()` at 2000–500 ms intervals (scaled to temperature), injecting random ±8° deviations on random servo channels to simulate physical restlessness. The noise loop stops the instant `utterance.onstart` fires and restarts inside `scheduleHandoff()`. High temperature produces fidgety, restless figures; low temperature produces stillness.

**Sentiment-Driven Persona Injection** — Every handoff calls `detectSentiment(completedText)`, which tests the completed turn against four aggressive-language regex patterns (threats, challenges, degrading terms). Two or more matches set sentiment to `'aggressive'`. `injectPersonaModifier()` then appends an emotional intensity tag to the largest textarea inside the `/play/persona` iframe using the React native-prototype setter. The modifier is stripped and replaced on each subsequent turn so it never accumulates. A live **Sentiment** badge in the HUD updates green (`neutral`) or red (`aggressive`) in real time.

**Eval Closed-Loop Feedback** — `runEvalScoring()` calls `monitorEvalOutput()` before triggering generation. A one-shot MutationObserver waits on the `/play/eval` output area; `parseEvalScore()` extracts all `N/10` patterns from the scoring response and averages them. If the average falls below **6.0/10**, `applyEvalFeedback()` reduces `dialValues.ENERGY` and `dialValues.VERBOSITY` by up to 30 points, pushes the new values to the main page and all iframes, sends updated servo positions to both affected channels, and returns both heads to 90° neutral. The event is also logged to relay.py for the terminal record.

**Diff Uncertainty Visualization** — `initDiffMonitor()` sets up a persistent MutationObserver on the `/play/diff` iframe body. After each mutation burst, `checkDiffOutputs()` identifies the two richest output-like text blocks and computes their Jaccard word-overlap similarity. Similarity below **0.35** (< 35% shared vocabulary = wildly divergent outputs) triggers `triggerDiffUncertainty()`: the **Trooper torso twist pair (ch 10/11)** swings side-to-side three times at 200 ms intervals — shaking his whole body — and the **Vader shoulder pair (ch 4/5)** raises to 135° and holds, both driven by `sendJoint()`. The physical state resolves automatically when similarity recovers or at the next `scheduleHandoff()` boundary.

---

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

Each dial forwards its position to a joint through `sendJoint()`, which drives the pair antagonistically (`pullA` → angle, `pullB` → 180−angle). The elbow pairs (ch 6/7, ch 14/15) are reserved for future gestures and are not currently dial-bound.

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
| Model Selection | Syncs the chosen AI model to all five background iframes simultaneously |
| Tone Dials | Six sliders mirroring the main page dials; changes push to main page AND all iframes |
| Persona | Darth Vader and Stormtrooper name fields; the incoming speaker's name is auto-pushed to /play/persona's NAME field on every conversation handoff so the model always generates from the correct character identity |
| Pacing | Bob Speed blends live with ENERGY+VERBOSITY to set animation tick rate; Turn Pause maps 0–100 → 200–3000 ms inter-turn gap; both push values to /play/choreographer on every change |
| Refusal Threshold | Pushes live to /play/refusal's first boundary range control via React-compatible setter |
| Evaluation | “📊 Score Session” pushes `sessionLog` + five-dimension scoring criteria to `/play/eval` and clicks generate; “📋 Load Replay” fetches `performance_logs.json` from relay.py and populates `/play/eval` for scoring of past sessions |
| Iframe Status | Live 🟢/🟡/🔴 indicator for each of the five background iframes |
| Sync All | Calls `syncAll()` — pushes Model, Tone Dials, Pacing, and Refusal Threshold to the main `/play/tone` DOM **and** every ready iframe simultaneously; also fires automatically on page load once all 5 iframes reach Ready, eliminating HUD-vs-page startup desync without a manual click |
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

A persistent startup desync previously existed between the HUD's default values (e.g. the Model dropdown showing "Claude Sonnet 4") and the native page state (e.g. the site's own selector still showing "Llama 3.2 1B"). The values only aligned when the operator manually clicked ↺ Sync all iframes.

This is resolved by a readiness gate inside `injectIframes()`. After each iframe's 2500 ms hydration timer fires and marks the frame Ready, the script checks `Object.values(iframes).every(f => f.ready)`. When the last of the 5 iframes crosses that threshold, `syncAll()` runs once automatically:

1. **Model** — scans `<select>` / `[role="combobox"]` on the main `/play/tone` page with the native prototype setter + bubbling `input`/`change` events, then calls `syncModelToIframes` for all iframes.
2. **Tone dials** — `pushDialToMainPage` writes each of the 6 dials to the native sliders on the main page; `syncAllDials` mirrors them to all iframes.
3. **Pacing** — `syncChoreographerSlider(0, hudBobSpeed)` and `syncChoreographerSlider(1, hudTurnPause)` push the HUD defaults to the choreographer iframe.
4. **Refusal threshold** — `syncRefusalThreshold` reads the HUD slider value and pushes it to the refusal iframe.

The ↺ Sync all iframes HUD button is now bound directly to `syncAll()`, covering all four steps including the main page model selector and pacing/refusal controls that the previous two-liner missed.

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
| Microcontroller | ESP32 Type-C development board | Receives serial commands, drives PCA9685 via I2C |
| PWM driver | PCA9685 16-channel board | Converts I2C commands to 50 Hz PWM signals for all 16 channels |
| Servos (×16) | MG90S micro servo, metal gear | Antagonistic actuation — 8 channels per character |
| Servo power supply | 5 V / 15 A (75 W) switching adapter | Dedicated high-current rail for 16 servos under antagonistic tension |
| Power connector | Female barrel-to-screw-terminal block | Breaks the adapter barrel jack out to the PCA9685 V+ rail |
| Tendon line | 20 lb black braided PE fishing line | Zero-stretch, zero-memory tendon — holds antagonistic tension precisely |
| Tendon sheath | PTFE tubing, 1 mm ID × 2 mm OD (3 m) | Low-friction Bowden routing on the backs of the figures |
| Gantry | 1/8" (3 mm) clear cast acrylic sheet, 12" × 12" | Invisible "T" board — high-angle pulley for arm lifts |
| Adhesive | Thick CA glue (cyanoacrylate) | Bonds PTFE tubes to the figures and the gantry |
| Cable management | Mini zip ties | Bundles the 16 servo leads and tendon runs |
| Host computer | Lenovo ThinkPad | Runs relay.py, browser userscripts, and HTML dashboard |

### Bill of Materials (Phase 3 Antagonistic Upgrade)

- **ESP32 + PCA9685** — unchanged controller stack, now using all 16 channels
- **16× MG90S micro servos** (metal gear)
- **5 V / 15 A (75 W) switching adapter** with a female barrel-to-screw-terminal block
- **20 lb black braided PE fishing line** (zero stretch, zero memory)
- **3 m of 1 mm ID × 2 mm OD PTFE tubing**
- **1/8" (3 mm) clear cast acrylic sheet, 12" × 12"**
- **Thick CA glue** (cyanoacrylate) + **mini zip ties** for cable management

### Wiring Diagram

```
ThinkPad (USB)
    │
    └── ESP32 (GPIO 21 SDA, GPIO 22 SCL)
            │
            └── PCA9685 (all 16 channels)
                    │
                    ├── CH 0  ── Vader head nod     — pull down
                    ├── CH 1  ── Vader head nod     — pull back
                    ├── CH 2  ── Vader torso twist  — pull left
                    ├── CH 3  ── Vader torso twist  — pull right
                    ├── CH 4  ── Vader shoulder     — pull up-forward
                    ├── CH 5  ── Vader shoulder     — pull down-back
                    ├── CH 6  ── Vader elbow        — curl in
                    ├── CH 7  ── Vader elbow        — extend out
                    ├── CH 8  ── Trooper head nod   — pull down
                    ├── CH 9  ── Trooper head nod   — pull back
                    ├── CH 10 ── Trooper torso twist — pull left
                    ├── CH 11 ── Trooper torso twist — pull right
                    ├── CH 12 ── Trooper shoulder   — pull up-forward
                    ├── CH 13 ── Trooper shoulder   — pull down-back
                    ├── CH 14 ── Trooper elbow      — curl in
                    └── CH 15 ── Trooper elbow      — extend out

5V/15A Adapter ── barrel-to-screw-terminal block ── PCA9685 V+ rail (isolated from ThinkPad logic)
```

### Power Isolation & Current Budget

Sixteen MG90S servos held under constant antagonistic tension draw far more current than the previous six gravity-return servos, whose idle channels drew almost nothing. Because both tendons in every pair are actively tensioned at all times, all 16 servos can be under load simultaneously. The supply is therefore upgraded from **5 V / 3 A (15 W)** to a **5 V / 15 A (75 W)** switching adapter.

- The adapter's barrel jack terminates in a **female barrel-to-screw-terminal block**, which breaks out to the PCA9685 **V+ rail** with a solid screwed connection rated for the higher current.
- The 15 A supply feeds **only** the PCA9685 V+ rail; the ThinkPad USB port provides logic power to the ESP32 only — no servo current passes through the USB bus.
- All grounds (ESP32 GND, PCA9685 GND, and adapter GND) are connected at a single shared ground point.
- Mini zip ties bundle the 16 servo leads to keep the high-current runs tidy and strain-relieved.

### Communication Stack

| Layer | Protocol | Baud / Port | Direction |
|---|---|---|---|
| Browser → Python | WebSocket | `ws://localhost:8765` | Browser userscript → relay.py |
| Python → ESP32 | USB Serial | 115200 baud | relay.py → ESP32 |
| ESP32 → PCA9685 | I2C | 400 kHz (fast mode) | ESP32 → PCA9685 |
| PCA9685 → Servos | PWM | 50 Hz | PCA9685 → MG90S ×16 |

### Serial Command Format

```
S<channel>:<angle>\n

Examples:
  S0:120   →  Vader head nod — pull-down tendon winds in
  S1:60    →  Vader head nod — pull-back tendon pays out
  S8:120   →  Trooper head nod — pull-down tendon winds in
  S12:135  →  Trooper shoulder — pull up-forward (arm lifts via gantry)
```

Angles arrive from the browser as 0–180° and are clamped first by `processLine()`, then by each channel’s `SOFT_MIN_ANGLE` / `SOFT_MAX_ANGLE` inside `moveServo()`. Channels 0–15 are valid; edit the 16-entry soft-limit arrays in the firmware and reflash during Phase 4 to match each figure’s physical stop points and prevent antagonistic over-tension. All other channels are silently ignored.

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
│   └── vader_trooper.user.js           ← v3.4.1 unified matrix userscript
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

> **Status as of 2026-07-13 — Software pipeline v3.4.1; hardware plan pivoted to the v4.0.0 Antagonistic 16-Servo design.**
> Digital stack complete with four active dynamic behaviour layers.
> Both figures animate independently per speaker. Temperature drives physical noise between turns. Dialogue
> sentiment automatically modulates the /play/persona backstory. The eval iframe feeds a closed-loop score
> monitor that adjusts live dial values. The /play/diff iframe triggers physical uncertainty responses.
> Firmware has per-servo soft limits; relay.py has a sweep-test; HUD has a full Calibration panel.
> All 5 iframes now auto-sync HUD defaults (Model, Tone Dials, Pacing, Refusal) to the main page and all
> iframes on load — no manual Sync click required. All software work is complete — awaiting hardware.

### Phase 1 — Digital Pipeline (software only)
- [x] `relay.py` — WebSocket server receives dial data, forwards to ESP32 via serial
- [x] `esp32_servo_controller.ino` — ESP32 firmware parses `S<ch>:<angle>` commands
- [x] `vader_trooper.user.js` — Tampermonkey userscript binds to tone dials on shape-models.com

### Phase 2 — Speech & Loop (browser automation)
- [x] Web Speech API voice synthesis integrated into userscript
- [x] Syllable-synchronized head-bob loop (ENERGY + VERBOSITY scaled interval, ch 0/1)
- [x] MutationObserver output-stream detection with 850 ms debounce
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

> **All software tooling for Phases 3 and 4 is complete as of 2026-07-11.** The firmware has
> per-servo soft limits and echoes `ACK:S<ch>:<angle>` after each command. `relay.py` has a
> full sweep, single-channel test, and live serial-ACK reader. The HUD CALIBRATION panel has
> per-channel slider, ▶ Test CH, ↓ Set Min, ↑ Set Max, and Sweep All. The loop section shows a
> session timer, live animation ticks/s, and a health watchdog. v3.4.1 adds automatic full-state
> sync on page load — HUD defaults propagate to the main page and all iframes immediately without
> a manual Sync click. Awaiting hardware.

### Phase 3 — Physical Build (hardware — Antagonistic 16-Servo Upgrade)
- [ ] Stage base constructed with mounting positions for all 16 servos
- [ ] Transparent acrylic "T" gantry cut from 1/8" clear cast acrylic and mounted invisibly behind the figures
- [ ] PTFE Bowden tubes (1 mm ID × 2 mm OD) glued to the backs of the figures with thick CA glue; arm tubes routed over the gantry as high-angle pulleys
- [ ] Antagonistic tendon pairs (20 lb braided PE line) anchored to each joint hinge and to opposing servo horns
- [ ] All 16 MG90S servos wired to the PCA9685 and tested independently (relay sweep covers ch 0–15)
- [ ] 5 V / 15 A supply wired through the barrel-to-screw-terminal block, isolated and verified safe under full antagonistic load

### Phase 4 — Integration & Calibration
- [x] Browser animation layer remapped from the legacy 6-channel scheme onto the 16-channel antagonistic pairs — `sendJoint(pair, angle)` drives every joint (`pullA` → angle, `pullB` → 180−angle); head bob, arm raise, refusal postures, noise engine, diff response, and dial forwarding all address joints by name (Vader 0–7, Trooper 8–15); HUD Calibration dropdown lists all 16 channels
- [ ] Per-servo angle limits tuned — move each figure joint by hand to find physical stops; update `SOFT_MIN_ANGLE` / `SOFT_MAX_ANGLE` for all 16 channels in firmware to prevent antagonistic over-tension; use HUD Calibration slider to confirm servo obeys limits
- [ ] Tone dial → servo speed mapping calibrated — run the autonomous loop and adjust the ENERGY/VERBOSITY animation interval formula until head-bob speed matches speech cadence
- [ ] Full autonomous loop tested for 10+ minutes without intervention

### Phase 5 — Evaluation & Scoring
- [x] `/play/eval` live feed connected — `sessionLog` + `pushToEval()` writes running transcript to iframe after each turn; `relay.py` continues writing NDJSON to `performance_logs.json`
- [x] Automated scoring criteria defined — five-dimension `EVAL_SCORING_CRITERIA` constant prepended to every eval submission; `runEvalScoring()` pushes transcript + criteria to `/play/eval` and triggers generation via HUD button
- [x] Session replay from `performance_logs.json` verified — `relay.py` `send_replay()` reads NDJSON on demand and sends all entries back over the WebSocket; `loadReplay()` in browser populates `/play/eval` with full log + scoring criteria; HUD “Load Replay” button triggers the end-to-end pipeline

---

*Last updated: 2026-07-13 — v4.0.0 hardware pivot: Phase 3 mechanical strategy upgraded from a 6-servo single-tendon gravity-return system to a full 16-servo antagonistic (pull-pull) design (Vader ch 0–7, Trooper ch 8–15). Tendons now run in PTFE Bowden tubes routed up a transparent acrylic gantry that acts as a high-angle pulley for arm lifts. Hardware list updated: 16× MG90S, 5 V/15 A supply with barrel-to-screw-terminal block, 20 lb braided PE line, PTFE tubing, clear cast acrylic, CA glue. Sections 2, 3, and 8 rewritten; firmware and relay updated to 16 channels. Browser userscript (v4.0.0) remapped onto the antagonistic pairs via a `sendJoint()` helper — head bob, arm raise, refusal postures, noise engine, diff response, and dial forwarding all address joints by name; HUD Calibration lists all 16 channels.*
