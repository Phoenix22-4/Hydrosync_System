# HydroSync MQTT-Firestore Bridge Template

This script acts as the "brain" between your HiveMQTT broker and your Firebase Firestore database. It listens for commands from the app and telemetry from the devices.

## 1. Prerequisites
- Install Node.js
- Run: `npm init -y`
- Run: `npm install firebase-admin mqtt dotenv`

## 2. Setup
Create a `.env` file with your HiveMQTT credentials and your Firebase Service Account JSON.

## 3. Bridge Script (`bridge.js`)

```javascript
const admin = require('firebase-admin');
const mqtt = require('mqtt');
require('dotenv').config();

// 1. Initialize Firebase Admin
// Get your service account from Firebase Console > Project Settings > Service Accounts
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseId: process.env.FIRESTORE_DATABASE_ID // if using a named database
});

const db = admin.firestore();

// 2. Initialize MQTT Client
const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  protocol: 'mqtts',
  port: 8883
});

// Heartbeat function to update bridge status in Firestore
const updateHeartbeat = async () => {
  try {
    await db.collection('system').doc('bridge_status').set({
      last_seen: admin.firestore.FieldValue.serverTimestamp(),
      status: 'online'
    });
  } catch (err) {
    console.error('Heartbeat update failed:', err);
  }
};

mqttClient.on('connect', () => {
  console.log('Connected to HiveMQTT Broker');
  // Subscribe to telemetry topics for all devices
  mqttClient.subscribe('devices/+/telemetry');
  
  // Start heartbeat
  updateHeartbeat();
  setInterval(updateHeartbeat, 20000); // Every 20 seconds
});

// 3. Handle Incoming Telemetry (Device -> MQTT -> Firestore)
mqttClient.on('message', async (topic, message) => {
  const parts = topic.split('/');
  if (parts[1] && parts[2] === 'telemetry') {
    const deviceId = parts[1];
    const data = JSON.parse(message.toString());
    
    console.log(`Received telemetry from ${deviceId}:`, data);
    
    try {
      // Update latest telemetry in Firestore
      await db.collection('devices').doc(deviceId).collection('telemetry').add({
        ...data,
        recorded_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update device status
      await db.collection('devices').doc(deviceId).update({
        pump_status: data.pump_status,
        last_seen: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.error('Error updating Firestore:', err);
    }
  }
});

// 4. Handle Outgoing Commands (App -> Firestore -> MQTT -> Device)
// Listen for new documents in the 'commands' collection
db.collection('commands').where('status', '==', 'pending').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(async (change) => {
    if (change.type === 'added') {
      const commandData = change.doc.data();
      const commandId = change.doc.id;
      const deviceId = commandData.device_id;
      
      console.log(`New command for ${deviceId}: ${commandData.command}`);
      
      // Publish to MQTT
      const topic = `devices/${deviceId}/commands`;
      mqttClient.publish(topic, JSON.stringify({
        command: commandData.command,
        payload: commandData.payload,
        timestamp: Date.now()
      }), { qos: 1 }, async (err) => {
        if (!err) {
          // Mark command as completed in Firestore
          await db.collection('commands').doc(commandId).update({
            status: 'completed',
            sent_at: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`Command ${commandId} sent successfully`);
        } else {
          console.error('MQTT Publish Error:', err);
        }
      });
    }
  });
});

console.log('HydroSync Bridge is running...');
```

## 4. How to run
1. Place your `service-account.json` in the same folder.
2. Configure `.env`.
3. Run `node bridge.js`.
