// =================================================================
//   HydroSync Smart Water Management System | RECEIVER
//   Firmware Version: 3.0
// =================================================================
//
//  ROLE OF THIS ARDUINO:
//  ─────────────────────
//  This Arduino has ONE job: receive a data string from the ESP32
//  over Serial (hardware UART) and render it on the TFT display.
//  It does NOT make any decisions. All logic lives on the ESP32.
//
//  HARDWARE WIRING:
//  ─────────────────
//  ESP32 TX2 (GPIO 17)  →  Arduino RX (Pin 0)
//  ESP32 GND            →  Arduino GND    ← MANDATORY SHARED GROUND
//  TFT shield: plug directly onto Arduino Uno/Mega header pins.
//
// =================================================================

#include <MCUFRIEND_kbv.h>
#include <Adafruit_GFX.h>
// TouchScreen removed to save memory and prevent conflicts

// =================================================================
// DISPLAY OBJECT
// =================================================================
MCUFRIEND_kbv tft;

// Screen dimensions (landscape 320×240)
#define SCREEN_W  320
#define SCREEN_H  240

// =================================================================
// COLOUR PALETTE  (RGB565 format)
// =================================================================
#define BLACK       0x0000
#define WHITE       0xFFFF
#define BLUE        0x001F
#define DARK_BLUE   0x0010
#define RED         0xF800
#define DARK_RED    0x7800
#define GREEN       0x07E0
#define DARK_GREEN  0x03E0
#define CYAN        0x07FF
#define MAGENTA     0xF81F
#define YELLOW      0xFFE0
#define ORANGE      0xFD20
#define GREY        0x8410
#define DARK_GREY   0x4208
#define LIGHT_GREY  0xC618

// =================================================================
// LAYOUT CONSTANTS
// =================================================================
#define TITLE_Y       0
#define TITLE_H      28

#define BOX_Y        30
#define BOX_H        95
#define OH_BOX_X     5
#define OH_BOX_W    153
#define UG_BOX_X    162
#define UG_BOX_W    153

#define OH_PCT_X     28
#define OH_PCT_Y     50
#define UG_PCT_X    185
#define UG_PCT_Y     50

#define OH_BAR_X     12
#define OH_BAR_Y     85
#define OH_BAR_W    140
#define BAR_H        15
#define UG_BAR_X    169
#define UG_BAR_Y     85

#define PUMP_ROW_Y  133
#define PUMP_ROW_H   34
#define STATUS_ROW_Y 173
#define STATUS_ROW_H  30
#define SIGNAL_ROW_Y 208
#define SIGNAL_ROW_H  28

// =================================================================
// RECEIVED DATA STATE
// =================================================================
String overheadLevel    = "--";
String undergroundLevel = "--";
String pumpStatus       = "OFF";
String pumpCurrent      = "0.00";
String systemStatus     = "Waiting...";

unsigned long lastDataTime      = 0;
bool          dataEverReceived  = false;

// =================================================================
//  UI DRAWING FUNCTIONS
// =================================================================

void drawInterface() {
  tft.fillScreen(BLACK);

  // ── Title bar ──
  tft.fillRect(0, TITLE_Y, SCREEN_W, TITLE_H, DARK_BLUE);
  tft.drawRect(0, TITLE_Y, SCREEN_W, TITLE_H, CYAN);
  tft.setTextColor(WHITE);
  tft.setTextSize(2);
  tft.setCursor(70, TITLE_Y + 6); // Centered for "HydroSync"
  tft.print(F("HydroSync v3.0"));

  // ── Overhead Tank box ──
  tft.drawRoundRect(OH_BOX_X, BOX_Y, OH_BOX_W, BOX_H, 4, CYAN);
  tft.setTextSize(1);
  tft.setTextColor(CYAN);
  tft.setCursor(OH_BOX_X + 8, BOX_Y + 6);
  tft.print(F("OVERHEAD TANK"));
  tft.drawRect(OH_BAR_X, OH_BAR_Y, OH_BAR_W, BAR_H, GREY);

  // ── Underground Tank box ──
  tft.drawRoundRect(UG_BOX_X, BOX_Y, UG_BOX_W, BOX_H, 4, CYAN);
  tft.setTextColor(CYAN);
  tft.setCursor(UG_BOX_X + 8, BOX_Y + 6);
  tft.print(F("UNDERGROUND TANK"));
  tft.drawRect(UG_BAR_X, UG_BAR_Y, OH_BAR_W, BAR_H, GREY);

  // ── Pump status row ──
  tft.drawRect(5, PUMP_ROW_Y, SCREEN_W - 10, PUMP_ROW_H, WHITE);
  tft.setTextColor(YELLOW);
  tft.setTextSize(1);
  tft.setCursor(10, PUMP_ROW_Y + 5);
  tft.print(F("PUMP:"));
  tft.setTextColor(WHITE);
  tft.setCursor(130, PUMP_ROW_Y + 5);
  tft.print(F("CURRENT:"));

  // ── System status row ──
  tft.drawRect(5, STATUS_ROW_Y, SCREEN_W - 10, STATUS_ROW_H, WHITE);
  tft.setTextColor(GREEN);
  tft.setTextSize(1);
  tft.setCursor(10, STATUS_ROW_Y + 5);
  tft.print(F("STATUS:"));

  // ── Signal / freshness row ──
  tft.drawRect(5, SIGNAL_ROW_Y, SCREEN_W - 10, SIGNAL_ROW_H, DARK_GREY);
  tft.setTextColor(GREY);
  tft.setTextSize(1);
  tft.setCursor(10, SIGNAL_ROW_Y + 8);
  tft.print(F("ESP32:"));
}

void drawLevelBar(int x, int y, int maxW, int height, int percent) {
  tft.fillRect(x + 1, y + 1, maxW - 2, height - 2, BLACK);

  if (percent == -1) {
    tft.fillRect(x + 1, y + 1, maxW - 2, height - 2, DARK_GREY);
    return;
  }

  int filledW = map(constrain(percent, 0, 100), 0, 100, 0, maxW - 2);

  uint16_t barColour;
  if      (percent >= 50) barColour = DARK_GREEN;
  else if (percent >= 20) barColour = ORANGE;
  else                    barColour = DARK_RED;

  tft.fillRect(x + 1, y + 1, filledW, height - 2, barColour);
}

void updateDisplay() {
  int ohPct = overheadLevel.toInt();
  int ugPct = undergroundLevel.toInt();

  // ── Overhead percentage ──
  tft.fillRect(OH_PCT_X, OH_PCT_Y, 125, 30, BLACK);
  tft.setCursor(OH_PCT_X, OH_PCT_Y);
  tft.setTextSize(3);

  if (overheadLevel == "-1") {
    tft.setTextColor(RED);
    tft.print(F("ERR"));
  } else {
    if      (ohPct >= 50) tft.setTextColor(WHITE);
    else if (ohPct >= 20) tft.setTextColor(ORANGE);
    else                  tft.setTextColor(RED);
    tft.print(overheadLevel + "%");
  }
  drawLevelBar(OH_BAR_X, OH_BAR_Y, OH_BAR_W, BAR_H, ohPct == 0 && overheadLevel == "-1" ? -1 : ohPct);

  // ── Underground percentage ──
  tft.fillRect(UG_PCT_X, UG_PCT_Y, 125, 30, BLACK);
  tft.setCursor(UG_PCT_X, UG_PCT_Y);
  tft.setTextSize(3);

  if (undergroundLevel == "-1") {
    tft.setTextColor(RED);
    tft.print(F("ERR"));
  } else {
    if      (ugPct >= 50) tft.setTextColor(WHITE);
    else if (ugPct >= 20) tft.setTextColor(ORANGE);
    else                  tft.setTextColor(RED);
    tft.print(undergroundLevel + "%");
  }
  drawLevelBar(UG_BAR_X, UG_BAR_Y, OH_BAR_W, BAR_H, ugPct == 0 && undergroundLevel == "-1" ? -1 : ugPct);

  // ── Pump ON/OFF label ──
  tft.fillRect(55, PUMP_ROW_Y + 3, 68, 26, BLACK);
  tft.setCursor(55, PUMP_ROW_Y + 8);
  tft.setTextSize(2);
  if (pumpStatus == "ON") {
    tft.setTextColor(GREEN);
    tft.print(F("ON "));
  } else {
    tft.setTextColor(RED);
    tft.print(F("OFF"));
  }

  // ── Current reading ──
  tft.fillRect(200, PUMP_ROW_Y + 3, 110, 26, BLACK);
  tft.setCursor(200, PUMP_ROW_Y + 8);
  tft.setTextSize(2);
  tft.setTextColor(WHITE);
  tft.print(pumpCurrent + "A");

  // ── System status text ──
  tft.fillRect(65, STATUS_ROW_Y + 3, 245, 22, BLACK);
  tft.setCursor(65, STATUS_ROW_Y + 8);
  tft.setTextSize(1);

  if (systemStatus.indexOf("Err") >= 0 ||
      systemStatus.indexOf("Dry") >= 0 ||
      systemStatus.indexOf("Lock") >= 0) {
    tft.setTextColor(RED);
  } else if (systemStatus.indexOf("Pump") >= 0 ||
             systemStatus.indexOf("Manual") >= 0 ||
             systemStatus.indexOf("Auto") >= 0 ||
             systemStatus.indexOf("Ready") >= 0) {
    tft.setTextColor(GREEN);
  } else if (systemStatus.indexOf("Low") >= 0 ||
             systemStatus.indexOf("Warn") >= 0) {
    tft.setTextColor(ORANGE);
  } else {
    tft.setTextColor(WHITE);
  }
  tft.print(systemStatus);

  // ── Signal / last-update row ──
  tft.fillRect(55, SIGNAL_ROW_Y + 3, SCREEN_W - 65, 22, BLACK);
  tft.setCursor(55, SIGNAL_ROW_Y + 8);
  tft.setTextSize(1);

  if (!dataEverReceived) {
    tft.setTextColor(ORANGE);
    tft.print(F("Waiting for ESP32..."));
  } else {
    unsigned long age = (millis() - lastDataTime) / 1000;
    if (age < 10) {
      tft.setTextColor(GREEN);
      tft.print(F("Connected  Last: "));
    } else if (age < 30) {
      tft.setTextColor(ORANGE);
      tft.print(F("Slow  Last: "));
    } else {
      tft.setTextColor(RED);
      tft.print(F("No signal  Last: "));
    }
    tft.print(age);
    tft.print(F("s ago"));
  }
}

// =================================================================
//  DATA PARSING
// =================================================================

void parseData(const String &data) {
  int idxO = data.indexOf("O:");
  int idxU = data.indexOf("|U:");
  int idxP = data.indexOf("|P:");
  int idxA = data.indexOf("|A:");
  int idxS = data.indexOf("|S:");

  if (idxO == -1 || idxU == -1 || idxP == -1 || idxA == -1 || idxS == -1) {
    Serial.println(F("[PARSE] Malformed packet — ignoring."));
    return;
  }

  overheadLevel    = data.substring(idxO + 2,  idxU);
  undergroundLevel = data.substring(idxU + 3,  idxP);
  pumpStatus       = data.substring(idxP + 3,  idxA);
  pumpCurrent      = data.substring(idxA + 3,  idxS);
  systemStatus     = data.substring(idxS + 3);

  overheadLevel.trim();
  undergroundLevel.trim();
  pumpStatus.trim();
  pumpCurrent.trim();
  systemStatus.trim();

  lastDataTime     = millis();
  dataEverReceived = true;
}

// =================================================================
//  SETUP & LOOP
// =================================================================

void setup() {
  Serial.begin(9600);
  Serial.println(F("[BOOT] HydroSync Arduino Receiver v3.0"));

  uint16_t ID = tft.readID();
  Serial.print(F("[TFT] Detected driver ID: 0x"));
  Serial.println(ID, HEX);

  if (ID == 0xD3D3) ID = 0x9486;  
  if (ID == 0x0000) ID = 0x9341;  

  tft.begin(ID);
  tft.setRotation(1);

  drawInterface();
  Serial.println(F("[BOOT] Ready. Waiting for ESP32 data..."));
}

void loop() {
  if (Serial.available() > 0) {
    String data = Serial.readStringUntil('\n');
    data.trim();

    if (data.startsWith("O:") && data.indexOf("|S:") > 0) {
      Serial.print(F("[RX] "));
      Serial.println(data);
      parseData(data);
      updateDisplay();
    } else {
      Serial.print(F("[RX] Ignored: "));
      Serial.println(data);
    }
  }

  static unsigned long lastRefreshTime = 0;
  if (millis() - lastRefreshTime > 2000) {
    lastRefreshTime = millis();

    tft.fillRect(55, SIGNAL_ROW_Y + 3, SCREEN_W - 65, 22, BLACK);
    tft.setCursor(55, SIGNAL_ROW_Y + 8);
    tft.setTextSize(1);

    if (!dataEverReceived) {
      tft.setTextColor(ORANGE);
      tft.print(F("Waiting for ESP32..."));
    } else {
      unsigned long age = (millis() - lastDataTime) / 1000;
      if (age < 10) {
        tft.setTextColor(GREEN);
        tft.print(F("Connected  Last: "));
      } else if (age < 30) {
        tft.setTextColor(ORANGE);
        tft.print(F("Slow  Last: "));
      } else {
        tft.setTextColor(RED);
        tft.print(F("No signal  Last: "));
      }
      tft.print(age);
      tft.print(F("s ago"));
    }
  }
}
