import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

export interface StoreData {
  products: any[];
  categories: any[];
  brands: any[];
  salesCodes: any[];
  customers: any[];
  discountCodes: any[];
  orders: any[];
  storeSetting: any | null;
  variationTemplates: any[];
  campaigns: any[];
  socialAccounts: any[];
  socialGroups: any[];
  socialPersonas: any[];
  igRules: any[];
  igOtoAyar: any | null;
  igMesajLog: any[];
}
const EMPTY: StoreData = { products: [], categories: [], brands: [], salesCodes: [], customers: [], discountCodes: [], orders: [], storeSetting: null, variationTemplates: [], campaigns: [], socialAccounts: [], socialGroups: [], socialPersonas: [], igRules: [], igOtoAyar: null, igMesajLog: [] };

interface Ctx extends StoreData {
  loading: boolean;
  reload: () => Promise<void>;
}
const StoreContext = createContext<Ctx | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [data, setData] = useState<StoreData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const r = await api.get<StoreData>('/store/bootstrap');
      setData({ ...EMPTY, ...r.data });
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (user?.tenantId) { setLoading(true); reload(); }
    else { setData(EMPTY); setLoading(false); }
  }, [user, reload]);

  return <StoreContext.Provider value={{ ...data, loading, reload }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const c = useContext(StoreContext);
  if (!c) throw new Error('useStore must be used within StoreProvider');
  return c;
}
