// =================================================================
//   HydroSync Smart Water Management System
//   SENDER  |  ESP32-WROOM-32
//   Firmware Version: 3.0  —  Production Edition
// =================================================================
//
//  WHAT CHANGED FROM v2.1:
//  ─────────────────────────────────────────────────────────────
//  • System rebranded from AquaSavvy → HydroSync
//  • WiFi credentials NO LONGER hardcoded
//  • HiveMQ credentials NO LONGER hardcoded
//  • DEVICE_ID NO LONGER hardcoded
//  • All credentials stored in ESP32 NVS (non-volatile storage)
//    and entered once via a captive-portal setup webpage
//  • secrets.h still exists BUT now only holds the Root CA cert
//    (the certificate is the same for ALL devices — it never
//     changes per customer, so it is safe to be in the firmware)
//  • First-boot and factory-reset workflow fully implemented
//
//  HOW PROVISIONING WORKS (first time a customer receives device):
//  ─────────────────────────────────────────────────────────────
//  STEP 1: Customer powers on the HydroSync device.
//          The ESP32 finds no saved credentials → starts AP mode.
//
//  STEP 2: ESP32 broadcasts a WiFi network:
//            SSID: "HydroSync_Setup"   Password: "hydrosync"
//          The blue LED blinks slowly to indicate setup mode.
//
//  STEP 3: Customer connects their phone to "HydroSync_Setup".
//          Their phone shows a captive portal page automatically
//          (same as hotel/airport WiFi login). If it doesn't
//          pop up, they open a browser and go to: 192.168.4.1
//
//  STEP 4: The setup page shows a form with these fields:
//            • WiFi Network Name (SSID)
//            • WiFi Password
//            • Device ID (e.g. "HydroSync_001") — admin provides this
//            • HiveMQ Host (e.g. "xxxx.s1.eu.hivemq.cloud")
//            • HiveMQ Username
//            • HiveMQ Password
//
//  STEP 5: Customer fills in the form and clicks "Save & Connect".
//          ESP32 saves all values to NVS (permanent flash memory),
//          then reboots automatically.
//
//  STEP 6: After reboot, ESP32 reads credentials from NVS, connects
//          to WiFi, connects to HiveMQ, and starts publishing data.
//          Green LED solid = running normally.
//
//  HOW TO FACTORY RESET (if customer changes WiFi or credentials):
//  ─────────────────────────────────────────────────────────────
//  Hold the BOOT button (GPIO 0) for 5 seconds while powered on.
//  The device erases all saved credentials and restarts in
//  setup mode (Step 2 above) automatically.
//
//  This is exactly how commercial smart home devices work.
//
//  IMPORTANT SECURITY NOTE:
//  ─────────────────────────────────────────────────────────────
//  The setup portal is only active when no credentials are saved
//  OR when the factory reset is triggered. During normal operation
//  the AP is completely OFF and the setup portal is inaccessible.
//  The portal password ("hydrosync") prevents random neighbours
//  from connecting and changing settings.
//
// =================================================================


// =================================================================
// LIBRARIES
// =================================================================
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>          // ESP32 built-in web server for portal
#include <DNSServer.h>          // Captive portal DNS redirect
#include <Preferences.h>        // ESP32 NVS — permanent key-value storage
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <NewPing.h>
#include "secrets.h"            // Contains ONLY HIVEMQ_ROOT_CA (cert)
                                // No WiFi, no device credentials here


// =================================================================
// PIN DEFINITIONS
// =================================================================

// AJ-SR04M Ultrasonic sensors (complete modules, no external resistors)
#define OVERHEAD_TRIG_PIN       19
#define OVERHEAD_ECHO_PIN       18
#define UNDERGROUND_TRIG_PIN    26
#define UNDERGROUND_ECHO_PIN    27

// SSR-40DA Solid State Relay
#define PUMP_RELAY_PIN          23
#define RELAY_ON_STATE          HIGH

// ZHT103 CT Module — OUT pin directly to GPIO 34 (no voltage divider)
// Module max output = VCC/2 = 2.5V, well within ESP32's 3.3V ADC range
#define ZHT103_PIN              34

// Status LEDs (220Ω current-limiting resistors on board)
#define GREEN_LED_PIN           5
#define RED_LED_PIN             4

// FACTORY RESET BUTTON
// Connect a momentary push button between GPIO 0 and GND.
// GPIO 0 already has an internal pull-up AND it is the BOOT button
// on most ESP32 dev boards — perfect for factory reset.
#define FACTORY_RESET_PIN       0
#define FACTORY_RESET_HOLD_MS   5000  // Hold 5 seconds to factory reset

// Serial2 to Arduino TFT display
#define RXp2                    16
#define TXp2                    17


// =================================================================
// PROVISIONING — PORTAL CONFIGURATION
// =================================================================

// The setup AP network name and password (same on all units)
// Change PORTAL_PASSWORD to something stronger for your production units
#define PORTAL_SSID             "HydroSync_Setup"
#define PORTAL_PASSWORD         "hydrosync"

// How long to wait (seconds) in portal mode before rebooting
// if nobody connects to configure it. 0 = wait forever.
#define PORTAL_TIMEOUT_SEC      300   // 5 minutes then reboot


// =================================================================
// NVS NAMESPACE AND KEYS
// All credentials saved here survive power cycles and firmware updates
// =================================================================
#define NVS_NAMESPACE           "hydrosync"
#define NVS_KEY_WIFI_SSID       "wifi_ssid"
#define NVS_KEY_WIFI_PASS       "wifi_pass"
#define NVS_KEY_DEVICE_ID       "device_id"
#define NVS_KEY_HIVEMQ_HOST     "hive_host"
#define NVS_KEY_HIVEMQ_USER     "hive_user"
#define NVS_KEY_HIVEMQ_PASS     "hive_pass"
#define NVS_KEY_PROVISIONED     "provisioned"  // "true" when setup is done


// =================================================================
// TANK CALIBRATION (still set in firmware — physical measurements)
// =================================================================
const int OVERHEAD_MAX_DEPTH_CM    = 125;
const int UNDERGROUND_MAX_DEPTH_CM = 175;
const int BLIND_ZONE_CM            = 25;


// =================================================================
// AUTOMATION THRESHOLDS
// =================================================================
const int OVERHEAD_LOW_PERCENT      = 60;
const int OVERHEAD_HIGH_PERCENT     = 96;
const int UNDERGROUND_LOW_PERCENT   = 30;


// =================================================================
// ZHT103 CALIBRATION
// =================================================================
const float CT_CALIBRATION        = 111.1;
const float CT_NOISE_FLOOR_A      = 0.04;
const float MIN_PUMP_LOAD_AMPS    = 0.30;
const unsigned long DRY_RUN_TIMEOUT_MS = 45000;


// =================================================================
// ULTRASONIC / BUFFER SETTINGS
// =================================================================
#define MAX_PING_DISTANCE_CM    400
const int BUFFER_SIZE           = 6;
const unsigned long SAMPLE_INTERVAL_MS   = 500;
const unsigned long CROSSTALK_COOLDOWN_MS = 100;
#define MQTT_PACKET_SIZE        512
const unsigned long RECONNECT_INTERVAL_MS = 10000;


// =================================================================
// RUNTIME CREDENTIALS (loaded from NVS at boot)
// These are populated by loadCredentials() in setup()
// =================================================================
String runtimeWifiSSID    = "";
String runtimeWifiPass    = "";
String runtimeDeviceId    = "";
String runtimeHiveMQHost  = "";
String runtimeHiveMQUser  = "";
String runtimeHiveMQPass  = "";


// =================================================================
// OBJECTS
// =================================================================
Preferences   prefs;            // NVS storage
WebServer     portalServer(80); // Captive portal web server
DNSServer     dnsServer;        // Redirects all DNS to portal IP

NewPing overheadSonar(OVERHEAD_TRIG_PIN,    OVERHEAD_ECHO_PIN,    MAX_PING_DISTANCE_CM);
NewPing undergroundSonar(UNDERGROUND_TRIG_PIN, UNDERGROUND_ECHO_PIN, MAX_PING_DISTANCE_CM);

WiFiClientSecure net;
PubSubClient     client(net);


// =================================================================
// GLOBAL STATE
// =================================================================
bool   pumpStatus           = false;
String systemStatus         = "Initializing...";

int    overheadLevel        = -1;
int    undergroundLevel     = -1;
float  pumpCurrent          = 0.0;

int    overheadBuffer[BUFFER_SIZE];
int    undergroundBuffer[BUFFER_SIZE];
int    bufferIndex          = 0;

int    lastGoodOverhead     = 50;
int    lastGoodUnderground  = 50;

bool           dryRunError       = false;
bool           potentialDryRun   = false;
unsigned long  dryRunTimerStart  = 0;
unsigned long  pumpOnTime        = 0;

float  ctBiasVoltage        = 1.65;

unsigned long  lastSampleTime       = 0;
unsigned long  lastReconnectAttempt = 0;

// Portal mode state
bool   inPortalMode = false;


// =================================================================
//
//   SECTION 1  —  NVS CREDENTIAL MANAGEMENT
//
// =================================================================

/*
 * loadCredentials()
 *
 * Reads all saved credentials from NVS into runtime variables.
 * Returns true if all required credentials are present and non-empty.
 * Returns false if device has never been provisioned (first boot).
 */
bool loadCredentials() {
  prefs.begin(NVS_NAMESPACE, true); // Open read-only

  String provisioned = prefs.getString(NVS_KEY_PROVISIONED, "");
  if (provisioned != "true") {
    prefs.end();
    Serial.println(F("[NVS] No credentials saved — first boot or factory reset."));
    return false;
  }

  runtimeWifiSSID   = prefs.getString(NVS_KEY_WIFI_SSID,   "");
  runtimeWifiPass   = prefs.getString(NVS_KEY_WIFI_PASS,   "");
  runtimeDeviceId   = prefs.getString(NVS_KEY_DEVICE_ID,   "");
  runtimeHiveMQHost = prefs.getString(NVS_KEY_HIVEMQ_HOST, "");
  runtimeHiveMQUser = prefs.getString(NVS_KEY_HIVEMQ_USER, "");
  runtimeHiveMQPass = prefs.getString(NVS_KEY_HIVEMQ_PASS, "");
  prefs.end();

  // Validate none are empty
  if (runtimeWifiSSID.isEmpty()   || runtimeWifiPass.isEmpty()   ||
      runtimeDeviceId.isEmpty()   || runtimeHiveMQHost.isEmpty() ||
      runtimeHiveMQUser.isEmpty() || runtimeHiveMQPass.isEmpty()) {
    Serial.println(F("[NVS] Credentials incomplete — entering setup."));
    return false;
  }

  Serial.println(F("[NVS] Credentials loaded OK."));
  Serial.printf("[NVS] Device ID: %s\n", runtimeDeviceId.c_str());
  Serial.printf("[NVS] WiFi SSID: %s\n", runtimeWifiSSID.c_str());
  Serial.printf("[NVS] HiveMQ Host: %s\n", runtimeHiveMQHost.c_str());
  return true;
}

/*
 * saveCredentials()
 *
 * Saves all credentials to NVS. Called from the portal form handler.
 * After saving, sets the "provisioned" flag so loadCredentials()
 * succeeds on next boot.
 */
void saveCredentials(const String& ssid, const String& pass,
                     const String& devId, const String& host,
                     const String& user,  const String& mqPass) {
  prefs.begin(NVS_NAMESPACE, false); // Open read-write
  prefs.putString(NVS_KEY_WIFI_SSID,   ssid);
  prefs.putString(NVS_KEY_WIFI_PASS,   pass);
  prefs.putString(NVS_KEY_DEVICE_ID,   devId);
  prefs.putString(NVS_KEY_HIVEMQ_HOST, host);
  prefs.putString(NVS_KEY_HIVEMQ_USER, user);
  prefs.putString(NVS_KEY_HIVEMQ_PASS, mqPass);
  prefs.putString(NVS_KEY_PROVISIONED, "true");
  prefs.end();
  Serial.println(F("[NVS] All credentials saved to flash."));
}

/*
 * factoryReset()
 *
 * Erases all saved credentials from NVS and reboots into setup mode.
 * Triggered by holding FACTORY_RESET_PIN LOW for 5 seconds.
 */
void factoryReset() {
  Serial.println(F("[FACTORY RESET] Erasing all credentials..."));
  prefs.begin(NVS_NAMESPACE, false);
  prefs.clear(); // Erase entire namespace
  prefs.end();
  Serial.println(F("[FACTORY RESET] Done. Rebooting into setup mode."));
  delay(1000);
  ESP.restart();
}

/*
 * checkFactoryReset()
 *
 * Called in the main loop. If FACTORY_RESET_PIN is held LOW
 * (button pressed) for FACTORY_RESET_HOLD_MS, triggers a factory reset.
 * Blinks the red LED rapidly while the button is being held.
 */
void checkFactoryReset() {
  if (digitalRead(FACTORY_RESET_PIN) == LOW) {
    unsigned long holdStart = millis();
    Serial.println(F("[FACTORY RESET] Button held — release to cancel, hold 5s to reset."));
    while (digitalRead(FACTORY_RESET_PIN) == LOW) {
      // Blink red LED rapidly to signal factory reset pending
      digitalWrite(RED_LED_PIN, (millis() / 200) % 2);
      if (millis() - holdStart >= FACTORY_RESET_HOLD_MS) {
        digitalWrite(RED_LED_PIN, HIGH);
        delay(500);
        factoryReset(); // Does not return
      }
    }
    // Button released before 5 seconds — cancel
    digitalWrite(RED_LED_PIN, LOW);
    Serial.println(F("[FACTORY RESET] Cancelled."));
  }
}


// =================================================================
//
//   SECTION 2  —  CAPTIVE PORTAL (SETUP MODE)
//
// =================================================================

/*
 * The captive portal HTML page
 * Shown to the customer when they connect to HydroSync_Setup network.
 *
 * Fields:
 *   - WiFi SSID (text, required)
 *   - WiFi Password (password, required)
 *   - Device ID (text, required — given to customer by admin)
 *   - HiveMQ Host (text, required — same for all devices on your cluster)
 *   - HiveMQ Username (text, required — unique per device)
 *   - HiveMQ Password (password, required — unique per device)
 *
 * After submission:
 *   - Saves credentials to NVS
 *   - Sends a "Saved! Device restarting..." page to the browser
 *   - Reboots the ESP32 after 2 seconds
 */
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
        border-radius:16px;padding:28px 24px;max-width:420px;width:100%}
  .logo{width:48px;height:48px;border-radius:12px;
        background:linear-gradient(135deg,#1d4ed8,#06b6d4);
        display:flex;align-items:center;justify-content:center;
        font-size:22px;margin:0 auto 12px}
  h1{text-align:center;font-size:20px;font-weight:700;margin-bottom:4px}
  .sub{text-align:center;color:#94a3b8;font-size:13px;margin-bottom:24px}
  .section-title{font-size:11px;font-weight:600;letter-spacing:.08em;
                 text-transform:uppercase;color:#94a3b8;margin:20px 0 10px;
                 padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06)}
  label{display:block;font-size:13px;color:#94a3b8;margin-bottom:5px;margin-top:12px}
  input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
        background:#0f172a;color:#f1f5f9;font-size:14px;outline:none}
  input:focus{border-color:#06b6d4}
  .hint{font-size:11px;color:#64748b;margin-top:4px}
  button{width:100%;padding:13px;border:none;border-radius:10px;
         background:linear-gradient(135deg,#1d4ed8,#06b6d4);
         color:white;font-size:15px;font-weight:600;cursor:pointer;
         margin-top:24px;letter-spacing:.02em}
  button:active{opacity:0.85}
  .warning{background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);
           border-radius:8px;padding:10px 12px;font-size:12px;color:#fbbf24;
           margin-top:16px;line-height:1.5}
</style>
</head>
<body>
<div class="card">
  <div class="logo">💧</div>
  <h1>HydroSync Setup</h1>
  <p class="sub">Connect your device to WiFi and HiveMQ Cloud</p>

  <form method="POST" action="/save">

    <div class="section-title">WiFi Network</div>
    <label>WiFi Name (SSID)</label>
    <input name="ssid" type="text" placeholder="Your home or office WiFi" required autocomplete="off">
    <label>WiFi Password</label>
    <input name="pass" type="password" placeholder="WiFi password" required>

    <div class="section-title">Device Identity</div>
    <label>Device ID</label>
    <input name="device_id" type="text" placeholder="e.g. HydroSync_001" required autocomplete="off">
    <p class="hint">Provided by your HydroSync administrator</p>

    <div class="section-title">HiveMQ Cloud Credentials</div>
    <label>HiveMQ Host</label>
    <input name="hive_host" type="text" placeholder="xxxx.s1.eu.hivemq.cloud" required autocomplete="off">
    <label>HiveMQ Username</label>
    <input name="hive_user" type="text" placeholder="hydrosync_device_001" required autocomplete="off">
    <label>HiveMQ Password</label>
    <input name="hive_pass" type="password" placeholder="Device MQTT password" required>

    <button type="submit">Save &amp; Connect Device</button>
  </form>

  <div class="warning">
    ⚠ After saving, this page will close and the device will restart.
    Wait 30 seconds, then check the green LED — solid green means connected.
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
<title>HydroSync — Saved!</title>
<style>
  body{font-family:-apple-system,sans-serif;background:#0f172a;color:#f1f5f9;
       min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
  .card{background:#1e293b;border-radius:16px;padding:32px 24px;max-width:380px;
        width:100%;text-align:center}
  .icon{font-size:48px;margin-bottom:16px}
  h1{font-size:20px;margin-bottom:8px;color:#22c55e}
  p{color:#94a3b8;font-size:14px;line-height:1.6}
  .steps{background:#0f172a;border-radius:10px;padding:14px 16px;
         margin-top:20px;text-align:left;font-size:13px;color:#94a3b8}
  .steps li{margin:6px 0;padding-left:4px}
</style>
</head>
<body>
<div class="card">
  <div class="icon">✅</div>
  <h1>Credentials Saved!</h1>
  <p>Your HydroSync device is now restarting and connecting to your WiFi network.</p>
  <div class="steps">
    <strong style="color:#f1f5f9">Next steps:</strong>
    <ol>
      <li>Disconnect from "HydroSync_Setup" WiFi</li>
      <li>Reconnect to your normal WiFi</li>
      <li>Wait 30 seconds</li>
      <li>Green LED solid = device is online ✓</li>
    </ol>
  </div>
</div>
</body>
</html>
)rawhtml";

// Handler: serve the setup form page
void handlePortalRoot() {
  portalServer.send(200, "text/html", FPSTR(PORTAL_HTML));
}

// Handler: capture portal redirect — any URL not found → redirect to setup page
void handlePortalNotFound() {
  portalServer.sendHeader("Location", "http://192.168.4.1/", true);
  portalServer.send(302, "text/plain", "");
}

// Handler: process the submitted form
void handlePortalSave() {
  // Read all form fields
  String ssid   = portalServer.arg("ssid");
  String pass   = portalServer.arg("pass");
  String devId  = portalServer.arg("device_id");
  String host   = portalServer.arg("hive_host");
  String user   = portalServer.arg("hive_user");
  String mqPass = portalServer.arg("hive_pass");

  // Basic validation
  if (ssid.isEmpty() || devId.isEmpty() || host.isEmpty() ||
      user.isEmpty() || mqPass.isEmpty()) {
    portalServer.send(400, "text/plain", "All fields except WiFi password are required.");
    return;
  }

  Serial.println(F("[PORTAL] Form submitted. Saving credentials..."));
  Serial.printf("[PORTAL] SSID: %s\n", ssid.c_str());
  Serial.printf("[PORTAL] Device ID: %s\n", devId.c_str());
  Serial.printf("[PORTAL] HiveMQ Host: %s\n", host.c_str());

  // Send success page to browser first, then save + reboot
  portalServer.send(200, "text/html", FPSTR(PORTAL_SUCCESS_HTML));

  delay(500); // Give browser time to receive the page

  saveCredentials(ssid, pass, devId, host, user, mqPass);

  Serial.println(F("[PORTAL] Credentials saved. Rebooting in 2 seconds..."));
  delay(2000);
  ESP.restart(); // Device will reboot with new credentials
}

/*
 * startPortalMode()
 *
 * Called when device has no saved credentials (first boot or factory reset).
 * Starts the ESP32 as a WiFi access point, launches the web server,
 * and starts a DNS server that redirects all requests to 192.168.4.1
 * (this is what makes the captive portal pop up automatically on phones).
 *
 * Blocks in a loop until credentials are saved and device reboots.
 * If PORTAL_TIMEOUT_SEC > 0, reboots automatically after that time
 * (in case nobody configures it — prevents device getting stuck forever).
 */
void startPortalMode() {
  inPortalMode = true;
  Serial.println(F("\n[PORTAL] Starting setup mode..."));
  Serial.printf("[PORTAL] AP SSID: %s\n", PORTAL_SSID);
  Serial.println(F("[PORTAL] AP Password: hydrosync"));
  Serial.println(F("[PORTAL] Connect to the AP and open 192.168.4.1"));

  // Start Access Point
  WiFi.mode(WIFI_AP);
  WiFi.softAP(PORTAL_SSID, PORTAL_PASSWORD);

  IPAddress apIP = WiFi.softAPIP();
  Serial.printf("[PORTAL] AP IP: %s\n", apIP.toString().c_str());

  // DNS server: redirect ALL domains to our IP (captive portal trick)
  dnsServer.start(53, "*", apIP);

  // Web server routes
  portalServer.on("/",         HTTP_GET,  handlePortalRoot);
  portalServer.on("/save",     HTTP_POST, handlePortalSave);
  portalServer.onNotFound(handlePortalNotFound);
  portalServer.begin();

  Serial.println(F("[PORTAL] Web server started. Waiting for configuration..."));

  // Blink blue LED (use green LED slowly) to indicate setup mode
  unsigned long portalStartTime = millis();
  unsigned long lastBlink       = 0;
  bool          ledState        = false;

  while (true) {
    dnsServer.processNextRequest();
    portalServer.handleClient();

    // Blink green LED every 500ms during setup mode
    if (millis() - lastBlink > 500) {
      lastBlink = millis();
      ledState  = !ledState;
      digitalWrite(GREEN_LED_PIN, ledState);
    }

    // Timeout: reboot if nobody configures the device
    if (PORTAL_TIMEOUT_SEC > 0 &&
        millis() - portalStartTime > (unsigned long)PORTAL_TIMEOUT_SEC * 1000) {
      Serial.println(F("[PORTAL] Timeout reached. Rebooting..."));
      digitalWrite(GREEN_LED_PIN, LOW);
      delay(1000);
      ESP.restart(); // Reboot — will try portal again on next power-on
    }
  }
  // This loop never exits normally — device reboots inside handlePortalSave()
  // or after timeout above.
}


// =================================================================
//
//   SECTION 3  —  ZHT103 CT MODULE CURRENT SENSING
//
// =================================================================

void calibrateCTBias() {
  Serial.println(F("[CT] Calibrating DC bias (pump must be OFF)..."));
  long sum = 0;
  for (int i = 0; i < 500; i++) {
    sum += analogRead(ZHT103_PIN);
    delayMicroseconds(300);
  }
  float avgRaw  = (float)sum / 500.0f;
  ctBiasVoltage = (avgRaw / 4095.0f) * 3.3f;
  Serial.printf("[CT] Bias = %.4fV  (raw avg = %.1f)\n", ctBiasVoltage, avgRaw);
}

float readPumpCurrentRMS() {
  double sumSq       = 0.0;
  int    sampleCount = 0;

  unsigned long windowStart = millis();
  while (millis() - windowStart < 60) {
    int   raw  = analogRead(ZHT103_PIN);
    float volt = (raw / 4095.0f) * 3.3f;
    float ac   = volt - ctBiasVoltage;
    sumSq      += (double)(ac * ac);
    sampleCount++;
    delayMicroseconds(100);
  }

  if (sampleCount == 0) return 0.0f;

  float vrms = sqrtf((float)(sumSq / (double)sampleCount));
  float irms = vrms * CT_CALIBRATION;

  Serial.printf("[CT] Vrms=%.5fV  Irms=%.4fA  n=%d\n", vrms, irms, sampleCount);
  return (irms < CT_NOISE_FLOOR_A) ? 0.0f : irms;
}


// =================================================================
//
//   SECTION 4  —  AJ-SR04M ULTRASONIC SENSORS
//
// =================================================================

void pingSequential(int index) {
  overheadBuffer[index]    = overheadSonar.ping_cm();
  delay(CROSSTALK_COOLDOWN_MS);
  undergroundBuffer[index] = undergroundSonar.ping_cm();
}

void bubbleSort(int *arr, int size) {
  for (int i = 0; i < size - 1; i++)
    for (int j = 0; j < size - i - 1; j++)
      if (arr[j] > arr[j + 1]) {
        int t = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = t;
      }
}

int calculateStableLevel(int *rawData, int size, int maxDepth) {
  int valid[BUFFER_SIZE];
  int validCount = 0;

  for (int i = 0; i < size; i++)
    if (rawData[i] > 0 && rawData[i] < MAX_PING_DISTANCE_CM)
      valid[validCount++] = rawData[i];

  if (validCount < (size / 2)) return -1;

  bubbleSort(valid, validCount);
  int median = valid[validCount / 2];

  long sum = 0; int avgCount = 0;
  for (int i = 0; i < validCount; i++)
    if (abs(valid[i] - median) <= 15) { sum += valid[i]; avgCount++; }

  if (avgCount == 0) return -1;

  int avgDist  = (int)(sum / avgCount);
  float waterH = (float)(BLIND_ZONE_CM + maxDepth) - (float)avgDist;
  float pct    = (waterH / (float)maxDepth) * 100.0f;
  return constrain((int)pct, 0, 100);
}

void processBuffer() {
  int rawOH = calculateStableLevel(overheadBuffer,    BUFFER_SIZE, OVERHEAD_MAX_DEPTH_CM);
  int rawUG = calculateStableLevel(undergroundBuffer, BUFFER_SIZE, UNDERGROUND_MAX_DEPTH_CM);

  if (rawOH == -1) {
    if (lastGoodOverhead >= 85) {
      overheadLevel = lastGoodOverhead;
      Serial.println(F("[SENSOR] OH: blind zone — using lastGood"));
    } else { overheadLevel = -1; systemStatus = "Err: O/H Sens"; }
  } else { overheadLevel = rawOH; lastGoodOverhead = rawOH; }

  if (rawUG == -1) {
    if (lastGoodUnderground >= 85) {
      undergroundLevel = lastGoodUnderground;
      Serial.println(F("[SENSOR] UG: blind zone — using lastGood"));
    } else { undergroundLevel = -1; systemStatus = "Err: U/G Sens"; }
  } else { undergroundLevel = rawUG; lastGoodUnderground = rawUG; }

  Serial.printf("[SENSOR] OH=%d%%  UG=%d%%\n", overheadLevel, undergroundLevel);
}


// =================================================================
//
//   SECTION 5  —  PUMP, DRY-RUN, AND LEDS
//
// =================================================================

void controlPump(bool turnOn) {
  if (turnOn && dryRunError) {
    Serial.println(F("[PUMP] Start blocked — dry run error active.")); return;
  }
  if (turnOn && !pumpStatus) pumpOnTime = millis();
  pumpStatus = turnOn;
  digitalWrite(PUMP_RELAY_PIN, turnOn ? RELAY_ON_STATE : !RELAY_ON_STATE);
  if (!turnOn) { potentialDryRun = false; dryRunTimerStart = 0; }
  Serial.printf("[PUMP] %s\n", turnOn ? "ON" : "OFF");
}

void checkDryRun() {
  if (!pumpStatus) return;
  if (millis() - pumpOnTime < 3000) return;

  pumpCurrent = readPumpCurrentRMS();

  if (pumpCurrent > CT_NOISE_FLOOR_A && pumpCurrent < MIN_PUMP_LOAD_AMPS) {
    if (!potentialDryRun) {
      potentialDryRun = true; dryRunTimerStart = millis();
      Serial.printf("[DRYRUN] Low current %.3fA — timer started.\n", pumpCurrent);
    } else if (millis() - dryRunTimerStart >= DRY_RUN_TIMEOUT_MS) {
      dryRunError = true; controlPump(false); systemStatus = "Err: Dry Run";
      Serial.println(F("[DRYRUN] DRY RUN DECLARED — pump OFF."));
      if (client.connected()) {
        char alertBuf[128];
        snprintf(alertBuf, sizeof(alertBuf),
                 "{\"alert\":\"DRY_RUN\",\"device\":\"%s\",\"amps\":%.3f}",
                 runtimeDeviceId.c_str(), pumpCurrent);
        String alertTopic = "devices/" + runtimeDeviceId + "/alerts";
        client.publish(alertTopic.c_str(), alertBuf);
      }
      potentialDryRun = false;
    }
  } else {
    if (potentialDryRun)
      Serial.printf("[DRYRUN] Recovered to %.3fA — timer reset.\n", pumpCurrent);
    potentialDryRun = false; dryRunTimerStart = 0;
  }
}

void updateLEDs() {
  bool greenOn = pumpStatus || (overheadLevel  > OVERHEAD_LOW_PERCENT   && overheadLevel  != -1);
  bool redOn   = dryRunError || (undergroundLevel != -1 && undergroundLevel <= UNDERGROUND_LOW_PERCENT);
  digitalWrite(GREEN_LED_PIN, greenOn ? HIGH : LOW);
  digitalWrite(RED_LED_PIN,   redOn   ? HIGH : LOW);
}


// =================================================================
//
//   SECTION 6  —  SERIAL TO ARDUINO
//
// =================================================================

void sendDataToArduino() {
  String statusStr = systemStatus;
  if (statusStr.length() > 20) statusStr = statusStr.substring(0, 20);
  String packet = "O:"  + String(overheadLevel)   +
                  "|U:" + String(undergroundLevel) +
                  "|P:" + (pumpStatus ? "ON" : "OFF") +
                  "|A:" + String(pumpCurrent, 2)   +
                  "|S:" + statusStr;
  Serial2.println(packet);
  Serial.print(F("[SERIAL2] ")); Serial.println(packet);
}


// =================================================================
//
//   SECTION 7  —  MQTT  (uses runtimeDeviceId / runtimeHiveMQUser etc.)
//
// =================================================================

void publishMessage() {
  JsonDocument doc;
  doc["thing_id"]          = runtimeDeviceId;
  doc["overhead_level"]    = overheadLevel;
  doc["underground_level"] = undergroundLevel;
  doc["pump_status"]       = pumpStatus;
  doc["pump_current"]      = serialized(String(pumpCurrent, 3));
  doc["system_status"]     = systemStatus;

  char jsonBuffer[MQTT_PACKET_SIZE];
  serializeJson(doc, jsonBuffer);
  String pubTopic = "devices/" + runtimeDeviceId + "/data";
  bool ok = client.publish(pubTopic.c_str(), jsonBuffer);
  Serial.printf("[MQTT] Publish %s\n", ok ? "OK" : "FAIL");
}

void messageReceived(char* topic, byte* payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;
  const char* command = doc["command"];
  if (!command) return;

  if (strcmp(command, "PUMP_ON") == 0) {
    if (dryRunError)                                   systemStatus = "Locked: Dry Run";
    else if (undergroundLevel == -1)                   systemStatus = "Err: U/G Sens";
    else if (undergroundLevel > UNDERGROUND_LOW_PERCENT) {
      controlPump(true); systemStatus = "Manual ON";
    } else                                             systemStatus = "Error: U/G Low";
  }
  else if (strcmp(command, "PUMP_OFF") == 0) {
    controlPump(false); systemStatus = "Manual OFF";
  }
  else if (strcmp(command, "RESET_ERROR") == 0) {
    dryRunError = false; potentialDryRun = false; systemStatus = "Error Reset";
  }

  updateLEDs();
  sendDataToArduino();
  if (client.connected()) publishMessage();
}

void reconnectMQTT() {
  if (time(nullptr) < 10000) { Serial.println(F("[MQTT] Waiting NTP...")); return; }
  Serial.print(F("[MQTT] Connecting to HiveMQ..."));
  String cmdTopic = "devices/" + runtimeDeviceId + "/commands";
  // Using runtimeHiveMQUser and runtimeHiveMQPass from NVS — not hardcoded
  if (client.connect(runtimeDeviceId.c_str(),
                     runtimeHiveMQUser.c_str(),
                     runtimeHiveMQPass.c_str())) {
    client.subscribe(cmdTopic.c_str());
    Serial.println(F(" Connected!"));
    // Publish online status (retained)
    String statusTopic = "devices/" + runtimeDeviceId + "/status";
    client.publish(statusTopic.c_str(), "online", true);
  } else {
    Serial.printf(" FAIL rc=%d\n", client.state());
  }
}

void WiFiEventHandler(WiFiEvent_t event) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.printf("[WIFI] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
      configTime(3 * 3600, 0, "africa.pool.ntp.org", "pool.ntp.org");
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.println(F("[WIFI] Disconnected."));
      break;
    default: break;
  }
}


// =================================================================
//
//   SECTION 8  —  SETUP
//
// =================================================================

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RXp2, TXp2);
  Serial.println(F("\n[BOOT] HydroSync v3.0 starting..."));

  // GPIO setup — relay OFF immediately (safety critical)
  pinMode(PUMP_RELAY_PIN,    OUTPUT);
  digitalWrite(PUMP_RELAY_PIN, !RELAY_ON_STATE); // PUMP OFF before anything else

  pinMode(GREEN_LED_PIN,     OUTPUT); digitalWrite(GREEN_LED_PIN, LOW);
  pinMode(RED_LED_PIN,       OUTPUT); digitalWrite(RED_LED_PIN,   HIGH);

  // Factory reset button — GPIO 0 is the BOOT button on most dev boards
  // Internal pull-up means button press pulls it LOW
  pinMode(FACTORY_RESET_PIN, INPUT_PULLUP);

  // Let ADC and ZHT103 op-amp settle before calibration
  delay(500);

  // ── CREDENTIAL CHECK ──────────────────────────────────────────
  // Try to load credentials from NVS.
  // If none exist (first boot or factory reset), enter portal mode.
  if (!loadCredentials()) {
    // No credentials — start setup portal
    // This function blocks until the user configures the device
    // and the device reboots. It will not return.
    digitalWrite(RED_LED_PIN, LOW); // Red off during portal (green blinks)
    startPortalMode();              // Does not return
  }

  // ── NORMAL BOOT (credentials exist) ──────────────────────────
  Serial.println(F("[BOOT] Credentials found. Starting normal operation."));
  digitalWrite(RED_LED_PIN, LOW);

  // Calibrate ZHT103 bias with pump OFF
  calibrateCTBias();

  // WiFi connection using saved SSID/password
  WiFi.mode(WIFI_STA);
  WiFi.onEvent(WiFiEventHandler);
  Serial.printf("[WIFI] Connecting to: %s\n", runtimeWifiSSID.c_str());
  WiFi.begin(runtimeWifiSSID.c_str(), runtimeWifiPass.c_str());

  // Wait up to 30 seconds for WiFi
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 30000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("\n[WIFI] Could not connect to saved WiFi."));
    Serial.println(F("[WIFI] Rebooting to try again..."));
    // Don't enter portal mode — the credentials might be correct
    // and the router might just be temporarily down.
    // Reboot and retry. If this keeps failing, user can factory reset.
    delay(5000);
    ESP.restart();
  }

  Serial.println(F("\n[WIFI] Connected."));

  // TLS: Only Root CA needed for HiveMQ (from secrets.h)
  net.setCACert(HIVEMQ_ROOT_CA);

  // MQTT server: uses runtimeHiveMQHost loaded from NVS
  client.setServer(runtimeHiveMQHost.c_str(), 8883);
  client.setCallback(messageReceived);
  client.setBufferSize(MQTT_PACKET_SIZE);

  digitalWrite(RED_LED_PIN, LOW);
  sendDataToArduino();
  Serial.printf("[BOOT] Device ID: %s\n", runtimeDeviceId.c_str());
  Serial.println(F("[BOOT] Ready."));
}


// =================================================================
//
//   SECTION 9  —  MAIN LOOP
//
// =================================================================

void loop() {
  unsigned long now = millis();

  // Factory reset check — runs every loop
  checkFactoryReset();

  // ── CONNECTIVITY ──────────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastReconnectAttempt > RECONNECT_INTERVAL_MS) {
      lastReconnectAttempt = now;
      Serial.println(F("[WIFI] Reconnecting..."));
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
    pingSequential(bufferIndex);
    bufferIndex++;

    if (bufferIndex >= BUFFER_SIZE) {
      bufferIndex = 0;

      processBuffer();

      if (pumpStatus) {
        checkDryRun();
      } else {
        pumpCurrent = 0.0f;
      }

      // Auto-recovery from dry run
      if (dryRunError && undergroundLevel != -1 &&
          undergroundLevel > (UNDERGROUND_LOW_PERCENT + 15)) {
        dryRunError  = false;
        systemStatus = "Recovered";
        Serial.println(F("[AUTO] Dry run cleared — tank recovered."));
      }

      // Automation logic
      if (!dryRunError && overheadLevel != -1 && undergroundLevel != -1) {
        if (overheadLevel    <  OVERHEAD_LOW_PERCENT    &&
            undergroundLevel >  UNDERGROUND_LOW_PERCENT &&
            !pumpStatus) {
          controlPump(true); systemStatus = "Auto: Pumping";
        }
        else if ((overheadLevel    >= OVERHEAD_HIGH_PERCENT ||
                  undergroundLevel <= UNDERGROUND_LOW_PERCENT) && pumpStatus) {
          controlPump(false);
          systemStatus = (overheadLevel >= OVERHEAD_HIGH_PERCENT)
                         ? "Auto: O/H Full" : "Auto: U/G Low";
        }
        else if (!pumpStatus && systemStatus == "Initializing...") {
          systemStatus = "System Ready";
        }
      }

      updateLEDs();
      sendDataToArduino();
      if (client.connected()) publishMessage();
    }
  }
}