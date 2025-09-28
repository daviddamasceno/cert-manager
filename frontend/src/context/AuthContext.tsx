import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, attachAuthInterceptor, setAccessToken as applyAccessToken } from '../services/apiClient';
import { UserRole } from '../types';

type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
};

type AuthResponse = {
  accessToken: string;
  expiresIn: number;
};

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<string | null>;
};

const parseRole = (value: unknown): UserRole => {
  return value === 'admin' || value === 'editor' || value === 'viewer' ? value : 'viewer';
};

const decodeToken = (token: string): AuthUser | null => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const role = parseRole(payload.role);
    return { id: payload.sub || payload.email, email: payload.email, role, name: payload.name };
  } catch (error) {
    console.error('Erro ao decodificar token', error);
    return null;
  }
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((payload: AuthResponse) => {
    setAccessToken(payload.accessToken);
    applyAccessToken(payload.accessToken);
    setUser(decodeToken(payload.accessToken));
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    applyAccessToken(null);
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
    loading,
    login,
    logout,
    refreshSession
  }), [user, accessToken, loading, login, logout, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};
