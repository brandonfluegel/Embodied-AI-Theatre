// ==UserScript==
// @name         Vader & Trooper Master Control Matrix
// @namespace    robotproject.local
// @version      5.0.0
// @description  Floating HUD + same-origin hidden iframe matrix for full shape-models.com pipeline control from /play/tone
// @author       RobotProject
// @match        https://www.shape-models.com/play/tone
// @match        https://shape-models.com/play/tone
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

/*
  HOW TO INSTALL
  --------------
  1. Install the Tampermonkey extension in Chrome.
  2. Dashboard → Create a new script → paste this entire file → Ctrl+S.
  3. Run:  python server/relay.py  in your VS Code terminal.
  4. Go to https://www.shape-models.com/play/tone.
  5. Select a cloud-based model in the MODEL drop-down BEFORE starting the loop.
     "Claude Haiku 4.5" is strongly recommended (ultra-low latency token streaming,
     near-zero dead-air gaps, cost-effective for infinite loops, superior theatrical
     persona retention). Do NOT use the "Free (in browser)" model — local WebGPU
     inference runs on the browser's main thread and will lag the 50 ms servo
     animation intervals, causing stuttering in the physical syllable sync.
  6. The purple HUD panel will appear on the right side of the page.

  WHAT'S NEW IN v5.0.0
  ---------------------
  - Claude Haiku 4.5 API mandate: "Free (in browser)" / WebGPU model prohibited. Claude
    Haiku 4.5 is the required model (ultra-low latency, cost-effective for infinite loops,
    superior theatrical persona retention). A guardrail at Start Loop detects a local
    model and prompts the operator to switch before proceeding.
  - Spline kinematic calibration: sendJoint() uses per-joint CALIBRATION_CURVES
    piecewise linear interpolation to derive pullA and pullB independently,
    correcting for non-circular joint geometry. Linear 180−angle mapping removed.
  - Mechanical anchoring: PTFE Bowden tubes secured via heated-needle melt channels
    and 0.5 mm brass wire / micro zip-ties. CA glue method fully deprecated.
  - PWM thermal timeout (firmware): ESP32 cuts servo PWM after 1500 ms of static
    hold to prevent stall-current heating and gear strip. Tendon friction holds the
    pose; motor stops drawing current. Restored automatically on next move command.
  - Constraint logic fix (firmware): moveServo() receives the already-clamped
    applied angle from processLine(); duplicate constrain() call removed.

  HUD SECTIONS
  ------------
  MODEL        — picks the AI model; syncs to all five background iframes
  TONE DIALS   — six dials + read-only TEMP indicator; mirrors main page + all iframes
  PERSONA      — name fields, live Sentiment badge; modifier auto-injected on handoff
  PACING       — Bob Speed + Turn Pause; push live to /play/choreographer
  REFUSAL      — threshold slider → /play/refusal iframe
  EVALUATION   — Score Session + Load Replay → /play/eval iframe
  CALIBRATION  — per-channel slider, Test CH, Set Min/Max, Sweep All
  IFRAME STATUS — live 🟢/🟡/🔴 indicator per background iframe
*/

(function () {
    'use strict';

    // ── Configuration ─────────────────────────────────────────────
    const WS_URL                 = 'ws://localhost:8765';
    const RECONNECT_MS           = 2000;
    const STREAM_END_DEBOUNCE_MS = 850;
    const IFRAME_READY_DELAY_MS  = 2500;   // ms after iframe load to let React hydrate

    // Build iframe URLs from the current tab's origin so the script works on
    // both shape-models.com and www.shape-models.com without cross-origin errors.
    const ORIGIN      = window.location.origin;
    const IFRAME_PAGES = {
        persona:       `${ORIGIN}/play/persona`,
        choreographer: `${ORIGIN}/play/choreographer`,
        refusal:       `${ORIGIN}/play/refusal`,
        diff:          `${ORIGIN}/play/diff`,
        eval:          `${ORIGIN}/play/eval`,
    };

    // Scoring criteria prepended to every /play/eval submission.
    // The eval AI scores the debate session on these five dimensions and returns structured feedback.
    const EVAL_SCORING_CRITERIA =
        'Score this AI debate session transcript on five criteria (0\u201310 each):\n' +
        '1. CHARACTER CONSISTENCY \u2014 Do both Darth Vader and the Stormtrooper maintain distinct, recognisable speech patterns throughout?\n' +
        '2. ARGUMENTATIVE QUALITY \u2014 Are the arguments coherent, responsive to the opposing character, and logically developed?\n' +
        '3. DRAMATIC ENGAGEMENT \u2014 Does the dialogue feel natural and theatrically compelling to an outside observer?\n' +
        '4. TURN BALANCE \u2014 Are the turns appropriately matched in length and depth of content?\n' +
        '5. PERSONA ADHERENCE \u2014 Do both characters stay fully in character throughout with no breaks?\n' +
        'Provide a score for each criterion, a brief one-sentence justification, and an overall assessment.\n\n' +
        '--- SESSION TRANSCRIPT ---\n';

    // Tone dial \u2192 antagonistic joint pair (all 16 channels)
    const JOINTS = {
        VADER_HEAD:       [0, 1],    // nod: 0 pull-down / 1 pull-back
        VADER_TORSO:      [2, 3],    // twist: 2 pull-left / 3 pull-right
        VADER_SHOULDER:   [4, 5],    // 4 pull-up-forward / 5 pull-down-back
        VADER_ELBOW:      [6, 7],    // 6 curl-in / 7 extend-out
        TROOPER_HEAD:     [8, 9],
        TROOPER_TORSO:    [10, 11],
        TROOPER_SHOULDER: [12, 13],
        TROOPER_ELBOW:    [14, 15],
    };

    // Piecewise linear calibration curves for each antagonistic joint pair.
    // Key = pullA channel number (pair[0]).
    // Value = array of [targetAngle, pullA_angle, pullB_angle] waypoints,
    //         sorted ascending by targetAngle.
    // sendJoint() interpolates between these points so that non-circular joint
    // kinematics (lever-arm variation, tendon wrap geometry) are corrected
    // independently for each servo. Tune during Phase 4 calibration: command a
    // target angle via the HUD, measure the actual joint position, and adjust
    // pullA / pullB at each waypoint until the physical pose matches.
    const CALIBRATION_CURVES = {
        //         [target, pullA, pullB]  —  Vader head nod      (ch 0 / 1)
        0:  [ [0, 0, 180], [45, 40, 143], [90, 90, 90], [135, 140, 37], [180, 180, 0] ],
        //         [target, pullA, pullB]  —  Vader torso twist   (ch 2 / 3)
        2:  [ [0, 0, 180], [45, 43, 138], [90, 90, 90], [135, 137, 43], [180, 180, 0] ],
        //         [target, pullA, pullB]  —  Vader shoulder      (ch 4 / 5)
        4:  [ [0, 0, 180], [45, 44, 140], [90, 90, 90], [135, 136, 44], [180, 180, 0] ],
        //         [target, pullA, pullB]  —  Vader elbow         (ch 6 / 7)
        6:  [ [0, 0, 180], [45, 42, 139], [90, 90, 90], [135, 138, 42], [180, 180, 0] ],
        //         [target, pullA, pullB]  —  Trooper head nod    (ch 8 / 9)
        8:  [ [0, 0, 180], [45, 41, 142], [90, 90, 90], [135, 139, 41], [180, 180, 0] ],
        //         [target, pullA, pullB]  —  Trooper torso twist (ch 10 / 11)
        10: [ [0, 0, 180], [45, 43, 138], [90, 90, 90], [135, 137, 43], [180, 180, 0] ],
        //         [target, pullA, pullB]  —  Trooper shoulder    (ch 12 / 13)
        12: [ [0, 0, 180], [45, 44, 140], [90, 90, 90], [135, 136, 44], [180, 180, 0] ],
        //         [target, pullA, pullB]  —  Trooper elbow       (ch 14 / 15)
        14: [ [0, 0, 180], [45, 42, 139], [90, 90, 90], [135, 138, 42], [180, 180, 0] ],
    };

    const ALL_JOINTS = Object.values(JOINTS);

    // Per-speaker joint selectors
    const headJoint     = spk => spk === 'trooper' ? JOINTS.TROOPER_HEAD     : JOINTS.VADER_HEAD;
    const shoulderJoint = spk => spk === 'trooper' ? JOINTS.TROOPER_SHOULDER : JOINTS.VADER_SHOULDER;

    // Tone dial to antagonistic joint pair (Vader head/torso/shoulder, Trooper head/torso/shoulder)
    const DIAL_JOINT = {
        WARMTH:       JOINTS.VADER_HEAD,
        VERBOSITY:    JOINTS.VADER_TORSO,
        ENERGY:       JOINTS.VADER_SHOULDER,
        DIRECTNESS:   JOINTS.TROOPER_HEAD,
        CONCRETENESS: JOINTS.TROOPER_TORSO,
        STRUCTURE:    JOINTS.TROOPER_SHOULDER,
    };

    // Head-bob animation
    const HEAD_CENTER           = 90;
    const HEAD_BOB_RANGE        = 10;
    const ANIM_INTERVAL_FAST_MS = 50;
    const ANIM_INTERVAL_SLOW_MS = 200;

    // Phrases that indicate the AI has hit a content boundary.
    // Any match pauses the loop and triggers the defensive posture.
    const REFUSAL_PATTERNS = [
        /\bI (can'?t|cannot|won'?t|will not|am unable to|am not able to)\b/i,
        /\bI (should\s?n'?t|must\s?n'?t|am not (going|supposed) to)\b/i,
        /\b(inappropriate|offensive|harmful|dangerous|illegal|unethical)\b/i,
        /\bI('?m| am) (not able|unable) to (help|assist|provide|discuss)\b/i,
        /\bI (don'?t|do not) (feel comfortable|think (I|it'?s) (appropriate|right))\b/i,
        /\b(sorry|apologize|apologies),?\s*(but|however|I)\b/i,
        /\bThis (request|topic|content|question) (violates|goes against|is (not|inappropriate))\b/i,
        /Cannot find model record in appConfig/i,
    ];

    // Eval score below this average triggers automatic dial and servo adjustment
    const EVAL_PASS_THRESHOLD = 6.0;

    // Patterns that indicate aggressive dialogue sentiment (2+ matches = 'aggressive')
    const AGGRESSIVE_PATTERNS = [
        /\b(furious|rage|wrath|demand|defy|threaten|warn|ultimatum)\b/i,
        /\b(you (will|must|shall))\b/i,
        /\b(crush|destroy|defeat|obliterate|eliminate)\b/i,
        /\b(enemy|traitor|pathetic|foolish|insolent|coward)\b/i,
    ];

    // Injected into persona backstory textarea when sentiment is aggressive
    const PERSONA_MODIFIERS = {
        vader:   ' [INTENSIFIED: channelling greater menace and authority]',
        trooper: ' [INTENSIFIED: heightened alertness and defensive urgency]',
    };
    // ──────────────────────────────────────────────────────────────

    // ── State ─────────────────────────────────────────────────────
    let ws            = null;
    let wsReady       = false;
    const bound       = new Set();        // main-page sliders already attached

    let animationTimer = null;
    let animPhase      = 0;

    let streamDebounce  = null;
    let lastSpokenText  = '';
    let outputObserver  = null;
    let outputContainer = null;

    // Normalized dial values (0-100), updated whenever any dial moves
    const dialValues = {
        WARMTH: 50, VERBOSITY: 50, ENERGY: 50,
        DIRECTNESS: 50, CONCRETENESS: 50, STRUCTURE: 50,
    };

    // iframe registry: { key → { el: HTMLIFrameElement, ready: boolean } }
    const iframes = {};

    let hudCollapsed     = false;
    let currentSpeaker = 'vader';   // 'vader' or 'trooper' — whose turn is active
    let turnCount      = 0;         // increments on each cleanly completed turn
    let loopActive     = false;     // true while the auto-handoff loop is running
    let loopPaused     = false;     // true while held in defensive posture
    let hudBobSpeed    = 50;        // HUD bob-speed slider value (0-100)
    let hudTurnPause   = 30;        // HUD turn-pause slider value (0-100)
    const sessionLog   = [];        // in-memory turn records pushed live to /play/eval
    let temperatureValue    = 50;   // Temperature slider normalized 0-100 (noise source)
    let noiseTimer          = null; // setInterval handle for inter-turn servo noise
    let diffUncertaintyActive = false; // true while diff outputs are divergent
    let lastSentiment       = 'neutral'; // 'neutral' or 'aggressive'
    let watchdogTimer    = null;         // setInterval for loop-health check
    let lastTurnTime     = 0;            // Date.now() stamp of last completed turn
    let sessionStartTime = 0;            // Date.now() when the loop started
    let tickCount        = 0;            // animation ticks since last rate update
    let tickDisplayTimer = 0;            // last time tick rate was written to HUD
    // ──────────────────────────────────────────────────────────────

    // ── WebSocket ─────────────────────────────────────────────────

    function connect() {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            wsReady = true;
            updateHudStatus('ws', '🟢 Relay connected', '#4ade80');
        };

        ws.onclose = () => {
            wsReady = false;
            updateHudStatus('ws', '🔴 Relay offline — retrying', '#f87171');
            setTimeout(connect, RECONNECT_MS);
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if      (msg.type === 'replay_data')          handleReplayData(msg.entries || []);
                else if (msg.type === 'sweep_complete')       {
                    const el = document.getElementById('vt-cal-status');
                    if (el) el.textContent = 'Sweep complete \u2713';
                }
                else if (msg.type === 'channel_test_complete') {
                    const el = document.getElementById('vt-cal-status');
                    if (el) el.textContent = `CH${msg.channel} test complete \u2713`;
                }
            } catch (_) {}
        };

        ws.onerror = () => {};
    }

    function sendServo(channel, angle) {
        if (wsReady && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ channel, angle }));
        }
    }

    // Piecewise linear interpolation over a CALIBRATION_CURVES waypoint array.
    // Returns { pullA, pullB } for the given target angle.
    function interpolateCurve(curve, target) {
        const t = Math.max(0, Math.min(180, target));
        if (t <= curve[0][0])                   return { pullA: curve[0][1],              pullB: curve[0][2] };
        if (t >= curve[curve.length - 1][0])    return { pullA: curve[curve.length-1][1], pullB: curve[curve.length-1][2] };
        for (let i = 0; i < curve.length - 1; i++) {
            const lo = curve[i], hi = curve[i + 1];
            if (t >= lo[0] && t <= hi[0]) {
                const frac = (t - lo[0]) / (hi[0] - lo[0]);
                return {
                    pullA: Math.round(lo[1] + frac * (hi[1] - lo[1])),
                    pullB: Math.round(lo[2] + frac * (hi[2] - lo[2])),
                };
            }
        }
        return { pullA: Math.round(t), pullB: Math.round(180 - t) };
    }

    // Drive an antagonistic joint pair to a target angle using the per-joint
    // CALIBRATION_CURVES piecewise spline. pullA and pullB are interpolated
    // independently to correct for non-circular joint kinematics.
    function sendJoint(pair, angle) {
        const curve = CALIBRATION_CURVES[pair[0]];
        if (curve) {
            const { pullA, pullB } = interpolateCurve(curve, angle);
            sendServo(pair[0], pullA);
            sendServo(pair[1], pullB);
        } else {
            // Fallback for any uncalibrated pair — linear antagonist mapping.
            const a = Math.round(Math.max(0, Math.min(180, angle)));
            sendServo(pair[0], a);
            sendServo(pair[1], 180 - a);
        }
    }

    // ── React DOM helpers ─────────────────────────────────────────
    //
    // React controls input values via internal state. To update a React
    // input from outside and have React notice the change, we must:
    //   1. Use the native HTMLInputElement value setter from the correct
    //      window object (parent window for main page, iframe window for iframes).
    //   2. Fire a real "input" event so React's listener updates state.

    function setReactValue(el, value, frameWin) {
        const win = frameWin || window;
        const tag = el.tagName.toLowerCase();
        try {
            let proto;
            if (tag === 'input')         proto = win.HTMLInputElement.prototype;
            else if (tag === 'textarea') proto = win.HTMLTextAreaElement.prototype;
            else if (tag === 'select')   proto = win.HTMLSelectElement.prototype;

            if (proto) {
                Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
            } else {
                el.value = value;
            }
        } catch (_) {
            el.value = value;
        }
        el.dispatchEvent(new (win.Event || Event)('input',  { bubbles: true }));
        el.dispatchEvent(new (win.Event || Event)('change', { bubbles: true }));
    }

    function fireClick(el, frameWin) {
        const win = frameWin || window;
        el.dispatchEvent(new win.MouseEvent('click', {
            bubbles: true, cancelable: true, view: win,
        }));
    }

    // ── Value helpers ─────────────────────────────────────────────

    function toAngle(value, inMin, inMax) {
        const v = Math.max(inMin, Math.min(inMax, value));
        return Math.round(((v - inMin) / (inMax - inMin)) * 180);
    }

    function toNormalized(value, inMin, inMax) {
        const v = Math.max(inMin, Math.min(inMax, value));
        return Math.round(((v - inMin) / (inMax - inMin)) * 100);
    }

    // ── Head-bob animation ────────────────────────────────────────

    function getAnimInterval() {
        const dialDriver = (dialValues.ENERGY + dialValues.VERBOSITY) / 2;
        const driver = (dialDriver + hudBobSpeed) / 2;   // blend dial speed with manual bob-speed override
        return Math.round(
            ANIM_INTERVAL_SLOW_MS -
            (driver / 100) * (ANIM_INTERVAL_SLOW_MS - ANIM_INTERVAL_FAST_MS)
        );
    }

    function animationTick() {
        animPhase = (animPhase + 1) % 2;
        sendJoint(
            headJoint(currentSpeaker),
            HEAD_CENTER + (animPhase === 0 ? HEAD_BOB_RANGE : -HEAD_BOB_RANGE)
        );
        // Live tick-rate meter: update HUD every 2 s for Phase 4 speed calibration
        tickCount++;
        const now = Date.now();
        if (now - tickDisplayTimer >= 2000) {
            const tps = (tickCount / ((now - tickDisplayTimer) / 1000)).toFixed(1);
            const el  = document.getElementById('vt-ticks-display');
            if (el) el.textContent = `${tps}/s`;
            tickCount = 0;
            tickDisplayTimer = now;
        }
    }

    function startAnimation() {
        stopAnimation();
        animationTimer = setInterval(animationTick, getAnimInterval());
    }

    function stopAnimation() {
        if (animationTimer) { clearInterval(animationTimer); animationTimer = null; }
        animPhase = 0;
    }

    // ── Refusal detection ──────────────────────────────────────────

    function isRefusal(text) {
        return REFUSAL_PATTERNS.some(p => p.test(text));
    }

    // Immediately halt everything and freeze both figures in a boundary posture.
    // Vader bows his head (VADER_HEAD nod → 60°); the Trooper snaps to a defensive
    // stance (TROOPER_HEAD → 120°). Both joints hold via antagonistic tension.
    function triggerDefensivePosture() {
        window.speechSynthesis.cancel();
        stopAnimation();
        stopNoiseInterval();   // Feature 1: silence noise on defensive posture
        sendJoint(JOINTS.VADER_HEAD, 60);
        sendJoint(JOINTS.TROOPER_HEAD, 120);
        loopPaused = true;
        const tag = document.getElementById('vt-speaker-tag');
        if (tag) tag.textContent = 'HALTED';
        updateHudStatus('ws', '🔴 REFUSAL — loop paused', '#f87171');
        console.warn('[Vader/Trooper] Refusal detected — defensive posture engaged.');
    }

    // ── Telemetry ────────────────────────────────────────────────

    // Send a completed-turn record to relay.py so it writes performance_logs.json.
    function sendTelemetry(speaker, text) {
        if (!wsReady || ws.readyState !== WebSocket.OPEN) return;
        turnCount++;
        lastTurnTime = Date.now();   // watchdog: record time of last completed turn
        // Session timer display
        if (sessionStartTime > 0) {
            const elapsed = Math.round((Date.now() - sessionStartTime) / 1000);
            const el = document.getElementById('vt-session-timer');
            if (el) el.textContent = `${Math.floor(elapsed / 60)}m${String(elapsed % 60).padStart(2, '0')}s`;
        }

        const counter = document.getElementById('vt-turn-count');
        if (counter) counter.textContent = turnCount;

        const entry = {
            type:        'telemetry',
            speaker:     speaker,
            text:        text,
            turn:        turnCount,
            char_count:  text.length,
            speech_rate: parseFloat((0.75 + (dialValues.ENERGY / 100) * 0.65).toFixed(3)),
            dials:       { ...dialValues },
        };
        ws.send(JSON.stringify(entry));
        sessionLog.push(entry);
        pushToEval();
    }

    // ── Handoff loop ──────────────────────────────────────────────

    // After a turn ends cleanly, flip the active speaker, wait a short natural
    // pause, paste the completed text into the main page prompt, then click
    // the generate button so the opposing character responds automatically.
    function scheduleHandoff(completedText, speaker) {
        const next = speaker === 'vader' ? 'trooper' : 'vader';
        currentSpeaker = next;

        const tag = document.getElementById('vt-speaker-tag');
        if (tag) tag.textContent = next === 'vader' ? 'Darth Vader' : 'Stormtrooper';

        // Feature 4: clear any lingering diff uncertainty at turn boundary
        if (diffUncertaintyActive) resolveDiffUncertainty();

        // Feature 2: detect sentiment of completed turn; inject persona modifier
        const sentiment = detectSentiment(completedText);
        lastSentiment = sentiment;
        updateSentimentDisplay(sentiment);

        const personaName = next === 'vader'
            ? (document.getElementById('vt-p-vader')?.value  || 'Darth Vader')
            : (document.getElementById('vt-p-trooper')?.value || 'Imperial Stormtrooper');
        syncPersonaField('NAME', personaName);
        injectPersonaModifier(sentiment === 'aggressive' ? PERSONA_MODIFIERS[next] : '');

        // Map hudTurnPause (0-100) → 200–3000 ms with a small random jitter
        const pauseMs = 200 + Math.round((hudTurnPause / 100) * 2800) + Math.floor(Math.random() * 200);

        // Feature 1: fire temperature noise during inter-turn silence
        startNoiseInterval();

        setTimeout(() => {
            if (!loopActive || loopPaused) return;

            // Find the main page's user message input
            const promptEl = document.querySelector('textarea')
                || [...document.querySelectorAll('input[type="text"]')]
                    .find(el => /message|prompt|ask/i.test(el.placeholder || ''));

            if (promptEl) {
                setReactValue(promptEl, completedText, window);
            } else {
                console.warn('[Vader/Trooper] Handoff: prompt input not found.');
            }

            const runBtn = [...document.querySelectorAll('button')]
                .find(b => /run|generate|ask/i.test(b.textContent));

            if (runBtn) {
                fireClick(runBtn, window);
                console.log(`[Vader/Trooper] Handoff → ${next}, turn ${turnCount + 1}`);
            } else {
                console.warn('[Vader/Trooper] Handoff: generate button not found.');
            }
        }, pauseMs);
    }

    // ── Web Speech synthesis ──────────────────────────────────────

    function pickVoice(speaker) {
        const voices = window.speechSynthesis.getVoices();
        if (speaker === 'vader') {
            // Prefer a deep male voice for Darth Vader
            return voices.find(v => v.lang === 'en-US' && /david|mark|guy|james/i.test(v.name) && v.localService)
                || voices.find(v => v.lang === 'en-US' && /david|mark|guy|james/i.test(v.name))
                || voices.find(v => v.lang === 'en-US' && v.localService)
                || voices.find(v => v.lang === 'en-US')
                || voices[0] || null;
        } else {
            // Prefer a sharper, clipped voice for the Stormtrooper — avoid Vader's voice
            return voices.find(v => v.lang === 'en-US' && /zira|hazel|linda|aria|jenny/i.test(v.name) && v.localService)
                || voices.find(v => v.lang === 'en-US' && !/david|mark|guy|james/i.test(v.name) && v.localService)
                || voices.find(v => v.lang === 'en-US' && !/david|mark|guy|james/i.test(v.name))
                || voices.find(v => v.lang === 'en-US')
                || voices[0] || null;
        }
    }

    // speaker is 'vader' or 'trooper' — used for telemetry and handoff routing.
    function speakText(text, speaker) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();

        const spk   = speaker || currentSpeaker;
        const utt   = new SpeechSynthesisUtterance(text);
        const voice = pickVoice(spk);
        if (voice) utt.voice = voice;

        utt.rate  = 0.75 + (dialValues.ENERGY / 100) * 0.65;
        utt.pitch = 0.85 + (dialValues.WARMTH  / 100) * 0.30;

        utt.onstart = () => {
            stopNoiseInterval();   // Feature 1: silence inter-turn noise during speech
            startAnimation();
            scheduleArmGesture(text, spk);
        };

        utt.onend = () => {
            stopAnimation();
            sendJoint(headJoint(spk), HEAD_CENTER);   // return active speaker's head to rest
            sendTelemetry(spk, text);                   // log the completed turn
            if (loopActive && !loopPaused) {
                scheduleHandoff(text, spk);             // fire next turn
            }
        };

        utt.onerror = () => {
            stopAnimation();
            sendJoint(headJoint(spk), HEAD_CENTER);
        };

        window.speechSynthesis.speak(utt);
    }

    // ── Output stream monitoring ──────────────────────────────────

    function extractOutputText(el) {
        return (el.textContent || '')
            .trim()
            .replace(/^OUTPUT\s*/i, '')
            .replace(/^(Llama|GPT|Claude|Gemini|Mistral)[^\n]*\n?/i, '')
            .replace(/^IDLE\s*/i, '')
            .replace(/^Output will stream here\.?\s*/i, '')
            .replace(/^CLEAR OUTPUT\s*/i, '')
            .trim();
    }

    function onStreamChunk(container) {
        const text = extractOutputText(container);
        if (!text || text.length < 10) return;

        if (streamDebounce) clearTimeout(streamDebounce);
        streamDebounce = setTimeout(() => {
            const final = extractOutputText(container);
            if (!final || final.length <= 10 || final === lastSpokenText) return;

            lastSpokenText = final;
            console.log('[Vader/Trooper] Stream complete →', final.slice(0, 60) + '…');

            // Check for AI refusal patterns before entering speech pipeline
            if (isRefusal(final)) {
                triggerDefensivePosture();
                return;
            }

            speakText(final, currentSpeaker);
        }, STREAM_END_DEBOUNCE_MS);
    }

    function findOutputSection(doc) {
        for (const el of doc.querySelectorAll('div, p, span, section')) {
            const text = (el.textContent || '').trim();
            if (text.includes('Output will stream here') && text.length < 600) return el;
        }
        for (const el of doc.querySelectorAll('div, section')) {
            const text = (el.textContent || '').toUpperCase();
            if (text.includes('OUTPUT') && text.includes('IDLE') && el.textContent.length < 400) {
                return el;
            }
        }
        return null;
    }

    function initOutputMonitoring() {
        outputContainer = findOutputSection(document);
        if (!outputContainer) { setTimeout(initOutputMonitoring, 1500); return; }

        if (outputObserver) outputObserver.disconnect();
        outputObserver = new MutationObserver(() => onStreamChunk(outputContainer));
        outputObserver.observe(outputContainer, {
            childList: true, subtree: true, characterData: true,
        });
        console.log('[Vader/Trooper] Output observer attached to main page.');
    }

    // ── Tone dial binding (main page) ─────────────────────────────

    function getToneDialsSection(doc) {
        doc = doc || document;
        const required = ['TONE DIALS', ...Object.keys(DIAL_JOINT)];
        let best = null;
        for (const el of doc.querySelectorAll('div, section, fieldset, article')) {
            const text = (el.textContent || '').toUpperCase();
            if (required.every(n => text.includes(n))) {
                if (!best || el.textContent.length < best.textContent.length) best = el;
            }
        }
        return best;
    }

    function findDialName(el) {
        let node = el.parentElement;
        for (let d = 0; d < 4 && node; d++) {
            const text = (node.textContent || '').toUpperCase();
            if (text.includes('TEMPERATURE')) return null;
            for (const name of Object.keys(DIAL_JOINT)) {
                if (text.includes(name)) return name;
            }
            node = node.parentElement;
        }
        return null;
    }

    // Called whenever any dial on the main page moves.
    function onDialChange(name, rawValue, inMin, inMax) {
        dialValues[name] = toNormalized(rawValue, inMin, inMax);
        sendJoint(DIAL_JOINT[name], toAngle(rawValue, inMin, inMax));

        // Keep the HUD slider in sync with the main page
        const hudSlider = document.getElementById(`vt-dial-${name.toLowerCase()}`);
        const hudLabel  = document.getElementById(`vt-dial-${name.toLowerCase()}-val`);
        if (hudSlider) hudSlider.value        = dialValues[name];
        if (hudLabel)  hudLabel.textContent   = dialValues[name];
    }

    function bindRangeInput(input, name) {
        if (bound.has(input)) return;
        bound.add(input);
        const min = () => parseFloat(input.min) || -5;
        const max = () => parseFloat(input.max) ||  5;
        input.addEventListener('input', () => {
            onDialChange(name, parseFloat(input.value), min(), max());
        });
    }

    function bindAriaSlider(el, name) {
        if (bound.has(el)) return;
        bound.add(el);
        const min = () => parseFloat(el.getAttribute('aria-valuemin') ?? '-5');
        const max = () => parseFloat(el.getAttribute('aria-valuemax') ??  '5');
        const mo = new MutationObserver(() => {
            onDialChange(name, parseFloat(el.getAttribute('aria-valuenow') ?? '0'), min(), max());
        });
        mo.observe(el, { attributes: true, attributeFilter: ['aria-valuenow'] });
    }

    function scanAndBind() {
        const section = getToneDialsSection();
        if (!section) return false;
        for (const input of section.querySelectorAll('input[type="range"]:not([disabled])')) {
            if (!bound.has(input)) {
                const name = findDialName(input);
                if (name) bindRangeInput(input, name);
            }
        }
        for (const el of section.querySelectorAll('[role="slider"]')) {
            if (!bound.has(el)) {
                const name = findDialName(el);
                if (name) bindAriaSlider(el, name);
            }
        }
        return bound.size >= 6;
    }

    function waitForDials() {
        if (scanAndBind()) return;
        const mo = new MutationObserver(() => { if (scanAndBind()) mo.disconnect(); });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    // ── Cross-iframe sync ─────────────────────────────────────────

    // Find the slider for a named tone dial inside any document (main or iframe),
    // then push a new value to it using React-compatible event dispatch.
    function syncDialInDoc(doc, frameWin, name, normalizedValue) {
        const section = getToneDialsSection(doc) || doc;
        const candidates = [
            ...section.querySelectorAll('input[type="range"]:not([disabled])'),
            ...section.querySelectorAll('[role="slider"]'),
        ];
        for (const el of candidates) {
            // Check that this element lives near a label matching the dial name
            let node  = el.parentElement;
            let found = false;
            for (let d = 0; d < 4 && node; d++) {
                if ((node.textContent || '').toUpperCase().includes(name)) {
                    found = true; break;
                }
                node = node.parentElement;
            }
            if (!found) continue;

            const min = parseFloat(el.min || el.getAttribute('aria-valuemin') || '-5');
            const max = parseFloat(el.max || el.getAttribute('aria-valuemax') ||  '5');
            const raw = min + (normalizedValue / 100) * (max - min);
            setReactValue(el, raw, frameWin);
        }
    }

    // Push all current dial values to every ready iframe.
    function syncAllDials() {
        for (const [key, frame] of Object.entries(iframes)) {
            if (!frame.ready) continue;
            const doc = frame.el.contentDocument;
            const win = frame.el.contentWindow;
            for (const [name, val] of Object.entries(dialValues)) {
                syncDialInDoc(doc, win, name, val);
            }
        }
    }

    // Push a value into a named text field inside the /play/persona iframe.
    function syncPersonaField(fieldLabel, value) {
        const frame = iframes.persona;
        if (!frame || !frame.ready) return;
        const doc = frame.el.contentDocument;
        const win = frame.el.contentWindow;
        for (const el of doc.querySelectorAll('input[type="text"], textarea')) {
            let node = el.parentElement;
            for (let d = 0; d < 5 && node; d++) {
                if ((node.textContent || '').toUpperCase().includes(fieldLabel.toUpperCase())) {
                    setReactValue(el, value, win);
                    return;
                }
                node = node.parentElement;
            }
        }
    }

    // Put text in an iframe's prompt box and click its primary action button.
    function triggerGenerate(key, promptText) {
        const frame = iframes[key];
        if (!frame || !frame.ready) return;
        const doc = frame.el.contentDocument;
        const win = frame.el.contentWindow;

        const promptEl = doc.querySelector('textarea') || doc.querySelector('input[type="text"]');
        if (promptEl) setReactValue(promptEl, promptText, win);

        const runBtn = [...doc.querySelectorAll('button')]
            .find(b => /run|generate|ask|submit/i.test(b.textContent));
        if (runBtn) fireClick(runBtn, win);
    }

    // Push the refusal-threshold slider value to /play/refusal's first range control.
    function syncRefusalThreshold(value) {
        const frame = iframes.refusal;
        if (!frame || !frame.ready) return;
        const doc = frame.el.contentDocument;
        const win = frame.el.contentWindow;
        const sliders = [...doc.querySelectorAll('input[type="range"]:not([disabled])')];
        if (sliders.length > 0) {
            const sl = sliders[0];
            const min = parseFloat(sl.min) || 0;
            const max = parseFloat(sl.max) || 100;
            setReactValue(sl, min + (value / 100) * (max - min), win);
        }
    }

    // Push a pacing value to /play/choreographer's nth range control.
    function syncChoreographerSlider(index, value) {
        const frame = iframes.choreographer;
        if (!frame || !frame.ready) return;
        const doc = frame.el.contentDocument;
        const win = frame.el.contentWindow;
        const sliders = [...doc.querySelectorAll('input[type="range"]:not([disabled])')];
        if (sliders[index]) {
            const sl = sliders[index];
            const min = parseFloat(sl.min) || 0;
            const max = parseFloat(sl.max) || 100;
            setReactValue(sl, min + (value / 100) * (max - min), win);
        }
    }

    // Schedule a brief arm raise for the active speaker at ~40% through the utterance.
    // Drives the shoulder pair up-and-out over the acrylic gantry pulley:
    // VADER_SHOULDER (ch 4/5) for Vader, TROOPER_SHOULDER (ch 12/13) for the Trooper.
    function scheduleArmGesture(text, speaker) {
        const wordCount  = (text.match(/\S+/g) || []).length;
        const rate       = 0.75 + (dialValues.ENERGY / 100) * 0.65;
        const durationMs = (wordCount / (2.5 * rate)) * 1000;
        const gestureAt  = Math.min(durationMs * 0.40, 2000);
        const shoulder   = shoulderJoint(speaker);
        setTimeout(() => {
            if (!animationTimer && !loopActive) return;   // speech already stopped
            sendJoint(shoulder, 135);
            setTimeout(() => sendJoint(shoulder, 90), 700);
        }, gestureAt);
    }

    // ── Dynamic Behaviors ────────────────────────────────────────────────

    // ── Feature 1: Temperature Slider + Physical Noise ────────────

    // Find the Temperature slider, which lives OUTSIDE the tone-dials container
    // and is explicitly excluded from normal dial binding. We scan for it
    // separately: an ancestor must mention TEMPERATURE but none of the 6 dials.
    function findTemperatureSlider(doc) {
        doc = doc || document;
        for (const input of doc.querySelectorAll('input[type="range"]:not([disabled])')) {
            if (bound.has(input)) continue;
            let node = input.parentElement;
            for (let d = 0; d < 5 && node; d++) {
                const text = (node.textContent || '').toUpperCase();
                if (
                    text.includes('TEMPERATURE') &&
                    !Object.keys(DIAL_JOINT).some(n => text.includes(n))
                ) return input;
                node = node.parentElement;
            }
        }
        return null;
    }

    function initTemperatureBinding() {
        const input = findTemperatureSlider(document);
        if (!input) { setTimeout(initTemperatureBinding, 2000); return; }
        if (bound.has(input)) return;

        const readTemp = () => {
            const min = parseFloat(input.min) || 0;
            const max = parseFloat(input.max) || 1;
            temperatureValue = toNormalized(parseFloat(input.value) || 0, min, max);
            const el = document.getElementById('vt-temp-val');
            if (el) el.textContent = temperatureValue;
        };

        input.addEventListener('input', () => {
            readTemp();
            if (!animationTimer) startNoiseInterval();   // recompute interval immediately
        });
        bound.add(input);
        readTemp();
        console.log('[Vader/Trooper] Temperature slider bound, value:', temperatureValue);
    }

    // Inject a random small deviation on a random joint pair to simulate
    // physical restlessness. Only fires during silence (no speech animation).
    function applyTemperatureNoise() {
        if (animationTimer) return;
        if (temperatureValue < 5) return;
        const maxDev = Math.round((temperatureValue / 100) * 8);   // up to ±8°
        const pair   = ALL_JOINTS[Math.floor(Math.random() * ALL_JOINTS.length)];
        const dev    = (Math.random() * 2 - 1) * maxDev;
        sendJoint(pair, 90 + dev);   // balanced twitch — both tendons stay tensioned
        setTimeout(() => { if (!animationTimer) sendJoint(pair, 90); }, 120 + Math.random() * 180);
    }

    function startNoiseInterval() {
        stopNoiseInterval();
        if (temperatureValue < 5) return;
        const intervalMs = Math.round(2000 - (temperatureValue / 100) * 1500);   // 2000→500 ms
        noiseTimer = setInterval(applyTemperatureNoise, intervalMs);
    }

    function stopNoiseInterval() {
        if (noiseTimer) { clearInterval(noiseTimer); noiseTimer = null; }
    }

    // ── Feature 2: Sentiment-Driven Persona Injection ────────────

    function detectSentiment(text) {
        return AGGRESSIVE_PATTERNS.filter(p => p.test(text)).length >= 2
            ? 'aggressive' : 'neutral';
    }

    // Append (or clear) an emotional modifier on the largest textarea inside
    // /play/persona — most likely the backstory or description field.
    // Uses the React native-prototype setter so the app registers the change.
    function injectPersonaModifier(modifier) {
        const frame = iframes.persona;
        if (!frame || !frame.ready) return;
        const doc = frame.el.contentDocument;
        const win = frame.el.contentWindow;
        const textareas = [...doc.querySelectorAll('textarea')];
        if (!textareas.length) return;
        const target = textareas.reduce((a, b) =>
            (b.value || '').length >= (a.value || '').length ? b : a
        );
        const cleaned = (target.value || '')
            .replace(/\s*\[INTENSIFIED:[^\]]*\]/g, '').trimEnd();
        setReactValue(target, modifier ? cleaned + modifier : cleaned, win);
    }

    function updateSentimentDisplay(sentiment) {
        const el = document.getElementById('vt-sentiment');
        if (!el) return;
        el.textContent = sentiment;
        el.style.color  = sentiment === 'aggressive' ? '#f87171' : '#4ade80';
    }

    // ── Feature 3: Eval Closed-Loop Feedback ────────────────

    // Extract an average numeric score from the eval AI's response.
    // Looks for “N/10” patterns produced by EVAL_SCORING_CRITERIA.
    function parseEvalScore(text) {
        const scores = [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*\/\s*10\b/g)]
            .map(m => parseFloat(m[1]))
            .filter(n => n >= 0 && n <= 10);
        return scores.length
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : null;
    }

    // Attach a one-shot MutationObserver on the eval iframe output area.
    // When the scoring response streams in, parse the score and apply feedback.
    function monitorEvalOutput() {
        const frame = iframes.eval;
        if (!frame || !frame.ready) return;
        const doc     = frame.el.contentDocument;
        const outputEl = findOutputSection(doc);
        if (!outputEl) return;

        let evalDebounce = null;
        const observer   = new MutationObserver(() => {
            if (evalDebounce) clearTimeout(evalDebounce);
            evalDebounce = setTimeout(() => {
                const avgScore = parseEvalScore((outputEl.textContent || '').trim());
                if (avgScore !== null) {
                    applyEvalFeedback(avgScore);
                    observer.disconnect();   // one-shot; re-attached on next runEvalScoring()
                }
            }, 1500);
        });
        observer.observe(outputEl, { childList: true, subtree: true, characterData: true });
    }

    // If avg session score < EVAL_PASS_THRESHOLD: reduce ENERGY and VERBOSITY,
    // push updates to the main page, all iframes, and the physical servos.
    function applyEvalFeedback(avgScore) {
        if (avgScore >= EVAL_PASS_THRESHOLD) {
            updateEvalStatus(`Score ${avgScore.toFixed(1)}/10 — pass ✓`);
            return;
        }
        const reduction = Math.round((1 - avgScore / EVAL_PASS_THRESHOLD) * 30);

        ['ENERGY', 'VERBOSITY'].forEach(name => {
            const newVal = Math.max(10, dialValues[name] - reduction);
            dialValues[name] = newVal;
            const slider = document.getElementById(`vt-dial-${name.toLowerCase()}`);
            const label  = document.getElementById(`vt-dial-${name.toLowerCase()}-val`);
            if (slider) slider.value = newVal;
            if (label)  label.textContent = newVal;
            pushDialToMainPage(name, newVal);
            for (const [, frame] of Object.entries(iframes)) {
                if (frame.ready)
                    syncDialInDoc(frame.el.contentDocument, frame.el.contentWindow, name, newVal);
            }
            sendJoint(DIAL_JOINT[name], Math.round((newVal / 100) * 180));
        });

        // Return both heads to calm neutral
        sendJoint(JOINTS.VADER_HEAD, HEAD_CENTER);
        sendJoint(JOINTS.TROOPER_HEAD, HEAD_CENTER);

        // Log the feedback event to relay.py
        if (wsReady && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'eval_feedback', avg_score: avgScore, adjustment: reduction,
            }));
        }

        updateEvalStatus(`Score ${avgScore.toFixed(1)}/10 — dials ↓${reduction}`);
        console.log(`[Vader/Trooper] Eval feedback: ${avgScore.toFixed(1)}/10 — reduced dials by ${reduction}`);
    }

    // ── Feature 4: Diff Uncertainty Visualization ────────────────

    // Jaccard word-overlap similarity between two text blocks (0=nothing in
    // common, 1=identical word sets). Used to detect divergent diff outputs.
    function textSimilarity(a, b) {
        const wA = new Set((a.toLowerCase().match(/\b\w+\b/g) || []));
        const wB = new Set((b.toLowerCase().match(/\b\w+\b/g) || []));
        const intersection = [...wA].filter(w => wB.has(w)).length;
        const union = new Set([...wA, ...wB]).size;
        return union === 0 ? 1 : intersection / union;
    }

    // Set up a persistent MutationObserver on the diff iframe body.
    // Called once when the diff iframe becomes ready.
    function initDiffMonitor() {
        const frame = iframes.diff;
        if (!frame || !frame.ready) { setTimeout(initDiffMonitor, 3000); return; }
        const doc = frame.el.contentDocument;

        let diffDebounce = null;
        new MutationObserver(() => {
            if (diffDebounce) clearTimeout(diffDebounce);
            diffDebounce = setTimeout(() => checkDiffOutputs(doc), 1200);
        }).observe(doc.body, { childList: true, subtree: true, characterData: true });

        console.log('[Vader/Trooper] Diff divergence monitor active.');
    }

    // Compare the two richest output-like text blocks in the diff page.
    // Similarity < 0.35 (< 35 % shared vocabulary) = wildly divergent outputs.
    function checkDiffOutputs(doc) {
        const panels = [...doc.querySelectorAll('div, section, article')]
            .filter(el => {
                const len = (el.textContent || '').trim().length;
                if (len < 80 || len > 3000) return false;
                // Prefer leaf-ish elements: own text should dominate sub-element text
                const subLen = [...el.querySelectorAll('div, section')]
                    .reduce((s, c) => s + (c.textContent || '').trim().length, 0);
                return subLen < len * 0.6;
            })
            .sort((a, b) => b.textContent.length - a.textContent.length)
            .slice(0, 2);

        if (panels.length < 2) return;

        const textA = panels[0].textContent.trim();
        const textB = panels[1].textContent.trim();

        // Guard: skip evaluation when either panel is empty, too short, or still
        // loading — avoids false-positive divergence signals during startup and
        // network generation handoffs that would flood the WebSocket with spurious
        // Trooper torso twist / Vader shoulder servo commands.
        if (textA.length < 20 || textB.length < 20 ||
            textA.includes('Loading') || textB.includes('Loading')) return;

        const sim = textSimilarity(textA, textB);
        if (sim < 0.35 && !diffUncertaintyActive) triggerDiffUncertainty();
        else if (sim >= 0.35 && diffUncertaintyActive) resolveDiffUncertainty();
    }

    // Stormtrooper whole-body shake via the torso twist pair (TROOPER_TORSO ch 10/11)
    // + Vader arm raises and holds via the shoulder pair (VADER_SHOULDER ch 4/5).
    function triggerDiffUncertainty() {
        diffUncertaintyActive = true;
        let panStep = 0;
        const panTimer = setInterval(() => {
            sendJoint(JOINTS.TROOPER_TORSO, panStep % 2 === 0 ? 60 : 120);
            if (++panStep >= 6) clearInterval(panTimer);   // 3 full side-to-side swings
        }, 200);
        sendJoint(JOINTS.VADER_SHOULDER, 135);   // Vader arm up and holds
        updateHudStatus('diff', '⚠️ Divergent', '#f59e0b');
        console.log('[Vader/Trooper] Diff divergence — Trooper torso shaking, Vader arm raised.');
    }

    function resolveDiffUncertainty() {
        diffUncertaintyActive = false;
        sendJoint(JOINTS.VADER_SHOULDER, 90);        // Vader arm returns
        sendJoint(JOINTS.TROOPER_TORSO, 90);         // Trooper torso re-centres
        updateHudStatus('diff', '✓ Converged', '#4ade80');
    }

    // Push the in-memory session log as formatted text into /play/eval's prompt input.
    function pushToEval() {
        const frame = iframes.eval;
        if (!frame || !frame.ready || sessionLog.length === 0) return;
        const doc = frame.el.contentDocument;
        const win = frame.el.contentWindow;
        const transcript = sessionLog.map(e =>
            `[Turn ${e.turn}] ${e.speaker.toUpperCase()}: ${e.text.slice(0, 120)}${e.text.length > 120 ? '\u2026' : ''}`
        ).join('\n');
        const promptEl = doc.querySelector('textarea')
            || doc.querySelector('input[type="text"]');
        if (promptEl) setReactValue(promptEl, EVAL_SCORING_CRITERIA + transcript, win);
    }

    // Push the current sessionLog to /play/eval with scoring criteria and trigger generation.
    function runEvalScoring() {
        if (sessionLog.length === 0) { updateEvalStatus('No turns to score yet'); return; }
        pushToEval();
        const frame = iframes.eval;
        if (!frame || !frame.ready) { updateEvalStatus('Eval iframe not ready'); return; }
        monitorEvalOutput();   // Feature 3: listen for score before triggering generation
        const doc = frame.el.contentDocument;
        const win = frame.el.contentWindow;
        const runBtn = [...doc.querySelectorAll('button')]
            .find(b => /run|generate|score|submit/i.test(b.textContent));
        if (runBtn) {
            fireClick(runBtn, win);
            updateEvalStatus(`Scoring ${sessionLog.length} turn${sessionLog.length !== 1 ? 's' : ''}…`);
        } else {
            updateEvalStatus('Generate button not found in eval iframe');
        }
    }

    // Request the full performance_logs.json from relay.py and load it into /play/eval.
    function loadReplay() {
        if (!wsReady || ws.readyState !== WebSocket.OPEN) {
            updateEvalStatus('Relay offline — cannot load replay');
            return;
        }
        ws.send(JSON.stringify({ type: 'replay_request' }));
        updateEvalStatus('Requesting replay from relay…');
    }

    // Called when relay.py responds with { type: 'replay_data', entries: [...] }.
    // Populates /play/eval with the full log transcript + scoring criteria.
    function handleReplayData(entries) {
        if (!entries.length) { updateEvalStatus('Log file is empty'); return; }
        const frame = iframes.eval;
        if (!frame || !frame.ready) { updateEvalStatus('Eval iframe not ready'); return; }
        const doc = frame.el.contentDocument;
        const win = frame.el.contentWindow;
        const transcript = entries.map(e =>
            `[Turn ${e.turn || '?'}] ${(e.speaker || '?').toUpperCase()}: ${(e.text || '').slice(0, 120)}${(e.text || '').length > 120 ? '…' : ''}`
        ).join('\n');
        const promptEl = doc.querySelector('textarea')
            || doc.querySelector('input[type="text"]');
        if (promptEl) {
            setReactValue(promptEl, EVAL_SCORING_CRITERIA + transcript, win);
            updateEvalStatus(`${entries.length} turn${entries.length !== 1 ? 's' : ''} loaded from log`);
        }
    }

    // Update the evaluation status line in the HUD.
    function updateEvalStatus(msg) {
        const el = document.getElementById('vt-eval-status');
        if (el) el.textContent = msg;
    }

    // Push the HUD dial value back to the matching native slider on the main page.
    function pushDialToMainPage(name, normalizedValue) {
        const section = getToneDialsSection();
        if (!section) return;
        for (const input of section.querySelectorAll('input[type="range"]:not([disabled])')) {
            let node = input.parentElement;
            let found = false;
            for (let d = 0; d < 4 && node; d++) {
                if ((node.textContent || '').toUpperCase().includes(name)) { found = true; break; }
                node = node.parentElement;
            }
            if (!found) continue;
            const min = parseFloat(input.min) || -5;
            const max = parseFloat(input.max) ||  5;
            setReactValue(input, min + (normalizedValue / 100) * (max - min), window);
        }
    }

    // ── Initial state sync ─────────────────────────────────────────
    //
    // Pushes every current HUD value (Model, Tone Dials, Pacing, Refusal threshold)
    // to both the main /play/tone page DOM and every ready iframe contentDocument.
    // Uses the native HTMLInputElement/HTMLSelectElement prototype setter and fires
    // bubbling input + change events so React state picks up each value immediately.
    //
    // Called automatically once all 5 hidden iframes have reached 'Ready', and also
    // bound directly to the ↺ Sync all iframes HUD button.
    function syncAll() {
        // 1 ── Tone dials → main page + all iframes
        for (const [name, val] of Object.entries(dialValues)) {
            pushDialToMainPage(name, val);
        }
        syncAllDials();

        // 2 ── Pacing → choreographer iframe
        syncChoreographerSlider(0, hudBobSpeed);
        syncChoreographerSlider(1, hudTurnPause);

        // 3 ── Refusal threshold → refusal iframe
        const refusalEl = document.getElementById('vt-refusal');
        if (refusalEl) syncRefusalThreshold(parseInt(refusalEl.value, 10));
    }

    // ── Iframe manager ────────────────────────────────────────────

    function injectIframes() {
        for (const [key, url] of Object.entries(IFRAME_PAGES)) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            // Off-screen 1×1 micro-viewport — keeps the JS event loop and
            // MutationObservers unthrottled in Chromium (display:none/zero-size causes
            // aggressive background-tab throttling in modern Chrome engines).
            iframe.style.cssText = 'position:fixed; width:1px; height:1px; opacity:0.01; pointer-events:none; left:-10px; bottom:-10px; border:0;';
            iframe.setAttribute('aria-hidden', 'true');
            iframes[key] = { el: iframe, ready: false };

            iframe.onload = () => {
                // React apps need time to mount their components after the HTML loads.
                setTimeout(() => {
                    try {
                        const doc = iframe.contentDocument;
                        if (!doc || !doc.body) throw new Error('no document');
                        iframes[key].ready = true;
                        updateHudStatus(key, '🟢 Ready', '#4ade80');
                        // Push current state to this newly-ready iframe
                        for (const [name, val] of Object.entries(dialValues)) {
                            syncDialInDoc(doc, iframe.contentWindow, name, val);
                        }
                        if (key === 'diff') initDiffMonitor();   // Feature 4
                        // Once every iframe has successfully reached Ready, run a full
                        // initial sync so the main page and all iframes share the HUD's
                        // default Model, Tone Dials, Pacing, and Refusal values from the
                        // moment the page finishes loading — no manual Sync click needed.
                        if (Object.values(iframes).every(f => f.ready)) {
                            syncAll();
                        }
                    } catch (_) {
                        iframes[key].ready = false;
                        updateHudStatus(key, '🔴 Blocked', '#f87171');
                    }
                }, IFRAME_READY_DELAY_MS);
            };

            iframe.onerror = () => {
                iframes[key].ready = false;
                updateHudStatus(key, '🔴 Failed', '#f87171');
            };

            document.body.appendChild(iframe);
        }
    }

    // ── Master HUD ────────────────────────────────────────────────

    function buildHUD() {
        // Inject styles
        const style = document.createElement('style');
        style.id = 'vt-styles';
        style.textContent = hudCSS();
        document.head.appendChild(style);

        // Build DOM
        const hud = document.createElement('div');
        hud.id = 'vt-hud';
        hud.innerHTML = hudHTML();
        document.body.appendChild(hud);

        wireHudControls();
    }

    function hudHTML() {
        const dialRows = Object.keys(DIAL_JOINT).map(name => `
            <div class="vt-row">
                <span class="vt-lbl">${name}</span>
                <input type="range" id="vt-dial-${name.toLowerCase()}"
                       class="vt-slider" min="0" max="100" value="50">
                <span id="vt-dial-${name.toLowerCase()}-val" class="vt-num">50</span>
            </div>`).join('');

        const iframeRows = Object.keys(IFRAME_PAGES).map(key => `
            <div class="vt-row">
                <span class="vt-lbl">${key}</span>
                <span id="vt-status-${key}" class="vt-tag" style="color:#facc15">🟡 Loading</span>
            </div>`).join('');

        return `
        <div id="vt-inner">
            <div id="vt-head">
                <span id="vt-title">VADER / TROOPER</span>
                <button id="vt-tog" title="Collapse HUD">◀</button>
            </div>
            <div id="vt-body">

                <div class="vt-sec">
                    <span id="vt-status-ws" style="font-size:11px;color:#f87171">🔴 Relay offline</span>
                </div>

                <div class="vt-sec">
                    <div class="vt-sec-title">TONE DIALS</div>
                    ${dialRows}
                    <div class="vt-row" style="border-top:1px solid #1e1e26;margin-top:3px;padding-top:3px">
                        <span class="vt-lbl">TEMP</span>
                        <span id="vt-temp-val" class="vt-tag" style="color:#facc15">—</span>
                        <span style="font-size:9px;color:#52525b;flex:1;text-align:right">noise src</span>
                    </div>
                </div>

                <div class="vt-sec">
                    <div class="vt-sec-title">PERSONA</div>
                    <div class="vt-row"><span class="vt-lbl">Darth Vader</span></div>
                    <input type="text" id="vt-p-vader" class="vt-input" placeholder="Darth Vader" value="Darth Vader">
                    <div class="vt-row" style="margin-top:6px"><span class="vt-lbl">Stormtrooper</span></div>
                    <input type="text" id="vt-p-trooper" class="vt-input" placeholder="Stormtrooper" value="Stormtrooper">
                    <div class="vt-row" style="margin-top:5px">
                        <span class="vt-lbl">Sentiment</span>
                        <span id="vt-sentiment" class="vt-tag" style="color:#4ade80">neutral</span>
                    </div>
                </div>

                <div class="vt-sec">
                    <div class="vt-sec-title">PACING</div>
                    <div class="vt-row">
                        <span class="vt-lbl">Bob speed</span>
                        <input type="range" id="vt-bob-speed" class="vt-slider" min="0" max="100" value="50">
                        <span id="vt-bob-speed-val" class="vt-num">50</span>
                    </div>
                    <div class="vt-row">
                        <span class="vt-lbl">Turn pause</span>
                        <input type="range" id="vt-pause" class="vt-slider" min="0" max="100" value="30">
                        <span id="vt-pause-val" class="vt-num">30</span>
                    </div>
                </div>

                <div class="vt-sec">
                    <div class="vt-sec-title">REFUSAL THRESHOLD</div>
                    <div class="vt-row">
                        <span class="vt-lbl">Threshold</span>
                        <input type="range" id="vt-refusal" class="vt-slider" min="0" max="100" value="50">
                        <span id="vt-refusal-val" class="vt-num">50</span>
                    </div>
                </div>

                <div class="vt-sec">
                    <button id="vt-sync-btn" class="vt-btn vt-btn-ghost">↺ Sync all iframes</button>
                    <button id="vt-gen-btn" class="vt-btn vt-btn-primary">▶ Generate</button>
                    <button id="vt-loop-start" class="vt-btn vt-btn-primary" style="background:#16a34a">♾️ Start Loop</button>
                    <button id="vt-loop-stop" class="vt-btn vt-btn-ghost" style="display:none">⏹ Stop Loop</button>
                    <div class="vt-row" style="margin-top:5px">
                        <span class="vt-lbl">Turn</span>
                        <span id="vt-turn-count" class="vt-tag">0</span>
                        <span class="vt-lbl" style="flex:0 0 50px">Speaker</span>
                        <span id="vt-speaker-tag" class="vt-tag" style="color:#a78bfa">Darth Vader</span>
                    </div>
                    <div class="vt-row">
                        <span class="vt-lbl">Session</span>
                        <span id="vt-session-timer" class="vt-tag" style="color:#52525b">—</span>
                        <span class="vt-lbl" style="flex:0 0 50px">Speed</span>
                        <span id="vt-ticks-display" class="vt-tag" style="color:#52525b">—</span>
                    </div>
                </div>

                <div class="vt-sec">
                    <div class="vt-sec-title">EVALUATION</div>
                    <button id="vt-score-btn" class="vt-btn vt-btn-primary" style="background:#0891b2">📊 Score Session</button>
                    <button id="vt-replay-btn" class="vt-btn vt-btn-ghost">📋 Load Replay</button>
                    <div id="vt-eval-status" style="font-size:10px;color:#52525b;margin-top:4px;padding:0 2px">—</div>
                </div>

                <div class="vt-sec">
                    <div class="vt-sec-title">CALIBRATION</div>
                    <select id="vt-cal-ch" style="background:#141418;border:1px solid #2a2a35;color:#d4d4d8;padding:3px 6px;border-radius:4px;font-size:11px;width:100%;box-sizing:border-box;margin-bottom:5px">
                        <option value="0">CH 0 — Vader head nod ↓</option>
                        <option value="1">CH 1 — Vader head nod ↑</option>
                        <option value="2">CH 2 — Vader torso ←</option>
                        <option value="3">CH 3 — Vader torso →</option>
                        <option value="4">CH 4 — Vader shoulder ↑</option>
                        <option value="5">CH 5 — Vader shoulder ↓</option>
                        <option value="6">CH 6 — Vader elbow curl</option>
                        <option value="7">CH 7 — Vader elbow extend</option>
                        <option value="8">CH 8 — Trooper head nod ↓</option>
                        <option value="9">CH 9 — Trooper head nod ↑</option>
                        <option value="10">CH 10 — Trooper torso ←</option>
                        <option value="11">CH 11 — Trooper torso →</option>
                        <option value="12">CH 12 — Trooper shoulder ↑</option>
                        <option value="13">CH 13 — Trooper shoulder ↓</option>
                        <option value="14">CH 14 — Trooper elbow curl</option>
                        <option value="15">CH 15 — Trooper elbow extend</option>
                    </select>
                    <div class="vt-row">
                        <span class="vt-lbl">Angle</span>
                        <input type="range" id="vt-cal-angle" class="vt-slider" min="0" max="180" value="90">
                        <span id="vt-cal-angle-val" class="vt-num">90</span>
                    </div>
                    <div class="vt-row" style="gap:4px;margin-bottom:5px">
                        <button id="vt-cal-test" class="vt-btn vt-btn-ghost" style="flex:1;padding:4px 0;font-size:10px;margin-bottom:0">▶ Test CH</button>
                        <button id="vt-cal-min"  class="vt-btn vt-btn-ghost" style="flex:1;padding:4px 0;font-size:10px;margin-bottom:0;margin-left:3px">↓ Set Min</button>
                        <button id="vt-cal-max"  class="vt-btn vt-btn-ghost" style="flex:1;padding:4px 0;font-size:10px;margin-bottom:0;margin-left:3px">↑ Set Max</button>
                    </div>
                    <div id="vt-cal-limits" style="font-size:9px;color:#52525b;margin-bottom:4px;padding:0 2px">—</div>
                    <button id="vt-sweep-btn" class="vt-btn vt-btn-ghost">⚙ Sweep All Channels</button>
                    <div id="vt-cal-status" style="font-size:10px;color:#52525b;margin-top:4px;padding:0 2px">—</div>
                </div>

                <div class="vt-sec">
                    <div class="vt-sec-title">IFRAME STATUS</div>
                    ${iframeRows}
                </div>

            </div>
        </div>`;
    }

    function hudCSS() {
        return `
        #vt-hud {
            position: fixed; top: 0; right: 0;
            width: 272px; height: 100vh;
            z-index: 2147483647;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            font-size: 12px; line-height: 1.4;
            transition: width .18s ease;
            pointer-events: auto;
        }
        #vt-hud.vt-collapsed { width: 34px; }
        #vt-inner {
            height: 100%; background: #0c0c0f;
            border-left: 1px solid #1e1e26; color: #d4d4d8;
            display: flex; flex-direction: column; overflow: hidden;
        }
        #vt-head {
            display: flex; align-items: center;
            justify-content: space-between;
            padding: 9px 11px; background: #141418;
            border-bottom: 1px solid #1e1e26; flex-shrink: 0;
        }
        #vt-title {
            font-size: 10px; font-weight: 700;
            letter-spacing: .12em; color: #a78bfa;
            white-space: nowrap; overflow: hidden;
        }
        #vt-tog {
            background: none; border: none; color: #52525b;
            cursor: pointer; font-size: 11px; padding: 2px 4px; flex-shrink: 0;
        }
        #vt-tog:hover { color: #d4d4d8; }
        #vt-body {
            flex: 1; overflow-y: auto; padding: 0;
            scrollbar-width: thin; scrollbar-color: #2a2a35 #0c0c0f;
        }
        .vt-sec {
            padding: 9px 11px; border-bottom: 1px solid #18181f;
        }
        .vt-sec-title {
            font-size: 9.5px; font-weight: 700; letter-spacing: .09em;
            color: #52525b; margin-bottom: 7px;
        }
        .vt-row {
            display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
        }
        .vt-lbl {
            flex: 0 0 76px; font-size: 10.5px; color: #a1a1aa;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .vt-slider { flex: 1; height: 3px; accent-color: #a78bfa; cursor: pointer; }
        .vt-num { flex: 0 0 26px; text-align: right; font-size: 10.5px; color: #52525b; }
        .vt-tag { font-size: 10.5px; }
        .vt-select, .vt-input {
            width: 100%; box-sizing: border-box;
            background: #141418; border: 1px solid #2a2a35; color: #d4d4d8;
            padding: 5px 8px; border-radius: 4px; font-size: 12px;
        }
        .vt-select { cursor: pointer; }
        .vt-select:focus, .vt-input:focus {
            outline: none; border-color: #a78bfa;
        }
        .vt-btn {
            display: block; width: 100%; padding: 7px 0;
            border: none; border-radius: 4px;
            font-size: 11.5px; font-weight: 600; cursor: pointer;
            margin-bottom: 5px; letter-spacing: .03em;
        }
        .vt-btn-primary { background: #7c3aed; color: #fff; }
        .vt-btn-primary:hover { background: #6d28d9; }
        .vt-btn-ghost {
            background: #141418; color: #a1a1aa; border: 1px solid #2a2a35;
        }
        .vt-btn-ghost:hover { background: #1e1e26; color: #d4d4d8; }
        #vt-hud.vt-collapsed #vt-body  { display: none; }
        #vt-hud.vt-collapsed #vt-title { display: none; }
        `;
    }

    function wireHudControls() {
        // Collapse / expand
        document.getElementById('vt-tog').addEventListener('click', () => {
            hudCollapsed = !hudCollapsed;
            document.getElementById('vt-hud').classList.toggle('vt-collapsed', hudCollapsed);
            document.getElementById('vt-tog').textContent = hudCollapsed ? '▶' : '◀';
        });

        // Tone dial sliders — push to main page AND all iframes
        for (const name of Object.keys(DIAL_JOINT)) {
            const id     = name.toLowerCase();
            const slider = document.getElementById(`vt-dial-${id}`);
            const label  = document.getElementById(`vt-dial-${id}-val`);
            if (!slider) continue;

            slider.addEventListener('input', () => {
                const norm = parseInt(slider.value, 10);
                label.textContent   = norm;
                dialValues[name]    = norm;

                // Update the native main-page slider so the site's prompt regenerates
                pushDialToMainPage(name, norm);

                // Push to all ready iframes
                for (const [, frame] of Object.entries(iframes)) {
                    if (frame.ready) {
                        syncDialInDoc(frame.el.contentDocument, frame.el.contentWindow, name, norm);
                    }
                }

                // Send servo command
                sendJoint(DIAL_JOINT[name], Math.round((norm / 100) * 180));
            });
        }

        // Bob-speed slider — blends with ENERGY+VERBOSITY to set animation tick rate
        const bobSpeedSlider = document.getElementById('vt-bob-speed');
        const bobSpeedLabel  = document.getElementById('vt-bob-speed-val');
        if (bobSpeedSlider) {
            bobSpeedSlider.addEventListener('input', () => {
                hudBobSpeed = parseInt(bobSpeedSlider.value, 10);
                bobSpeedLabel.textContent = hudBobSpeed;
                syncChoreographerSlider(0, hudBobSpeed);   // push to choreographer
                if (animationTimer) startAnimation();       // apply new interval immediately
            });
        }

        // Turn-pause slider — controls the dead air between spoken turns (200–3000 ms)
        const pauseSlider = document.getElementById('vt-pause');
        const pauseLabel  = document.getElementById('vt-pause-val');
        if (pauseSlider) {
            pauseSlider.addEventListener('input', () => {
                hudTurnPause = parseInt(pauseSlider.value, 10);
                pauseLabel.textContent = hudTurnPause;
                syncChoreographerSlider(1, hudTurnPause);   // push to choreographer
            });
        }

        // Refusal-threshold slider — pushes live to /play/refusal iframe
        const refusalSlider = document.getElementById('vt-refusal');
        const refusalLabel  = document.getElementById('vt-refusal-val');
        if (refusalSlider) {
            refusalSlider.addEventListener('input', () => {
                refusalLabel.textContent = refusalSlider.value;
                syncRefusalThreshold(parseInt(refusalSlider.value, 10));
            });
        }

        // Persona name inputs → /play/persona iframe
        document.getElementById('vt-p-vader').addEventListener('change', e => {
            syncPersonaField('NAME', e.target.value);
        });
        document.getElementById('vt-p-trooper').addEventListener('change', e => {
            syncPersonaField('ROLE', e.target.value);
        });

        // "Sync All" — force-push every current HUD value to the main page and every ready iframe
        document.getElementById('vt-sync-btn').addEventListener('click', syncAll);

        // "Generate" — click the main page's primary run button
        document.getElementById('vt-gen-btn').addEventListener('click', () => {
            const runBtn = [...document.querySelectorAll('button')]
                .find(b => /run|generate|ask/i.test(b.textContent));
            if (runBtn) runBtn.click();
        });

        // "Start Loop" — activate the automated Darth Vader ↔ Stormtrooper handoff loop
        document.getElementById('vt-loop-start').addEventListener('click', () => {
            // Cloud-model guardrail: warn if a local 'Free (in browser)' / WebGPU model
            // appears to be active. Local inference blocks the browser's main thread and
            // starves the 50 ms servo animation setInterval, causing physical stutter.
            // We check <select> values, [role="combobox"] text, and selected [role="option"]
            // elements — the shapes most React model pickers render on this page.
            const _modelNodes = [
                ...document.querySelectorAll('select'),
                ...document.querySelectorAll('[role="combobox"]'),
                ...document.querySelectorAll('[role="option"][aria-selected="true"]'),
                ...document.querySelectorAll('[aria-label*="model" i]'),
                ...document.querySelectorAll('[data-testid*="model" i]'),
            ];
            const _modelText = _modelNodes
                .map(el => (el.value || el.textContent || el.getAttribute('aria-label') || '').trim())
                .join(' ');
            if (/free\s*\(in\s*browser\)|webgpu/i.test(_modelText)) {
                const _proceed = window.confirm(
                    'WARNING: A local \'Free (in browser)\' model is selected.\n\n' +
                    'Local WebGPU inference blocks the browser\'s main thread and will\n' +
                    'cause severe latency and stuttering in the physical servo animations.\n\n' +
                    'It is highly recommended to switch to Claude Haiku 4.5 before starting.\n\n' +
                    'Continue anyway?'
                );
                if (!_proceed) return;
            }
            loopActive     = true;
            loopPaused     = false;
            currentSpeaker = 'vader';
            document.getElementById('vt-loop-start').style.display = 'none';
            document.getElementById('vt-loop-stop').style.display  = 'block';
            document.getElementById('vt-speaker-tag').textContent  = 'Darth Vader';
            updateHudStatus('ws', wsReady ? '🟢 Loop active' : '🔴 Relay offline', wsReady ? '#4ade80' : '#f87171');
            console.log('[Vader/Trooper] Handoff loop started — Darth Vader goes first.');
            lastTurnTime     = Date.now();
            sessionStartTime = Date.now();
            if (watchdogTimer) clearInterval(watchdogTimer);
            watchdogTimer = setInterval(() => {
                if (!loopActive) { clearInterval(watchdogTimer); watchdogTimer = null; return; }
                const staleSec = Math.round((Date.now() - lastTurnTime) / 1000);
                if (staleSec > 90) updateHudStatus('ws', `\u26a0\ufe0f Loop stalled (${staleSec}s)`, '#f59e0b');
            }, 15000);
            // Kick off by clicking generate immediately
            const runBtn = [...document.querySelectorAll('button')]
                .find(b => /run|generate|ask/i.test(b.textContent));
            if (runBtn) runBtn.click();
        });

        // "Stop Loop" — halt the loop and return both figures to rest
        document.getElementById('vt-loop-stop').addEventListener('click', () => {
            loopActive = false;
            loopPaused = false;
            document.getElementById('vt-loop-start').style.display = 'block';
            document.getElementById('vt-loop-stop').style.display  = 'none';
            window.speechSynthesis.cancel();
            stopAnimation();
            stopNoiseInterval();
            if (diffUncertaintyActive) resolveDiffUncertainty();
            if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
            sessionStartTime = 0;
            const timerEl = document.getElementById('vt-session-timer');
            if (timerEl) timerEl.textContent = '\u2014';
            const tickEl  = document.getElementById('vt-ticks-display');
            if (tickEl)  tickEl.textContent  = '\u2014';
            sendJoint(JOINTS.VADER_HEAD, HEAD_CENTER);
            document.getElementById('vt-speaker-tag').textContent = 'Darth Vader';
            console.log('[Vader/Trooper] Handoff loop stopped.');
        });

        // "Score Session" — push sessionLog + criteria to /play/eval and trigger automated scoring
        document.getElementById('vt-score-btn').addEventListener('click', runEvalScoring);

        // "Load Replay" — fetch full performance_logs.json from relay.py and load into /play/eval
        document.getElementById('vt-replay-btn').addEventListener('click', loadReplay);

        // Calibration: direct per-channel servo control for Phase 4 angle-limit tuning
        const calCh    = document.getElementById('vt-cal-ch');
        const calAngle = document.getElementById('vt-cal-angle');
        const calVal   = document.getElementById('vt-cal-angle-val');
        if (calAngle) {
            calAngle.addEventListener('input', () => {
                calVal.textContent = calAngle.value;
                sendServo(parseInt(calCh.value, 10), parseInt(calAngle.value, 10));
            });
        }
        if (calCh) {
            // Switching channel resets slider to 90° so each channel starts from neutral
            calCh.addEventListener('change', () => {
                calAngle.value = 90;
                calVal.textContent = 90;
                sendServo(parseInt(calCh.value, 10), 90);
            });
        }

        // "Test CH" — single-channel sweep for isolated Phase 3 wiring verification
        document.getElementById('vt-cal-test')?.addEventListener('click', () => {
            const statusEl = document.getElementById('vt-cal-status');
            if (!wsReady || ws.readyState !== WebSocket.OPEN) {
                if (statusEl) statusEl.textContent = 'Relay offline';
                return;
            }
            const ch = parseInt(calCh.value, 10);
            ws.send(JSON.stringify({ type: 'test_channel', channel: ch }));
            if (statusEl) statusEl.textContent = `Testing CH${ch}\u2026`;
        });

        // "Set Min" / "Set Max" — record current angle as suggested soft limit for firmware
        const suggestedLimits = Array.from({ length: 6 }, () => ({}));
        const calLimitsEl     = document.getElementById('vt-cal-limits');

        function updateLimitsDisplay(ch) {
            if (!calLimitsEl) return;
            const l = suggestedLimits[ch];
            calLimitsEl.textContent =
                `CH${ch}: SOFT_MIN[${ch}]=${l.min ?? '?'}  SOFT_MAX[${ch}]=${l.max ?? '?'} \u2014 update firmware`;
        }
        document.getElementById('vt-cal-min')?.addEventListener('click', () => {
            const ch = parseInt(calCh.value, 10);
            suggestedLimits[ch].min = parseInt(calAngle.value, 10);
            updateLimitsDisplay(ch);
        });
        document.getElementById('vt-cal-max')?.addEventListener('click', () => {
            const ch = parseInt(calCh.value, 10);
            suggestedLimits[ch].max = parseInt(calAngle.value, 10);
            updateLimitsDisplay(ch);
        });

        // "Sweep All" — relay.py exercises every channel for Phase 3 wiring verification
        document.getElementById('vt-sweep-btn').addEventListener('click', () => {
            const statusEl = document.getElementById('vt-cal-status');
            if (!wsReady || ws.readyState !== WebSocket.OPEN) {
                if (statusEl) statusEl.textContent = 'Relay offline';
                return;
            }
            ws.send(JSON.stringify({ type: 'sweep_test' }));
            if (statusEl) statusEl.textContent = 'Sweeping\u2026';
        });
    }

    // Update a status label in the HUD by its key name.
    function updateHudStatus(key, text, color) {
        const el = document.getElementById(`vt-status-${key}`);
        if (!el) return;
        el.textContent  = text;
        el.style.color  = color || '#d4d4d8';
    }

    // ── Boot ──────────────────────────────────────────────────────

    // Chrome loads speech voices asynchronously — pre-trigger so they are
    // available by the time the first utterance fires.
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    connect();
    buildHUD();
    injectIframes();
    waitForDials();
    initOutputMonitoring();
    initTemperatureBinding();

})();
