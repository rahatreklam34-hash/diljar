import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuickAction } from '../lib/quickAction';
import { useUrlState } from '../lib/useUrlState';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
} from 'chart.js';
import {
  Users, UserPlus, Calendar, DollarSign, Clock, Plus, Pencil,
  Trash2, Eye, Search, ChevronLeft, ChevronRight, TrendingUp, ArrowUpRight,
  Award, Coffee, Bus, Shield, FileText, Zap, X, ArrowLeft
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Personel, PersonelHareket } from '../types';
import MoneyInput from '../components/MoneyInput';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const fmt = (n: number) => '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 0 });
const td = () => new Date().toISOString().split('T')[0];
const ts = () => new Date().toTimeString().slice(0, 5);

const TIP_LABELS: Record<PersonelHareket['tip'], string> = {
  maas: 'Maaş', avans: 'Avans', urun: 'Ürün', ssk: 'SSK', yemek: 'Yemek',
  yol: 'Yol', prim: 'Prim', ikramiye: 'İkramiye', izin: 'İzin', mesai: 'Mesai', ek_odeme: 'Ek Ödeme'
};
const TIP_COLORS: Record<PersonelHareket['tip'], string> = {
  maas: 'bg-blue-100 text-blue-700', avans: 'bg-orange-100 text-orange-700',
  urun: 'bg-purple-100 text-purple-700', ssk: 'bg-red-100 text-red-700',
  yemek: 'bg-green-100 text-green-700', yol: 'bg-cyan-100 text-cyan-700',
  prim: 'bg-yellow-100 text-yellow-700', ikramiye: 'bg-pink-100 text-pink-700',
  izin: 'bg-gray-100 text-gray-700', mesai: 'bg-emerald-100 text-emerald-700',
  ek_odeme: 'bg-teal-100 text-teal-700'
};

const DURUM_LABELS: Record<Personel['durum'], string> = { aktif: 'Aktif', izinli: 'İzinli', pasif: 'Pasif' };
const DURUM_COLORS: Record<Personel['durum'], string> = {
  aktif: 'bg-green-100 text-green-700', izinli: 'bg-yellow-100 text-yellow-700', pasif: 'bg-red-100 text-red-700'
};

function normTR(s: string) {
  return s.toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g');
}

function calcBakiliye(p: Personel, hareketler: PersonelHareket[], today: Date) {
  const baslangic = new Date(p.baslangicTarihi);
  const diffMs = today.getTime() - baslangic.getTime();
  const diffGun = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const gunluk = p.maas / 30;
  const bugune = diffGun * gunluk;
  const odenenTipler: PersonelHareket['tip'][] = ['maas', 'avans', 'prim', 'ikramiye', 'ek_odeme'];
  const toplamOdenen = hareketler
    .filter(h => h.personelId === p.id && odenenTipler.includes(h.tip))
    .reduce((s, h) => s + h.tutar, 0);
  return { bugune, toplamOdenen, kalan: bugune - toplamOdenen, diffGun, gunluk };
}

function aylikMaliyet(p: Personel) {
  return p.maas + p.sskPrim + p.yemekUcreti + p.yolUcreti;
}

function kidem(baslangic: string, today: Date) {
  const b = new Date(baslangic);
  let yil = today.getFullYear() - b.getFullYear();
  let ay = today.getMonth() - b.getMonth();
  if (ay < 0) { yil--; ay += 12; }
  return { yil, ay };
}

function isThisMonthPaid(personelId: string, tip: PersonelHareket['tip'], hareketler: PersonelHareket[], today: Date) {
  const y = today.getFullYear();
  const m = today.getMonth();
  return hareketler.some(h => {
    if (h.personelId !== personelId || h.tip !== tip) return false;
    const d = new Date(h.tarih);
    return d.getFullYear() === y && d.getMonth() === m;
  });
}

const HIZLI_ISLEMLER = [
  { id: 'maas', label: 'Maaş Öde', icon: DollarSign, color: 'text-blue-600' },
  { id: 'avans', label: 'Avans Ver', icon: ArrowUpRight, color: 'text-orange-600' },
  { id: 'urun', label: 'Ürün/Avans Alımı', icon: FileText, color: 'text-purple-600' },
  { id: 'ucretli_izin', label: 'Ücretli İzin', icon: Calendar, color: 'text-green-600' },
  { id: 'ucretsiz_izin', label: 'Ücretsiz İzin', icon: Calendar, color: 'text-gray-600' },
  { id: 'mesai', label: 'Mesai Ekle', icon: Clock, color: 'text-emerald-600' },
  { id: 'yemek', label: 'Yemek Gideri', icon: Coffee, color: 'text-yellow-600' },
  { id: 'yol', label: 'Yol Ücreti', icon: Bus, color: 'text-cyan-600' },
  { id: 'ssk', label: 'SSK Ödemesi', icon: Shield, color: 'text-red-600' },
  { id: 'ek_odeme', label: 'Ek Ödeme', icon: Award, color: 'text-teal-600' },
];

const emptyForm = (): Omit<Personel, 'id' | 'createdAt'> => ({
  ad: '', email: '', pozisyon: '', departman: '', cinsiyet: 'erkek',
  maas: 0, telefon: '', baslangicTarihi: td(), odemeTarihi: 1,
  sskPrim: 0, yemekUcreti: 0, yolUcreti: 0, durum: 'aktif'
});

const PAGE_SIZE = 10;

export default function PersonelPage() {
  const {
    personeller, personelHareketler, addPersonel, updatePersonel, deletePersonel,
    addPersonelHareket, updatePersonelHareket, deletePersonelHareket,
    kasaBanka, updateKasaBanka, addHareket
  } = useApp();

  const today = useMemo(() => new Date(), []);
  const thisYear = today.getFullYear();
  const thisMonth = today.getMonth();

  // Views
  const [detayPersonel, setDetayPersonel] = useState<Personel | null>(null);

  // Filters (list)
  const [search, setSearch] = useUrlState('q', '');
  const [deptFilter, setDeptFilter] = useUrlState('dept', '');
  const [page, setPage] = useUrlState('page', 1);

  // Filters (detay)
  const [detayTipFilter, setDetayTipFilter] = useState<PersonelHareket['tip'] | 'tumu'>('tumu');
  const [detayDateFrom, setDetayDateFrom] = useState('');
  const [detayDateTo, setDetayDateTo] = useState('');
  const [detayPage, setDetayPage] = useState(1);

  // Modals
  const [modalPersonel, setModalPersonel] = useState(false);
  const [editingPersonel, setEditingPersonel] = useState<Personel | null>(null);
  const [formData, setFormData] = useState(emptyForm());

  const [modalMaas, setModalMaas] = useState(false);
  const [modalAvans, setModalAvans] = useState(false);
  const [modalUrun, setModalUrun] = useState(false);
  const [modalIzin, setModalIzin] = useState(false);
  const [modalMesai, setModalMesai] = useState(false);
  const [modalYemekYol, setModalYemekYol] = useState<'' | 'yemek' | 'yol' | 'ssk'>('');
  const [modalEkOdeme, setModalEkOdeme] = useState(false);
  const [modalYeniHareket, setModalYeniHareket] = useState(false);
  const [editHareket, setEditHareket] = useState<PersonelHareket | null>(null);
  const [deleteHareketId, setDeleteHareketId] = useState<string | null>(null);
  const [deletePersonelId, setDeletePersonelId] = useState<string | null>(null);

  // Ctrl+Space menu
  const [hizliOpen, setHizliOpen] = useState(false);
  const [hizliSearch, setHizliSearch] = useState('');
  const [hizliIdx, setHizliIdx] = useState(0);
  const hizliInputRef = useRef<HTMLInputElement>(null);

  // Modal form states
  const [selPersonelId, setSelPersonelId] = useState('');
  const [selKasaId, setSelKasaId] = useState('');
  const [avansForm, setAvansForm] = useState({ personelId: '', tutar: '', aciklama: '' });
  const [urunForm, setUrunForm] = useState({ personelId: '', tutar: '', aciklama: '' });
  const [izinForm, setIzinForm] = useState({ personelId: '', baslangic: td(), bitis: td(), tip: 'ucretli' as 'ucretli' | 'ucretsiz', aciklama: '' });
  const [mesaiForm, setMesaiForm] = useState({ personelId: '', tarih: td(), saat: '1', saatlikUcret: '' });
  const [yemekYolForm, setYemekYolForm] = useState({ personelId: '' });
  const [ekOdemeForm, setEkOdemeForm] = useState({ personelId: '', tip: 'prim' as 'prim' | 'ikramiye' | 'ek_odeme', tutar: '', aciklama: '' });
  const [yeniHareketForm, setYeniHareketForm] = useState<{ tarih: string; saat: string; tip: PersonelHareket['tip']; aciklama: string; tutar: string }>({
    tarih: td(), saat: ts(), tip: 'maas', aciklama: '', tutar: ''
  });
  const [editHareketForm, setEditHareketForm] = useState<{ tarih: string; saat: string; tip: PersonelHareket['tip']; aciklama: string; tutar: string }>({
    tarih: td(), saat: ts(), tip: 'maas', aciklama: '', tutar: ''
  });

  // Departmanlar
  const departmanlar = useMemo(() =>
    Array.from(new Set(personeller.map(p => p.departman).filter(Boolean))), [personeller]);

  // Filtered personeller
  const filteredPersoneller = useMemo(() => {
    let list = personeller;
    if (deptFilter) list = list.filter(p => p.departman === deptFilter);
    if (search) {
      const q = normTR(search);
      list = list.filter(p => normTR(p.ad).includes(q) || normTR(p.pozisyon).includes(q) || normTR(p.departman).includes(q));
    }
    return list;
  }, [personeller, deptFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredPersoneller.length / PAGE_SIZE));
  const pagedPersoneller = useMemo(() =>
    filteredPersoneller.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredPersoneller, page]);

  // KPI
  const kpis = useMemo(() => {
    const erkek = personeller.filter(p => p.cinsiyet === 'erkek').length;
    const kadin = personeller.filter(p => p.cinsiyet === 'kadin').length;
    const buAyIseAlinan = personeller.filter(p => {
      const d = new Date(p.baslangicTarihi);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    }).length;
    const avgKidemAy = personeller.length === 0 ? 0 :
      personeller.reduce((s, p) => {
        const k = kidem(p.baslangicTarihi, today);
        return s + k.yil * 12 + k.ay;
      }, 0) / personeller.length;
    return { toplam: personeller.length, erkek, kadin, buAyIseAlinan, avgKidemAy };
  }, [personeller, today, thisYear, thisMonth]);

  // Detay hareketler
  const detayHareketler = useMemo(() => {
    if (!detayPersonel) return [];
    let list = personelHareketler.filter(h => h.personelId === detayPersonel.id);
    if (detayTipFilter !== 'tumu') list = list.filter(h => h.tip === detayTipFilter);
    if (detayDateFrom) list = list.filter(h => h.tarih >= detayDateFrom);
    if (detayDateTo) list = list.filter(h => h.tarih <= detayDateTo);
    return list.sort((a, b) => b.tarih.localeCompare(a.tarih) || b.saat.localeCompare(a.saat));
  }, [detayPersonel, personelHareketler, detayTipFilter, detayDateFrom, detayDateTo]);

  const detayTotalPages = Math.max(1, Math.ceil(detayHareketler.length / PAGE_SIZE));
  const pagedDetayHareketler = useMemo(() =>
    detayHareketler.slice((detayPage - 1) * PAGE_SIZE, detayPage * PAGE_SIZE), [detayHareketler, detayPage]);

  // Hizli islemler filtered
  const filteredHizli = useMemo(() => {
    if (!hizliSearch) return HIZLI_ISLEMLER;
    const q = normTR(hizliSearch);
    return HIZLI_ISLEMLER.filter(h => normTR(h.label).includes(q));
  }, [hizliSearch]);

  // ESC ile personel hizli menusu kapansin (Ctrl+Space yalnizca global paleti acar)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (hizliOpen && e.key === 'Escape') { setHizliOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hizliOpen]);

  useEffect(() => {
    if (hizliOpen) setTimeout(() => hizliInputRef.current?.focus(), 50);
  }, [hizliOpen]);

  const openHizliIslem = useCallback((id: string) => {
    setHizliOpen(false);
    setSelPersonelId('');
    setSelKasaId(kasaBanka[0]?.id || '');
    if (id === 'maas') setModalMaas(true);
    else if (id === 'avans') { setAvansForm({ personelId: '', tutar: '', aciklama: 'Avans' }); setModalAvans(true); }
    else if (id === 'urun') { setUrunForm({ personelId: '', tutar: '', aciklama: '' }); setModalUrun(true); }
    else if (id === 'ucretli_izin' || id === 'ucretsiz_izin') {
      setIzinForm({ personelId: '', baslangic: td(), bitis: td(), tip: id === 'ucretli_izin' ? 'ucretli' : 'ucretsiz', aciklama: '' });
      setModalIzin(true);
    } else if (id === 'mesai') { setMesaiForm({ personelId: '', tarih: td(), saat: '1', saatlikUcret: '' }); setModalMesai(true); }
    else if (id === 'yemek') { setYemekYolForm({ personelId: '' }); setModalYemekYol('yemek'); }
    else if (id === 'yol') { setYemekYolForm({ personelId: '' }); setModalYemekYol('yol'); }
    else if (id === 'ssk') { setYemekYolForm({ personelId: '' }); setModalYemekYol('ssk'); }
    else if (id === 'ek_odeme') { setEkOdemeForm({ personelId: '', tip: 'prim', tutar: '', aciklama: '' }); setModalEkOdeme(true); }
  }, [kasaBanka]);

  // Global hizli islem (Ctrl+Space) -> Personel Maas komutu ilgili modali acar
  useQuickAction('pending_personel_action', (p) => {
    openHizliIslem(p?.tip || 'maas');
  });

  // Actions
  const handlePersonelSubmit = () => {
    if (!formData.ad || !formData.pozisyon) return;
    if (editingPersonel) {
      updatePersonel(editingPersonel.id, formData);
    } else {
      addPersonel(formData);
    }
    setModalPersonel(false);
    setEditingPersonel(null);
    setFormData(emptyForm());
  };

  const handleMaasOde = () => {
    const aktifPersoneller = selPersonelId
      ? personeller.filter(p => p.id === selPersonelId)
      : personeller.filter(p => p.durum === 'aktif');
    const kasa = kasaBanka.find(k => k.id === selKasaId);
    if (!kasa) return;
    aktifPersoneller.forEach(p => {
      const { kalan } = calcBakiliye(p, personelHareketler, today);
      if (kalan <= 0) return;
      const tarih = td(); const saat = ts();
      addPersonelHareket({ personelId: p.id, tarih, saat, tip: 'maas', aciklama: `Maaş Ödemesi - ${tarih}`, tutar: kalan });
      updateKasaBanka(kasa.id, { bakiye: kasa.bakiye - kalan });
      addHareket({ tarih, saat, aciklama: `Maaş - ${p.ad}`, tutar: kalan, tip: 'gider', kategori: 'Maas' });
    });
    setModalMaas(false);
  };

  const handleAvansVer = () => {
    if (!avansForm.personelId || !avansForm.tutar) return;
    const tarih = td(); const saat = ts();
    addPersonelHareket({ personelId: avansForm.personelId, tarih, saat, tip: 'avans', aciklama: avansForm.aciklama || 'Avans', tutar: Number(avansForm.tutar) });
    setModalAvans(false);
  };

  const handleUrunAlinan = () => {
    if (!urunForm.personelId || !urunForm.tutar) return;
    const tarih = td(); const saat = ts();
    addPersonelHareket({ personelId: urunForm.personelId, tarih, saat, tip: 'urun', aciklama: urunForm.aciklama || 'Ürün/Avans Alımı', tutar: Number(urunForm.tutar) });
    setModalUrun(false);
  };

  const handleIzinEkle = () => {
    if (!izinForm.personelId) return;
    const tarih = td(); const saat = ts();
    const p = personeller.find(x => x.id === izinForm.personelId);
    const gun = Math.max(1, Math.ceil((new Date(izinForm.bitis).getTime() - new Date(izinForm.baslangic).getTime()) / 86400000) + 1);
    const tutar = izinForm.tip === 'ucretli' ? (p ? (p.maas / 30) * gun : 0) : 0;
    addPersonelHareket({ personelId: izinForm.personelId, tarih, saat, tip: 'izin', aciklama: `${izinForm.tip === 'ucretli' ? 'Ücretli' : 'Ücretsiz'} İzin ${izinForm.baslangic}/${izinForm.bitis}`, tutar });
    setModalIzin(false);
  };

  const handleMesaiEkle = () => {
    if (!mesaiForm.personelId || !mesaiForm.saat) return;
    const p = personeller.find(x => x.id === mesaiForm.personelId);
    const saatlikUcret = mesaiForm.saatlikUcret ? Number(mesaiForm.saatlikUcret) : (p ? p.maas / 30 / 8 : 0);
    const tutar = saatlikUcret * Number(mesaiForm.saat);
    addPersonelHareket({ personelId: mesaiForm.personelId, tarih: mesaiForm.tarih, saat: ts(), tip: 'mesai', aciklama: `Mesai ${mesaiForm.saat} saat`, tutar });
    setModalMesai(false);
  };

  const handleYemekYolSsk = () => {
    const tip = modalYemekYol as 'yemek' | 'yol' | 'ssk';
    if (!tip) return;
    const aktifPersoneller = yemekYolForm.personelId
      ? personeller.filter(p => p.id === yemekYolForm.personelId)
      : personeller.filter(p => p.durum === 'aktif');
    aktifPersoneller.forEach(p => {
      if (isThisMonthPaid(p.id, tip, personelHareketler, today)) return;
      const tutar = tip === 'yemek' ? p.yemekUcreti : tip === 'yol' ? p.yolUcreti : p.sskPrim;
      if (tutar <= 0) return;
      const tarih = td(); const saat = ts();
      addPersonelHareket({ personelId: p.id, tarih, saat, tip, aciklama: `${TIP_LABELS[tip]} - ${tarih.slice(0, 7)}`, tutar });
      addHareket({ tarih, saat, aciklama: `${TIP_LABELS[tip]} - ${p.ad}`, tutar, tip: 'gider', kategori: TIP_LABELS[tip] });
    });
    setModalYemekYol('');
  };

  const handleEkOdeme = () => {
    if (!ekOdemeForm.personelId || !ekOdemeForm.tutar) return;
    const tarih = td(); const saat = ts();
    addPersonelHareket({ personelId: ekOdemeForm.personelId, tarih, saat, tip: ekOdemeForm.tip, aciklama: ekOdemeForm.aciklama || TIP_LABELS[ekOdemeForm.tip], tutar: Number(ekOdemeForm.tutar) });
    setModalEkOdeme(false);
  };

  const handleYeniHareket = () => {
    if (!detayPersonel || !yeniHareketForm.tutar) return;
    addPersonelHareket({ personelId: detayPersonel.id, tarih: yeniHareketForm.tarih, saat: yeniHareketForm.saat, tip: yeniHareketForm.tip, aciklama: yeniHareketForm.aciklama, tutar: Number(yeniHareketForm.tutar) });
    setModalYeniHareket(false);
    setYeniHareketForm({ tarih: td(), saat: ts(), tip: 'maas', aciklama: '', tutar: '' });
  };

  const handleEditHareket = () => {
    if (!editHareket) return;
    updatePersonelHareket(editHareket.id, { tarih: editHareketForm.tarih, saat: editHareketForm.saat, tip: editHareketForm.tip, aciklama: editHareketForm.aciklama, tutar: Number(editHareketForm.tutar) });
    setEditHareket(null);
  };

  const openEditHareket = (h: PersonelHareket) => {
    setEditHareket(h);
    setEditHareketForm({ tarih: h.tarih, saat: h.saat, tip: h.tip, aciklama: h.aciklama, tutar: String(h.tutar) });
  };

  const openEditPersonel = (p: Personel) => {
    setEditingPersonel(p);
    setFormData({ ad: p.ad, email: p.email || '', pozisyon: p.pozisyon, departman: p.departman, cinsiyet: p.cinsiyet, maas: p.maas, telefon: p.telefon || '', baslangicTarihi: p.baslangicTarihi, odemeTarihi: p.odemeTarihi, sskPrim: p.sskPrim, yemekUcreti: p.yemekUcreti, yolUcreti: p.yolUcreti, durum: p.durum });
    setModalPersonel(true);
  };

  // Chart for detail view
  const detayChartData = useMemo(() => {
    if (!detayPersonel) return null;
    const tipTotals: Partial<Record<PersonelHareket['tip'], number>> = {};
    personelHareketler.filter(h => h.personelId === detayPersonel.id).forEach(h => {
      tipTotals[h.tip] = (tipTotals[h.tip] || 0) + h.tutar;
    });
    const entries = Object.entries(tipTotals).filter(([, v]) => v > 0);
    if (!entries.length) return null;
    return {
      labels: entries.map(([k]) => TIP_LABELS[k as PersonelHareket['tip']]),
      datasets: [{
        label: 'Tutar',
        data: entries.map(([, v]) => v),
        borderColor: ['#3b82f6','#f97316','#10B981','#ef4444','#22c55e','#06b6d4','#eab308','#ec4899','#6b7280','#0F7C45','#14b8a6'],
        backgroundColor: ['#3b82f620','#f9731620','#10B98120','#ef444420','#22c55e20','#06b6d420','#eab30820','#ec489920','#6b728020','#0F7C4520','#14b8a620'],
        fill: true,
        tension: 0.4,
        pointRadius: 5,
      }]
    };
  }, [detayPersonel, personelHareketler]);

  // Yaklaşan maaş ödemeleri
  const yaklasanOdemeler = useMemo(() => {
    return personeller
      .filter(p => p.durum === 'aktif')
      .map(p => {
        const { kalan } = calcBakiliye(p, personelHareketler, today);
        return { p, kalan };
      })
      .filter(x => x.kalan > 0)
      .sort((a, b) => b.kalan - a.kalan)
      .slice(0, 5);
  }, [personeller, personelHareketler, today]);

  const toplamAylikMaliyet = useMemo(() =>
    personeller.filter(p => p.durum === 'aktif').reduce((s, p) => s + aylikMaliyet(p), 0), [personeller]);

  const toplamSsk = useMemo(() =>
    personeller.filter(p => p.durum === 'aktif').reduce((s, p) => s + p.sskPrim, 0), [personeller]);

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
  const cardCls = 'bg-white rounded-xl border border-gray-100 shadow-sm';

  // Personel form JSX (variable, NOT component)
  const personelFormJSX = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Ad Soyad *</label>
          <input className={inputCls} value={formData.ad} onChange={e => setFormData(f => ({ ...f, ad: e.target.value }))} placeholder="Ad Soyad" />
        </div>
        <div>
          <label className={labelCls}>E-posta</label>
          <input className={inputCls} type="email" value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} placeholder="email@firma.com" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Pozisyon *</label>
          <input className={inputCls} value={formData.pozisyon} onChange={e => setFormData(f => ({ ...f, pozisyon: e.target.value }))} placeholder="Yazılım Geliştirici" />
        </div>
        <div>
          <label className={labelCls}>Departman</label>
          <input className={inputCls} value={formData.departman} onChange={e => setFormData(f => ({ ...f, departman: e.target.value }))} placeholder="Teknoloji" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Cinsiyet</label>
          <select className={inputCls} value={formData.cinsiyet} onChange={e => setFormData(f => ({ ...f, cinsiyet: e.target.value as 'erkek' | 'kadin' }))}>
            <option value="erkek">Erkek</option>
            <option value="kadin">Kadın</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Durum</label>
          <select className={inputCls} value={formData.durum} onChange={e => setFormData(f => ({ ...f, durum: e.target.value as Personel['durum'] }))}>
            <option value="aktif">Aktif</option>
            <option value="izinli">İzinli</option>
            <option value="pasif">Pasif</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Telefon</label>
          <input className={inputCls} value={formData.telefon} onChange={e => setFormData(f => ({ ...f, telefon: e.target.value }))} placeholder="05xx xxx xx xx" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>İşe Giriş Tarihi</label>
          <input className={inputCls} type="date" value={formData.baslangicTarihi} onChange={e => setFormData(f => ({ ...f, baslangicTarihi: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Ödeme Günü (1-28)</label>
          <input className={inputCls} type="number" min={1} max={28} value={formData.odemeTarihi} onChange={e => setFormData(f => ({ ...f, odemeTarihi: Number(e.target.value) }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Maaş (₺)</label>
          <MoneyInput value={String(formData.maas || '')} onChange={v => setFormData(f => ({ ...f, maas: Number(v) || 0 }))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>SSK Primi (₺)</label>
          <MoneyInput value={String(formData.sskPrim || '')} onChange={v => setFormData(f => ({ ...f, sskPrim: Number(v) || 0 }))} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Yemek Ücreti (₺)</label>
          <MoneyInput value={String(formData.yemekUcreti || '')} onChange={v => setFormData(f => ({ ...f, yemekUcreti: Number(v) || 0 }))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Yol Ücreti (₺)</label>
          <MoneyInput value={String(formData.yolUcreti || '')} onChange={v => setFormData(f => ({ ...f, yolUcreti: Number(v) || 0 }))} className={inputCls} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={() => { setModalPersonel(false); setEditingPersonel(null); setFormData(emptyForm()); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">İptal</button>
        <button onClick={handlePersonelSubmit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingPersonel ? 'Güncelle' : 'Ekle'}</button>
      </div>
    </div>
  );

  // ─── DETAY VIEW ───────────────────────────────────────────────
  if (detayPersonel) {
    const pId = detayPersonel.id;
    const { bugune, toplamOdenen, kalan, diffGun, gunluk } = calcBakiliye(detayPersonel, personelHareketler, today);
    const km = kidem(detayPersonel.baslangicTarihi, today);
    const maliyetAylik = aylikMaliyet(detayPersonel);
    const progress = bugune > 0 ? Math.min(100, (toplamOdenen / bugune) * 100) : 100;

    // Chart bars horizontal via Line
    const tipBreakdown: Partial<Record<PersonelHareket['tip'], number>> = {};
    personelHareketler.filter(h => h.personelId === pId).forEach(h => {
      tipBreakdown[h.tip] = (tipBreakdown[h.tip] || 0) + h.tutar;
    });
    const chartEntries = Object.entries(tipBreakdown).filter(([, v]) => v > 0);
    const chartColors = ['#3b82f6','#f97316','#10B981','#ef4444','#22c55e','#06b6d4','#eab308','#ec4899','#6b7280','#0F7C45','#14b8a6'];

    return (
      <div className="p-4 space-y-4 min-h-screen bg-gray-50">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetayPersonel(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors">
              <ArrowLeft size={16} /> Personel Listesi
            </button>
            <span className="text-gray-300">/</span>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                {detayPersonel.ad.charAt(0)}
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-800">{detayPersonel.ad}</h1>
                <p className="text-xs text-gray-500">{detayPersonel.pozisyon} · {detayPersonel.departman}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DURUM_COLORS[detayPersonel.durum]}`}>{DURUM_LABELS[detayPersonel.durum]}</span>
            <button onClick={() => openEditPersonel(detayPersonel)} className="p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-lg"><Pencil size={14} /></button>
            <button onClick={() => setDeletePersonelId(detayPersonel.id)} className="p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Maaş', value: fmt(detayPersonel.maas), icon: DollarSign, color: 'text-blue-600 bg-blue-50' },
            { label: 'Aylık Maliyet', value: fmt(maliyetAylik), icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
            { label: 'Kalan Borç', value: fmt(Math.abs(kalan)), sub: kalan > 0 ? 'bize borçlu değil' : kalan < 0 ? 'fazla ödeme' : '', color: kalan > 0 ? 'text-green-600 bg-green-50' : kalan < 0 ? 'text-red-600 bg-red-50' : 'text-gray-600 bg-gray-50', icon: kalan > 0 ? ArrowUpRight : DollarSign },
            { label: 'Kıdem', value: `${km.yil}y ${km.ay}a`, sub: `${diffGun} gün`, icon: Award, color: 'text-orange-600 bg-orange-50' },
          ].map((c, i) => (
            <div key={i} className={`${cardCls} p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">{c.label}</span>
                <span className={`p-1.5 rounded-lg ${c.color}`}><c.icon size={14} /></span>
              </div>
              <p className="text-lg font-bold text-gray-800">{c.value}</p>
              {c.sub && <p className="text-xs text-gray-400">{c.sub}</p>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Hesap Özeti */}
          <div className={`col-span-4 ${cardCls} p-4`}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Hesap Özeti</h3>
            <p className="text-xs text-gray-400 mb-3">İşe girişten bugüne: <span className="font-medium text-gray-600">{diffGun} gün</span></p>
            <div className="space-y-2 text-xs">
              {[
                ['Günlük Ücret', fmt(gunluk)],
                ['Toplam Hakediş', fmt(bugune)],
                ['Toplam Ödenen', fmt(toplamOdenen)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium text-gray-700">{v}</span>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 flex justify-between">
                <span className="font-semibold text-gray-700">Net Borç</span>
                <span className={`font-bold ${kalan > 0 ? 'text-green-600' : kalan < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                  {kalan > 0 ? '+' : ''}{fmt(kalan)}
                </span>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Ödenen</span><span>{progress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${kalan > 0 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs border-t border-gray-100 pt-3">
              {[
                ['SSK Primi', fmt(detayPersonel.sskPrim)],
                ['Yemek', fmt(detayPersonel.yemekUcreti)],
                ['Yol', fmt(detayPersonel.yolUcreti)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-400">{k}</span>
                  <span className="text-gray-600">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hareketler */}
          <div className={`col-span-8 ${cardCls} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Hesap Hareketleri</h3>
              <button onClick={() => { setYeniHareketForm({ tarih: td(), saat: ts(), tip: 'maas', aciklama: '', tutar: '' }); setModalYeniHareket(true); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                <Plus size={12} /> Yeni İşlem
              </button>
            </div>
            {/* Filters */}
            <div className="flex gap-2 mb-3">
              <select value={detayTipFilter} onChange={e => { setDetayTipFilter(e.target.value as PersonelHareket['tip'] | 'tumu'); setDetayPage(1); }} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none">
                <option value="tumu">Tüm Tipler</option>
                {(Object.keys(TIP_LABELS) as PersonelHareket['tip'][]).map(t => <option key={t} value={t}>{TIP_LABELS[t]}</option>)}
              </select>
              <input type="date" value={detayDateFrom} onChange={e => { setDetayDateFrom(e.target.value); setDetayPage(1); }} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none" />
              <input type="date" value={detayDateTo} onChange={e => { setDetayDateTo(e.target.value); setDetayPage(1); }} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Tarih', 'Saat', 'Tip', 'Açıklama', 'Tutar', ''].map(h => (
                      <th key={h} className="text-left py-2 px-2 text-xs font-medium text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedDetayHareketler.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-xs text-gray-400">Hareket bulunamadı</td></tr>
                  ) : pagedDetayHareketler.map(h => (
                    <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-2 text-xs text-gray-600">{h.tarih}</td>
                      <td className="py-2 px-2 text-xs text-gray-400">{h.saat}</td>
                      <td className="py-2 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TIP_COLORS[h.tip]}`}>{TIP_LABELS[h.tip]}</span></td>
                      <td className="py-2 px-2 text-xs text-gray-600 max-w-[150px] truncate">{h.aciklama}</td>
                      <td className="py-2 px-2 text-xs font-semibold text-gray-800">{fmt(h.tutar)}</td>
                      <td className="py-2 px-2">
                        <div className="flex gap-1">
                          <button onClick={() => openEditHareket(h)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Pencil size={11} /></button>
                          <button onClick={() => setDeleteHareketId(h.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={11} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detayTotalPages > 1 && (
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-gray-400">{detayHareketler.length} kayıt</span>
                <div className="flex gap-1">
                  <button onClick={() => setDetayPage(p => Math.max(1, p - 1))} disabled={detayPage === 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronLeft size={14} /></button>
                  <span className="px-2 py-1 text-xs text-gray-600">{detayPage}/{detayTotalPages}</span>
                  <button onClick={() => setDetayPage(p => Math.min(detayTotalPages, p + 1))} disabled={detayPage === detayTotalPages} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        {detayChartData && chartEntries.length > 0 && (
          <div className={`${cardCls} p-4`}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Gider Dağılımı</h3>
            <div className="flex flex-wrap gap-2">
              {chartEntries.map(([k, v], i) => (
                <div key={k} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: chartColors[i % chartColors.length] }} />
                  <span className="text-xs text-gray-600">{TIP_LABELS[k as PersonelHareket['tip']]}</span>
                  <span className="text-xs font-semibold text-gray-800">{fmt(v as number)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modals for detay */}
        <Modal isOpen={modalYeniHareket} onClose={() => setModalYeniHareket(false)} title="Yeni İşlem Ekle" size="sm">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Tarih</label><input className={inputCls} type="date" value={yeniHareketForm.tarih} onChange={e => setYeniHareketForm(f => ({ ...f, tarih: e.target.value }))} /></div>
              <div><label className={labelCls}>Saat</label><input className={inputCls} type="time" value={yeniHareketForm.saat} onChange={e => setYeniHareketForm(f => ({ ...f, saat: e.target.value }))} /></div>
            </div>
            <div><label className={labelCls}>Tip</label>
              <select className={inputCls} value={yeniHareketForm.tip} onChange={e => setYeniHareketForm(f => ({ ...f, tip: e.target.value as PersonelHareket['tip'] }))}>
                {(Object.keys(TIP_LABELS) as PersonelHareket['tip'][]).map(t => <option key={t} value={t}>{TIP_LABELS[t]}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Açıklama</label><input className={inputCls} value={yeniHareketForm.aciklama} onChange={e => setYeniHareketForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
            <div><label className={labelCls}>Tutar (₺)</label><MoneyInput value={yeniHareketForm.tutar} onChange={v => setYeniHareketForm(f => ({ ...f, tutar: v }))} className={inputCls} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setModalYeniHareket(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">İptal</button>
              <button onClick={handleYeniHareket} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Ekle</button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={!!editHareket} onClose={() => setEditHareket(null)} title="Hareketi Düzenle" size="sm">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Tarih</label><input className={inputCls} type="date" value={editHareketForm.tarih} onChange={e => setEditHareketForm(f => ({ ...f, tarih: e.target.value }))} /></div>
              <div><label className={labelCls}>Saat</label><input className={inputCls} type="time" value={editHareketForm.saat} onChange={e => setEditHareketForm(f => ({ ...f, saat: e.target.value }))} /></div>
            </div>
            <div><label className={labelCls}>Tip</label>
              <select className={inputCls} value={editHareketForm.tip} onChange={e => setEditHareketForm(f => ({ ...f, tip: e.target.value as PersonelHareket['tip'] }))}>
                {(Object.keys(TIP_LABELS) as PersonelHareket['tip'][]).map(t => <option key={t} value={t}>{TIP_LABELS[t]}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Açıklama</label><input className={inputCls} value={editHareketForm.aciklama} onChange={e => setEditHareketForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
            <div><label className={labelCls}>Tutar (₺)</label><MoneyInput value={editHareketForm.tutar} onChange={v => setEditHareketForm(f => ({ ...f, tutar: v }))} className={inputCls} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditHareket(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">İptal</button>
              <button onClick={handleEditHareket} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Kaydet</button>
            </div>
          </div>
        </Modal>

        <ConfirmDialog isOpen={!!deleteHareketId} onClose={() => setDeleteHareketId(null)} onConfirm={() => { if (deleteHareketId) deletePersonelHareket(deleteHareketId); }} title="Hareketi Sil" message="Bu hareketi silmek istediğinizden emin misiniz?" />
        <ConfirmDialog isOpen={!!deletePersonelId} onClose={() => setDeletePersonelId(null)} onConfirm={() => { if (deletePersonelId) { deletePersonel(deletePersonelId); setDetayPersonel(null); } }} title="Personeli Sil" message="Bu personeli ve tüm hareketlerini silmek istediğinizden emin misiniz?" />
        <Modal isOpen={modalPersonel} onClose={() => { setModalPersonel(false); setEditingPersonel(null); setFormData(emptyForm()); }} title={editingPersonel ? 'Personel Düzenle' : 'Yeni Personel'} size="lg">{personelFormJSX}</Modal>
      </div>
    );
  }

  // ─── LIST VIEW ────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 min-h-screen bg-gray-50">
      {/* Ctrl+Space overlay */}
      {hizliOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-24 bg-black/40 backdrop-blur-sm" onClick={() => setHizliOpen(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <Search size={14} className="text-gray-400" />
              <input ref={hizliInputRef} value={hizliSearch} onChange={e => { setHizliSearch(e.target.value); setHizliIdx(0); }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHizliIdx(i => Math.min(filteredHizli.length - 1, i + 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setHizliIdx(i => Math.max(0, i - 1)); }
                  else if (e.key === 'Enter' && filteredHizli[hizliIdx]) { openHizliIslem(filteredHizli[hizliIdx].id); }
                  else if (e.key === 'Escape') setHizliOpen(false);
                  else if (e.key === 'Tab') { e.preventDefault(); setHizliIdx(i => (i + 1) % filteredHizli.length); }
                }}
                className="flex-1 text-sm outline-none placeholder-gray-400" placeholder="Hızlı işlem ara..." />
              <button onClick={() => setHizliOpen(false)}><X size={14} className="text-gray-400" /></button>
            </div>
            <div className="py-1">
              {filteredHizli.map((item, i) => (
                <button key={item.id} onClick={() => openHizliIslem(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${i === hizliIdx ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                  <item.icon size={14} className={item.color} />
                  {item.label}
                </button>
              ))}
            </div>
            <div className="border-t border-gray-100 px-4 py-2 flex gap-4 text-[10px] text-gray-400">
              <span>↑↓ Gezin</span><span>Tab Sonraki</span><span>Enter Seç</span><span>Esc Kapat</span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Personel</h1>
            <p className="text-xs text-gray-500">{today.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 flex-wrap">
            {HIZLI_ISLEMLER.slice(0, 5).map(h => (
              <button key={h.id} onClick={() => openHizliIslem(h.id)} className="flex items-center gap-1 px-2 py-1 text-[11px] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                <h.icon size={10} className={h.color} />{h.label}
              </button>
            ))}
            <button onClick={() => setHizliOpen(true)} className="flex items-center gap-1 px-2 py-1 text-[11px] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-400">
              <Zap size={10} /> Ctrl+Space
            </button>
          </div>
          <button onClick={() => { setEditingPersonel(null); setFormData(emptyForm()); setModalPersonel(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <UserPlus size={14} /> Yeni Personel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Toplam Personel', value: kpis.toplam, icon: Users, color: 'bg-blue-50 text-blue-600' },
          { label: 'Erkek', value: kpis.erkek, icon: Users, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Kadın', value: kpis.kadin, icon: Users, color: 'bg-pink-50 text-pink-600' },
          { label: 'Ort. Kıdem', value: `${Math.floor(kpis.avgKidemAy / 12)}y ${kpis.avgKidemAy % 12 | 0}a`, icon: Award, color: 'bg-orange-50 text-orange-600' },
          { label: 'Bu Ay İşe Alınan', value: kpis.buAyIseAlinan, icon: Calendar, color: 'bg-green-50 text-green-600' },
        ].map((k, i) => (
          <div key={i} className={`${cardCls} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{k.label}</span>
              <span className={`p-1.5 rounded-lg ${k.color}`}><k.icon size={14} /></span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Tablo */}
        <div className={`col-span-7 ${cardCls} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Personel Listesi</h2>
            <div className="flex gap-2">
              <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none">
                <option value="">Tüm Departmanlar</option>
                {departmanlar.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Ara..." className="pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400 w-36" />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Personel', 'Departman', 'Pozisyon', 'İşe Giriş', 'Maaş', 'Kalan Borç', 'Durum', ''].map(h => (
                    <th key={h} className="text-left py-2 px-2 text-[11px] font-medium text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedPersoneller.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-xs text-gray-400">Personel bulunamadı</td></tr>
                ) : pagedPersoneller.map(p => {
                  const { kalan } = calcBakiliye(p, personelHareketler, today);
                  return (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 group">
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {p.ad.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-800">{p.ad}</p>
                            {p.email && <p className="text-[10px] text-gray-400">{p.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2"><span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">{p.departman}</span></td>
                      <td className="py-2.5 px-2 text-xs text-gray-600">{p.pozisyon}</td>
                      <td className="py-2.5 px-2 text-xs text-gray-500">{p.baslangicTarihi}</td>
                      <td className="py-2.5 px-2 text-xs font-medium text-gray-700">{fmt(p.maas)}</td>
                      <td className="py-2.5 px-2">
                        <span className={`text-xs font-semibold ${kalan > 0 ? 'text-green-600' : kalan < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {kalan !== 0 ? (kalan > 0 ? '+' : '') + fmt(kalan) : '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${DURUM_COLORS[p.durum]}`}>{DURUM_LABELS[p.durum]}</span></td>
                      <td className="py-2.5 px-2">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setDetayPersonel(p)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={12} /></button>
                          <button onClick={() => openEditPersonel(p)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Pencil size={12} /></button>
                          <button onClick={() => setDeletePersonelId(p.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-400">{filteredPersoneller.length} personel</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronLeft size={14} /></button>
                <span className="px-2 py-1 text-xs text-gray-600">{page}/{totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>

        {/* Sağ Panel */}
        <div className="col-span-5 space-y-4">
          {/* Yaklaşan Ödemeler */}
          <div className={`${cardCls} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Yaklaşan Maaş Ödemeleri</h3>
              <span className="text-xs text-gray-400">{yaklasanOdemeler.length} kişi</span>
            </div>
            <div className="text-lg font-bold text-gray-800 mb-3">
              {fmt(yaklasanOdemeler.reduce((s, x) => s + x.kalan, 0))}
              <span className="text-xs font-normal text-gray-400 ml-1">toplam</span>
            </div>
            <div className="space-y-2">
              {yaklasanOdemeler.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">Bekleyen ödeme yok</p>
              ) : yaklasanOdemeler.map(({ p, kalan }) => (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">{p.ad.charAt(0)}</div>
                    <div>
                      <p className="text-xs font-medium text-gray-700">{p.ad}</p>
                      <p className="text-[10px] text-gray-400">{p.odemeTarihi}. her ay</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-green-600">{fmt(kalan)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SSK */}
          <div className={`${cardCls} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} className="text-red-500" />
              <h3 className="text-sm font-semibold text-gray-700">SSK Ödemeleri</h3>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Toplam SSK Primi</span>
                <span className="font-semibold text-gray-800">{fmt(toplamSsk)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Bu ay ödenen</span>
                <span className="font-semibold text-green-600">
                  {fmt(personeller.filter(p => isThisMonthPaid(p.id, 'ssk', personelHareketler, today)).reduce((s, p) => s + p.sskPrim, 0))}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Bekleyen</span>
                <span className="font-semibold text-red-600">
                  {fmt(personeller.filter(p => p.durum === 'aktif' && !isThisMonthPaid(p.id, 'ssk', personelHareketler, today)).reduce((s, p) => s + p.sskPrim, 0))}
                </span>
              </div>
            </div>
          </div>

          {/* Aylık Maliyet */}
          <div className={`${cardCls} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-purple-500" />
              <h3 className="text-sm font-semibold text-gray-700">Aylık Toplam Maliyet</h3>
            </div>
            <p className="text-2xl font-bold text-gray-800 mb-2">{fmt(toplamAylikMaliyet)}</p>
            <div className="space-y-1">
              {[
                ['Maaşlar', personeller.filter(p => p.durum === 'aktif').reduce((s, p) => s + p.maas, 0)],
                ['SSK', personeller.filter(p => p.durum === 'aktif').reduce((s, p) => s + p.sskPrim, 0)],
                ['Yemek', personeller.filter(p => p.durum === 'aktif').reduce((s, p) => s + p.yemekUcreti, 0)],
                ['Yol', personeller.filter(p => p.durum === 'aktif').reduce((s, p) => s + p.yolUcreti, 0)],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between text-xs">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium text-gray-700">{fmt(Number(v))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={modalPersonel} onClose={() => { setModalPersonel(false); setEditingPersonel(null); setFormData(emptyForm()); }} title={editingPersonel ? 'Personel Düzenle' : 'Yeni Personel'} size="lg">{personelFormJSX}</Modal>

      <Modal isOpen={modalMaas} onClose={() => setModalMaas(false)} title="Maaş Öde" size="sm">
        <div className="space-y-3">
          <div><label className={labelCls}>Personel</label>
            <select className={inputCls} value={selPersonelId} onChange={e => setSelPersonelId(e.target.value)}>
              <option value="">Tüm Aktif Personel</option>
              {personeller.filter(p => p.durum === 'aktif').map(p => {
                const { kalan } = calcBakiliye(p, personelHareketler, today);
                return <option key={p.id} value={p.id}>{p.ad} — {fmt(kalan)}</option>;
              })}
            </select>
          </div>
          <div><label className={labelCls}>Kaynak Kasa/Banka</label>
            <select className={inputCls} value={selKasaId} onChange={e => setSelKasaId(e.target.value)}>
              {kasaBanka.map(k => <option key={k.id} value={k.id}>{k.ad} ({fmt(k.bakiye)})</option>)}
            </select>
          </div>
          {selPersonelId && (() => {
            const p = personeller.find(x => x.id === selPersonelId);
            if (!p) return null;
            const { kalan } = calcBakiliye(p, personelHareketler, today);
            return <div className={`p-3 rounded-lg ${kalan > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
              <p className="text-xs text-gray-500">Ödenecek tutar:</p>
              <p className={`text-lg font-bold ${kalan > 0 ? 'text-green-600' : 'text-gray-400'}`}>{fmt(Math.max(0, kalan))}</p>
              {kalan <= 0 && <p className="text-xs text-gray-400">Bu personel için bekleyen ödeme yok.</p>}
            </div>;
          })()}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setModalMaas(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">İptal</button>
            <button onClick={handleMaasOde} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Öde</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={modalAvans} onClose={() => setModalAvans(false)} title="Avans Ver" size="sm">
        <div className="space-y-3">
          <div><label className={labelCls}>Personel</label>
            <select className={inputCls} value={avansForm.personelId} onChange={e => setAvansForm(f => ({ ...f, personelId: e.target.value }))}>
              <option value="">Seçin</option>
              {personeller.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Tutar (₺)</label><MoneyInput value={avansForm.tutar} onChange={v => setAvansForm(f => ({ ...f, tutar: v }))} className={inputCls} /></div>
          <div><label className={labelCls}>Açıklama</label><input className={inputCls} value={avansForm.aciklama} onChange={e => setAvansForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setModalAvans(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">İptal</button>
            <button onClick={handleAvansVer} className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600">Ekle</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={modalUrun} onClose={() => setModalUrun(false)} title="Ürün/Avans Alımı" size="sm">
        <div className="space-y-3">
          <div><label className={labelCls}>Personel</label>
            <select className={inputCls} value={urunForm.personelId} onChange={e => setUrunForm(f => ({ ...f, personelId: e.target.value }))}>
              <option value="">Seçin</option>
              {personeller.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Açıklama</label><input className={inputCls} value={urunForm.aciklama} onChange={e => setUrunForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
          <div><label className={labelCls}>Tutar (₺)</label><MoneyInput value={urunForm.tutar} onChange={v => setUrunForm(f => ({ ...f, tutar: v }))} className={inputCls} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setModalUrun(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">İptal</button>
            <button onClick={handleUrunAlinan} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">Ekle</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={modalIzin} onClose={() => setModalIzin(false)} title="İzin Ekle" size="sm">
        <div className="space-y-3">
          <div><label className={labelCls}>Personel</label>
            <select className={inputCls} value={izinForm.personelId} onChange={e => setIzinForm(f => ({ ...f, personelId: e.target.value }))}>
              <option value="">Seçin</option>
              {personeller.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Başlangıç</label><input className={inputCls} type="date" value={izinForm.baslangic} onChange={e => setIzinForm(f => ({ ...f, baslangic: e.target.value }))} /></div>
            <div><label className={labelCls}>Bitiş</label><input className={inputCls} type="date" value={izinForm.bitis} onChange={e => setIzinForm(f => ({ ...f, bitis: e.target.value }))} /></div>
          </div>
          <div><label className={labelCls}>Tip</label>
            <select className={inputCls} value={izinForm.tip} onChange={e => setIzinForm(f => ({ ...f, tip: e.target.value as 'ucretli' | 'ucretsiz' }))}>
              <option value="ucretli">Ücretli</option>
              <option value="ucretsiz">Ücretsiz</option>
            </select>
          </div>
          <div><label className={labelCls}>Açıklama</label><input className={inputCls} value={izinForm.aciklama} onChange={e => setIzinForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setModalIzin(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">İptal</button>
            <button onClick={handleIzinEkle} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Ekle</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={modalMesai} onClose={() => setModalMesai(false)} title="Mesai Ekle" size="sm">
        <div className="space-y-3">
          <div><label className={labelCls}>Personel</label>
            <select className={inputCls} value={mesaiForm.personelId} onChange={e => {
              const p = personeller.find(x => x.id === e.target.value);
              setMesaiForm(f => ({ ...f, personelId: e.target.value, saatlikUcret: p ? String((p.maas / 30 / 8).toFixed(2)) : '' }));
            }}>
              <option value="">Seçin</option>
              {personeller.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Tarih</label><input className={inputCls} type="date" value={mesaiForm.tarih} onChange={e => setMesaiForm(f => ({ ...f, tarih: e.target.value }))} /></div>
            <div><label className={labelCls}>Saat Sayısı</label><input className={inputCls} type="number" min={0.5} step={0.5} value={mesaiForm.saat} onChange={e => setMesaiForm(f => ({ ...f, saat: e.target.value }))} /></div>
          </div>
          <div><label className={labelCls}>Saatlik Ücret (₺)</label><MoneyInput value={mesaiForm.saatlikUcret} onChange={v => setMesaiForm(f => ({ ...f, saatlikUcret: v }))} className={inputCls} /></div>
          {mesaiForm.saat && mesaiForm.saatlikUcret && (
            <div className="p-2 bg-emerald-50 rounded-lg text-xs text-emerald-700">
              Toplam: {fmt(Number(mesaiForm.saat) * Number(mesaiForm.saatlikUcret))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setModalMesai(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">İptal</button>
            <button onClick={handleMesaiEkle} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Ekle</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!modalYemekYol} onClose={() => setModalYemekYol('')} title={modalYemekYol === 'yemek' ? 'Yemek Gideri' : modalYemekYol === 'yol' ? 'Yol Ücreti' : 'SSK Ödemesi'} size="sm">
        <div className="space-y-3">
          <div><label className={labelCls}>Personel</label>
            <select className={inputCls} value={yemekYolForm.personelId} onChange={e => setYemekYolForm({ personelId: e.target.value })}>
              <option value="">Tüm Aktif Personel</option>
              {personeller.filter(p => p.durum === 'aktif').map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-500">Bu ayda zaten ödeme yapılmış personeller atlanır.</p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setModalYemekYol('')} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">İptal</button>
            <button onClick={handleYemekYolSsk} className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">Öde</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={modalEkOdeme} onClose={() => setModalEkOdeme(false)} title="Ek Ödeme" size="sm">
        <div className="space-y-3">
          <div><label className={labelCls}>Personel</label>
            <select className={inputCls} value={ekOdemeForm.personelId} onChange={e => setEkOdemeForm(f => ({ ...f, personelId: e.target.value }))}>
              <option value="">Seçin</option>
              {personeller.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Tip</label>
            <select className={inputCls} value={ekOdemeForm.tip} onChange={e => setEkOdemeForm(f => ({ ...f, tip: e.target.value as 'prim' | 'ikramiye' | 'ek_odeme' }))}>
              <option value="prim">Prim</option>
              <option value="ikramiye">İkramiye</option>
              <option value="ek_odeme">Ek Ödeme</option>
            </select>
          </div>
          <div><label className={labelCls}>Tutar (₺)</label><MoneyInput value={ekOdemeForm.tutar} onChange={v => setEkOdemeForm(f => ({ ...f, tutar: v }))} className={inputCls} /></div>
          <div><label className={labelCls}>Açıklama</label><input className={inputCls} value={ekOdemeForm.aciklama} onChange={e => setEkOdemeForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setModalEkOdeme(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">İptal</button>
            <button onClick={handleEkOdeme} className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">Ekle</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deletePersonelId} onClose={() => setDeletePersonelId(null)} onConfirm={() => { if (deletePersonelId) deletePersonel(deletePersonelId); }} title="Personeli Sil" message="Bu personeli ve tüm hareketlerini silmek istediğinizden emin misiniz?" />
    </div>
  );
}
