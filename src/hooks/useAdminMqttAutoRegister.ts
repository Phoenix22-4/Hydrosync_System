import { useEffect, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

type HostDoc = {
  id: string;
  url: string;
  status: 'active' | 'inactive';
};

// Global registry to prevent duplicate bridge connections
const globalBridgeClients = new Map<string, MqttClient>();
let lastStatusUpdate = 0;
const STATUS_UPDATE_INTERVAL = 120000; // Only update status every 2 minutes
const lastForwardedMessages = new Map<string, { timestamp: number }>();

function normalizeBrokerInput(input: string) {
  const raw = input.trim();
  if (!raw) return '';

  let noScheme = raw.replace(/^wss?:\/\//i, '').replace(/^https?:\/\//i, '');
  noScheme = noScheme.replace(/\.([0-9]{2,5})\/mqtt$/i, ':$1/mqtt');

  if (/:[0-9]{2,5}\/mqtt$/i.test(noScheme) || /\/mqtt$/i.test(noScheme)) return noScheme;
  if (/:[0-9]{2,5}$/i.test(noScheme)) return `${noScheme}/mqtt`;
  return `${noScheme}:8884/mqtt`;
}

function toWsUrl(rawHost: string) {
  const normalized = normalizeBrokerInput(rawHost);
  if (!normalized) return '';
  if (normalized.startsWith('ws://') || normalized.startsWith('wss://')) return normalized;
  if (normalized.startsWith('http://')) return `ws://${normalized.slice(7)}`;
  if (normalized.startsWith('https://')) return `wss://${normalized.slice(8)}`;
  if (normalized.includes('/mqtt')) return `wss://${normalized}`;
  return `wss://${normalized}:8884/mqtt`;
}

function randomToken32() {
  // 32 hex chars
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
}

function extractDeviceIdFromTopic(topic: string): { canonicalId: string; topicId: string } | null {
  const match =
    topic.match(/^devices\/([^/]+)\/data$/) ||
    topic.match(/^devices\/([^/]+)\/telemetry$/) ||
    topic.match(/^devices\/([^/]+)\/.*/) ||
    topic.match(/^devices\/([^/]+)$/) ||
    topic.match(/^hydrosync\/data\/([^/]+)$/);
  if (!match?.[1]) return null;
  const topicId = match[1].trim();
  if (!topicId) return null;
  return {
    canonicalId: topicId.toUpperCase(),
    topicId,
  };
}

export function useAdminMqttAutoRegister(enabled: boolean) {
  const [status, setStatus] = useState<'offline' | 'connecting' | 'online' | 'no_hosts'>('offline');
  const clientsRef = useRef<MqttClient[]>([]);
  const knownDeviceIdsRef = useRef<Set<string>>(new Set());
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingStatusRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    const start = async () => {
      setStatus('connecting');
      console.log('[MQTT Bridge] Starting with mqtt_hosts URLs + super-user env credentials...');
      console.log('[MQTT Bridge] Bridge enabled:', enabled);

      const mqttUser = (import.meta.env.VITE_MQTT_USER as string | undefined)?.trim() || '';
      const mqttPass = (import.meta.env.VITE_MQTT_PASS as string | undefined)?.trim() || '';

      if (!mqttUser || !mqttPass) {
        console.error('[MQTT Bridge] Missing VITE_MQTT_USER or VITE_MQTT_PASS.');
        setStatus('no_hosts');
        return;
      }

      try {
        const existingDevices = await getDocs(collection(db, 'devices'));
        const ids = new Set<string>();
        existingDevices.docs.forEach((d) => {
          const data = d.data() as { device_id?: string };
          const id = (data.device_id || d.id || '').trim().toUpperCase();
          if (id) ids.add(id);
        });
        knownDeviceIdsRef.current = ids;
      } catch (e) {
        console.warn('[MQTT Bridge] Could not preload known device list:', e);
      }

      if (cancelled) return;

      // Close any previous clients
      clientsRef.current.forEach((c) => {
        try {
          c.end(true);
        } catch {}
      });
      clientsRef.current = [];

      const hostsSnap = await getDocs(query(collection(db, 'mqtt_hosts'), where('status', '==', 'active')));
      const hosts: HostDoc[] = hostsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      if (cancelled) return;

      if (hosts.length === 0) {
        console.warn('[MQTT Bridge] No active hosts in mqtt_hosts.');
        setStatus('no_hosts');
        return;
      }

      hosts.forEach((host) => {
        const wsUrl = toWsUrl(host.url || '');
        if (!wsUrl.startsWith('wss://')) return;

        // Check if we already have a connection for this host
        const connectionKey = `${wsUrl}_${mqttUser}`;
        if (globalBridgeClients.has(connectionKey)) {
          console.log(`[MQTT Bridge] Reusing existing connection for ${wsUrl}`);
          const existingClient = globalBridgeClients.get(connectionKey)!;
          clientsRef.current.push(existingClient);
          return;
        }

        const client = mqtt.connect(wsUrl, {
          username: mqttUser,
          password: mqttPass,
          clientId: `hydrosync_bridge_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
          clean: true,
          reconnectPeriod: 10000, // Increased to 10 seconds
          connectTimeout: 30000,   // Increased to 30 seconds
          keepalive: 60,
        });

        // Store in global registry
        globalBridgeClients.set(connectionKey, client);
        clientsRef.current.push(client);

        // Debounced status update function
        const debouncedStatusUpdate = async (updateData: any) => {
          const now = Date.now();
          if (now - lastStatusUpdate < STATUS_UPDATE_INTERVAL && isUpdatingStatusRef.current) {
            // Schedule update for later if one is already in progress
            if (statusTimeoutRef.current) {
              clearTimeout(statusTimeoutRef.current);
            }
            statusTimeoutRef.current = setTimeout(() => {
              debouncedStatusUpdate(updateData);
            }, STATUS_UPDATE_INTERVAL);
            return;
          }

          isUpdatingStatusRef.current = true;
          lastStatusUpdate = now;

          try {
            await setDoc(doc(db, 'system', 'bridge_status'), updateData, { merge: true });
          } catch (e) {
            console.error('Bridge status update failed:', e);
          } finally {
            isUpdatingStatusRef.current = false;
          }
        };

        client.on('connect', async () => {
          console.log(`[MQTT Bridge] Connected: ${wsUrl}`);
          setStatus('online');
          try {
            client.subscribe('devices/#', { qos: 0 }, async (subErr, granted) => {
              if (subErr) {
                console.error('[MQTT Bridge] Subscribe failed:', subErr);
                await debouncedStatusUpdate({
                  last_seen: serverTimestamp(),
                  source: 'admin-pwa',
                  status: 'subscribe_error',
                  last_error: subErr.message || 'subscribe_failed',
                });
                return;
              }
              console.log('[MQTT Bridge] Subscribed OK:', granted?.map((g) => `${g.topic}:${g.qos}`).join(', '));
            });

            await debouncedStatusUpdate({
              last_seen: serverTimestamp(),
              source: 'admin-pwa',
              status: 'online',
              subscribed_topics: ['devices/#'],
              denied_topics: [],
              last_error: null,
              active_host: wsUrl,
            });
          } catch (e) {
            console.error('Bridge heartbeat write failed:', e);
          }
        });

        client.on('error', (err) => {
          console.error('[MQTT Bridge] MQTT error:', err);
        });

        client.on('message', async (topic, message) => {
          let parsedPayload: any;
          try {
            const parts = topic.split('/');
            if (parts.length < 2 || parts[0] !== 'devices') return;
            const deviceId = parts[1].trim().toUpperCase(); // Normalize to uppercase to match AddDevice flow
            if (!deviceId) return;
            const channel = (parts[2] || '').toLowerCase();
            // Reduce console logging for performance
            if (Math.random() < 0.1) { // Log only 10% of messages
              console.log(`[MQTT Bridge] Message: ${topic} -> ${deviceId}`);
            }

            // Only update bridge status every 30 seconds to prevent Firestore write limits
            const now = Date.now();
            if (now - lastStatusUpdate > STATUS_UPDATE_INTERVAL) {
              await setDoc(
                doc(db, 'system', 'bridge_status'),
                {
                  last_seen: serverTimestamp(),
                  source: 'admin-pwa',
                  status: 'online',
                  last_topic: topic,
                  last_device_id: deviceId,
                },
                { merge: true }
              );
              lastStatusUpdate = now;
            }

try {
              parsedPayload = JSON.parse(message.toString());
            } catch {
              parsedPayload = { raw: message.toString() };
            }

            // Only write to Firestore for new devices or every 5 minutes
            // This prevents quota exhaustion from writing on every MQTT message
            const isNewDevice = !knownDeviceIdsRef.current.has(deviceId);
            const lastDeviceWrite = lastForwardedMessages.get(`device_${deviceId}`);
            const DEVICE_WRITE_INTERVAL = 300000; // 5 minutes

            if (isNewDevice || !lastDeviceWrite || (Date.now() - lastDeviceWrite.timestamp > DEVICE_WRITE_INTERVAL)) {
              const deviceRef = doc(db, 'devices', deviceId);
              const existing = await getDoc(deviceRef);

              const token = existing.exists() ? (existing.data() as any)?.token : randomToken32();
              const firstRegisteredAt = existing.exists() ? (existing.data() as any)?.registered_at : serverTimestamp();

              await setDoc(
                deviceRef,
                {
                  device_id: deviceId,
                  token,
                  status: (existing.exists() ? (existing.data() as any)?.status : 'unassigned') || 'unassigned',
                  registered_at: firstRegisteredAt || serverTimestamp(),
                  mqtt_broker: normalizeBrokerInput(host.url || ''),
                  mqtt_username: mqttUser || null,
                  mqtt_password: mqttPass || null,
                  mqtt_topic: deviceId,
                  last_seen: serverTimestamp(),
                },
                { merge: true }
              );
              if (isNewDevice) knownDeviceIdsRef.current.add(deviceId);
              lastForwardedMessages.set(`device_${deviceId}`, { timestamp: Date.now() });
            }

            // Keep wildcard visibility for all device topics, but write telemetry
            // only for telemetry/data channels to avoid command payload pollution.
            if (channel && channel !== 'data' && channel !== 'telemetry') {
              return;
            }

            // Write telemetry to Firestore every 30 seconds for B2B analytics
            // (water usage, pump peak hours, power usage)
            const TELEMETRY_WRITE_INTERVAL = 30000; // 30 seconds
            const lastTelemetryWrite = lastForwardedMessages.get(`telemetry_${deviceId}`);
            if (!lastTelemetryWrite || (Date.now() - lastTelemetryWrite.timestamp > TELEMETRY_WRITE_INTERVAL)) {
              try {
                await addDoc(collection(db, 'devices', deviceId, 'telemetry'), {
                  ...parsedPayload,
                  timestamp: serverTimestamp(),
                  device_id: deviceId,
                });
                lastForwardedMessages.set(`telemetry_${deviceId}`, { timestamp: Date.now() });
              } catch (telemetryErr) {
                // Don't fail the whole handler if telemetry write fails
                console.warn('[MQTT Bridge] Telemetry write skipped:', telemetryErr);
              }
            }

            // Forward ESP32 data to dashboard by publishing to the same topic
            // This allows the dashboard to receive real ESP32 data via the bridge
            
            // Only forward if this is a new message (avoid duplicates)
            const messageKey = `${deviceId}_${JSON.stringify(parsedPayload)}`;
            const messageTime = Date.now();
            const lastForwarded = lastForwardedMessages.get(messageKey);
            
            if (!lastForwarded || (messageTime - lastForwarded.timestamp > 1000)) {
              // Forward this message
              const forwardTopic = `devices/${deviceId}/data`;
              if (client && parsedPayload) {
                client.publish(forwardTopic, JSON.stringify(parsedPayload), { qos: 0 });
              }
              
              // Track this message to prevent duplicates
              lastForwardedMessages.set(messageKey, { timestamp: messageTime });
            }
          } catch (e) {
            console.error('Admin bridge message handling failed:', e);
            // Skip Firestore writes - just log the error
          }
        });
      });
    };

    start().catch((e) => {
      console.error('Admin bridge start failed:', e);
      setStatus('offline');
    });

    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
      // Don't close connections on unmount - let global registry manage them
      // This prevents connection leaks when component re-renders
      clientsRef.current = [];
      setStatus('offline');
    };
  }, [enabled]);

  return { status };
}

