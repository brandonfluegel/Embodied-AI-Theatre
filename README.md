# Embodied AI Theatre: Darth Vader vs. Stormtrooper

**A project by Brandon Fluegel, human factors researcher.**

This is an autonomous, physical-digital AI theatre that allows Darth Vader and an Imperial Stormtrooper (1/12-scale Hasbro action figures) to hold unscripted spoken debates without human input. Each character has a synthesized voice, a distinct AI persona, and a physical body that moves in coordination with its speech. The loop runs indefinitely: one character speaks, the other listens and then responds, with both exhibiting dynamic, non-verbal bahavior.

---

## The Digital Brain: The shape-models.com Matrix

The show is controlled from a single browser tab. A Tampermonkey userscript (`vader_trooper.user.js`) is injected into the shape-models.com `/play/tone` page, where it builds a hidden iframe matrix that orchestrates six playgrounds simultaneously. Because the tone playground sends only one user message per generation, the userscript owns the conversation state: every request includes the persistent scene premise and up to 20 labelled dialogue turns. Generation is bound to the intended speaker and completes on the site's `Done` state, allowing at least ten turns per character before the rolling context window begins advancing.

The `/play/tone` tab is the master surface. Six tone dials (Warmth, Verbosity, Energy, Directness, Concreteness, Structure) shape the AI text output, the voice synthesis parameters, and the speed of every servo movement at the same time. A floating HUD panel on the right side of the page provides unified control without switching tabs.

The background playgrounds each handle a specific job. `/play/persona` receives the active speaker's name and, when the script detects aggressive dialogue sentiment, an emotional intensity modifier injected directly into the backstory textarea before each generation. `/play/choreographer` controls head-bob speed and the pause between speaking turns. `/play/refusal` monitors for AI safety boundaries; when one triggers, both figures freeze into a defined defensive posture (Vader bows his head, the Trooper snaps to attention). `/play/diff` watches for divergent prompt outputs using Jaccard word-overlap scoring; when similarity drops below 0.35, the Trooper shakes side-to-side and Vader holds an arm raised. `/play/eval` runs closed-loop feedback: if the running transcript scores below 6.0 out of 10 on five drama criteria, the script lowers the energy and verbosity dials on both characters in real time.

---

## The Hardware: 16-Motor Movement System (v5.3.0)

Each figure is moved by eight small metal-gear motors, for a total of 16. An ESP32 controller tells the motors when and how far to move. The controller, motor board, and 5 V power supply are hidden under the stage.

**How the figures move.** Every moving joint has two motors pulling in opposite directions, much like a pair of muscles. One pulls while the other lets out line. This gives the head, body, shoulder, and elbow controlled movement in both directions and helps each pose stay in place.

**Hidden control lines.** Strong fishing line connects the motors to the figures. The line runs through thin, low-friction tubes attached to the back of each figure. These tubes guide the line and keep it from catching as the characters move.

**Raising the arms.** A clear T-shaped support stands behind the figures and guides the shoulder lines from above. This allows motors below the stage to lift the arms naturally. The clear support is designed to disappear under stage lighting.

**Smooth and reliable movement.** Large movements are divided into many small steps to reduce sudden strain on the gears. The controller also checks each incoming instruction and ignores damaged or incomplete commands rather than moving a motor unexpectedly.

**Protection during long conversations.** The system avoids sending the same motor instruction repeatedly, briefly relaxes motors that have been holding still, and starts the motors in pairs instead of powering all 16 at once. These safeguards reduce heat, electrical surges, and unnecessary wear during extended performances.

**Calibration and safety.** The software starts with a limited range of motion for every motor. Each joint must be tested and adjusted on the finished figure before a wider range is allowed. This prevents the motors from pulling too hard on the figure or its control lines.

---

For the full architectural blueprint, wiring diagrams, servo calibration procedures, firmware documentation, and the development roadmap, see `MASTER_PLAN.md`.
