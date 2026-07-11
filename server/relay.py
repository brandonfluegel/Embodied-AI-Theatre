"""
relay.py
--------
WebSocket relay for the Darth Vader & Imperial Stormtrooper servo pipeline.
Receives tone-dial positions from shape-models.com/play/tone (via Tampermonkey)
and forwards them to an ESP32 over USB serial.

Darth Vader:         ch 0 = head bob | ch 1 = torso twist | ch 2 = arm tendon
Imperial Stormtrooper: ch 3 = head turn | ch 4 = torso lean  | ch 5 = arm tendon

Install once:
    pip install websockets pyserial

Run:
    python relay.py
"""

import asyncio
import json
import os
import serial
import serial.tools.list_ports
import websockets
from datetime import datetime, timezone

# ── Configuration ────────────────────────────────────────────────────────────

# Set this to the COM port your ESP32 is on, e.g. "COM3" or "COM7".
# Leave as None to auto-detect the first available serial port.
SERIAL_PORT: str | None = None

# Set to True to run without the ESP32 plugged in.
# Servo commands will be printed to the terminal instead of sent over serial.
MOCK_MODE: bool = True

# Must match the baud rate defined in the Arduino sketch.
BAUD_RATE: int = 115200

# The WebSocket server will listen on this host and port.
WS_HOST: str = "localhost"
WS_PORT: int = 8765

# Path to the telemetry log file written by append_telemetry().
# Uses newline-delimited JSON so new entries can be appended without
# reading or rewriting the whole file.
# This file is gitignored — see .gitignore.
LOGS_PATH: str = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "performance_logs.json"
)

# ── Serial helpers ────────────────────────────────────────────────────────────

def find_serial_port() -> str:
    """Return the first available serial port, or raise if none found."""
    ports = serial.tools.list_ports.comports()
    if not ports:
        raise RuntimeError(
            "No serial ports detected. "
            "Make sure the ESP32 is plugged in and drivers are installed."
        )
    port_name = ports[0].device
    print(f"[serial] Auto-detected port: {port_name}")
    return port_name


def open_serial(port: str) -> serial.Serial:
    ser = serial.Serial(
        port,
        BAUD_RATE,
        timeout=0,           # non-blocking reads (we never read from the ESP32)
        write_timeout=None,  # blocking write — tiny payload, completes in ~0.1 ms
        xonxoff=False,
        rtscts=False,
        dsrdtr=False,
    )
    print(f"[serial] Opened {port} at {BAUD_RATE} baud.")
    return ser


# ── Telemetry logging ─────────────────────────────────────────────

def append_telemetry(entry: dict) -> None:
    """
    Append one completed-turn record to performance_logs.json.

    The file uses newline-delimited JSON (NDJSON): every line is a valid,
    self-contained JSON object.  This means:
      - New entries can be written with a single open-append-close cycle.
      - Old data is never read into memory or overwritten.
      - The file can be streamed line-by-line into /play/eval for scoring.

    Expected fields coming from the browser script:
        type        "telemetry"
        speaker     "vader" or "trooper"
        text        the full spoken text block
        turn        sequential turn number in this session
        char_count  character length of the text
        speech_rate computed utterance.rate value
        dials       snapshot of all six dial values (0-100)
    """
    entry["timestamp"] = datetime.now(timezone.utc).isoformat()
    try:
        with open(LOGS_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
        print(
            f"[telemetry] Turn {entry.get('turn', '?')} logged — "
            f"speaker: {entry.get('speaker', '?')} — "
            f"chars: {entry.get('char_count', '?')}"
        )
    except OSError as exc:
        print(f"[telemetry] Could not write to {LOGS_PATH}: {exc}")


# ── WebSocket handler ─────────────────────────────────────────────────────────

async def run_sweep_test(
    websocket: websockets.ServerConnection,
    ser: serial.Serial,
) -> None:
    """
    Sweep each servo through a safe range of motion to verify Phase 3 wiring.
    Sequence per channel: 90° → 130° → 90° → 50° → 90° (500 ms between steps).

    Sends {"type": "sweep_complete"} when all six channels have been tested.
    Trigger this from the HUD Calibration panel's \"Sweep All\" button.
    """
    print("[sweep] Servo sweep test started.")
    for ch in range(6):
        for angle in [90, 130, 90, 50, 90]:
            line = f"S{ch}:{angle}\n"
            if ser:
                ser.write(line.encode("ascii"))
                print(f"[sweep]  ch{ch} \u2192 {angle}\u00b0")
            else:
                print(f"[MOCK SWEEP] S{ch}:{angle}")
            await asyncio.sleep(0.5)
    print("[sweep] Sweep test complete.")
    await websocket.send(json.dumps({"type": "sweep_complete"}))


async def send_replay(websocket: websockets.ServerConnection) -> None:
    """
    Read performance_logs.json line-by-line and send all valid entries back to
    the browser as a single JSON message:

        { "type": "replay_data", "entries": [...], "count": N }

    Malformed lines are silently skipped so a partially-written file never
    crashes the relay.  An empty or missing file returns count=0.
    """
    entries: list[dict] = []
    if os.path.exists(LOGS_PATH):
        try:
            with open(LOGS_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass   # skip malformed lines
        except OSError as exc:
            print(f"[replay] Could not read {LOGS_PATH}: {exc}")

    payload = json.dumps({"type": "replay_data", "entries": entries, "count": len(entries)})
    await websocket.send(payload)
    print(f"[replay] Sent {len(entries)} entr{'y' if len(entries) == 1 else 'ies'} to browser.")


async def handle_client(
    websocket: websockets.ServerConnection,
    ser: serial.Serial,
) -> None:
    """
    Accept messages from the Tampermonkey userscript and forward to the ESP32.

    Single command:   {"channel": 0, "angle": 135}
    Batched (all 6):  [{"channel": 0, "angle": 135}, {"channel": 3, "angle": 45}, ...]

    Forwarded to ESP32 as:  S<channel>:<angle>  e.g. S0:135
    """
    print(f"[ws] Connected: {websocket.remote_address}")
    try:
        async for raw in websocket:
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue   # silently drop malformed messages

            # Telemetry payloads arrive as a single dict with "type": "telemetry".
            # Route them straight to the log file and skip servo processing.
            if isinstance(payload, dict) and payload.get("type") == "telemetry":
                append_telemetry(payload)
                continue

            # Replay request: read performance_logs.json and send all entries back to the browser.
            if isinstance(payload, dict) and payload.get("type") == "replay_request":
                await send_replay(websocket)
                continue

            # Eval feedback: browser reports that the session score dropped below threshold
            # and that it has already adjusted the dial values. Log the event.
            if isinstance(payload, dict) and payload.get("type") == "eval_feedback":
                avg  = payload.get("avg_score", 0)
                adj  = payload.get("adjustment", 0)
                print(f"[eval] Feedback: avg_score={avg:.1f}/10 — dial reduction applied: -{adj}")
                continue
            # Sweep test: exercise each servo channel in sequence for Phase 3 wiring
            # verification. The browser sends this from the HUD Calibration panel.
            if isinstance(payload, dict) and payload.get("type") == "sweep_test":
                await run_sweep_test(websocket, ser)
                continue
            commands = payload if isinstance(payload, list) else [payload]

            for cmd in commands:
                try:
                    channel = int(cmd["channel"])
                    angle   = int(cmd["angle"])
                except (KeyError, ValueError, TypeError):
                    continue

                if not (0 <= channel <= 5):
                    continue   # only channels 0-5 are wired

                angle = max(0, min(180, angle))   # clamp instead of dropping

                line = f"S{channel}:{angle}\n"
                if ser:
                    ser.write(line.encode("ascii"))
                    print(f"[serial] {line.strip()}")
                else:
                    print(f"[MOCK STREAM] Received from Browser: {raw} -> Outbound: {line.strip()}")

    except websockets.exceptions.ConnectionClosedOK:
        pass
    except websockets.exceptions.ConnectionClosedError as exc:
        print(f"[ws] Error: {exc}")
    finally:
        print(f"[ws] Disconnected: {websocket.remote_address}")


# ── Entry point ───────────────────────────────────────────────────────────────

async def main() -> None:
    if MOCK_MODE:
        print("[relay] MOCK MODE — no serial hardware required.")
        ser = None
    else:
        port_name = SERIAL_PORT or find_serial_port()
        ser = open_serial(port_name)

    async def handler(ws: websockets.ServerConnection) -> None:
        await handle_client(ws, ser)

    print(f"[ws] Listening on ws://{WS_HOST}:{WS_PORT}  (Ctrl+C to stop)")

    async with websockets.serve(handler, WS_HOST, WS_PORT, compression=None):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[relay] Stopped.")
    except RuntimeError as exc:
        print(f"[relay] Fatal: {exc}")
