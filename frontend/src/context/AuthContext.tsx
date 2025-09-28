import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, attachAuthInterceptor, setAccessToken as applyAccessToken } from '../services/apiClient';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'active' | 'disabled';
  lastLoginAt?: string;
  mfaEnabled: boolean;
};

type AuthResponse = {
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  requiresPasswordReset: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  requiresPasswordReset: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((payload: AuthResponse) => {
    setAccessToken(payload.accessToken);
    applyAccessToken(payload.accessToken);
    setUser(payload.user);
    setRequiresPasswordReset(payload.requiresPasswordReset);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    applyAccessToken(null);
    setRequiresPasswordReset(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    applySession(data);
  }, [applySession]);

  const logout = useCallback(() => {
    clearSession();
    api.post('/auth/logout').catch(() => {});
  }, [clearSession]);

  const refreshSession = useCallback(async (): Promise<string | null> => {
    try {
      const { data } = await api.post<AuthResponse>('/auth/refresh');
      applySession(data);
      return data.accessToken;
    } catch (error) {
      clearSession();
      return null;
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    attachAuthInterceptor(refreshSession);
  }, [refreshSession]);

  useEffect(() => {
    (async () => {
      try {
        await refreshSession();
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    accessToken,
    requiresPasswordReset,
    loading,
    login,
    logout,
    refreshSession
  }), [user, accessToken, requiresPasswordReset, loading, login, logout, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};
