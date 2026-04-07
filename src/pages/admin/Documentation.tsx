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
  }
];

export default function AdminDocumentation() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [expandedSections, setExpandedSections] = useState<string[]>(['architecture']);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isAdmin) {
      navigate('/setup_Adminhydro');
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
