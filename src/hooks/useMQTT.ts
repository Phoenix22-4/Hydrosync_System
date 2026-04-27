import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onMessageRef.current = options?.onMessage;
  }, [options?.onMessage]);

  // Create stable connection key - memoized to prevent unnecessary reconnections
  const connectionKey = useMemo(() => {
    if (!brokerUrl) return '';
    // Only include stable parameters in the key
    const userPart = options?.username || 'anon';
    return `${brokerUrl}_${userPart}`;
  }, [brokerUrl, options?.username]);

  useEffect(() => {
    // Skip if connection key hasn't changed
    if (connectionKey === connectionKeyRef.current) {
      return;
    }

    if (!brokerUrl || !connectionKey) {
      // Disconnect if no broker URL
      if (clientRef.current && connectionKeyRef.current) {
        console.log('MQTT: Disconnecting due to no broker URL');
        // Only remove from registry if this component owns the connection
        if (globalConnectionRegistry.get(connectionKeyRef.current) === clientRef.current) {
          clientRef.current.end(true);
          globalConnectionRegistry.delete(connectionKeyRef.current);
        }
        clientRef.current = null;
        if (isMountedRef.current) {
          setClient(null);
          setIsConnected(false);
        }
      }
      connectionKeyRef.current = connectionKey;
      return;
    }

    // Disconnect existing connection if different broker
    if (clientRef.current && connectionKeyRef.current && connectionKeyRef.current !== connectionKey) {
      console.log('MQTT: Switching brokers, disconnecting old connection');
      subscribedTopicsRef.current.clear();
      subscriptionsRef.current.clear();
      if (globalConnectionRegistry.get(connectionKeyRef.current) === clientRef.current) {
        clientRef.current.end(true);
        globalConnectionRegistry.delete(connectionKeyRef.current);
      }
      clientRef.current = null;
    }

    // Check global registry for existing connection
    const existingClient = globalConnectionRegistry.get(connectionKey);
    if (existingClient) {
      console.log('MQTT: Reusing existing connection for', connectionKey);
      clientRef.current = existingClient;
      if (isMountedRef.current) {
        setClient(existingClient);
        setIsConnected(existingClient.connected);
      }
      connectionKeyRef.current = connectionKey;
      return;
    }

    // Create new connection
    console.log('MQTT: Creating new connection to', brokerUrl);
    if (isMountedRef.current) {
      setError(null);
    }
    
    try {
      // Use stable clientId format
      const clientId = options?.clientId || `hydrosync_${connectionKey.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}_${Math.random().toString(16).slice(2, 6)}`;
      const mqttClient = mqtt.connect(brokerUrl, {
        username: options?.username,
        password: options?.password,
        clientId: clientId,
        clean: true,
        reconnectPeriod: 15000, // Increased to 15 seconds
        connectTimeout: 30000,  // 30 seconds
        keepalive: 60,
      });

      // Store in registry
      globalConnectionRegistry.set(connectionKey, mqttClient);
      connectionKeyRef.current = connectionKey;
      clientRef.current = mqttClient;
      if (isMountedRef.current) {
        setClient(mqttClient);
      }

      mqttClient.on('connect', () => {
        console.log('MQTT Connected successfully');
        if (isMountedRef.current) {
          setIsConnected(true);
          setError(null);
        }

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
        subscribedTopicsRef.current.clear();
        if (isMountedRef.current) {
          setIsConnected(false);
        }
      });

      mqttClient.on('close', () => {
        console.log('MQTT Connection closed');
        subscribedTopicsRef.current.clear();
        if (isMountedRef.current) {
          setIsConnected(false);
        }
      });

      mqttClient.on('error', (err) => {
        console.error('MQTT Error:', err.message);
        // Don't set error for connection issues - let reconnect handle it
        if (!err.message.includes('connection') && !err.message.includes('timeout') && isMountedRef.current) {
          setError(err.message);
        }
      });

      mqttClient.on('offline', () => {
        console.log('MQTT Client offline');
        subscribedTopicsRef.current.clear();
        if (isMountedRef.current) {
          setIsConnected(false);
        }
      });

      mqttClient.on('message', (topic, message) => {
        if (onMessageRef.current) {
          onMessageRef.current(topic, message);
        }
      });

    } catch (err) {
      console.error('MQTT connection failed:', err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Connection failed');
      }
    }

    // Cleanup function - don't disconnect, let registry manage it
    return () => {};
  }, [connectionKey]); // Only reconnect if connection key changes

  // Manual disconnect function for when user logs out or switches devices
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      console.log('MQTT: Manual disconnect');
      if (globalConnectionRegistry.get(connectionKeyRef.current) === clientRef.current) {
        clientRef.current.end(true);
        globalConnectionRegistry.delete(connectionKeyRef.current);
      }
      globalConnectionRegistry.delete(connectionKeyRef.current);
      clientRef.current = null;
      setClient(null);
      setIsConnected(false);
      subscriptionsRef.current.clear();
      subscribedTopicsRef.current.clear();
    }
  }, []);

  const subscribe = useCallback((topic: string, options?: mqtt.IClientSubscribeOptions) => {
    // Skip if already subscribed to this topic
    if (subscribedTopicsRef.current.has(topic)) {
      return;
    }
    
    // Store topic for reconnection
    subscriptionsRef.current.add(topic);
    subscribedTopicsRef.current.add(topic);
    
    const currentClient = clientRef.current;
    if (currentClient && currentClient.connected) {
      currentClient.subscribe(topic, options, (err) => {
        if (err) {
          console.error('MQTT subscribe error:', err);
          subscribedTopicsRef.current.delete(topic);
        } else {
          console.log('MQTT subscribed to:', topic);
        }
      });
    }
  }, []);

  const unsubscribe = useCallback((topic: string) => {
    subscriptionsRef.current.delete(topic);
    subscribedTopicsRef.current.delete(topic);
    
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