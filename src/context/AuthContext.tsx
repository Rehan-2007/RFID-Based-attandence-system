import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut as fbSignOut, 
  onAuthStateChanged,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirebaseAuth, 
  getActiveFirebaseConfig, 
  saveActiveFirebaseConfig, 
  refreshAdminToken,
  CONFIGURED_ADMIN_UID 
} from '../services/firebase';

export interface AdminUser {
  uid: string;
  email: string | null;
  displayName: string;
  role: 'admin';
  provider: 'firebase';
}

interface AuthContextType {
  user: AdminUser | null;
  loading: boolean;
  authError: string | null;
  login: (email: string, pass: string, apiKeyInput?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  isFirebaseConfigured: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const config = getActiveFirebaseConfig();
  const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

  // Clear any legacy mock or local sessions immediately
  useEffect(() => {
    try {
      localStorage.removeItem('rfid_portal_admin_session');
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};

    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
        if (fbUser) {
          // Strict verification: Ensure authenticated account UID matches configured admin UID
          if (fbUser.uid !== CONFIGURED_ADMIN_UID) {
            console.warn(`Unauthorized login attempt. UID ${fbUser.uid} does not match Admin UID ${CONFIGURED_ADMIN_UID}`);
            await fbSignOut(auth);
            setUser(null);
            setAuthError(`Access Denied: Authenticated account UID (${fbUser.uid}) is not authorized as Administrator. Configured Admin UID: ${CONFIGURED_ADMIN_UID}`);
            setLoading(false);
            return;
          }

          // Verified Administrator
          setUser({
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Administrator',
            role: 'admin',
            provider: 'firebase',
          });
          setAuthError(null);
          setLoading(false);
        } else {
          setUser(null);
          setLoading(false);
        }
      });
    } catch (e: any) {
      console.warn('Firebase Auth state check notice:', e);
      setUser(null);
      setLoading(false);
    }

    return () => unsubscribe();
  }, [config.apiKey]);

  const login = async (
    email: string, 
    pass: string, 
    apiKeyInput?: string
  ): Promise<{ success: boolean; error?: string }> => {
    setAuthError(null);
    setLoading(true);

    // Save provided API Key if given and different
    if (apiKeyInput && apiKeyInput.trim()) {
      const trimmedKey = apiKeyInput.trim();
      const currentConfig = getActiveFirebaseConfig();
      if (currentConfig.apiKey !== trimmedKey) {
        saveActiveFirebaseConfig({
          ...currentConfig,
          apiKey: trimmedKey,
        });
      }
    }

    const trimmedEmail = email.trim();

    try {
      const auth = getFirebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, trimmedEmail, pass);
      const fbUser = credential.user;

      if (!fbUser) {
        throw new Error('Authentication succeeded but no active user session was established.');
      }

      // Verify that the authenticated user's UID matches the configured admin UID
      if (fbUser.uid !== CONFIGURED_ADMIN_UID) {
        console.warn(`User UID mismatch: expected ${CONFIGURED_ADMIN_UID}, got ${fbUser.uid}`);
        await fbSignOut(auth);
        setUser(null);
        const deniedMsg = `Access Denied: Authenticated user UID (${fbUser.uid}) does not match Administrator UID (${CONFIGURED_ADMIN_UID}).`;
        setAuthError(deniedMsg);
        setLoading(false);
        return { success: false, error: deniedMsg };
      }

      const adminUser: AdminUser = {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Administrator',
        role: 'admin',
        provider: 'firebase',
      };

      setUser(adminUser);
      setAuthError(null);
      setLoading(false);
      return { success: true };
    } catch (err: any) {
      console.error('Firebase Auth sign in error:', err);
      let msg = 'Failed to sign in. Please verify your administrator credentials.';
      if (
        err.code === 'auth/user-not-found' || 
        err.code === 'auth/wrong-password' || 
        err.code === 'auth/invalid-credential'
      ) {
        msg = 'Invalid administrator email or password. Access denied.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed login attempts. Access temporarily locked for security.';
      } else if (err.code === 'auth/api-key-not-valid' || err.code === 'auth/invalid-api-key') {
        msg = 'Firebase Web API Key is invalid or not yet configured. Please verify your Web API Key.';
      } else if (err.message) {
        msg = err.message;
      }
      setAuthError(msg);
      setLoading(false);
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      await fbSignOut(auth);
    } catch {
      // Ignore
    }
    setUser(null);
    setAuthError(null);
    setLoading(false);
  };

  const refreshToken = async (): Promise<boolean> => {
    try {
      const refreshed = await refreshAdminToken();
      if (refreshed) {
        const auth = getFirebaseAuth();
        if (auth.currentUser && auth.currentUser.uid === CONFIGURED_ADMIN_UID) {
          setUser({
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            displayName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Administrator',
            role: 'admin',
            provider: 'firebase',
          });
        }
        return true;
      }
    } catch (e) {
      console.warn('Token refresh error:', e);
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        login,
        logout,
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
