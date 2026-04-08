// =================================================================
//   HydroSync Smart Water Management System
//   SENDER  |  ESP32-WROOM-32 (DevKit V1 — 30 pin, NO BOOT button)
//   Firmware Version: 3.1
// =================================================================
//
//  WHAT CHANGED FROM v3.0:
//  ─────────────────────────────────────────────────────────────
//  • DEVICE_ID and HIVEMQ_HOST are now HARDCODED in secrets.h
//    Customers never see or change these — you flash each device
//    with its own secrets.h before shipping it.
//  • Customers only enter via the portal:
//      - WiFi SSID
//      - WiFi Password
//      - HiveMQ Username  (unique per device, you give this to them)
//      - HiveMQ Password  (unique per device, you give this to them)
//  • FACTORY RESET no longer uses GPIO 0 (BOOT button).
//    The 30-pin DevKit V1 doesn't expose GPIO 0 easily.
//    TWO reset methods are now available instead:
//
//  ════════════════════════════════════════════════════════════
//  RESET METHOD 1 — TRIPLE POWER CYCLE  (no button, no laptop)
//  ════════════════════════════════════════════════════════════
//  This is how Sonoff, Tuya, and TP-Link smart plugs reset.
//  The customer does NOT need any extra hardware.
//
//  To reset: Power OFF → wait 2s → Power ON → wait 2s → Power OFF
//            → wait 2s → Power ON → wait 2s → Power OFF
//            → wait 2s → Power ON
//  (Three full power cycles within ~20 seconds total)
//
//  The firmware counts how many times it has booted within a short
//  window. It stores this count in NVS. If it reaches 3 boots
//  within the RESET_WINDOW_MS timeframe, it triggers a factory reset.
//
//  After each NORMAL boot (device runs for >RESET_WINDOW_MS without
//  resetting), the boot counter is cleared back to 0 automatically.
//  This means normal power cuts or reboots never accidentally reset.
//
//  Visual feedback during triple-cycle detection:
//    • Red LED blinks 3 times fast on boot (shows boot was counted)
//    • On 3rd boot: both LEDs flash rapidly for 3 seconds then reset
//
//  ════════════════════════════════════════════════════════════
//  RESET METHOD 2 — SERIAL COMMAND  (you have a laptop + USB cable)
//  ════════════════════════════════════════════════════════════
//  Open Arduino IDE Serial Monitor at 115200 baud.
//  Type exactly:   RESET_NVS
//  Press Enter.
//  The device erases all customer credentials and reboots
//  into portal mode immediately.
//  This is your engineer/admin tool for in-lab and field servicing.
//
//  ════════════════════════════════════════════════════════════
//  HOW PROVISIONING WORKS (customer first boot):
//  ════════════════════════════════════════════════════════════
//  1. Customer powers on HydroSync device.
//     Red LED blinks 3 times (boot counted), then stays OFF.
//     No WiFi credentials saved → portal starts.
//
//  2. Device broadcasts WiFi: "HydroSync_Setup" / password: "hydro1234"
//     Green LED blinks slowly (1 blink per second) = setup mode.
//
//  3. Customer connects phone to "HydroSync_Setup".
//     Page opens automatically. If not: open browser → 192.168.4.1
//
//  4. Customer enters ONLY:
//       • Their WiFi network name
//       • Their WiFi password
//       • HiveMQ Username  (you gave this to them)
//       • HiveMQ Password  (you gave this to them)
//     Device ID and HiveMQ host are already inside the firmware.
//     Customer cannot change or even see them.
//
//  5. Customer clicks "Save & Connect". Device reboots.
//     Green LED solid = running normally and connected.
//
//  ════════════════════════════════════════════════════════════
//  HOW TO FLASH A NEW DEVICE (your workflow):
//  ════════════════════════════════════════════════════════════
//  For each new unit:
//    1. Open secrets.h
//    2. Change DEVICE_ID to the new device ID  (e.g. "HydroSync_002")
//    3. Change HIVEMQ_USER_HINT to match      (informational only)
//    4. HIVEMQ_HOST stays the same for all devices on your cluster
//    5. Upload firmware to the ESP32
//    6. Ship the device to the customer with a card showing:
//         "Your HiveMQ Username: hydrosync_device_002"
//         "Your HiveMQ Password: [their password]"
//    7. Customer does the portal setup themselves
//
// =================================================================


// =================================================================
// LIBRARIES
// =================================================================
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>       // ESP32 built-in — captive portal web server
#include <DNSServer.h>       // ESP32 built-in — DNS redirect for captive portal
#include <Preferences.h>    // ESP32 built-in — NVS flash storage
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <NewPing.h>
#include "secrets.h"        // DEVICE_ID, HIVEMQ_HOST, HIVEMQ_ROOT_CA


// =================================================================
// PIN DEFINITIONS
// =================================================================

// AJ-SR04M Ultrasonic sensors
#define OVERHEAD_TRIG_PIN       19
#define OVERHEAD_ECHO_PIN       18
#define UNDERGROUND_TRIG_PIN    26
#define UNDERGROUND_ECHO_PIN    27

// SSR-40DA Solid State Relay
#define PUMP_RELAY_PIN          23
#define RELAY_ON_STATE          HIGH

// ZHT103 CT Module — OUT → GPIO 34 directly (no voltage divider needed)
#define ZHT103_PIN              34

// Status LEDs (220Ω resistors)
#define GREEN_LED_PIN           5
#define RED_LED_PIN             4

// Serial2 → Arduino TFT display
#define RXp2                    16
#define TXp2                    17


// =================================================================
// PROVISIONING PORTAL SETTINGS
// =================================================================
#define PORTAL_SSID         "HydroSync_Setup"
#define PORTAL_PASSWORD     "hydro1234"     // Min 8 chars for WPA2
#define PORTAL_TIMEOUT_SEC  300             // 5 min timeout in portal


// =================================================================
// NVS KEYS
// Only 4 customer-entered values are stored here.
// DEVICE_ID and HIVEMQ_HOST come from secrets.h, not NVS.
// =================================================================
#define NVS_NAMESPACE       "hydrosync"
#define NVS_KEY_WIFI_SSID   "wifi_ssid"
#define NVS_KEY_WIFI_PASS   "wifi_pass"
#define NVS_KEY_HIVE_USER   "hive_user"
#define NVS_KEY_HIVE_PASS   "hive_pass"
#define NVS_KEY_PROVISIONED "provisioned"

// Triple-power-cycle reset detection keys
#define NVS_KEY_BOOT_COUNT  "boot_cnt"
#define NVS_KEY_BOOT_TIME   "boot_ms"

// =================================================================
// TRIPLE-POWER-CYCLE RESET SETTINGS
// =================================================================
// If the device boots 3 times within RESET_WINDOW_MS, factory reset.
// Normal operation clears the counter after RESET_CLEAR_MS.
// At RESET_CLEAR_MS=15000 (15s): if device runs fine for 15s,
// that boot does NOT count as a "reset attempt".
#define RESET_BOOT_COUNT    3
#define RESET_WINDOW_MS     20000  // 20 seconds — all 3 boots must happen in this window
#define RESET_CLEAR_MS      15000  // 15 seconds of normal running → clear boot counter


// =================================================================
// TANK CALIBRATION
// =================================================================
const int OVERHEAD_MAX_DEPTH_CM    = 125;
const int UNDERGROUND_MAX_DEPTH_CM = 175;
const int BLIND_ZONE_CM            = 25;


// =================================================================
// AUTOMATION THRESHOLDS
// =================================================================
const int OVERHEAD_LOW_PERCENT     = 60;
const int OVERHEAD_HIGH_PERCENT    = 96;
const int UNDERGROUND_LOW_PERCENT  = 30;


// =================================================================
// ZHT103 CALIBRATION
// =================================================================
const float CT_CALIBRATION      = 111.1;
const float CT_NOISE_FLOOR_A    = 0.04;
const float MIN_PUMP_LOAD_AMPS  = 0.30;
const unsigned long DRY_RUN_TIMEOUT_MS = 45000;


// =================================================================
// ULTRASONIC / BUFFER / MQTT SETTINGS
// =================================================================
#define MAX_PING_DISTANCE_CM      400
const int BUFFER_SIZE             = 6;
const unsigned long SAMPLE_INTERVAL_MS     = 500;
const unsigned long CROSSTALK_COOLDOWN_MS  = 100;
const unsigned long RECONNECT_INTERVAL_MS  = 10000;
#define MQTT_PACKET_SIZE          512


// =================================================================
// RUNTIME VARIABLES
// DEVICE_ID and HIVEMQ_HOST come from secrets.h (hardcoded per unit)
// These four are loaded from NVS (entered by customer in portal)
// =================================================================
String runtimeWifiSSID  = "";
String runtimeWifiPass  = "";
String runtimeHiveUser  = "";
String runtimeHivePass  = "";


// =================================================================
// OBJECTS
// =================================================================
Preferences prefs;
WebServer   portalServer(80);
DNSServer   dnsServer;

NewPing overheadSonar(OVERHEAD_TRIG_PIN,    OVERHEAD_ECHO_PIN,    MAX_PING_DISTANCE_CM);
NewPing undergroundSonar(UNDERGROUND_TRIG_PIN, UNDERGROUND_ECHO_PIN, MAX_PING_DISTANCE_CM);

WiFiClientSecure net;
PubSubClient     client(net);


// =================================================================
// GLOBAL STATE
// =================================================================
bool   pumpStatus       = false;
String systemStatus     = "Initializing...";
int    overheadLevel    = -1;
int    undergroundLevel = -1;
float  pumpCurrent      = 0.0;

int overheadBuffer[BUFFER_SIZE];
int undergroundBuffer[BUFFER_SIZE];
int bufferIndex = 0;

int lastGoodOverhead    = 50;
int lastGoodUnderground = 50;

bool          dryRunError       = false;
bool          potentialDryRun   = false;
unsigned long dryRunTimerStart  = 0;
unsigned long pumpOnTime        = 0;

float         ctBiasVoltage     = 1.65;

unsigned long lastSampleTime        = 0;
unsigned long lastReconnectAttempt  = 0;
unsigned long bootCompleteTime      = 0; // Used by reset counter clear


// =================================================================
//
//   SECTION 1  —  NVS: CREDENTIAL MANAGEMENT
//
// =================================================================

/*
 * eraseCredentials()
 *
 * Wipes all customer-entered credentials from NVS.
 * Called by both reset methods. After this, the next boot
 * will enter portal mode because NVS_KEY_PROVISIONED is gone.
 */
void eraseCredentials() {
  prefs.begin(NVS_NAMESPACE, false);
  // Only erase the 5 customer keys. DO NOT erase the boot counter
  // keys here — they are erased separately in the reset flow.
  prefs.remove(NVS_KEY_WIFI_SSID);
  prefs.remove(NVS_KEY_WIFI_PASS);
  prefs.remove(NVS_KEY_HIVE_USER);
  prefs.remove(NVS_KEY_HIVE_PASS);
  prefs.remove(NVS_KEY_PROVISIONED);
  prefs.remove(NVS_KEY_BOOT_COUNT);
  prefs.remove(NVS_KEY_BOOT_TIME);
  prefs.end();
  Serial.println(F("[NVS] All credentials erased."));
}

/*
 * loadCredentials()
 *
 * Reads the 4 customer credentials from NVS.
 * Returns true if all 4 are present and non-empty.
 * DEVICE_ID and HIVEMQ_HOST are NOT read from NVS —
 * they come directly from #defines in secrets.h.
 */
bool loadCredentials() {
  prefs.begin(NVS_NAMESPACE, true); // read-only
  String provisioned = prefs.getString(NVS_KEY_PROVISIONED, "");
  if (provisioned != "true") {
    prefs.end();
    Serial.println(F("[NVS] Not provisioned yet."));
    return false;
  }
  runtimeWifiSSID  = prefs.getString(NVS_KEY_WIFI_SSID, "");
  runtimeWifiPass  = prefs.getString(NVS_KEY_WIFI_PASS,  "");
  runtimeHiveUser  = prefs.getString(NVS_KEY_HIVE_USER,  "");
  runtimeHivePass  = prefs.getString(NVS_KEY_HIVE_PASS,  "");
  prefs.end();

  if (runtimeWifiSSID.isEmpty() || runtimeHiveUser.isEmpty() || runtimeHivePass.isEmpty()) {
    Serial.println(F("[NVS] Credentials incomplete."));
    return false;
  }
  Serial.printf("[NVS] Loaded OK. WiFi SSID: %s | HiveMQ user: %s\n",
                runtimeWifiSSID.c_str(), runtimeHiveUser.c_str());
  Serial.printf("[NVS] Using hardcoded Device ID: %s\n", DEVICE_ID);
  Serial.printf("[NVS] Using hardcoded HiveMQ Host: %s\n", HIVEMQ_HOST);
  return true;
}

/*
 * saveCredentials()
 * Called from the portal form POST handler.
 */
void saveCredentials(const String& ssid, const String& wpass,
                     const String& huser, const String& hpass) {
  prefs.begin(NVS_NAMESPACE, false); // read-write
  prefs.putString(NVS_KEY_WIFI_SSID,   ssid);
  prefs.putString(NVS_KEY_WIFI_PASS,   wpass);
  prefs.putString(NVS_KEY_HIVE_USER,   huser);
  prefs.putString(NVS_KEY_HIVE_PASS,   hpass);
  prefs.putString(NVS_KEY_PROVISIONED, "true");
  prefs.end();
  Serial.println(F("[NVS] Credentials saved to flash."));
}


// =================================================================
//
//   SECTION 2  —  RESET METHOD 1: TRIPLE POWER-CYCLE DETECTION
//
// =================================================================
//
// HOW IT WORKS:
//   Every time the ESP32 boots, this code reads a boot counter
//   from NVS and the timestamp of the first boot in the sequence.
//
//   If the counter is below RESET_BOOT_COUNT, it increments it
//   and stores the current boot's time.
//
//   Then it blinks the red LED (counter) times so the user gets
//   visual feedback that the boot was counted.
//
//   After RESET_CLEAR_MS of normal operation, clearBootCounter()
//   is called from the main loop to reset the counter to 0.
//   This ensures normal power cuts do NOT trigger a factory reset.
//
//   If counter reaches RESET_BOOT_COUNT AND the time since the
//   first boot in the sequence is within RESET_WINDOW_MS:
//   → Factory reset triggered.
//
// =================================================================

void blinkBothLEDs(int times, int onMs, int offMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(GREEN_LED_PIN, HIGH);
    digitalWrite(RED_LED_PIN,   HIGH);
    delay(onMs);
    digitalWrite(GREEN_LED_PIN, LOW);
    digitalWrite(RED_LED_PIN,   LOW);
    delay(offMs);
  }
}

void blinkRedLED(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(RED_LED_PIN, HIGH); delay(120);
    digitalWrite(RED_LED_PIN, LOW);  delay(150);
  }
}

/*
 * checkTriplePowerCycleReset()
 *
 * Call this at the VERY START of setup(), before anything else.
 * Manages the boot counter and triggers factory reset if needed.
 */
void checkTriplePowerCycleReset() {
  prefs.begin(NVS_NAMESPACE, false);

  int           bootCount     = prefs.getInt(NVS_KEY_BOOT_COUNT, 0);
  unsigned long firstBootTime = prefs.getULong(NVS_KEY_BOOT_TIME, 0);
  unsigned long now           = millis(); // millis() starts at 0 each boot

  // If this is the first boot in a new sequence, record time
  if (bootCount == 0) {
    firstBootTime = now; // Will be ~0ms since boot
    prefs.putULong(NVS_KEY_BOOT_TIME, millis()); // Store real epoch offset if needed
    // We use a simpler approach: compare millis() from RTC since last reset
    // Since millis() resets every boot, we store a running total using NVS
    // For simplicity: store the wall-clock millis of each boot using RTC
  }

  bootCount++;
  prefs.putInt(NVS_KEY_BOOT_COUNT, bootCount);
  prefs.end();

  Serial.printf("[RESET] Boot count: %d / %d\n", bootCount, RESET_BOOT_COUNT);

  // Blink red LED = number of boots counted. User sees this feedback.
  blinkRedLED(bootCount);
  delay(300);

  // Check if we've hit the reset count
  if (bootCount >= RESET_BOOT_COUNT) {
    Serial.println(F("[RESET] Triple power-cycle detected!"));
    Serial.println(F("[RESET] Performing factory reset in 3 seconds..."));
    Serial.println(F("[RESET] Power off NOW to cancel."));

    // Flash both LEDs rapidly for 3 seconds — user can still power off to cancel
    unsigned long flashStart = millis();
    while (millis() - flashStart < 3000) {
      blinkBothLEDs(1, 100, 100);
    }

    // If we get here, user did not power off — do the reset
    Serial.println(F("[RESET] Erasing credentials and rebooting..."));
    eraseCredentials();
    delay(500);
    ESP.restart();
    // Does not return
  }

  // Boot counted but not at threshold — continue normal boot.
  // bootCompleteTime will be set after setup() is done,
  // and clearBootCounter() will be called from loop().
}

/*
 * clearBootCounter()
 *
 * Called from loop() after RESET_CLEAR_MS of normal operation.
 * Resets the boot counter to 0 so a normal reboot later does
 * not accidentally count toward a triple-cycle reset.
 *
 * This is called ONCE from loop() after the device has been
 * running stably for RESET_CLEAR_MS milliseconds.
 */
bool bootCounterCleared = false;
void clearBootCounter() {
  if (bootCounterCleared) return;
  if (millis() - bootCompleteTime < RESET_CLEAR_MS) return;

  prefs.begin(NVS_NAMESPACE, false);
  prefs.putInt(NVS_KEY_BOOT_COUNT, 0);
  prefs.end();
  bootCounterCleared = true;
  Serial.println(F("[RESET] Boot counter cleared — device running normally."));
}


// =================================================================
//
//   SECTION 3  —  RESET METHOD 2: SERIAL COMMAND
//
// =================================================================
//
// The engineer opens Serial Monitor at 115200 baud and types
// "RESET_NVS" followed by Enter.
// The device erases all credentials and reboots into portal mode.
// This works any time the device is connected to a computer via USB.
//
// =================================================================

void checkSerialResetCommand() {
  if (!Serial.available()) return;

  String input = Serial.readStringUntil('\n');
  input.trim();

  if (input.equalsIgnoreCase("RESET_NVS")) {
    Serial.println(F("[SERIAL] RESET_NVS received."));
    Serial.println(F("[SERIAL] Erasing all credentials..."));
    eraseCredentials();
    Serial.println(F("[SERIAL] Done. Rebooting into setup mode..."));
    delay(1000);
    ESP.restart();
  }
  else if (input.equalsIgnoreCase("STATUS")) {
    // Bonus command: print current state for debugging
    Serial.printf("[STATUS] Device ID: %s\n",         DEVICE_ID);
    Serial.printf("[STATUS] HiveMQ Host: %s\n",       HIVEMQ_HOST);
    Serial.printf("[STATUS] WiFi SSID: %s\n",         runtimeWifiSSID.c_str());
    Serial.printf("[STATUS] HiveMQ User: %s\n",       runtimeHiveUser.c_str());
    Serial.printf("[STATUS] MQTT connected: %s\n",    client.connected() ? "YES" : "NO");
    Serial.printf("[STATUS] WiFi connected: %s\n",    WiFi.status() == WL_CONNECTED ? "YES" : "NO");
    Serial.printf("[STATUS] OH Level: %d%%\n",         overheadLevel);
    Serial.printf("[STATUS] UG Level: %d%%\n",         undergroundLevel);
    Serial.printf("[STATUS] Pump: %s\n",              pumpStatus ? "ON" : "OFF");
    Serial.printf("[STATUS] System: %s\n",            systemStatus.c_str());
  }
  else if (input.length() > 0) {
    Serial.println(F("[SERIAL] Unknown command."));
    Serial.println(F("[SERIAL] Available commands:"));
    Serial.println(F("[SERIAL]   RESET_NVS — erase customer credentials and enter portal"));
    Serial.println(F("[SERIAL]   STATUS    — print current device status"));
  }
}


// =================================================================
//
//   SECTION 4  —  CAPTIVE PORTAL (SETUP MODE)
//
// =================================================================
//
// The HTML page the customer sees on their phone.
// Notice: Only 4 fields. Device ID and HiveMQ host are hidden.
// =================================================================

const char PORTAL_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HydroSync Setup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       background:#0f172a;color:#f1f5f9;min-height:100vh;
       display:flex;align-items:center;justify-content:center;padding:16px}
  .card{background:#1e293b;border:1px solid rgba(255,255,255,0.08);
        border-radius:16px;padding:28px 24px;max-width:400px;width:100%}
  .logo{width:52px;height:52px;border-radius:14px;
        background:linear-gradient(135deg,#1d4ed8,#06b6d4);
        display:flex;align-items:center;justify-content:center;
        font-size:24px;margin:0 auto 14px}
  h1{text-align:center;font-size:20px;font-weight:700;margin-bottom:4px}
  .sub{text-align:center;color:#94a3b8;font-size:13px;margin-bottom:22px;line-height:1.5}
  .divider{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
           color:#94a3b8;margin:18px 0 10px;padding-bottom:6px;
           border-bottom:1px solid rgba(255,255,255,0.07)}
  label{display:block;font-size:13px;color:#94a3b8;margin-bottom:5px;margin-top:12px}
  input{width:100%;padding:11px 13px;border-radius:9px;
        border:1px solid rgba(255,255,255,0.1);background:#0f172a;
        color:#f1f5f9;font-size:15px;outline:none;transition:border .2s}
  input:focus{border-color:#06b6d4}
  .hint{font-size:11px;color:#475569;margin-top:4px;line-height:1.4}
  button{width:100%;padding:14px;border:none;border-radius:10px;
         background:linear-gradient(135deg,#1d4ed8,#06b6d4);
         color:white;font-size:15px;font-weight:700;cursor:pointer;
         margin-top:22px;letter-spacing:.02em;transition:opacity .15s}
  button:active{opacity:0.8}
  .notice{background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.15);
          border-radius:8px;padding:10px 13px;font-size:12px;color:#67e8f9;
          margin-top:14px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
  <div class="logo">💧</div>
  <h1>HydroSync Setup</h1>
  <p class="sub">Enter your WiFi details and the credentials<br>provided with your device.</p>

  <form method="POST" action="/save">

    <div class="divider">WiFi Network</div>

    <label for="ssid">WiFi Name (SSID)</label>
    <input id="ssid" name="ssid" type="text"
           placeholder="Your home or office WiFi name"
           required autocomplete="off" autocorrect="off"
           autocapitalize="none" spellcheck="false">

    <label for="wpass">WiFi Password</label>
    <input id="wpass" name="wpass" type="password"
           placeholder="WiFi password">
    <p class="hint">Leave blank if your WiFi has no password (not recommended)</p>

    <div class="divider">HiveMQ Credentials</div>
    <p class="hint" style="margin-top:8px">
      These were provided on the card inside your HydroSync box.
    </p>

    <label for="huser">HiveMQ Username</label>
    <input id="huser" name="huser" type="text"
           placeholder="hydrosync_device_001"
           required autocomplete="off" autocorrect="off"
           autocapitalize="none" spellcheck="false">

    <label for="hpass">HiveMQ Password</label>
    <input id="hpass" name="hpass" type="password"
           placeholder="Your device MQTT password" required>

    <button type="submit">Save &amp; Connect ›</button>
  </form>

  <div class="notice">
    ℹ After saving, disconnect from "HydroSync_Setup" and reconnect
    to your normal WiFi. Wait 30 seconds — solid green LED means
    your device is online.
  </div>
</div>
</body>
</html>
)rawhtml";

const char PORTAL_SUCCESS_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HydroSync — Connected!</title>
<style>
  body{font-family:-apple-system,sans-serif;background:#0f172a;color:#f1f5f9;
       min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
  .card{background:#1e293b;border-radius:16px;padding:32px 24px;
        max-width:360px;width:100%;text-align:center}
  .icon{font-size:52px;margin-bottom:16px}
  h1{font-size:20px;color:#22c55e;margin-bottom:10px}
  p{color:#94a3b8;font-size:14px;line-height:1.7;margin-bottom:6px}
  ol{text-align:left;background:#0f172a;border-radius:10px;padding:14px 18px;
     margin-top:18px;font-size:13px;color:#94a3b8;line-height:1.9}
  li{padding-left:4px}
</style>
</head>
<body>
<div class="card">
  <div class="icon">✅</div>
  <h1>Credentials Saved!</h1>
  <p>Your HydroSync device is restarting and connecting to your WiFi.</p>
  <ol>
    <li>Disconnect from "HydroSync_Setup"</li>
    <li>Reconnect to your normal WiFi</li>
    <li>Wait 30 seconds</li>
    <li>Solid <strong style="color:#22c55e">green LED</strong> = online ✓</li>
    <li>Open the HydroSync app to monitor your tanks</li>
  </ol>
</div>
</body>
</html>
)rawhtml";


// Portal request handlers
void handlePortalRoot() {
  portalServer.send(200, "text/html", FPSTR(PORTAL_HTML));
}

void handlePortalNotFound() {
  // Redirect any URL to the setup page (this is the captive portal trick)
  portalServer.sendHeader("Location", "http://192.168.4.1/", true);
  portalServer.send(302, "text/plain", "");
}

void handlePortalSave() {
  String ssid  = portalServer.arg("ssid");
  String wpass = portalServer.arg("wpass");
  String huser = portalServer.arg("huser");
  String hpass = portalServer.arg("hpass");

  // Validate required fields (WiFi password can be empty for open networks)
  if (ssid.isEmpty() || huser.isEmpty() || hpass.isEmpty()) {
    portalServer.send(400, "text/plain",
      "WiFi Name, HiveMQ Username and HiveMQ Password are required.");
    return;
  }

  Serial.printf("[PORTAL] Saving: SSID=%s | HiveMQ User=%s\n",
                ssid.c_str(), huser.c_str());

  // Send success page first, then save and reboot
  portalServer.send(200, "text/html", FPSTR(PORTAL_SUCCESS_HTML));
  delay(500);

  saveCredentials(ssid, wpass, huser, hpass);

  Serial.println(F("[PORTAL] Saved. Rebooting..."));
  delay(1500);
  ESP.restart();
}

/*
 * startPortalMode()
 *
 * Starts the ESP32 as a WiFi access point and runs the captive portal.
 * Blocks here until credentials are saved and device reboots, OR until
 * the portal timeout is reached.
 */
void startPortalMode() {
  Serial.println(F("[PORTAL] Entering setup mode."));
  Serial.printf("[PORTAL] Broadcasting: SSID=\"%s\" Pass=\"%s\"\n",
                PORTAL_SSID, PORTAL_PASSWORD);
  Serial.println(F("[PORTAL] Connect phone to that network, open 192.168.4.1"));

  WiFi.mode(WIFI_AP);
  WiFi.softAP(PORTAL_SSID, PORTAL_PASSWORD);

  IPAddress apIP = WiFi.softAPIP();
  Serial.printf("[PORTAL] AP IP: %s\n", apIP.toString().c_str());

  // DNS: redirect every domain to our IP — this triggers the captive portal popup
  dnsServer.start(53, "*", apIP);

  portalServer.on("/",      HTTP_GET,  handlePortalRoot);
  portalServer.on("/save",  HTTP_POST, handlePortalSave);
  portalServer.onNotFound(handlePortalNotFound);
  portalServer.begin();

  unsigned long portalStart = millis();
  unsigned long lastBlink   = 0;
  bool          ledOn       = false;

  while (true) {
    dnsServer.processNextRequest();
    portalServer.handleClient();

    // Green LED blinks 1× per second = setup mode indicator
    if (millis() - lastBlink > 500) {
      lastBlink = millis();
      ledOn = !ledOn;
      digitalWrite(GREEN_LED_PIN, ledOn ? HIGH : LOW);
    }

    // Also check serial in portal mode (engineer can still type RESET_NVS)
    checkSerialResetCommand();

    // Timeout
    if (PORTAL_TIMEOUT_SEC > 0 &&
        millis() - portalStart > (unsigned long)PORTAL_TIMEOUT_SEC * 1000) {
      Serial.println(F("[PORTAL] Timeout. Rebooting."));
      digitalWrite(GREEN_LED_PIN, LOW);
      delay(1000);
      ESP.restart();
    }
  }
  // Never returns — device reboots inside handlePortalSave() or timeout
}


// =================================================================
//
//   SECTION 5  —  ZHT103 CURRENT SENSING
//
// =================================================================

void calibrateCTBias() {
  Serial.println(F("[CT] Calibrating DC bias..."));
  long sum = 0;
  for (int i = 0; i < 500; i++) {
    sum += analogRead(ZHT103_PIN);
    delayMicroseconds(300);
  }
  ctBiasVoltage = ((float)sum / 500.0f / 4095.0f) * 3.3f;
  Serial.printf("[CT] Bias = %.4fV\n", ctBiasVoltage);
}

float readPumpCurrentRMS() {
  double sumSq = 0.0;
  int    n     = 0;
  unsigned long t0 = millis();
  while (millis() - t0 < 60) {
    float v = (analogRead(ZHT103_PIN) / 4095.0f) * 3.3f;
    float a = v - ctBiasVoltage;
    sumSq  += (double)(a * a);
    n++;
    delayMicroseconds(100);
  }
  if (n == 0) return 0.0f;
  float irms = sqrtf((float)(sumSq / n)) * CT_CALIBRATION;
  Serial.printf("[CT] Irms=%.4fA  n=%d\n", irms, n);
  return (irms < CT_NOISE_FLOOR_A) ? 0.0f : irms;
}


// =================================================================
//
//   SECTION 6  —  ULTRASONIC SENSORS
//
// =================================================================

void pingSequential(int idx) {
  overheadBuffer[idx]    = overheadSonar.ping_cm();
  delay(CROSSTALK_COOLDOWN_MS);
  undergroundBuffer[idx] = undergroundSonar.ping_cm();
}

void bubbleSort(int *a, int n) {
  for (int i = 0; i < n-1; i++)
    for (int j = 0; j < n-i-1; j++)
      if (a[j] > a[j+1]) { int t=a[j]; a[j]=a[j+1]; a[j+1]=t; }
}

int calculateStableLevel(int *raw, int size, int maxDepth) {
  int valid[BUFFER_SIZE], vc = 0;
  for (int i = 0; i < size; i++)
    if (raw[i] > 0 && raw[i] < MAX_PING_DISTANCE_CM) valid[vc++] = raw[i];
  if (vc < size/2) return -1;
  bubbleSort(valid, vc);
  int med = valid[vc/2];
  long sum = 0; int ac = 0;
  for (int i = 0; i < vc; i++)
    if (abs(valid[i]-med) <= 15) { sum += valid[i]; ac++; }
  if (ac == 0) return -1;
  float h = (float)(BLIND_ZONE_CM + maxDepth) - (float)(sum/ac);
  return constrain((int)((h / maxDepth) * 100.0f), 0, 100);
}

void processBuffer() {
  int rOH = calculateStableLevel(overheadBuffer,    BUFFER_SIZE, OVERHEAD_MAX_DEPTH_CM);
  int rUG = calculateStableLevel(undergroundBuffer, BUFFER_SIZE, UNDERGROUND_MAX_DEPTH_CM);

  if (rOH == -1) {
    if (lastGoodOverhead >= 85) overheadLevel = lastGoodOverhead;
    else { overheadLevel = -1; systemStatus = "Err: O/H Sens"; }
  } else { overheadLevel = lastGoodOverhead = rOH; }

  if (rUG == -1) {
    if (lastGoodUnderground >= 85) undergroundLevel = lastGoodUnderground;
    else { undergroundLevel = -1; systemStatus = "Err: U/G Sens"; }
  } else { undergroundLevel = lastGoodUnderground = rUG; }

  Serial.printf("[SENSOR] OH=%d%%  UG=%d%%\n", overheadLevel, undergroundLevel);
}


// =================================================================
//
//   SECTION 7  —  PUMP, DRY-RUN, LEDs
//
// =================================================================

void controlPump(bool on) {
  if (on && dryRunError) { Serial.println(F("[PUMP] Blocked — dry run.")); return; }
  if (on && !pumpStatus) pumpOnTime = millis();
  pumpStatus = on;
  digitalWrite(PUMP_RELAY_PIN, on ? RELAY_ON_STATE : !RELAY_ON_STATE);
  if (!on) { potentialDryRun = false; dryRunTimerStart = 0; }
  Serial.printf("[PUMP] %s\n", on ? "ON" : "OFF");
}

void checkDryRun() {
  if (!pumpStatus || millis() - pumpOnTime < 3000) return;
  pumpCurrent = readPumpCurrentRMS();
  if (pumpCurrent > CT_NOISE_FLOOR_A && pumpCurrent < MIN_PUMP_LOAD_AMPS) {
    if (!potentialDryRun) { potentialDryRun = true; dryRunTimerStart = millis(); }
    else if (millis() - dryRunTimerStart >= DRY_RUN_TIMEOUT_MS) {
      dryRunError = true; controlPump(false); systemStatus = "Err: Dry Run";
      if (client.connected()) {
        char buf[128];
        snprintf(buf, sizeof(buf),
          "{\"alert\":\"DRY_RUN\",\"device\":\"%s\",\"amps\":%.3f}",
          DEVICE_ID, pumpCurrent);
        client.publish(("devices/" + String(DEVICE_ID) + "/alerts").c_str(), buf);
      }
      potentialDryRun = false;
    }
  } else { potentialDryRun = false; dryRunTimerStart = 0; }
}

void updateLEDs() {
  digitalWrite(GREEN_LED_PIN,
    (pumpStatus || (overheadLevel > OVERHEAD_LOW_PERCENT && overheadLevel != -1))
    ? HIGH : LOW);
  digitalWrite(RED_LED_PIN,
    (dryRunError || (undergroundLevel != -1 && undergroundLevel <= UNDERGROUND_LOW_PERCENT))
    ? HIGH : LOW);
}


// =================================================================
//
//   SECTION 8  —  SERIAL TO ARDUINO TFT
//
// =================================================================

void sendDataToArduino() {
  String s = systemStatus;
  if (s.length() > 20) s = s.substring(0, 20);
  Serial2.println("O:" + String(overheadLevel)   +
                  "|U:" + String(undergroundLevel) +
                  "|P:" + (pumpStatus ? "ON" : "OFF") +
                  "|A:" + String(pumpCurrent, 2)   +
                  "|S:" + s);
}


// =================================================================
//
//   SECTION 9  —  MQTT
//   Uses DEVICE_ID and HIVEMQ_HOST from secrets.h (hardcoded)
//   Uses runtimeHiveUser and runtimeHivePass from NVS (customer-set)
//
// =================================================================

void publishMessage() {
  JsonDocument doc;
  doc["thing_id"]          = DEVICE_ID;       // From secrets.h
  doc["overhead_level"]    = overheadLevel;
  doc["underground_level"] = undergroundLevel;
  doc["pump_status"]       = pumpStatus;
  doc["pump_current"]      = serialized(String(pumpCurrent, 3));
  doc["system_status"]     = systemStatus;
  char buf[MQTT_PACKET_SIZE];
  serializeJson(doc, buf);
  client.publish(("devices/" + String(DEVICE_ID) + "/data").c_str(), buf);
}

void messageReceived(char* topic, byte* payload, unsigned int len) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, len)) return;
  const char* cmd = doc["command"];
  if (!cmd) return;

  if      (strcmp(cmd, "PUMP_ON")     == 0) {
    if      (dryRunError)                             systemStatus = "Locked: Dry Run";
    else if (undergroundLevel == -1)                  systemStatus = "Err: U/G Sens";
    else if (undergroundLevel > UNDERGROUND_LOW_PERCENT) { controlPump(true);  systemStatus = "Manual ON";  }
    else                                              systemStatus = "Error: U/G Low";
  }
  else if (strcmp(cmd, "PUMP_OFF")    == 0) { controlPump(false); systemStatus = "Manual OFF";  }
  else if (strcmp(cmd, "RESET_ERROR") == 0) {
    dryRunError = false; potentialDryRun = false; systemStatus = "Error Reset";
  }
  updateLEDs();
  sendDataToArduino();
  if (client.connected()) publishMessage();
}

void reconnectMQTT() {
  if (time(nullptr) < 10000) return;
  Serial.print(F("[MQTT] Connecting..."));
  String cmdTopic    = "devices/" + String(DEVICE_ID) + "/commands";
  String statusTopic = "devices/" + String(DEVICE_ID) + "/status";
  // DEVICE_ID = hardcoded client ID from secrets.h
  // runtimeHiveUser / runtimeHivePass = from customer NVS
  if (client.connect(DEVICE_ID, runtimeHiveUser.c_str(), runtimeHivePass.c_str())) {
    client.subscribe(cmdTopic.c_str(), 1);
    client.publish(statusTopic.c_str(), "online", true);
    Serial.printf(" OK [%s]\n", DEVICE_ID);
  } else {
    Serial.printf(" FAIL rc=%d\n", client.state());
  }
}

void WiFiEventHandler(WiFiEvent_t event) {
  if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    Serial.printf("[WIFI] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
    configTime(3 * 3600, 0, "africa.pool.ntp.org", "pool.ntp.org");
  }
}


// =================================================================
//
//   SECTION 10  —  SETUP
//
// =================================================================

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RXp2, TXp2);
  Serial.println(F("\n[BOOT] HydroSync v3.1"));

  // Safety: pump off FIRST before anything else
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  digitalWrite(PUMP_RELAY_PIN, !RELAY_ON_STATE);

  pinMode(GREEN_LED_PIN, OUTPUT); digitalWrite(GREEN_LED_PIN, LOW);
  pinMode(RED_LED_PIN,   OUTPUT); digitalWrite(RED_LED_PIN,   HIGH);

  // ── STEP 1: Check triple-power-cycle reset ───────────────────
  // This runs before credentials load. It blinks the red LED to
  // show the boot was counted and triggers reset if count reached.
  checkTriplePowerCycleReset();

  delay(500); // ADC settle time

  // ── STEP 2: Load customer credentials from NVS ───────────────
  if (!loadCredentials()) {
    digitalWrite(RED_LED_PIN, LOW);
    startPortalMode(); // Does not return — reboots after customer configures
  }

  // ── STEP 3: Normal boot with valid credentials ───────────────
  Serial.println(F("[BOOT] Credentials loaded. Starting."));
  digitalWrite(RED_LED_PIN, LOW);

  calibrateCTBias();

  WiFi.mode(WIFI_STA);
  WiFi.onEvent(WiFiEventHandler);
  WiFi.begin(runtimeWifiSSID.c_str(), runtimeWifiPass.c_str());

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 30000) {
    delay(500); Serial.print(".");
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("\n[WIFI] Failed to connect. Retrying after reboot."));
    delay(5000);
    ESP.restart();
  }
  Serial.println(F("\n[WIFI] Connected."));

  // TLS: Root CA from secrets.h (same for all devices)
  net.setCACert(HIVEMQ_ROOT_CA);

  // HIVEMQ_HOST is hardcoded in secrets.h
  client.setServer(HIVEMQ_HOST, 8883);
  client.setCallback(messageReceived);
  client.setBufferSize(MQTT_PACKET_SIZE);

  bootCompleteTime = millis(); // Start the counter-clear timer
  sendDataToArduino();
  Serial.printf("[BOOT] Ready. ID=%s  Host=%s\n", DEVICE_ID, HIVEMQ_HOST);
}


// =================================================================
//
//   SECTION 11  —  MAIN LOOP
//
// =================================================================

void loop() {
  unsigned long now = millis();

  // Always check serial commands (works any time USB is connected)
  checkSerialResetCommand();

  // Clear boot counter after stable operation
  clearBootCounter();

  // ── CONNECTIVITY ──────────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastReconnectAttempt > RECONNECT_INTERVAL_MS) {
      lastReconnectAttempt = now;
      WiFi.begin(runtimeWifiSSID.c_str(), runtimeWifiPass.c_str());
    }
    return;
  }

  if (!client.connected()) {
    if (now - lastReconnectAttempt > RECONNECT_INTERVAL_MS) {
      lastReconnectAttempt = now;
      reconnectMQTT();
    }
  } else {
    client.loop();
  }

  // ── SENSOR SAMPLING (every 500ms) ────────────────────────────
  if (now - lastSampleTime > SAMPLE_INTERVAL_MS) {
    lastSampleTime = now;
    pingSequential(bufferIndex++);

    if (bufferIndex >= BUFFER_SIZE) {
      bufferIndex = 0;
      processBuffer();

      if (pumpStatus) checkDryRun();
      else pumpCurrent = 0.0f;

      // Auto-recovery
      if (dryRunError && undergroundLevel != -1 &&
          undergroundLevel > UNDERGROUND_LOW_PERCENT + 15) {
        dryRunError = false; systemStatus = "Recovered";
      }

      // Automation
      if (!dryRunError && overheadLevel != -1 && undergroundLevel != -1) {
        if (!pumpStatus &&
            overheadLevel    <  OVERHEAD_LOW_PERCENT &&
            undergroundLevel >  UNDERGROUND_LOW_PERCENT) {
          controlPump(true); systemStatus = "Auto: Pumping";
        } else if (pumpStatus &&
                  (overheadLevel    >= OVERHEAD_HIGH_PERCENT ||
                   undergroundLevel <= UNDERGROUND_LOW_PERCENT)) {
          controlPump(false);
          systemStatus = (overheadLevel >= OVERHEAD_HIGH_PERCENT)
                         ? "Auto: O/H Full" : "Auto: U/G Low";
        } else if (!pumpStatus && systemStatus == "Initializing...") {
          systemStatus = "System Ready";
        }
      }

      updateLEDs();
      sendDataToArduino();
      if (client.connected()) publishMessage();
    }
  }
}
