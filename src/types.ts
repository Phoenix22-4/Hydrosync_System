import { Timestamp } from 'firebase/firestore';

export type UserStatus = 'pending' | 'active' | 'blocked';
export type DeviceStatus = 'unassigned' | 'active' | 'blocked';
export type OperationType = 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  region?: string;
  created_at?: Timestamp;
  status: UserStatus;
  device_ids?: string[];
  role?: 'user' | 'admin' | 'superuser';
}

export interface Device {
  id: string;
  device_id: string;
  token: string;
  assigned_to_user?: string;
  user_name?: string;
  name?: string;
  ohCap?: number;
  ugCap?: number;
  overhead_capacity?: number;
  underground_capacity?: number;
  region?: string;
  registered_at?: Timestamp;
  status: DeviceStatus;
  mqtt_username?: string;
  mqtt_password?: string;
  mqtt_broker?: string;
  mqtt_topic?: string;
  // Live telemetry fields
  pump_status?: boolean;
  overhead_level?: number;
  underground_level?: number;
  current_draw?: number;
  power_kw?: number;
  last_seen?: Timestamp;
  error_state?: string | null;
}

export interface Telemetry {
  recorded_at: Timestamp;
  overhead_level: number;
  underground_level: number;
  pump_status: boolean;
  pump_current?: number;
  system_status?: string;
}

export interface PumpEvent {
  event_type: 'ON' | 'OFF';
  event_at: Timestamp;
  trigger_source: 'auto' | 'manual';
  amps_at_event?: number;
  duration_seconds?: number;
  litres_transferred?: number;
}

export interface AggregateHourly {
  hour: Timestamp;
  total_devices_active?: number;
  total_pumps_on?: number;
  peak_pumps_simultaneous?: number;
  total_kwh_estimated?: number;
  avg_overhead_pct?: number;
  avg_underground_pct?: number;
}

export interface ActivityLog {
  id?: string;
  timestamp: Timestamp;
  user_id?: string;
  device_id?: string;
  action: string;
  performed_by: string;
}

export interface Alert {
  id: string;
  device_id: string;
  user_id: string;
  alert_type: string;
  message: string;
  triggered_at: Timestamp;
  read: boolean;
  push_sent?: boolean;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}
