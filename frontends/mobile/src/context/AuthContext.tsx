import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, getApiErrorInfo, setAuthToken } from '../services/api';
import { AuthUser, PaymentRequiredInfo } from '../types/app';

const TOKEN_KEY = 'keeperbma_mobile_token';

interface AuthContextValue {
  user: AuthUser | null;
  isReady: boolean;
  isAuthenticated: boolean;
  signIn: (name: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
  }, []);

  const refreshSession = useCallback(async () => {
    const session = await authApi.session();
    setUser((prev) => ({ ...prev, ...session }));
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        if (!token) {
          setIsReady(true);
          return;
        }
        setAuthToken(token);
        const session = await authApi.session();
        setUser({ ...session, token });
      } catch {
        await clearSession();
      } finally {
        setIsReady(true);
      }
    };

    bootstrap();
  }, [clearSession]);

  const signIn = useCallback(async (name: string, password: string) => {
    try {
      const session = await authApi.login(name, password);
      if (!session.token) {
        throw new Error('Login response did not include an access token.');
      }
      await AsyncStorage.setItem(TOKEN_KEY, session.token);
      setAuthToken(session.token);
      setUser(session);
    } catch (error) {
      throw getApiErrorInfo(error) as PaymentRequiredInfo;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
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
  }), [isReady, refreshSession, signIn, signOut, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
};
