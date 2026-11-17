
import {
  getApps,
  initializeApp,
  cert,
  applicationDefault,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

function getFirebaseCredential() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (!serviceAccountJson) {
    return applicationDefault();
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);

    if (
      serviceAccount.project_id !== firebaseConfig.projectId ||
      !serviceAccount.client_email ||
      !serviceAccount.private_key
    ) {
      throw new Error('Firebase service account configuration is incomplete or belongs to another project.');
    }

    return cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    });
  } catch {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON configuration.');
  }
}

const app =
  getApps().find((existingApp) => existingApp.name === '[DEFAULT]') ??
  initializeApp({
    credential: getFirebaseCredential(),
    projectId: firebaseConfig.projectId,
  });

export const adminAuth = getAuth(app);

export const adminDb = getFirestore(
  app,
  firebaseConfig.firestoreDatabaseId
);
