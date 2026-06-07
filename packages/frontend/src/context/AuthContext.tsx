import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';
import api, { setAccessToken, setOnAuthFail } from '../lib/api';

export interface TenantInfo {
  id: string;
  name: string;
}
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'TENANT_OWNER' | 'TENANT_USER';
  unvan?: string | null;
  permissions?: string[] | null;
  tenantId: string | null;
  tenant: TenantInfo | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  isOwner: boolean;
  canAccess: (path: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { fullName: string; companyName: string; phone: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applyAuth = (accessToken: string, u: AuthUser) => {
    setAccessToken(accessToken);
    setUser(u);
  };

  const init = useCallback(async () => {
    try {
      const r = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true });
      applyAuth(r.data.accessToken, r.data.user);
    } catch {
      setUser(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOnAuthFail(() => { setUser(null); setAccessToken(null); });
    init();
  }, [init]);

  const login = async (email: string, password: string) => {
    const r = await api.post('/auth/login', { email, password });
    applyAuth(r.data.accessToken, r.data.user);
  };

  const register = async (data: { fullName: string; companyName: string; phone: string; email: string; password: string }) => {
    const r = await api.post('/auth/register', data);
    applyAuth(r.data.accessToken, r.data.user);
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* */ }
    setUser(null);
    setAccessToken(null);
  };

  const refreshUser = async () => {
    try {
      const r = await api.get('/auth/me');
      setUser(r.data.user);
    } catch { /* */ }
  };

  const isOwner = user?.role === 'TENANT_OWNER';
  const canAccess = (path: string) => {
    if (isOwner) return true;
    if (path.startsWith('/ekip')) return true; // ekip sohbeti herkese açık
    const perms = user?.permissions || [];
    if (!perms.length) return false;
    return perms.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p));
  };

  return (
    <AuthContext.Provider value={{ user, loading, isOwner, canAccess, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
