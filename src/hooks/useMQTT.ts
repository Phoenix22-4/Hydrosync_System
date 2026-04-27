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

// Global connection registry to prevent duplicate connections
const globalConnectionRegistry = new Map<string, mqtt.MqttClient>();

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
  const onMessageRef = useRef(options?.onMessage);
  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const connectionKeyRef = useRef<string>('');

  useEffect(() => {
    onMessageRef.current = options?.onMessage;
  }, [options?.onMessage]);

  // Create stable connection key
  const connectionKey = brokerUrl 
    ? `${brokerUrl}_${options?.username || 'anon'}_${options?.clientId || 'default'}`
    : '';

  useEffect(() => {
    if (!brokerUrl) {
      // Disconnect if no broker URL
      if (clientRef.current) {
        console.log('MQTT: Disconnecting due to no broker URL');
        clientRef.current.end(true);
        clientRef.current = null;
        globalConnectionRegistry.delete(connectionKeyRef.current);
        setClient(null);
        setIsConnected(false);
      }
      return;
    }

    // Check if we already have a connection for this key
    if (connectionKey === connectionKeyRef.current && clientRef.current) {
      // Already connected to this broker, don't reconnect
      return;
    }

    // Disconnect existing connection if different
    if (clientRef.current && connectionKeyRef.current !== connectionKey) {
      console.log('MQTT: Switching brokers, disconnecting old connection');
      clientRef.current.end(true);
      globalConnectionRegistry.delete(connectionKeyRef.current);
    }

    // Check global registry for existing connection
    const existingClient = globalConnectionRegistry.get(connectionKey);
    if (existingClient) {
      console.log('MQTT: Reusing existing connection for', connectionKey);
      clientRef.current = existingClient;
      setClient(existingClient);
      setIsConnected(existingClient.connected);
      connectionKeyRef.current = connectionKey;
      return;
    }

    // Create new connection
    console.log('MQTT: Creating new connection to', brokerUrl);
    setError(null);
    
    try {
      const clientId = options?.clientId || `hydrosync_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
      const mqttClient = mqtt.connect(brokerUrl, {
        username: options?.username,
        password: options?.password,
        clientId: clientId,
        clean: true,
        reconnectPeriod: 10000, // Increase to 10 seconds to prevent rapid reconnection
        connectTimeout: 30000,    // Increase to 30 seconds
        keepalive: 60,
      });

      // Store in registry
      globalConnectionRegistry.set(connectionKey, mqttClient);
      connectionKeyRef.current = connectionKey;
      clientRef.current = mqttClient;
      setClient(mqttClient);

      mqttClient.on('connect', () => {
        console.log('MQTT Connected successfully');
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

      mqttClient.on('close', () => {
        console.log('MQTT Connection closed');
        setIsConnected(false);
      });

      mqttClient.on('error', (err) => {
        console.error('MQTT Error:', err.message);
        // Don't set error for connection issues - let reconnect handle it
        if (!err.message.includes('connection') && !err.message.includes('timeout')) {
          setError(err.message);
        }
      });

      mqttClient.on('offline', () => {
        console.log('MQTT Client offline');
        setIsConnected(false);
      });

      mqttClient.on('message', (topic, message) => {
        if (onMessageRef.current) {
          onMessageRef.current(topic, message);
        }
      });

    } catch (err) {
      console.error('MQTT connection failed:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
    }

    // Cleanup function
    return () => {
      // Don't disconnect on unmount - let the global registry manage it
      // Only clean up if component is truly unmounting permanently
    };
  }, [brokerUrl, connectionKey]); // Only reconnect if broker URL or credentials change

  // Manual disconnect function for when user logs out or switches devices
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      console.log('MQTT: Manual disconnect');
      clientRef.current.end(true);
      globalConnectionRegistry.delete(connectionKeyRef.current);
      clientRef.current = null;
      setClient(null);
      setIsConnected(false);
      subscriptionsRef.current.clear();
    }
  }, []);

  const subscribe = useCallback((topic: string, options?: mqtt.IClientSubscribeOptions) => {
    // Store topic for reconnection
    subscriptionsRef.current.add(topic);
    
    const currentClient = clientRef.current;
    if (currentClient && currentClient.connected) {
      currentClient.subscribe(topic, options, (err) => {
        if (err) {
          console.error('MQTT subscribe error:', err);
        } else {
          console.log('MQTT subscribed to:', topic);
        }
      });
    }
  }, []);

  const unsubscribe = useCallback((topic: string) => {
    subscriptionsRef.current.delete(topic);
    
    const currentClient = clientRef.current;
    if (currentClient && currentClient.connected) {
      currentClient.unsubscribe(topic, (err) => {
        if (err) {
          console.error('MQTT unsubscribe error:', err);
        } else {
          console.log('MQTT unsubscribed from:', topic);
        }
      });
    }
  }, []);

  const publish = useCallback((topic: string, message: string, options?: mqtt.IClientPublishOptions) => {
    const currentClient = clientRef.current;
    if (currentClient && currentClient.connected) {
      currentClient.publish(topic, message, options, (err) => {
        if (err) {
          console.error('MQTT publish error:', err);
        } else {
          console.log('MQTT published to:', topic);
        }
      });
    } else {
      console.warn('MQTT not connected, cannot publish');
    }
  }, []);

  return {
    client,
    isConnected,
    error,
    subscribe,
    unsubscribe,
    publish,
  };
}