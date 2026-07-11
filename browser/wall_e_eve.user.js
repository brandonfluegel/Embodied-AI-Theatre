// ==UserScript==
// @name         Wall-E & EVE Servo Controller
// @namespace    robotproject.local
// @version      2.0.0
// @description  Tone-dial tracking, output-stream detection, Web Speech synthesis, and head-bob servo animation for shape-models.com/play/tone
// @author       RobotProject
// @match        https://www.shape-models.com/play/tone
// @match        https://shape-models.com/play/tone
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
  HOW TO INSTALL
  --------------
  1. Install the Tampermonkey extension in Chrome or Firefox.
  2. Open the Tampermonkey dashboard → click "Create a new script".
  3. Delete the placeholder code and paste this entire file in.
  4. Press Ctrl+S (or Cmd+S on Mac) to save.
  5. Navigate to https://www.shape-models.com/play/tone.
  6. Make sure relay.py is running first (python relay.py in your terminal).

  WHAT THIS SCRIPT DOES
  ---------------------
  1. Binds the 6 tone dials to servo channels 0-5 (Wall-E & EVE).
  2. Stores each dial's normalized value (0-100) as a live parameter.
  3. Watches the output text block for newly streamed responses.
  4. When a response finishes streaming, speaks it via Web Speech API.
  5. While speech plays, oscillates Wall-E's head servo (ch 0) at a rate
     scaled by the ENERGY and VERBOSITY dial values.
  6. Stops the servo animation the instant the voice finishes.

  DIAL → SERVO + PARAMETER MAPPING
  ---------------------------------
  WARMTH       → ch 0  Wall-E head bob     voice pitch (0.85 – 1.15)
  VERBOSITY    → ch 1  Wall-E waist twist  animation density
  ENERGY       → ch 2  Wall-E arm          speech rate (0.75 – 1.40) + anim speed
  DIRECTNESS   → ch 3  EVE head tilt
  CONCRETENESS → ch 4  EVE body lean
  STRUCTURE    → ch 5  EVE arm
*/

(function () {
    'use strict';

    // ── Configuration ─────────────────────────────────────────────
    const WS_URL                 = 'ws://localhost:8765';
    const RECONNECT_MS           = 2000;
    const STREAM_END_DEBOUNCE_MS = 850;    // ms quiet after last chunk → stream done
    const HEAD_BOB_CHANNEL       = 0;      // Wall-E head servo channel
    const HEAD_CENTER            = 90;     // resting angle (degrees)
    const HEAD_BOB_RANGE         = 10;     // ± offset while speaking (80° ↔ 100°)
    const ANIM_INTERVAL_FAST_MS  = 50;     // fastest tick when ENERGY = 100
    const ANIM_INTERVAL_SLOW_MS  = 200;    // slowest tick when ENERGY = 0
    // ──────────────────────────────────────────────────────────────

    // ── Dial → channel map ────────────────────────────────────────
    const DIAL_CHANNEL = {
        WARMTH:       0,
        VERBOSITY:    1,
        ENERGY:       2,
        DIRECTNESS:   3,
        CONCRETENESS: 4,
        STRUCTURE:    5,
    };

    // ── Live parameter state (updated on every dial move) ─────────
    // Values are normalized to 0-100, independent of the raw slider range.
    const dialValues = {
        WARMTH:       50,
        VERBOSITY:    50,
        ENERGY:       50,
        DIRECTNESS:   50,
        CONCRETENESS: 50,
        STRUCTURE:    50,
    };
    // ──────────────────────────────────────────────────────────────

    let ws              = null;
    let wsReady         = false;
    const bound         = new Set();   // slider elements already attached

    let animationTimer  = null;        // setInterval handle for head-bob loop
    let animPhase       = 0;           // 0 = nod up, 1 = nod down

    let streamDebounce  = null;        // setTimeout handle for stream-end detection
    let lastSpokenText  = '';          // prevents re-speaking the same block
    let outputObserver  = null;
    let outputContainer = null;

    // ── WebSocket (auto-reconnects) ───────────────────────────────

    function connect() {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            wsReady = true;
            console.log('[Wall-E/EVE] Relay connected.');
        };

        ws.onclose = () => {
            wsReady = false;
            console.warn('[Wall-E/EVE] Relay disconnected — retrying in', RECONNECT_MS, 'ms');
            setTimeout(connect, RECONNECT_MS);
        };

        ws.onerror = () => {};   // handled by onclose
    }

    function sendServo(channel, angle) {
        if (wsReady && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ channel, angle }));
        }
    }

    // ── Value helpers ─────────────────────────────────────────────

    /** Maps raw slider value → servo angle [0, 180]. */
    function toAngle(value, inMin, inMax) {
        const v = Math.max(inMin, Math.min(inMax, value));
        return Math.round(((v - inMin) / (inMax - inMin)) * 180);
    }

    /** Maps raw slider value → normalized parameter [0, 100]. */
    function toNormalized(value, inMin, inMax) {
        const v = Math.max(inMin, Math.min(inMax, value));
        return Math.round(((v - inMin) / (inMax - inMin)) * 100);
    }

    // ── Head-bob animation ────────────────────────────────────────

    /**
     * Tick interval in ms, scaled by the average of ENERGY and VERBOSITY.
     * High combined value (100) → fastest bob.
     * Low combined value  (0)   → slowest bob.
     */
    function getAnimInterval() {
        const driver = (dialValues.ENERGY + dialValues.VERBOSITY) / 2;
        return Math.round(
            ANIM_INTERVAL_SLOW_MS -
            (driver / 100) * (ANIM_INTERVAL_SLOW_MS - ANIM_INTERVAL_FAST_MS)
        );
    }

    function animationTick() {
        animPhase = (animPhase + 1) % 2;
        sendServo(HEAD_BOB_CHANNEL, HEAD_CENTER + (animPhase === 0 ? HEAD_BOB_RANGE : -HEAD_BOB_RANGE));
    }

    function startAnimation() {
        stopAnimation();   // clear any stale timer first
        animationTimer = setInterval(animationTick, getAnimInterval());
        console.log(`[Wall-E/EVE] Head-bob started — ${getAnimInterval()} ms interval.`);
    }

    function stopAnimation() {
        if (animationTimer) {
            clearInterval(animationTimer);
            animationTimer = null;
        }
        animPhase = 0;
    }

    // ── Web Speech synthesis ──────────────────────────────────────

    function pickVoice() {
        const voices = window.speechSynthesis.getVoices();
        // Prefer a local US-English voice; fall back gracefully
        return voices.find(v => v.lang === 'en-US' && v.localService)
            || voices.find(v => v.lang === 'en-US')
            || voices[0]
            || null;
    }

    function speakText(text) {
        if (!window.speechSynthesis) {
            console.warn('[Wall-E/EVE] Web Speech API unavailable in this browser.');
            return;
        }

        // Cancel any in-progress speech before starting a new utterance
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        const voice = pickVoice();
        if (voice) utterance.voice = voice;

        // ENERGY  (0-100) drives speech rate:  0.75 (slow) → 1.40 (fast)
        utterance.rate  = 0.75 + (dialValues.ENERGY / 100) * 0.65;
        // WARMTH  (0-100) drives pitch:         0.85 (low)  → 1.15 (high)
        utterance.pitch = 0.85 + (dialValues.WARMTH / 100) * 0.30;

        utterance.onstart = () => {
            console.log('[Wall-E/EVE] Speaking…');
            startAnimation();
        };

        utterance.onend = () => {
            console.log('[Wall-E/EVE] Speech finished.');
            stopAnimation();
            sendServo(HEAD_BOB_CHANNEL, HEAD_CENTER);   // return head to rest
        };

        utterance.onerror = (e) => {
            console.error('[Wall-E/EVE] Speech error:', e.error);
            stopAnimation();
            sendServo(HEAD_BOB_CHANNEL, HEAD_CENTER);
        };

        window.speechSynthesis.speak(utterance);
    }

    // ── Output text monitoring ────────────────────────────────────

    /**
     * Strip UI chrome from the output container's text content so only
     * the model-generated prose remains.
     */
    function extractOutputText(container) {
        return (container.textContent || '')
            .trim()
            .replace(/^OUTPUT\s*/i, '')
            .replace(/^(Llama|GPT|Claude|Gemini|Mistral|Llama[\s\d.B]+)[^\n]*\n?/i, '')
            .replace(/^IDLE\s*/i, '')
            .replace(/^Output will stream here\.?\s*/i, '')
            .replace(/^CLEAR OUTPUT\s*/i, '')
            .trim();
    }

    /**
     * Called by MutationObserver on every DOM change inside the output area.
     * Resets a debounce timer each time; fires speakText only after the stream
     * has been quiet for STREAM_END_DEBOUNCE_MS milliseconds.
     */
    function onStreamChunk() {
        if (!outputContainer) return;

        const text = extractOutputText(outputContainer);
        if (!text || text.length < 10) return;   // still in idle / placeholder state

        if (streamDebounce) clearTimeout(streamDebounce);

        streamDebounce = setTimeout(() => {
            const finalText = extractOutputText(outputContainer);
            if (finalText && finalText.length > 10 && finalText !== lastSpokenText) {
                lastSpokenText = finalText;
                console.log('[Wall-E/EVE] Stream complete →', finalText.slice(0, 60) + '…');
                speakText(finalText);
            }
        }, STREAM_END_DEBOUNCE_MS);
    }

    function attachOutputObserver(container) {
        if (outputObserver) outputObserver.disconnect();
        outputObserver = new MutationObserver(onStreamChunk);
        outputObserver.observe(container, {
            childList:     true,
            subtree:       true,
            characterData: true,
        });
        console.log('[Wall-E/EVE] Output observer attached.');
    }

    /**
     * Find the DOM element that wraps the generated text output.
     * The page initially shows a placeholder; we locate it by that text.
     */
    function findOutputSection() {
        // Primary: find the tightest element containing the placeholder text
        for (const el of document.querySelectorAll('div, p, span, section')) {
            const text = (el.textContent || '').trim();
            if (text.includes('Output will stream here') && text.length < 600) {
                return el;
            }
        }
        // Fallback: container with "OUTPUT" + "IDLE" that isn't too large
        for (const el of document.querySelectorAll('div, section')) {
            const text = (el.textContent || '').toUpperCase();
            if (text.includes('OUTPUT') && text.includes('IDLE') && el.textContent.length < 400) {
                return el;
            }
        }
        return null;
    }

    function initOutputMonitoring() {
        outputContainer = findOutputSection();
        if (!outputContainer) {
            // Output section hasn't rendered yet — retry shortly
            setTimeout(initOutputMonitoring, 1500);
            return;
        }
        attachOutputObserver(outputContainer);
    }

    // ── Tone-dial detection ───────────────────────────────────────

    /**
     * Find the tightest DOM container that holds all six tone dials.
     * Scoping searches here guarantees the Temperature slider above is
     * structurally unreachable.
     */
    function getToneDialsSection() {
        const required = ['TONE DIALS', ...Object.keys(DIAL_CHANNEL)];
        let best = null;
        for (const el of document.querySelectorAll('div, section, fieldset, article')) {
            const text = (el.textContent || '').toUpperCase();
            if (required.every(name => text.includes(name))) {
                if (!best || el.textContent.length < best.textContent.length) {
                    best = el;
                }
            }
        }
        return best;
    }

    /**
     * Walk up from a slider, capped at 4 levels, to identify which tone
     * dial it belongs to.  Returns null for the Temperature slider or any
     * unrecognised control.
     */
    function findDialName(el) {
        let node = el.parentElement;
        for (let depth = 0; depth < 4 && node; depth++) {
            const text = (node.textContent || '').toUpperCase();
            if (text.includes('TEMPERATURE')) return null;   // hard exclusion
            for (const name of Object.keys(DIAL_CHANNEL)) {
                if (text.includes(name)) return name;
            }
            node = node.parentElement;
        }
        return null;
    }

    // ── Slider binding ────────────────────────────────────────────

    /**
     * Central handler for any dial change.
     * 1. Updates the normalized parameter store (0-100) used by speech + animation.
     * 2. Sends the mapped servo angle (0-180) to relay.py.
     */
    function onDialChange(name, rawValue, inMin, inMax) {
        dialValues[name] = toNormalized(rawValue, inMin, inMax);
        sendServo(DIAL_CHANNEL[name], toAngle(rawValue, inMin, inMax));
    }

    function bindRangeInput(input, name) {
        if (bound.has(input)) return;
        bound.add(input);

        const min = () => parseFloat(input.min) || -5;
        const max = () => parseFloat(input.max) ||  5;

        input.addEventListener('input', () => {
            onDialChange(name, parseFloat(input.value), min(), max());
        });

        console.log(`[Wall-E/EVE] ch${DIAL_CHANNEL[name]} (${name}) ← range input`);
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

        console.log(`[Wall-E/EVE] ch${DIAL_CHANNEL[name]} (${name}) ← aria slider`);
    }

    // ── Scan page for tone dials ──────────────────────────────────

    function scanAndBind() {
        const section = getToneDialsSection();
        if (!section) return false;   // not rendered yet — MutationObserver will retry

        let newlyBound = 0;

        // Pass 1 — native <input type="range"> inside the tone-dials section
        for (const input of section.querySelectorAll('input[type="range"]:not([disabled])')) {
            if (bound.has(input)) continue;
            const name = findDialName(input);
            if (name !== null) { bindRangeInput(input, name); newlyBound++; }
        }

        // Pass 2 — aria-based custom sliders (Radix UI etc.) inside the section
        for (const el of section.querySelectorAll('[role="slider"]')) {
            if (bound.has(el)) continue;
            const name = findDialName(el);
            if (name !== null) { bindAriaSlider(el, name); newlyBound++; }
        }

        // No positional fallback — only explicit label matches are accepted.

        if (newlyBound > 0) {
            console.log(`[Wall-E/EVE] ${bound.size}/6 dials bound.`);
        }

        return bound.size >= 6;
    }

    function waitForDials() {
        if (scanAndBind()) return;

        const mo = new MutationObserver(() => {
            if (scanAndBind()) mo.disconnect();
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    // ── Boot ──────────────────────────────────────────────────────

    // Trigger async voice loading in Chrome (getVoices() is empty on first call)
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    connect();
    waitForDials();
    initOutputMonitoring();

})();
