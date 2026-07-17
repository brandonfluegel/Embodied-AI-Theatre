/*
    esp32_servo_controller.ino  —  v5.3.0
  --------------------------
  Receives servo commands over USB Serial and drives 16 MG90S servos
  through an Adafruit PCA9685 board in a full antagonistic (pull-pull) layout.

  Darth Vader   (ch 0-7):  head nod (0 down / 1 back), torso twist (2 left / 3 right),
                           shoulder (4 up-fwd / 5 down-back), elbow (6 curl / 7 extend)
  Stormtrooper  (ch 8-15): head nod (8 down / 9 back), torso twist (10 left / 11 right),
                           shoulder (12 up-fwd / 13 down-back), elbow (14 curl / 15 extend)

  Each joint is a matched servo pair: one channel winds line in while its
  antagonist pays line out, giving jitter-free positioning with no gravity return.

  Command format (one per line):  S<channel>:<angle>*<hex checksum>
  Examples:  S0:90*03   S8:90*0B   S12:135*0E
  Frames without '*' or with a checksum mismatch are silently discarded.

    v5.3.0 continuous-operation safeguards:
            - Repeated identical commands do not refresh the 1500 ms thermal timer.
            - Released servos re-energise when the next valid command arrives.
            - Antagonistic pairs home in staggered groups to reduce startup inrush.
            - I2C runs at 400 kHz and malformed/partial serial frames are discarded.

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
#include <ctype.h>

// ── PCA9685 instance (default I²C address 0x40) ──────────────────
Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver(0x40);

// ── Servo pulse calibration ───────────────────────────────────────
// These values work for most 9g / standard hobby servos. The per-channel soft
// limits below are the required physical protection boundary for this rig.
// Adjust SERVO_MIN / SERVO_MAX if your servos don't reach full travel.
//   At 50 Hz:  1 count = 20 ms / 4096 ≈ 4.88 µs
//   SERVO_MIN ≈ 150 counts → ~0.73 ms  ≈ 0°
//   SERVO_MAX ≈ 600 counts → ~2.93 ms  ≈ 180°
static const uint16_t SERVO_MIN   = 150;   // pulse count for   0°
static const uint16_t SERVO_MAX   = 600;   // pulse count for 180°
static const uint8_t  PWM_FREQ_HZ = 50;    // standard servo frequency
static const uint32_t I2C_CLOCK_HZ = 400000;

// ── Serial input buffer ───────────────────────────────────────────
static const uint8_t  NUM_SERVOS             = 16;
static const int      HOME_ANGLE[NUM_SERVOS] = {90, 90, 90, 90, 90, 90, 90, 90,
                                                90, 90, 90, 90, 90, 90, 90, 90};

// Per-servo soft angle limits — tune these during Phase 4 calibration to match
// the physical stop points of each figure and prevent antagonistic over-pull.
// Every channel is now a tendon winder in a pull-pull pair; keep the window
// conservative until each joint's travel is measured by hand.
// Edit SOFT_MIN / SOFT_MAX, then use the HUD Calibration panel to verify.
//   Vader   ch0-7:  headNod(0/1)  torsoTwist(2/3)  shoulder(4/5)  elbow(6/7)
//   Trooper ch8-15: headNod(8/9)  torsoTwist(10/11) shoulder(12/13) elbow(14/15)
static const int SOFT_MIN_ANGLE[NUM_SERVOS] = {45, 45, 45, 45, 45, 45, 45, 45,
                                               45, 45, 45, 45, 45, 45, 45, 45};
static const int SOFT_MAX_ANGLE[NUM_SERVOS] = {135, 135, 135, 135, 135, 135, 135, 135,
                                               135, 135, 135, 135, 135, 135, 135, 135};

static const uint8_t  BUF_SIZE    = 24;
static const uint32_t RX_FRAME_TIMEOUT_MS = 100;
static char           inputBuf[BUF_SIZE];
static uint8_t        bufIndex    = 0;
static uint32_t       lastRxByteTime = 0;
static bool           discardUntilNewline = false;

// ── Thermal protection (PWM-release timeout) ──────────────────────
// Tracks the millis() timestamp of the last movement on each channel.
// If a channel holds a static position for longer than STALL_TIMEOUT_MS,
// the PWM output is cut to zero so the motor stops drawing stall current.
// The antagonistic tendon friction holds the physical pose; no active torque
// is needed. The release is cleared automatically on the next move command.
static const uint32_t STALL_TIMEOUT_MS        = 1500;
static       uint32_t lastMoveTime[NUM_SERVOS];   // zero-initialised; updated by moveServo()
static       bool     servoReleased[NUM_SERVOS];  // true after PWM cut; cleared on next move
static       int16_t  lastAppliedAngle[NUM_SERVOS];

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Map an angle (0–180°) to a 12-bit PCA9685 pulse count.
 */
uint16_t angleToPulse(int angle) {
    angle = constrain(angle, 0, 180);
    return (uint16_t)map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
}

bool moveServo(uint8_t ch, int angle) {
    // Repeated rest commands must not keep resetting the thermal timer. If PWM
    // has already been released, the same command intentionally re-energises it.
    if (!servoReleased[ch] && lastAppliedAngle[ch] == angle) return false;

    pca.setPWM(ch, 0, angleToPulse(angle));
    lastAppliedAngle[ch] = angle;
    lastMoveTime[ch] = millis();
    servoReleased[ch] = false;
    return true;
}

void processLine(const char* line) {
    if (line[0] != 'S' && line[0] != 's') return;

    // Locate the checksum delimiter.  Frames without '*' are silently discarded.
    const char* star = strchr(line + 1, '*');
    if (
        !star ||
        !isxdigit((unsigned char)star[1]) ||
        !isxdigit((unsigned char)star[2]) ||
        star[3] != '\0'
    ) return;

    // Compute the running XOR checksum over the payload (chars after 'S', before '*').
    uint8_t computed = 0;
    for (const char* p = line + 1; p < star; p++) {
        computed ^= (uint8_t)(*p);
    }

    // Parse the two-hex-digit received checksum and compare.
    char hexBuf[3] = { star[1], star[2], '\0' };
    uint8_t received = (uint8_t)strtoul(hexBuf, NULL, 16);

    if (computed != received) return;   // checksum mismatch — discard silently

    int ch    = -1;
    int angle = -1;
    int consumed = 0;
    if (sscanf(line + 1, "%d:%d%n", &ch, &angle, &consumed) != 2) return;
    if (line + 1 + consumed != star) return;
    if (ch < 0 || ch >= NUM_SERVOS) return;

    int raw     = constrain(angle, 0, 180);
    int applied = constrain(raw, SOFT_MIN_ANGLE[ch], SOFT_MAX_ANGLE[ch]);
    moveServo((uint8_t)ch, applied);
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
    Wire.setClock(I2C_CLOCK_HZ);
    pca.setOscillatorFrequency(27000000);
    pca.setPWMFreq(PWM_FREQ_HZ);
    delay(10);

    for (uint8_t ch = 0; ch < NUM_SERVOS; ch++) {
        lastAppliedAngle[ch] = -1;
        servoReleased[ch] = true;
    }

    // Energise one antagonistic pair at a time. Both sides of a joint engage
    // together, while the stagger avoids the inrush of starting all 16 servos.
    for (uint8_t first = 0; first < NUM_SERVOS; first += 2) {
        moveServo(first, HOME_ANGLE[first]);
        moveServo(first + 1, HOME_ANGLE[first + 1]);
        delay(80);
    }

    Serial.println("READY");
}

void serviceThermalProtection(uint32_t now) {
    for (uint8_t ch = 0; ch < NUM_SERVOS; ch++) {
        if (!servoReleased[ch] && (now - lastMoveTime[ch]) >= STALL_TIMEOUT_MS) {
            pca.setPWM(ch, 0, 0);
            servoReleased[ch] = true;
        }
    }
}

void serviceSerial(uint32_t now) {
    // Drop incomplete or overflowed frames rather than joining stale bytes to a
    // later command. A valid newline always restores normal parsing.
    if (
        (bufIndex > 0 || discardUntilNewline) &&
        (now - lastRxByteTime) >= RX_FRAME_TIMEOUT_MS
    ) {
        bufIndex = 0;
        discardUntilNewline = false;
    }

    while (Serial.available() > 0) {
        char c = (char)Serial.read();
        lastRxByteTime = millis();

        if (c == '\n' || c == '\r') {
            if (!discardUntilNewline && bufIndex > 0) {
                inputBuf[bufIndex] = '\0';
                processLine(inputBuf);
            }
            bufIndex = 0;
            discardUntilNewline = false;
        } else if (discardUntilNewline) {
            continue;
        } else if (bufIndex < BUF_SIZE - 1) {
            inputBuf[bufIndex++] = c;
        } else {
            bufIndex = 0;
            discardUntilNewline = true;
        }
    }
}

void loop() {
    const uint32_t now = millis();
    serviceThermalProtection(now);
    serviceSerial(now);
}
