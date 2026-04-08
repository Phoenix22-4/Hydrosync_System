# HydroSync System - Technical Documentation (v2.0)

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Notification System Implementation](#notification-system-implementation)
3. [MQTT Communication](#mqtt-communication)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Configuration Management](#configuration-management)
7. [Deployment Guide](#deployment-guide)
8. [Monitoring and Logging](#monitoring-and-logging)
9. [Security Considerations](#security-considerations)
10. [Version History](#version-history)

---

## System Architecture

### Overview
HydroSync is an IoT-based, dual-tank autonomous water management system engineered for environments with unreliable mains power and inconsistent water supply. It provides real-time monitoring, automated pump control, and AI-driven diagnostics.

### Technology Stack
- **Microcontrollers**: ESP32-WROOM-32 (Main Brain) + Arduino Mega 2560 (UI Controller)
- **Frontend**: React 18 (TypeScript), Tailwind CSS, Framer Motion
- **Real-time Communication**: MQTT over TLS 1.2 via HiveMQ Cloud
- **Database**: Firebase Firestore (NoSQL)
- **Authentication**: Firebase Auth (Google & Email/Password)
- **AI Engine**: Google Gemini Pro (via @google/genai)
- **Deployment**: Firebase Hosting

### Component Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │◄──►│   Firebase      │◄──►│   Firestore     │
│   (Dashboard)   │    │   (Backend)     │    │   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                       ▲
         │              ┌─────────────────┐
         │              │   HiveMQ Cloud  │
         └─────────────►│   (MQTT Bridge) │
                        └─────────────────┘
                                 ▲
                        ┌─────────────────┐
                        │   IoT Device    │
                        │   (ESP32/Mega)  │
                        └─────────────────┘
```

---

## Notification System Implementation

### Notification Types and Triggers

#### Tank Level Notifications
- **Critical Low (< 10%)**: Triggered when the source tank is nearly empty. Prevents pump activation.
- **Low Level (< 25%)**: Warning to use water sparingly.
- **Full Level (> 95%)**: Confirmation of optimal water storage.

#### Pump Safety Notifications (Dry-Run Protection)
- **Dry-Run Detected**: Triggered by ZHT103 current sensor when current drops below 1.5A while pump is active.
- **Overload Detected**: Triggered when current exceeds 6.0A, indicating mechanical blockage.
- **Manual Override**: Notifies when the physical DPDT switch is toggled to manual mode.

#### Connection Monitoring
- **Heartbeat Timeout**: Triggered if the device fails to publish telemetry for > 60 seconds.
- **LWT (Last Will and Testament)**: MQTT broker publishes "offline" status if the TCP connection is severed.

---

## MQTT Communication

### Connection Management
- **Protocol**: MQTT v3.1.1 over Port 8883 (TLS)
- **Broker**: HiveMQ Cloud Cluster
- **Security**: TLS 1.2 with Root CA verification

### Data Flow
1. **Device → MQTT**: ESP32 publishes telemetry JSON every 15s.
2. **MQTT → Bridge**: A cloud function/bridge listens to MQTT and updates Firestore.
3. **Firestore → Dashboard**: React app listens to Firestore snapshots for real-time UI updates.
4. **Dashboard → MQTT**: Control commands (PUMP_ON/OFF) are published to the command topic.

### Message Format (Telemetry)
```json
{
  "overhead_level": 75.5,
  "underground_level": 45.2,
  "pump_status": 1,
  "pump_current": 3.2,
  "system_status": "normal",
  "mode": "auto",
  "uptime": 12450
}
```

---

## Database Schema

### Device Document (`/devices/{deviceId}`)
- `name`: String (e.g., "Home Tank")
- `ownerId`: String (Firebase UID)
- `overhead_level`: Number (0-100)
- `underground_level`: Number (0-100)
- `pump_status`: Boolean
- `pump_current`: Number (Amps)
- `last_seen`: Timestamp
- `config`: Map (depths, thresholds)

### Telemetry History (`/devices/{deviceId}/history/{readingId}`)
- `level_1`: Number
- `level_2`: Number
- `current`: Number
- `timestamp`: Timestamp

---

## API Endpoints

### MQTT Topics
- **Telemetry**: `hydrosync/data/[DEVICE_ID]`
- **Commands**: `hydrosync/commands/[DEVICE_ID]`
- **Alerts**: `hydrosync/alerts/[DEVICE_ID]`
- **Status**: `hydrosync/status/[DEVICE_ID]`

### HTTP Endpoints (Internal)
- **AI Diagnostics**: `POST /api/ai_chat` (Proxied to Gemini)
- **Admin Verification**: `GET /setup_Adminaqua`

---

## Admin Portal Functionality

The HydroSync Admin Portal is a centralized management interface for system administrators to oversee the entire ecosystem.

### 1. Device Management
- **Fleet Overview**: Real-time status monitoring of all deployed ESP32 units.
- **Remote Configuration**: Update tank depths, sensor calibration offsets, and safety thresholds (e.g., `DRY_RUN_THRESHOLD_A`) over-the-air.
- **Command Override**: Force pump states or reset device errors remotely in emergency situations.
- **Firmware Tracking**: Monitor current firmware versions and schedule OTA updates.

### 2. User Administration
- **Account Auditing**: Review user profiles, login history, and associated devices.
- **Role Management**: Assign or revoke administrative privileges.
- **Support Integration**: Direct access to user support tickets and AI chatbot logs for manual intervention.
- **Email Verification**: Manually verify user accounts or trigger password resets.

### 3. System Maintenance Tasks
- **Database Cleanup**: Automated archiving of historical telemetry data to maintain Firestore performance.
- **Bridge Health Monitoring**: Real-time status of the MQTT-Firestore bridge (see [MQTT Bridge Setup](#mqtt-bridge-setup)).
- **Log Rotation**: Management of system-wide action logs and error reports.
- **Backup Procedures**: Weekly snapshots of the Firestore database and configuration state.

---

## MQTT Bridge Setup

The "HydroSync Bridge" is a critical Node.js service that synchronizes data between the HiveMQ broker and Firestore.

### Implementation
Refer to the `MQTT_BRIDGE_TEMPLATE.md` file for the complete reference implementation.
- **Listener**: Subscribes to `devices/+/telemetry` to update Firestore in real-time.
- **Publisher**: Listens to the `commands` collection in Firestore to push instructions to devices.
- **Heartbeat**: Updates `system/bridge_status` every 20 seconds to signal operational health.

---

## Security Protocols

### 1. Data Integrity
- **UID Scoping**: Every Firestore document is strictly scoped to the owner's UID using Firebase Security Rules.
- **Payload Validation**: All incoming MQTT telemetry is validated for schema consistency before being committed to the database.

### 2. Access Control
- **Admin Verification Gate**: Access to the admin portal requires a specific verification token and a verified admin role.
- **TLS 1.2**: All communication between the ESP32, MQTT Broker, and Cloud Backend is encrypted.

### 3. Emergency Protocols
- **Hardware Supreme Rule**: Local hardware safety logic (e.g., dry-run shutoff) is autonomous and cannot be disabled by cloud commands.
- **Danger Zone**: Critical actions like "Reset All Data" require multi-step confirmation and are logged with the performing admin's UID.

---

## Configuration Management

### Hardware GPIO Pinout (ESP32)
| GPIO Pin | Signal Name | Function |
|----------|-------------|----------|
| GPIO 23 | PUMP_RELAY_PIN | Digital Output — Controls SSR-40DA relay |
| GPIO 19 | OVERHEAD_TRIG_PIN | Digital Output — Overhead sensor trigger |
| GPIO 18 | OVERHEAD_ECHO_PIN | Digital Input — Overhead sensor echo |
| GPIO 26 | UNDERGROUND_TRIG_PIN | Digital Output — U/G sensor trigger |
| GPIO 27 | UNDERGROUND_ECHO_PIN | Digital Input — U/G sensor echo |
| GPIO 34 | ZHT103_ANALOG_PIN | Analog Input — ZHT103 Current Sensor |

### Environment Variables
- `VITE_FIREBASE_API_KEY`: Firebase Auth/Firestore key
- `GEMINI_API_KEY`: Google AI SDK key
- `MQTT_BROKER_URL`: HiveMQ Cluster address
- `MQTT_USERNAME/PASSWORD`: Device credentials

### Firmware Provisioning and Secrets
- The current ESP32 firmware stores WiFi and HiveMQ credentials in NVS flash on the device.
- The file `firmware/secrets.h` now contains only the HiveMQ Root CA certificate, which is public and safe to include in firmware.
- Device-specific secrets are not hardcoded in `secrets.h` anymore.
- On first boot or after factory reset, the ESP32 starts the captive portal network `HydroSync_Setup` and serves the setup page at `http://192.168.4.1/`.
- The setup portal collects:
  - WiFi SSID
  - WiFi Password
  - Device ID
  - HiveMQ Host
  - HiveMQ Username
  - HiveMQ Password
- After configuration, the device saves credentials to NVS and connects to WiFi and MQTT broker.
- Factory reset: Hold BOOT button (GPIO 0) low to GND for 5 seconds to erase credentials and restart portal.
- On first boot or after factory reset, the ESP32 starts the captive portal network `HydroSync_Setup` and serves the setup page at `http://192.168.4.1/`.
- The setup portal collects:
  - WiFi SSID
  - WiFi Password
  - Device ID
  - HiveMQ Host
  - HiveMQ Username
  - HiveMQ Password

### Factory Reset
- The factory reset button is connected to **GPIO 0**.
- Hold the BOOT button (GPIO 0) low to GND for 5 seconds while powered on.
- This erases saved credentials and forces the device back into captive portal setup mode.

### ESP32 → Arduino TFT Communication
- The ESP32 communicates with the Arduino Mega/TFT display over UART Serial2.
- The firmware uses **GPIO16** and **GPIO17** for this serial link.
- This connection delivers tank telemetry and pump status to the display controller.
- Verify the wiring if the TFT does not show updated readings after device startup.

### Gemini API and Deployment
- Set `GEMINI_API_KEY` in your local `.env.local` file with your Google Gemini key.
- Set `APP_URL` to the deployed web app URL used by your hosting environment.
- Example `.env.local`:
```
GEMINI_API_KEY="AIzaSyDZ3lsOhZ4HRY9JmZlgulOjRrZ5KYZWdpk"
APP_URL="https://your-app-url.example"
```
- Do not commit `.env.local` to source control.

---

## Deployment Guide

### Production Checklist
- [ ] Firebase Security Rules deployed (UID-based locking)
- [ ] HiveMQ TLS certificates embedded in ESP32 firmware
- [ ] ZHT103 current sensor calibrated with clamp meter
- [ ] 1000µF capacitor installed on 5V rail for WiFi stability
- [ ] IP65-rated enclosure sealed for outdoor deployment

---

## Monitoring and Logging

### System Monitoring
- **Dashboard Heartbeat**: Visual "Online/Offline" indicator based on `last_seen` timestamp.
- **Current Graphing**: Real-time plotting of pump current to detect motor wear.

### Troubleshooting Reference

| Symptom | Diagnosis & Solution |
|---------|----------------------|
| TFT shows nothing | Check Serial2 baud rate (9600). Verify GPIO16/17 → Mega RX1/TX1. |
| Sensor reads 0% always | Verify ECHO pin voltage. Check for obstacles in 20cm blind zone. |
| ZHT103 reads 0.00A | Check VCC = 5V. Verify OUT → GPIO34. Adjust trimpot clockwise. |
| False DRY RUN ERROR | `CT_CALIBRATION` or `DRY_RUN_THRESHOLD_A` too high. Calibrate with clamp meter. |
| MQTT fails (rc=-4) | TLS certificate mismatch. Update `HIVEMQ_ROOT_CA` in `secrets.h`. |
| Dashboard offline | LWT triggered. ESP32 crashed or WiFi lost. Check `client.loop()` frequency. |
| System resets on failover | Check diode polarity. Ensure 1000µF cap is installed on 5V rail. |

### Error Logging
- **Firmware Logs**: Serial output (115200 baud) for local debugging.
- **Cloud Logs**: Firebase Console logs for authentication and database errors.

---

## Security Considerations

### Authentication
- **User Auth**: Firebase Authentication with mandatory email verification.
- **Device Auth**: MQTT credentials unique per device, stored in secure flash.

### Data Protection
- **Firestore Rules**: Strict `allow read, write: if request.auth.uid == resource.data.ownerId`.
- **TLS Encryption**: All data in transit (MQTT and HTTPS) is encrypted via TLS 1.2.

---

## Token System

### Permanent Device Tokens
Each device has a **permanent 32-character token** generated when the device is first registered in the system.

#### Token Flow
1. Device is created in Firestore with a unique token (32 characters)
2. User enters Device ID in AddDevice page
3. System retrieves the permanent token from Firestore
4. System displays the token on screen for the user to copy
5. User copies the token to their clipboard
6. User pastes the token in the verification field
7. System verifies the token matches the device record
8. Device is linked to user's account

#### Token Display in AddDevice.tsx (Step 2)
The system displays the device information and token for the user to copy:

```typescript
function Step2SendToken({ device, onTokenSent }: Step2Props) {
  const [copied, setCopied] = useState(false);

  const copyToken = useCallback(() => {
    navigator.clipboard.writeText(device.permanentToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [device.permanentToken]);

  return (
    <div>
      {/* Device info display */}
      <div>Device ID: {device.deviceId}</div>
      <div>Device Name: {device.name}</div>
      <div>Your Email: {maskEmail(user?.email || '')}</div>
      
      {/* Token Display with Copy Button */}
      <div>
        <span>Your Device Token</span>
        <button onClick={copyToken}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <code>{device.permanentToken}</code>
      </div>
      
      <button onClick={onTokenSent}>
        I have copied my token — Enter it →
      </button>
    </div>
  );
}
```

#### Token Display in ConfirmToken.tsx
```typescript
const TokenDisplay = ({ deviceId, deviceToken, userEmail }) => {
  const [copied, setCopied] = useState(false);

  const copyToken = () => {
    navigator.clipboard.writeText(deviceToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div>Device ID: {deviceId}</div>
      <div>Your Email: {maskEmail(userEmail)}</div>
      <div>
        <span>Your Device Token (32 characters)</span>
        <button onClick={copyToken}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <code>{deviceToken}</code>
      </div>
    </div>
  );
};
```

#### Token Verification
The token is verified directly against the device record in Firestore:

```typescript
const deviceRef = doc(db, 'devices', deviceId);
const deviceSnap = await getDoc(deviceRef);
const deviceData = deviceSnap.data();

if (deviceData.token !== token) {
  setError("Incorrect token. Please copy the token displayed above and paste it here.");
  return;
}

// Token is valid - link device to user
await updateDoc(deviceRef, {
  assigned_to_user: user.uid,
  status: 'active'
});
```

---

## Superuser Role

### Superuser Account
The superuser has **full control** over the entire system.

**Email**: `visiontech072025@gmail.com`

### Privileges
- Read/write access to ALL collections
- Admin panel access
- Email sender for automated tokens
- Can manage all users and devices
- Cannot be blocked or demoted

### Firestore Rules
```javascript
function isSuperuser() {
  return isAuthenticated() && 
    request.auth.token.email == "visiontech072025@gmail.com";
}
```

### Admin Role
Other admins can be created with role `admin` in Firestore users collection. They have most privileges but cannot:
- Access superuser-only functions
- Modify other admin accounts

---

## Device ID Format

### Structure
Device IDs follow a specific format for consistency and validation:

**Pattern**: `2-10 uppercase letters + underscore + 2+ digits`

**Regex**: `^[A-Z]{2,10}_[0-9]{2,}$`

### Examples
| Device ID | Valid? | Notes |
|-----------|--------|-------|
| `HOME_01` | Yes | 4 letters, 2 digits |
| `TANK_02` | Yes | 4 letters, 2 digits |
| `HYDROSYNC_10` | Yes | 9 letters, 2 digits |
| `AB_99` | Yes | 2 letters, 2 digits |
| `MYDEVICE_001` | Yes | 8 letters, 3 digits |

### Implementation
- Validated in AddDevice.tsx and CreateAccount.tsx
- Firestore uses device_id as document ID
- MQTT topics use wildcard pattern `device/+/data`

---

## Cloud Functions

### Available Functions

#### sendDeviceTokenEmail
**Trigger**: onCreate on `email_tokens` collection

Sends an email with the device token to the user when a new email_tokens document is created.

#### requestDeviceTokenEmail
**Type**: HTTP Callable

Can be called directly from client apps to request a token email.

### Deployment
```bash
cd functions
npm install
firebase functions:config:set sendgrid.key="YOUR_API_KEY"
npm run deploy
```

### Environment Variables
- `sendgrid.key` - SendGrid API key for email sending

---

## Version History

### v2.2 (Current)
- **Token Display System** - 32-character token displayed on screen for user to copy (no email)
- **Simplified Device Linking** - Direct copy/paste flow without email dependency
- **Superuser Role** - Full system control for visiontech072025@gmail.com
- **Flexible Device ID Format** - 2-10 letters + underscore + 2+ digits
- **Admin Documentation Viewer** - In-app docs at /admin/docs

### v2.1
- ~~Email Token Delivery~~ (deprecated - replaced with on-screen display)
- Permanent Device Token System

### v2.0
- **Dual-Core ESP32 Integration**
- **MQTT over TLS 1.2 Support**
- **AI-Powered Troubleshooting (Gemini)**
- **Mobile Deep Linking & APK Support**
- **ZHT103 Dry-Run Protection Logic**

### v1.0
- Basic HTTP polling for tank levels
- Simple relay control
- Local TFT display only
