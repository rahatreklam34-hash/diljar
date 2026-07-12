import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';
import api, { setAccessToken, setOnAuthFail } from '../lib/api';
import { allMenuItems } from '../lib/menu';

const MENU_PATHS = new Set(allMenuItems.map((m) => m.to));

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
  prefs?: Record<string, any> | null;
  tenantId: string | null;
  tenant: TenantInfo | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  isOwner: boolean;
  canAccess: (path: string) => boolean;
  canDo: (key: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { fullName: string; companyName: string; phone: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updatePrefs: (prefs: Record<string, any>) => Promise<void>;
  updateProfile: (data: { fullName?: string; email?: string; newPassword?: string; currentPassword?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applyAuth = (accessToken: string, u: AuthUser) => {
    try { sessionStorage.setItem('app_session', '1'); } catch { /* */ }
    setAccessToken(accessToken);
    setUser(u);
  };

  const init = useCallback(async () => {
    // Açık sekme sayacı (localStorage) ile "tarayıcı tamamen kapandı mı" tespiti:
    // - Aynı sekmede yenileme → sessionStorage marker korunur, oturum sürer.
    // - Başka sekmeler açıkken yeni sekme → sayaç > 0, oturum sürer.
    // - Tüm sekmeler/tarayıcı kapanınca sayaç 0'a iner → yeni açılışta güvenli çıkış + giriş iste.
    const TAB_KEY = 'app_open_tabs';
    let requireLogin = false;
    try {
      const wasReload = !!sessionStorage.getItem('app_session');
      const openTabs = parseInt(localStorage.getItem(TAB_KEY) || '0', 10) || 0;
      if (!wasReload && openTabs <= 0) requireLogin = true;
      // Bu sekmeyi say: her yüklemede +1, kapanışta -1 (aşağıdaki effect)
      localStorage.setItem(TAB_KEY, String(openTabs + 1));
      sessionStorage.setItem('app_session', '1');
    } catch { /* */ }

    try {
      if (requireLogin) {
        try { await axios.post('/api/v1/auth/logout', {}, { withCredentials: true }); } catch { /* */ }
        setUser(null);
        setAccessToken(null);
        setLoading(false);
        return;
      }
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
    const TAB_KEY = 'app_open_tabs';
    const dec = () => { try { const n = parseInt(localStorage.getItem(TAB_KEY) || '0', 10) || 0; localStorage.setItem(TAB_KEY, String(Math.max(0, n - 1))); } catch { /* */ } };
    const onHide = (e: any) => { if (!e || !e.persisted) dec(); };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    try { sessionStorage.removeItem('app_session'); } catch { /* */ }
    setUser(null);
    setAccessToken(null);
  };

  const refreshUser = async () => {
    try {
      const r = await api.get('/auth/me');
      setUser(r.data.user);
    } catch { /* */ }
  };

  const updatePrefs = async (prefs: Record<string, any>) => {
    const r = await api.patch('/auth/me/prefs', { prefs });
    setUser((u) => (u ? { ...u, prefs: r.data.prefs } : u));
  };

  const updateProfile = async (data: { fullName?: string; email?: string; newPassword?: string; currentPassword?: string }) => {
    const r = await api.patch('/auth/me/profile', data);
    setUser(r.data.user);
  };

  const isOwner = user?.role === 'TENANT_OWNER';
  // Özel yetki kontrolü: patron her şeyi yapabilir; personel ise yalnızca 'ozel:<key>' yetkisi varsa.
  const canDo = (key: string) => {
    if (isOwner) return true;
    const perms = user?.permissions || [];
    return perms.includes(key.startsWith('ozel:') ? key : `ozel:${key}`);
  };
  const canAccess = (path: string) => {
    if (isOwner) return true;
    if (path.startsWith('/ekip')) return true; // ekip sohbeti herkese açık
    const perms = user?.permissions || [];
    if (!perms.length) return false;
    // 1) Birebir eşleşme → izinli
    if (perms.includes(path)) return true;
    // Stok kartı/ürün detayları 'Ürünlerim' yetkisine bağlıdır
    if (path.startsWith('/depo/urun/') && (perms.includes('/depo/urunlerim') || perms.includes('/depo'))) return true;
    // 2) Önek devralma: detay/alt-rotalar üst yetkiyi devralır.
    //    Kardeş menü sızıntısını engelle: hem hedef hem önek birer menü öğesi ise devralma yok
    //    (ör. '/whatsapp' yetkisi '/whatsapp/toplu-mesaj' menüsünü açmaz),
    //    ancak eski/kaba yetki (menü öğesi olmayan önek, ör. '/depo') alt menüleri açar (geriye dönük uyum).
    return perms.some((p) => path.startsWith(p + '/') && (!MENU_PATHS.has(path) || !MENU_PATHS.has(p)));
  };

  return (
    <AuthContext.Provider value={{ user, loading, isOwner, canAccess, canDo, login, register, logout, refreshUser, updatePrefs, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
