// ╔═══════════════════════════════════════════════════════════════════════╗
// ║        H Y D R O S Y N C   —   Smart Water Management System         ║
// ║        ESP32-WROOM-32 DevKit V1  |  30-pin  |  Firmware v6.0         ║
// ║        Target Market: Kenya  |  EAT Timezone (UTC+3)                 ║
// ╚═══════════════════════════════════════════════════════════════════════╝
//
// ───────────────────────────────────────────────────────────────────────
// WHAT THIS FIRMWARE DOES
// ───────────────────────────────────────────────────────────────────────
// HydroSync monitors two water tanks — an overhead tank above ground and
// an underground reservoir — and automatically controls a pump between
// them. It protects the pump from dry running, publishes live telemetry
// to HiveMQ Cloud over encrypted MQTT, and receives remote commands from
// the HydroSync mobile app and web dashboard.
//
// The device provisions itself over a captive portal WiFi page on first
// boot. After that it runs fully autonomously with no human intervention.
//
// ───────────────────────────────────────────────────────────────────────
// HARDWARE USED IN THIS PROJECT
// ───────────────────────────────────────────────────────────────────────
//
//  ESP32-WROOM-32 DevKit V1, 30-pin
//    The main controller. Dual-core 240 MHz, 320 KB RAM, built-in WiFi
//    and Bluetooth. We use only one core (Arduino style, loop-based).
//
//  AJ-SR04M Ultrasonic Sensor Modules  (×2)
//    Waterproof ultrasonic distance sensors. Each is a complete module
//    with its own PCB — no external resistors or dividers are needed.
//    One sensor is mounted above the overhead tank, one above the
//    underground tank. They measure the air gap to the water surface
//    and the firmware converts this to a fill percentage.
//    *** CROSSTALK WARNING: Both sensors must NEVER fire at the same
//    time. See the pingSensors() function for a full explanation. ***
//
//  ZHT103 CT Donut Module  (current transformer)
//    A complete signal-conditioned AC current sensing module.
//    The pump live wire passes through the donut hole. The module
//    outputs an analog voltage proportional to AC current draw.
//    Used to detect dry-run condition (pump running with no water).
//    *** This is a MODULE, not a bare core. It has onboard op-amp,
//    bias resistors, trimpot, and filter caps. See calibrateBias()
//    and readCurrentRMS() for full explanation. ***
//
//  SSR-40DA Solid State Relay
//    Controls the 240V AC mains to the water pump.
//    Controlled by GPIO 23: HIGH = pump ON, LOW = pump OFF.
//    Switches at AC zero-crossing — clean, no spike, no flyback diode.
//
//  Green LED + Red LED  (220Ω resistors)
//    Green = system healthy or pump running.
//    Red   = error condition or underground tank critically low.
//
//  Momentary Push Button  (factory reset)
//    Connected between GPIO 2 and GND. Hold 5 seconds to erase
//    saved WiFi and HiveMQ credentials and restart in setup mode.
//
//  Arduino uno + 2.8" TFT Shield  (local display)
//    Receives a pipe-delimited data string from this ESP32 via
//    Serial2 (GPIO 17 TX → Arduino pin 0 RX) every 3 seconds and
//    displays tank levels, pump status, and system status on the TFT.
//
//  18650 Battery + TP4056 Charger + MT3608 Boost Converter
//    Backup power. When mains fails, MT3608 boosts battery voltage
//    to 5V via diode OR-ing with the mains 5V supply rail.
//    The ESP32 continues monitoring and alerting during power cuts.
//
// ───────────────────────────────────────────────────────────────────────
// WIRING SUMMARY
// ───────────────────────────────────────────────────────────────────────
//
//  AJ-SR04M Overhead Tank:
//    VCC  → 5V rail
//    GND  → GND
//    TRIG → GPIO 19
//    ECHO → GPIO 18
//    NOTE: Check ECHO voltage with a multimeter. If 3.3V → connect
//    directly. If 5V → use a 1kΩ+2kΩ voltage divider to protect GPIO.
//
//  AJ-SR04M Underground Tank:
//    VCC  → 5V rail
//    GND  → GND
//    TRIG → GPIO 26
//    ECHO → GPIO 27
//    NOTE: Same ECHO voltage check as above.
//
//  ZHT103 CT Module:
//    VCC  → 5V rail  (MUST be 5V — the bias midpoint is VCC/2 = 2.5V)
//    GND  → GND      (both GND pins shorted → ESP32 GND)
//    OUT  → GPIO 34  (direct — NO voltage divider, max output is 2.5V)
//    IN   → leave unconnected
//    DONUT: thread the pump LIVE AC wire through the hole ONCE.
//    For weak signal (small pumps): thread 3 times, divide CT_CAL by 3.
//
//  SSR-40DA:
//    DC+  → GPIO 23
//    DC-  → GND
//    AC LOAD side → pump circuit (qualified electrician only)
//
//  Green LED:  GPIO 5 → 220Ω → LED+ | LED- → GND
//  Red LED:    GPIO 4 → 220Ω → LED+ | LED- → GND
//
//  Reset Button:  GPIO 2 ← one leg | other leg → GND
//    (internal pull-up enabled; default HIGH; press = LOW)
//
//  Serial2 to Arduino:
//    GPIO 17 (TX2) → Arduino pin 0 (RX0)
//    GND            → Arduino GND  ← shared ground MANDATORY
//    Baud: 9600
//
// ───────────────────────────────────────────────────────────────────────
// RC = -2 ERROR EXPLAINED (MQTT_CONNECT_FAILED) AND HOW IT IS FIXED
// ───────────────────────────────────────────────────────────────────────
//
// RC=-2 is MQTT_CONNECT_FAILED. It means the TCP/TLS connection to
// HiveMQ failed before the MQTT handshake could even start.
//
// ROOT CAUSE:
//   HiveMQ Cloud uses TLS (the same encryption as HTTPS websites).
//   When the ESP32 opens a TLS connection it validates the server's
//   certificate. Part of that validation checks that today's date falls
//   within the certificate's valid-from and valid-until dates.
//   After a cold boot, before NTP time sync, the ESP32's internal clock
//   shows the Unix epoch start — January 1st, 1970. The HiveMQ
//   certificate was issued in 2020-something and is valid until 2030-
//   something. Against a clock showing 1970, the certificate appears to
//   be "not yet valid" (issued in the future). The TLS library REJECTS
//   the certificate. The TCP connection is torn down. PubSubClient never
//   gets to send the MQTT CONNECT packet. It returns rc=-2.
//
// FIX IN v6.0:
//   1. Immediately after WiFi connects, configTime() is called to start
//      NTP synchronisation (Africa pool primary, global pool fallback).
//      Kenya timezone: EAT = UTC+3 = 10800 seconds offset.
//   2. mqttConnect() checks time(nullptr) before attempting the
//      connection. If the returned epoch is below NTP_EPOCH_MIN
//      (1,700,000,000 = November 2023), NTP has not yet provided a
//      valid time. The function returns early without attempting MQTT.
//      It will be retried in MQTT_RETRY_MS (10 seconds).
//   3. Once NTP responds (usually within 1–3 seconds of WiFi connect),
//      time(nullptr) rises to the current real epoch (~1.75 billion for
//      2025). The guard passes, TLS validates the certificate correctly,
//      and MQTT connects successfully — no rc=-2.
//
// KENYA TIMEZONE NOTE:
//   configTime(3*3600, 0, ...) sets UTC+3 (EAT).
//   time(nullptr) then returns Kenya local time (seconds since epoch).
//   TLS certificate validation uses UTC internally regardless of local
//   timezone — the timezone setting only affects how wall-clock time
//   is displayed (Serial Monitor timestamps etc.).
//
// ───────────────────────────────────────────────────────────────────────
// PROVISIONING FLOW (CUSTOMER FIRST BOOT)
// ───────────────────────────────────────────────────────────────────────
//
//  STEP 1: Customer powers on the device.
//          Red LED on = booting. No credentials found → portal starts.
//
//  STEP 2: Device broadcasts a WiFi network:
//            SSID:     "HydroSync_Setup"
//            Password: "hydro1234"
//          Green LED blinks every 600ms = setup mode.
//
//  STEP 3: Customer connects phone to "HydroSync_Setup".
//          A setup page opens automatically (captive portal).
//          If phone does not auto-open: browser → 192.168.4.1
//
//  STEP 4: Customer fills in 3 fields ONLY:
//            • WiFi Network Name (their SSID)
//            • WiFi Password
//            • HiveMQ Username  (printed on the setup card you include)
//          The HiveMQ password and Device ID are already in the firmware.
//          The customer cannot see or change them.
//
//  STEP 5: Tap "Save & Connect". Device saves to NVS flash and reboots.
//
//  STEP 6: Device connects to WiFi → NTP syncs → MQTT connects.
//          Solid GREEN LED = running and connected to cloud.
//
// ───────────────────────────────────────────────────────────────────────
// FACTORY RESET
// ───────────────────────────────────────────────────────────────────────
//
//  METHOD 1 — Physical button (GPIO 2):
//    Hold for 5 seconds. Red LED blinks while held. Release to cancel.
//    Both LEDs flash 3× at 5s = confirmed. Device erases credentials
//    from NVS and reboots into portal mode.
//
//  METHOD 2 — Serial command (USB cable + laptop):
//    Open Serial Monitor at 115200 baud.
//    Type: RESET_NVS  then Enter.
//    Device erases credentials and reboots immediately.
//    Also available: STATUS command prints full device state.
//
// ───────────────────────────────────────────────────────────────────────
// PER-DEVICE FLASHING WORKFLOW (your production process)
// ───────────────────────────────────────────────────────────────────────
//
//  1. Open secrets.h
//  2. Change DEVICE_ID  → unique ID for this unit  (e.g. "HydroSync_002")
//  3. Change HIVEMQ_PASS → this device's HiveMQ password
//     (create credential in HiveMQ console → Access Management)
//  4. HIVEMQ_HOST stays the same for all devices on your cluster
//  5. Flash to the ESP32
//  6. Include in the box:
//       Setup card: "HiveMQ Username: hydrosync_002"
//       (Do NOT write the password on the card — it stays secret)
//  7. Customer powers on and uses portal setup
//
// ───────────────────────────────────────────────────────────────────────
// AUTOMATION LOGIC — THE HARDWARE SUPREME RULE
// ───────────────────────────────────────────────────────────────────────
//
//  The firmware safety logic ALWAYS wins over any app command.
//
//  AUTO PUMP ON  (all three conditions must be true simultaneously):
//    • Overhead level < OH_LOW_PCT  (60%)
//    • Underground level > UG_LOW_PCT  (30%)
//    • No dry run error active
//
//  AUTO PUMP OFF  (either condition alone is enough):
//    • Overhead level >= OH_HIGH_PCT  (96%)  — overhead tank full
//    • Underground level <= UG_LOW_PCT  (30%) — underground tank empty
//
//  DRY RUN PROTECTION:
//    If pump runs for 45 seconds with current below MIN_PUMP_A (0.30A),
//    the pump is shut off and the error flag is set. The pump will NOT
//    restart until the app sends RESET_ERROR, or until the underground
//    tank auto-recovers above 45%.
//
// ───────────────────────────────────────────────────────────────────────
// REQUIRED LIBRARIES  (install via Arduino IDE → Library Manager)
// ───────────────────────────────────────────────────────────────────────
//
//  PubSubClient   by Nick O'Leary      — MQTT client
//  ArduinoJson    by Benoit Blanchon   — JSON v6 or v7
//  NewPing        by Tim Eckel         — ultrasonic sensor driver
//
//  All other libraries (WiFi, WiFiClientSecure, WebServer, DNSServer,
//  Preferences, time.h) are built into the ESP32 Arduino Core and
//  require no separate installation.
//
// ═══════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────
// LIBRARY INCLUDES
// ───────────────────────────────────────────────────────────────────────
#include <WiFi.h>               // WiFi STA (station) and AP (access point) mode
#include <WiFiClientSecure.h>   // TLS-encrypted TCP — needed for HiveMQ port 8883
#include <WebServer.h>          // Lightweight HTTP server for the setup portal
#include <DNSServer.h>          // DNS redirect that makes captive portals work on phones
#include <Preferences.h>        // NVS flash key-value storage — survives reboots
#include <PubSubClient.h>       // MQTT client library
#include <ArduinoJson.h>        // JSON serialise / deserialise
#include <time.h>               // NTP time sync — required for TLS cert validation
#include <NewPing.h>            // AJ-SR04M driver: handles trigger pulse and echo timing
#include "secrets.h"            // Per-unit: DEVICE_ID, HIVEMQ_HOST, HIVEMQ_PASS, Root CA

// ───────────────────────────────────────────────────────────────────────
// PIN DEFINITIONS
// ───────────────────────────────────────────────────────────────────────

// AJ-SR04M Overhead Tank Sensor
// TRIG: output pin — ESP32 sends a 10µs pulse to start a measurement
// ECHO: input pin  — the module holds this HIGH for the echo travel time
#define OH_TRIG   19
#define OH_ECHO   18

// AJ-SR04M Underground Tank Sensor
#define UG_TRIG   26
#define UG_ECHO   27

// SSR-40DA Solid State Relay
// Accepts 3–32V DC on its input. ESP32 3.3V output is sufficient.
// RELAY_ON = HIGH: GPIO 23 HIGH energises the SSR coil → pump gets 240V AC
// RELAY_ON = LOW would invert this — do not change without checking your SSR wiring
#define PUMP_PIN   23
#define RELAY_ON   HIGH

// ZHT103 CT Module analog output
// GPIO 34 is input-only (no accidental digital drive possible).
// The ZHT103 OUT pin max swing is 0–2.5V, safely within the ESP32 3.3V ADC range.
// NO voltage divider on this line — adding one would weaken the signal.
#define CT_PIN     34

// Status LEDs — each has a 220Ω current-limiting resistor on the PCB
#define GREEN_LED  5   // HIGH = lit = system healthy or pump running
#define RED_LED    4   // HIGH = lit = error or underground low

// Factory reset push button
// Wire: one leg to GPIO 13, other leg to GND.
// Firmware enables internal 47kΩ pull-up so default (unpressed) state is HIGH.
// Button pressed = GPIO 13 pulled LOW.
#define RST_BTN    13

// Serial2 to Arduino Mega (drives TFT display)
// TX2 (GPIO 17) wires to Arduino pin 0 (RX0). GND must be shared.
#define RX2_PIN   16   // Serial2 RX — declared but not used for transmit
#define TX2_PIN   17   // Serial2 TX → Arduino RX

// ───────────────────────────────────────────────────────────────────────
// CAPTIVE PORTAL CONFIGURATION
// ───────────────────────────────────────────────────────────────────────
// The WiFi AP that the customer connects to during first-boot setup.
// PORTAL_PASS must be at least 8 characters for WPA2 to be accepted.
// These values are the same on every HydroSync unit you ship.
#define PORTAL_SSID  "HydroSync_Setup"
#define PORTAL_PASS  "hydro1234"

// ───────────────────────────────────────────────────────────────────────
// NVS STORAGE KEYS
// ───────────────────────────────────────────────────────────────────────
// Only 3 customer-entered values are saved to NVS.
// HIVEMQ_PASS is NOT stored in NVS — it lives only in secrets.h.
// NVS namespace "hs" is kept short to minimise flash wear.
// Key strings must be ≤15 characters (ESP32 NVS limit).
#define NVS_NS     "hs"      // Namespace that groups all HydroSync NVS keys
#define NVS_SSID   "ssid"    // Customer WiFi network name
#define NVS_WPASS  "wpass"   // Customer WiFi password
#define NVS_HUSER  "huser"   // HiveMQ username (given to customer on setup card)
#define NVS_DONE   "done"    // Bool flag — true means device has been provisioned

// ───────────────────────────────────────────────────────────────────────
// FACTORY RESET BUTTON TIMING
// ───────────────────────────────────────────────────────────────────────
// 5 seconds is long enough to be deliberate but not frustrating.
// The red LED blinks throughout the hold so the customer knows
// the press is being registered.
#define RESET_HOLD_MS  5000UL

// ───────────────────────────────────────────────────────────────────────
// TANK CALIBRATION
// ───────────────────────────────────────────────────────────────────────
// OH_DEPTH_CM and UG_DEPTH_CM: measure physically with a tape measure
// from the face of the sensor probe to the bottom of the EMPTY tank.
// These are the distances the sensor would read when the tank has zero water.
//
// BLIND_CM: The AJ-SR04M has a physical dead zone directly in front of
// the transducer. Any echo returning within this distance is not a real
// water surface reflection — it is internal ringing noise from the piezo.
// The AJ-SR04M datasheet states minimum range is approximately 20–25 cm.
//
// WHAT HAPPENS NEAR 100% FULL WITHOUT THE BLIND ZONE GUARD:
//   As the tank fills, the water surface rises into the blind zone.
//   NewPing.ping_cm() returns 0 (timeout) because it cannot distinguish
//   a very close echo from no echo. Without protection the firmware would
//   see 0, calculate a sensor error (-1), and depending on the last known
//   level, could mistakenly treat a full tank as an empty/broken sensor.
//   In the worst case this triggers the pump when the tank is already
//   full — potential overflow.
//
// FIX (blind zone fallback in processReadings()):
//   If the new reading is -1 but the last valid reading was ≥85%,
//   the tank is almost certainly in the blind zone (nearly full).
//   We hold the last known good value rather than reporting an error.
#define OH_DEPTH_CM   125   // Overhead tank: sensor-face to empty floor, cm (measure yours)
#define UG_DEPTH_CM   175   // Underground: sensor-face to empty floor, cm (measure yours)
#define BLIND_CM       25   // AJ-SR04M blind zone — do not reduce below 20

// ───────────────────────────────────────────────────────────────────────
// AUTOMATION THRESHOLDS
// ───────────────────────────────────────────────────────────────────────
// Adjust these to match your customer's tank sizes and usage patterns.
#define OH_LOW_PCT    60   // Pump starts when overhead drops below 60%
#define OH_HIGH_PCT   96   // Pump stops when overhead reaches 96% (near full)
#define UG_LOW_PCT    30   // Pump stops/prevented if underground at or below 30%

// ───────────────────────────────────────────────────────────────────────
// ZHT103 CT MODULE — CALIBRATION CONSTANTS
// ───────────────────────────────────────────────────────────────────────
//
// HOW THE ZHT103 MODULE WORKS (full explanation):
//
//   The ZHT103 donut is a current transformer (CT). You thread the
//   pump's live AC wire through the hole in the centre of the donut.
//   The pump wire is the PRIMARY winding (1 turn by default).
//   Inside the donut is a secondary winding with ~1000 turns.
//   By transformer action: a 5A primary current induces 5mA in the
//   secondary (ratio 1000:1). This tiny 5mA secondary current cannot
//   be read directly by a microcontroller ADC.
//
//   The ZHT103 MODULE (not just the core) adds these stages:
//     1. BURDEN RESISTOR (onboard): converts the 5mA secondary current
//        into a small AC voltage across it.
//     2. OP-AMP (onboard, typically OP07): amplifies that tiny voltage
//        to a level the ADC can read clearly. Gain is set by the blue
//        TRIMPOT — adjustable 0× to ~100×.
//     3. DC BIAS NETWORK (onboard): the op-amp is powered from a single
//        5V supply, so it cannot swing below 0V. To represent the
//        negative half of the AC sine wave, the bias network lifts the
//        output's "zero current" midpoint to VCC/2 = 2.5V. With no
//        current, OUT = 2.5V. With pump running, OUT swings symmetrically
//        above and below 2.5V (e.g. 2.0V to 3.0V for a small current).
//     4. FILTER CAPS (onboard): smooth high-frequency noise.
//
//   PIN CONNECTIONS:
//     VCC → 5V  (MUST be 5V. At 3.3V, the bias midpoint becomes 1.65V
//                which reduces the usable signal range and throws off
//                calibration. Always use 5V for this module.)
//     GND → GND (both GND pins are internally shorted — connect both)
//     OUT → GPIO 34  (max output = 2.5V = safely within ESP32 3.3V ADC)
//     IN  → leave unconnected (an alternative input for other uses)
//
//   WHY NO VOLTAGE DIVIDER ON THE OUT PIN:
//     The module's output CANNOT exceed VCC/2 = 2.5V. The ESP32 ADC
//     tolerates up to 3.3V. A voltage divider would halve the already-
//     small signal swing, making dry-run detection (which depends on
//     detecting ~0.3A) significantly harder. Never add a divider here.
//
//   TRUE RMS MEASUREMENT (why we use it, not peak detection):
//     The pump motor draws an AC current that is approximately sinusoidal
//     but may have harmonics due to motor inductance. Peak detection
//     (read one sample at max, multiply by 0.707) is only accurate for
//     pure sine waves and is unreliable with ADC noise.
//     True RMS squares all samples, averages them, and takes the square
//     root. This naturally rejects random noise (noise averages near zero
//     after squaring both + and - samples). We sample over exactly 60ms
//     = 3 complete 50Hz cycles at ~10kHz, giving ~600 samples per reading.
//     This is accurate regardless of where in the cycle sampling starts.
//
//   HOW TO CALIBRATE CT_CAL:
//     1. Run the pump with water flowing (not dry running).
//     2. Clamp a clamp meter around the same wire going through the donut.
//     3. Open Serial Monitor at 115200 baud. Find lines:
//          "[CT] Irms=X.XXXX A  bias=Y.YYYY V"
//     4. NewCal = CT_CAL × (clamp_meter_reading / firmware_Irms)
//        Example: clamp reads 2.50A, firmware prints 1.25A
//                 NewCal = 111.1 × (2.50 / 1.25) = 222.2
//     5. Update CT_CAL below and reflash. Verify again.
//
//   TRIMPOT ADJUSTMENT:
//     Clockwise = more gain = larger signal for same current.
//     Start at midpoint. Adjust after calibration if needed.
//     If readings are too low → clockwise. If output saturates → anti-CW.
//     Once calibrated, do not touch the trimpot again.
//
//   INCREASING SENSITIVITY FOR SMALL PUMPS:
//     Thread the live wire through the donut hole 3 times (3 turns).
//     This multiplies the apparent primary current by 3, giving 3×
//     better signal on the ADC. Then divide CT_CAL by 3.
//     Example: CT_CAL=111.1 with 1 loop → CT_CAL=37.0 with 3 loops.
//
#define CT_CAL      111.1f  // Calibration factor Vrms→Amps (adjust per procedure above)
#define CT_FLOOR_A    0.04f // Noise floor: readings below this are clamped to 0.00 A
#define MIN_PUMP_A    0.30f // Below this while pump is ON = potential dry run condition
#define DRY_RUN_MS  45000UL // Sustained low current for this long → dry run declared

// ───────────────────────────────────────────────────────────────────────
// ULTRASONIC SENSOR SETTINGS
// ───────────────────────────────────────────────────────────────────────
//
// AJ-SR04M CROSSTALK PROBLEM AND SOLUTION (full explanation):
//
//   Both AJ-SR04M sensor probes are mounted in the same plastic casing.
//   When Sensor A fires, it emits a burst of 40kHz ultrasonic energy.
//   This energy travels in TWO paths simultaneously:
//     Path 1 → through the air to the water surface and back (intended)
//     Path 2 → directly through the plastic walls of the casing to
//               Sensor B's receiver piezo (not intended)
//
//   If Sensor B fires while Path 2 energy is still present in the casing,
//   Sensor B's echo comparator picks up Sensor A's decaying signal and
//   returns a completely wrong distance — typically a short distance like
//   5–15 cm (nearly instant return = very close reflection).
//
//   SOLUTION: Sequential firing with a mandatory cooldown gap.
//     Step 1: Fire Sensor A (overhead). Read echo. Done.
//     Step 2: Wait XTALK_MS (100 milliseconds).
//     Step 3: Fire Sensor B (underground). Read echo. Done.
//
//   WHY 100ms IS ENOUGH:
//     At the speed of sound (343 m/s at 20°C), 100ms corresponds to
//     34.3 metres of travel. Ultrasonic energy attenuates with the
//     square of distance. After 34m equivalent, the 40kHz signal from
//     Sensor A has decayed to a level completely below Sensor B's
//     detection threshold. Even in worst-case (cold, dense air, small
//     casing), 100ms provides ample margin.
//
//   FUTURE HARDWARE FIX:
//     If sensors are permanently in one enclosure, add:
//     • 15mm acoustic foam strip between the two probe heads
//     • Space probes at least 15 cm apart
//     • Angle probes 5–10° outward so beam axes diverge
//     These measures allow reducing XTALK_MS to ~50ms.
//
// BUF_SIZE and SAMPLE_MS:
//   Each sensor pair is fired every SAMPLE_MS (500ms).
//   After BUF_SIZE (6) firings we have 3 seconds of readings.
//   stableLevel() processes the 6-sample buffer for one stable result.
//   This filters out: splashing, vibration, and single false echoes.
//
#define MAX_DIST_CM  400    // NewPing maximum range (cm). Sensor max is ~450cm.
#define BUF_SIZE       6    // Rolling buffer depth per sensor (6 readings)
#define SAMPLE_MS    500UL  // Fire sensor pair every 500ms
#define XTALK_MS     100UL  // Mandatory gap between firing Sensor A and Sensor B

// ───────────────────────────────────────────────────────────────────────
// CONNECTIVITY TIMING
// ───────────────────────────────────────────────────────────────────────
#define WIFI_WAIT_MS   15000UL  // Wait up to 15s per WiFi attempt before giving up
#define WIFI_RETRY_MS  30000UL  // Retry WiFi connection every 30s when disconnected
#define MQTT_RETRY_MS  10000UL  // Retry MQTT every 10s when WiFi is up but MQTT is down
#define MQTT_BUF         512    // MQTT packet buffer in bytes — sufficient for all payloads

// NTP_EPOCH_MIN: proof that NTP has synced.
// 1,700,000,000 seconds since 1970 = November 14, 2023 at 22:13 UTC.
// Any real time from 2024 onwards will be higher than this value.
// If time(nullptr) is below this, the clock is still at default (1970)
// and TLS certificate validation WILL fail → MQTT rc=-2.
// This guard in mqttConnect() prevents that error entirely.
#define NTP_EPOCH_MIN  1700000000UL

// ───────────────────────────────────────────────────────────────────────
// RUNTIME CREDENTIAL BUFFERS
// ───────────────────────────────────────────────────────────────────────
// char[] is used instead of Arduino String objects.
// REASON: WiFiClientSecure (mbedTLS) needs one large contiguous block of
// heap memory (~40–60 KB) for the TLS handshake buffers. When String
// objects are frequently created and destroyed, the heap becomes
// fragmented — small free blocks scattered everywhere, no large
// contiguous block available → TLS allocation fails → connection fails.
// Fixed-size char[] arrays are allocated in BSS (uninitialised static
// storage) and never fragment the heap.
static char wifiSSID[65];  // Customer's WiFi network name (max 32 + null)
static char wifiPass[65];  // Customer's WiFi password     (max 63 + null)
static char hiveUser[65];  // HiveMQ username              (max 64 + null)

// ───────────────────────────────────────────────────────────────────────
// OBJECT DECLARATIONS
// ───────────────────────────────────────────────────────────────────────
static Preferences      prefs;                           // NVS flash R/W access
static WebServer        portalSrv(80);                   // HTTP server: setup portal
static DNSServer        dns;                             // DNS: captive portal redirect
static WiFiClientSecure tlsSock;                         // TLS TCP socket over WiFi
static PubSubClient     mqtt(tlsSock);                   // MQTT over the TLS socket
static NewPing          ohSonar(OH_TRIG, OH_ECHO, MAX_DIST_CM);  // Overhead sensor
static NewPing          ugSonar(UG_TRIG, UG_ECHO, MAX_DIST_CM);  // Underground sensor

// ───────────────────────────────────────────────────────────────────────
// DEVICE STATE
// ───────────────────────────────────────────────────────────────────────
static bool  pumpOn          = false;         // Is the pump currently running?
static char  sysStatus[24]   = "Initializing";// Current system status string (max 23 chars)
static int   ohLevel         = -1;            // Overhead tank fill % (-1 = sensor error)
static int   ugLevel         = -1;            // Underground fill %   (-1 = sensor error)
static float pumpAmps        = 0.0f;          // Last measured pump current in Amps
static int   ohBuf[BUF_SIZE];                 // Rolling buffer: overhead ping distances (cm)
static int   ugBuf[BUF_SIZE];                 // Rolling buffer: underground ping distances
static int   bufIdx          = 0;             // Current write position in both buffers
static int   lastGoodOH      = 50;            // Last valid overhead reading (blind zone fallback)
static int   lastGoodUG      = 50;            // Last valid underground reading

// Dry run detection state
static bool           dryRunErr  = false;     // True = dry run error declared, pump locked out
static bool           dryPending = false;     // True = low current timer is running
static unsigned long  dryStart   = 0;         // millis() when the low current timer started
static unsigned long  pumpOnAt   = 0;         // millis() when pump last started (for grace period)

// ZHT103 DC bias — auto-measured at boot. Default 1.65V is a safe fallback.
static float ctBias = 1.65f;

// ───────────────────────────────────────────────────────────────────────
// TIMING VARIABLES
// ───────────────────────────────────────────────────────────────────────
static unsigned long lastSample   = 0;    // Last time sensors were fired
static unsigned long lastMqttTry  = 0;    // Last MQTT connection attempt
static unsigned long lastWifiTry  = 0;    // Last WiFi connection attempt
static bool          wifiWaiting  = false;// True while a WiFi.begin() attempt is in progress
static unsigned long wifiWaitAt   = 0;    // When the current WiFi attempt started

// Reset button state tracking
static bool           btnHeld  = false;
static unsigned long  btnHeldAt = 0;

// ═══════════════════════════════════════════════════════════════════════
// SECTION 1 — NVS CREDENTIAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

// loadCreds()
// Opens the NVS namespace in read-only mode and loads the three
// customer credentials into the char[] buffers above.
// Returns true only if all required fields (SSID and HiveMQ username)
// are present and non-empty. WiFi password can be empty (open networks).
// HIVEMQ_PASS and DEVICE_ID come from secrets.h, never from NVS.
static bool loadCreds() {
  prefs.begin(NVS_NS, true);                            // true = read-only
  bool done = prefs.getBool(NVS_DONE, false);
  if (done) {
    prefs.getString(NVS_SSID,  wifiSSID, sizeof(wifiSSID));
    prefs.getString(NVS_WPASS, wifiPass, sizeof(wifiPass));
    prefs.getString(NVS_HUSER, hiveUser, sizeof(hiveUser));
  }
  prefs.end();

  if (!done || !wifiSSID[0] || !hiveUser[0]) {
    Serial.println(F("[NVS] Not provisioned — starting setup portal."));
    return false;
  }
  Serial.printf("[NVS] Loaded:    SSID=%s  HUser=%s\n", wifiSSID, hiveUser);
  Serial.printf("[NVS] Hardcoded: DevID=%s  Host=%s\n", DEVICE_ID, HIVEMQ_HOST);
  return true;
}

// saveCreds()
// Saves the three customer-entered values to NVS and sets the
// NVS_DONE flag so loadCreds() will succeed on next boot.
// HIVEMQ_PASS is deliberately NOT saved — it lives in firmware only.
static void saveCreds(const char* ssid, const char* wpass, const char* huser) {
  prefs.begin(NVS_NS, false);                           // false = read-write
  prefs.putString(NVS_SSID,  ssid);
  prefs.putString(NVS_WPASS, wpass);
  prefs.putString(NVS_HUSER, huser);
  prefs.putBool(NVS_DONE, true);                        // Mark device as provisioned
  prefs.end();
  Serial.println(F("[NVS] Credentials saved to flash."));
}

// eraseCreds()
// Wipes the entire NVS namespace — all 3 customer credentials and the
// provisioned flag are removed. Called by both reset methods.
// After this call, the next boot calls loadCreds() which returns false
// → portal starts automatically.
static void eraseCreds() {
  prefs.begin(NVS_NS, false);
  prefs.clear();                                        // Removes all keys in "hs" namespace
  prefs.end();
  memset(wifiSSID, 0, sizeof(wifiSSID));
  memset(wifiPass, 0, sizeof(wifiPass));
  memset(hiveUser, 0, sizeof(hiveUser));
  Serial.println(F("[NVS] All credentials erased."));
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 2 — FACTORY RESET BUTTON  (GPIO 13, active LOW)
// ═══════════════════════════════════════════════════════════════════════
//
// This function is called every single loop() iteration. It is fully
// non-blocking — it never calls delay(). It uses millis() to track the
// hold duration. The reset only fires after RESET_HOLD_MS (5 seconds)
// of continuous hold, preventing accidental resets from brief touches.
//
// VISUAL FEEDBACK:
//   While holding: Red LED blinks every 200ms
//   On 5-second trigger: Both LEDs flash 3 times quickly
//   On release before 5s: Red LED returns to normal on next updateLEDs()
static void checkResetButton() {
  bool pressed = (digitalRead(RST_BTN) == LOW); // LOW = button pressed (pull-up active)

  if (pressed && !btnHeld) {
    // Transition: not held → now held. Record start time.
    btnHeld   = true;
    btnHeldAt = millis();
    Serial.println(F("[BTN] Reset button held — hold 5s to reset, release to cancel"));
  }

  if (btnHeld && pressed) {
    // Button is being continuously held. Blink red LED as feedback.
    bool ledState = ((millis() / 200) % 2 == 0); // Toggle every 200ms
    digitalWrite(RED_LED, ledState ? HIGH : LOW);

    if (millis() - btnHeldAt >= RESET_HOLD_MS) {
      // 5 seconds reached — confirmed factory reset
      Serial.println(F("[BTN] 5s reached — factory reset confirmed"));
      for (int i = 0; i < 3; i++) {               // Flash both LEDs 3× as confirmation
        digitalWrite(GREEN_LED, HIGH);
        digitalWrite(RED_LED,   HIGH);
        delay(200);
        digitalWrite(GREEN_LED, LOW);
        digitalWrite(RED_LED,   LOW);
        delay(200);
      }
      eraseCreds();
      delay(300);
      ESP.restart(); // Reboots into portal mode since NVS is now empty
      // No code after this point — ESP.restart() does not return
    }
  }

  if (btnHeld && !pressed) {
    // Button released before 5 seconds — cancel the reset
    btnHeld = false;
    // RED_LED state will be corrected by the next updateLEDs() call
    Serial.println(F("[BTN] Reset cancelled."));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 3 — SERIAL COMMANDS  (USB cable + Serial Monitor)
// ═══════════════════════════════════════════════════════════════════════
//
// Available any time USB is connected. Useful for:
//   • Factory floor testing before shipping
//   • Field service / debugging
//   • Resetting a device when physical button is not accessible
//
// Open Arduino IDE → Serial Monitor → 115200 baud.
// Commands are case-insensitive.
//
//   RESET_NVS  — erase all customer credentials, reboot into portal
//   STATUS     — print complete device state to Serial Monitor
static void checkSerial() {
  if (!Serial.available()) return;

  // Read command characters until newline or 15-char limit
  char buf[16];
  int  n           = 0;
  unsigned long t0 = millis();
  while (millis() - t0 < 100 && n < 15) {     // 100ms window to receive full command
    if (Serial.available()) {
      char c = Serial.read();
      if (c == '\n' || c == '\r') break;        // Stop at line ending
      buf[n++] = c;
    }
  }
  buf[n] = '\0';
  while (Serial.available()) Serial.read();     // Flush any remaining chars

  if (strcasecmp(buf, "RESET_NVS") == 0) {
    Serial.println(F("[CMD] RESET_NVS — erasing NVS and rebooting into portal..."));
    eraseCreds();
    delay(300);
    ESP.restart();                               // Intentional — engineer triggered
  }
  else if (strcasecmp(buf, "STATUS") == 0) {
    // Print full system snapshot to Serial Monitor
    time_t now = time(nullptr);
    Serial.println(F("------- HydroSync STATUS -------"));
    Serial.printf("[STATUS] DevID     = %s\n",   DEVICE_ID);
    Serial.printf("[STATUS] HiveHost  = %s\n",   HIVEMQ_HOST);
    Serial.printf("[STATUS] WiFi SSID = %s\n",   wifiSSID);
    Serial.printf("[STATUS] HiveUser  = %s\n",   hiveUser);
    Serial.printf("[STATUS] WiFi      = %s  IP=%s\n",
                  WiFi.status()==WL_CONNECTED ? "CONNECTED" : "DISCONNECTED",
                  WiFi.localIP().toString().c_str());
    Serial.printf("[STATUS] NTP       = %s (epoch=%lu)\n",
                  (unsigned long)now > NTP_EPOCH_MIN ? "SYNCED" : "NOT SYNCED YET",
                  (unsigned long)now);
    Serial.printf("[STATUS] MQTT      = %s  rc=%d\n",
                  mqtt.connected() ? "CONNECTED" : "DISCONNECTED", mqtt.state());
    Serial.printf("[STATUS] OH Level  = %d%%\n",  ohLevel);
    Serial.printf("[STATUS] UG Level  = %d%%\n",  ugLevel);
    Serial.printf("[STATUS] Pump      = %s  %.2fA\n", pumpOn?"ON":"OFF", pumpAmps);
    Serial.printf("[STATUS] CT Bias   = %.4fV\n", ctBias);
    Serial.printf("[STATUS] DryRun    = %s\n",    dryRunErr ? "ERROR ACTIVE" : "OK");
    Serial.printf("[STATUS] System    = %s\n",    sysStatus);
    Serial.println(F("--------------------------------"));
  }
  else if (n > 0) {
    Serial.println(F("[CMD] Unknown command. Available: RESET_NVS | STATUS"));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 4 — CAPTIVE PORTAL  (setup mode)
// ═══════════════════════════════════════════════════════════════════════
//
// HOW CAPTIVE PORTALS WORK ON PHONES:
//   When a phone connects to a new WiFi network, the OS sends an HTTP
//   probe request to a known URL (e.g. connectivitycheck.gstatic.com
//   on Android). If the response is not what the OS expects, it concludes
//   that the network requires a "sign-in" page and automatically opens
//   the browser to the detected portal IP.
//   Our DNSServer responds to ALL domain lookups with our IP (192.168.4.1).
//   This forces the probe request to reach our WebServer, which returns
//   a redirect to our setup page — triggering the automatic browser open.
//   This is identical to how hotel, airport, and coffee shop WiFi works.
//
// HTML IS STORED AS PLAIN const char[] (NOT PROGMEM + FPSTR):
//   On ESP32, data in PROGMEM is in flash but is accessed via a special
//   read function. When WebServer.send() receives a FPSTR pointer, it
//   must first copy the entire HTML string to heap before transmitting.
//   This heap copy is unnecessary on ESP32 (unlike AVR where RAM is 2KB)
//   and creates fragmentation that can cause TLS to fail later.
//   Plain const char[] is placed in the read-only data segment of flash
//   by the GCC linker and can be served directly without heap allocation.

// Setup page: the form the customer sees on their phone
static const char SETUP_HTML[] =
  "<!DOCTYPE html><html><head>"
  "<meta charset=UTF-8>"
  "<meta name=viewport content='width=device-width,initial-scale=1'>"
  "<title>HydroSync Setup</title>"
  "<style>"
  "body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;"
  "background:#0f172a;color:#f1f5f9;"
  "display:flex;justify-content:center;align-items:center;min-height:100vh}"
  ".c{background:#1e293b;border-radius:14px;padding:26px 22px;max-width:380px;width:90%}"
  "h2{margin:0 0 4px;text-align:center;font-size:20px}"
  "p.s{margin:0 0 20px;text-align:center;color:#94a3b8;font-size:13px}"
  "hr{border:none;border-top:1px solid #334155;margin:16px 0}"
  "label{display:block;font-size:13px;color:#94a3b8;margin:10px 0 4px}"
  "input{width:100%;padding:10px 12px;border-radius:8px;box-sizing:border-box;"
  "border:1px solid #334155;background:#0f172a;color:#f1f5f9;font-size:14px}"
  "input:focus{outline:none;border-color:#06b6d4}"
  "button{width:100%;margin-top:18px;padding:13px;border:none;border-radius:9px;"
  "background:linear-gradient(135deg,#1d4ed8,#06b6d4);"
  "color:#fff;font-size:15px;font-weight:700;cursor:pointer}"
  ".note{margin-top:14px;padding:10px;border-radius:8px;"
  "background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.2);"
  "font-size:12px;color:#67e8f9;line-height:1.6}"
  "</style></head><body><div class=c>"
  "<h2>&#128167; HydroSync Setup</h2>"
  "<p class=s>Enter your WiFi details and the credentials from your setup card</p>"
  "<form method=POST action=/save>"
  "<hr>"
  "<label>WiFi Network Name (SSID)</label>"
  "<input name=ssid type=text autocomplete=off autocorrect=off "
  "autocapitalize=none spellcheck=false required>"
  "<label>WiFi Password</label>"
  "<input name=wpass type=password>"
  "<hr>"
  "<label>HiveMQ Username "
  "<span style='color:#475569;font-size:11px'>(from your setup card)</span>"
  "</label>"
  "<input name=huser type=text autocomplete=off autocorrect=off "
  "autocapitalize=none spellcheck=false required>"
  "<button type=submit>Save &amp; Connect</button>"
  "</form>"
  "<div class=note>"
  "&#8505; After saving: disconnect from HydroSync_Setup, reconnect to your "
  "normal WiFi, then wait 30 seconds. Solid green LED = device is online."
  "</div>"
  "</div></body></html>";

// Success page shown after form submission — visible while device saves and reboots
static const char DONE_HTML[] =
  "<!DOCTYPE html><html><head>"
  "<meta charset=UTF-8>"
  "<meta name=viewport content='width=device-width,initial-scale=1'>"
  "<title>HydroSync — Saved!</title>"
  "<style>"
  "body{margin:0;font-family:sans-serif;background:#0f172a;color:#f1f5f9;"
  "display:flex;justify-content:center;align-items:center;min-height:100vh}"
  ".c{background:#1e293b;border-radius:14px;padding:30px 24px;"
  "max-width:340px;width:90%;text-align:center}"
  "h2{color:#22c55e;font-size:20px;margin:10px 0}"
  "p{color:#94a3b8;font-size:14px;line-height:1.7}"
  "ol{text-align:left;color:#94a3b8;font-size:13px;line-height:2;margin-top:14px}"
  "</style></head><body><div class=c>"
  "<div style='font-size:48px'>&#9989;</div>"
  "<h2>Saved! Connecting...</h2>"
  "<p>Your HydroSync device is restarting and connecting to your network.</p>"
  "<ol>"
  "<li>Disconnect from HydroSync_Setup</li>"
  "<li>Reconnect to your normal WiFi</li>"
  "<li>Wait 30 seconds</li>"
  "<li>Solid <b style='color:#22c55e'>green LED</b> = online &#10003;</li>"
  "<li>Open the HydroSync app to monitor your tanks</li>"
  "</ol>"
  "</div></body></html>";

// HTTP GET / — serve the setup form
static void onRoot() { portalSrv.send(200, "text/html", SETUP_HTML); }

// HTTP any unrecognised URL — redirect to the setup form
// This is the response that triggers the captive portal browser popup on Android/iOS
static void onOther() {
  portalSrv.sendHeader("Location", "http://192.168.4.1/", true);
  portalSrv.send(302, "text/plain", "");
}

// HTTP POST /save — process the submitted form
static void onSave() {
  String ssid  = portalSrv.arg("ssid");
  String wpass = portalSrv.arg("wpass");  // Empty is OK for open networks
  String huser = portalSrv.arg("huser");

  // Validate — SSID and HiveMQ username are mandatory
  if (ssid.isEmpty() || huser.isEmpty()) {
    portalSrv.send(400, "text/plain",
      "WiFi Name and HiveMQ Username are required.");
    return;
  }

  Serial.printf("[PORTAL] Saving — SSID=%s  HUser=%s\n",
                ssid.c_str(), huser.c_str());

  // Send the success page FIRST so the customer's browser receives it
  // before the ESP32 stops responding. Then save and reboot.
  portalSrv.send(200, "text/html", DONE_HTML);
  delay(400);                               // 400ms for browser to receive the page

  saveCreds(ssid.c_str(), wpass.c_str(), huser.c_str());

  Serial.println(F("[PORTAL] Saved. Rebooting into normal operation..."));
  delay(1200);
  ESP.restart();                            // Intentional, controlled reboot
  // Does not return
}

// startPortal()
// Starts the ESP32 as a WiFi AP and runs the setup portal web server.
// This function BLOCKS — it loops forever until the customer submits
// the form, which reboots inside onSave(). It never returns.
static void startPortal() {
  Serial.println(F("[PORTAL] ─── Setup Mode Starting ───"));
  Serial.printf( "[PORTAL] AP SSID     = \"%s\"\n", PORTAL_SSID);
  Serial.printf( "[PORTAL] AP Password = \"%s\"\n", PORTAL_PASS);
  Serial.println(F("[PORTAL] Connect phone to that network, then open 192.168.4.1"));

  WiFi.mode(WIFI_AP);
  WiFi.softAP(PORTAL_SSID, PORTAL_PASS);
  IPAddress apIP = WiFi.softAPIP();
  Serial.printf("[PORTAL] AP IP = %s\n", apIP.toString().c_str());

  // DNS server: responds to ALL domain queries with the AP IP.
  // This is the mechanism that makes Android and iOS automatically
  // open the browser to the setup page (captive portal detection).
  dns.start(53, "*", apIP);

  portalSrv.on("/",     HTTP_GET,  onRoot);
  portalSrv.on("/save", HTTP_POST, onSave);
  portalSrv.onNotFound(onOther);
  portalSrv.begin();

  // Green LED blinks slowly while waiting for customer to configure
  unsigned long lastBlink = 0;
  bool          ledOn     = false;

  while (true) {                            // Loop forever until onSave() reboots
    dns.processNextRequest();               // Handle captive portal DNS queries
    portalSrv.handleClient();              // Handle HTTP requests
    checkSerial();                          // Serial RESET_NVS and STATUS still work here

    // Blink green LED every 600ms = visual "setup mode" indicator
    if (millis() - lastBlink > 600) {
      lastBlink = millis();
      ledOn = !ledOn;
      digitalWrite(GREEN_LED, ledOn ? HIGH : LOW);
    }
  }
  // Execution never reaches here
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 5 — ZHT103 CT MODULE (CURRENT SENSING)
// ═══════════════════════════════════════════════════════════════════════

// calibrateBias()
// Measures the real DC midpoint of the ZHT103 OUT pin with the pump OFF.
// Must be called in setup() before the pump is ever enabled.
//
// The module should output exactly VCC/2 = 2.5V at zero current.
// In practice, real component tolerances and the trimpot position cause
// deviations of ±100–250mV from 2.5V. For a dry-run detection scenario
// where the signal swing is only ~50–100mV, a 150mV baseline error is
// larger than the signal itself — rendering all readings meaningless.
// By measuring the real bias at boot (when pump is guaranteed OFF),
// we remove this error source entirely from every subsequent reading.
//
// 500 samples spread over ~100ms (200µs gap each).
// Taking many samples averages out ADC noise in the baseline.
static void calibrateBias() {
  Serial.print(F("[CT] Calibrating DC bias voltage (pump OFF)..."));
  long sum = 0;
  for (int i = 0; i < 500; i++) {
    sum += analogRead(CT_PIN);
    delayMicroseconds(200);
  }
  // Convert raw ADC average to volts (12-bit ADC, 3.3V reference)
  ctBias = (sum / 500.0f / 4095.0f) * 3.3f;
  Serial.printf(" Done. Bias = %.4f V\n", ctBias);
}

// readCurrentRMS()
// Measures true RMS current through the pump using the ZHT103 module.
//
// TRUE RMS ALGORITHM:
//   For each sample:
//     1. raw = analogRead(CT_PIN)              (0–4095, 12-bit ADC)
//     2. volt = (raw / 4095) × 3.3V           (convert to voltage)
//     3. ac = volt - ctBias                   (remove DC offset → pure AC)
//     4. sumSq += ac × ac                     (square and accumulate)
//   After all samples:
//     5. Vrms = sqrt(sumSq / n)               (root mean square voltage)
//     6. Irms = Vrms × CT_CAL                 (calibration factor → Amps)
//
// WINDOW: 60ms = exactly 3 complete 50Hz mains cycles.
//   At 100µs per sample: 60ms / 100µs = ~600 samples per call.
//   Sampling exactly N complete cycles guarantees both the positive
//   and negative AC half-cycles are fully captured regardless of
//   the phase at which sampling begins.
//
// NOISE FLOOR: CT_FLOOR_A (0.04A).
//   The ESP32 ADC has ~3–5 LSB of thermal noise. After squaring and
//   CT_CAL scaling, this noise appears as a phantom current of
//   ~0.01–0.04A even when no real current flows. Readings below
//   CT_FLOOR_A are clamped to exactly 0.00A to avoid false dry-run
//   triggering from ADC noise.
static float readCurrentRMS() {
  double       sumSq = 0.0;
  int          n     = 0;
  unsigned long t0   = millis();

  while (millis() - t0 < 60) {               // 60ms = 3 × 50Hz cycles
    float volt = (analogRead(CT_PIN) / 4095.0f) * 3.3f;
    float ac   = volt - ctBias;               // Subtract DC bias → pure AC component
    sumSq     += (double)(ac * ac);           // Square and accumulate
    n++;
    delayMicroseconds(100);                   // ~10kHz sample rate
  }

  if (!n) return 0.0f;

  float irms = sqrtf((float)(sumSq / (double)n)) * CT_CAL;

  // Log every reading for calibration monitoring. Comment out once calibrated.
  Serial.printf("[CT] Irms=%.4f A  n=%d  bias=%.4f V\n", irms, n, ctBias);

  return (irms < CT_FLOOR_A) ? 0.0f : irms;  // Apply noise floor
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 6 — AJ-SR04M ULTRASONIC SENSORS
// ═══════════════════════════════════════════════════════════════════════

// sort()
// Simple ascending bubble sort used by stableLevel() to find the median.
// Only called on arrays of BUF_SIZE (6) elements — performance is fine.
static void sort(int *a, int n) {
  for (int i = 0; i < n-1; i++)
    for (int j = 0; j < n-i-1; j++)
      if (a[j] > a[j+1]) { int t = a[j]; a[j] = a[j+1]; a[j+1] = t; }
}

// stableLevel()
// Converts a buffer of raw ping distances (cm) into a stable water
// level percentage using a 4-stage filter to reject bad readings.
//
// STAGE 1 — Remove invalid readings:
//   Discard zeros (NewPing timeout = no echo within MAX_DIST_CM) and
//   values above MAX_DIST_CM (stray long-range echoes).
//   If fewer than half the buffer positions hold valid readings,
//   return -1 (sensor error — not enough data to trust).
//
// STAGE 2 — Median selection:
//   Sort the valid readings. Pick the median (middle value).
//   The median is robust against outliers: if one sample is wildly
//   wrong (e.g. echo off a pipe fitting), it ends up at one extreme
//   of the sorted array and the median is unaffected.
//
// STAGE 3 — Tolerance-band average:
//   Average only the readings within ±15cm of the median.
//   This removes any remaining outliers while averaging the good
//   readings together for a smoother result.
//
// STAGE 4 — Distance to percentage:
//   The water height above the tank floor is:
//     waterH = (BLIND_CM + maxDepth) - averageDistance
//   The fill percentage is:
//     pct = (waterH / maxDepth) × 100,  clamped to 0–100
//   BLIND_CM is added to maxDepth because the sensor cannot measure
//   within its own blind zone — the formula accounts for this offset.
//
// Returns 0–100 (fill %) or -1 (sensor error).
static int stableLevel(int *raw, int sz, int maxD) {
  int v[BUF_SIZE], vc = 0;

  // Stage 1: collect valid readings
  for (int i = 0; i < sz; i++)
    if (raw[i] > 0 && raw[i] < MAX_DIST_CM) v[vc++] = raw[i];
  if (vc < sz / 2) return -1;               // Too few valid readings

  // Stage 2: median
  sort(v, vc);
  int med = v[vc / 2];

  // Stage 3: tolerance-band average
  long s = 0; int ac = 0;
  for (int i = 0; i < vc; i++)
    if (abs(v[i] - med) <= 15) { s += v[i]; ac++; }
  if (!ac) return -1;

  // Stage 4: distance → percentage
  float h = (float)(BLIND_CM + maxD) - (float)(s / ac);
  return constrain((int)(h / (float)maxD * 100.0f), 0, 100);
}

// pingSensors()
// THE ONLY PLACE in firmware where the sensors fire.
// Fires the overhead sensor first, waits XTALK_MS (100ms) for the
// 40kHz acoustic energy to fully decay, then fires the underground
// sensor. This prevents crosstalk (see file header for full explanation).
// Called once per SAMPLE_MS (500ms) from the main loop.
static void pingSensors() {
  ohBuf[bufIdx] = ohSonar.ping_cm();  // Step 1: fire overhead sensor
  delay(XTALK_MS);                    // Step 2: 100ms cooldown — mandatory, do not reduce
  ugBuf[bufIdx] = ugSonar.ping_cm(); // Step 3: fire underground sensor
}

// processReadings()
// Called when the rolling buffer is full (every BUF_SIZE × SAMPLE_MS = 3s).
// Applies stableLevel() to each buffer and handles the blind zone fallback.
//
// BLIND ZONE FALLBACK:
//   If stableLevel() returns -1 AND lastGoodOH/UG >= 85%:
//     The sensor is in its dead zone because water is within 25cm of
//     the probe face — the tank is nearly full. Hold last known good
//     value. This prevents reporting a false "sensor error" when the
//     tank is actually healthy and almost full.
//   If stableLevel() returns -1 AND lastGoodOH/UG < 85%:
//     This is a genuine sensor failure (disconnected wire, broken
//     module, flooded sensor). Set level to -1 and update sysStatus.
static void processReadings() {
  int rOH = stableLevel(ohBuf, BUF_SIZE, OH_DEPTH_CM);
  int rUG = stableLevel(ugBuf, BUF_SIZE, UG_DEPTH_CM);

  if (rOH == -1) {
    if (lastGoodOH >= 85) {
      ohLevel = lastGoodOH;                  // Blind zone fallback — tank nearly full
      Serial.println(F("[SNS] OH in blind zone — holding last good value"));
    } else {
      ohLevel = -1;
      strcpy(sysStatus, "Err: O/H Sens");
      Serial.println(F("[SNS] OH sensor ERROR"));
    }
  } else {
    ohLevel = lastGoodOH = rOH;
  }

  if (rUG == -1) {
    if (lastGoodUG >= 85) {
      ugLevel = lastGoodUG;                  // Blind zone fallback
      Serial.println(F("[SNS] UG in blind zone — holding last good value"));
    } else {
      ugLevel = -1;
      strcpy(sysStatus, "Err: U/G Sens");
      Serial.println(F("[SNS] UG sensor ERROR"));
    }
  } else {
    ugLevel = lastGoodUG = rUG;
  }

  Serial.printf("[SNS] OH=%d%%  UG=%d%%\n", ohLevel, ugLevel);
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 7 — PUMP CONTROL + DRY-RUN PROTECTION
// ═══════════════════════════════════════════════════════════════════════

// setPump()
// The ONLY function that controls PUMP_PIN (GPIO 23 → SSR-40DA).
// All pump on/off actions — automation, manual commands, dry run shutdown —
// go through here to ensure the dryRunErr interlock is always enforced
// and pumpOnAt is always correctly recorded.
static void setPump(bool on) {
  if (on && dryRunErr) {
    // Safety interlock: pump is locked out after a dry run error.
    // The app must send RESET_ERROR before the pump can run again.
    Serial.println(F("[PUMP] Start blocked — dry run error active (send RESET_ERROR first)"));
    return;
  }
  if (on && !pumpOn) pumpOnAt = millis();    // Record start time for 3s grace period
  pumpOn = on;
  digitalWrite(PUMP_PIN, on ? RELAY_ON : !RELAY_ON);
  if (!on) { dryPending = false; dryStart = 0; } // Clear dry-run timer when pump stops
  Serial.printf("[PUMP] %s\n", on ? "ON" : "OFF");
}

// checkDryRun()
// Called every 3 seconds while the pump is running (bufIdx wraps around).
// Reads the ZHT103 module and implements the dry-run detection timer.
//
// STARTUP GRACE PERIOD (3 seconds):
//   When a pump first starts it draws variable inrush current while
//   the motor accelerates and primes. During this transient the current
//   may briefly drop below MIN_PUMP_A. To prevent false dry-run trips
//   at startup, dry-run checking is disabled for the first 3 seconds
//   after pumpOnAt is set.
//
// DRY-RUN TIMER:
//   The pump is running but current is between CT_FLOOR_A and MIN_PUMP_A:
//   → Start the dryPending timer on the first such reading.
//   → If current recovers above MIN_PUMP_A: cancel the timer (normal
//     for pumps to have brief current dips during normal operation).
//   → If current stays low for DRY_RUN_MS (45 seconds) continuously:
//     DECLARE DRY RUN — shut pump off, set error flag, publish alert.
//
//   AUTO-RECOVERY (handled in the automation block in loop()):
//   If the underground tank later refills above UG_LOW_PCT + 15% (45%),
//   the error is automatically cleared and the pump can run again.
//   This handles the case where someone manually fills the underground
//   tank while the device is in error state.
static void checkDryRun() {
  if (!pumpOn) return;
  if (millis() - pumpOnAt < 3000) return;    // 3-second startup grace period

  pumpAmps = readCurrentRMS();

  if (pumpAmps > CT_FLOOR_A && pumpAmps < MIN_PUMP_A) {
    // Current is above noise but below the minimum load threshold
    if (!dryPending) {
      dryPending = true;
      dryStart   = millis();
      Serial.printf("[DRY] Low current %.3fA — timer started (45s to dry run)\n", pumpAmps);
    }
    else if (millis() - dryStart >= DRY_RUN_MS) {
      // 45 seconds of sustained low current — declare dry run
      dryRunErr  = true;
      setPump(false);
      strcpy(sysStatus, "Err: Dry Run");
      Serial.println(F("[DRY] *** DRY RUN DECLARED — pump OFF, error flag set ***"));
      if (mqtt.connected()) {
        char alert[96], topic[48];
        snprintf(alert, sizeof(alert),
          "{\"alert\":\"DRY_RUN\",\"device\":\"%s\",\"amps\":%.3f}",
          DEVICE_ID, pumpAmps);
        snprintf(topic, sizeof(topic), "devices/%s/alerts", DEVICE_ID);
        mqtt.publish(topic, alert);          // Publish alert to app
      }
      dryPending = false;
    }
  } else {
    // Current is normal — reset the dry-run timer
    if (dryPending) {
      Serial.printf("[DRY] Current recovered to %.3fA — timer reset\n", pumpAmps);
    }
    dryPending = false;
    dryStart   = 0;
  }
}

// updateLEDs()
// Updates both status LEDs based on current system state.
// Called once per 3-second processing cycle and after every command.
static void updateLEDs() {
  // GREEN ON when: pump is running, OR overhead level is healthy (above low threshold)
  // This gives the user a "system is working normally" signal
  digitalWrite(GREEN_LED,
    (pumpOn || (ohLevel > OH_LOW_PCT && ohLevel != -1)) ? HIGH : LOW);

  // RED ON when: dry run error is active, OR underground level is critically low
  // Either condition alone warrants the warning
  digitalWrite(RED_LED,
    (dryRunErr || (ugLevel != -1 && ugLevel <= UG_LOW_PCT)) ? HIGH : LOW);
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 8 — SERIAL2 → ARDUINO TFT DISPLAY
// ═══════════════════════════════════════════════════════════════════════
//
// Sends a single pipe-delimited line to the Arduino Mega every 3 seconds.
// The Arduino parses this line and updates its TFT display.
//
// FORMAT:  O:{oh}|U:{ug}|P:{ON/OFF}|A:{amps}|S:{status}\n
// EXAMPLE: O:85|U:42|P:ON|A:1.45|S:Auto: Pumping
//   O = overhead fill percentage  (int, -1 = sensor error)
//   U = underground fill percent  (int, -1 = sensor error)
//   P = pump state                (ON or OFF)
//   A = pump current in Amps      (2 decimal places)
//   S = system status string      (max 21 characters)
//
// WIRING REMINDER:
//   GPIO 17 (TX2) → Arduino pin 0 (RX0) | GND → GND | Baud: 9600
static void toArduino() {
  char s[22];
  strncpy(s, sysStatus, 21); s[21] = '\0';   // Truncate to 21 chars + null
  char line[80];
  snprintf(line, sizeof(line), "O:%d|U:%d|P:%s|A:%.2f|S:%s",
           ohLevel, ugLevel, pumpOn ? "ON" : "OFF", pumpAmps, s);
  Serial2.println(line);
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 9 — MQTT COMMUNICATION
// ═══════════════════════════════════════════════════════════════════════
//
// MQTT TOPIC STRUCTURE (scoped by DEVICE_ID):
//   devices/{DEVICE_ID}/data      ← telemetry published every 3s (ESP32 → app)
//   devices/{DEVICE_ID}/commands  ← commands received (app → ESP32)
//   devices/{DEVICE_ID}/alerts    ← critical alerts (ESP32 → app, e.g. dry run)
//   devices/{DEVICE_ID}/status    ← retained "online"/"offline" (Last Will)
//
// MQTT CREDENTIALS:
//   Client ID  = DEVICE_ID    (hardcoded in secrets.h, unique per unit)
//   Username   = hiveUser     (loaded from NVS, customer-entered)
//   Password   = HIVEMQ_PASS  (hardcoded in secrets.h, customer cannot see)
//
// LAST WILL:
//   When this device connects, it registers a Last Will with HiveMQ.
//   If the device disconnects unexpectedly (power cut, network loss),
//   HiveMQ will automatically publish "offline" to the status topic
//   (retained) so the app dashboard shows the correct offline status
//   without waiting for a timeout.

// publishTelemetry()
// Builds a JSON payload with all current system state and publishes
// it to the device's data topic. Called every 3 seconds.
// JSON example:
//   {"thing_id":"HydroSync_001","overhead_level":85,"underground_level":42,
//    "pump_status":true,"pump_current":1.45,"system_status":"Auto: Pumping"}
static void publishTelemetry() {
  StaticJsonDocument<200> doc;               // Stack-allocated, no heap fragmentation
  doc["thing_id"]          = DEVICE_ID;
  doc["overhead_level"]    = ohLevel;
  doc["underground_level"] = ugLevel;
  doc["pump_status"]       = pumpOn;
  doc["pump_current"]      = (int)(pumpAmps * 100) / 100.0f;  // Trim to 2 decimal places
  doc["system_status"]     = sysStatus;

  char buf[MQTT_BUF];
  serializeJson(doc, buf, MQTT_BUF);

  char topic[48];
  snprintf(topic, sizeof(topic), "devices/%s/data", DEVICE_ID);
  mqtt.publish(topic, buf);
}

// onMqttMessage()
// Callback from PubSubClient when a message arrives on the commands topic.
// Implements the Hardware Supreme Rule — safety checks always win.
static void onMqttMessage(char* topic, byte* payload, unsigned int len) {
  StaticJsonDocument<64> doc;
  if (deserializeJson(doc, payload, len)) return;  // Ignore malformed JSON
  const char* cmd = doc["command"];
  if (!cmd) return;

  Serial.printf("[MQTT] Command: %s\n", cmd);

  if (!strcmp(cmd, "PUMP_ON")) {
    // Hardware Supreme Rule: check all safety conditions before allowing start
    if      (dryRunErr)              strcpy(sysStatus, "Locked:DryRun");
    else if (ugLevel == -1)          strcpy(sysStatus, "Err:UG Sens");
    else if (ugLevel > UG_LOW_PCT) { setPump(true); strcpy(sysStatus, "Manual ON"); }
    else                             strcpy(sysStatus, "Err:UG Low");
  }
  else if (!strcmp(cmd, "PUMP_OFF")) {
    setPump(false);                             // PUMP_OFF is always honoured
    strcpy(sysStatus, "Manual OFF");
  }
  else if (!strcmp(cmd, "RESET_ERROR")) {
    dryRunErr  = false;                         // Clear the dry run error flag
    dryPending = false;
    strcpy(sysStatus, "Error Reset");
  }

  // Push updated state to LEDs, TFT, and HiveMQ immediately after command
  updateLEDs();
  toArduino();
  if (mqtt.connected()) publishTelemetry();
}

// mqttConnect()
// Attempts one MQTT connection to HiveMQ Cloud over TLS (port 8883).
//
// RC=-2 GUARD — NTP SYNC CHECK:
//   This guard is the core fix for the MQTT_CONNECT_FAILED (rc=-2) error.
//   See the file header for the full root cause explanation.
//   In short: TLS certificate validation fails if the ESP32 clock shows
//   1970. We check that time(nullptr) > NTP_EPOCH_MIN (Nov 2023) before
//   attempting the connection. If NTP has not synced yet, we skip this
//   attempt and try again in MQTT_RETRY_MS (10 seconds).
//
// KENYA TIMEZONE:
//   configTime(3*3600, 0, ...) in wifiEvent() sets UTC+3 (EAT).
//   time(nullptr) returns Kenya local time. TLS uses UTC internally.
//
// LAST WILL:
//   The 7-argument mqtt.connect() registers a Last Will message.
//   If this device loses power or disconnects unexpectedly, HiveMQ
//   publishes "offline" to the status topic automatically.
static void mqttConnect() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)){
    //1. Check if the internal clock has updated from the internet (NTP sync)
    Serial.println(F("[MQTT] NTP not ready (clock is still 1970).Waiting for internet time . . ."));
    return;
  }

  //2. Log the time so you can verify it's correct int the Serail Monitor
  Serial.print(F("[MQTT] System Time Verified: "));
  Serial.println(asctime(&timeinfo));

  time_t epoch = time(nullptr);

  // NTP sync guard — do not attempt MQTT until clock is valid
  if ((unsigned long)epoch < NTP_EPOCH_MIN) {
    Serial.printf("[MQTT] Waiting for NTP sync (epoch=%lu, need>%lu)\n",
                  (unsigned long)epoch, NTP_EPOCH_MIN);
    return;                                    // Try again in MQTT_RETRY_MS seconds
  }

  Serial.print(F("[MQTT] Connecting to HiveMQ..."));

  char cmdTopic[48], statTopic[48];
  snprintf(cmdTopic,  sizeof(cmdTopic),  "devices/%s/commands", DEVICE_ID);
  snprintf(statTopic, sizeof(statTopic), "devices/%s/status",   DEVICE_ID);

  // connect(clientID, user, pass, willTopic, willQoS, willRetain, willMsg)
  // "offline" will be published by HiveMQ if this client disconnects unexpectedly
  if (mqtt.connect(DEVICE_ID, hiveUser, HIVEMQ_PASS,
                   statTopic, 1, true, "offline")) {
    mqtt.subscribe(cmdTopic, 1);               // Subscribe with QoS 1 (at least once)
    mqtt.publish(statTopic, "online", true);  // Retained — app sees device is online
    Serial.printf(" Connected! [%s]\n", DEVICE_ID);
  } else {
    // rc codes: -4=timeout -3=server unavail -2=TLS fail -1=disconnected
    //            1=bad protocol 2=ID rejected 3=server unavail 4=bad creds 5=unauthorised
    Serial.printf(" FAILED rc=%d (see comment above for rc meaning)\n", mqtt.state());
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 10 — WIFI MANAGEMENT  (non-blocking, no reboots on failure)
// ═══════════════════════════════════════════════════════════════════════
//
// The self-reboot-loop bug from v3.1 was caused by calling ESP.restart()
// when WiFi failed to connect. That reboot incremented a boot counter
// which eventually triggered a factory reset, wiping credentials, causing
// the portal to start again, credentials re-entered, WiFi fails again —
// an infinite loop.
//
// v6.0 fix: WiFi failure NEVER reboots the device. maintainWifi() retries
// silently every WIFI_RETRY_MS (30s). If the router is down, the device
// simply waits and reconnects automatically when the router comes back.

// wifiEvent()
// Registered as an event callback with WiFi.onEvent() in setup().
// Fires when WiFi connects (GOT_IP) or disconnects.
// On connection, immediately starts NTP sync so TLS will work.
static void wifiEvent(WiFiEvent_t e) {
  if (e == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    Serial.printf("[WIFI] Connected! IP = %s\n", WiFi.localIP().toString().c_str());
    // Start NTP immediately after WiFi connects.
    // Kenya time zone: EAT = UTC+3 = 10800 seconds offset.
    // Primary NTP: Africa regional pool (low latency from Kenya).
    // Fallback NTP: global pool (used if Africa pool is unreachable).
    configTime(3 * 3600, 0, "africa.pool.ntp.org", "pool.ntp.org");
    Serial.println(F("[NTP] Time sync started — Africa pool (UTC+3 / EAT)"));
    wifiWaiting = false;
  } else if (e == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    Serial.println(F("[WIFI] Disconnected."));
    wifiWaiting = false;                       // Allow immediate reconnect scheduling
  }
}

// maintainWifi()
// Called every loop() iteration. Fully non-blocking — no delay(), no restart().
// Manages three states:
//   CONNECTED:  nothing to do, return immediately
//   WAITING:    attempt in progress, check if WIFI_WAIT_MS has elapsed
//   IDLE:       schedule new attempt after WIFI_RETRY_MS has elapsed
static void maintainWifi() {
  if (WiFi.status() == WL_CONNECTED) return;  // All good, nothing to do

  if (wifiWaiting) {
    // A WiFi.begin() is already in progress — check for timeout
    if (millis() - wifiWaitAt < WIFI_WAIT_MS) return;   // Still within 15s window
    // 15 seconds elapsed with no IP — give up and schedule a retry
    Serial.println(F("[WIFI] Attempt timed out. Will retry in 30s."));
    WiFi.disconnect(true);
    wifiWaiting = false;
    lastWifiTry = millis();
    return;
  }

  // Not currently waiting — has the retry interval elapsed?
  if (millis() - lastWifiTry < WIFI_RETRY_MS) return;

  // Start a new connection attempt
  Serial.printf("[WIFI] Connecting to: %s\n", wifiSSID);
  WiFi.begin(wifiSSID, wifiPass);
  wifiWaiting = true;
  wifiWaitAt  = millis();
  lastWifiTry = millis();
}

// ═══════════════════════════════════════════════════════════════════════
// SETUP  — runs once on boot
// ═══════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RX2_PIN, TX2_PIN);
  Serial.println(F("\n[BOOT] ─── HydroSync v6.0 ───"));
  Serial.println(F("[BOOT] Kenya | EAT (UTC+3)"));

  // ── SAFETY FIRST: pump relay off before anything else ────────────
  // On some ESP32 boards, uninitialised GPIO can briefly float HIGH
  // at boot before pinMode() is called. If PUMP_PIN floats HIGH, the
  // SSR-40DA will energise and start the pump. This must be the very
  // first action in setup() — before any delay, any Serial print,
  // before any other GPIO is touched.
  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(PUMP_PIN, !RELAY_ON);             // PUMP RELAY OFF immediately

  // ── Other GPIO ───────────────────────────────────────────────────
  pinMode(GREEN_LED, OUTPUT); digitalWrite(GREEN_LED, LOW);
  pinMode(RED_LED,   OUTPUT); digitalWrite(RED_LED,   HIGH); // Red on during boot

  // Reset button: INPUT_PULLUP = GPIO 2 is HIGH by default.
  // Pressing the button connects GPIO 2 to GND → reads LOW.
  pinMode(RST_BTN, INPUT_PULLUP);

  // ── ADC + ZHT103 stabilisation ───────────────────────────────────
  // The ZHT103 op-amp needs ~200–300ms after power-on to settle to
  // the correct DC bias midpoint. Wait 400ms before calibrateBias()
  // to ensure a stable and accurate baseline measurement.
  delay(400);

  // ── NVS credential check ─────────────────────────────────────────
  // If credentials are not found (first boot or after factory reset),
  // start the captive portal. startPortal() never returns — it loops
  // until the customer submits the form, which reboots inside onSave().
  if (!loadCreds()) {
    digitalWrite(RED_LED, LOW);
    startPortal();                               // ← blocks forever, then reboots
  }

  // ── Normal startup path (credentials exist) ──────────────────────
  Serial.println(F("[BOOT] Credentials loaded — starting normal operation"));
  digitalWrite(RED_LED, LOW);

  // Calibrate ZHT103 DC bias with pump guaranteed OFF (set above)
  calibrateBias();

  // ── WiFi ─────────────────────────────────────────────────────────
  WiFi.mode(WIFI_STA);
  WiFi.onEvent(wifiEvent);                       // Register connect/disconnect callback
  Serial.printf("[WIFI] Starting connection to: %s\n", wifiSSID);
  WiFi.begin(wifiSSID, wifiPass);
  wifiWaiting = true;
  wifiWaitAt  = millis();
  lastWifiTry = millis();
  // WiFi continues in the background. MQTT will connect once WiFi is up
  // and NTP has synced (checked inside mqttConnect()).

  // ── TLS + MQTT ───────────────────────────────────────────────────
  // setCACert: provides the ISRG Root X1 certificate (from secrets.h)
  // so mbedTLS can verify HiveMQ's server certificate chain.
  // Without this, TLS would accept no certificates (or worse, all of them).
  //tlsSock.setCACert(HIVEMQ_ROOT_CA);
  // We use setInsecure() to bypass strict certificate date/RootCA validation
  // while keeping the payload fully encrypted.
  tlsSock.setInsecure();
  mqtt.setServer(HIVEMQ_HOST, 8883);             // Port 8883 = MQTT over TLS
  mqtt.setCallback(onMqttMessage);               // Register incoming message handler
  mqtt.setBufferSize(MQTT_BUF);                  // 512 bytes for all payload sizes
  mqtt.setKeepAlive(60);                         // Send MQTT PING every 60s

  toArduino();                                   // Send initial state to TFT display
  Serial.printf("[BOOT] Ready. DevID=%s\n", DEVICE_ID);
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN LOOP  — runs continuously
// ═══════════════════════════════════════════════════════════════════════
//
// Cooperative multitasking using millis() timers.
// No blocking calls longer than 1ms appear in this function.
// Execution order each iteration:
//   1. checkSerial()      — handle USB Serial commands (fast, no delay)
//   2. checkResetButton() — poll GPIO 2, track hold time (fast, no delay)
//   3. maintainWifi()     — non-blocking WiFi state machine (no delay)
//   4. MQTT management    — connect if needed, call mqtt.loop() if connected
//   5. Sensor sampling    — every 500ms: fire both sensors sequentially
//   6. Buffer processing  — every 3s: compute levels, check dry run, automation
void loop() {
  unsigned long now = millis();

  // ── Always-active (every iteration) ──────────────────────────────
  checkSerial();                                 // RESET_NVS / STATUS via USB Serial
  checkResetButton();                            // Factory reset via GPIO 2 button hold
  maintainWifi();                                // WiFi reconnect management (never reboots)

  // ── MQTT (only when WiFi is connected) ───────────────────────────
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) {
      if (now - lastMqttTry > MQTT_RETRY_MS) {
        lastMqttTry = now;
        mqttConnect();                           // Includes NTP sync guard → no rc=-2
      }
    } else {
      mqtt.loop();  // MUST be called every loop iteration.
                    // Processes incoming messages (fires onMqttMessage callback)
                    // and sends MQTT PINGREQ keepalives to maintain the connection.
                    // If not called frequently, the HiveMQ broker will disconnect
                    // the client after the keepalive timeout (60 seconds).
    }
  }

  // ── Sensor sampling every SAMPLE_MS (500ms) ──────────────────────
  if (now - lastSample > SAMPLE_MS) {
    lastSample = now;

    pingSensors();                               // Fire OH sensor, wait 100ms, fire UG sensor
    bufIdx++;

    // ── Buffer full — 3-second processing block ──────────────────
    if (bufIdx >= BUF_SIZE) {
      bufIdx = 0;

      // A: Calculate stable tank levels from 6-sample rolling buffers
      processReadings();

      // B: Read pump current and check for dry run (pump must be ON)
      if (pumpOn) checkDryRun();
      else pumpAmps = 0.0f;                      // Zero displayed current when pump is off

      // C: Auto-recovery — clear dry run error if underground tank has recovered
      //    Tank must exceed UG_LOW_PCT + 15 = 45% to confirm it has genuinely refilled
      if (dryRunErr && ugLevel != -1 && ugLevel > UG_LOW_PCT + 15) {
        dryRunErr = false;
        strcpy(sysStatus, "Recovered");
        Serial.println(F("[AUTO] Dry run error cleared — underground tank has recovered"));
      }

      // D: Automation logic
      //    Only execute when both sensor readings are valid (not -1)
      if (!dryRunErr && ohLevel != -1 && ugLevel != -1) {

        if (!pumpOn && ohLevel < OH_LOW_PCT && ugLevel > UG_LOW_PCT) {
          // Overhead below 60% AND underground above 30% → start pump automatically
          setPump(true);
          strcpy(sysStatus, "Auto: Pumping");

        } else if (pumpOn &&
                   (ohLevel >= OH_HIGH_PCT || ugLevel <= UG_LOW_PCT)) {
          // Overhead reached 96% (full) OR underground dropped to 30% (empty) → stop
          setPump(false);
          strcpy(sysStatus, ohLevel >= OH_HIGH_PCT ? "Auto: O/H Full" : "Auto: U/G Low");

        } else if (!pumpOn && strcmp(sysStatus, "Initializing") == 0) {
          // First valid reading after boot — device is operational
          strcpy(sysStatus, "System Ready");
        }
      }

      // E: Update all outputs simultaneously every 3 seconds
      updateLEDs();                              // Update green and red LEDs
      toArduino();                               // Send pipe-delimited string to TFT
      if (mqtt.connected()) publishTelemetry();  // Publish JSON telemetry to HiveMQ
    }
  }
}
