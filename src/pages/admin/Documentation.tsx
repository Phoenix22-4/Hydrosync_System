import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../App';
import { motion } from 'motion/react';
import { ArrowLeft, Book, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';

// Documentation sections
const DOC_SECTIONS = [
  {
    id: 'architecture',
    title: 'System Architecture',
    content: `
## Overview
HydroSync is an IoT-based, dual-tank autonomous water management system engineered for environments with unreliable mains power and inconsistent water supply. It provides real-time monitoring, automated pump control, and AI-driven diagnostics.

## Technology Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Firebase (Firestore, Auth, Cloud Functions)
- **MQTT**: HiveMQ for real-time device communication
- **Hardware**: ESP32/ESP8266 microcontrollers

## Key Components
1. **User Dashboard** - Real-time tank visualization and controls
2. **Admin Panel** - System management and monitoring
3. **MQTT Bridge** - Handles device communication
4. **Cloud Functions** - Email sending, automation
    `
  },
  {
    id: 'device-id',
    title: 'Device ID Format',
    content: `
## Device ID Structure
Device IDs follow a specific format for consistency and validation:

**Pattern**: \`2-10 uppercase letters + underscore + 2+ digits\`

**Regex**: \`^[A-Z]{2,10}_[0-9]{2,}$\`

## Examples
| Device ID | Valid? | Notes |
|-----------|--------|-------|
| \`HOME_01\` | Yes | 4 letters, 2 digits |
| \`TANK_02\` | Yes | 4 letters, 2 digits |
| \`HYDROSYNC_10\` | Yes | 9 letters, 2 digits |
| \`AB_99\` | Yes | 2 letters, 2 digits |
| \`MYDEVICE_001\` | Yes | 8 letters, 3 digits |

## Implementation
- Validated in AddDevice.tsx and CreateAccount.tsx
- Firestore uses device_id as document ID
- MQTT topics use wildcard pattern \`device/+/data\`
    `
  },
  {
    id: 'token-system',
    title: 'Token System',
    content: `
## Permanent Device Tokens
Each device has a **permanent 32-character token** generated when the device is first registered in the system.

### Token Flow
1. Device is created in Firestore with a unique token
2. User enters Device ID in AddDevice page
3. System retrieves the permanent token from Firestore
4. User clicks "Send Token to My Email"
5. Cloud Function sends email via SendGrid from superuser email
6. User enters token to verify ownership
7. Device is linked to user's account

### Email Sending
- **Sender**: visiontech072025@gmail.com (superuser)
- **Provider**: SendGrid
- **Trigger**: Creating document in \`email_tokens\` collection

### Firestore Collections
\`\`\`
email_tokens/{id}
  - to: string (user email)
  - deviceId: string
  - deviceName: string
  - token: string (32-char permanent token)
  - status: "pending" | "sent" | "failed"
  - createdAt: timestamp
\`\`\`
    `
  },
  {
    id: 'superuser',
    title: 'Superuser Role',
    content: `
## Superuser Account
The superuser has **full control** over the entire system.

**Email**: \`visiontech072025@gmail.com\`

### Privileges
- Read/write access to ALL collections
- Admin panel access
- Email sender for automated tokens
- Can manage all users and devices

### Firestore Rules
\`\`\`javascript
function isSuperuser() {
  return isAuthenticated() && 
    request.auth.token.email == "visiontech072025@gmail.com";
}
\`\`\`

### Admin Role
Other admins can be created with role \`admin\` in Firestore users collection. They have most privileges but cannot:
- Access superuser-only functions
- Modify other admin accounts
    `
  },
  {
    id: 'mqtt',
    title: 'MQTT Communication',
    content: `
## MQTT Topics
Devices communicate via MQTT through HiveMQ broker.

### Topics Structure
\`\`\`
# Device publishes telemetry
hydrosync/device/{DEVICE_ID}/data

# Server sends commands
hydrosync/device/{DEVICE_ID}/command

# Device status updates
hydrosync/device/{DEVICE_ID}/status
\`\`\`

### Payload Format
\`\`\`json
{
  "device_id": "HOME_01",
  "overhead_level": 75,
  "underground_level": 50,
  "pump_status": false,
  "timestamp": 1712505600
}
\`\`\`

### Security
- TLS encrypted connections
- Username/password authentication
- Wildcard subscriptions for admin monitoring
    `
  },
  {
    id: 'firestore',
    title: 'Firestore Schema',
    content: `
## Collections

### users/{uid}
\`\`\`javascript
{
  name: string,
  email: string,
  status: "pending" | "active" | "blocked",
  role: "user" | "admin" | "superuser",
  device_ids: string[],
  created_at: timestamp
}
\`\`\`

### devices/{device_id}
\`\`\`javascript
{
  device_id: string,        // e.g. "HOME_01"
  token: string,            // 32-char permanent token
  name: string,             // User-defined name
  assigned_to_user: string, // User UID
  status: "unassigned" | "active" | "blocked",
  ohCap: number,            // Overhead tank capacity
  ugCap: number,            // Underground tank capacity
  region: string,
  mqtt_topic: string,
  last_seen: timestamp
}
\`\`\`

### telemetry/{auto-id}
\`\`\`javascript
{
  device_id: string,
  overhead_level: number,   // 0-100%
  underground_level: number, // 0-100%
  pump_status: boolean,
  recorded_at: timestamp
}
\`\`\`
    `
  },
  {
    id: 'cloud-functions',
    title: 'Cloud Functions',
    content: `
## Available Functions

### sendDeviceTokenEmail
**Trigger**: onCreate on \`email_tokens\` collection

Sends an email with the device token to the user when a new email_tokens document is created.

### requestDeviceTokenEmail
**Type**: HTTP Callable

Can be called directly from client apps to request a token email.

## Deployment
\`\`\`bash
cd functions
npm install
firebase functions:config:set sendgrid.key="YOUR_API_KEY"
npm run deploy
\`\`\`

## Environment Variables
- \`sendgrid.key\` - SendGrid API key for email sending
    `
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    content: `
## Common Issues

### Permission Denied Errors
**Cause**: Firestore security rules blocking access

**Solution**: 
1. Check user is authenticated
2. Verify user has correct role
3. Check Firestore rules in Firebase Console

### Device Not Found
**Cause**: Device ID not in Firestore

**Solution**:
1. Verify device exists in \`devices\` collection
2. Check device_id matches exactly (case-sensitive)
3. Run seed script to create test devices

### Email Not Received
**Cause**: SendGrid not configured or email in spam

**Solution**:
1. Check SendGrid API key is set
2. Verify sender email is verified in SendGrid
3. Check spam folder
4. Review Cloud Function logs

### MQTT Not Connecting
**Cause**: Network or credentials issue

**Solution**:
1. Check MQTT broker is running
2. Verify device credentials
3. Check firewall rules
4. Review MQTT bridge logs

## Debug Mode
Enable debug logging in browser console:
\`\`\`javascript
localStorage.setItem('debug', 'hydrosync:*');
\`\`\`
    `
  },
  {
    id: 'environment-setup',
    title: 'Environment Setup (Netlify)',
    content: `
## Environment Variables
Configure these in Netlify dashboard under Site Settings > Environment Variables.

### Required Variables
| Variable | Description | Example |
|----------|-------------|---------|
| \`VITE_MQTT_USERNAME\` | MQTT broker username | \`superuser\` |
| \`VITE_MQTT_PASSWORD\` | MQTT broker password | \`your-secure-password\` |
| \`VITE_GEMINI_API_KEY\` | Google Gemini AI API key | \`AIzaSy...\` |

### Setting Up in Netlify
1. Go to Site Settings > Environment Variables
2. Click "Add a variable"
3. Enter key-value pairs
4. Deploy to apply changes

### MQTT Credentials
The MQTT username and password are used for:
- Admin MQTT bridge connection
- Device authentication
- Real-time telemetry updates

### Gemini AI Integration
The Gemini API key enables:
- AI-powered chatbot assistance
- Diagnostic recommendations
- Natural language queries

## Local Development
Create a \`.env\` file in the project root:
\`\`\`
VITE_MQTT_USERNAME=your_username
VITE_MQTT_PASSWORD=your_password
VITE_GEMINI_API_KEY=your_api_key
\`\`\`
    `
  },
  {
    id: 'user-flow',
    title: 'User Registration Flow',
    content: `
## Complete User Journey

### Step 1: Create Account
1. User visits landing page or opens mobile app
2. Clicks "Create Account"
3. Enters name, email, password, and optional Device ID
4. Firebase Auth creates account
5. Verification email is sent automatically

### Step 2: Email Verification
1. User receives email from Firebase
2. Clicks verification link
3. Email status updates in Firebase Auth
4. User can now proceed to token confirmation

### Step 3: Token Confirmation
1. After email verification, user sees device token
2. Token is displayed with copy button
3. User copies token and pastes it
4. System verifies token matches device record
5. Device status changes to "active"
6. User status changes to "active"

### Step 4: Device Setup
1. First-time dashboard visit triggers setup gate
2. User enters device name, tank capacities, region
3. Device is fully configured

### Step 5: Normal Operation
- Real-time telemetry via MQTT
- Pump control from dashboard
- Alerts and notifications
- History and analytics access

## Status States
| Status | Description |
|--------|-------------|
| \`pending\` | Email not verified or token not confirmed |
| \`active\` | Fully verified and operational |
| \`blocked\` | Account suspended by admin |
    `
  },
  {
    id: 'admin-features',
    title: 'Admin Panel Features',
    content: `
## Admin Dashboard
- **Overview**: System statistics, device counts, user counts
- **Recent Alerts**: Last 5 critical alerts
- **Quick Actions**: Navigation to all admin sections

## Device Management
- View all registered devices
- Real-time status monitoring
- Edit device details (name, capacities, region)
- Assign/unassign devices to users
- View telemetry history
- Block/unblock devices

## User Management
- View all registered users
- Filter by status (pending, active, blocked)
- Edit user details
- Change user roles (user, admin)
- Block/unblock accounts
- View user's devices

## MQTT Host Management
- Add multiple MQTT brokers
- Test broker connectivity
- Assign brokers to specific devices
- Set global default broker

## System Settings
- Account management
- Notification preferences
- Data export (CSV)
- System reset options

## Alerts & Logs
- View all system alerts
- Mark alerts as read
- Activity log with timestamps
- Filter by device, user, or action type

## Charts & Analytics
- Aggregate water usage charts
- Power consumption trends
- Device comparison graphs
- Date range filtering
    `
  },
  {
    id: 'pwa-installation',
    title: 'PWA Installation',
    content: `
## Progressive Web App (PWA)

### What is PWA?
HydroSync can be installed as a standalone app on desktop and mobile devices, providing:
- Offline capability
- Home screen icon
- Full-screen experience
- Push notifications

### Installing on Desktop (Chrome/Edge)
1. Visit the HydroSync website
2. Click the install icon in address bar
3. Or use menu > "Install HydroSync"
4. App opens in its own window

### Installing on Mobile (Android)
1. Visit the website in Chrome
2. Tap menu (three dots)
3. Select "Add to Home Screen"
4. Tap "Install"
5. App icon appears on home screen

### Installing on iOS
1. Visit the website in Safari
2. Tap the share button
3. Select "Add to Home Screen"
4. Tap "Add"
5. App icon appears on home screen

### PWA vs Native App
| Feature | PWA | Native APK |
|---------|-----|-----------|
| Installation | Browser | APK file |
| Updates | Automatic | Manual |
| Offline | Limited | Full |
| Push Notifications | Yes | Yes |
| App Store | No | No |

### Admin PWA
The admin panel is also PWA-enabled. When installed:
- Opens directly to Admin Login
- No landing page shown
- Full admin functionality
    `
  },
  {
    id: 'mobile-apk',
    title: 'Mobile APK (Capacitor)',
    content: `
## Building Android APK

### Prerequisites
- Node.js 18+
- Android Studio
- Java JDK 17+
- Gradle

### Build Steps
\`\`\`bash
# 1. Build the web app
npm run build

# 2. Sync with Capacitor
npx cap sync android

# 3. Open in Android Studio
npx cap open android

# 4. Build APK in Android Studio
# Build > Build Bundle(s) / APK(s) > Build APK(s)
\`\`\`

### APK Output Location
\`\`\`
android/app/build/outputs/apk/debug/app-debug.apk
\`\`\`

### Release Build
\`\`\`bash
# Generate signed APK
cd android
./gradlew assembleRelease
\`\`\`

### Capacitor Configuration
File: \`capacitor.config.ts\`
\`\`\`typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hydrosync.app',
  appName: 'HydroSync',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
\`\`\`

### Native Features
- Push notifications via FCM
- Offline data storage
- Native splash screen
- Status bar customization
- Safe area handling
    `
  },
  {
    id: 'security-rules',
    title: 'Firestore Security Rules',
    content: `
## Security Rules Overview

### Core Principles
1. Users can only access their own data
2. Admins have read access to all data
3. Superusers have full access
4. Devices are protected by ownership

### Rules Structure
\`\`\`javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isSuperuser() {
      return isAuthenticated() && 
        request.auth.token.email == "visiontech072025@gmail.com";
    }
    
    function isAdmin(userId) {
      return get(/databases/$(database)/documents/users/$(userId)).data.role 
        in ['admin', 'superuser'];
    }
    
    function ownsDevice(deviceId) {
      return isAuthenticated() &&
        get(/databases/$(database)/documents/devices/$(deviceId)).data.assigned_to_user 
          == request.auth.uid;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated() && 
        (request.auth.uid == userId || isSuperuser());
      allow write: if isSuperuser();
      allow update: if isAuthenticated() && 
        request.auth.uid == userId;
    }
    
    // Devices collection
    match /devices/{deviceId} {
      allow read: if isAuthenticated() && 
        (ownsDevice(deviceId) || isSuperuser());
      allow write: if isSuperuser();
    }
    
    // Telemetry subcollection
    match /devices/{deviceId}/telemetry/{docId} {
      allow read: if ownsDevice(deviceId) || isSuperuser();
      allow write: if false; // Only via Cloud Functions
    }
  }
}
\`\`\`

### Testing Rules
Use Firebase Emulator for local testing:
\`\`\`bash
firebase emulators:start --only firestore
\`\`\`
    `
  }
];

export default function AdminDocumentation() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [expandedSections, setExpandedSections] = useState<string[]>(['architecture']);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isAdmin) {
      navigate('/setup_adminhydro');
    }
  }, [isAdmin, navigate]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => 
      prev.includes(id) 
        ? prev.filter(s => s !== id)
        : [...prev, id]
    );
  };

  const filteredSections = DOC_SECTIONS.filter(section =>
    section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    section.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderMarkdown = (content: string) => {
    // Simple markdown rendering
    return content
      .split('\n')
      .map((line, index) => {
        // Headers
        if (line.startsWith('## ')) {
          return <h2 key={index} className="text-lg font-bold text-white mt-4 mb-2">{line.slice(3)}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={index} className="text-base font-bold text-cyan-400 mt-3 mb-1">{line.slice(4)}</h3>;
        }
        // Code blocks
        if (line.startsWith('```')) {
          return null; // Skip code markers
        }
        // Tables
        if (line.startsWith('|')) {
          const cells = line.split('|').filter(c => c.trim());
          if (cells.every(c => c.trim().match(/^-+$/))) {
            return null; // Skip table separators
          }
          return (
            <div key={index} className="flex gap-4 py-1 border-b border-white/5">
              {cells.map((cell, i) => (
                <span key={i} className={cn(
                  "flex-1 text-xs",
                  i === 0 ? "text-slate-400" : "text-white"
                )}>{cell.trim()}</span>
              ))}
            </div>
          );
        }
        // Lists
        if (line.match(/^[0-9]+\. /)) {
          return <li key={index} className="text-sm text-slate-300 ml-4 list-decimal">{line.replace(/^[0-9]+\. /, '')}</li>;
        }
        if (line.startsWith('- ')) {
          return <li key={index} className="text-sm text-slate-300 ml-4 list-disc">{line.slice(2)}</li>;
        }
        // Regular text
        if (line.trim()) {
          // Bold text
          const boldText = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          // Inline code
          const codeText = boldText.replace(/`([^`]+)`/g, '<code class="bg-slate-700 px-1 rounded text-cyan-400">$1</code>');
          
          return (
            <p 
              key={index} 
              className="text-sm text-slate-300 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: codeText }}
            />
          );
        }
        return null;
      })
      .filter(Boolean);
  };

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#1e293b]/95 backdrop-blur-md border-b border-white/5 px-6 py-4">
        <div className="flex items-center gap-4 max-w-5xl mx-auto">
          <button
            onClick={() => navigate('/admin')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Book className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">System Documentation</h1>
              <p className="text-xs text-slate-400">Technical reference for HydroSync</p>
            </div>
          </div>
        </div>
      </header>

      {/* Search */}
      <div className="max-w-5xl mx-auto px-6 py-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documentation..."
            className="w-full bg-[#1e293b] border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 pb-24">
        <div className="space-y-2">
          {filteredSections.map((section) => (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1e293b] border border-white/10 rounded-xl overflow-hidden"
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
              >
                <span className="text-sm font-bold text-white">{section.title}</span>
                {expandedSections.includes(section.id) ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {/* Section Content */}
              {expandedSections.includes(section.id) && (
                <div className="px-5 pb-5 border-t border-white/5">
                  <div className="pt-4 space-y-2">
                    {renderMarkdown(section.content)}
                  </div>
                </div>
              )}
            </motion.div>
          ))}

          {filteredSections.length === 0 && (
            <div className="text-center py-12">
              <Book className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No documentation found for "{searchQuery}"</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
