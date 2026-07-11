"""
relay.py
--------
Local WebSocket server that receives JSON messages from a webpage
and forwards them over a USB serial connection to an ESP32.

Requirements (install once):
    pip install websockets pyserial

Usage:
    python relay.py

Then open your webpage and connect to:
    ws://localhost:8765
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


def open_serial(port: str, baud: int) -> serial.Serial:
    """Open and return a configured Serial connection."""
    ser = serial.Serial(port, baud, timeout=1)
    print(f"[serial] Opened {port} at {baud} baud.")
    return ser


# ── WebSocket handler ─────────────────────────────────────────────────────────

async def handle_client(
    websocket: websockets.ServerConnection,
    ser: serial.Serial,
) -> None:
    """
    Handle a single WebSocket client.

    Expected message format (JSON):
        { "channel": 0, "angle": 90 }

    Multiple commands can be batched in a JSON array:
        [ { "channel": 0, "angle": 45 }, { "channel": 1, "angle": 120 } ]

    The relay converts each command to a compact CSV line and writes it
    to the serial port:
        C<channel>,<angle>\n
    """
    client_addr = websocket.remote_address
    print(f"[ws] Client connected: {client_addr}")

    try:
        async for raw in websocket:
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                print(f"[ws] Ignored non-JSON message: {raw!r}")
                await websocket.send(json.dumps({"error": "invalid JSON"}))
                continue

            # Normalise to a list so batched and single commands share one path.
            commands = payload if isinstance(payload, list) else [payload]

            for cmd in commands:
                channel = cmd.get("channel")
                angle   = cmd.get("angle")

                # Basic validation before touching the hardware.
                if channel is None or angle is None:
                    print(f"[ws] Missing fields in command: {cmd}")
                    await websocket.send(
                        json.dumps({"error": "missing 'channel' or 'angle'", "cmd": cmd})
                    )
                    continue

                try:
                    channel = int(channel)
                    angle   = int(angle)
                except (ValueError, TypeError):
                    print(f"[ws] Non-integer values in command: {cmd}")
                    await websocket.send(
                        json.dumps({"error": "channel and angle must be integers", "cmd": cmd})
                    )
                    continue

                if not (0 <= channel <= 15):
                    await websocket.send(
                        json.dumps({"error": "channel must be 0-15", "cmd": cmd})
                    )
                    continue

                if not (0 <= angle <= 180):
                    await websocket.send(
                        json.dumps({"error": "angle must be 0-180", "cmd": cmd})
                    )
                    continue

                # Build the serial command and send it.
                line = f"C{channel},{angle}\n"
                ser.write(line.encode("ascii"))
                print(f"[serial] Sent: {line.strip()}")

            await websocket.send(json.dumps({"status": "ok"}))

    except websockets.exceptions.ConnectionClosedOK:
        pass
    except websockets.exceptions.ConnectionClosedError as exc:
        print(f"[ws] Connection closed with error: {exc}")
    finally:
        print(f"[ws] Client disconnected: {client_addr}")


# ── Entry point ───────────────────────────────────────────────────────────────

async def main() -> None:
    port_name = SERIAL_PORT or find_serial_port()
    ser = open_serial(port_name, BAUD_RATE)

    # Wrap the handler so the serial object is captured in the closure.
    async def handler(ws: websockets.ServerConnection) -> None:
        await handle_client(ws, ser)

    print(f"[ws] Server starting on ws://{WS_HOST}:{WS_PORT}")
    print("[ws] Waiting for browser connections... (Ctrl+C to stop)")

    async with websockets.serve(handler, WS_HOST, WS_PORT):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[relay] Stopped by user.")
    except RuntimeError as exc:
        print(f"[relay] Fatal error: {exc}")
