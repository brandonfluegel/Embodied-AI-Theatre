# Embodied AI Theatre: Darth Vader vs. Stormtrooper (v5.0.0)

**A project by Brandon Fluegel, human factors researcher.**

The central question driving this build is a human factors one: does giving an AI a physical body change how people experience it? A screen-based AI is perceived as a tool. An AI that occupies shared physical space, nods when it makes a point, raises an arm for emphasis, and physically recoils from a rebuke reads differently to observers. This project is a working prototype to study that difference.

---

## The Vision

This is not a chatbot. This is an autonomous, physical-digital AI theatre that runs on a desktop. Two characters, Darth Vader and an Imperial Stormtrooper (1/12-scale Hasbro Black Series figures), hold unscripted spoken debates without any human input once the show starts. Each character has a synthesized voice, a distinct AI persona, and a physical body that moves in coordination with its speech. The loop runs indefinitely: one character speaks, the other listens and then responds, with the physical performance driving the full experience.

---

## The Digital Brain: The shape-models.com Matrix

The show is controlled from a single browser tab. A Tampermonkey userscript (`vader_trooper.user.js`) is injected into the shape-models.com `/play/tone` page, where it builds a hidden iframe matrix that orchestrates six playgrounds simultaneously.

The `/play/tone` tab is the master surface. Six tone dials (Warmth, Verbosity, Energy, Directness, Concreteness, Structure) shape the AI text output, the voice synthesis parameters, and the speed of every servo movement at the same time. A floating HUD panel on the right side of the page provides unified control without switching tabs.

The background playgrounds each handle a specific job. `/play/persona` receives the active speaker's name and, when the script detects aggressive dialogue sentiment, an emotional intensity modifier injected directly into the backstory textarea before each generation. `/play/choreographer` controls head-bob speed and the pause between speaking turns. `/play/refusal` monitors for AI safety boundaries; when one triggers, both figures freeze into a defined defensive posture (Vader bows his head, the Trooper snaps to attention). `/play/diff` watches for divergent prompt outputs using Jaccard word-overlap scoring; when similarity drops below 0.35, the Trooper shakes side-to-side and Vader holds an arm raised. `/play/eval` runs closed-loop feedback: if the running transcript scores below 6.0 out of 10 on five drama criteria, the script lowers the energy and verbosity dials on both characters in real time.

---

## The Cloud API Mandate

The illusion of life depends on near-zero latency between speaking turns. The show must run on **Groq Llama 3.3 70B** via the cloud API, which delivers 250-plus tokens per second. The shape-models.com "Free (in browser)" option is not supported and must not be used.

The reason is architectural. Local WebGPU inference runs on the JavaScript main thread. JavaScript is single-threaded, so while the browser processes token predictions, the 50 ms servo animation intervals that keep head movement and arm gestures synchronized with speech cannot fire. The practical result is stuttering, dropped animation frames, and dead-air pauses between characters that break the illusion entirely. Groq offloads all inference to a cloud endpoint, leaving the main thread entirely free for physical animation.

Before starting the loop, select Groq Llama 3.3 70B from the model dropdown. A guardrail built into the Start Loop button detects a local model and prompts the operator before the loop is allowed to proceed.

---

## The Hardware: 16-Servo Antagonistic Rig (v5.0.0)

The physical movement system is hidden beneath the stage deck. Sixteen MG90S metal-gear servos (eight per character) are controlled by an ESP32 microcontroller over I2C through a PCA9685 16-channel PWM board, powered by a dedicated 5V/15A supply. Four aspects of the engineering are worth understanding before building or calibrating the rig.

**The pull-pull system.** Every degree of freedom on each figure is controlled by a matched pair of servos working in opposition. One servo winds line to pull the joint in one direction while its partner winds the opposing line to pull it back. Because active tension is maintained on both sides at all times, each joint holds its position precisely without any dependence on gravity. There is no sag, no bounce, and no lag on the return stroke. Tendons are 20 lb braided PE fishing line, chosen specifically for zero stretch and zero memory under sustained load.

**Non-linear kinematics.** Plastic toy joints are not geometrically perfect circles. As a joint rotates, the effective lever-arm distance changes, which means a simple "servo A to angle X, servo B to 180 minus X" mapping produces binding at the extremes of travel. The userscript corrects for this using a per-joint `CALIBRATION_CURVES` piecewise spline inside `sendJoint()`. Each curve maps a commanded target angle to the specific, independently tuned positions for the pull servo and the payout servo on that joint, calibrated to the actual measured physical geometry.

**Mechanical anchoring.** Tendons run inside 1 mm-ID PTFE (Teflon) Bowden tubes for low-friction routing along the figures' backs. These tubes are not glued. Each tube is anchored by melting small channels through the figures' PVC plastic with a heated needle and then threading 0.5 mm brass wire or micro zip-ties through those channels to lock the tube in place. Adhesive bonds cannot hold under the sustained antagonistic tension loads this rig generates.

**The gantry.** Pulling a figure's arm upward from below the stage deck is geometrically impossible without a high-angle redirection point. A 1/8-inch clear cast acrylic board, cut into a T-shape and mounted behind the figures, provides that point. Because it is optically transparent, it disappears under stage lighting and leaves the figures appearing to move independently.

---

For the full architectural blueprint, wiring diagrams, servo calibration procedures, firmware documentation, and the development roadmap, see `MASTER_PLAN.md`.
