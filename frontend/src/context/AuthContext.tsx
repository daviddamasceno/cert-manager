import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, attachAuthInterceptor, setAccessToken as applyAccessToken } from '../services/apiClient';

type User = {
  id: string;
  email: string;
};

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type AuthContextValue = {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<string | null>;
};

const STORAGE_KEY = 'cert-manager-auth';

const decodeToken = (token: string): User | null => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { id: payload.sub || payload.email, email: payload.email };
  } catch (error) {
    console.error('Erro ao decodificar token', error);
    return null;
  }
};

const persistTokens = (data: AuthResponse): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

const readTokens = (): AuthResponse | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthResponse;
  } catch (error) {
    console.error('Erro ao ler sess?o persistida', error);
    return null;
  }
};

const clearTokens = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTokenRef = useRef<string | null>(null);

  const applySession = useCallback((payload: AuthResponse) => {
    setAccessToken(payload.accessToken);
    setRefreshToken(payload.refreshToken);
    refreshTokenRef.current = payload.refreshToken;
    persistTokens(payload);
    applyAccessToken(payload.accessToken);
    setUser(decodeToken(payload.accessToken));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    applySession(data);
  }, [applySession]);

  const logout = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
    refreshTokenRef.current = null;
    setUser(null);
    clearTokens();
    applyAccessToken(null);
  }, []);

  const refreshSession = useCallback(async (): Promise<string | null> => {
    const currentRefresh = refreshTokenRef.current;
    if (!currentRefresh) {
      logout();
      return null;
    }
    try {
      const { data } = await api.post<AuthResponse>('/auth/refresh', { refreshToken: currentRefresh });
      applySession(data);
      return data.accessToken;
    } catch (error) {
      logout();
      return null;
    }
  }, [applySession, logout]);

  useEffect(() => {
    const persisted = readTokens();
    if (persisted) {
      applySession(persisted);
    }
    setLoading(false);
  }, [applySession]);

  useEffect(() => {
    refreshTokenRef.current = refreshToken;
  }, [refreshToken]);

  useEffect(() => {
    attachAuthInterceptor(
      async () => refreshTokenRef.current,
      async () => refreshSession()
    );
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
