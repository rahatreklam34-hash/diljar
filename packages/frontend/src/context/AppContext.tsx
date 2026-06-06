import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useAuth } from './AuthContext';
import {
  CariHesap, CariHareket, Hareket, KasaBanka, KrediKarti, BirikimHesabi,
  Cek, Personel, PersonelHareket, DuzenliOdeme, EmanetPara, Hedef, SistemLog,
} from '../types';

interface BootstrapData {
  cariHesaplar: CariHesap[];
  cariHareketler: CariHareket[];
  hareketler: Hareket[];
  kasaBanka: KasaBanka[];
  krediKartlari: KrediKarti[];
  birikimHesaplari: BirikimHesabi[];
  cekler: Cek[];
  personeller: Personel[];
  personelHareketler: PersonelHareket[];
  duzenliOdemeler: DuzenliOdeme[];
  emanetParalar: EmanetPara[];
  hedefler: Hedef[];
  sistemLoglari: SistemLog[];
}

const EMPTY: BootstrapData = {
  cariHesaplar: [], cariHareketler: [], hareketler: [], kasaBanka: [], krediKartlari: [],
  birikimHesaplari: [], cekler: [], personeller: [], personelHareketler: [],
  duzenliOdemeler: [], emanetParalar: [], hedefler: [], sistemLoglari: [],
};

interface AppState extends BootstrapData {
  loading: boolean;
  reload: () => Promise<void>;
  addCariHesap: (hesap: Omit<CariHesap, 'id' | 'createdAt'>) => void;
  updateCariHesap: (id: string, hesap: Partial<CariHesap>) => void;
  deleteCariHesap: (id: string) => void;
  addCariHareket: (hareket: Omit<CariHareket, 'id' | 'createdAt'>) => void;
  updateCariHareket: (id: string, hareket: Partial<CariHareket>) => void;
  deleteCariHareket: (id: string) => void;
  addHareket: (hareket: Omit<Hareket, 'id' | 'createdAt'>) => void;
  updateHareket: (id: string, hareket: Partial<Hareket>) => void;
  deleteHareket: (id: string) => void;
  addKasaBanka: (item: Omit<KasaBanka, 'id'>) => void;
  updateKasaBanka: (id: string, item: Partial<KasaBanka>) => void;
  deleteKasaBanka: (id: string) => void;
  addKrediKarti: (item: Omit<KrediKarti, 'id' | 'createdAt'>) => void;
  updateKrediKarti: (id: string, item: Partial<KrediKarti>) => void;
  deleteKrediKarti: (id: string) => void;
  krediKartiOdeme: (kartId: string, kaynakId: string, tutar: number) => void;
  krediKartindanHarcama: (kartId: string, tutar: number, aciklama: string, kategori: string) => void;
  addBirikimHesabi: (item: Omit<BirikimHesabi, 'id' | 'createdAt'>) => void;
  updateBirikimHesabi: (id: string, item: Partial<BirikimHesabi>) => void;
  deleteBirikimHesabi: (id: string) => void;
  addCek: (cek: Omit<Cek, 'id' | 'createdAt'>) => void;
  updateCek: (id: string, cek: Partial<Cek>) => void;
  deleteCek: (id: string) => void;
  addPersonel: (p: Omit<Personel, 'id' | 'createdAt'>) => void;
  updatePersonel: (id: string, p: Partial<Personel>) => void;
  deletePersonel: (id: string) => void;
  addPersonelHareket: (h: Omit<PersonelHareket, 'id' | 'createdAt'>) => void;
  updatePersonelHareket: (id: string, h: Partial<PersonelHareket>) => void;
  deletePersonelHareket: (id: string) => void;
  addDuzenliOdeme: (item: Omit<DuzenliOdeme, 'id' | 'createdAt'>) => void;
  updateDuzenliOdeme: (id: string, item: Partial<DuzenliOdeme>) => void;
  deleteDuzenliOdeme: (id: string) => void;
  addEmanetPara: (item: Omit<EmanetPara, 'id' | 'createdAt'>) => void;
  updateEmanetPara: (id: string, item: Partial<EmanetPara>) => void;
  deleteEmanetPara: (id: string) => void;
  addHedef: (item: Omit<Hedef, 'id' | 'createdAt'>) => void;
  updateHedef: (id: string, item: Partial<Hedef>) => void;
  deleteHedef: (id: string) => void;
  addSistemLog: (log: Omit<SistemLog, 'id' | 'createdAt'>) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [data, setData] = useState<BootstrapData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const r = await api.get<BootstrapData>('/bootstrap');
      setData({ ...EMPTY, ...r.data });
    } catch {
      // sessizce geç (oturum yoksa)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.tenantId) {
      setLoading(true);
      reload();
    } else {
      setData(EMPTY);
      setLoading(false);
    }
  }, [user, reload]);

  // Mutasyon sarmalayıcı: API çağrısı + başarıda bootstrap yenile + hatada toast
  const mut = useCallback((p: Promise<any>) => {
    p.then(() => reload()).catch((e) => {
      toast.error(apiErrorMessage(e));
    });
  }, [reload]);

  const E = useCallback((seg: string) => ({
    add: (item: any) => mut(api.post(`/${seg}`, item)),
    update: (id: string, patch: any) => mut(api.patch(`/${seg}/${id}`, patch)),
    del: (id: string) => mut(api.delete(`/${seg}/${id}`)),
  }), [mut]);

  const cariHesap = E('cari-hesaplar');
  const cariHareket = E('cari-hareketler');
  const hareket = E('hareketler');
  const kasa = E('kasa-banka');
  const kredi = E('kredi-kartlari');
  const birikim = E('birikim');
  const cek = E('cekler');
  const personel = E('personeller');
  const personelHareket = E('personel-hareketler');
  const duzenli = E('duzenli-odemeler');
  const emanet = E('emanet');
  const hedef = E('hedefler');

  const value: AppState = {
    ...data,
    loading,
    reload,
    addCariHesap: cariHesap.add, updateCariHesap: cariHesap.update, deleteCariHesap: cariHesap.del,
    addCariHareket: cariHareket.add, updateCariHareket: cariHareket.update, deleteCariHareket: cariHareket.del,
    addHareket: hareket.add, updateHareket: hareket.update, deleteHareket: hareket.del,
    addKasaBanka: kasa.add, updateKasaBanka: kasa.update, deleteKasaBanka: kasa.del,
    addKrediKarti: kredi.add, updateKrediKarti: kredi.update, deleteKrediKarti: kredi.del,
    krediKartiOdeme: (kartId, kaynakId, tutar) => mut(api.post(`/kredi-kartlari/${kartId}/odeme`, { kaynakId, tutar })),
    krediKartindanHarcama: (kartId, tutar, aciklama, kategori) => mut(api.post(`/kredi-kartlari/${kartId}/harcama`, { tutar, aciklama, kategori })),
    addBirikimHesabi: birikim.add, updateBirikimHesabi: birikim.update, deleteBirikimHesabi: birikim.del,
    addCek: cek.add, updateCek: cek.update, deleteCek: cek.del,
    addPersonel: personel.add, updatePersonel: personel.update, deletePersonel: personel.del,
    addPersonelHareket: personelHareket.add, updatePersonelHareket: personelHareket.update, deletePersonelHareket: personelHareket.del,
    addDuzenliOdeme: duzenli.add, updateDuzenliOdeme: duzenli.update, deleteDuzenliOdeme: duzenli.del,
    addEmanetPara: emanet.add, updateEmanetPara: emanet.update, deleteEmanetPara: emanet.del,
    addHedef: hedef.add, updateHedef: hedef.update, deleteHedef: hedef.del,
    addSistemLog: (log) => mut(api.post('/loglar', log)),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
