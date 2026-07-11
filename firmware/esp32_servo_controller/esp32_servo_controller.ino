/*
  esp32_servo_controller.ino
  --------------------------
  Receives servo commands over USB Serial and drives 6 MG90S servos
  through an Adafruit PCA9685 board.

  Darth Vader:           ch 0 = head bob  | ch 1 = torso twist | ch 2 = arm tendon
  Imperial Stormtrooper: ch 3 = head turn | ch 4 = torso lean  | ch 5 = arm tendon

  Command format (one per line):  S<channel>:<angle>
  Examples:  S0:90   S3:45   S5:135

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
static const uint8_t  NUM_SERVOS             = 6;
static const int      HOME_ANGLE[NUM_SERVOS] = {90, 90, 90, 90, 90, 90};

// Per-servo soft angle limits — tune these during Phase 4 calibration to match
// the physical stop points of each figure and prevent tendon over-pull.
// Edit SOFT_MIN / SOFT_MAX, then use the HUD Calibration panel to verify.
//   ch0 = Vader head   ch1 = Vader torso    ch2 = Vader arm tendon
//   ch3 = Trpr head    ch4 = Trpr torso     ch5 = Trpr arm tendon
static const int SOFT_MIN_ANGLE[NUM_SERVOS] = { 70,  45,  60,  60,  60,  60};
static const int SOFT_MAX_ANGLE[NUM_SERVOS] = {110, 135, 150, 120, 120, 150};

static const uint8_t  BUF_SIZE    = 16;
static char           inputBuf[BUF_SIZE];
static uint8_t        bufIndex    = 0;

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Map an angle (0–180°) to a 12-bit PCA9685 pulse count.
 */
uint16_t angleToPulse(int angle) {
    angle = constrain(angle, 0, 180);
    return (uint16_t)map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
}

void moveServo(uint8_t ch, int angle) {
    // Clamp to per-servo soft limits before converting to pulse count.
    // Adjust SOFT_MIN_ANGLE / SOFT_MAX_ANGLE during Phase 4 calibration.
    angle = constrain(angle, SOFT_MIN_ANGLE[ch], SOFT_MAX_ANGLE[ch]);
    pca.setPWM(ch, 0, angleToPulse(angle));
}

void processLine(const char* line) {
    if (line[0] != 'S' && line[0] != 's') return;

    int ch    = -1;
    int angle = -1;
    if (sscanf(line + 1, "%d:%d", &ch, &angle) != 2) return;
    if (ch < 0 || ch >= NUM_SERVOS)                   return;

    int raw     = constrain(angle, 0, 180);
    int applied = constrain(raw, SOFT_MIN_ANGLE[ch], SOFT_MAX_ANGLE[ch]);
    moveServo((uint8_t)ch, raw);
    // Echo the effective (soft-clamped) angle back over serial.
    // relay.py logs these as [ESP32] ACK:S<ch>:<angle> to confirm live wiring.
    Serial.print("ACK:S");
    Serial.print(ch);
    Serial.print(":");
    Serial.println(applied);
}

// ── Arduino lifecycle ─────────────────────────────────────────────

void setup() {
    Serial.begin(115200);

    pca.begin();
    pca.setOscillatorFrequency(27000000);
    pca.setPWMFreq(PWM_FREQ_HZ);
    delay(10);

    // Move all servos to the home position (90 degrees)
    for (uint8_t i = 0; i < NUM_SERVOS; i++) {
        moveServo(i, HOME_ANGLE[i]);
    }

    Serial.println("READY");
}

void loop() {
    while (Serial.available() > 0) {
        char c = (char)Serial.read();

        if (c == '\n' || c == '\r') {
            inputBuf[bufIndex] = '\0';
            processLine(inputBuf);
            bufIndex = 0;
        } else if (bufIndex < BUF_SIZE - 1) {
            inputBuf[bufIndex++] = c;
        } else {
            bufIndex = 0;   // overflow — reset silently
        }
    }
}
