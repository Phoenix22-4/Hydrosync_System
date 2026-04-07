import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Device, Telemetry } from '../types';

export function useNotifications(user: any) {
  const previousTelemetry = useRef<Record<string, Telemetry>>({});

  useEffect(() => {
    // Request permissions for local notifications
    LocalNotifications.requestPermissions().then((result) => {
      if (result.display !== 'granted') {
        console.warn('Local notifications permission not granted');
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    // Listen to all devices assigned to the user
    const qDevices = query(collection(db, 'devices'), where('assigned_to_user', '==', user.uid));
    
    const unsubscribeDevices = onSnapshot(qDevices, (snapshot) => {
      const devices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Device));
      
      // For each device, listen to its latest telemetry
      devices.forEach(device => {
        const qTelemetry = query(
          collection(db, 'devices', device.id, 'telemetry'),
          orderBy('recorded_at', 'desc'),
          limit(1)
        );

        onSnapshot(qTelemetry, (tSnap) => {
          if (!tSnap.empty) {
            const currentTel = tSnap.docs[0].data() as Telemetry;
            const prevTel = previousTelemetry.current[device.id];

            if (prevTel) {
              // Check for Dry Run
              if (currentTel.system_status?.toLowerCase().includes('dry') && !prevTel.system_status?.toLowerCase().includes('dry')) {
                sendNotification(
                  `🚨 Dry Run Detected!`,
                  `Pump on ${device.name || device.id} has been stopped to prevent damage.`
                );
              }

              // Check for Low Underground Tank
              if (currentTel.underground_level < 20 && prevTel.underground_level >= 20) {
                sendNotification(
                  `⚠️ Underground Tank Low`,
                  `Water level is below 20% on ${device.name || device.id}.`
                );
              }

              // Check for Overhead Tank below 50%
              if (currentTel.overhead_level < 50 && prevTel.overhead_level >= 50) {
                sendNotification(
                  `ℹ️ Overhead Tank Below 50%`,
                  `Water level has dropped below 50% on ${device.name || device.id}.`
                );
              }
            }

            // Update previous telemetry
            previousTelemetry.current[device.id] = currentTel;
          }
        });
      });
    });

    return () => unsubscribeDevices();
  }, [user]);

  const sendNotification = async (title: string, body: string) => {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: Math.floor(Math.random() * 1000000),
            schedule: { at: new Date(Date.now() + 100) }, // Schedule immediately
            sound: undefined,
            attachments: undefined,
            actionTypeId: '',
            extra: null
          }
        ]
      });
    } catch (error) {
      console.error('Error sending local notification:', error);
    }
  };
}
