# Embodied AI Theatre: Darth Vader vs. Stormtrooper

**A project by Brandon Fluegel, human factors researcher.**

This is an autonomous, physical-digital AI theatre that allows Darth Vader and an Imperial Stormtrooper (1/12-scale Hasbro action figures) to hold unscripted spoken debates without human input. Each character has a synthesized voice, a distinct AI persona, and a physical body that moves in coordination with its speech. The loop runs indefinitely: one character speaks, the other listens and then responds, with both exhibiting dynamic, non-verbal bahavior.

---

## The Digital Brain: The shape-models.com Matrix

The show is controlled from a single browser tab. A Tampermonkey userscript (`vader_trooper.user.js`) is injected into the shape-models.com `/play/tone` page, where it builds a hidden iframe matrix that orchestrates six playgrounds simultaneously.

The `/play/tone` tab is the master surface. Six tone dials (Warmth, Verbosity, Energy, Directness, Concreteness, Structure) shape the AI text output, the voice synthesis parameters, and the speed of every servo movement at the same time. A floating HUD panel on the right side of the page provides unified control without switching tabs.

The background playgrounds each handle a specific job. `/play/persona` receives the active speaker's name and, when the script detects aggressive dialogue sentiment, an emotional intensity modifier injected directly into the backstory textarea before each generation. `/play/choreographer` controls head-bob speed and the pause between speaking turns. `/play/refusal` monitors for AI safety boundaries; when one triggers, both figures freeze into a defined defensive posture (Vader bows his head, the Trooper snaps to attention). `/play/diff` watches for divergent prompt outputs using Jaccard word-overlap scoring; when similarity drops below 0.35, the Trooper shakes side-to-side and Vader holds an arm raised. `/play/eval` runs closed-loop feedback: if the running transcript scores below 6.0 out of 10 on five drama criteria, the script lowers the energy and verbosity dials on both characters in real time.

---

## The Hardware: 16-Servo Antagonistic Rig (v5.1.0)

Eight MG90S metal-gear servos per figure (16 total) are driven by an ESP32 via a PCA9685 PWM board over I2C, powered by a 5 V/15 A rail hidden under the stage.

**Pull-pull joints.** Each joint uses two opposing servos — one pulls while the other pays out — so joints hold position under load with no sag or return lag. Tendons are 20 lb braided PE fishing line routed through 1 mm PTFE Bowden tubes, anchored to the figures with heated brass wire (adhesive doesn't hold under continuous tension).

**Non-linear correction.** Toy joints aren't perfect arcs, so `sendJoint()` uses a per-joint `CALIBRATION_CURVES` spline to map commanded angles to the correct pull/payout positions.

**Gantry.** A T-shaped 1/8" acrylic panel behind the figures redirects shoulder tendons so under-deck servos can raise the arms. It disappears under stage lighting.

**Serial integrity.** Commands use the format `S<ch>:<angle>*<hex>` with an 8-bit XOR checksum (e.g. `S0:90*03`). The firmware drops any malformed or mismatched frame silently.

**Trajectory damping.** Moves larger than 20° are broken into 1° steps over 15 ms intervals to protect the gears. Incoming commands cancel any in-progress transition immediately.

---

For the full architectural blueprint, wiring diagrams, servo calibration procedures, firmware documentation, and the development roadmap, see `MASTER_PLAN.md`.
