import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from './firebase.ts';
import type {
  AdminDailyAggregate,
  AuditLog,
  MarketingCampaign,
  Order,
  RiderProfile,
  ServiceAreaConfig,
  Vendor,
} from '../shared/types.ts';
import type { OperationalAlert } from '../shared/adminAnalytics.ts';

export interface LiveFirestoreSnapshotStatus {
  connected: boolean;
  lastSyncedAt: string | null;
  activeListeners: number;
  recentFirestoreOrdersCount: number;
  dailyAggregatesCount: number;
  mode: 'firestore_realtime' | 'api_primary';
}

function isFirebaseAdminAuthenticated(): boolean {
  const current = auth.currentUser;
  if (!current) return false;
  return Boolean(current.emailVerified);
}

/**
 * Subscribe to real-time Firestore collections when the admin is signed in via Firebase Auth.
 * Falls back cleanly to Express API primary mode if no Firebase Auth user session is active
 * (e.g., dev session or unverified preview mode), never emitting uncaught permission errors.
 */
export function subscribeAdminRealtimeUpdates(params: {
  onUpdate: () => void;
  onStatusChange: (status: LiveFirestoreSnapshotStatus) => void;
}): Unsubscribe {
  if (!isFirebaseAdminAuthenticated()) {
    params.onStatusChange({
      connected: false,
      lastSyncedAt: null,
      activeListeners: 0,
      recentFirestoreOrdersCount: 0,
      dailyAggregatesCount: 0,
      mode: 'api_primary',
    });
    return () => {};
  }

  let ordersCount = 0;
  let aggregatesCount = 0;
  const unsubs: Unsubscribe[] = [];

  const emitStatus = (connected: boolean) => {
    params.onStatusChange({
      connected,
      lastSyncedAt: new Date().toISOString(),
      activeListeners: unsubs.length,
      recentFirestoreOrdersCount: ordersCount,
      dailyAggregatesCount: aggregatesCount,
      mode: connected ? 'firestore_realtime' : 'api_primary',
    });
  };

  try {
    unsubs.push(
      onSnapshot(
        query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(50)),
        (snap) => {
          ordersCount = snap.size;
          emitStatus(true);
          params.onUpdate();
        },
        () => emitStatus(false)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'admin_daily_aggregates'), limit(60)),
        (snap) => {
          aggregatesCount = snap.size;
          emitStatus(true);
        },
        () => emitStatus(false)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'admin_alerts'), limit(50)),
        () => emitStatus(true),
        () => emitStatus(false)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(50)),
        () => emitStatus(true),
        () => emitStatus(false)
      )
    );
  } catch {
    emitStatus(false);
  }

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch {
        // ignore unsubscribe errors
      }
    });
  };
}

/**
 * Mirrors server-computed aggregates, alerts, campaigns, service areas, vendors, riders,
 * and recent orders to Firestore when an authorized Firebase Admin is authenticated.
 */
export async function syncAdminOverviewToFirestore(payload: {
  dailyAggregates?: AdminDailyAggregate[];
  alerts?: OperationalAlert[];
  serviceAreas?: ServiceAreaConfig[];
  vendors?: Vendor[];
  riders?: RiderProfile[];
  orders?: Order[];
  campaigns?: MarketingCampaign[];
  auditLogs?: AuditLog[];
}): Promise<boolean> {
  if (!isFirebaseAdminAuthenticated()) return false;
  try {
    const batch = writeBatch(db);
    let opCount = 0;

    const addDocOp = (col: string, id: string, docData: unknown) => {
      if (opCount >= 400 || !id) return;
      const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
      if (!cleanId) return;
      batch.set(doc(db, col, cleanId), docData as Record<string, unknown>, { merge: true });
      opCount += 1;
    };

    for (const agg of (payload.dailyAggregates || []).slice(0, 45)) {
      addDocOp('admin_daily_aggregates', agg.date, agg);
    }
    for (const alt of (payload.alerts || []).slice(0, 40)) {
      addDocOp('admin_alerts', alt.id, alt);
    }
    for (const area of payload.serviceAreas || []) {
      addDocOp('service_areas', area.id, area);
    }
    for (const v of (payload.vendors || []).slice(0, 50)) {
      addDocOp('vendors', v.id, v);
    }
    for (const r of (payload.riders || []).slice(0, 50)) {
      addDocOp('riders', r.id, r);
    }
    for (const o of (payload.orders || []).slice(0, 50)) {
      addDocOp('orders', o.id, o);
    }
    for (const c of (payload.campaigns || []).slice(0, 30)) {
      addDocOp('marketing_campaigns', c.id, c);
    }
    for (const l of (payload.auditLogs || []).slice(0, 40)) {
      addDocOp('audit_logs', l.id, l);
    }

    if (opCount > 0) {
      await batch.commit();
    }
    return true;
  } catch {
    return false;
  }
}

export async function writeSingleAdminDocToFirestore(col: string, id: string, data: Record<string, unknown>) {
  if (!isFirebaseAdminAuthenticated()) return false;
  try {
    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    await setDoc(doc(db, col, cleanId), data, { merge: true });
    return true;
  } catch {
    return false;
  }
}
