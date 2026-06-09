import { useState, useMemo, useEffect } from 'react';
import { useQuickAction } from '../lib/quickAction';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Wallet, Building2, CreditCard, PiggyBank, TrendingUp,
  ArrowLeftRight, Plus, Pencil, Trash2, RefreshCw, ArrowDownLeft,
  ArrowUpRight, FileText, DollarSign, Activity,
  MoreVertical, Search, ChevronRight
} from 'lucide-react';
import { Line, Doughnut } from 'react-chartjs-2';
import { useApp } from '../context/AppContext';
import { paraCinsleri } from '../types';
import type { KasaBanka as KasaBankaType, KrediKarti, BirikimHesabi } from '../types';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import MoneyInput from '../components/MoneyInput';

const fmtN = (n: number) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmt = (n: number) => '₺' + fmtN(n);

function spark(base: number, points = 7): number[] {
  const arr: number[] = [];
  let v = base * 0.7;
  for (let i = 0; i < points; i++) {
    v = v + (Math.random() - 0.45) * base * 0.08;
    arr.push(Math.max(0, v));
  }
  arr[points - 1] = base;
  return arr;
}

function sparkData(data: number[], color: string) {
  return {
    labels: data.map((_, i) => String(i)),
    datasets: [{ data, borderColor: color, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4 }],
  };
}

const sparkOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: { x: { display: false }, y: { display: false } },
  animation: false as const,
};

function todayStr() {
  return new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
}

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

// Duzenli odeme icin bir sonraki odeme tarihini hesapla (ayin odemeGunu gunu)
function nextDuzenliDate(odemeGunu: number, sonOdemeTarihi?: string): string {
  if (sonOdemeTarihi) {
    const s = new Date(sonOdemeTarihi);
    if (!isNaN(s.getTime()) && s.getTime() >= Date.now() - 86400000) return sonOdemeTarihi;
  }
  const now = new Date();
  const gun = Math.min(Math.max(odemeGunu || 1, 1), 28);
  let y = now.getFullYear();
  let m = now.getMonth();
  if (now.getDate() > gun) m += 1;
  const d = new Date(y, m, gun);
  return d.toISOString().split('T')[0];
}

type HesaplarimTab = 'hepsi' | 'kasa' | 'banka' | 'kredi' | 'birikim';
type OdemelerTab = 'tumu' | 'duzenli' | 'vadesi';
type ModalType = 'transfer' | 'krediOdeme' | 'fatura' | 'paraYatir' | 'paraCek' | 'doviz' | 'cek' | 'hesapEkle' | 'krediEkle' | 'krediHarcama' | 'editHesap' | 'editKredi' | 'editBirikim' | 'hesapEkleMenu' | null;

type AccountForm = { ad: string; tip: 'kasa' | 'banka'; bakiye: string; paraCinsi: string; iban: string };
type KrediForm = { ad: string; limit: string; kartNo: string; sonOdemeTarihi: string };
type BirikimForm = { ad: string; bakiye: string; paraCinsi: string; iban: string };
type TransferForm = { kaynakId: string; hedefId: string; tutar: string; aciklama: string };
type KrediOdemeForm = { kartId: string; kaynakId: string; tutar: string };
type FaturaForm = { aciklama: string; tutar: string; kaynakId: string };
type ParaYatirForm = { hedefId: string; tutar: string; aciklama: string };
type ParaCekForm = { kaynakId: string; tutar: string; aciklama: string };
type KrediHarcamaForm = { kartId: string; tutar: string; aciklama: string; kategori: string };

const emptyAccountForm = (): AccountForm => ({ ad: '', tip: 'banka', bakiye: '', paraCinsi: 'TRY', iban: '' });
const emptyKrediForm = (): KrediForm => ({ ad: '', limit: '', kartNo: '', sonOdemeTarihi: '' });
const emptyBirikimForm = (): BirikimForm => ({ ad: '', bakiye: '', paraCinsi: 'TRY', iban: '' });
const emptyTransferForm = (): TransferForm => ({ kaynakId: '', hedefId: '', tutar: '', aciklama: '' });
const emptyKrediOdemeForm = (): KrediOdemeForm => ({ kartId: '', kaynakId: '', tutar: '' });
const emptyFaturaForm = (): FaturaForm => ({ aciklama: '', tutar: '', kaynakId: '' });
const emptyParaYatirForm = (): ParaYatirForm => ({ hedefId: '', tutar: '', aciklama: '' });
const emptyParaCekForm = (): ParaCekForm => ({ kaynakId: '', tutar: '', aciklama: '' });
const emptyKrediHarcamaForm = (): KrediHarcamaForm => ({ kartId: '', tutar: '', aciklama: '', kategori: 'Alisveris' });

const tipBadge: Record<string, { cls: string; label: string }> = {
  kasa: { cls: 'bg-orange-100 text-orange-700', label: 'Kasa' },
  banka: { cls: 'bg-blue-100 text-blue-700', label: 'Banka' },
  kredi_kart: { cls: 'bg-red-100 text-red-700', label: 'Kredi Karti' },
  birikim: { cls: 'bg-purple-100 text-purple-700', label: 'Birikim' },
};

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200';
const selectCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200 bg-white';
const labelCls = 'block text-xs font-medium text-gray-700 mb-1';

export default function KasaBankaPage() {
  const {
    kasaBanka, krediKartlari, birikimHesaplari, hareketler,
    cariHesaplar, cekler, emanetParalar, duzenliOdemeler,
    addKasaBanka, updateKasaBanka, deleteKasaBanka,
    addKrediKarti, updateKrediKarti, deleteKrediKarti,
    krediKartiOdeme, krediKartindanHarcama,
    addBirikimHesabi, updateBirikimHesabi, deleteBirikimHesabi,
    addHareket,
  } = useApp();

  const [activeModal, setActiveModal] = useState<ModalType>(null);
  // Ödeme yönlendirme & POS
  const [routing, setRouting] = useState<any>({ posKomisyon: '', posAktif: false });
  const [routingOpen, setRoutingOpen] = useState(false);
  useEffect(() => { api.get('/store/payment-routing').then((r) => setRouting({ posKomisyon: '', posAktif: false, ...(r.data || {}) })).catch(() => {}); }, []);
  const saveRouting = () => { api.put('/store/payment-routing', { ...routing, posKomisyon: Number(routing.posKomisyon) || 0 }).then(() => { toast.success('Ödeme yönlendirme kaydedildi'); setRoutingOpen(false); }).catch(() => toast.error('Kaydedilemedi')); };
  const setR = (k: string, v: any) => setRouting((x: any) => ({ ...x, [k]: v }));
  const accOpts = useMemo(() => kasaBanka.map((k) => ({ id: k.id, ad: `${k.ad} (${k.tip === 'kasa' ? 'Kasa' : 'Banka'})` })), [kasaBanka]);
  const routingEksik = !routing.online && !routing.canli && !routing.kasa;
  const [hesaplarimTab, setHesaplarimTab] = useState<HesaplarimTab>('hepsi');
  const [odemelerTab, setOdemelerTab] = useState<OdemelerTab>('tumu');
  const [nakit_period, setNakitPeriod] = useState<'7' | '30' | 'ay'>('ay');
  const [hesapSearch, setHesapSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; type: 'kasa' | 'kredi' | 'birikim' } | null>(null);

  const [editKasaTarget, setEditKasaTarget] = useState<KasaBankaType | null>(null);
  const [editKrediTarget, setEditKrediTarget] = useState<KrediKarti | null>(null);
  const [editBirikimTarget, setEditBirikimTarget] = useState<BirikimHesabi | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm());
  const [krediForm, setKrediForm] = useState<KrediForm>(emptyKrediForm());
  const [birikimForm, setBirikimForm] = useState<BirikimForm>(emptyBirikimForm());
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransferForm());
  const [krediOdemeForm, setKrediOdemeForm] = useState<KrediOdemeForm>(emptyKrediOdemeForm());
  const [faturaForm, setFaturaForm] = useState<FaturaForm>(emptyFaturaForm());
  const [paraYatirForm, setParaYatirForm] = useState<ParaYatirForm>(emptyParaYatirForm());
  const [paraCekForm, setParaCekForm] = useState<ParaCekForm>(emptyParaCekForm());
  const [krediHarcamaForm, setKrediHarcamaForm] = useState<KrediHarcamaForm>(emptyKrediHarcamaForm());

  function openModal(type: ModalType) { setActiveModal(type); }
  function closeModal() { setActiveModal(null); }

  // Global hizli islem (Ctrl+Space) -> Transfer / Fatura Ode komutlari ilgili modali acar
  useQuickAction('pending_kasabanka_action', (p) => {
    const tip = (p?.tip || 'transfer') as ModalType;
    setActiveModal(tip);
  });

  const kasaToplam = useMemo(() => kasaBanka.filter(k => k.tip === 'kasa').reduce((a, b) => a + b.bakiye, 0), [kasaBanka]);
  const bankaToplam = useMemo(() => kasaBanka.filter(k => k.tip === 'banka').reduce((a, b) => a + b.bakiye, 0), [kasaBanka]);
  const kasaCount = kasaBanka.filter(k => k.tip === 'kasa').length;
  const bankaCount = kasaBanka.filter(k => k.tip === 'banka').length;
  const krediToplam = useMemo(() => krediKartlari.reduce((a, c) => a + c.borc, 0), [krediKartlari]);
  const krediLimitToplam = useMemo(() => krediKartlari.reduce((a, c) => a + c.limit, 0), [krediKartlari]);
  const birikimToplam = useMemo(() => birikimHesaplari.reduce((a, b) => a + b.bakiye, 0), [birikimHesaplari]);
  const netVarlik = kasaToplam + bankaToplam + birikimToplam - krediToplam;

  const kasaSpark = useMemo(() => spark(kasaToplam || 1000), [kasaToplam]);
  const bankaSpark = useMemo(() => spark(bankaToplam || 1000), [bankaToplam]);
  const krediSpark = useMemo(() => spark(krediToplam || 1000), [krediToplam]);
  const birikimSpark = useMemo(() => spark(birikimToplam || 1000), [birikimToplam]);

  const netDonutData = useMemo(() => ({
    labels: ['Kasa', 'Banka', 'Birikim', 'Borc'],
    datasets: [{ data: [kasaToplam, bankaToplam, birikimToplam, krediToplam], backgroundColor: ['#22c55e', '#3b82f6', '#a855f7', '#ef4444'], borderWidth: 0 }],
  }), [kasaToplam, bankaToplam, birikimToplam, krediToplam]);
  const donutOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: { label: string; parsed: number }) => `${ctx.label}: ${fmtN(ctx.parsed)} ₺` } } }, cutout: '70%' };

  const krediDonutData = useMemo(() => ({
    labels: krediKartlari.map(c => c.ad),
    datasets: [{ data: krediKartlari.map(c => c.borc), backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#a855f7', '#3b82f6'], borderWidth: 0 }],
  }), [krediKartlari]);

  const nakitLabels = useMemo(() => {
    const now = new Date();
    const days = nakit_period === '7' ? 7 : nakit_period === '30' ? 30 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) => String(i + 1));
  }, [nakit_period]);

  const nakitData = useMemo(() => {
    const now = new Date(); const yr = now.getFullYear(); const mo = now.getMonth();
    const days = nakitLabels.length;
    const gelir = Array(days).fill(0); const gider = Array(days).fill(0);
    hareketler.forEach(h => {
      const d = new Date(h.tarih);
      if (d.getFullYear() === yr && d.getMonth() === mo) {
        const idx = d.getDate() - 1;
        if (idx >= 0 && idx < days) { if (h.tip === 'gelir') gelir[idx] += h.tutar; else gider[idx] += h.tutar; }
      }
    });
    return { gelir, gider, net: gelir.map((g, i) => g - gider[i]) };
  }, [hareketler, nakitLabels]);

  const nakitChartData = {
    labels: nakitLabels,
    datasets: [
      { label: 'Gelir', data: nakitData.gelir, borderColor: '#22c55e', backgroundColor: '#22c55e22', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 },
      { label: 'Gider', data: nakitData.gider, borderColor: '#ef4444', backgroundColor: '#ef444422', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 },
      { label: 'Net', data: nakitData.net, borderColor: '#3b82f6', backgroundColor: 'transparent', fill: false, tension: 0.4, borderWidth: 2.5, pointRadius: 0 },
    ],
  };
  const nakitOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: 'index' as const, intersect: false } },
    scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 }, callback: (v: number | string) => fmtN(Number(v) / 1000) + 'K' } } },
  };

  const allHesaplar = useMemo(() => {
    const kasa = kasaBanka.map(k => ({ id: k.id, ad: k.ad, tip: k.tip as string, bakiye: k.bakiye, paraCinsi: k.paraCinsi, sub: k.iban ? k.iban.slice(-8) : '', source: 'kasa' as const }));
    const kredi = krediKartlari.map(c => ({ id: c.id, ad: c.ad, tip: 'kredi_kart', bakiye: -c.borc, paraCinsi: 'TRY', sub: c.kartNo ? '****' + c.kartNo : '', source: 'kredi' as const }));
    const birikim = birikimHesaplari.map(b => ({ id: b.id, ad: b.ad, tip: 'birikim', bakiye: b.bakiye, paraCinsi: b.paraCinsi, sub: b.iban ? b.iban.slice(-8) : '', source: 'birikim' as const }));
    return [...kasa, ...kredi, ...birikim];
  }, [kasaBanka, krediKartlari, birikimHesaplari]);

  const filteredHesaplar = useMemo(() => {
    let list = allHesaplar;
    if (hesaplarimTab === 'kasa') list = list.filter(h => h.tip === 'kasa');
    else if (hesaplarimTab === 'banka') list = list.filter(h => h.tip === 'banka');
    else if (hesaplarimTab === 'kredi') list = list.filter(h => h.tip === 'kredi_kart');
    else if (hesaplarimTab === 'birikim') list = list.filter(h => h.tip === 'birikim');
    if (hesapSearch) list = list.filter(h => h.ad.toLowerCase().includes(hesapSearch.toLowerCase()));
    return list;
  }, [allHesaplar, hesaplarimTab, hesapSearch]);

  const sonIslemler = useMemo(() => hareketler.slice(0, 8), [hareketler]);

  const upcomingOdemeler = useMemo(() => {
    const kredi = krediKartlari
      .filter(c => c.sonOdemeTarihi)
      .map(c => ({ id: 'kk-' + c.id, icon: '💳', name: c.ad + ' Ekstre', tutar: c.borc, tarih: c.sonOdemeTarihi!, gun: daysUntil(c.sonOdemeTarihi!), tip: 'vadesi' as const, alt: 'Kredi Karti' }))
      .filter(c => c.gun >= 0 && c.tutar > 0);
    const cek = cekler
      .filter(c => c.tip === 'borc' && c.durum === 'bekleyen')
      .map(c => ({ id: 'cek-' + c.id, icon: '🧾', name: 'Cek - ' + c.kisiAd, tutar: c.tutar, tarih: c.vadeTarihi, gun: daysUntil(c.vadeTarihi), tip: 'vadesi' as const, alt: 'Cek' }))
      .filter(c => c.gun >= 0);
    const duzenli = (duzenliOdemeler || [])
      .filter(d => d.durum === 'aktif')
      .map(d => { const tarih = nextDuzenliDate(d.odemeGunu, d.sonOdemeTarihi); return { id: 'dz-' + d.id, icon: '🔁', name: d.ad, tutar: d.tutar, tarih, gun: daysUntil(tarih), tip: 'duzenli' as const, alt: 'Duzenli Odeme' }; })
      .filter(d => d.gun >= 0);
    return [...duzenli, ...kredi, ...cek].sort((a, b) => a.gun - b.gun);
  }, [krediKartlari, cekler, duzenliOdemeler]);

  const filteredOdemeler = useMemo(() => {
    if (odemelerTab === 'tumu') return upcomingOdemeler;
    return upcomingOdemeler.filter(o => o.tip === odemelerTab);
  }, [upcomingOdemeler, odemelerTab]);

  const duzenliCount = upcomingOdemeler.filter(o => o.tip === 'duzenli').length;
  const vadesiCount = upcomingOdemeler.filter(o => o.tip === 'vadesi').length;

  function nowStr() {
    const d = new Date();
    return { tarih: d.toISOString().split('T')[0], saat: d.toTimeString().slice(0, 5) };
  }

  function handleTransfer() {
    const { kaynakId, hedefId, tutar, aciklama } = transferForm;
    if (!kaynakId || !hedefId || !tutar || kaynakId === hedefId) return;
    const t = Number(tutar); if (isNaN(t) || t <= 0) return;
    const kaynak = kasaBanka.find(k => k.id === kaynakId);
    const hedef = kasaBanka.find(k => k.id === hedefId);
    if (!kaynak || !hedef) return;
    updateKasaBanka(kaynakId, { bakiye: kaynak.bakiye - t });
    updateKasaBanka(hedefId, { bakiye: hedef.bakiye + t });
    const { tarih, saat } = nowStr();
    addHareket({ tarih, saat, aciklama: `Transfer: ${kaynak.ad} -> ${hedef.ad}${aciklama ? ' (' + aciklama + ')' : ''}`, tutar: t, tip: 'gider', kategori: 'Transfer', kasaBankaId: kaynakId });
    closeModal(); setTransferForm(emptyTransferForm());
  }

  function handleKrediOdeme() {
    const { kartId, kaynakId, tutar } = krediOdemeForm;
    const t = Number(tutar); if (!kartId || !kaynakId || isNaN(t) || t <= 0) return;
    krediKartiOdeme(kartId, kaynakId, t);
    closeModal(); setKrediOdemeForm(emptyKrediOdemeForm());
  }

  function handleFaturaOdeme() {
    const { aciklama, tutar, kaynakId } = faturaForm;
    const t = Number(tutar); if (!aciklama || !kaynakId || isNaN(t) || t <= 0) return;
    const kaynak = kasaBanka.find(k => k.id === kaynakId);
    if (!kaynak) return;
    updateKasaBanka(kaynakId, { bakiye: kaynak.bakiye - t });
    const { tarih, saat } = nowStr();
    addHareket({ tarih, saat, aciklama: `Fatura Odemesi: ${aciklama}`, tutar: t, tip: 'gider', kategori: 'Fatura', kasaBankaId: kaynakId });
    closeModal(); setFaturaForm(emptyFaturaForm());
  }

  function handleParaYatir() {
    const { hedefId, tutar, aciklama } = paraYatirForm;
    const t = Number(tutar); if (!hedefId || isNaN(t) || t <= 0) return;
    const hedef = kasaBanka.find(k => k.id === hedefId);
    if (!hedef) return;
    updateKasaBanka(hedefId, { bakiye: hedef.bakiye + t });
    const { tarih, saat } = nowStr();
    addHareket({ tarih, saat, aciklama: aciklama || `Para Yatirma: ${hedef.ad}`, tutar: t, tip: 'gelir', kategori: 'Para Yatirma', kasaBankaId: hedefId });
    closeModal(); setParaYatirForm(emptyParaYatirForm());
  }

  function handleParaCek() {
    const { kaynakId, tutar, aciklama } = paraCekForm;
    const t = Number(tutar); if (!kaynakId || isNaN(t) || t <= 0) return;
    const kaynak = kasaBanka.find(k => k.id === kaynakId);
    if (!kaynak) return;
    updateKasaBanka(kaynakId, { bakiye: kaynak.bakiye - t });
    const { tarih, saat } = nowStr();
    addHareket({ tarih, saat, aciklama: aciklama || `Para Cekme: ${kaynak.ad}`, tutar: t, tip: 'gider', kategori: 'Para Cekme', kasaBankaId: kaynakId });
    closeModal(); setParaCekForm(emptyParaCekForm());
  }

  function handleKrediHarcama() {
    const { kartId, tutar, aciklama, kategori } = krediHarcamaForm;
    const t = Number(tutar); if (!kartId || isNaN(t) || t <= 0 || !aciklama) return;
    krediKartindanHarcama(kartId, t, aciklama, kategori);
    closeModal(); setKrediHarcamaForm(emptyKrediHarcamaForm());
  }

  function saveHesap() {
    if (!accountForm.ad) return;
    const data: Omit<KasaBankaType, 'id'> = { ad: accountForm.ad, tip: accountForm.tip, bakiye: Number(accountForm.bakiye) || 0, paraCinsi: accountForm.paraCinsi, iban: accountForm.iban || undefined };
    if (editKasaTarget) { updateKasaBanka(editKasaTarget.id, data); setEditKasaTarget(null); } else addKasaBanka(data);
    closeModal(); setAccountForm(emptyAccountForm());
  }

  function saveKredi() {
    if (!krediForm.ad || !krediForm.limit) return;
    const data = { ad: krediForm.ad, limit: Number(krediForm.limit), borc: editKrediTarget?.borc || 0, kartNo: krediForm.kartNo || undefined, sonOdemeTarihi: krediForm.sonOdemeTarihi || undefined };
    if (editKrediTarget) { updateKrediKarti(editKrediTarget.id, data); setEditKrediTarget(null); } else addKrediKarti(data);
    closeModal(); setKrediForm(emptyKrediForm());
  }

  function saveBirikim() {
    if (!birikimForm.ad) return;
    const data = { ad: birikimForm.ad, bakiye: Number(birikimForm.bakiye) || 0, paraCinsi: birikimForm.paraCinsi, iban: birikimForm.iban || undefined };
    if (editBirikimTarget) { updateBirikimHesabi(editBirikimTarget.id, data); setEditBirikimTarget(null); } else addBirikimHesabi(data);
    closeModal(); setBirikimForm(emptyBirikimForm());
  }

  function handleConfirmDelete() {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'kasa') deleteKasaBanka(confirmDelete.id);
    else if (confirmDelete.type === 'kredi') deleteKrediKarti(confirmDelete.id);
    else deleteBirikimHesabi(confirmDelete.id);
    setConfirmDelete(null);
  }

  const quickActions = [
    { label: 'Para Transferi', icon: <ArrowLeftRight size={16} />, sub: 'Havale/EFT', onClick: () => openModal('transfer') },
    { label: 'Kredi Karti Odemesi', icon: <CreditCard size={16} />, sub: 'Kart Borcu Ode', onClick: () => openModal('krediOdeme') },
    { label: 'Fatura Odeme', icon: <FileText size={16} />, sub: 'Faturalarini Ode', onClick: () => openModal('fatura') },
    { label: 'Para Yatir', icon: <ArrowDownLeft size={16} />, sub: 'Hesaba Para Yatir', onClick: () => openModal('paraYatir') },
    { label: 'Para Cek', icon: <ArrowUpRight size={16} />, sub: 'Hesaptan Para Cek', onClick: () => openModal('paraCek') },
    { label: 'Doviz Al/Sat', icon: <DollarSign size={16} />, sub: 'Doviz Islemleri', onClick: () => openModal('doviz') },
    { label: 'Cek Islemleri', icon: <RefreshCw size={16} />, sub: 'Cek Gonder/Tahsil', onClick: () => openModal('cek') },
    { label: 'Hesap Ekle', icon: <Plus size={16} />, sub: 'Yeni Hesap Ekle', onClick: () => openModal('hesapEkleMenu') },
    { label: 'Tum Islemler', icon: <Activity size={16} />, sub: 'Diger Islemler', onClick: () => openModal('hesapEkleMenu') },
  ];

  const kpiCards = [
    { title: 'Kasa', count: `${kasaCount} Hesap`, value: kasaToplam, color: 'text-green-600', bg: 'bg-green-100', icon: <Wallet size={14} className="text-green-600" />, spark: kasaSpark, sparkColor: '#22c55e' },
    { title: 'Banka Hesaplari', count: `${bankaCount} Hesap`, value: bankaToplam, color: 'text-blue-600', bg: 'bg-blue-100', icon: <Building2 size={14} className="text-blue-600" />, spark: bankaSpark, sparkColor: '#3b82f6' },
    { title: 'Kredi Karti Borclari', count: `${krediKartlari.length} Kart`, value: -krediToplam, color: 'text-red-600', bg: 'bg-red-100', icon: <CreditCard size={14} className="text-red-600" />, spark: krediSpark, sparkColor: '#ef4444' },
    { title: 'Birikim Hesaplari', count: `${birikimHesaplari.length} Hesap`, value: birikimToplam, color: 'text-purple-600', bg: 'bg-purple-100', icon: <PiggyBank size={14} className="text-purple-600" />, spark: birikimSpark, sparkColor: '#a855f7' },
    { title: 'Net Finansal Durum', count: 'Net Varlik', value: netVarlik, color: netVarlik >= 0 ? 'text-green-600' : 'text-red-600', bg: netVarlik >= 0 ? 'bg-green-100' : 'bg-red-100', icon: <TrendingUp size={14} className={netVarlik >= 0 ? 'text-green-600' : 'text-red-600'} />, donut: true },
  ];

  return (
    <div className="space-y-4" onClick={() => setOpenMenuId(null)}>
      {/* HEADER */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Kasa &amp; Banka</h1>
          <p className="text-xs text-gray-400 mt-0.5">Tum hesaplarinizi tek ekranda goruntuleyin, islemlerinizi hizlica gerceklestirin.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-lg font-medium">{todayStr()}</span>
          <button onClick={() => openModal('hesapEkleMenu')} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-[11px] font-semibold hover:bg-purple-700 transition-colors">
            <Plus size={12} /> Yeni Islem <ChevronRight size={11} />
          </button>
        </div>
      </div>

      {/* HIZLI ISLEMLER */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
        <div className="flex gap-1.5 overflow-x-auto">
          {quickActions.map(qa => (
            <button key={qa.label} onClick={qa.onClick} className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 border border-gray-100 rounded-xl hover:border-purple-300 hover:bg-purple-50 transition-all min-w-[86px] group">
              <div className="w-8 h-8 rounded-xl bg-gray-50 group-hover:bg-purple-100 flex items-center justify-center text-gray-500 group-hover:text-purple-600 transition-colors">{qa.icon}</div>
              <span className="text-[10px] font-semibold text-gray-700 leading-tight text-center">{qa.label}</span>
              <span className="text-[9px] text-gray-400 leading-tight text-center">{qa.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ODEME YONLENDIRME & POS */}
      <div className={`rounded-xl border shadow-sm p-3 ${routingEksik ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${routingEksik ? 'bg-amber-100 text-amber-600' : 'bg-purple-100 text-purple-600'}`}><ArrowLeftRight size={15} /></div>
            <div>
              <p className="text-xs font-semibold text-gray-800">Ödeme Yönlendirme & POS</p>
              <p className="text-[10px] text-gray-500">{routingEksik ? 'Hesap seçili değil — sipariş gelirleri kasaya yansımıyor. Lütfen ayarlayın.' : 'Sipariş gelirleri seçili hesaplara işleniyor.'}</p>
            </div>
          </div>
          <button onClick={() => setRoutingOpen((o) => !o)} className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700">{routingOpen ? 'Kapat' : 'Ayarla'}</button>
        </div>
        {routingOpen && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            {accOpts.length === 0 && <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Önce bir Kasa veya Banka hesabı ekleyin.</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([['online', 'Online Mağaza Satışları'], ['canli', 'Canlı Yayın Satışları'], ['kasa', 'Kasa Satışları'], ['manuel', 'Manuel Siparişler'], ['asistan', 'Asistan Satışları']] as [string, string][]).map(([k, lbl]) => (
                <div key={k}>
                  <label className="block text-[10px] font-medium text-gray-600 mb-1">{lbl}</label>
                  <select value={routing[k] || ''} onChange={(e) => setR(k, e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs bg-white">
                    <option value="">Hesap seçin...</option>
                    {accOpts.map((a) => <option key={a.id} value={a.id}>{a.ad}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-gray-100 p-3 bg-gray-50/50">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2"><input type="checkbox" checked={!!routing.posAktif} onChange={(e) => setR('posAktif', e.target.checked)} /> <CreditCard size={14} className="text-purple-600" /> POS Cihazı (kart/kredi ödemeleri için)</label>
              {routing.posAktif && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="block text-[10px] font-medium text-gray-600 mb-1">POS Geliri Hesabı</label><select value={routing.pos || ''} onChange={(e) => setR('pos', e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs bg-white"><option value="">Hesap seçin...</option>{accOpts.map((a) => <option key={a.id} value={a.id}>{a.ad}</option>)}</select></div>
                  <div><label className="block text-[10px] font-medium text-gray-600 mb-1">POS Komisyon Oranı (%)</label><input type="number" min={0} step="0.1" value={routing.posKomisyon} onChange={(e) => setR('posKomisyon', e.target.value)} placeholder="ör. 1.8" className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs" /></div>
                  <p className="text-[10px] text-gray-400 sm:col-span-2">Kart/kredi ile ödenen satışlar POS hesabına işlenir; komisyon tutarı otomatik gider olarak kaydedilip hesaba net tutar yansıtılır.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end"><button onClick={saveRouting} className="px-4 py-2 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700">Kaydet</button></div>
          </div>
        )}
      </div>

      {/* 5 KPI CARDS */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {kpiCards.map((kpi, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <div className={`p-1.5 ${kpi.bg} rounded-lg`}>{kpi.icon}</div>
                <span className="text-[10px] font-medium text-gray-500 leading-tight">{kpi.title}</span>
              </div>
              <span className="text-[9px] text-gray-400 flex-shrink-0">{kpi.count}</span>
            </div>
            <div className={`text-sm font-bold ${kpi.color} mb-1.5`}>{fmt(Math.abs(kpi.value))}</div>
            <div className="h-9 relative">
              {'donut' in kpi && kpi.donut ? (
                <Doughnut data={netDonutData} options={donutOpts} />
              ) : (
                <Line data={sparkData(kpi.spark!, kpi.sparkColor!)} options={sparkOpts} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* MIDDLE 3-COL */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        {/* Hesaplarim */}
        <div className="xl:col-span-4 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1.5">
              <h2 className="font-semibold text-gray-800 text-xs">Hesaplarim</h2>
              <div className="flex items-center gap-1">
                <div className="relative">
                  <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={hesapSearch} onChange={e => setHesapSearch(e.target.value)} className="pl-5 pr-2 py-0.5 text-[9px] border border-gray-200 rounded-md outline-none w-20" placeholder="Ara..." />
                </div>
              </div>
            </div>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {(['hepsi', 'kasa', 'banka', 'kredi', 'birikim'] as HesaplarimTab[]).map(t => (
                <button key={t} onClick={() => setHesaplarimTab(t)} className={`flex-1 py-0.5 rounded-md text-[9px] font-medium transition-colors ${hesaplarimTab === t ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {t === 'hepsi' ? 'Hepsi' : t === 'kasa' ? 'Kasa' : t === 'banka' ? 'Banka' : t === 'kredi' ? 'Kredi K.' : 'Birikim'}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-gray-50 text-gray-400">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Hesap Adi</th>
                  <th className="px-3 py-1.5 text-center font-medium">Tur</th>
                  <th className="px-3 py-1.5 text-right font-medium">Bakiye</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredHesaplar.map(h => {
                  const badge = tipBadge[h.tip] || { cls: 'bg-gray-100 text-gray-600', label: h.tip };
                  return (
                    <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-gray-800 truncate max-w-[90px]">{h.ad}</div>
                        {h.sub && <div className="text-[8px] text-gray-400">{h.sub}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className={`px-3 py-1.5 text-right font-semibold ${h.bakiye < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                        {h.bakiye < 0 ? '-' + fmt(Math.abs(h.bakiye)) : fmt(h.bakiye)}
                      </td>
                      <td className="px-2 py-1.5 relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setOpenMenuId(openMenuId === h.id ? null : h.id)} className="p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors">
                          <MoreVertical size={11} />
                        </button>
                        {openMenuId === h.id && (
                          <div className="absolute right-6 top-0 z-50 bg-white border border-gray-100 rounded-lg shadow-lg py-1 w-28">
                            {h.source === 'kasa' && (
                              <>
                                <button onClick={() => {
                                  const acc = kasaBanka.find(k => k.id === h.id);
                                  if (acc) { setEditKasaTarget(acc); setAccountForm({ ad: acc.ad, tip: acc.tip, bakiye: String(acc.bakiye), paraCinsi: acc.paraCinsi, iban: acc.iban || '' }); openModal('hesapEkle'); }
                                  setOpenMenuId(null);
                                }} className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-gray-50 flex items-center gap-1.5 text-gray-700"><Pencil size={10} /> Duzenle</button>
                                <button onClick={() => { setConfirmDelete({ id: h.id, type: 'kasa' }); setOpenMenuId(null); }} className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-red-50 flex items-center gap-1.5 text-red-600"><Trash2 size={10} /> Sil</button>
                              </>
                            )}
                            {h.source === 'kredi' && (
                              <>
                                <button onClick={() => {
                                  const k = krediKartlari.find(x => x.id === h.id);
                                  if (k) { setEditKrediTarget(k); setKrediForm({ ad: k.ad, limit: String(k.limit), kartNo: k.kartNo || '', sonOdemeTarihi: k.sonOdemeTarihi || '' }); openModal('krediEkle'); }
                                  setOpenMenuId(null);
                                }} className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-gray-50 flex items-center gap-1.5 text-gray-700"><Pencil size={10} /> Duzenle</button>
                                <button onClick={() => { setConfirmDelete({ id: h.id, type: 'kredi' }); setOpenMenuId(null); }} className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-red-50 flex items-center gap-1.5 text-red-600"><Trash2 size={10} /> Sil</button>
                              </>
                            )}
                            {h.source === 'birikim' && (
                              <>
                                <button onClick={() => {
                                  const b = birikimHesaplari.find(x => x.id === h.id);
                                  if (b) { setEditBirikimTarget(b); setBirikimForm({ ad: b.ad, bakiye: String(b.bakiye), paraCinsi: b.paraCinsi, iban: b.iban || '' }); openModal('editBirikim'); }
                                  setOpenMenuId(null);
                                }} className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-gray-50 flex items-center gap-1.5 text-gray-700"><Pencil size={10} /> Duzenle</button>
                                <button onClick={() => { setConfirmDelete({ id: h.id, type: 'birikim' }); setOpenMenuId(null); }} className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-red-50 flex items-center gap-1.5 text-red-600"><Trash2 size={10} /> Sil</button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredHesaplar.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400 text-[10px]">Hesap bulunamadi</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-1.5 border-t border-gray-100 text-center">
            <button className="text-[10px] text-purple-600 hover:underline flex items-center gap-0.5 mx-auto">Tum Hesaplari Goruntule <ChevronRight size={10} /></button>
          </div>
        </div>

        {/* Son Islemler */}
        <div className="xl:col-span-4 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-xs">Son Islemler</h2>
            <button className="text-[9px] text-purple-600 hover:underline flex items-center gap-0.5">Tumu <ChevronRight size={9} /></button>
          </div>
          <div className="divide-y divide-gray-50">
            {sonIslemler.length === 0 ? (
              <div className="px-3 py-6 text-center text-gray-400 text-[10px]">Henuz islem yok</div>
            ) : sonIslemler.map(h => (
              <div key={h.id} className="px-3 py-1.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${h.tip === 'gelir' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {h.tip === 'gelir' ? <ArrowDownLeft size={12} className="text-green-600" /> : <ArrowUpRight size={12} className="text-red-600" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium text-gray-800 truncate max-w-[130px]">{h.aciklama}</div>
                    <div className="text-[8px] text-gray-400">{h.tarih} {h.saat} · {h.kategori}</div>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold flex-shrink-0 ${h.tip === 'gelir' ? 'text-green-600' : 'text-red-600'}`}>{h.tip === 'gelir' ? '+' : '-'}{fmt(h.tutar)}</span>
              </div>
            ))}
          </div>
          <div className="px-3 py-1.5 border-t border-gray-100 text-center">
            <button className="text-[10px] text-purple-600 hover:underline flex items-center gap-0.5 mx-auto">Tum Islemleri Goruntule <ChevronRight size={10} /></button>
          </div>
        </div>

        {/* Kredi Karti Ozeti */}
        <div className="xl:col-span-4 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-xs">Kredi Karti Ozeti</h2>
            <button onClick={() => openModal('krediHarcama')} className="text-[9px] text-purple-600 border border-purple-200 px-2 py-0.5 rounded-md hover:bg-purple-50">+ Harcama</button>
          </div>
          <div className="p-3">
            {krediKartlari.length > 0 ? (
              <>
                <div className="h-24 mb-1.5 relative">
                  <Doughnut data={krediDonutData} options={donutOpts} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[8px] text-gray-400">Toplam Borc</span>
                    <span className="text-xs font-bold text-red-600">{fmt(krediToplam)}</span>
                  </div>
                </div>
                <div className="text-center text-[9px] text-gray-500 mb-2">
                  Kullanim %{krediLimitToplam > 0 ? ((krediToplam / krediLimitToplam) * 100).toFixed(1) : '0.0'}
                </div>
                <div className="space-y-1.5">
                  {krediKartlari.slice(0, 4).map((c, i) => {
                    const pct = c.limit > 0 ? (c.borc / c.limit) * 100 : 0;
                    const barCls = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-purple-500'][i % 4];
                    return (
                      <div key={c.id}>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <span className="font-medium text-gray-700 truncate max-w-[100px]">{c.ad}</span>
                          <span className="text-gray-500 flex-shrink-0">{fmt(c.borc)}/{fmt(c.limit)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${barCls} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2.5 pt-2 border-t border-gray-100 space-y-1">
                  <div className="flex justify-between text-[10px]"><span className="text-gray-600">Kredi Karti Borclar</span><span className="font-semibold text-red-600">{fmt(krediToplam)}</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-gray-600">Diger Borclar</span><span className="text-gray-500">-</span></div>
                  <div className="flex justify-between text-[10px] font-semibold pt-1 border-t border-gray-100"><span className="text-gray-800">Toplam Borc</span><span className="text-red-600">{fmt(krediToplam)}</span></div>
                </div>
              </>
            ) : (
              <div className="py-6 text-center text-gray-400 text-[10px]">Kredi karti bulunmuyor</div>
            )}
            <div className="text-center mt-2">
              <button className="text-[10px] text-purple-600 hover:underline flex items-center gap-0.5 mx-auto">Kart Detaylari <ChevronRight size={10} /></button>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM 2-COL */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        {/* Nakit Akisim */}
        <div className="xl:col-span-7 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-800 text-xs">Nakit Akisim</h2>
              <div className="flex items-center gap-2 text-[9px]">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block rounded" /> Gelir</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block rounded" /> Gider</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block rounded" /> Net</span>
              </div>
            </div>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {([['7', '7G'], ['30', '30G'], ['ay', 'Bu Ay']] as [typeof nakit_period, string][]).map(([v, l]) => (
                <button key={v} onClick={() => setNakitPeriod(v)} className={`px-2 py-0.5 rounded-md text-[9px] font-medium transition-colors ${nakit_period === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="p-3 flex gap-3">
            <div className="flex-1 h-44"><Line data={nakitChartData} options={nakitOpts} /></div>
            <div className="w-28 flex flex-col gap-2 justify-center">
              <div className="bg-green-50 rounded-lg p-2">
                <div className="text-[9px] text-green-700 flex items-center gap-1"><TrendingUp size={9} className="rotate-180" /> Toplam Gelir</div>
                <div className="text-xs font-bold text-green-700">{fmt(nakitData.gelir.reduce((a, b) => a + b, 0))}</div>
              </div>
              <div className="bg-red-50 rounded-lg p-2">
                <div className="text-[9px] text-red-700 flex items-center gap-1"><TrendingUp size={9} /> Toplam Gider</div>
                <div className="text-xs font-bold text-red-700">{fmt(nakitData.gider.reduce((a, b) => a + b, 0))}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-2">
                <div className="text-[9px] text-blue-700 flex items-center gap-1"><Activity size={9} /> Net Nakit</div>
                <div className={`text-xs font-bold ${nakitData.net.reduce((a, b) => a + b, 0) >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmt(Math.abs(nakitData.net.reduce((a, b) => a + b, 0)))}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Yaklasan Odemelerim */}
        <div className="xl:col-span-5 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-xs">Yaklasan Odemelerim</h2>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {([
                ['tumu', `Tumu ${upcomingOdemeler.length}`],
                ['duzenli', `Duzenli ${duzenliCount}`],
                ['vadesi', `Vadesi Gelen ${vadesiCount}`],
              ] as [OdemelerTab, string][]).map(([t, l]) => (
                <button key={t} onClick={() => setOdemelerTab(t)} className={`px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${odemelerTab === t ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
            {filteredOdemeler.length === 0 ? (
              <div className="px-3 py-6 text-center text-gray-400 text-[10px]">Yaklasan odeme bulunamadi</div>
            ) : filteredOdemeler.map(o => (
              <div key={o.id} className="px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">{o.icon}</span>
                  <div>
                    <div className="text-[10px] font-medium text-gray-800">{o.name}</div>
                    <div className="text-[8px] text-gray-400">{o.tarih} · {o.alt}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] font-semibold text-red-600">{fmt(o.tutar)}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-semibold ${o.gun <= 3 ? 'bg-red-100 text-red-700' : o.gun <= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>{o.gun}g</span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 py-1.5 border-t border-gray-100 text-center">
            <button className="text-[10px] text-purple-600 hover:underline flex items-center gap-0.5 mx-auto">Tum Odemelerimi Goruntule <ChevronRight size={10} /></button>
          </div>
        </div>
      </div>

      {/* === MODALS === */}

      {/* Transfer */}
      <Modal isOpen={activeModal === 'transfer'} onClose={closeModal} title="Para Transferi (Havale/EFT)">
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-[11px] text-blue-700 flex items-center gap-2"><RefreshCw size={13} /> Hesaplar arasi para transferi gerceklestirir.</div>
          <div><label className={labelCls}>Kaynak Hesap</label>
            <select value={transferForm.kaynakId} onChange={e => setTransferForm(f => ({ ...f, kaynakId: e.target.value }))} className={selectCls}>
              <option value="">Kaynak secin...</option>
              {kasaBanka.map(k => <option key={k.id} value={k.id}>{k.ad} ({fmtN(k.bakiye)} ₺)</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Hedef Hesap</label>
            <select value={transferForm.hedefId} onChange={e => setTransferForm(f => ({ ...f, hedefId: e.target.value }))} className={selectCls}>
              <option value="">Hedef secin...</option>
              {kasaBanka.filter(k => k.id !== transferForm.kaynakId).map(k => <option key={k.id} value={k.id}>{k.ad} ({fmtN(k.bakiye)} ₺)</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Tutar (₺)</label><MoneyInput value={transferForm.tutar} onChange={v => setTransferForm(f => ({ ...f, tutar: v }))} className={inputCls} placeholder="0,00" /></div>
          <div><label className={labelCls}>Aciklama</label><input value={transferForm.aciklama} onChange={e => setTransferForm(f => ({ ...f, aciklama: e.target.value }))} className={inputCls} placeholder="Opsiyonel..." /></div>
          <div className="flex gap-2 pt-1">
            <button onClick={closeModal} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors">Iptal</button>
            <button onClick={handleTransfer} className="flex-1 py-2 text-white bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors">Transfer Yap</button>
          </div>
        </div>
      </Modal>

      {/* Kredi Karti Odeme */}
      <Modal isOpen={activeModal === 'krediOdeme'} onClose={closeModal} title="Kredi Karti Odemesi">
        <div className="space-y-3">
          <div><label className={labelCls}>Kredi Karti</label>
            <select value={krediOdemeForm.kartId} onChange={e => setKrediOdemeForm(f => ({ ...f, kartId: e.target.value }))} className={selectCls}>
              <option value="">Kart secin...</option>
              {krediKartlari.map(k => <option key={k.id} value={k.id}>{k.ad} (Borc: {fmtN(k.borc)} ₺)</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Odeme Yapilacak Hesap</label>
            <select value={krediOdemeForm.kaynakId} onChange={e => setKrediOdemeForm(f => ({ ...f, kaynakId: e.target.value }))} className={selectCls}>
              <option value="">Hesap secin...</option>
              {kasaBanka.map(k => <option key={k.id} value={k.id}>{k.ad} ({fmtN(k.bakiye)} ₺)</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Odeme Tutari (₺)</label><MoneyInput value={krediOdemeForm.tutar} onChange={v => setKrediOdemeForm(f => ({ ...f, tutar: v }))} className={inputCls} placeholder="0,00" /></div>
          <div className="flex gap-2 pt-1">
            <button onClick={closeModal} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors">Iptal</button>
            <button onClick={handleKrediOdeme} className="flex-1 py-2 text-white bg-red-500 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors">Odeme Yap</button>
          </div>
        </div>
      </Modal>

      {/* Fatura Odeme */}
      <Modal isOpen={activeModal === 'fatura'} onClose={closeModal} title="Fatura Odeme">
        <div className="space-y-3">
          <div><label className={labelCls}>Fatura Aciklamasi</label><input value={faturaForm.aciklama} onChange={e => setFaturaForm(f => ({ ...f, aciklama: e.target.value }))} className={inputCls} placeholder="Fatura adi/aciklamasi..." /></div>
          <div><label className={labelCls}>Tutar (₺)</label><MoneyInput value={faturaForm.tutar} onChange={v => setFaturaForm(f => ({ ...f, tutar: v }))} className={inputCls} placeholder="0,00" /></div>
          <div><label className={labelCls}>Odeme Hesabi</label>
            <select value={faturaForm.kaynakId} onChange={e => setFaturaForm(f => ({ ...f, kaynakId: e.target.value }))} className={selectCls}>
              <option value="">Hesap secin...</option>
              {kasaBanka.map(k => <option key={k.id} value={k.id}>{k.ad} ({fmtN(k.bakiye)} ₺)</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={closeModal} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors">Iptal</button>
            <button onClick={handleFaturaOdeme} className="flex-1 py-2 text-white bg-orange-500 hover:bg-orange-600 rounded-lg text-sm font-medium transition-colors">Ode</button>
          </div>
        </div>
      </Modal>

      {/* Para Yatir */}
      <Modal isOpen={activeModal === 'paraYatir'} onClose={closeModal} title="Para Yatir">
        <div className="space-y-3">
          <div><label className={labelCls}>Hedef Hesap</label>
            <select value={paraYatirForm.hedefId} onChange={e => setParaYatirForm(f => ({ ...f, hedefId: e.target.value }))} className={selectCls}>
              <option value="">Hesap secin...</option>
              {kasaBanka.map(k => <option key={k.id} value={k.id}>{k.ad} ({fmtN(k.bakiye)} ₺)</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Tutar (₺)</label><MoneyInput value={paraYatirForm.tutar} onChange={v => setParaYatirForm(f => ({ ...f, tutar: v }))} className={inputCls} placeholder="0,00" /></div>
          <div><label className={labelCls}>Aciklama</label><input value={paraYatirForm.aciklama} onChange={e => setParaYatirForm(f => ({ ...f, aciklama: e.target.value }))} className={inputCls} placeholder="Opsiyonel..." /></div>
          <div className="flex gap-2 pt-1">
            <button onClick={closeModal} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors">Iptal</button>
            <button onClick={handleParaYatir} className="flex-1 py-2 text-white bg-green-500 hover:bg-green-600 rounded-lg text-sm font-medium transition-colors">Yatir</button>
          </div>
        </div>
      </Modal>

      {/* Para Cek */}
      <Modal isOpen={activeModal === 'paraCek'} onClose={closeModal} title="Para Cek">
        <div className="space-y-3">
          <div><label className={labelCls}>Kaynak Hesap</label>
            <select value={paraCekForm.kaynakId} onChange={e => setParaCekForm(f => ({ ...f, kaynakId: e.target.value }))} className={selectCls}>
              <option value="">Hesap secin...</option>
              {kasaBanka.map(k => <option key={k.id} value={k.id}>{k.ad} ({fmtN(k.bakiye)} ₺)</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Tutar (₺)</label><MoneyInput value={paraCekForm.tutar} onChange={v => setParaCekForm(f => ({ ...f, tutar: v }))} className={inputCls} placeholder="0,00" /></div>
          <div><label className={labelCls}>Aciklama</label><input value={paraCekForm.aciklama} onChange={e => setParaCekForm(f => ({ ...f, aciklama: e.target.value }))} className={inputCls} placeholder="Opsiyonel..." /></div>
          <div className="flex gap-2 pt-1">
            <button onClick={closeModal} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors">Iptal</button>
            <button onClick={handleParaCek} className="flex-1 py-2 text-white bg-gray-700 hover:bg-gray-800 rounded-lg text-sm font-medium transition-colors">Cek</button>
          </div>
        </div>
      </Modal>

      {/* Doviz placeholder */}
      <Modal isOpen={activeModal === 'doviz'} onClose={closeModal} title="Doviz Al/Sat">
        <div className="py-8 text-center">
          <DollarSign size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">Yakin zamanda aktif olacak</p>
          <p className="text-gray-400 text-xs mt-1">Doviz islemleri modulu gelistirilmektedir.</p>
          <button onClick={closeModal} className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors">Kapat</button>
        </div>
      </Modal>

      {/* Cek placeholder */}
      <Modal isOpen={activeModal === 'cek'} onClose={closeModal} title="Cek Islemleri">
        <div className="py-8 text-center">
          <FileText size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">Yakin zamanda aktif olacak</p>
          <p className="text-gray-400 text-xs mt-1">Cek islemleri modulu gelistirilmektedir.</p>
          <button onClick={closeModal} className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors">Kapat</button>
        </div>
      </Modal>

      {/* Hesap Ekle Menu */}
      <Modal isOpen={activeModal === 'hesapEkleMenu'} onClose={closeModal} title="Yeni Hesap Ekle">
        <div className="space-y-2">
          {[
            { icon: <Wallet size={18} className="text-orange-500" />, label: 'Kasa veya Banka Hesabi', sub: 'Nakit kasa veya banka hesabi ekle', bg: 'bg-orange-50', onClick: () => { setEditKasaTarget(null); setAccountForm(emptyAccountForm()); openModal('hesapEkle'); } },
            { icon: <CreditCard size={18} className="text-red-500" />, label: 'Kredi Karti', sub: 'Yeni kredi karti ekle', bg: 'bg-red-50', onClick: () => { setEditKrediTarget(null); setKrediForm(emptyKrediForm()); openModal('krediEkle'); } },
            { icon: <PiggyBank size={18} className="text-purple-500" />, label: 'Birikim Hesabi', sub: 'Vadeli veya doviz birikim hesabi', bg: 'bg-purple-50', onClick: () => { setEditBirikimTarget(null); setBirikimForm(emptyBirikimForm()); openModal('editBirikim'); } },
          ].map(item => (
            <button key={item.label} onClick={item.onClick} className={`w-full flex items-center gap-3 p-3 ${item.bg} rounded-xl hover:opacity-90 transition-opacity text-left`}>
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">{item.icon}</div>
              <div><div className="text-sm font-semibold text-gray-800">{item.label}</div><div className="text-[11px] text-gray-500">{item.sub}</div></div>
              <ChevronRight size={14} className="text-gray-400 ml-auto flex-shrink-0" />
            </button>
          ))}
          <button onClick={closeModal} className="w-full py-2 text-gray-500 text-sm hover:bg-gray-50 rounded-lg transition-colors mt-1">Iptal</button>
        </div>
      </Modal>

      {/* Hesap Ekle/Duzenle (kasa/banka) */}
      <Modal isOpen={activeModal === 'hesapEkle'} onClose={closeModal} title={editKasaTarget ? 'Hesabi Duzenle' : 'Kasa / Banka Hesabi Ekle'}>
        <div className="space-y-3">
          <div><label className={labelCls}>Hesap Adi</label><input value={accountForm.ad} onChange={e => setAccountForm(f => ({ ...f, ad: e.target.value }))} className={inputCls} placeholder="Ornek: Garanti Bankasi" /></div>
          <div>
            <label className={labelCls}>Tip</label>
            <div className="flex gap-2">
              {(['kasa', 'banka'] as const).map(t => (
                <button key={t} type="button" onClick={() => setAccountForm(f => ({ ...f, tip: t }))} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${accountForm.tip === t ? t === 'kasa' ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {t === 'kasa' ? 'Kasa' : 'Banka'}
                </button>
              ))}
            </div>
          </div>
          <div><label className={labelCls}>Para Cinsi</label>
            <select value={accountForm.paraCinsi} onChange={e => setAccountForm(f => ({ ...f, paraCinsi: e.target.value }))} className={selectCls}>
              {paraCinsleri.map(p => <option key={p.value} value={p.value}>{p.label} ({p.symbol})</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Bakiye</label><MoneyInput value={accountForm.bakiye} onChange={v => setAccountForm(f => ({ ...f, bakiye: v }))} className={inputCls} placeholder="0,00" /></div>
          <div><label className={labelCls}>IBAN (opsiyonel)</label><input value={accountForm.iban} onChange={e => setAccountForm(f => ({ ...f, iban: e.target.value }))} className={inputCls} placeholder="TR00 0000 0000 0000 0000 0000 00" /></div>
          <div className="flex gap-2 pt-1">
            <button onClick={closeModal} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors">Iptal</button>
            <button onClick={saveHesap} className="flex-1 py-2 text-white bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-medium transition-colors">Kaydet</button>
          </div>
        </div>
      </Modal>

      {/* Kredi Karti Ekle/Duzenle */}
      <Modal isOpen={activeModal === 'krediEkle'} onClose={closeModal} title={editKrediTarget ? 'Kredi Kartini Duzenle' : 'Kredi Karti Ekle'}>
        <div className="space-y-3">
          <div><label className={labelCls}>Kart Adi</label><input value={krediForm.ad} onChange={e => setKrediForm(f => ({ ...f, ad: e.target.value }))} className={inputCls} placeholder="Ornek: Garanti Bonus" /></div>
          <div><label className={labelCls}>Limit (₺)</label><MoneyInput value={krediForm.limit} onChange={v => setKrediForm(f => ({ ...f, limit: v }))} className={inputCls} placeholder="0,00" /></div>
          <div><label className={labelCls}>Kart No (son 4 hane)</label><input value={krediForm.kartNo} onChange={e => setKrediForm(f => ({ ...f, kartNo: e.target.value }))} className={inputCls} placeholder="1234" maxLength={4} /></div>
          <div><label className={labelCls}>Son Odeme Tarihi</label><input type="date" value={krediForm.sonOdemeTarihi} onChange={e => setKrediForm(f => ({ ...f, sonOdemeTarihi: e.target.value }))} className={inputCls} /></div>
          <div className="flex gap-2 pt-1">
            <button onClick={closeModal} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors">Iptal</button>
            <button onClick={saveKredi} className="flex-1 py-2 text-white bg-red-500 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors">Kaydet</button>
          </div>
        </div>
      </Modal>

      {/* Birikim Hesabi Ekle/Duzenle */}
      <Modal isOpen={activeModal === 'editBirikim'} onClose={closeModal} title={editBirikimTarget ? 'Birikim Hesabini Duzenle' : 'Birikim Hesabi Ekle'}>
        <div className="space-y-3">
          <div><label className={labelCls}>Hesap Adi</label><input value={birikimForm.ad} onChange={e => setBirikimForm(f => ({ ...f, ad: e.target.value }))} className={inputCls} placeholder="Ornek: Vadeli Hesap" /></div>
          <div><label className={labelCls}>Para Cinsi</label>
            <select value={birikimForm.paraCinsi} onChange={e => setBirikimForm(f => ({ ...f, paraCinsi: e.target.value }))} className={selectCls}>
              {paraCinsleri.map(p => <option key={p.value} value={p.value}>{p.label} ({p.symbol})</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Bakiye</label><MoneyInput value={birikimForm.bakiye} onChange={v => setBirikimForm(f => ({ ...f, bakiye: v }))} className={inputCls} placeholder="0,00" /></div>
          <div><label className={labelCls}>IBAN (opsiyonel)</label><input value={birikimForm.iban} onChange={e => setBirikimForm(f => ({ ...f, iban: e.target.value }))} className={inputCls} placeholder="TR00 0000 0000 0000 0000 0000 00" /></div>
          <div className="flex gap-2 pt-1">
            <button onClick={closeModal} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors">Iptal</button>
            <button onClick={saveBirikim} className="flex-1 py-2 text-white bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-medium transition-colors">Kaydet</button>
          </div>
        </div>
      </Modal>

      {/* Kredi Kartindan Harcama */}
      <Modal isOpen={activeModal === 'krediHarcama'} onClose={closeModal} title="Kredi Kartindan Harcama">
        <div className="space-y-3">
          <div><label className={labelCls}>Kredi Karti</label>
            <select value={krediHarcamaForm.kartId} onChange={e => setKrediHarcamaForm(f => ({ ...f, kartId: e.target.value }))} className={selectCls}>
              <option value="">Kart secin...</option>
              {krediKartlari.map(k => <option key={k.id} value={k.id}>{k.ad} (Kullanilabilir: {fmtN(k.limit - k.borc)} ₺)</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Tutar (₺)</label><MoneyInput value={krediHarcamaForm.tutar} onChange={v => setKrediHarcamaForm(f => ({ ...f, tutar: v }))} className={inputCls} placeholder="0,00" /></div>
          <div><label className={labelCls}>Aciklama</label><input value={krediHarcamaForm.aciklama} onChange={e => setKrediHarcamaForm(f => ({ ...f, aciklama: e.target.value }))} className={inputCls} placeholder="Harcama aciklamasi..." /></div>
          <div><label className={labelCls}>Kategori</label>
            <select value={krediHarcamaForm.kategori} onChange={e => setKrediHarcamaForm(f => ({ ...f, kategori: e.target.value }))} className={selectCls}>
              {['Alisveris', 'Yemek', 'Ulasim', 'Fatura', 'Eglence', 'Saglik', 'Diger'].map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={closeModal} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors">Iptal</button>
            <button onClick={handleKrediHarcama} className="flex-1 py-2 text-white bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-medium transition-colors">Harca</button>
          </div>
        </div>
      </Modal>

      {/* BORC OZETI */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h2 className="text-xs font-semibold text-gray-800 mb-3">Borc Durumu Ozeti</h2>
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-[9px] text-red-600 font-medium">Cari Hesap Borclari</p>
            <p className="text-base font-bold text-red-700">₺{cariHesaplar.filter(c => c.bakiye > 0).reduce((s,c) => s + c.bakiye, 0).toLocaleString('tr-TR')}</p>
            <p className="text-[8px] text-red-500">{cariHesaplar.filter(c => c.bakiye > 0).length} cari</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-3">
            <p className="text-[9px] text-orange-600 font-medium">Cek Borclari</p>
            <p className="text-base font-bold text-orange-700">₺{cekler.filter(c => c.tip === 'borc' && c.durum === 'bekleyen').reduce((s,c) => s + c.tutar, 0).toLocaleString('tr-TR')}</p>
            <p className="text-[8px] text-orange-500">{cekler.filter(c => c.tip === 'borc' && c.durum === 'bekleyen').length} cek</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <p className="text-[9px] text-purple-600 font-medium">Kredi Karti Borclari</p>
            <p className="text-base font-bold text-purple-700">₺{krediKartlari.reduce((s,k) => s + k.borc, 0).toLocaleString('tr-TR')}</p>
            <p className="text-[8px] text-purple-500">{krediKartlari.length} kart</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-[9px] text-blue-600 font-medium">Emanet Borclari</p>
            <p className="text-base font-bold text-blue-700">₺{(emanetParalar || []).filter((e: any) => e.durum === 'aktif').reduce((s: number, e: any) => s + e.tutar, 0).toLocaleString('tr-TR')}</p>
            <p className="text-[8px] text-blue-500">{(emanetParalar || []).filter((e: any) => e.durum === 'aktif').length} kisi</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-[9px] text-gray-300 font-medium">TOPLAM BORC</p>
            <p className="text-base font-bold text-white">₺{(cariHesaplar.filter(c => c.bakiye > 0).reduce((s,c) => s + c.bakiye, 0) + cekler.filter(c => c.tip === 'borc' && c.durum === 'bekleyen').reduce((s,c) => s + c.tutar, 0) + krediKartlari.reduce((s,k) => s + k.borc, 0) + (emanetParalar || []).filter((e: any) => e.durum === 'aktif').reduce((s: number, e: any) => s + e.tutar, 0)).toLocaleString('tr-TR')}</p>
          </div>
        </div>
      </div>

      {/* Confirm Delete */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Hesabi Sil"
        message="Bu hesabi silmek istediginizden emin misiniz? Bu islem geri alinamaz."
      />
    </div>
  );
}
