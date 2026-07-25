# Embodied AI Theatre: Darth Vader vs. Stormtrooper

**A project by Brandon Fluegel, human factors researcher.**

This is an autonomous, physical-digital AI theatre that allows Darth Vader and an Imperial Stormtrooper (1/12-scale Hasbro action figures) to hold unscripted spoken debates without human input. Each character has a synthesized voice, a distinct AI persona, and a physical body that moves in coordination with its speech. The loop runs indefinitely: one character speaks, the other listens and then responds, with both exhibiting dynamic, non-verbal bahavior.

---

## The Digital Brain: The shape-models.com Matrix

The show is controlled from a single browser tab. A Tampermonkey userscript (`vader_trooper.user.js`) is injected into the shape-models.com `/play/tone` page, where it builds a hidden iframe matrix that orchestrates six playgrounds simultaneously. Because the tone playground sends only one user message per generation, the userscript owns the conversation state: every request includes the persistent scene premise and up to 20 labelled dialogue turns. Generation is bound to the intended speaker and completes on the site's `Done` state, allowing at least ten turns per character before the rolling context window begins advancing.

Speech is relay-backed: the userscript sends completed lines to `relay.py`, which uses ElevenLabs and host audio playback. Set `ELEVENLABS_API_KEY` in `.env`, ensure the host has network access and a working audio device, then start the relay. The relay defaults to hardware mode; set `ROBOT_MOCK_MODE=true` only for software-only testing without the ESP32.

The `/play/tone` tab is the master surface. Six tone dials (Warmth, Verbosity, Energy, Directness, Concreteness, Structure) shape the AI text output, the voice synthesis parameters, and the speed of every servo movement at the same time. A floating HUD panel on the right side of the page provides unified control without switching tabs.

The background playgrounds each handle a specific job. `/play/persona` receives the active speaker's name and, when the script detects aggressive dialogue sentiment, an emotional intensity modifier injected directly into the backstory textarea before each generation. `/play/choreographer` controls head-bob speed and the pause between speaking turns. `/play/refusal` monitors for AI safety boundaries; when one triggers, both figures freeze into a defined defensive posture (Vader bows his head, the Trooper snaps to attention). `/play/diff` watches for divergent prompt outputs using Jaccard word-overlap scoring; when similarity drops below 0.35, the Trooper shakes side-to-side and Vader holds an arm raised. `/play/eval` runs closed-loop feedback: if the running transcript scores below 6.0 out of 10 on five drama criteria, the script lowers the energy and verbosity dials on both characters in real time.

---

## The Hardware: 16-Motor Movement System (v5.4.0)

Each figure is moved by eight small metal-gear motors, for a total of 16. The display stage is the lid of a 13 x 10 x 6.5 inch pine box. An 8 x 10 x 1/4 inch MDF tray inside the box holds the motors, ESP32, PCA9685 motor board, terminal block, and secured wiring so the complete mechanism can be removed for service.

The 5 V / 15 A adapter remains external; only low-voltage DC enters the box. Red/black 14 AWG wire carries the high-current 5 V rail to the PCA9685, while female-to-female Dupont jumpers carry only the ESP32-to-PCA9685 logic and I2C signals. The removable tray has a secured service loop so the lid can open and the tray can lift out without stressing connectors or crossing moving tendons.

Before sustained motor operation, add a DC-rated inline fuse and holder at the positive supply entry, a low-ESR bulk capacitor at the servo rail, and a rated distribution block if the exact PCA9685 board cannot safely carry the measured load through its terminal and PCB traces. These protection parts are required additions; the 14 AWG wire alone does not rate the controller board for 15 A.

**How the figures move.** Every moving joint has two motors pulling in opposite directions, much like a pair of muscles. One pulls while the other lets out line. This gives the head, body, shoulder, and elbow controlled movement in both directions and helps each pose stay in place.

**Hidden control lines.** Strong fishing line connects the motors to the figures. The line runs through thin, low-friction tubes attached to the back of each figure. These tubes guide the line and keep it from catching as the characters move.

**Raising the arms.** A clear T-shaped support is mounted at the rear of the lid-stage and guides the shoulder lines from above. This allows motors in the removable tray to lift the arms naturally. The clear support is designed to disappear under stage lighting.

**Smooth and reliable movement.** Large movements are divided into many small steps to reduce sudden strain on the gears. The controller also checks each incoming instruction and ignores damaged or incomplete commands rather than moving a motor unexpectedly.

**Protection during long conversations.** The system avoids sending the same motor instruction repeatedly, briefly relaxes motors that have been holding still, and starts the motors in pairs instead of powering all 16 at once. These safeguards reduce heat, electrical surges, and unnecessary wear during extended performances.

**Calibration and safety.** The software starts with a limited commissioning range around neutral for wiring checks. Test one labeled channel at a time, record a minimum and maximum for all 16 channels, then use the measured-range validator before tuning each opposing tendon pair. Firmware acknowledgements confirm frame handling and PWM-update state, not physical movement; visually verify direction, clearance, and tension for every channel.

---

For the full architectural blueprint, wiring diagrams, servo calibration procedures, firmware documentation, and the development roadmap, see `MASTER_PLAN.md`.
