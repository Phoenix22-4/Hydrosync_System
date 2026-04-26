import { collection, deleteDoc, doc, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Deletes telemetry older than X days to prevent Firestore from filling up.
 */
export const pruneOldTelemetry = async (daysToKeep: number = 30) => {
  const now = new Date();
  const threshold = new Date(now.getTime() - daysToKeep * 24 * 60 * 60 * 1000);
  const firestoreThreshold = Timestamp.fromDate(threshold);

  const devicesSnap = await getDocs(collection(db, 'devices'));
  let totalDeleted = 0;

  for (const deviceDoc of devicesSnap.docs) {
    const telemetryRef = collection(db, 'devices', deviceDoc.id, 'telemetry');
    const oldTelemetryQ = query(telemetryRef, where('recorded_at', '<', firestoreThreshold));
    const oldDocs = await getDocs(oldTelemetryQ);

    for (const oldDoc of oldDocs.docs) {
      await deleteDoc(doc(db, 'devices', deviceDoc.id, 'telemetry', oldDoc.id));
      totalDeleted += 1;
    }
  }

  return totalDeleted;
};
