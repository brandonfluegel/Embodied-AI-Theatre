// ==UserScript==
// @name         Wall-E & EVE Servo Controller
// @namespace    robotproject.local
// @version      1.0.0
// @description  Streams the 6 tone dials on shape-models.com/play/tone to Wall-E & EVE servos via ws://localhost:8765
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
  6. Make sure relay.py is already running (python relay.py in your terminal).
  7. Move any dial — the matching servo will respond instantly.

  DIAL → SERVO MAPPING
  --------------------
  WARMTH      → Wall-E ch 0 (head bob)
  VERBOSITY   → Wall-E ch 1 (waist twist)
  ENERGY      → Wall-E ch 2 (arm)
  DIRECTNESS  → EVE   ch 3 (head tilt)
  CONCRETENESS→ EVE   ch 4 (body lean)
  STRUCTURE   → EVE   ch 5 (arm)
*/

(function () {
    'use strict';

    // ── Configuration ─────────────────────────────────────────────
    const WS_URL        = 'ws://localhost:8765';
    const RECONNECT_MS  = 2000;

    // Each entry maps the dial label text to a servo channel number.
    const DIAL_CHANNEL = {
        'WARMTH':        0,   // Wall-E head bob
        'VERBOSITY':     1,   // Wall-E waist twist
        'ENERGY':        2,   // Wall-E arm
        'DIRECTNESS':    3,   // EVE   head tilt
        'CONCRETENESS':  4,   // EVE   body lean
        'STRUCTURE':     5,   // EVE   arm
    };
    // ──────────────────────────────────────────────────────────────

    let ws      = null;
    let wsReady = false;
    const bound = new Set();   // slider elements already attached

    // ── WebSocket connection (auto-reconnects) ────────────────────

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

    // ── Value mapping ─────────────────────────────────────────────

    /**
     * Linearly maps a value from [inMin, inMax] to a servo angle [0, 180].
     * Works regardless of whether the dial range is -5→5, -100→100, 0→10, etc.
     */
    function toAngle(value, inMin, inMax) {
        const clamped = Math.max(inMin, Math.min(inMax, value));
        return Math.round(((clamped - inMin) / (inMax - inMin)) * 180);
    }

    // ── Label detection ───────────────────────────────────────────

    /**
     * Walk up the DOM tree from a slider element and look for one of
     * the known dial names in the text content of the nearest container.
     * Returns the dial name string, or null if none found.
     */
    function findDialName(el) {
        let node = el.parentElement;
        for (let depth = 0; depth < 10 && node; depth++) {
            const text = (node.textContent || '').toUpperCase();
            for (const name of Object.keys(DIAL_CHANNEL)) {
                if (text.includes(name)) return name;
            }
            node = node.parentElement;
        }
        return null;
    }

    // ── Binding: native <input type="range"> ─────────────────────

    function bindRangeInput(input, channel) {
        if (bound.has(input)) return;
        bound.add(input);

        const min = () => parseFloat(input.min) || -5;
        const max = () => parseFloat(input.max) ||  5;

        input.addEventListener('input', () => {
            sendServo(channel, toAngle(parseFloat(input.value), min(), max()));
        });

        console.log(`[Wall-E/EVE] ch${channel} bound to <input type="range"> (min=${min()}, max=${max()})`);
    }

    // ── Binding: custom / Radix-style [role="slider"] ────────────

    function bindAriaSlider(el, channel) {
        if (bound.has(el)) return;
        bound.add(el);

        const min = () => parseFloat(el.getAttribute('aria-valuemin') ?? '-5');
        const max = () => parseFloat(el.getAttribute('aria-valuemax') ??  '5');

        // Radix UI and similar libraries update aria-valuenow instead of value.
        const observer = new MutationObserver(() => {
            const raw = parseFloat(el.getAttribute('aria-valuenow') ?? '0');
            sendServo(channel, toAngle(raw, min(), max()));
        });
        observer.observe(el, { attributes: true, attributeFilter: ['aria-valuenow'] });

        console.log(`[Wall-E/EVE] ch${channel} bound to [role="slider"]`);
    }

    // ── Scan page for dials ───────────────────────────────────────

    function scanAndBind() {
        let newlyBound = 0;

        // Pass 1 — native range inputs
        for (const input of document.querySelectorAll('input[type="range"]:not([disabled])')) {
            if (bound.has(input)) continue;
            const name = findDialName(input);
            if (name !== null) {
                bindRangeInput(input, DIAL_CHANNEL[name]);
                newlyBound++;
            }
        }

        // Pass 2 — aria-based custom sliders (Radix UI etc.)
        for (const el of document.querySelectorAll('[role="slider"]')) {
            if (bound.has(el)) continue;
            const name = findDialName(el);
            if (name !== null) {
                bindAriaSlider(el, DIAL_CHANNEL[name]);
                newlyBound++;
            }
        }

        // Pass 3 — positional fallback: if label matching missed some dials,
        //           bind the first N unbound sliders in DOM order.
        if (bound.size < 6) {
            const remaining = [
                ...document.querySelectorAll('input[type="range"]:not([disabled])'),
                ...document.querySelectorAll('[role="slider"]'),
            ].filter(el => !bound.has(el));

            const names = Object.keys(DIAL_CHANNEL);
            let idx = bound.size;   // start at the first unbound channel

            for (const el of remaining) {
                if (idx >= names.length) break;
                const ch = DIAL_CHANNEL[names[idx]];
                if (el.tagName === 'INPUT') {
                    bindRangeInput(el, ch);
                } else {
                    bindAriaSlider(el, ch);
                }
                idx++;
                newlyBound++;
            }
        }

        if (newlyBound > 0) {
            console.log(`[Wall-E/EVE] ${bound.size}/6 dials bound.`);
        }

        return bound.size >= 6;
    }

    // ── Wait for the React app to render the dials ────────────────

    function waitForDials() {
        if (scanAndBind()) return;   // already found everything

        const observer = new MutationObserver(() => {
            if (scanAndBind()) {
                observer.disconnect();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ── Boot ──────────────────────────────────────────────────────
    connect();
    waitForDials();

})();
