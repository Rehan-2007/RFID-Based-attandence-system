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
  sendPasswordReset,
  updateUserPassword,
  CONFIGURED_ADMIN_UID,
  withTimeout 
} from '../services/firebase';
import { AppUser, UserRole, AuthStatus } from '../types';

interface AuthContextType {
  user: AppUser | null;
  authStatus: AuthStatus;
  statusMessage: string | null;
  loading: boolean;
  authError: string | null;
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
  const [profileMissing, setProfileMissing] = useState(false);

  const listenerRegisteredRef = useRef(false);
  const activeFirebaseUserRef = useRef<FirebaseUser | null>(null);

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
   * Resolve user profile from Firestore / database with timeout and strict validation
   */
  const resolveProfileForUser = useCallback(async (fbUser: FirebaseUser): Promise<AppUser | null> => {
    setAuthStatus('loading_profile');
    setStatusMessage('Loading your dashboard...');
    setProfileMissing(false);

    try {
      // Fast timeout protected profile fetch
      const profile = await withTimeout(
        getUserProfile(fbUser.uid, fbUser.email),
        4000,
        null
      );

      if (profile && (profile.role === 'admin' || profile.role === 'student')) {
        const appUser: AppUser = {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: profile.name || fbUser.displayName || fbUser.email?.split('@')[0] || (profile.role === 'admin' ? 'Administrator' : 'Student'),
          role: profile.role,
          rfidUID: profile.rfidUID,
          studentId: profile.rollNumber,
          rollNumber: profile.rollNumber,
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
        return appUser;
      }

      // Check if admin by UID directly
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
        return adminUser;
      }

      // Profile does not exist in Firestore or database
      console.warn(`User ${fbUser.email} (${fbUser.uid}) exists in Auth but has no registered profile.`);
      setUser(null);
      setProfileMissing(true);
      setAuthStatus('error');
      setStatusMessage(null);
      setAuthError('Your account exists, but your student profile has not been configured. Contact your administrator.');
      return null;
    } catch (err: any) {
      console.error('Error in profile resolution:', err);
      setUser(null);
      setAuthStatus('error');
      setStatusMessage(null);
      setAuthError(err.message || 'Unable to connect to profile database. Please check your internet connection.');
      return null;
    }
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
          setUser(null);
          setAuthStatus('unauthenticated');
          setStatusMessage(null);
        }
      });
    } catch (e: any) {
      console.warn('Firebase Auth state check notice:', e);
      setUser(null);
      setAuthStatus('unauthenticated');
      setStatusMessage(null);
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
      setAuthError(null);
      await resolveProfileForUser(currentUser);
    } else {
      setAuthStatus('unauthenticated');
      setStatusMessage(null);
    }
  }, [resolveProfileForUser]);

  /**
   * Sign In action with explicit step state and proper cleanup in finally
   */
  const login = async (
    email: string, 
    pass: string, 
    rememberMe: boolean = true
  ): Promise<{ success: boolean; role?: UserRole; error?: string }> => {
    setAuthError(null);
    setProfileMissing(false);
    setAuthStatus('authenticating');
    setStatusMessage('Authenticating your account...');

    const trimmedEmail = email.trim().toLowerCase();

    try {
      const auth = getFirebaseAuth();

      // Set persistence based on preference
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

      // Profile retrieval step
      const appUser = await resolveProfileForUser(fbUser);
      if (appUser) {
        return { success: true, role: appUser.role };
      }

      return {
        success: false,
        error: 'Your account exists, but your student profile has not been configured. Contact your administrator.'
      };
    } catch (err: any) {
      console.error('Firebase Auth sign in error:', err);
      let msg = 'Incorrect email or password.';
      
      if (
        err.code === 'auth/user-not-found' || 
        err.code === 'auth/wrong-password' || 
        err.code === 'auth/invalid-credential'
      ) {
        msg = 'Incorrect email or password.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Unable to connect. Check your internet connection and try again.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed login attempts. Account temporarily locked for security.';
      } else if (err.message?.toLowerCase().includes('permission') || err.code?.includes('permission')) {
        msg = 'Your account does not have permission to access this information.';
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
      activeFirebaseUserRef.current = null;
      setUser(null);
      setAuthStatus('unauthenticated');
      setStatusMessage(null);
      setAuthError(null);
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
      console.error('Password reset email error:', err);
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
      console.error('Password update error:', err);
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

  // Backwards-compatible loading flag for any component reading `loading`
  const loading = authStatus === 'initializing' || authStatus === 'authenticating' || authStatus === 'loading_profile';

  return (
    <AuthContext.Provider
      value={{
        user,
        authStatus,
        statusMessage,
        loading,
        authError,
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
