import { Telemetry } from '../types';

/**
 * Safely converts a timestamp to a Date object.
 * Handles Firestore Timestamp, Date objects, and strings.
 */
function toDate(timestamp: any): Date | null {
  if (!timestamp) return null;
  
  // Firestore Timestamp has toDate() method
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  
  // Already a Date object
  if (timestamp instanceof Date) {
    return timestamp;
  }
  
  // String timestamp
  if (typeof timestamp === 'string') {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // Number timestamp (milliseconds)
  if (typeof timestamp === 'number') {
    return new Date(timestamp);
  }
  
  return null;
}

/**
 * Checks if a device is offline based on its last telemetry timestamp.
 * A device is considered offline if it hasn't reported in the last 5 minutes.
 * @param telemetry The latest telemetry data for the device
 * @returns boolean true if offline, false if online
 */
export function isDeviceOffline(telemetry: Telemetry | null): boolean {
  if (!telemetry || !telemetry.recorded_at) return true;
  
  const lastUpdate = toDate(telemetry.recorded_at);
  if (!lastUpdate) return true;
  
  const now = new Date();
  const diffInMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
  
  return diffInMinutes > 5;
}

/**
 * Returns a human-readable string for the last seen time.
 */
export function getLastSeenString(telemetry: Telemetry | null): string {
  if (!telemetry || !telemetry.recorded_at) return 'Never';
  
  const lastUpdate = toDate(telemetry.recorded_at);
  if (!lastUpdate) return 'Never';
  
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return lastUpdate.toLocaleDateString();
}
