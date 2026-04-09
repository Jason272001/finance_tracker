import { Alert, Linking } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  authApi,
  getApiErrorInfo,
  getAuthToken,
  setAuthToken,
  setSessionExpiredHandler,
} from '../services/api';
import { clearStoredAuthTokens, getStoredAuthTokens, storeAuthTokens } from '../services/authStorage';
import { AuthUser, PaymentRequiredInfo } from '../types/app';

interface AuthContextValue {
  user: AuthUser | null;
  isReady: boolean;
  isAuthenticated: boolean;
  signIn: (name: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  openWebSession: (destination?: 'dashboard' | 'profile') => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await clearStoredAuthTokens();
  }, []);

  const refreshSession = useCallback(async () => {
    const session = await authApi.session();
    setUser((prev) => ({ ...(prev ?? {}), ...session, token: getAuthToken() ?? session.token }));
  }, []);

  const openWebSession = useCallback(async (destination: 'dashboard' | 'profile' = 'dashboard') => {
    try {
      const response = await authApi.createWebSession(destination);
      const launchUrl = String(response.launch_url || '').trim();
      if (!launchUrl) {
        throw new Error('Website launch URL is missing.');
      }
      await Linking.openURL(launchUrl);
    } catch (error) {
      const info = getApiErrorInfo(error);
      Alert.alert('Unable to open website', info.message);
    }
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(async () => {
      await clearSession();
    });

    const bootstrap = async () => {
      try {
        const { accessToken, refreshToken } = await getStoredAuthTokens();
        if (!accessToken && !refreshToken) {
          setIsReady(true);
          return;
        }
        setAuthToken(accessToken);
        const session = await authApi.session();
        setUser({ ...session, token: getAuthToken() ?? accessToken ?? undefined });
      } catch {
        await clearSession();
      } finally {
        setIsReady(true);
      }
    };

    void bootstrap();

    return () => {
      setSessionExpiredHandler(null);
    };
  }, [clearSession]);

  const signIn = useCallback(async (name: string, password: string) => {
    try {
      const session = await authApi.login(name, password);
      if (!session.token) {
        throw new Error('Login response did not include an access token.');
      }
      await storeAuthTokens(session.token, session.refresh_token ?? null);
      setAuthToken(session.token);
      setUser(session);
    } catch (error) {
      throw getApiErrorInfo(error) as PaymentRequiredInfo;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { refreshToken } = await getStoredAuthTokens();
      await authApi.logout(refreshToken);
    } catch {
      // Best effort.
    } finally {
      await clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isReady,
    isAuthenticated: Boolean(user),
    signIn,
    signOut,
    refreshSession,
    openWebSession,
  }), [isReady, openWebSession, refreshSession, signIn, signOut, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
};
