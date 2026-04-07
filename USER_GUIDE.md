# HydroSync Dashboard - User Manual

## Table of Contents
1. [Overview](#overview)
2. [Dashboard Features](#dashboard-features)
3. [Notification System](#notification-system)
4. [Tank Management](#tank-management)
5. [Pump Control](#pump-control)
6. [System Monitoring](#system-monitoring)
7. [Troubleshooting](#troubleshooting)
8. [Safety Features](#safety-features)
9. [Device Setup Guide](#device-setup-guide)

---

## Overview

HydroSync is an intelligent water management system that provides real-time monitoring, automated controls, and comprehensive notifications for your water tank system. The dashboard offers live analytics, pump control, and safety monitoring to ensure optimal water management.

### Key Features
- **Real-time tank level monitoring**
- **Automated pump control**
- **Live analytics and reporting**
- **Comprehensive notification system**
- **Safety monitoring and alerts**
- **Mobile-responsive interface**

---

## Dashboard Features

### Main Dashboard Layout

#### Live Analytics
- **Water Usage Chart**: 24-hour water consumption tracking
- **Pump Usage Chart**: 24-hour pump operation hours
- **Mode Controls**: Auto/Manual operation modes

#### Live Tank Status
- **Tank Displays**: Real-time tank levels with visual indicators
- **Tank Information**: Name, capacity, and current volume
- **Source Tank Indicators**: Special marking for source tanks (Underground)
- **Level Percentages**: Real-time percentage and liters remaining

#### Pump Control
- **Pump Animation**: Visual pump status with rotation animation
- **Pump Controls**: ON/OFF buttons for manual control
- **Current Monitoring**: Real-time current sensor readings
- **Status Display**: Pump state and safety information

### System Status Panel
- **Connection Status**: Cloud and device connectivity
- **Mode Status**: Current operation mode (Auto/Manual)
- **Pump Status**: Real-time pump state and current readings
- **Safety Status**: Critical alerts and warnings

---

## Notification System

HydroSync provides comprehensive notifications for all critical system events. Notifications are sent to your browser and mobile device.

### Tank Level Notifications

#### Source Tank Alerts (Underground)
- **🚨 Critical Level** (< 10%): 
  - *"Underground Tank is critically low at X%! Please refill immediately."*
  - Triggers automatic pump shutdown for safety

- **⚠️ Low Level** (< 25%): 
  - *"Underground Tank is running low at X%. Use water sparingly."*
  - Recommends water conservation

- **✅ Full Level** (≥ 95%): 
  - *"Underground Tank is full at X%. Water level is optimal."*

#### Secondary Tank Alerts (Overhead)
- **🚨 Minimum Level** (< 15%): 
  - *"Overhead Tank is at minimum level (X%). Please refill soon."*
  - Indicates need for water supply

- **✅ Full Level** (≥ 95%): 
  - *"Overhead Tank is full at X%. Water level is optimal."*

### Pump Safety Notifications

#### Current Sensor Monitoring
- **⚠️ Pump Overload** (Current > 6A): 
  - *"Pump is overloaded! Current: X.XA - Pump turned off for safety."*
  - Automatic safety shutdown

- **⚠️ Dry Run Detection** (Current < 1.5A when pump ON): 
  - *"Pump dry run detected! Current: X.XA - Pump turned off for safety."*
  - Prevents pump damage from running dry

#### Pump Status Changes
- **🟢 Pump Started**: 
  - *"Pump is ON. Current: X.XA"*
  - Confirms pump activation

- **🔴 Pump Stopped**: 
  - *"Pump is OFF"*
  - Confirms pump deactivation

### Connection Monitoring

#### Device Alerts
- **🔌 Connection Lost** (> 60 seconds): 
  - *"Device connection lost. Please check your connection."*
  - Indicates communication failure with your device

---

## Tank Management

### Adding a Device
1. **Find Your Device ID**: Located on the sticker on the bottom of your HydroSync controller unit
2. **Device ID Format**: 2-10 letters, underscore, then 2+ digits (e.g., `HOME_01`, `TANK_02`, `HYDROSYNC_10`)
3. **Enter Device ID**: In the dashboard, tap "Add Device" and enter your Device ID
4. **Copy Your Token**: The system will display your unique 32-character device token - click "Copy" to copy it
5. **Paste Token**: Paste the copied token in the verification field to link the device to your account

### Device Token
- Each device has a **permanent unique token** (32 characters)
- The token is displayed on screen for you to copy during device setup
- Keep your token secure - it verifies ownership of your device
- The token is required once to verify device ownership

### Maximum Devices
- Each user account can have up to **4 devices**
- Switch between devices using the device tabs in the dashboard header

### Tank Configuration
1. **Initial Setup**: Connect to `HydroSync_Setup` WiFi.
2. **Device Sync**: Enter your Device ID in the dashboard.
3. **Calibration**: Set tank depths in the settings for accurate readings.

### Tank Display Features
- **Real-time Levels**: Live percentage and volume display
- **Capacity Information**: Shows current volume vs. total capacity
- **Visual Indicators**: Color-coded status (red=critical, orange=low, blue=full)

---

## Pump Control

### Manual Pump Control
1. **Pump ON Button**: Manually start pump operation
2. **Pump OFF Button**: Manually stop pump operation
3. **Safety Checks**: System verifies source tank levels before activation

### Automated Pump Control
- **Auto Mode**: Pump operates based on tank levels and system logic
- **Safety Override**: Automatic shutdown for critical conditions

---

## System Monitoring

### Live Analytics
- **24-Hour Water Usage**: Daily water consumption tracking
- **24-Hour Pump Usage**: Daily pump operation hours
- **Real-time Updates**: Live data refresh every 15 seconds
- **Daily Reset**: Analytics reset at midnight

### Connection Status
- **Cloud Status**: Real-time communication status
- **Device Status**: Hardware connectivity indicator

---

## Troubleshooting

### Common Issues

#### Tanks Not Displaying
- **Check Configuration**: Ensure device ID is correctly entered
- **Refresh Dashboard**: Reload page to initialize tank displays

#### Pump Not Responding
- **Check Connection**: Verify device is online
- **Safety Status**: Check for safety shutdown conditions (Dry Run)

#### AI Not Responding
- **Network Connection**: Ensure stable internet connection
- **Cloud Status**: Check if the system is online

---

## Safety Features

### Automatic Safety Shutdowns
- **Source Tank Critical**: Pump stops when source tank < 10%
- **Pump Overload**: Pump stops when current > 6A
- **Dry Run Protection**: Pump stops when current < 1.5A
- **Connection Loss**: System alerts when device communication fails

### Safety Monitoring
- **Real-time Current Monitoring**: Continuous pump current tracking
- **Tank Level Monitoring**: Continuous water level tracking
- **Connection Monitoring**: Automatic communication failure detection

---

## Device Setup Guide

### Step-by-Step Device Registration

#### Step 1: Locate Your Device ID
- Find the sticker on the bottom of your HydroSync controller unit
- The Device ID follows the format: **2-10 letters + underscore + 2+ digits**
- Examples: `HOME_01`, `TANK_02`, `HYDROSYNC_10`

#### Step 2: Add Device in Dashboard
1. Open the HydroSync app
2. Tap **"+ Add Device"** in the header
3. Enter your Device ID exactly as shown on the sticker
4. Tap **"Continue"**

#### Step 3: Copy Your Token
1. Review your device information on screen
2. Your 32-character device token will be displayed
3. Click **"Copy"** to copy the token to your clipboard
4. Click **"I have copied my token — Enter it"** to continue

#### Step 4: Paste and Verify Token
1. Paste the token you copied into the verification field
2. Click **"Verify Token"**
3. Your device is now linked to your account!

#### Step 5: Device Linked!
- Your device is now linked to your account
- You can rename it and set tank capacities in Settings

### Troubleshooting Device Setup

| Problem | Solution |
|---------|----------|
| "Device not found" | Check the Device ID spelling. Contact support if issue persists. |
| "Device already linked" | This device belongs to another account. Contact support. |
| Token not copying | Manually select and copy the token text |
| "Incorrect token" | Make sure you copied the entire 32-character token correctly |

---

## System Requirements

### Browser Compatibility
- **Chrome**: Version 80 or higher
- **Firefox**: Version 75 or higher
- **Safari**: Version 13 or higher
- **Edge**: Version 80 or higher

### Mobile Support
- **Responsive Design**: Optimized for mobile devices
- **Mobile App**: Native Android support (APK)

---

## Support and Maintenance

### Regular Maintenance
- **Monitor Tank Levels**: Check levels regularly
- **Clean Sensors**: Maintain sensor cleanliness
- **Update System**: Keep software updated

### Getting Help
- **AI Chatbot**: Tap the 'Bot' icon for instant troubleshooting
- **Contact Support**: support@hydrosync.co.ke
- **In-App**: Settings > Contact Admin

---

## Version Information

**HydroSync Dashboard v2.1**
- **Last Updated**: April 2026
- **Features**: Real-time monitoring, AI diagnostics, safety systems, email token delivery
- **Compatibility**: Modern browsers, mobile devices
- **Device Limit**: Up to 4 devices per user

*This manual covers all current features of the HydroSync dashboard. For additional support or feature requests, please contact your system administrator.*
