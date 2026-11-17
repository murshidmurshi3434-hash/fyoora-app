import { getRedirectResult, signInWithPopup, signInWithRedirect, signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, getDocFromServer, setDoc, updateDoc } from 'firebase/firestore';
import type { UserProfile } from '../shared/types.ts';
import { apiRequest } from './api.ts';
import { auth, db, googleAuthProvider, handleFirestoreError, OperationType } from './firebase.ts';
import {
  buildFirestoreCustomerProfileDoc,
  classifyGoogleAuthError,
  extractFirestoreHydrationProfile,
  type ClassifiedGoogleAuthError,
  type FirestoreHydrationProfile,
} from './googleAuthCore.ts';

const GOOGLE_REDIRECT_PENDING_KEY = 'fyoora_google_redirect_pending_v1';
const GOOGLE_REDIRECT_PRIVACY_KEY = 'fyoora_google_redirect_privacy_v1';

export class GoogleAuthHandledError extends Error {
  readonly classified: ClassifiedGoogleAuthError;

  constructor(classified: ClassifiedGoogleAuthError) {
    super(classified.userMessage);
    this.name = 'GoogleAuthHandledError';
    this.classified = classified;
  }
}

export type GoogleSignInInitiationResult =
  | {
      status: 'signed_in';
      firebaseUser: FirebaseUser;
      idToken: string;
    }
  | {
      status: 'redirecting';
    };

export async function signInWithGooglePopupOrRedirect(
  privacyAccepted: boolean
): Promise<GoogleSignInInitiationResult> {
  try {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    return {
      status: 'signed_in',
      firebaseUser: cred.user,
      idToken,
    };
  } catch (error) {
    const classified = classifyGoogleAuthError(error);
    if (classified.shouldFallbackToRedirect) {
      try {
        sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY, '1');
        sessionStorage.setItem(GOOGLE_REDIRECT_PRIVACY_KEY, privacyAccepted ? '1' : '0');
      } catch {
        // Ignore storage restrictions
      }
      await signInWithRedirect(auth, googleAuthProvider);
      return { status: 'redirecting' };
    }
    throw new GoogleAuthHandledError(classified);
  }
}

function clearPendingGoogleRedirectFlags() {
  try {
    sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
    sessionStorage.removeItem(GOOGLE_REDIRECT_PRIVACY_KEY);
  } catch {
    // Ignore storage issues
  }
}

export async function consumeGoogleRedirectResult(): Promise<{
  firebaseUser: FirebaseUser;
  idToken: string;
  privacyAccepted: boolean;
} | null> {
  let privacyAccepted = true;
  try {
    const storedPrivacy = sessionStorage.getItem(GOOGLE_REDIRECT_PRIVACY_KEY);
    if (storedPrivacy === '0') privacyAccepted = false;
  } catch {
    // Ignore storage issues
  }

  try {
    await auth.authStateReady();
    const result = await getRedirectResult(auth);
    clearPendingGoogleRedirectFlags();
    if (!result?.user) {
      return null;
    }
    const idToken = await result.user.getIdToken();
    return {
      firebaseUser: result.user,
      idToken,
      privacyAccepted,
    };
  } catch (error) {
    clearPendingGoogleRedirectFlags();
    throw new GoogleAuthHandledError(classifyGoogleAuthError(error));
  }
}

export function hasPendingGoogleRedirect(): boolean {
  try {
    return sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export async function fetchCustomerProfileFromFirestore(
  uid: string
): Promise<Record<string, unknown> | null> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  try {
    const snap = await getDocFromServer(ref);
    return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline') || msg.includes('Failed to get document because the client is offline')) {
      try {
        const cachedSnap = await getDoc(ref);
        return cachedSnap.exists() ? (cachedSnap.data() as Record<string, unknown>) : null;
      } catch (cacheErr) {
        handleFirestoreError(cacheErr, OperationType.GET, path);
      }
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function syncCustomerProfileToFirestore(params: {
  authUid: string;
  user: UserProfile;
  existingDoc?: Record<string, unknown> | null;
}): Promise<void> {
  const path = `users/${params.authUid}`;
  const ref = doc(db, 'users', params.authUid);

  let existing = params.existingDoc;
  if (existing === undefined) {
    try {
      const snap = await getDocFromServer(ref);
      existing = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    } catch {
      try {
        const cachedSnap = await getDoc(ref);
        existing = cachedSnap.exists() ? (cachedSnap.data() as Record<string, unknown>) : null;
      } catch {
        existing = null;
      }
    }
  }

  if (!existing) {
    // On initial client-side Firestore create, non-admin users must create with role: 'customer'
    // per firestore.rules while appUserId preserves the authoritative server user record ID.
    const safeCreateUser: UserProfile =
      params.user.role === 'super_admin' || params.user.role === 'admin'
        ? params.user
        : { ...params.user, role: 'customer' };

    const createDoc = buildFirestoreCustomerProfileDoc({
      authUid: params.authUid,
      user: safeCreateUser,
      existingDoc: null,
    });

    try {
      await setDoc(ref, createDoc);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  const mergedDoc = buildFirestoreCustomerProfileDoc({
    authUid: params.authUid,
    user: params.user,
    existingDoc: existing,
  });

  const updatePayload: Record<string, unknown> = {
    appUserId: mergedDoc.appUserId,
    fullName: mergedDoc.fullName,
    phone: mergedDoc.phone,
    preferredLanguage: mergedDoc.preferredLanguage,
    addresses: mergedDoc.addresses,
    favourites: mergedDoc.favourites,
    profileCompleted: mergedDoc.profileCompleted,
    accountStatus: mergedDoc.accountStatus,
    updatedAt: mergedDoc.updatedAt,
  };

  if (mergedDoc.email !== undefined) updatePayload.email = mergedDoc.email;
  if (mergedDoc.emailVerified !== undefined) updatePayload.emailVerified = mergedDoc.emailVerified;
  if (mergedDoc.profileImage !== undefined) updatePayload.profileImage = mergedDoc.profileImage;
  if (mergedDoc.contactPhone !== undefined) updatePayload.contactPhone = mergedDoc.contactPhone;
  if (mergedDoc.contactPhoneVerified !== undefined) {
    updatePayload.contactPhoneVerified = mergedDoc.contactPhoneVerified;
  }
  if (mergedDoc.authProvider !== undefined) updatePayload.authProvider = mergedDoc.authProvider;
  if (mergedDoc.linkedProviders !== undefined) updatePayload.linkedProviders = mergedDoc.linkedProviders;
  if (mergedDoc.deletionRequestedAt !== undefined) {
    updatePayload.deletionRequestedAt = mergedDoc.deletionRequestedAt;
  }

  try {
    await updateDoc(ref, updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncCurrentFirebaseUserProfile(user: UserProfile): Promise<void> {
  const current = auth.currentUser;
  if (!current) return;
  try {
    await syncCustomerProfileToFirestore({
      authUid: current.uid,
      user,
    });
  } catch (err) {
    console.warn('Non-blocking Firestore profile sync notice:', err instanceof Error ? err.message : err);
  }
}

export async function completeFirebaseGoogleLogin(params: {
  firebaseUser: FirebaseUser;
  idToken: string;
  privacyAccepted: boolean;
}): Promise<{
  user: UserProfile;
  token: string;
  isNewUser: boolean;
  linkedExistingAccount: boolean;
  firestoreSynced: boolean;
}> {
  let existingFirestoreDoc: Record<string, unknown> | null = null;
  let hydrationProfile: FirestoreHydrationProfile | null = null;

  try {
    existingFirestoreDoc = await Promise.race([
      fetchCustomerProfileFromFirestore(params.firebaseUser.uid),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    hydrationProfile = extractFirestoreHydrationProfile(existingFirestoreDoc);
  } catch (err) {
    // Non-blocking read fallback: server remains authoritative if Firestore rules reject or client is offline
    console.warn('Firestore profile lookup fallback:', err instanceof Error ? err.message : err);
  }

  const res = await apiRequest<{
    user: UserProfile;
    token: string;
    isNewUser: boolean;
    linkedExistingAccount?: boolean;
  }>('/api/auth/firebase', {
    method: 'POST',
    json: {
      idToken: params.idToken,
      privacyAccepted: params.privacyAccepted,
      firestoreProfile: hydrationProfile,
    },
  });

  let firestoreSynced = false;
  try {
    await syncCustomerProfileToFirestore({
      authUid: params.firebaseUser.uid,
      user: res.user,
      existingDoc: existingFirestoreDoc,
    });
    firestoreSynced = true;
  } catch (err) {
    console.warn('Firestore profile sync skipped:', err instanceof Error ? err.message : err);
  }

  return {
    ...res,
    linkedExistingAccount: Boolean(res.linkedExistingAccount),
    firestoreSynced,
  };
}

/**
 * Recovers an active Firebase Auth user session into a verified FYOORA backend session
 * when getRedirectResult() was cleared by third-party storage partitioning or when the
 * server session cookie/token expired or rotated across restarts.
 */
export async function recoverFirebaseSessionIfSignedIn(): Promise<{
  user: UserProfile;
  token: string;
  isNewUser: boolean;
  linkedExistingAccount: boolean;
  firestoreSynced: boolean;
} | null> {
  await auth.authStateReady();
  const current = auth.currentUser;
  if (!current) return null;

  let privacyAccepted = true;
  try {
    const storedPrivacy = sessionStorage.getItem(GOOGLE_REDIRECT_PRIVACY_KEY);
    if (storedPrivacy === '0') privacyAccepted = false;
  } catch {
    // Ignore storage restrictions
  }
  clearPendingGoogleRedirectFlags();

  const idToken = await current.getIdToken();
  return completeFirebaseGoogleLogin({
    firebaseUser: current,
    idToken,
    privacyAccepted,
  });
}

export async function signOutFirebaseSession(): Promise<void> {
  clearPendingGoogleRedirectFlags();
  try {
    await signOut(auth);
  } catch {
    // Ignore Firebase client sign-out error during logout
  }
}
