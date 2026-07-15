# Embodied AI Theatre: Darth Vader vs. Stormtrooper (v5.1.0)

**A project by Brandon Fluegel, human factors researcher.**

This is an autonomous, physical-digital AI theatre that allows Darth Vader and an Imperial Stormtrooper (1/12-scale Hasbro action figures) to hold unscripted spoken debates without any human input once the show starts. Each character has a synthesized voice, a distinct AI persona, and a physical body that moves in coordination with its speech. The loop runs indefinitely: one character speaks, the other listens and then responds, with the physical performance driving the full experience.

---

## The Digital Brain: The shape-models.com Matrix

The show is controlled from a single browser tab. A Tampermonkey userscript (`vader_trooper.user.js`) is injected into the shape-models.com `/play/tone` page, where it builds a hidden iframe matrix that orchestrates six playgrounds simultaneously.

The `/play/tone` tab is the master surface. Six tone dials (Warmth, Verbosity, Energy, Directness, Concreteness, Structure) shape the AI text output, the voice synthesis parameters, and the speed of every servo movement at the same time. A floating HUD panel on the right side of the page provides unified control without switching tabs.

The background playgrounds each handle a specific job. `/play/persona` receives the active speaker's name and, when the script detects aggressive dialogue sentiment, an emotional intensity modifier injected directly into the backstory textarea before each generation. `/play/choreographer` controls head-bob speed and the pause between speaking turns. `/play/refusal` monitors for AI safety boundaries; when one triggers, both figures freeze into a defined defensive posture (Vader bows his head, the Trooper snaps to attention). `/play/diff` watches for divergent prompt outputs using Jaccard word-overlap scoring; when similarity drops below 0.35, the Trooper shakes side-to-side and Vader holds an arm raised. `/play/eval` runs closed-loop feedback: if the running transcript scores below 6.0 out of 10 on five drama criteria, the script lowers the energy and verbosity dials on both characters in real time.

---

## The Hardware: 16-Servo Antagonistic Rig (v5.1.0)

Sixteen MG90S metal-gear servos (eight per character) are driven by an ESP32 over I2C through a PCA9685 PWM board on a dedicated 5 V/15 A rail, hidden beneath the stage deck.

**Pull-pull system.** Each joint is controlled by two opposing servos — one winds line in while its partner pays out. Active tension is held on both sides at all times, so joints hold position with no gravity dependence, no sag, and no return lag. Tendons are 20 lb braided PE line (zero stretch, zero memory).

**Non-linear kinematics.** Toy joints are not perfect circles; lever-arm distance shifts with rotation. `sendJoint()` corrects for this with a per-joint `CALIBRATION_CURVES` piecewise spline, mapping each commanded angle to independently tuned pull and payout positions.

**Mechanical anchoring.** Tendons route through 1 mm-ID PTFE Bowden tubes anchored to the figures via heated-needle melt channels and 0.5 mm brass wire. Adhesive bonds cannot hold under sustained antagonistic tension.

**The gantry.** A T-shaped 1/8-inch clear acrylic board mounted behind the figures redirects shoulder tendons upward so servos beneath the deck can lift the arms. It disappears under stage lighting.

**Serial frame integrity.** Every command carries an 8-bit XOR checksum: `S<channel>:<angle>*<hex>` (e.g. `S0:90*03`, `S12:135*0E`). The firmware silently drops any frame with a missing `*` or a checksum mismatch.

**Browser memory protection.** `sessionLog` is capped at 50 turns via a rolling eviction window — O(1) flat memory regardless of loop duration. Disk NDJSON logging is unaffected.

**Joint trajectory damping.** Commands with a delta > 20° are decomposed into 1° steps across 15 ms windows, preventing impulse loads on the MG90S gears. Incoming overrides abort running transitions immediately.

---

For the full architectural blueprint, wiring diagrams, servo calibration procedures, firmware documentation, and the development roadmap, see `MASTER_PLAN.md`.
