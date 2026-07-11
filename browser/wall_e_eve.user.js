// ==UserScript==
// @name         Wall-E & EVE Master Control Matrix
// @namespace    robotproject.local
// @version      3.0.0
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
  5. The purple HUD panel will appear on the right side of the page.

  WHAT'S NEW IN v3.0.0
  ---------------------
  - Floating Master HUD sidebar with unified controls for all playgrounds.
  - Five hidden same-origin iframes load /play/persona, /play/diff, etc. in the
    background so their native controls can be driven from this single tab.
  - HUD tone dials push values both to the main page's native sliders AND to the
    matching sliders inside every loaded iframe simultaneously.
  - Model dropdown on the HUD syncs the selected model across all iframes.
  - Persona name fields push to the /play/persona iframe's NAME input.
  - "Sync All" button force-pushes every current HUD value to every ready iframe.
  - "Generate" button clicks the main page's run button from the HUD.
  - All v2 features kept: MutationObserver stream detection, Web Speech synthesis,
    head-bob servo animation scaled by ENERGY + VERBOSITY dials.

  HUD SECTIONS
  ------------
  MODEL       — picks the AI model; syncs to all iframes
  TONE DIALS  — six dials; mirrors the main page + pushes to iframes
  PERSONA     — Wall-E and EVE name fields → /play/persona iframe
  PACING      — bob speed and turn-pause sliders (drive animation timing)
  REFUSAL     — threshold slider → /play/refusal iframe
  IFRAMES     — live status dot for each background iframe
*/

(function () {
    'use strict';

    // ── Configuration ─────────────────────────────────────────────
    const WS_URL                 = 'ws://localhost:8765';
    const RECONNECT_MS           = 2000;
    const STREAM_END_DEBOUNCE_MS = 850;
    const IFRAME_READY_DELAY_MS  = 2500;   // ms after iframe load to let React hydrate

    const IFRAME_PAGES = {
        persona:       'https://www.shape-models.com/play/persona',
        choreographer: 'https://www.shape-models.com/play/choreographer',
        refusal:       'https://www.shape-models.com/play/refusal',
        diff:          'https://www.shape-models.com/play/diff',
        eval:          'https://www.shape-models.com/play/eval',
    };

    // All known model names on the site (extend if the site adds more)
    const MODEL_OPTIONS = [
        'Llama 3.2 1B',
        'Llama 3.3 70B',
        'GPT-4o',
        'GPT-4o mini',
        'Claude 3.5 Haiku',
        'Claude 3.5 Sonnet',
    ];

    // Tone dial → servo channel (Wall-E ch 0-2, EVE ch 3-5)
    const DIAL_CHANNEL = {
        WARMTH:       0,
        VERBOSITY:    1,
        ENERGY:       2,
        DIRECTNESS:   3,
        CONCRETENESS: 4,
        STRUCTURE:    5,
    };

    // Head-bob animation
    const HEAD_BOB_CHANNEL      = 0;
    const HEAD_CENTER           = 90;
    const HEAD_BOB_RANGE        = 10;
    const ANIM_INTERVAL_FAST_MS = 50;
    const ANIM_INTERVAL_SLOW_MS = 200;
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

    let selectedModel = MODEL_OPTIONS[0];
    let hudCollapsed  = false;
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

        ws.onerror = () => {};
    }

    function sendServo(channel, angle) {
        if (wsReady && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ channel, angle }));
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
        const driver = (dialValues.ENERGY + dialValues.VERBOSITY) / 2;
        return Math.round(
            ANIM_INTERVAL_SLOW_MS -
            (driver / 100) * (ANIM_INTERVAL_SLOW_MS - ANIM_INTERVAL_FAST_MS)
        );
    }

    function animationTick() {
        animPhase = (animPhase + 1) % 2;
        sendServo(
            HEAD_BOB_CHANNEL,
            HEAD_CENTER + (animPhase === 0 ? HEAD_BOB_RANGE : -HEAD_BOB_RANGE)
        );
    }

    function startAnimation() {
        stopAnimation();
        animationTimer = setInterval(animationTick, getAnimInterval());
    }

    function stopAnimation() {
        if (animationTimer) { clearInterval(animationTimer); animationTimer = null; }
        animPhase = 0;
    }

    // ── Web Speech synthesis ──────────────────────────────────────

    function pickVoice() {
        const voices = window.speechSynthesis.getVoices();
        return voices.find(v => v.lang === 'en-US' && v.localService)
            || voices.find(v => v.lang === 'en-US')
            || voices[0] || null;
    }

    function speakText(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();

        const utt   = new SpeechSynthesisUtterance(text);
        const voice = pickVoice();
        if (voice) utt.voice = voice;

        utt.rate  = 0.75 + (dialValues.ENERGY / 100) * 0.65;
        utt.pitch = 0.85 + (dialValues.WARMTH  / 100) * 0.30;

        utt.onstart = () => startAnimation();
        utt.onend   = () => { stopAnimation(); sendServo(HEAD_BOB_CHANNEL, HEAD_CENTER); };
        utt.onerror = () => { stopAnimation(); sendServo(HEAD_BOB_CHANNEL, HEAD_CENTER); };

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
            if (final && final.length > 10 && final !== lastSpokenText) {
                lastSpokenText = final;
                console.log('[Wall-E/EVE] Stream complete →', final.slice(0, 60) + '…');
                speakText(final);
            }
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
        console.log('[Wall-E/EVE] Output observer attached to main page.');
    }

    // ── Tone dial binding (main page) ─────────────────────────────

    function getToneDialsSection(doc) {
        doc = doc || document;
        const required = ['TONE DIALS', ...Object.keys(DIAL_CHANNEL)];
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
            for (const name of Object.keys(DIAL_CHANNEL)) {
                if (text.includes(name)) return name;
            }
            node = node.parentElement;
        }
        return null;
    }

    // Called whenever any dial on the main page moves.
    function onDialChange(name, rawValue, inMin, inMax) {
        dialValues[name] = toNormalized(rawValue, inMin, inMax);
        sendServo(DIAL_CHANNEL[name], toAngle(rawValue, inMin, inMax));

        // Keep the HUD slider in sync with the main page
        const hudSlider = document.getElementById(`wev-dial-${name.toLowerCase()}`);
        const hudLabel  = document.getElementById(`wev-dial-${name.toLowerCase()}-val`);
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

    // Push the selected model to every ready iframe's model selector.
    function syncModelToIframes(model) {
        for (const [key, frame] of Object.entries(iframes)) {
            if (!frame.ready) continue;
            const doc = frame.el.contentDocument;
            const win = frame.el.contentWindow;
            for (const el of doc.querySelectorAll('select, [role="combobox"]')) {
                const text = (el.textContent || '').toLowerCase();
                if (text.includes('1b') || text.includes('gpt') || text.includes('claude') || text.includes('llama')) {
                    setReactValue(el, model, win);
                }
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

    // ── Iframe manager ────────────────────────────────────────────

    function injectIframes() {
        for (const [key, url] of Object.entries(IFRAME_PAGES)) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            // Hidden and zero-size — completely invisible, no layout impact
            iframe.style.cssText = 'display:none;position:fixed;width:0;height:0;border:0;pointer-events:none;';
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
                        syncModelToIframes(selectedModel);
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
        style.id = 'wev-styles';
        style.textContent = hudCSS();
        document.head.appendChild(style);

        // Build DOM
        const hud = document.createElement('div');
        hud.id = 'wev-hud';
        hud.innerHTML = hudHTML();
        document.body.appendChild(hud);

        wireHudControls();
    }

    function hudHTML() {
        const dialRows = Object.keys(DIAL_CHANNEL).map(name => `
            <div class="wev-row">
                <span class="wev-lbl">${name}</span>
                <input type="range" id="wev-dial-${name.toLowerCase()}"
                       class="wev-slider" min="0" max="100" value="50">
                <span id="wev-dial-${name.toLowerCase()}-val" class="wev-num">50</span>
            </div>`).join('');

        const modelOpts = MODEL_OPTIONS.map(m =>
            `<option value="${m}">${m}</option>`
        ).join('');

        const iframeRows = Object.keys(IFRAME_PAGES).map(key => `
            <div class="wev-row">
                <span class="wev-lbl">${key}</span>
                <span id="wev-status-${key}" class="wev-tag" style="color:#facc15">🟡 Loading</span>
            </div>`).join('');

        return `
        <div id="wev-inner">
            <div id="wev-head">
                <span id="wev-title">WALL-E / EVE</span>
                <button id="wev-tog" title="Collapse HUD">◀</button>
            </div>
            <div id="wev-body">

                <div class="wev-sec">
                    <span id="wev-status-ws" style="font-size:11px;color:#f87171">🔴 Relay offline</span>
                </div>

                <div class="wev-sec">
                    <div class="wev-sec-title">MODEL</div>
                    <select id="wev-model" class="wev-select">${modelOpts}</select>
                </div>

                <div class="wev-sec">
                    <div class="wev-sec-title">TONE DIALS</div>
                    ${dialRows}
                </div>

                <div class="wev-sec">
                    <div class="wev-sec-title">PERSONA</div>
                    <div class="wev-row"><span class="wev-lbl">Wall-E</span></div>
                    <input type="text" id="wev-p-walle" class="wev-input" placeholder="Wall-E" value="Wall-E">
                    <div class="wev-row" style="margin-top:6px"><span class="wev-lbl">EVE</span></div>
                    <input type="text" id="wev-p-eve" class="wev-input" placeholder="EVE" value="EVE">
                </div>

                <div class="wev-sec">
                    <div class="wev-sec-title">PACING</div>
                    <div class="wev-row">
                        <span class="wev-lbl">Bob speed</span>
                        <input type="range" id="wev-bob-speed" class="wev-slider" min="0" max="100" value="50">
                        <span id="wev-bob-speed-val" class="wev-num">50</span>
                    </div>
                    <div class="wev-row">
                        <span class="wev-lbl">Turn pause</span>
                        <input type="range" id="wev-pause" class="wev-slider" min="0" max="100" value="30">
                        <span id="wev-pause-val" class="wev-num">30</span>
                    </div>
                </div>

                <div class="wev-sec">
                    <div class="wev-sec-title">REFUSAL THRESHOLD</div>
                    <div class="wev-row">
                        <span class="wev-lbl">Threshold</span>
                        <input type="range" id="wev-refusal" class="wev-slider" min="0" max="100" value="50">
                        <span id="wev-refusal-val" class="wev-num">50</span>
                    </div>
                </div>

                <div class="wev-sec">
                    <button id="wev-sync-btn" class="wev-btn wev-btn-ghost">↺ Sync all iframes</button>
                    <button id="wev-gen-btn" class="wev-btn wev-btn-primary">▶ Generate</button>
                </div>

                <div class="wev-sec">
                    <div class="wev-sec-title">IFRAME STATUS</div>
                    ${iframeRows}
                </div>

            </div>
        </div>`;
    }

    function hudCSS() {
        return `
        #wev-hud {
            position: fixed; top: 0; right: 0;
            width: 272px; height: 100vh;
            z-index: 2147483647;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            font-size: 12px; line-height: 1.4;
            transition: width .18s ease;
            pointer-events: auto;
        }
        #wev-hud.wev-collapsed { width: 34px; }
        #wev-inner {
            height: 100%; background: #0c0c0f;
            border-left: 1px solid #1e1e26; color: #d4d4d8;
            display: flex; flex-direction: column; overflow: hidden;
        }
        #wev-head {
            display: flex; align-items: center;
            justify-content: space-between;
            padding: 9px 11px; background: #141418;
            border-bottom: 1px solid #1e1e26; flex-shrink: 0;
        }
        #wev-title {
            font-size: 10px; font-weight: 700;
            letter-spacing: .12em; color: #a78bfa;
            white-space: nowrap; overflow: hidden;
        }
        #wev-tog {
            background: none; border: none; color: #52525b;
            cursor: pointer; font-size: 11px; padding: 2px 4px; flex-shrink: 0;
        }
        #wev-tog:hover { color: #d4d4d8; }
        #wev-body {
            flex: 1; overflow-y: auto; padding: 0;
            scrollbar-width: thin; scrollbar-color: #2a2a35 #0c0c0f;
        }
        .wev-sec {
            padding: 9px 11px; border-bottom: 1px solid #18181f;
        }
        .wev-sec-title {
            font-size: 9.5px; font-weight: 700; letter-spacing: .09em;
            color: #52525b; margin-bottom: 7px;
        }
        .wev-row {
            display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
        }
        .wev-lbl {
            flex: 0 0 76px; font-size: 10.5px; color: #a1a1aa;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .wev-slider { flex: 1; height: 3px; accent-color: #a78bfa; cursor: pointer; }
        .wev-num { flex: 0 0 26px; text-align: right; font-size: 10.5px; color: #52525b; }
        .wev-tag { font-size: 10.5px; }
        .wev-select, .wev-input {
            width: 100%; box-sizing: border-box;
            background: #141418; border: 1px solid #2a2a35; color: #d4d4d8;
            padding: 5px 8px; border-radius: 4px; font-size: 12px;
        }
        .wev-select { cursor: pointer; }
        .wev-select:focus, .wev-input:focus {
            outline: none; border-color: #a78bfa;
        }
        .wev-btn {
            display: block; width: 100%; padding: 7px 0;
            border: none; border-radius: 4px;
            font-size: 11.5px; font-weight: 600; cursor: pointer;
            margin-bottom: 5px; letter-spacing: .03em;
        }
        .wev-btn-primary { background: #7c3aed; color: #fff; }
        .wev-btn-primary:hover { background: #6d28d9; }
        .wev-btn-ghost {
            background: #141418; color: #a1a1aa; border: 1px solid #2a2a35;
        }
        .wev-btn-ghost:hover { background: #1e1e26; color: #d4d4d8; }
        #wev-hud.wev-collapsed #wev-body  { display: none; }
        #wev-hud.wev-collapsed #wev-title { display: none; }
        `;
    }

    function wireHudControls() {
        // Collapse / expand
        document.getElementById('wev-tog').addEventListener('click', () => {
            hudCollapsed = !hudCollapsed;
            document.getElementById('wev-hud').classList.toggle('wev-collapsed', hudCollapsed);
            document.getElementById('wev-tog').textContent = hudCollapsed ? '▶' : '◀';
        });

        // Tone dial sliders — push to main page AND all iframes
        for (const name of Object.keys(DIAL_CHANNEL)) {
            const id     = name.toLowerCase();
            const slider = document.getElementById(`wev-dial-${id}`);
            const label  = document.getElementById(`wev-dial-${id}-val`);
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
                sendServo(DIAL_CHANNEL[name], Math.round((norm / 100) * 180));
            });
        }

        // Simple display sliders (pacing, refusal)
        for (const id of ['bob-speed', 'pause', 'refusal']) {
            const s = document.getElementById(`wev-${id}`);
            const l = document.getElementById(`wev-${id}-val`);
            if (s && l) s.addEventListener('input', () => { l.textContent = s.value; });
        }

        // Model dropdown
        document.getElementById('wev-model').addEventListener('change', e => {
            selectedModel = e.target.value;
            syncModelToIframes(selectedModel);
            // Also try to update the main page's model selector
            for (const el of document.querySelectorAll('select')) {
                const t = (el.textContent || '').toLowerCase();
                if (t.includes('1b') || t.includes('gpt') || t.includes('claude') || t.includes('llama')) {
                    setReactValue(el, selectedModel, window);
                }
            }
        });

        // Persona name inputs → /play/persona iframe
        document.getElementById('wev-p-walle').addEventListener('change', e => {
            syncPersonaField('NAME', e.target.value);
        });
        document.getElementById('wev-p-eve').addEventListener('change', e => {
            syncPersonaField('ROLE', e.target.value);
        });

        // "Sync All" — force-push every current HUD value to every ready iframe
        document.getElementById('wev-sync-btn').addEventListener('click', () => {
            syncAllDials();
            syncModelToIframes(selectedModel);
        });

        // "Generate" — click the main page's primary run button
        document.getElementById('wev-gen-btn').addEventListener('click', () => {
            const runBtn = [...document.querySelectorAll('button')]
                .find(b => /run|generate|ask/i.test(b.textContent));
            if (runBtn) runBtn.click();
        });
    }

    // Update a status label in the HUD by its key name.
    function updateHudStatus(key, text, color) {
        const el = document.getElementById(`wev-status-${key}`);
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

})();
