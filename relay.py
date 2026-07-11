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
import serial
import serial.tools.list_ports
import websockets

# ── Configuration ────────────────────────────────────────────────────────────

# Set this to the COM port your ESP32 is on, e.g. "COM3" or "COM7".
# Leave as None to auto-detect the first available serial port.
SERIAL_PORT: str | None = None

# Must match the baud rate defined in the Arduino sketch.
BAUD_RATE: int = 115200

# The WebSocket server will listen on this host and port.
WS_HOST: str = "localhost"
WS_PORT: int = 8765

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
                ser.write(line.encode("ascii"))
                print(f"[serial] {line.strip()}")

    except websockets.exceptions.ConnectionClosedOK:
        pass
    except websockets.exceptions.ConnectionClosedError as exc:
        print(f"[ws] Error: {exc}")
    finally:
        print(f"[ws] Disconnected: {websocket.remote_address}")


# ── Entry point ───────────────────────────────────────────────────────────────

async def main() -> None:
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
