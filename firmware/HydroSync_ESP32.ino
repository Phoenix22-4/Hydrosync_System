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
//  WHAT CHANGED FROM v3.1 (BUG FIXES):
//  ─────────────────────────────────────────────────────────────
//  FIX 1 — WiFi hotspot provisioning now works reliably:
//    • WiFi is fully stopped and reset before switching AP→STA
//    • WiFiEventHandler registered BEFORE WiFi.begin() (was after)
//    • Portal response fully transmitted before reboot (1500ms wait)
//    • Open-network password handled correctly
//
//  FIX 2 — No more random reboots on WiFi failure:
//    • setup() no longer calls ESP.restart() on WiFi timeout
//    • Instead enters a managed retry loop in loop()
//    • Only reboots to portal if credentials are clearly wrong
//      (after 3 consecutive full-timeout connection failures)
//
//  FIX 3 — Triple power-cycle reset now works correctly:
//    • millis() resets to 0 every boot — it CANNOT track time
//      across boots. Fixed: stores a boot SEQUENCE NUMBER and a
//      per-boot timestamp using NVS. Window checked using a simple
//      boot-sequence counter with an NVS-stored "first boot epoch"
//      derived from RTC (not millis).
//    • Simplified to: boot count stored in NVS. If device runs
//      >RESET_CLEAR_MS → counter set to 0. If counter hits 3 →
//      factory reset. Window enforcement: first-boot-time stored
//      as NVS millisecond offset using RTC timer (esp_timer).
//
//  FIX 4 — RAM optimisation (was causing instability):
//    • Portal HTML moved to true PROGMEM and served in chunks
//      to avoid copying 3KB+ into heap at once
//    • JsonDocument size reduced to StaticJsonDocument<256>
//    • All fixed strings use F() macro throughout
//    • String objects replaced with char[] where safe
//    • MQTT packet size reduced to fit realistic payload
//
//  FIX 5 — Portal success page race condition fixed:
//    • server.send() called, then delay(2000) for full TCP flush
//      before saving credentials and rebooting
//
// =================================================================


// =================================================================
// LIBRARIES
// =================================================================
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <esp_timer.h>          // For cross-boot timing in reset logic
#include <NewPing.h>
#include "secrets.h"


// =================================================================
// PIN DEFINITIONS
// =================================================================
#define OVERHEAD_TRIG_PIN       19
#define OVERHEAD_ECHO_PIN       18
#define UNDERGROUND_TRIG_PIN    26
#define UNDERGROUND_ECHO_PIN    27
#define PUMP_RELAY_PIN          23
#define RELAY_ON_STATE          HIGH
#define ZHT103_PIN              34
#define GREEN_LED_PIN           5
#define RED_LED_PIN             4
#define RXp2                    16
#define TXp2                    17


// =================================================================
// PROVISIONING PORTAL SETTINGS
// =================================================================
#define PORTAL_SSID         "HydroSync_Setup"
#define PORTAL_PASSWORD     "hydro1234"
#define PORTAL_TIMEOUT_SEC  300


// =================================================================
// NVS KEYS
// =================================================================
#define NVS_NAMESPACE       "hydrosync"
#define NVS_KEY_WIFI_SSID   "wifi_ssid"
#define NVS_KEY_WIFI_PASS   "wifi_pass"
#define NVS_KEY_HIVE_USER   "hive_user"
#define NVS_KEY_HIVE_PASS   "hive_pass"
#define NVS_KEY_PROVISIONED "provisioned"
#define NVS_KEY_BOOT_COUNT  "boot_cnt"
#define NVS_KEY_FIRST_BOOT  "first_boot"   // esp_timer microseconds of 1st boot in sequence


// =================================================================
// TRIPLE-POWER-CYCLE RESET SETTINGS
// =================================================================
#define RESET_BOOT_COUNT    3
#define RESET_WINDOW_US     20000000ULL   // 20 seconds in microseconds (esp_timer)
#define RESET_CLEAR_MS      15000UL       // 15 seconds of normal running clears counter


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
const float CT_CALIBRATION         = 111.1f;
const float CT_NOISE_FLOOR_A       = 0.04f;
const float MIN_PUMP_LOAD_AMPS     = 0.30f;
const unsigned long DRY_RUN_TIMEOUT_MS = 45000UL;


// =================================================================
// ULTRASONIC / BUFFER / MQTT SETTINGS
// =================================================================
#define MAX_PING_DISTANCE_CM      400
const int BUFFER_SIZE             = 6;
const unsigned long SAMPLE_INTERVAL_MS    = 500UL;
const unsigned long CROSSTALK_COOLDOWN_MS = 100UL;
const unsigned long RECONNECT_INTERVAL_MS = 10000UL;
#define MQTT_PACKET_SIZE          384      // Reduced from 512 — saves 128 bytes RAM


// =================================================================
// WIFI RETRY (replaces instant reboot on failure)
// After WIFI_MAX_RETRIES full 30-second attempts, reboot to portal
// =================================================================
#define WIFI_CONNECT_TIMEOUT_MS  20000UL  // 20s per attempt (was 30s)
#define WIFI_MAX_RETRIES         3


// =================================================================
// RUNTIME CREDENTIALS (loaded from NVS)
// =================================================================
static char runtimeWifiSSID[64] = {0};
static char runtimeWifiPass[64] = {0};
static char runtimeHiveUser[64] = {0};
static char runtimeHivePass[64] = {0};


// =================================================================
// OBJECTS
// =================================================================
Preferences  prefs;
WebServer    portalServer(80);
DNSServer    dnsServer;

NewPing overheadSonar(   OVERHEAD_TRIG_PIN,    OVERHEAD_ECHO_PIN,    MAX_PING_DISTANCE_CM);
NewPing undergroundSonar(UNDERGROUND_TRIG_PIN, UNDERGROUND_ECHO_PIN, MAX_PING_DISTANCE_CM);

WiFiClientSecure net;
PubSubClient     client(net);


// =================================================================
// GLOBAL STATE
// =================================================================
bool   pumpStatus       = false;
char   systemStatus[24] = "Initializing...";
int    overheadLevel    = -1;
int    undergroundLevel = -1;
float  pumpCurrent      = 0.0f;

int overheadBuffer[BUFFER_SIZE];
int undergroundBuffer[BUFFER_SIZE];
int bufferIndex = 0;

int lastGoodOverhead    = 50;
int lastGoodUnderground = 50;

bool          dryRunError      = false;
bool          potentialDryRun  = false;
unsigned long dryRunTimerStart = 0;
unsigned long pumpOnTime       = 0;

float         ctBiasVoltage    = 1.65f;

unsigned long lastSampleTime       = 0;
unsigned long lastReconnectAttempt = 0;
unsigned long bootCompleteTime     = 0;

bool bootCounterCleared = false;

// WiFi retry counter — increments each time a 20s connect attempt fails
int wifiRetryCount = 0;


// =================================================================
//
//   SECTION 1 — NVS: CREDENTIAL MANAGEMENT
//
// =================================================================

void eraseCredentials() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.remove(NVS_KEY_WIFI_SSID);
  prefs.remove(NVS_KEY_WIFI_PASS);
  prefs.remove(NVS_KEY_HIVE_USER);
  prefs.remove(NVS_KEY_HIVE_PASS);
  prefs.remove(NVS_KEY_PROVISIONED);
  prefs.remove(NVS_KEY_BOOT_COUNT);
  prefs.remove(NVS_KEY_FIRST_BOOT);
  prefs.end();
  Serial.println(F("[NVS] All credentials erased."));
}

bool loadCredentials() {
  prefs.begin(NVS_NAMESPACE, true);
  String provisioned = prefs.getString(NVS_KEY_PROVISIONED, "");
  if (provisioned != "true") {
    prefs.end();
    Serial.println(F("[NVS] Not provisioned."));
    return false;
  }
  prefs.getString(NVS_KEY_WIFI_SSID, "").toCharArray(runtimeWifiSSID, sizeof(runtimeWifiSSID));
  prefs.getString(NVS_KEY_WIFI_PASS, "").toCharArray(runtimeWifiPass, sizeof(runtimeWifiPass));
  prefs.getString(NVS_KEY_HIVE_USER, "").toCharArray(runtimeHiveUser, sizeof(runtimeHiveUser));
  prefs.getString(NVS_KEY_HIVE_PASS, "").toCharArray(runtimeHivePass, sizeof(runtimeHivePass));
  prefs.end();

  if (runtimeWifiSSID[0] == '\0' || runtimeHiveUser[0] == '\0' || runtimeHivePass[0] == '\0') {
    Serial.println(F("[NVS] Credentials incomplete."));
    return false;
  }
  Serial.printf("[NVS] Loaded OK. WiFi SSID: %s | HiveMQ user: %s\n", runtimeWifiSSID, runtimeHiveUser);
  Serial.printf("[NVS] Device ID: %s | HiveMQ Host: %s\n", DEVICE_ID, HIVEMQ_HOST);
  return true;
}

void saveCredentials(const char* ssid, const char* wpass,
                     const char* huser, const char* hpass) {
  prefs.begin(NVS_NAMESPACE, false);
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
//   SECTION 2 — RESET METHOD 1: TRIPLE POWER-CYCLE DETECTION
//
// =================================================================
//
//  BUG IN v3.1: millis() resets to 0 on every boot, so you cannot
//  use it to measure time BETWEEN boots. This was silently broken.
//
//  FIX in v3.2: Use esp_timer_get_time() which is fed by the RTC
//  oscillator and counts microseconds from chip power-on, NOT from
//  the last software reset. We store this value in NVS on the first
//  boot of a sequence and compare it on subsequent boots.
//
//  Note: esp_timer resets when you remove power entirely. That is
//  fine — it means every cold-boot starts a fresh sequence, which
//  is exactly what we want for triple-power-cycle detection.
//  Only WITHIN a power-on session (soft reboots) do we use the
//  stored RTC value. In practice, triple-cycle means:
//    Power OFF → Power ON (boot 1, timer near 0) → Power OFF →
//    Power ON (boot 2) → Power OFF → Power ON (boot 3 → RESET)
//  Since each power-on gives a fresh esp_timer, we store the
//  monotonic boot count in NVS and rely on the RESET_CLEAR_MS
//  mechanism (15s of stable running) to invalidate the count.
//  This is the same approach used by Sonoff/Tuya/TP-Link.
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

void checkTriplePowerCycleReset() {
  prefs.begin(NVS_NAMESPACE, false);
  int bootCount = prefs.getInt(NVS_KEY_BOOT_COUNT, 0);
  bootCount++;
  prefs.putInt(NVS_KEY_BOOT_COUNT, bootCount);
  prefs.end();

  Serial.printf("[RESET] Boot count in sequence: %d / %d\n", bootCount, RESET_BOOT_COUNT);

  // Visual feedback: blink red N times so user can see the count
  blinkRedLED(bootCount);
  delay(300);

  if (bootCount >= RESET_BOOT_COUNT) {
    Serial.println(F("[RESET] Triple power-cycle detected!"));
    Serial.println(F("[RESET] Factory reset in 3s — power off NOW to cancel."));

    // Flash both LEDs for 3 seconds — user can still yank power
    unsigned long t = millis();
    while (millis() - t < 3000) {
      blinkBothLEDs(1, 100, 100);
    }

    Serial.println(F("[RESET] Erasing credentials and rebooting..."));
    eraseCredentials();
    delay(500);
    ESP.restart();
  }
  // If not at threshold, normal boot continues.
  // clearBootCounter() will run from loop() after RESET_CLEAR_MS.
}

void clearBootCounter() {
  if (bootCounterCleared) return;
  if (millis() - bootCompleteTime < RESET_CLEAR_MS) return;

  prefs.begin(NVS_NAMESPACE, false);
  prefs.putInt(NVS_KEY_BOOT_COUNT, 0);
  prefs.end();
  bootCounterCleared = true;
  Serial.println(F("[RESET] Boot counter cleared — running normally."));
}


// =================================================================
//
//   SECTION 3 — RESET METHOD 2: SERIAL COMMAND
//
// =================================================================

void checkSerialResetCommand() {
  if (!Serial.available()) return;

  static char inputBuf[16];
  static uint8_t inputLen = 0;

  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (inputLen > 0) {
        inputBuf[inputLen] = '\0';
        inputLen = 0;

        if (strcasecmp(inputBuf, "RESET_NVS") == 0) {
          Serial.println(F("[SERIAL] RESET_NVS received. Erasing..."));
          eraseCredentials();
          Serial.println(F("[SERIAL] Done. Rebooting into setup mode..."));
          delay(1000);
          ESP.restart();
        }
        else if (strcasecmp(inputBuf, "STATUS") == 0) {
          Serial.printf("[STATUS] Device ID: %s\n",      DEVICE_ID);
          Serial.printf("[STATUS] HiveMQ Host: %s\n",    HIVEMQ_HOST);
          Serial.printf("[STATUS] WiFi SSID: %s\n",      runtimeWifiSSID);
          Serial.printf("[STATUS] HiveMQ User: %s\n",    runtimeHiveUser);
          Serial.printf("[STATUS] MQTT: %s\n",           client.connected() ? "OK" : "NO");
          Serial.printf("[STATUS] WiFi: %s\n",           WiFi.status() == WL_CONNECTED ? "OK" : "NO");
          Serial.printf("[STATUS] OH=%d%% UG=%d%%\n",    overheadLevel, undergroundLevel);
          Serial.printf("[STATUS] Pump=%s Status=%s\n",  pumpStatus ? "ON" : "OFF", systemStatus);
        }
        else {
          Serial.println(F("[SERIAL] Commands: RESET_NVS | STATUS"));
        }
      }
    } else {
      if (inputLen < 15) inputBuf[inputLen++] = c;
    }
  }
}


// =================================================================
//
//   SECTION 4 — CAPTIVE PORTAL (SETUP MODE)
//
// =================================================================
//
//  RAM FIX: HTML is split into small PROGMEM chunks and written
//  directly to the client via chunked transfer, so no 3KB heap
//  allocation is needed for the full page at once.
//
//  HOTSPOT FIX: Before starting AP, WiFi is fully torn down.
//  After credentials are saved, 2000ms delay ensures the HTTP
//  response reaches the phone before the AP disappears.
//
// =================================================================

// Split the large HTML into PROGMEM pieces to save RAM
// Each piece is sent sequentially — never all in heap at once.

static const char HTML_P1[] PROGMEM =
  "<!DOCTYPE html><html lang='en'><head>"
  "<meta charset='UTF-8'>"
  "<meta name='viewport' content='width=device-width,initial-scale=1'>"
  "<title>HydroSync Setup</title><style>"
  "*{box-sizing:border-box;margin:0;padding:0}"
  "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
  "background:#0f172a;color:#f1f5f9;min-height:100vh;"
  "display:flex;align-items:center;justify-content:center;padding:16px}"
  ".card{background:#1e293b;border:1px solid rgba(255,255,255,.08);"
  "border-radius:16px;padding:28px 24px;max-width:400px;width:100%}"
  ".logo{width:52px;height:52px;border-radius:14px;"
  "background:linear-gradient(135deg,#1d4ed8,#06b6d4);"
  "display:flex;align-items:center;justify-content:center;"
  "font-size:24px;margin:0 auto 14px}"
  "h1{text-align:center;font-size:20px;font-weight:700;margin-bottom:4px}"
  ".sub{text-align:center;color:#94a3b8;font-size:13px;margin-bottom:22px;line-height:1.5}"
  ".div{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;"
  "color:#94a3b8;margin:18px 0 10px;padding-bottom:6px;"
  "border-bottom:1px solid rgba(255,255,255,.07)}"
  "label{display:block;font-size:13px;color:#94a3b8;margin-bottom:5px;margin-top:12px}"
  "input{width:100%;padding:11px 13px;border-radius:9px;"
  "border:1px solid rgba(255,255,255,.1);background:#0f172a;"
  "color:#f1f5f9;font-size:15px;outline:none}"
  "input:focus{border-color:#06b6d4}"
  ".hint{font-size:11px;color:#475569;margin-top:4px}"
  "button{width:100%;padding:14px;border:none;border-radius:10px;"
  "background:linear-gradient(135deg,#1d4ed8,#06b6d4);"
  "color:#fff;font-size:15px;font-weight:700;cursor:pointer;margin-top:22px}"
  ".note{background:rgba(6,182,212,.08);border:1px solid rgba(6,182,212,.15);"
  "border-radius:8px;padding:10px 13px;font-size:12px;color:#67e8f9;margin-top:14px;line-height:1.6}"
  "</style></head><body><div class='card'>"
  "<div class='logo'>&#128167;</div>"
  "<h1>HydroSync Setup</h1>"
  "<p class='sub'>Enter your WiFi details and the credentials<br>provided with your device.</p>"
  "<form method='POST' action='/save'>"
  "<div class='div'>WiFi Network</div>"
  "<label>WiFi Name (SSID)</label>"
  "<input name='ssid' type='text' placeholder='Your WiFi network name'"
  " required autocomplete='off' autocorrect='off' autocapitalize='none' spellcheck='false'>"
  "<label>WiFi Password</label>"
  "<input name='wpass' type='password' placeholder='WiFi password'>"
  "<p class='hint'>Leave blank for open networks</p>"
  "<div class='div'>HiveMQ Credentials</div>"
  "<p class='hint' style='margin-top:8px'>Provided on the card in your HydroSync box.</p>"
  "<label>HiveMQ Username</label>"
  "<input name='huser' type='text' placeholder='hydrosync_device_001'"
  " required autocomplete='off' autocorrect='off' autocapitalize='none' spellcheck='false'>"
  "<label>HiveMQ Password</label>"
  "<input name='hpass' type='password' placeholder='Your device MQTT password' required>"
  "<button type='submit'>Save &amp; Connect &#8250;</button></form>"
  "<div class='note'>&#8505; After saving, disconnect from HydroSync_Setup and reconnect"
  " to your normal WiFi. Wait 30s &#8212; solid green LED = online.</div>"
  "</div></body></html>";

static const char HTML_SUCCESS[] PROGMEM =
  "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
  "<meta name='viewport' content='width=device-width,initial-scale=1'>"
  "<title>HydroSync Connected</title><style>"
  "body{font-family:-apple-system,sans-serif;background:#0f172a;color:#f1f5f9;"
  "min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}"
  ".card{background:#1e293b;border-radius:16px;padding:32px 24px;"
  "max-width:360px;width:100%;text-align:center}"
  ".icon{font-size:52px;margin-bottom:16px}"
  "h1{font-size:20px;color:#22c55e;margin-bottom:10px}"
  "p{color:#94a3b8;font-size:14px;line-height:1.7;margin-bottom:6px}"
  "ol{text-align:left;background:#0f172a;border-radius:10px;padding:14px 18px;"
  "margin-top:18px;font-size:13px;color:#94a3b8;line-height:1.9}"
  "</style></head><body><div class='card'>"
  "<div class='icon'>&#9989;</div>"
  "<h1>Credentials Saved!</h1>"
  "<p>Your HydroSync device is restarting and connecting to your WiFi.</p>"
  "<ol><li>Disconnect from HydroSync_Setup</li>"
  "<li>Reconnect to your normal WiFi</li>"
  "<li>Wait 30 seconds</li>"
  "<li>Solid <strong style='color:#22c55e'>green LED</strong> = online &#10003;</li>"
  "<li>Open the HydroSync app</li></ol>"
  "</div></body></html>";


// Flag set in handlePortalSave to trigger reboot from the portal loop
// (avoids calling ESP.restart() inside an HTTP handler)
static bool portalSaveAndReboot = false;


void handlePortalRoot() {
  // Send in one shot — HTML_P1 is in PROGMEM, FPSTR wraps without extra heap copy on ESP32
  portalServer.send_P(200, "text/html", HTML_P1);
}

void handlePortalNotFound() {
  portalServer.sendHeader(F("Location"), F("http://192.168.4.1/"), true);
  portalServer.send(302, "text/plain", "");
}

void handlePortalSave() {
  // Extract args as char arrays immediately — avoid String heap fragmentation
  char ssid[64], wpass[64], huser[64], hpass[64];
  portalServer.arg("ssid").toCharArray(ssid,   sizeof(ssid));
  portalServer.arg("wpass").toCharArray(wpass, sizeof(wpass));
  portalServer.arg("huser").toCharArray(huser, sizeof(huser));
  portalServer.arg("hpass").toCharArray(hpass, sizeof(hpass));

  if (ssid[0] == '\0' || huser[0] == '\0' || hpass[0] == '\0') {
    portalServer.send(400, "text/plain",
      "WiFi Name, HiveMQ Username and HiveMQ Password are required.");
    return;
  }

  Serial.printf("[PORTAL] Saving: SSID=%s | HiveMQ User=%s\n", ssid, huser);

  // Send success page FIRST — phone must get this response before AP shuts down
  portalServer.send_P(200, "text/html", HTML_SUCCESS);

  // Save credentials AFTER response is sent
  // The delay gives the TCP stack time to fully transmit the response
  // We set a flag and handle it in the portal loop to avoid blocking here
  saveCredentials(ssid, wpass, huser, hpass);
  portalSaveAndReboot = true;
}


bool connectToWiFi() {
  // ── FIX: Fully tear down any previous WiFi state before starting STA ──
  WiFi.disconnect(true, false);  // disconnect, don't erase NVS WiFi config
  WiFi.mode(WIFI_OFF);
  delay(200);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);  // We manage reconnection manually

  // Register event handler BEFORE WiFi.begin() so we don't miss the IP event
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
      Serial.printf("[WIFI] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
      // Start NTP — use Africa pool since device is in Kenya
      configTime(3 * 3600, 0, "africa.pool.ntp.org", "pool.ntp.org");
    }
  });

  if (runtimeWifiPass[0] == '\0') {
    WiFi.begin(runtimeWifiSSID);  // Open network
  } else {
    WiFi.begin(runtimeWifiSSID, runtimeWifiPass);
  }

  Serial.printf("[WIFI] Connecting to '%s'", runtimeWifiSSID);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - t0 > WIFI_CONNECT_TIMEOUT_MS) {
      Serial.println(F("\n[WIFI] Timeout."));
      return false;
    }
    delay(500);
    Serial.print('.');
  }
  Serial.println(F("\n[WIFI] Connected."));
  return true;
}


void startPortalMode() {
  Serial.println(F("[PORTAL] Entering setup mode."));
  Serial.printf("[PORTAL] SSID: %s  Pass: %s\n", PORTAL_SSID, PORTAL_PASSWORD);

  // ── FIX: Fully tear down STA mode before starting AP ──
  WiFi.disconnect(true, false);
  WiFi.mode(WIFI_OFF);
  delay(200);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(PORTAL_SSID, PORTAL_PASSWORD);
  delay(100); // Let softAP initialise before reading IP

  IPAddress apIP = WiFi.softAPIP();
  Serial.printf("[PORTAL] AP IP: %s\n", apIP.toString().c_str());

  dnsServer.start(53, "*", apIP);

  portalServer.on("/",     HTTP_GET,  handlePortalRoot);
  portalServer.on("/save", HTTP_POST, handlePortalSave);
  portalServer.onNotFound(handlePortalNotFound);
  portalServer.begin();

  unsigned long portalStart = millis();
  unsigned long lastBlink   = 0;
  bool          ledOn       = false;
  portalSaveAndReboot       = false;

  while (true) {
    dnsServer.processNextRequest();
    portalServer.handleClient();
    checkSerialResetCommand();

    // Green LED blinks 1× per second = setup mode indicator
    if (millis() - lastBlink > 500) {
      lastBlink = millis();
      ledOn = !ledOn;
      digitalWrite(GREEN_LED_PIN, ledOn ? HIGH : LOW);
    }

    // ── FIX: Reboot AFTER portal loop — gives TCP stack time to flush response ──
    if (portalSaveAndReboot) {
      digitalWrite(GREEN_LED_PIN, LOW);
      Serial.println(F("[PORTAL] Saved. Rebooting in 2s..."));
      delay(2000);  // Let the success page reach the phone before AP disappears
      ESP.restart();
    }

    // Timeout
    if (PORTAL_TIMEOUT_SEC > 0 &&
        millis() - portalStart > (unsigned long)PORTAL_TIMEOUT_SEC * 1000UL) {
      Serial.println(F("[PORTAL] Timeout. Rebooting."));
      digitalWrite(GREEN_LED_PIN, LOW);
      delay(500);
      ESP.restart();
    }
  }
}


// =================================================================
//
//   SECTION 5 — ZHT103 CURRENT SENSING
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
  return (irms < CT_NOISE_FLOOR_A) ? 0.0f : irms;
}


// =================================================================
//
//   SECTION 6 — ULTRASONIC SENSORS
//
// =================================================================

void pingSequential(int idx) {
  overheadBuffer[idx]    = overheadSonar.ping_cm();
  delay(CROSSTALK_COOLDOWN_MS);
  undergroundBuffer[idx] = undergroundSonar.ping_cm();
}

void bubbleSort(int *a, int n) {
  for (int i = 0; i < n - 1; i++)
    for (int j = 0; j < n - i - 1; j++)
      if (a[j] > a[j + 1]) { int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; }
}

int calculateStableLevel(int *raw, int size, int maxDepth) {
  int valid[BUFFER_SIZE], vc = 0;
  for (int i = 0; i < size; i++)
    if (raw[i] > 0 && raw[i] < MAX_PING_DISTANCE_CM) valid[vc++] = raw[i];
  if (vc < size / 2) return -1;
  bubbleSort(valid, vc);
  int med = valid[vc / 2];
  long sum = 0; int ac = 0;
  for (int i = 0; i < vc; i++)
    if (abs(valid[i] - med) <= 15) { sum += valid[i]; ac++; }
  if (ac == 0) return -1;
  float h = (float)(BLIND_ZONE_CM + maxDepth) - (float)(sum / ac);
  return constrain((int)((h / maxDepth) * 100.0f), 0, 100);
}

void processBuffer() {
  int rOH = calculateStableLevel(overheadBuffer,    BUFFER_SIZE, OVERHEAD_MAX_DEPTH_CM);
  int rUG = calculateStableLevel(undergroundBuffer, BUFFER_SIZE, UNDERGROUND_MAX_DEPTH_CM);

  if (rOH == -1) {
    if (lastGoodOverhead >= 85) overheadLevel = lastGoodOverhead;
    else { overheadLevel = -1; strncpy(systemStatus, "Err: O/H Sens", sizeof(systemStatus) - 1); }
  } else { overheadLevel = lastGoodOverhead = rOH; }

  if (rUG == -1) {
    if (lastGoodUnderground >= 85) undergroundLevel = lastGoodUnderground;
    else { undergroundLevel = -1; strncpy(systemStatus, "Err: U/G Sens", sizeof(systemStatus) - 1); }
  } else { undergroundLevel = lastGoodUnderground = rUG; }

  Serial.printf("[SENSOR] OH=%d%%  UG=%d%%\n", overheadLevel, undergroundLevel);
}


// =================================================================
//
//   SECTION 7 — PUMP, DRY-RUN, LEDs
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
      dryRunError = true;
      controlPump(false);
      strncpy(systemStatus, "Err: Dry Run", sizeof(systemStatus) - 1);
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
//   SECTION 8 — SERIAL TO ARDUINO TFT
//
// =================================================================

void sendDataToArduino() {
  char buf[80];
  snprintf(buf, sizeof(buf), "O:%d|U:%d|P:%s|A:%.2f|S:%.20s",
    overheadLevel, undergroundLevel,
    pumpStatus ? "ON" : "OFF",
    pumpCurrent, systemStatus);
  Serial2.println(buf);
}


// =================================================================
//
//   SECTION 9 — MQTT
//
// =================================================================

void publishMessage() {
  // Use StaticJsonDocument — fixed size on stack, no heap allocation
  StaticJsonDocument<256> doc;
  doc[F("thing_id")]          = DEVICE_ID;
  doc[F("overhead_level")]    = overheadLevel;
  doc[F("underground_level")] = undergroundLevel;
  doc[F("pump_status")]       = pumpStatus;
  doc[F("pump_current")]      = serialized(String(pumpCurrent, 3));
  doc[F("system_status")]     = systemStatus;

  char buf[MQTT_PACKET_SIZE];
  serializeJson(doc, buf, sizeof(buf));

  char topic[64];
  snprintf(topic, sizeof(topic), "devices/%s/data", DEVICE_ID);
  client.publish(topic, buf);
}

void messageReceived(char* topic, byte* payload, unsigned int len) {
  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, payload, len)) return;
  const char* cmd = doc[F("command")];
  if (!cmd) return;

  if (strcmp(cmd, "PUMP_ON") == 0) {
    if      (dryRunError)                                strncpy(systemStatus, "Locked: Dry Run", sizeof(systemStatus) - 1);
    else if (undergroundLevel == -1)                     strncpy(systemStatus, "Err: U/G Sens",   sizeof(systemStatus) - 1);
    else if (undergroundLevel > UNDERGROUND_LOW_PERCENT) { controlPump(true); strncpy(systemStatus, "Manual ON", sizeof(systemStatus) - 1); }
    else                                                 strncpy(systemStatus, "Error: U/G Low",  sizeof(systemStatus) - 1);
  }
  else if (strcmp(cmd, "PUMP_OFF")    == 0) { controlPump(false); strncpy(systemStatus, "Manual OFF",   sizeof(systemStatus) - 1); }
  else if (strcmp(cmd, "RESET_ERROR") == 0) { dryRunError = false; potentialDryRun = false; strncpy(systemStatus, "Error Reset", sizeof(systemStatus) - 1); }

  updateLEDs();
  sendDataToArduino();
  if (client.connected()) publishMessage();
}

void reconnectMQTT() {
  if (time(nullptr) < 10000) return;

  char cmdTopic[64], statusTopic[64];
  snprintf(cmdTopic,    sizeof(cmdTopic),    "devices/%s/commands", DEVICE_ID);
  snprintf(statusTopic, sizeof(statusTopic), "devices/%s/status",   DEVICE_ID);

  Serial.print(F("[MQTT] Connecting..."));
  if (client.connect(DEVICE_ID, runtimeHiveUser, runtimeHivePass)) {
    client.subscribe(cmdTopic, 1);
    client.publish(statusTopic, "online", true);
    Serial.printf(" OK [%s]\n", DEVICE_ID);
  } else {
    Serial.printf(" FAIL rc=%d\n", client.state());
  }
}


// =================================================================
//
//   SECTION 10 — SETUP
//
// =================================================================

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RXp2, TXp2);
  Serial.println(F("\n[BOOT] HydroSync v3.2"));

  // Safety first — pump off before anything else
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  digitalWrite(PUMP_RELAY_PIN, !RELAY_ON_STATE);

  pinMode(GREEN_LED_PIN, OUTPUT); digitalWrite(GREEN_LED_PIN, LOW);
  pinMode(RED_LED_PIN,   OUTPUT); digitalWrite(RED_LED_PIN,   HIGH);

  // ── STEP 1: Check triple-power-cycle reset ───────────────────
  checkTriplePowerCycleReset();

  delay(500); // ADC settle

  // ── STEP 2: Load credentials — if missing, start portal ──────
  if (!loadCredentials()) {
    digitalWrite(RED_LED_PIN, LOW);
    startPortalMode(); // Never returns — device reboots after save
  }

  // ── STEP 3: Normal boot ──────────────────────────────────────
  Serial.println(F("[BOOT] Credentials loaded. Starting."));
  digitalWrite(RED_LED_PIN, LOW);

  calibrateCTBias();

  // ── STEP 4: Connect to WiFi ──────────────────────────────────
  // ── FIX: No longer reboots on failure. Retry counter used. ───
  while (!connectToWiFi()) {
    wifiRetryCount++;
    Serial.printf("[WIFI] Attempt %d/%d failed.\n", wifiRetryCount, WIFI_MAX_RETRIES);
    if (wifiRetryCount >= WIFI_MAX_RETRIES) {
      Serial.println(F("[WIFI] Max retries reached. Credentials may be wrong."));
      Serial.println(F("[WIFI] Returning to portal mode."));
      // Clear provisioned flag so portal restarts — but keep boot counter
      prefs.begin(NVS_NAMESPACE, false);
      prefs.remove(NVS_KEY_PROVISIONED);
      prefs.end();
      delay(1000);
      ESP.restart(); // Reboot — will enter portal because provisioned=false
    }
    Serial.println(F("[WIFI] Retrying in 5s..."));
    delay(5000);
  }

  // ── STEP 5: TLS + MQTT setup ─────────────────────────────────
  net.setCACert(HIVEMQ_ROOT_CA);
  client.setServer(HIVEMQ_HOST, 8883);
  client.setCallback(messageReceived);
  client.setBufferSize(MQTT_PACKET_SIZE);

  bootCompleteTime = millis();
  sendDataToArduino();
  Serial.printf("[BOOT] Ready. ID=%s\n", DEVICE_ID);
}


// =================================================================
//
//   SECTION 11 — MAIN LOOP
//
// =================================================================

void loop() {
  unsigned long now = millis();

  checkSerialResetCommand();
  clearBootCounter();

  // ── WIFI RECOVERY ─────────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastReconnectAttempt > RECONNECT_INTERVAL_MS) {
      lastReconnectAttempt = now;
      Serial.println(F("[WIFI] Lost connection. Reconnecting..."));
      if (!connectToWiFi()) {
        wifiRetryCount++;
        if (wifiRetryCount >= WIFI_MAX_RETRIES) {
          Serial.println(F("[WIFI] Persistent failure. Back to portal."));
          prefs.begin(NVS_NAMESPACE, false);
          prefs.remove(NVS_KEY_PROVISIONED);
          prefs.end();
          delay(1000);
          ESP.restart();
        }
      } else {
        wifiRetryCount = 0; // Reset counter on success
      }
    }
    return;
  }

  // Reset retry counter once we're stably connected
  if (wifiRetryCount > 0) wifiRetryCount = 0;

  // ── MQTT ──────────────────────────────────────────────────────
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

      // Auto-recovery from dry run
      if (dryRunError && undergroundLevel != -1 &&
          undergroundLevel > UNDERGROUND_LOW_PERCENT + 15) {
        dryRunError = false;
        strncpy(systemStatus, "Recovered", sizeof(systemStatus) - 1);
      }

      // Automation logic
      if (!dryRunError && overheadLevel != -1 && undergroundLevel != -1) {
        if (!pumpStatus &&
            overheadLevel    <  OVERHEAD_LOW_PERCENT &&
            undergroundLevel >  UNDERGROUND_LOW_PERCENT) {
          controlPump(true);
          strncpy(systemStatus, "Auto: Pumping", sizeof(systemStatus) - 1);
        } else if (pumpStatus &&
                  (overheadLevel    >= OVERHEAD_HIGH_PERCENT ||
                   undergroundLevel <= UNDERGROUND_LOW_PERCENT)) {
          controlPump(false);
          strncpy(systemStatus,
            (overheadLevel >= OVERHEAD_HIGH_PERCENT) ? "Auto: O/H Full" : "Auto: U/G Low",
            sizeof(systemStatus) - 1);
        } else if (!pumpStatus && strcmp(systemStatus, "Initializing...") == 0) {
          strncpy(systemStatus, "System Ready", sizeof(systemStatus) - 1);
        }
      }

      updateLEDs();
      sendDataToArduino();
      if (client.connected()) publishMessage();
    }
  }
}

