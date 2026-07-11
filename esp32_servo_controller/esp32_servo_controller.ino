/*
  esp32_servo_controller.ino
  --------------------------
  Listens for servo commands on USB Serial (115200 baud) and drives
  up to 16 servos through an Adafruit PCA9685 PWM/Servo driver.

  Expected serial command format (one per line):
      C<channel>,<angle>
  Examples:
      C0,90      → move servo on channel 0 to 90°
      C3,45      → move servo on channel 3 to 45°

  Required libraries (install via Arduino Library Manager):
      • Adafruit PWM Servo Driver Library
      • Adafruit BusIO  (dependency, usually installed automatically)

  Wiring:
      PCA9685 VCC  → 3.3 V (logic) / 5 V (servo power rail via V+)
      PCA9685 GND  → GND
      PCA9685 SDA  → GPIO 21  (ESP32 default I²C SDA)
      PCA9685 SCL  → GPIO 22  (ESP32 default I²C SCL)

  ──────────────────────────────────────────────────────────────────
*/

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// ── PCA9685 instance (default I²C address 0x40) ──────────────────
Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver(0x40);

// ── Servo pulse calibration ───────────────────────────────────────
// These values work for most 9g / standard hobby servos.
// Adjust SERVO_MIN / SERVO_MAX if your servos don't reach full travel.
//   At 50 Hz:  1 count = 20 ms / 4096 ≈ 4.88 µs
//   SERVO_MIN ≈ 150 counts → ~0.73 ms  ≈ 0°
//   SERVO_MAX ≈ 600 counts → ~2.93 ms  ≈ 180°
static const uint16_t SERVO_MIN   = 150;   // pulse count for   0°
static const uint16_t SERVO_MAX   = 600;   // pulse count for 180°
static const uint8_t  PWM_FREQ_HZ = 50;    // standard servo frequency

// ── Serial input buffer ───────────────────────────────────────────
static const uint8_t  BUF_SIZE    = 32;
static char           inputBuf[BUF_SIZE];
static uint8_t        bufIndex    = 0;

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Map an angle (0–180°) to a 12-bit PCA9685 pulse count.
 */
uint16_t angleToPulse(int angle) {
    angle = constrain(angle, 0, 180);
    return map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
}

/**
 * Move a single servo to the requested angle and print confirmation.
 */
void moveServo(uint8_t channel, int angle) {
    if (channel > 15) {
        Serial.println("ERR channel out of range (0-15)");
        return;
    }
    uint16_t pulse = angleToPulse(angle);
    pca.setPWM(channel, 0, pulse);
    Serial.print("OK C");
    Serial.print(channel);
    Serial.print(",");
    Serial.println(angle);
}

/**
 * Parse and execute one complete line, e.g. "C3,120".
 * Ignores blank lines and unknown commands silently.
 */
void processLine(const char* line) {
    // Skip empty lines
    if (line[0] == '\0') return;

    if (line[0] == 'C' || line[0] == 'c') {
        // Expect: C<channel>,<angle>
        int channel = -1;
        int angle   = -1;
        if (sscanf(line + 1, "%d,%d", &channel, &angle) == 2) {
            moveServo((uint8_t)channel, angle);
        } else {
            Serial.print("ERR bad format: ");
            Serial.println(line);
        }
    } else {
        Serial.print("ERR unknown command: ");
        Serial.println(line);
    }
}

// ── Arduino lifecycle ─────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    while (!Serial) { /* wait for USB Serial on some ESP32 variants */ }

    Serial.println("[esp32] PCA9685 servo controller starting...");

    pca.begin();
    pca.setOscillatorFrequency(27000000);   // trim for accuracy (27 MHz)
    pca.setPWMFreq(PWM_FREQ_HZ);

    // Give the PCA9685 a moment to stabilise
    delay(10);

    Serial.println("[esp32] Ready. Send commands like: C0,90");
}

void loop() {
    // Non-blocking character-by-character serial read
    while (Serial.available() > 0) {
        char c = (char)Serial.read();

        if (c == '\n' || c == '\r') {
            // End of line – null-terminate and process
            inputBuf[bufIndex] = '\0';
            processLine(inputBuf);
            bufIndex = 0;
        } else {
            // Append character; guard against buffer overflow
            if (bufIndex < BUF_SIZE - 1) {
                inputBuf[bufIndex++] = c;
            } else {
                // Buffer full without a newline – discard and reset
                Serial.println("ERR input buffer overflow, discarding line");
                bufIndex = 0;
            }
        }
    }
}
