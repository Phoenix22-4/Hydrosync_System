import { useEffect, useRef, useState, useCallback } from 'react';
import mqtt from 'mqtt';

export interface MQTTMessage {
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
}

export interface UseMQTTResult {
  client: mqtt.MqttClient | null;
  isConnected: boolean;
  error: string | null;
  subscribe: (topic: string, options?: mqtt.IClientSubscribeOptions) => void;
  unsubscribe: (topic: string) => void;
  publish: (topic: string, message: string, options?: mqtt.IClientPublishOptions) => void;
}

export function useMQTT(
  brokerUrl?: string,
  options?: {
    username?: string;
    password?: string;
    clientId?: string;
    onMessage?: (topic: string, message: Buffer) => void;
  }
): UseMQTTResult {
  const [client, setClient] = useState<mqtt.MqttClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscriptionsRef = useRef<Set<string>>(new Set());

  const connect = useCallback(() => {
    if (!brokerUrl) return;

    try {
      setError(null);
      const mqttClient = mqtt.connect(brokerUrl, {
        username: options?.username,
        password: options?.password,
        clientId: options?.clientId || `hydrosync_web_${Math.random().toString(16).slice(2, 8)}`,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
      });

      mqttClient.on('connect', () => {
        console.log('MQTT Connected');
        setIsConnected(true);
        setError(null);

        // Resubscribe to all topics
        subscriptionsRef.current.forEach(topic => {
          mqttClient.subscribe(topic, { qos: 0 }, (err) => {
            if (err) {
              console.error('MQTT subscribe error:', err);
            } else {
              console.log('MQTT subscribed to:', topic);
            }
          });
        });
      });

      mqttClient.on('disconnect', () => {
        console.log('MQTT Disconnected');
        setIsConnected(false);
      });

      mqttClient.on('error', (err) => {
        console.error('MQTT Error:', err);
        setError(err.message);
        setIsConnected(false);
      });

      mqttClient.on('message', (topic, message) => {
        if (options?.onMessage) {
          options.onMessage(topic, message);
        }
      });

      setClient(mqttClient);
    } catch (err) {
      console.error('MQTT connection failed:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [brokerUrl, options]);

  const disconnect = useCallback(() => {
    if (client) {
      client.end();
      setClient(null);
      setIsConnected(false);
      subscriptionsRef.current.clear();
    }
  }, [client]);

  const subscribe = useCallback((topic: string, options?: mqtt.IClientSubscribeOptions) => {
    if (client && isConnected) {
      client.subscribe(topic, options, (err) => {
        if (err) {
          console.error('MQTT subscribe error:', err);
        } else {
          subscriptionsRef.current.add(topic);
          console.log('MQTT subscribed to:', topic);
        }
      });
    } else {
      subscriptionsRef.current.add(topic);
    }
  }, [client, isConnected]);

  const unsubscribe = useCallback((topic: string) => {
    if (client && isConnected) {
      client.unsubscribe(topic, (err) => {
        if (err) {
          console.error('MQTT unsubscribe error:', err);
        } else {
          subscriptionsRef.current.delete(topic);
          console.log('MQTT unsubscribed from:', topic);
        }
      });
    } else {
      subscriptionsRef.current.delete(topic);
    }
  }, [client, isConnected]);

  const publish = useCallback((topic: string, message: string, options?: mqtt.IClientPublishOptions) => {
    if (client && isConnected) {
      client.publish(topic, message, options, (err) => {
        if (err) {
          console.error('MQTT publish error:', err);
        } else {
          console.log('MQTT published to:', topic, message);
        }
      });
    } else {
      console.warn('MQTT not connected, cannot publish');
    }
  }, [client, isConnected]);

  useEffect(() => {
    if (brokerUrl) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [brokerUrl, connect, disconnect]);

  return {
    client,
    isConnected,
    error,
    subscribe,
    unsubscribe,
    publish,
  };
}