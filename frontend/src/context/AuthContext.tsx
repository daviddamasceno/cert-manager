import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, attachAuthInterceptor, setAccessToken as applyAccessToken } from '../services/apiClient';
import { UserRole } from '../types';

type User = {
  id: string;
  email: string;
  role: UserRole;
};

type AuthResponse = {
  accessToken: string;
  expiresIn: number;
};

type AuthContextValue = {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<string | null>;
  hasRole: (role: UserRole | UserRole[]) => boolean;
};

const decodeToken = (token: string): User | null => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const role = payload.role as UserRole | undefined;
    if (!role || !payload.email) {
      return null;
    }
    return { id: payload.sub || payload.email, email: payload.email, role };
  } catch (error) {
    console.error('Erro ao decodificar token', error);
    return null;
  }
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
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

  const hasRole = useCallback(
    (role: UserRole | UserRole[]) => {
      const expected = Array.isArray(role) ? role : [role];
      return user ? expected.includes(user.role) : false;
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(() => ({
    user,
    accessToken,
    loading,
    login,
    logout,
    refreshSession,
    hasRole
  }), [user, accessToken, loading, login, logout, refreshSession, hasRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};
