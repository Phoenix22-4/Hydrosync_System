export const USER_DOCUMENTATION = `
# HydroSync User Manual & Troubleshooting Guide

## 1. System Overview
HydroSync is an IoT-based, dual-tank autonomous water management system engineered for environments with unreliable mains power and inconsistent water supply. It intelligently manages water transfer from an underground reservoir to an overhead tank.

## 2. Understanding Tank Levels
- **Green (50% - 100%):** Healthy water levels. No action needed.
- **Orange (20% - 49%):** Water is getting low. The system will likely trigger the pump soon if the overhead tank is in this range.
- **Red (< 20%):** Urgent! If the underground tank is red, the pump will NOT start to prevent "Dry Run" damage.

## 3. Pump Status & Controls
- **Auto Mode:** The system handles everything. It turns the pump ON when the overhead tank is low and OFF when it's full.
- **Manual Override:** You can manually turn the pump ON/OFF from the dashboard, but the system will still override you if it detects a safety risk (like an empty underground tank).
- **Hardware Override:** A physical DPDT switch (E-TEN132) provides a manual override capability independent of the firmware.

## 4. Troubleshooting Common Issues
### Issue: Pump won't turn on
- **Check Underground Tank:** If it's below 10%, the system locks the pump to prevent damage. Wait for the underground tank to refill.
- **Check Overhead Tank:** If it's already full, the pump won't start.
- **Check for Alerts:** Look for a "DRY RUN ERROR" alert. If found, you must press the "RESET" button on the dashboard.

### Issue: Device is "Offline"
- **Power:** Ensure the HydroSync controller at your tank has power.
- **Internet:** Check if your home Wi-Fi is working. The device needs a stable connection to send data.
- **Wait:** Sometimes the device takes 1-2 minutes to reconnect after a power flicker.

### Issue: Inaccurate Levels
- **Sensor Cleaning:** Occasionally, dust or mineral buildup on the sensors can cause wrong readings. Clean the AJ-SR04M sensor probes gently with a damp cloth.

## 5. Adding a New Device
- Go to **Settings** > **Device Info**.
- Tap **"Add New Device"**.
- Enter the **Device ID** (found on the sticker on your controller).
- A verification token will be sent to your email. Enter it to link the device to your account.
`;

export const ADMIN_DOCUMENTATION = `
# HydroSync — Technical Documentation v2.0

## 1. System Overview
HydroSync is an IoT-based, dual-tank autonomous water management system. The primary embedded brain is an **ESP32-WROOM-32** microcontroller. A secondary **Arduino Mega 2560** with a 2.8" TFT touch shield provides the local user interface.

## 2. Hardware Architecture
- **Microcontroller:** ESP32-WROOM-32 (Dual-core 240MHz).
- **Display:** Arduino Mega 2560 + 2.8" TFT Shield.
- **Water Level Sensors:** AJ-SR04M waterproof ultrasonic distance sensors (20cm to 450cm range).
- **Current Sensing:** ZHT103 CT Module (Replaces ACS712) for dry-run protection.
- **Pump Control:** SSR-40DA Solid-State Relay (3-32V DC control, 240V AC load).
- **Manual Override:** DPDT Switch (E-TEN132, 15A/250V AC).

## 3. Power Subsystem
- **Primary Input:** 5V 2A Mains Charger.
- **Backup:** 18650 Lithium Cell (3000mAh) with TP4056 charger and MT3608 boost converter.
- **Resilience:** Diode OR-ing (1N5819) ensures zero-downtime battery failover.
- **Capacitors:** 1000µF electrolytic for WiFi TX bursts; 100nF ceramic bypass caps for sensors and ICs.

## 4. Firmware & Connectivity
- **Platform:** ESP32 Arduino Core (C++).
- **Connectivity:** WiFi (2.4GHz) + MQTT (HiveMQ Cloud).
- **Security:** TLS 1.2 encryption on port 8883.
- **MQTT Topics:**
  - \`hydrosync/data/HydroSync_001\`: Telemetry JSON every 15s.
  - \`hydrosync/commands/HydroSync_001\`: Remote commands (PUMP_ON, PUMP_OFF, etc.).
  - \`hydrosync/alerts/HydroSync_001\`: Critical events (dry run, empty tank).
  - \`hydrosync/status/HydroSync_001\`: LWT "online"/"offline" status.

## 5. Dry-Run Detection Logic
- Pump relay commanded ON.
- 3-second startup grace period.
- ZHT103 OUT sampled via GPIO 34. True RMS calculated over 60ms window.
- If current < **DRY_RUN_THRESHOLD_A** for > 45s continuously:
  - Pump relay switched OFF immediately.
  - systemStatus = "DRY RUN ERROR".
  - MQTT alert published to cloud.
  - Requires **RESET_ERROR** command to restart.
`;
