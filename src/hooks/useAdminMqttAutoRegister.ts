import { useEffect, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

type HostDoc = {
  id: string;
  url: string;
  status: 'active' | 'inactive';
  device_id?: string | null;
  username?: string | null;
  password?: string | null;
};

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

  useEffect(() => {
    if (!enabled) return;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    const start = async () => {
      setStatus('connecting');
      console.log('[MQTT Bridge] Starting, loading active hosts...');

      // Load active hosts
      const hostsSnap = await getDocs(query(collection(db, 'mqtt_hosts'), where('status', '==', 'active')));
      const hosts: HostDoc[] = hostsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      if (cancelled) return;

      // Close any previous clients
      clientsRef.current.forEach((c) => {
        try {
          c.end(true);
        } catch {}
      });
      clientsRef.current = [];

      if (hosts.length === 0) {
        console.warn('[MQTT Bridge] No active hosts found in mqtt_hosts.');
        setStatus('no_hosts');
        return;
      }

      // One connection per active host (these are usually few; device-bound hosts are ok)
      hosts.forEach((host) => {
        const wsUrl = toWsUrl(host.url);
        if (!wsUrl) return;

        const client = mqtt.connect(wsUrl, {
          username: host.username?.trim() || undefined,
          password: host.password?.trim() || undefined,
          clientId: `hydrosync_admin_bridge_${Math.random().toString(16).slice(2, 8)}`,
          clean: true,
          reconnectPeriod: 4000,
          connectTimeout: 10000,
        });

        clientsRef.current.push(client);

        client.on('connect', async () => {
          console.log(`[MQTT Bridge] Connected: ${host.url}`);
          setStatus('online');
          try {
            // Subscribe to telemetry topics (support both legacy + current firmware topics)
            client.subscribe(
              [
                'devices/+/data',
                'devices/+/telemetry',
                'devices/+/#',
                'devices/+',
                'hydrosync/data/+',
              ],
              { qos: 0 }
            );
            // heartbeat doc for admin UI
            await setDoc(
              doc(db, 'system', 'bridge_status'),
              { last_seen: serverTimestamp(), source: 'admin-pwa' },
              { merge: true }
            );
          } catch (e) {
            console.error('Bridge heartbeat write failed:', e);
          }
        });

        client.on('error', (err) => {
          console.error('[MQTT Bridge] MQTT error:', err);
        });

        client.on('message', async (topic, message) => {
          try {
            const parsed = extractDeviceIdFromTopic(topic);
            if (!parsed) return;
            const deviceId = parsed.canonicalId;
            console.log(`[MQTT Bridge] Message: ${topic} -> ${deviceId}`);

            // Update bridge status with last seen topic/device for live diagnostics.
            await setDoc(
              doc(db, 'system', 'bridge_status'),
              {
                last_seen: serverTimestamp(),
                source: 'admin-pwa',
                last_topic: topic,
                last_device_id: deviceId,
              },
              { merge: true }
            );

            let payload: any = null;
            try {
              payload = JSON.parse(message.toString());
            } catch {
              payload = { raw: message.toString() };
            }

            // Devices MUST be stored at docId == device_id for the user app flows
            // (CreateAccount/AddDevice/ConfirmToken all read doc(db,'devices', deviceId)).
            const deviceRef = doc(db, 'devices', deviceId);
            const existing = await getDoc(deviceRef);

            const token = existing.exists() ? (existing.data() as any)?.token : randomToken32();
            const firstRegisteredAt = existing.exists() ? (existing.data() as any)?.registered_at : serverTimestamp();

            // Create if missing, otherwise merge/update. This keeps the record permanent even when offline.
            await setDoc(
              deviceRef,
              {
                device_id: deviceId,
                token,
                status: (existing.exists() ? (existing.data() as any)?.status : 'unassigned') || 'unassigned',
                registered_at: firstRegisteredAt || serverTimestamp(),
                mqtt_broker: normalizeBrokerInput(host.url),
                mqtt_username: host.username?.trim() || null,
                mqtt_password: host.password?.trim() || null,
                mqtt_topic: parsed.topicId,
                last_seen: serverTimestamp(),
              },
              { merge: true }
            );

            // Store telemetry snapshot
            await addDoc(collection(db, 'devices', deviceId, 'telemetry'), {
              recorded_at: serverTimestamp(),
              overhead_level: payload?.overhead_level ?? null,
              underground_level: payload?.underground_level ?? null,
              pump_status: payload?.pump_status ?? null,
              pump_current: payload?.pump_current ?? null,
              system_status: payload?.system_status ?? null,
              source: 'mqtt',
            });

            // Update live fields on device doc (so admin list can show)
            await setDoc(
              deviceRef,
              {
              overhead_level: payload?.overhead_level ?? null,
              underground_level: payload?.underground_level ?? null,
              pump_status: payload?.pump_status ?? null,
              current_draw: payload?.pump_current ? Number(payload.pump_current) : null,
              error_state: payload?.system_status ?? null,
              },
              { merge: true }
            );
          } catch (e) {
            console.error('Admin bridge message handling failed:', e);
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
      clientsRef.current.forEach((c) => {
        try {
          c.end(true);
        } catch {}
      });
      clientsRef.current = [];
      setStatus('offline');
    };
  }, [enabled]);

  return { status };
}

