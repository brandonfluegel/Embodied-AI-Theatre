"""
relay.py
--------
WebSocket relay for the Wall-E & EVE servo pipeline.
Receives tone-dial positions from shape-models.com/play/tone (via Tampermonkey)
and forwards them to an ESP32 over USB serial.

Wall-E: ch 0 = head bob | ch 1 = waist twist | ch 2 = arm
EVE:    ch 3 = head tilt | ch 4 = body lean  | ch 5 = arm

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
        speaker     "walle" or "eve"
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
