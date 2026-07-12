import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, X, Phone, Mail, Eye, ChevronRight, Download, SlidersHorizontal, Users, ShieldCheck, TrendingUp, Star, GitMerge, AlertTriangle, RefreshCw, MessageCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useUrlState } from '../lib/useUrlState';
import { useStore } from '../context/StoreContext';
import { openChat } from '../components/ChatDock';
import { DetailModal } from './Siparislerim';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const initials = (ad: string) => (ad || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const VIP_ESIK = 15000;

export default function Musterilerim() {
  const { customers, orders, reload, storeSetting, products, categories, discountCodes, campaigns } = useStore();
  const nav = useNavigate();
  // Sayfa açıldığında en güncel müşteri listesini çek (yeni üyelikler hemen görünsün)
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const [search, setSearch] = useUrlState('q', '');
  const [page, setPage] = useUrlState('page', 1);
  // Arama debounce: input anlik, agir filtre + URL yazimi 300ms sonra -> her tusta full re-render olmaz
  const [qInput, setQInput] = useState(search);
  const qDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setQInput(search); }, [search]);
  const onSearchChange = (v: string) => { setQInput(v); if (qDebounceRef.current) clearTimeout(qDebounceRef.current); qDebounceRef.current = setTimeout(() => { setSearch(v); setPage(1); }, 300); };
  const clearSearch = () => { if (qDebounceRef.current) clearTimeout(qDebounceRef.current); setQInput(''); setSearch(''); setPage(1); };
  const [fDurum, setFDurum] = useUrlState('durum', 'all');
  const [fRisk, setFRisk] = useUrlState('risk', 'all');
  const [fAralik, setFAralik] = useUrlState('aralik', 'all');
  const [sort, setSort] = useUrlState('sort', 'yeni');
  const [perPage, setPerPage] = useUrlState('per', 10);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState({ ad: '', telefon: '', email: '', instagram: '', cinsiyet: '', adres: '', not: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Mükerrer müşteriler
  const [view, setView] = useUrlState<'liste' | 'mukerrer' | 'bakiye' | 'bakiyeli'>('tab', 'liste');
  const [ledgerData, setLedgerData] = useState<any>(null);
  const [lgTip, setLgTip] = useUrlState('ltip', ''); const [lgSearch, setLgSearch] = useUrlState('lq', ''); const [lgFrom, setLgFrom] = useUrlState('lfrom', ''); const [lgTo, setLgTo] = useUrlState('lto', '');
  const [lgDurum, setLgDurum] = useUrlState('ldurum', ''); const [lgTab, setLgTab] = useUrlState<'tumu' | 'yukleme' | 'harcama'>('ltab', 'tumu');
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const loadLedger = async () => { try { const { data } = await api.get('/store/customers-ledger'); setLedgerData(data); } catch { /* */ } };
  const [dups, setDups] = useState<{ telefonGruplari: any[]; instagramGruplari: any[] } | null>(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState('');

  const loadDups = async () => {
    setDupLoading(true);
    try {
      const { data } = await api.get('/store/customers/duplicates');
      setDups(data);
      const p: Record<string, string> = {};
      for (const g of data.telefonGruplari || []) p['tel:' + g.telKey] = g.uyeler[0]?.id;
      for (const g of data.instagramGruplari || []) p['ig:' + g.igKey] = g.uyeler[0]?.id;
      setPicks(p);
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setDupLoading(false); }
  };
  useEffect(() => { if (view === 'mukerrer' && !dups) loadDups(); if (view === 'bakiye' || view === 'bakiyeli') loadLedger(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view]);

  const mergeGroup = async (g: any, pkey: string) => {
    const keepId = picks[pkey] || g.uyeler[0]?.id;
    const mergeIds = g.uyeler.map((u: any) => u.id).filter((id: string) => id !== keepId);
    if (!mergeIds.length) { toast.error('Ana kayıt dışında birleştirilecek kayıt yok'); return; }
    if (!confirm(`${mergeIds.length} kayıt ana kayda taşınıp silinecek. Onaylıyor musunuz?`)) return;
    setMerging(pkey);
    try {
      await api.post('/store/customers/merge', { keepId, mergeIds });
      toast.success('Müşteriler birleştirildi');
      await loadDups(); reload();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setMerging(''); }
  };

  // Müşteri başına istatistik
  const stats = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of customers) m.set(c.id, { ciro: 0, siparis: 0, iptal: 0, toplamSiparis: 0, sonTarih: '' });
    for (const o of orders) {
      const s = m.get(o.customerId); if (!s) continue;
      s.toplamSiparis += 1;
      if (o.durum === 'iptal') s.iptal += 1;
      else if (o.durum !== 'sepet') { s.ciro += o.toplam || 0; s.siparis += 1; }
      if (!s.sonTarih || o.createdAt > s.sonTarih) s.sonTarih = o.createdAt;
    }
    for (const [, s] of m) {
      s.iadeOrani = s.toplamSiparis ? (s.iptal / s.toplamSiparis) * 100 : 0;
      s.risk = s.iadeOrani > 30 ? 'yuksek' : s.iadeOrani > 12 ? 'orta' : 'dusuk';
      s.aktif = s.siparis > 0;
      s.vip = s.ciro >= VIP_ESIK;
    }
    return m;
  }, [customers, orders]);

  const now = Date.now();
  const isYeni = (c: any) => (now - new Date(c.createdAt).getTime()) < 30 * 86400000;

  const kpi = useMemo(() => {
    const toplam = customers.length;
    let aktif = 0, vip = 0, yeni = 0;
    for (const c of customers) {
      const s = stats.get(c.id);
      if (s?.aktif) aktif += 1;
      if (s?.vip) vip += 1;
      if (isYeni(c)) yeni += 1;
    }
    return { toplam, aktif, vip, yeni, aktifPct: toplam ? (aktif / toplam) * 100 : 0, yeniPct: toplam ? (yeni / toplam) * 100 : 0 };
  }, [customers, stats]);

  const RISK = { dusuk: { t: 'Düşük Risk', c: 'bg-green-100 text-green-700' }, orta: { t: 'Orta Risk', c: 'bg-amber-100 text-amber-700' }, yuksek: { t: 'Yüksek Risk', c: 'bg-red-100 text-red-700' } } as any;

  const filtered = useMemo(() => {
    let list = customers.map((c) => ({ c, s: stats.get(c.id) || {} }));
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(({ c }) => [c.ad, c.telefon, c.email, c.instagram].some((f) => (f || '').toLowerCase().includes(q))); }
    if (fDurum !== 'all') list = list.filter(({ s }) => fDurum === 'aktif' ? s.aktif : !s.aktif);
    if (fRisk !== 'all') list = list.filter(({ s }) => s.risk === fRisk);
    if (fAralik !== 'all') list = list.filter(({ s }) => { const v = s.ciro || 0; if (fAralik === 'a') return v < 1000; if (fAralik === 'b') return v >= 1000 && v < 5000; if (fAralik === 'c') return v >= 5000 && v < 15000; return v >= 15000; });
    list.sort((a, b) => {
      if (sort === 'yeni') return new Date(b.c.createdAt).getTime() - new Date(a.c.createdAt).getTime();
      if (sort === 'eski') return new Date(a.c.createdAt).getTime() - new Date(b.c.createdAt).getTime();
      if (sort === 'harcama') return (b.s.ciro || 0) - (a.s.ciro || 0);
      return (a.c.ad || '').localeCompare(b.c.ad || '', 'tr');
    });
    return list;
  }, [customers, stats, search, fDurum, fRisk, fAralik, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);
  const from = filtered.length ? (page - 1) * perPage + 1 : 0;
  const to = Math.min(page * perPage, filtered.length);

  const open = (c?: any) => { setEdit(c || null); setForm(c ? { ad: c.ad, telefon: c.telefon || '', email: c.email || '', instagram: c.instagram || '', cinsiyet: c.cinsiyet || '', adres: c.adres || '', not: c.not || '' } : { ad: '', telefon: '', email: '', instagram: '', cinsiyet: '', adres: '', not: '' }); setModal(true); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ad.trim()) { toast.error('Ad zorunlu'); return; }
    try { if (edit) await api.patch(`/store/customers/${edit.id}`, form); else await api.post('/store/customers', form); toast.success('Kaydedildi'); setModal(false); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (id: string) => { if (!confirm('Müşteri silinsin mi?')) return; try { await api.delete(`/store/customers/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  const raporIndir = () => {
    const rows = filtered.map(({ c, s }) => ({
      'Müşteri': c.ad, 'Kullanıcı Adı': c.instagram || '', 'Cinsiyet': c.cinsiyet || '', 'Telefon': c.telefon || '', 'E-posta': c.email || '',
      'Toplam Alışveriş': s.ciro || 0, 'Sipariş': s.siparis || 0, 'İade Oranı %': Number((s.iadeOrani || 0).toFixed(1)),
      'Bakiye': c.bakiye || 0, 'Risk Grubu': RISK[s.risk || 'dusuk']?.t || '', 'Son Alışveriş': s.sonTarih ? new Date(s.sonTarih).toLocaleString('tr-TR') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Müşteriler'); XLSX.writeFile(wb, 'musteriler.xlsx');
  };

  const pages = useMemo(() => {
    const arr: (number | string)[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) arr.push(i); return arr; }
    arr.push(1, 2, 3, 4, 5, '...', totalPages);
    return arr;
  }, [totalPages]);

  return (
    <div className="space-y-5">
      {/* Başlık + KPI */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Müşterilerim</h1>
          <p className="text-sm text-slate-400">Tüm müşterilerinizi görüntüleyin ve detaylarını inceleyin.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <KpiCard icon={Users} iconCls="bg-emerald-100 text-emerald-600" label="Toplam Müşteri" value={kpi.toplam.toLocaleString('tr-TR')} />
          <KpiCard icon={ShieldCheck} iconCls="bg-green-100 text-green-600" label="Aktif Müşteri" value={kpi.aktif.toLocaleString('tr-TR')} extra={`%${kpi.aktifPct.toFixed(1)}`} />
          <KpiCard icon={TrendingUp} iconCls="bg-sky-100 text-sky-600" label="Yeni Müşteri (30 Gün)" value={kpi.yeni.toLocaleString('tr-TR')} extra={`%${kpi.yeniPct.toFixed(1)}`} />
          <KpiCard icon={Star} iconCls="bg-amber-100 text-amber-600" label="VIP Müşteri" value={kpi.vip.toLocaleString('tr-TR')} />
          <KpiCard icon={TrendingUp} iconCls="bg-violet-100 text-violet-600" label="Toplam Bakiye" value={'₺' + customers.reduce((s, c) => s + (Number((c as any).bakiye) || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} />
          <button onClick={raporIndir} className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50"><Download size={16} /> Raporu İndir</button>
          <button onClick={() => open()} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700"><Plus size={16} /> Yeni Müşteri</button>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex items-center gap-2">
        <button onClick={() => setView('liste')} className={`px-4 py-2 text-sm rounded-xl font-medium ${view === 'liste' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Müşteri Listesi</button>
        <button onClick={() => setView('mukerrer')} className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl font-medium ${view === 'mukerrer' ? 'bg-amber-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}><GitMerge size={15} /> Mükerrer Müşteriler{dups ? ` (${dups.telefonGruplari.length + dups.instagramGruplari.length})` : ''}</button>
        <button onClick={() => setView('bakiye')} className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl font-medium ${view === 'bakiye' ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}><TrendingUp size={15} /> Bakiye Hareketleri</button>
        <button onClick={() => setView('bakiyeli')} className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl font-medium ${view === 'bakiyeli' ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Users size={15} /> Bakiyesi Olan Müşteriler{ledgerData ? ` (${ledgerData.bakiyeliMusteriler.length})` : ''}</button>
        {view === 'mukerrer' && <button onClick={loadDups} disabled={dupLoading} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14} className={dupLoading ? 'animate-spin' : ''} /> Yenile</button>}
      </div>

      {view === 'mukerrer' && (
        <MukerrerView dups={dups} loading={dupLoading} picks={picks} setPicks={setPicks} merging={merging} mergeGroup={mergeGroup} />
      )}

      {view === 'bakiye' && (() => {
        const d = ledgerData || {};
        const filtered = (d.rows || []).filter((l: any) => {
          if (lgTab === 'yukleme' && !(l.tip === 'yukleme' || l.tip === 'iade')) return false;
          if (lgTab === 'harcama' && l.tip !== 'harcama') return false;
          if (lgTip && l.tip !== lgTip) return false;
          if (lgDurum && l.durum !== lgDurum) return false;
          if (lgSearch) { const s = lgSearch.toLowerCase().replace(/^@/, ''); if (![l.customerAd, l.instagram, l.sipNo, l.aciklama].some((x: any) => String(x || '').toLowerCase().replace(/^@/, '').includes(s))) return false; }
          const t = new Date(l.createdAt).getTime();
          if (lgFrom && t < new Date(lgFrom + 'T00:00:00').getTime()) return false;
          if (lgTo && t > new Date(lgTo + 'T23:59:59').getTime()) return false;
          return true;
        });
        const cnt = { tumu: (d.rows || []).length, yukleme: (d.rows || []).filter((l: any) => l.tip === 'yukleme' || l.tip === 'iade').length, harcama: (d.rows || []).filter((l: any) => l.tip === 'harcama').length };
        const money = (n: number) => '₺' + (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (
        <div className="space-y-4">
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <LgKpi icon={TrendingUp} cls="bg-emerald-100 text-emerald-600" label="Toplam Bakiye" value={money(d.toplamBakiye || 0)} sub="Tüm müşteriler" />
            <LgKpi icon={Download} cls="bg-sky-100 text-sky-600" label="Toplam Bakiye Eklendi" value={money(d.toplamEklenen || 0)} sub="Toplam" />
            <LgKpi icon={TrendingUp} cls="bg-rose-100 text-rose-600" label="Toplam Bakiyeden Ödendi" value={money(d.toplamOdenen || 0)} sub="Toplam" />
            <LgKpi icon={Users} cls="bg-violet-100 text-violet-600" label="İşlem Sayısı" value={(d.islemSayisi || 0).toLocaleString('tr-TR')} sub="Kayıt" />
            <LgKpi icon={ShieldCheck} cls="bg-amber-100 text-amber-600" label="Aktif Müşteri" value={(d.aktifMusteri || 0).toLocaleString('tr-TR')} sub="Hareket gören" />
          </div>
          {/* Filtreler */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" /><input value={lgSearch} onChange={(e) => setLgSearch(e.target.value)} placeholder="Müşteri, kullanıcı adı, sepet no, açıklama ara..." className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm" /></div>
            <select value={lgTip} onChange={(e) => setLgTip(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-sm"><option value="">Tüm İşlemler</option><option value="yukleme">Bakiye Tanımlandı</option><option value="harcama">Bakiyeden Ödendi</option><option value="iade">İade</option></select>
            <select value={lgDurum} onChange={(e) => setLgDurum(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-sm"><option value="">Tüm Durumlar</option><option value="tamamlandi">Tamamlandı</option><option value="bekleyen">Bekleyen</option></select>
            <input type="date" value={lgFrom} onChange={(e) => setLgFrom(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-sm" />
            <input type="date" value={lgTo} onChange={(e) => setLgTo(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-sm" />
            <button onClick={() => { setLgSearch(''); setLgTip(''); setLgDurum(''); setLgFrom(''); setLgTo(''); }} className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"><RefreshCw size={14} /> Filtreleri Temizle</button>
          </div>
          {/* Alt sekmeler + tablo */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex gap-2 p-3 border-b border-slate-100">
              {([['tumu', 'Tümü', cnt.tumu], ['yukleme', 'Bakiye Eklendi', cnt.yukleme], ['harcama', 'Bakiyeden Ödendi', cnt.harcama]] as const).map(([k, t, n]) => (
                <button key={k} onClick={() => setLgTab(k as any)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg ${lgTab === k ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{t} <span className={`text-[11px] px-1.5 rounded-full ${lgTab === k ? 'bg-white/25' : 'bg-slate-100'}`}>{n}</span></button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] text-slate-400 uppercase border-b border-slate-100"><th className="px-4 py-2.5">Tarih</th><th className="px-3 py-2.5">Müşteri</th><th className="px-3 py-2.5">İşlem Türü</th><th className="px-3 py-2.5">Açıklama</th><th className="px-3 py-2.5">Sepet No</th><th className="px-3 py-2.5 text-right">Tutar</th><th className="px-3 py-2.5 text-right">Bakiye Sonucu</th><th className="px-3 py-2.5">İşlemi Yapan</th><th className="px-3 py-2.5">Durum</th><th className="px-3 py-2.5 text-right">İşlem</th></tr></thead>
                <tbody>
                  {filtered.map((l: any) => (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">{new Date(l.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-1.5"><span className="text-slate-800 font-medium">{l.customerAd}</span>{l.telefon && <button onClick={() => openChat(String(l.telefon).replace(/\D/g, ''), l.customerAd)} title="WhatsApp Sohbet" className="p-1 rounded hover:bg-green-50 text-green-600"><MessageCircle size={14} /></button>}</div>{l.instagram && <p className="text-[11px] text-pink-600">@{String(l.instagram).replace(/^@/, '')}</p>}</td>
                      <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${l.tip === 'harcama' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{l.tip === 'harcama' ? '↑ Bakiyeden Ödendi' : l.tip === 'iade' ? '↓ İade' : '↓ Bakiye Eklendi'}</span></td>
                      <td className="px-3 py-2.5 text-slate-500 max-w-[200px] truncate">{l.aciklama || '-'}</td>
                      <td className="px-3 py-2.5">{l.sipNo ? <button onClick={() => { const o = orders.find((x: any) => x.id === l.orderId || x.sipNo === l.sipNo); if (o) setDetailOrder(o); else toast('Sepet bulunamadı'); }} className="font-mono text-xs text-emerald-700 hover:underline">#{l.sipNo}{l.urunAdet ? <span className="block text-[10px] text-slate-400">{l.urunAdet} ürün</span> : null}</button> : <span className="text-slate-300">-</span>}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${l.tip === 'harcama' ? 'text-red-500' : 'text-green-600'}`}>{l.tip === 'harcama' ? '-' : '+'}{money(l.tutar)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{l.bakiyeSonucu != null ? money(l.bakiyeSonucu) : '-'}</td>
                      <td className="px-3 py-2.5 text-slate-600 text-xs">{l.kullanici || <span className="text-slate-400">Sistem</span>}</td>
                      <td className="px-3 py-2.5"><span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${l.durum === 'bekleyen' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{l.durum === 'bekleyen' ? 'Bekleyen' : 'Tamamlandı'}</span></td>
                      <td className="px-3 py-2.5 text-right">{l.orderId ? <button onClick={() => { const o = orders.find((x: any) => x.id === l.orderId || x.sipNo === l.sipNo); if (o) setDetailOrder(o); }} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><Eye size={13} /> Detay</button> : <span className="text-slate-300 text-xs">-</span>}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">Kayıt yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        );
      })()}

      {view === 'bakiyeli' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100"><p className="font-semibold text-slate-800">Bakiyesi Olan Müşteriler</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] text-slate-400 uppercase border-b border-slate-100"><th className="px-4 py-2.5">Müşteri</th><th className="px-3 py-2.5">Kullanıcı Adı</th><th className="px-3 py-2.5">Telefon</th><th className="px-3 py-2.5 text-right">Bakiye</th></tr></thead>
              <tbody>
                {(ledgerData?.bakiyeliMusteriler || []).map((c: any) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5"><div className="flex items-center gap-1.5"><button onClick={() => nav(`/musterilerim/${c.id}`)} className="text-slate-800 hover:underline">{c.ad}</button>{c.telefon && <button onClick={() => openChat(String(c.telefon).replace(/\D/g, ''), c.ad)} title="WhatsApp Sohbet" className="p-1 rounded hover:bg-green-50 text-green-600"><MessageCircle size={14} /></button>}</div></td>
                    <td className="px-3 py-2.5 text-pink-600">{c.instagram ? '@' + String(c.instagram).replace(/^@/, '') : '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{c.telefon || '-'}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${(Number(c.bakiye) || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>₺{(Number(c.bakiye) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {(!ledgerData || ledgerData.bakiyeliMusteriler.length === 0) && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Bakiyesi olan müşteri yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailOrder && <DetailModal order={detailOrder} customer={customers.find((c) => c.id === detailOrder.customerId)} custName={detailOrder.customer?.ad || detailOrder.musteriHandle || ''} custPhone={detailOrder.customer?.telefon || ''} products={products} categories={categories} discountCodes={discountCodes} campaigns={campaigns} storeSetting={storeSetting} onClose={() => setDetailOrder(null)} reload={reload} />}

      {view === 'liste' && <>
      {/* Filtre barı */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <input value={qInput} onChange={(e) => onSearchChange(e.target.value)} placeholder="Müşteri adı, kullanıcı adı veya telefon ara..." className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
        </div>
        <Sel label="Durum" value={fDurum} onChange={(v) => { setFDurum(v); setPage(1); }} options={[['all', 'Tümü'], ['aktif', 'Aktif'], ['pasif', 'Pasif']]} />
        <Sel label="Risk Grubu" value={fRisk} onChange={(v) => { setFRisk(v); setPage(1); }} options={[['all', 'Tümü'], ['dusuk', 'Düşük Risk'], ['orta', 'Orta Risk'], ['yuksek', 'Yüksek Risk']]} />
        <Sel label="Alışveriş Aralığı" value={fAralik} onChange={(v) => { setFAralik(v); setPage(1); }} options={[['all', 'Tümü'], ['a', '0 - 1.000₺'], ['b', '1.000 - 5.000₺'], ['c', '5.000 - 15.000₺'], ['d', '15.000₺ +']]} />
        <Sel label="Sırala" value={sort} onChange={setSort} options={[['yeni', 'En Yeni'], ['eski', 'En Eski'], ['harcama', 'En Çok Harcayan'], ['ad', 'Ada Göre']]} />
        <button onClick={() => { clearSearch(); setFDurum('all'); setFRisk('all'); setFAralik('all'); setSort('yeni'); setPage(1); }} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50 self-end"><SlidersHorizontal size={15} /> Sıfırla</button>
      </div>

      {storeSetting?.slug && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap text-sm">
          <span className="text-slate-600">Üyelik formu linki:</span>
          <a href={`/uye/${storeSetting.slug}`} target="_blank" className="text-emerald-700 underline break-all">{window.location.origin}/uye/{storeSetting.slug}</a>
          <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/uye/${storeSetting.slug}`); toast.success('Kopyalandı'); }} className="ml-auto text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg">Kopyala</button>
        </div>
      )}

      {/* Tablo */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="text-slate-400 text-left text-xs uppercase border-b border-slate-100">
            <tr>
              <th className="px-5 py-4">Müşteri</th><th className="px-5 py-4">İletişim</th><th className="px-5 py-4">Alışveriş Özeti</th>
              <th className="px-5 py-4">Bakiye</th><th className="px-5 py-4">Risk Grubu</th><th className="px-5 py-4">Son Alışveriş</th><th className="px-5 py-4 text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(({ c, s }) => {
              const bakiye = c.bakiye || 0;
              const bakLabel = bakiye > 0 ? 'Alacak' : bakiye < 0 ? 'Borç' : 'Borç yok';
              const bakCls = bakiye > 0 ? 'text-green-600' : bakiye < 0 ? 'text-red-500' : 'text-slate-400';
              const risk = RISK[s.risk || 'dusuk'];
              return (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold shrink-0">{initials(c.ad)}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-slate-800 truncate">{c.ad}</p>
                          {s.vip && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">VIP</span>}
                          {isYeni(c) && <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-bold">Yeni</span>}
                          {c.cinsiyet && <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${c.cinsiyet === 'Kadın' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>{c.cinsiyet}</span>}
                        </div>
                        {c.instagram && <p className="text-xs text-slate-400 truncate">{String(c.instagram).replace(/^@/, '')}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {c.telefon && <div className="flex items-center gap-1.5 text-xs"><Phone size={12} className="text-slate-400" /> {c.telefon}</div>}
                    {c.email && <div className="flex items-center gap-1.5 text-xs mt-0.5"><Mail size={12} className="text-slate-400" /> {c.email}</div>}
                    {!c.telefon && !c.email && <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-6">
                      <div><p className="text-[10px] text-slate-400">Toplam</p><p className="font-semibold text-slate-800">{fmt(s.ciro || 0)}</p></div>
                      <div><p className="text-[10px] text-slate-400">Sipariş</p><p className="font-medium text-slate-700">{s.siparis || 0}</p></div>
                      <div><p className="text-[10px] text-slate-400">İade Oranı</p><p className="font-medium text-slate-700">%{(s.iadeOrani || 0).toFixed(1)}</p></div>
                    </div>
                  </td>
                  <td className="px-5 py-4"><p className={`font-semibold ${bakCls}`}>{fmt(bakiye)}</p><p className="text-[10px] text-slate-400">{bakLabel}</p></td>
                  <td className="px-5 py-4"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${risk.c}`}>{risk.t}</span></td>
                  <td className="px-5 py-4 text-slate-500 text-xs">{s.sonTarih ? <>{new Date(s.sonTarih).toLocaleDateString('tr-TR')}<br /><span className="text-slate-400">{new Date(s.sonTarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></> : '—'}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => open(c)} title="Düzenle" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-100"><Pencil size={14} /></button>
                      <button onClick={() => nav(`/musterilerim/${c.id}`)} title="Hesap Dökümü" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"><Eye size={15} /></button>
                      <button onClick={() => nav(`/musterilerim/${c.id}`)} className="w-8 h-8 rounded-lg border border-emerald-200 flex items-center justify-center text-emerald-600 hover:bg-emerald-50"><ChevronRight size={16} /></button>
                      <button onClick={() => del(c.id)} title="Sil" className="w-8 h-8 rounded-lg border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-50"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageItems.length === 0 && <tr><td colSpan={7} className="px-5 py-16 text-center text-slate-400">Müşteri bulunamadı.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Sayfalama */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500">{filtered.length.toLocaleString('tr-TR')} kayıttan {from} - {to} arası gösteriliyor</p>
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50">‹</button>
          {pages.map((p, i) => p === '...' ? <span key={i} className="px-2 text-slate-400">…</span> : (
            <button key={i} onClick={() => setPage(p as number)} className={`w-8 h-8 rounded-lg text-sm ${page === p ? 'bg-emerald-600 text-white' : 'border border-slate-200 hover:bg-slate-50'}`}>{p}</button>
          ))}
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50">›</button>
        </div>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="px-3 py-2 text-sm border border-slate-200 rounded-xl">
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / sayfa</option>)}
        </select>
      </div>
      </>}

      {/* Ekle/Düzenle modal */}
      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setModal(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-md bg-white rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{edit ? 'Müşteri Düzenle' : 'Yeni Müşteri'}</h3><button type="button" onClick={() => setModal(false)}><X size={20} className="text-slate-400" /></button></div>
            <input required value={form.ad} onChange={(e) => set('ad', e.target.value)} placeholder="Ad Soyad *" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.telefon} onChange={(e) => set('telefon', e.target.value)} placeholder="Telefon" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <input value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="Instagram / Kullanıcı adı" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="E-posta" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Cinsiyet:</span>
              {(['Kadın', 'Erkek'] as const).map((c) => (
                <button key={c} type="button" onClick={() => set('cinsiyet', form.cinsiyet === c ? '' : c)} className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${form.cinsiyet === c ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600 hover:border-emerald-400'}`}>{c}</button>
              ))}
            </div>
            <input value={form.adres} onChange={(e) => set('adres', e.target.value)} placeholder="Adres" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <textarea rows={2} value={form.not} onChange={(e) => set('not', e.target.value)} placeholder="Not" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700">Kaydet</button>
          </form>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Ic, iconCls, label, value, extra }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 min-w-[170px]">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconCls}`}><Ic size={18} /></div>
      <div>
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-800 leading-tight">{value} {extra && <span className="text-xs font-medium text-green-600">{extra}</span>}</p>
      </div>
    </div>
  );
}
function LgKpi({ icon: Ic, cls, label, value, sub }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${cls}`}><Ic size={18} /></div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}
function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-col">
      <label className="text-[10px] text-slate-400 mb-0.5 ml-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-xl min-w-[150px] bg-white">
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );
}

function MukerrerView({ dups, loading, picks, setPicks, merging, mergeGroup }: any) {
  const fm = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (loading && !dups) return <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">Yükleniyor…</div>;
  if (!dups) return null;
  const tg = dups.telefonGruplari || [];
  const ig = dups.instagramGruplari || [];

  const Grup = ({ g, pkey, baslik, ikon }: { g: any; pkey: string; baslik: any; ikon: any }) => (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          {ikon}
          <span className="font-semibold text-slate-700">{baslik}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{g.uyeler.length} kayıt</span>
        </div>
        <button onClick={() => mergeGroup(g, pkey)} disabled={merging === pkey} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50">
          <GitMerge size={15} /> {merging === pkey ? 'Birleştiriliyor…' : 'Seçili Kayda Birleştir'}
        </button>
      </div>
      <div className="divide-y divide-slate-50">
        {g.uyeler.map((u: any) => {
          const sel = (picks[pkey] || g.uyeler[0]?.id) === u.id;
          return (
            <label key={u.id} className={`flex items-center gap-3 px-5 py-3 cursor-pointer ${sel ? 'bg-emerald-50/60' : 'hover:bg-slate-50/60'}`}>
              <input type="radio" name={`keep-${pkey}`} checked={sel} onChange={() => setPicks((p: any) => ({ ...p, [pkey]: u.id }))} className="accent-emerald-600 w-4 h-4" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800 truncate">{u.ad || '—'}</span>
                  {sel && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">ANA KAYIT</span>}
                  {u.musteriNo && <span className="text-[10px] text-slate-400">#{u.musteriNo}</span>}
                </div>
                <div className="text-xs text-slate-400 truncate">{u.instagram ? String(u.instagram).replace(/^@/, '') + ' · ' : ''}{u.telefon || ''}</div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-400">{u.siparisSayisi} sipariş</p>
                <p className={`text-sm font-semibold ${u.bakiye > 0 ? 'text-green-600' : u.bakiye < 0 ? 'text-red-500' : 'text-slate-400'}`}>{fm(u.bakiye)}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-amber-800">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <span>Aynı telefon numarası (<b>+90</b>, baştaki <b>0</b> veya boşluk farkları aynı sayılır) ya da aynı <b>Instagram kullanıcı adı</b> (büyük/küçük harf duyarsız) olan kayıtlar gruplandı. Her grupta <b>ana kaydı seçin</b> ve "Birleştir" deyin; diğerlerinin siparişleri, bakiyesi ve cari hareketleri ana kayda taşınır, mükerrerler silinir. Bundan sonra bir numara ve bir kullanıcı adı yalnızca bir kez kayıt açabilir.</span>
      </div>

      {tg.length === 0 && ig.length === 0 && <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">Mükerrer müşteri bulunamadı. 🎉</div>}

      {tg.length > 0 && <div className="text-sm font-semibold text-slate-600 flex items-center gap-2"><Phone size={15} className="text-slate-400" /> Telefon numarası aynı olanlar</div>}
      {tg.map((g: any) => <Grup key={'tel:' + g.telKey} g={g} pkey={'tel:' + g.telKey} baslik={g.telefon} ikon={<Phone size={15} className="text-slate-400" />} />)}

      {ig.length > 0 && <div className="text-sm font-semibold text-slate-600 flex items-center gap-2 pt-2"><Users size={15} className="text-slate-400" /> Instagram kullanıcı adı aynı olanlar</div>}
      {ig.map((g: any) => <Grup key={'ig:' + g.igKey} g={g} pkey={'ig:' + g.igKey} baslik={'@' + String(g.instagram || g.igKey).replace(/^@/, '')} ikon={<Users size={15} className="text-slate-400" />} />)}
    </div>
  );
}
