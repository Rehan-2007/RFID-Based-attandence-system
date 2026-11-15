import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut as fbSignOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirebaseAuth, 
  getActiveFirebaseConfig, 
  refreshAdminToken,
  getUserProfile,
  classifyFirebaseError,
  sendPasswordReset,
  updateUserPassword,
  CONFIGURED_ADMIN_UID,
  withTimeoutReject
} from '../services/firebase';
import { AppUser, UserRole, AuthStatus, DbDiagnosticCode } from '../types';

interface AuthContextType {
  user: AppUser | null;
  authStatus: AuthStatus;
  statusMessage: string | null;
  loading: boolean;
  authError: string | null;
  authDiagnosticCode: DbDiagnosticCode | null;
  authDiagnosticPath: string | null;
  profileMissing: boolean;
  login: (email: string, pass: string, rememberMe?: boolean) => Promise<{ success: boolean; role?: UserRole; error?: string }>;
  logout: () => Promise<void>;
  retryProfileLoad: () => Promise<void>;
  sendResetEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (newPass: string) => Promise<{ success: boolean; error?: string }>;
  refreshToken: () => Promise<boolean>;
  isFirebaseConfigured: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('initializing');
  const [statusMessage, setStatusMessage] = useState<string | null>('Initializing portal security...');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authDiagnosticCode, setAuthDiagnosticCode] = useState<DbDiagnosticCode | null>(null);
  const [authDiagnosticPath, setAuthDiagnosticPath] = useState<string | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  const listenerRegisteredRef = useRef(false);
  const activeFirebaseUserRef = useRef<FirebaseUser | null>(null);
  const lastResolveErrorRef = useRef<string | null>(null);
  const inFlightResolveRef = useRef<Map<string, Promise<AppUser | null>>>(new Map());

  const config = getActiveFirebaseConfig();
  const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

  // Clear legacy mock session keys
  useEffect(() => {
    try {
      localStorage.removeItem('rfid_portal_admin_session');
    } catch {
      // Ignore
    }
  }, []);

  /**
   * Resolve user profile dynamically from RTDB /users/{authUid}, /auth_to_student/{authUid},
   * Firestore users/{authUid}, and scoped /students/{studentDbId}.
   * Deduplicates concurrent calls for the same Firebase UID (e.g., login + onAuthStateChanged).
   */
  const resolveProfileForUser = useCallback((fbUser: FirebaseUser): Promise<AppUser | null> => {
    const existingPromise = inFlightResolveRef.current.get(fbUser.uid);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = (async (): Promise<AppUser | null> => {
      setAuthStatus('loading_profile');
      setStatusMessage('Reading profile & verifying role...');
      setProfileMissing(false);
      setAuthDiagnosticCode(null);
      setAuthDiagnosticPath(null);
      lastResolveErrorRef.current = null;

      try {
        const profile = await withTimeoutReject(
          getUserProfile(fbUser.uid, fbUser.email),
          8500,
          'Timed out connecting to Firebase profile database.'
        );

        if (profile && (profile.role === 'admin' || profile.role === 'student')) {
          const resolvedRfid = profile.role === 'student'
            ? (profile.rfidUID || '').trim().toUpperCase()
            : undefined;
          const resolvedStudentDbId = profile.role === 'student'
            ? (profile.studentDbId || resolvedRfid || '').trim()
            : undefined;
          const resolvedRoll = profile.rollNumber || undefined;

          const appUser: AppUser = {
            uid: fbUser.uid,
            studentDbId: resolvedStudentDbId || undefined,
            email: fbUser.email,
            displayName:
              profile.name ||
              fbUser.displayName ||
              fbUser.email?.split('@')[0] ||
              (profile.role === 'admin' ? 'Administrator' : 'Student'),
            role: profile.role,
            rfidUID: resolvedRfid || undefined,
            studentId: resolvedRoll,
            rollNumber: resolvedRoll,
            department: profile.department,
            year: profile.year,
            semester: profile.semester,
            phone: profile.phone,
            provider: 'firebase',
          };

          setUser(appUser);
          setAuthStatus('authenticated');
          setStatusMessage(null);
          setAuthError(null);
          setAuthDiagnosticCode('connected');
          setAuthDiagnosticPath(null);
          return appUser;
        }

        if (fbUser.uid === CONFIGURED_ADMIN_UID) {
          const adminUser: AppUser = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: 'System Administrator',
            role: 'admin',
            provider: 'firebase',
          };
          setUser(adminUser);
          setAuthStatus('authenticated');
          setStatusMessage(null);
          setAuthError(null);
          setAuthDiagnosticCode('connected');
          setAuthDiagnosticPath(null);
          return adminUser;
        }

        const missingPath = `/users/${fbUser.uid}`;
        const notRegisteredMsg = `Your account (${fbUser.email || fbUser.uid}) is authenticated, but no user profile exists at ${missingPath}. Ask an administrator to link your account.`;
        console.warn(`User ${fbUser.email} (${fbUser.uid}) exists in Auth but has no registered profile.`);
        setUser(null);
        setProfileMissing(true);
        setAuthDiagnosticCode('not_registered');
        setAuthDiagnosticPath(missingPath);
        setAuthStatus('error');
        setStatusMessage(null);
        setAuthError(notRegisteredMsg);
        lastResolveErrorRef.current = notRegisteredMsg;
        return null;
      } catch (err: any) {
        console.warn('Profile resolution diagnostic notice:', err?.message || err);
        const diag = classifyFirebaseError(err);
        const errPath = err?.path || diag.path || `/users/${fbUser.uid}`;
        setUser(null);
        setAuthStatus('error');
        setStatusMessage(null);
        setAuthDiagnosticCode(diag.code);
        setAuthDiagnosticPath(errPath);
        setProfileMissing(diag.code === 'not_registered' || diag.code === 'mapping_missing');
        setAuthError(err?.message || diag.message);
        lastResolveErrorRef.current = err?.message || diag.message;
        return null;
      } finally {
        inFlightResolveRef.current.delete(fbUser.uid);
      }
    })();

    inFlightResolveRef.current.set(fbUser.uid, promise);
    return promise;
  }, []);

  // Single centralized onAuthStateChanged listener
  useEffect(() => {
    if (listenerRegisteredRef.current) return;
    listenerRegisteredRef.current = true;

    let unsubscribe = () => {};

    try {
      const auth = getFirebaseAuth();

      unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
        activeFirebaseUserRef.current = fbUser;

        if (fbUser) {
          await resolveProfileForUser(fbUser);
        } else {
          inFlightResolveRef.current.clear();
          setUser(null);
          setAuthStatus('unauthenticated');
          setStatusMessage(null);
          setAuthDiagnosticCode(null);
          setAuthDiagnosticPath(null);
        }
      });
    } catch (e: any) {
      console.warn('Firebase Auth state check notice:', e);
      setUser(null);
      setAuthStatus('unauthenticated');
      setStatusMessage(null);
      setAuthDiagnosticCode(null);
      setAuthDiagnosticPath(null);
    }

    return () => {
      unsubscribe();
      listenerRegisteredRef.current = false;
    };
  }, [resolveProfileForUser]);

  /**
   * Retry profile loading if interrupted or failed
   */
  const retryProfileLoad = useCallback(async () => {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser || activeFirebaseUserRef.current;
    if (currentUser) {
      inFlightResolveRef.current.delete(currentUser.uid);
      setAuthError(null);
      await resolveProfileForUser(currentUser);
    } else {
      setAuthStatus('unauthenticated');
      setStatusMessage(null);
      setAuthDiagnosticPath(null);
    }
  }, [resolveProfileForUser]);

  /**
   * Sign In action with explicit step state and proper cleanup
   */
  const login = async (
    email: string, 
    pass: string, 
    rememberMe: boolean = true
  ): Promise<{ success: boolean; role?: UserRole; error?: string }> => {
    setAuthError(null);
    setAuthDiagnosticCode(null);
    setAuthDiagnosticPath(null);
    setProfileMissing(false);
    setAuthStatus('authenticating');
    setStatusMessage('Authenticating your account...');

    const trimmedEmail = email.trim().toLowerCase();

    try {
      const auth = getFirebaseAuth();

      try {
        await setPersistence(
          auth, 
          rememberMe ? browserLocalPersistence : browserSessionPersistence
        );
      } catch (persistErr) {
        console.warn('Could not set persistence:', persistErr);
      }

      const credential = await signInWithEmailAndPassword(auth, trimmedEmail, pass);
      const fbUser = credential.user;

      if (!fbUser) {
        throw new Error('Authentication succeeded but no active session was established.');
      }

      activeFirebaseUserRef.current = fbUser;

      const appUser = await resolveProfileForUser(fbUser);
      if (appUser) {
        return { success: true, role: appUser.role };
      }

      return {
        success: false,
        error:
          lastResolveErrorRef.current ||
          'Your account is authenticated, but your user profile or student mapping is missing. Contact your administrator.',
      };
    } catch (err: any) {
      console.warn('Firebase Auth sign in attempt result:', err?.code || err?.message);
      let msg = 'Incorrect email or password.';
      
      if (
        err.code === 'auth/user-not-found' || 
        err.code === 'auth/wrong-password' || 
        err.code === 'auth/invalid-credential'
      ) {
        msg = 'Incorrect email or password. Please check your credentials and try again.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Unable to connect. Check your internet connection and try again.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed login attempts. Account temporarily locked for security.';
      } else if (err.message?.toLowerCase().includes('permission') || err.code?.includes('permission')) {
        msg = 'Permission denied accessing your profile in Firebase. Contact your administrator.';
      } else if (err.message) {
        msg = err.message;
      }

      setUser(null);
      setAuthStatus('unauthenticated');
      setStatusMessage(null);
      setAuthError(msg);
      return { success: false, error: msg };
    }
  };

  /**
   * Clean Logout action
   */
  const logout = async () => {
    setAuthStatus('authenticating');
    setStatusMessage('Signing out...');
    try {
      const auth = getFirebaseAuth();
      await fbSignOut(auth);
    } catch (e) {
      console.warn('Sign out notice:', e);
    } finally {
      inFlightResolveRef.current.clear();
      activeFirebaseUserRef.current = null;
      setUser(null);
      setAuthStatus('unauthenticated');
      setStatusMessage(null);
      setAuthError(null);
      setAuthDiagnosticCode(null);
      setAuthDiagnosticPath(null);
      setProfileMissing(false);
      try {
        window.history.replaceState(null, '', '/');
      } catch {}
    }
  };

  const sendResetEmail = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await sendPasswordReset(email);
      return { success: true };
    } catch (err: any) {
      console.warn('Password reset email notice:', err?.code || err?.message);
      let msg = 'Failed to send password reset email.';
      if (err.code === 'auth/user-not-found') {
        msg = 'No registered account found with this email address.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      } else if (err.message) {
        msg = err.message;
      }
      return { success: false, error: msg };
    }
  };

  const changePassword = async (newPass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await updateUserPassword(newPass);
      return { success: true };
    } catch (err: any) {
      console.warn('Password update notice:', err?.code || err?.message);
      let msg = 'Failed to update password. Please check security requirements.';
      if (err.code === 'auth/weak-password') {
        msg = 'Password is too weak. Please use at least 6 characters.';
      } else if (err.code === 'auth/requires-recent-login') {
        msg = 'This security operation requires recent authentication. Please sign out and sign in again.';
      } else if (err.message) {
        msg = err.message;
      }
      return { success: false, error: msg };
    }
  };

  const refreshToken = async (): Promise<boolean> => {
    return refreshAdminToken();
  };

  const loading = authStatus === 'initializing' || authStatus === 'authenticating' || authStatus === 'loading_profile';

  return (
    <AuthContext.Provider
      value={{
        user,
        authStatus,
        statusMessage,
        loading,
        authError,
        authDiagnosticCode,
        authDiagnosticPath,
        profileMissing,
        login,
        logout,
        retryProfileLoad,
        sendResetEmail,
        changePassword,
        refreshToken,
        isFirebaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
