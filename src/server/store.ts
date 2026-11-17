import fs from 'node:fs';
import path from 'node:path';
import { createDefaultServiceConfigs, createInitialSeedState, type DatabaseState } from './seedData.ts';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'fyoora-db.json');

let state: DatabaseState | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function loadStateFromDisk(): DatabaseState {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as DatabaseState;
      if (parsed && Array.isArray(parsed.vendors) && Array.isArray(parsed.serviceAreas)) {
        const now = new Date().toISOString();
        if (!Array.isArray(parsed.paymentTransactions)) parsed.paymentTransactions = [];
        if (!Array.isArray(parsed.partnerApplications)) parsed.partnerApplications = [];
        if (!Array.isArray(parsed.featureSuggestions)) parsed.featureSuggestions = [];
        if (!Array.isArray(parsed.serviceConfigs)) parsed.serviceConfigs = createDefaultServiceConfigs(now);
        if (!Array.isArray(parsed.expenses)) parsed.expenses = [];
        if (!Array.isArray(parsed.marketingCampaigns)) parsed.marketingCampaigns = [];
        if (!Array.isArray(parsed.dailyAggregates)) parsed.dailyAggregates = [];
        if (!parsed.referralSettings) {
          parsed.referralSettings = {
            enabled: true,
            referrerRewardPoints: 50,
            refereeWelcomePoints: 50,
            minOrderForRewardInr: 199,
            updatedAt: now,
          };
        }
        if (!parsed.alertAcknowledgements || typeof parsed.alertAcknowledgements !== 'object') {
          parsed.alertAcknowledgements = {};
        }
        if (!Array.isArray(parsed.adminStaff)) {
          parsed.adminStaff = parsed.users
            .filter((u) => ['super_admin', 'admin', 'support_staff'].includes(u.role))
            .map((u) => ({
              id: u.id,
              fullName: u.fullName || 'FYOORA Staff',
              email: u.email || '',
              role: u.role as 'super_admin' | 'admin' | 'support_staff',
              permissions: [
                'overview',
                'analytics',
                'live_ops',
                'finance',
                'customers',
                'vendors',
                'riders',
                'services',
                'service_area',
                'marketing',
                'ai_bi',
                'alerts',
                'security',
                'reports',
              ],
              status: u.accountStatus === 'suspended' ? 'suspended' : 'active',
              updatedAt: now,
            }));
        }
        if (!parsed.processedWebhookEvents || typeof parsed.processedWebhookEvents !== 'object') {
          parsed.processedWebhookEvents = {};
        }
        // Migrate away removed local_shopping category if present in persisted state
        parsed.vendors = parsed.vendors.filter(
          (v) => (v.serviceCategory as string) !== 'local_shopping'
        );
        parsed.products = parsed.products.filter(
          (p) => (p.serviceCategory as string) !== 'local_shopping'
        );
        for (const area of parsed.serviceAreas) {
          if (area.minOrderValues && 'local_shopping' in area.minOrderValues) {
            delete (area.minOrderValues as Record<string, number>).local_shopping;
          }
          if (!area.deliveryTiersEnabled) {
            area.deliveryTiersEnabled = { EXPRESS: true, NORMAL: true, ECO: true };
          }
          if (!Array.isArray(area.deliveryZones)) area.deliveryZones = [];
          if (!Array.isArray(area.restrictedZones)) area.restrictedZones = [];
        }
        return parsed;
      }
    } catch (err) {
      console.warn('Could not parse existing DB file, regenerating seed state:', err);
    }
  }
  const initial = createInitialSeedState();
  fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  return initial;
}

export function getDb(): DatabaseState {
  if (!state) {
    state = loadStateFromDisk();
  }
  return state;
}

export async function withTransaction<T>(mutator: (db: DatabaseState) => T | Promise<T>): Promise<T> {
  const db = getDb();
  let result!: T;
  const task = writeQueue.then(async () => {
    const snapshot = JSON.stringify(db);
    try {
      result = await mutator(db);
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      // Rollback in-memory state on transaction failure
      const restored = JSON.parse(snapshot) as DatabaseState;
      Object.assign(db, restored);
      throw err;
    }
  });
  writeQueue = task.catch(() => {});
  await task;
  return result;
}
