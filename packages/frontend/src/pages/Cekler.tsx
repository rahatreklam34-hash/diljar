import MoneyInput from '../components/MoneyInput';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useQuickAction } from '../lib/quickAction';
import { useFocusTrap } from '../lib/useFocusTrap';
import { Cek } from '../types';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Search, Edit2, Trash2, Eye, ChevronLeft, ChevronRight, ArrowDownRight, ArrowUpRight, Calendar, Filter, Zap, X } from 'lucide-react';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

export default function Cekler() {
  const { cekler, cariHesaplar, addCek, updateCek, deleteCek } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [hizliMenuOpen, setHizliMenuOpen] = useState(false);
  const [editItem, setEditItem] = useState<Cek | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [tab, setTab] = useState('islemdeki');
  const [filterCari, setFilterCari] = useState('all');
  const [filterTur, setFilterTur] = useState('all');
  const [filterDurum, setFilterDurum] = useState('all');
  const [filterBanka, setFilterBanka] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 10;

  // Hizli islem form
  const [hizliForm, setHizliForm] = useState({ kisiAd: '', kesideci: '', tutar: '', vadeTarihi: '', tip: 'alacak' as 'alacak' | 'borc', banka: 'Is Bankasi', cariHesapId: '' });
  const hizliRef = useRef<HTMLDivElement>(null);
  useFocusTrap(hizliMenuOpen, hizliRef);

  // ESC ile hizli panel kapansin (Ctrl+Space yalnizca global paleti acar)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (modalOpen) return;
      if (e.key === 'Escape' && hizliMenuOpen) { e.preventDefault(); setHizliMenuOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalOpen, hizliMenuOpen]);

  const handleHizliSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hizliForm.kisiAd || !hizliForm.tutar || !hizliForm.vadeTarihi) return;
    addCek({ kisiAd: hizliForm.kisiAd, kesideci: hizliForm.kesideci || undefined, tutar: Number(hizliForm.tutar), vadeTarihi: hizliForm.vadeTarihi, durum: 'bekleyen', tip: hizliForm.tip, aciklama: '', cariHesapId: hizliForm.cariHesapId || undefined });
    setHizliForm({ kisiAd: '', kesideci: '', tutar: '', vadeTarihi: '', tip: 'alacak', banka: 'Is Bankasi', cariHesapId: '' });
    setHizliMenuOpen(false);
  };

  const [form, setForm] = useState({ kisiAd: '', kesideci: '', tutar: '', vadeTarihi: '', durum: 'bekleyen' as Cek['durum'], tip: 'alacak' as 'alacak' | 'borc', aciklama: '', banka: 'Is Bankasi', kesideTarihi: '', cariHesapId: '' });
  const resetForm = () => setForm({ kisiAd: '', kesideci: '', tutar: '', vadeTarihi: '', durum: 'bekleyen', tip: 'alacak', aciklama: '', banka: 'Is Bankasi', kesideTarihi: '', cariHesapId: '' });
  const openCreate = () => { resetForm(); setEditItem(null); setModalOpen(true); };
  const openEdit = (item: Cek) => { setEditItem(item); setForm({ kisiAd: item.kisiAd, kesideci: item.kesideci || '', tutar: item.tutar.toString(), vadeTarihi: item.vadeTarihi, durum: item.durum, tip: item.tip, aciklama: item.aciklama || '', banka: 'Is Bankasi', kesideTarihi: '', cariHesapId: item.cariHesapId || '' }); setModalOpen(true); };

  // Global hizli islem (Ctrl+Space) -> Cek Ekle komutu yeni cek modalini acar
  useQuickAction('pending_cek_action', (p) => {
    resetForm();
    setEditItem(null);
    setForm(f => ({ ...f, tip: p?.tip === 'borc' ? 'borc' : 'alacak' }));
    setModalOpen(true);
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { kisiAd: form.kisiAd, kesideci: form.kesideci || undefined, tutar: Number(form.tutar), vadeTarihi: form.vadeTarihi, durum: form.durum, tip: form.tip, aciklama: form.aciklama, cariHesapId: form.cariHesapId || undefined };
    if (editItem) updateCek(editItem.id, data); else addCek(data);
    setModalOpen(false); resetForm();
  };

  const fmt = (v: number) => v.toLocaleString('tr-TR');

  // Stats - sadece ACIK (bekleyen) cekler
  const acikCekler = cekler.filter(c => c.durum === 'bekleyen');
  const alinanAcik = acikCekler.filter(c => c.tip === 'alacak');
  const verilenAcik = acikCekler.filter(c => c.tip === 'borc');
  const alinanToplam = alinanAcik.reduce((s, c) => s + c.tutar, 0);
  const verilenToplam = verilenAcik.reduce((s, c) => s + c.tutar, 0);
  const netBakiye = alinanToplam - verilenToplam;

  const islemdeki = cekler.filter(c => c.durum === 'bekleyen');
  const tahsilEdilen = cekler.filter(c => c.durum === 'tahsil_edilen');
  const geciken = cekler.filter(c => c.durum === 'geciken');
  const islemdekiToplam = islemdeki.reduce((s, c) => s + c.tutar, 0);
  const tahsilToplam = tahsilEdilen.reduce((s, c) => s + c.tutar, 0);
  const gecikenToplam = geciken.reduce((s, c) => s + c.tutar, 0);

  // Filtered
  const filtered = useMemo(() => {
    let items = [...cekler];
    if (tab === 'islemdeki') items = items.filter(c => c.durum === 'bekleyen');
    else if (tab === 'tahsil') items = items.filter(c => c.durum === 'tahsil_edilen');
    else if (tab === 'odenen') items = items.filter(c => c.durum === 'geciken');
    else if (tab === 'vadesi') items = items.filter(c => { const vade = new Date(c.vadeTarihi); const now = new Date(); const diff = (vade.getTime() - now.getTime()) / 86400000; return diff > 0 && diff <= 30 && c.durum === 'bekleyen'; });
    if (filterTur === 'alinan') items = items.filter(c => c.tip === 'alacak');
    else if (filterTur === 'verilen') items = items.filter(c => c.tip === 'borc');
    if (filterDurum !== 'all') items = items.filter(c => c.durum === filterDurum);
    if (filterCari !== 'all') items = items.filter(c => c.kisiAd === filterCari);
    if (search) items = items.filter(c => c.kisiAd.toLowerCase().includes(search.toLowerCase()) || (c.aciklama || '').toLowerCase().includes(search.toLowerCase()));
    return items.sort((a, b) => a.vadeTarihi.localeCompare(b.vadeTarihi));
  }, [cekler, tab, filterTur, filterDurum, filterCari, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  // Vadesi yaklasan 5 cek
  const vadesiYaklasan = cekler.filter(c => c.durum === 'bekleyen').sort((a, b) => a.vadeTarihi.localeCompare(b.vadeTarihi)).slice(0, 5);

  // Gun kaldi hesapla
  const gunKaldi = (vade: string) => { const diff = Math.ceil((new Date(vade).getTime() - new Date().getTime()) / 86400000); return diff; };

  // Unique cari list
  const cariList = [...new Set(cekler.map(c => c.kisiAd))];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-gray-800">Cekler</h1><p className="text-[11px] text-gray-400">Alinan ve verilen ceklerinizi takip edin.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden sm:flex text-xs text-gray-500 px-3 py-2 bg-white border border-gray-200 rounded-lg items-center gap-1.5"><Calendar size={12} />{new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}</span>
          <button onClick={() => setHizliMenuOpen(true)} className="flex items-center gap-1 px-3 py-2 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-medium hover:bg-amber-100" title="Ctrl+Space"><Zap size={12} /> Hizli Islem <span className="text-[8px] text-amber-400 ml-1">(Ctrl+Space)</span></button>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 bg-[#6c63ff] text-white rounded-lg text-xs font-medium hover:bg-[#5b54e6]"><Plus size={14} /> Yeni Cek</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Section */}
        <div className="lg:col-span-9 space-y-4">
          {/* Summary Cards with mini line charts */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-4 mb-3">
              {[{ k: 'ozet', l: 'Ozet' }, { k: 'alinan', l: 'Alinan Cekler' }, { k: 'verilen', l: 'Verilen Cekler' }].map(t => (
                <button key={t.k} onClick={() => { if (t.k === 'alinan') setFilterTur('alinan'); else if (t.k === 'verilen') setFilterTur('verilen'); else setFilterTur('all'); }} className={`text-[11px] font-medium pb-1 border-b-2 ${(t.k === 'ozet' && filterTur === 'all') || (t.k === 'alinan' && filterTur === 'alinan') || (t.k === 'verilen' && filterTur === 'verilen') ? 'border-[#6c63ff] text-[#6c63ff]' : 'border-transparent text-gray-400'}`}>{t.l}</button>
              ))}
              <span className="ml-auto text-[9px] text-gray-400">Bu Ay</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2"><div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><ArrowDownRight size={18} className="text-green-500" /></div><div><p className="text-[9px] text-gray-400">Acik Alinan Cek</p><p className="text-lg font-bold text-gray-800">{fmt(alinanToplam)}</p><p className="text-[9px] text-gray-400">{alinanAcik.length} cek</p></div></div>
                <div className="h-[50px]"><Line data={{ labels: ['1', '5', '10', '15', '20', '25', '30'], datasets: [{ data: [200000, 350000, 500000, 700000, 900000, 1100000, alinanToplam], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.05)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { y: { display: false }, x: { display: false } } }} /></div>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2"><div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"><ArrowUpRight size={18} className="text-red-500" /></div><div><p className="text-[9px] text-gray-400">Acik Verilen Cek</p><p className="text-lg font-bold text-gray-800">{fmt(verilenToplam)}</p><p className="text-[9px] text-gray-400">{verilenAcik.length} cek</p></div></div>
                <div className="h-[50px]"><Line data={{ labels: ['1', '5', '10', '15', '20', '25', '30'], datasets: [{ data: [100000, 250000, 400000, 500000, 650000, 800000, verilenToplam], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { y: { display: false }, x: { display: false } } }} /></div>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2"><div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center"><ArrowDownRight size={18} className="text-purple-500" /></div><div><p className="text-[9px] text-gray-400">Net Acik Cek Bakiyesi</p><p className="text-lg font-bold text-gray-800">{fmt(netBakiye)}</p><p className="text-[9px] text-gray-400">{acikCekler.length} cek</p></div></div>
                <div className="h-[50px]"><Line data={{ labels: ['1', '5', '10', '15', '20', '25', '30'], datasets: [{ data: [100000, 150000, 200000, 350000, 400000, 500000, netBakiye], borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.05)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { y: { display: false }, x: { display: false } } }} /></div>
              </div>
            </div>
          </div>

          {/* Cek Dagilimi */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-[12px] font-semibold text-gray-700 mb-3">Cek Dagilimi</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Islemdeki', value: islemdekiToplam, count: islemdeki.length, color: '#3b82f6' },
                { label: 'Tahsil Edilen', value: tahsilToplam, count: tahsilEdilen.length, color: '#10b981' },
                { label: 'Odenen', value: gecikenToplam, count: geciken.length, color: '#f59e0b' },
                { label: 'Vadesi Gelen', value: vadesiYaklasan.reduce((s, c) => s + c.tutar, 0), count: vadesiYaklasan.length, color: '#ef4444' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-10 h-10 shrink-0"><Doughnut data={{ datasets: [{ data: [item.value, Math.max(1, islemdekiToplam + tahsilToplam + gecikenToplam - item.value)], backgroundColor: [item.color, '#f1f5f9'], borderWidth: 0 }] }} options={{ cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }} /></div>
                  <div><p className="text-[9px] text-gray-400">{item.label}</p><p className="text-sm font-bold text-gray-800">{fmt(item.value)}</p><p className="text-[8px] text-gray-400">{item.count} cek</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs + Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-4 px-4 border-b border-gray-100 overflow-x-auto">
              {[{ k: 'islemdeki', l: 'Islemdeki Cekler' }, { k: 'tahsil', l: 'Tahsil Edilen Cekler' }, { k: 'odenen', l: 'Odenen Cekler' }, { k: 'vadesi', l: 'Vadesi Gelen Cekler' }, { k: 'all', l: 'Tumu' }].map(t => (
                <button key={t.k} onClick={() => { setTab(t.k); setPage(1); }} className={`py-3 text-[11px] font-medium border-b-2 whitespace-nowrap ${tab === t.k ? 'border-[#6c63ff] text-[#6c63ff]' : 'border-transparent text-gray-400'}`}>{t.l}</button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-50">
              <div className="flex items-center gap-1 px-2 py-1.5 border border-gray-200 rounded-lg"><Calendar size={10} className="text-gray-400" /><span className="text-[10px] text-gray-500">Tarih Araligi</span></div>
              <select value={filterCari} onChange={e => { setFilterCari(e.target.value); setPage(1); }} className="px-2 py-1.5 text-[10px] border border-gray-200 rounded-lg outline-none"><option value="all">Cari Hesap</option>{cariList.map(c => <option key={c} value={c}>{c}</option>)}</select>
              <select value={filterTur} onChange={e => { setFilterTur(e.target.value); setPage(1); }} className="px-2 py-1.5 text-[10px] border border-gray-200 rounded-lg outline-none"><option value="all">Tur</option><option value="alinan">Alinan</option><option value="verilen">Verilen</option></select>
              <select value={filterBanka} onChange={e => { setFilterBanka(e.target.value); setPage(1); }} className="px-2 py-1.5 text-[10px] border border-gray-200 rounded-lg outline-none"><option value="all">Banka</option><option>Is Bankasi</option><option>Garanti BBVA</option><option>Yapi Kredi</option><option>Akbank</option><option>VakifBank</option></select>
              <select value={filterDurum} onChange={e => { setFilterDurum(e.target.value); setPage(1); }} className="px-2 py-1.5 text-[10px] border border-gray-200 rounded-lg outline-none"><option value="all">Durum</option><option value="bekleyen">Bekleyen</option><option value="tahsil_edilen">Tahsil Edilen</option><option value="geciken">Geciken</option></select>
              <div className="relative flex-1"><Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Cek ara..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full pl-7 pr-3 py-1.5 text-[10px] border border-gray-200 rounded-lg outline-none" /></div>
              <button onClick={() => { setFilterCari('all'); setFilterTur('all'); setFilterDurum('all'); setFilterBanka('all'); setSearch(''); setPage(1); }} className="px-3 py-1.5 text-[10px] border border-gray-200 rounded-lg text-gray-600 flex items-center gap-1 hover:bg-gray-50"><Filter size={10} /> Filtrele</button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Cek No</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Tur</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Cari Hesap</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Banka</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Kesideci / Muhatap</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Keside Tarihi</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Vade Tarihi</th>
                  <th className="text-right px-4 py-2 text-gray-400 font-medium">Tutar</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Durum</th>
                  <th className="text-center px-4 py-2 text-gray-400 font-medium">Gun Kaldi</th>
                  <th className="text-center px-4 py-2 text-gray-400 font-medium">Islemler</th>
                </tr></thead>
                <tbody>
                  {paginated.map((c, i) => {
                    const gun = gunKaldi(c.vadeTarihi);
                    const durumLabel = c.durum === 'bekleyen' ? (gun < 0 ? 'Vadesi Gecti' : gun <= 7 ? `Vadesine ${gun} Gun` : `Vadesine ${gun} Gun`) : c.durum === 'tahsil_edilen' ? 'Tahsil Edildi' : 'Geciken';
                    const durumColor = c.durum === 'bekleyen' ? (gun < 0 ? 'bg-red-50 text-red-600' : gun <= 7 ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600') : c.durum === 'tahsil_edilen' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600';
                    return (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-600 font-mono">{String(i + 1 + (page - 1) * perPage).padStart(6, '0')}</td>
                        <td className="px-4 py-2.5"><span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${c.tip === 'alacak' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{c.tip === 'alacak' ? <ArrowDownRight size={9} /> : <ArrowUpRight size={9} />}{c.tip === 'alacak' ? 'Alinan' : 'Verilen'}</span></td>
                        <td className="px-4 py-2.5 text-gray-700 font-medium">{c.kisiAd}</td>
                        <td className="px-4 py-2.5 text-gray-500"><span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-blue-100 flex items-center justify-center text-[7px] font-bold text-blue-600">{['I', 'G', 'Y', 'A', 'V'][i % 5]}</span>{['Is Bankasi', 'Garanti BBVA', 'Yapi Kredi', 'Akbank', 'VakifBank'][i % 5]}</span></td>
                        <td className="px-4 py-2.5 text-gray-500">{c.kesideci || c.kisiAd}</td>
                        <td className="px-4 py-2.5 text-gray-500">{c.vadeTarihi.replace(/-/g, '.').split('.').reverse().join('.')}</td>
                        <td className="px-4 py-2.5 text-gray-600 font-medium">{c.vadeTarihi}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-800">{fmt(c.tutar)}</td>
                        <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-[9px] font-medium ${durumColor}`}>{durumLabel}</span></td>
                        <td className="px-4 py-2.5 text-center"><span className={`text-[10px] font-bold ${gun < 0 ? 'text-red-500' : gun <= 7 ? 'text-orange-500' : 'text-gray-600'}`}>{gun}</span></td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button className="p-1 text-gray-400 hover:text-blue-500 rounded"><Eye size={11} /></button>
                            <button onClick={() => openEdit(c)} className="p-1 text-gray-400 hover:text-amber-500 rounded"><Edit2 size={11} /></button>
                            <button onClick={() => setDeleteId(c.id)} className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 size={11} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paginated.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-gray-400">Kayit bulunamadi</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
              <span className="text-[10px] text-gray-400">Toplam {filtered.length} cek</span>
              <div className="flex items-center gap-0.5">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 text-gray-400 disabled:opacity-30"><ChevronLeft size={13} /></button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)} className={`w-7 h-7 rounded text-[10px] font-medium ${page === p ? 'bg-[#6c63ff] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{p}</button>
                ))}
                {totalPages > 5 && <span className="px-1 text-gray-400">...</span>}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 text-gray-400 disabled:opacity-30"><ChevronRight size={13} /></button>
              </div>
              <span className="text-[10px] text-gray-400">{perPage} / sayfa</span>
            </div>
          </div>
        </div>

        {/* Right: Vadesi Yaklasan */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sticky top-4">
            <div className="flex items-center justify-between mb-4"><h3 className="text-[12px] font-semibold text-gray-700">Vadesi Yaklasan 5 Cek</h3><button className="text-[9px] text-[#6c63ff] font-medium hover:underline">Tumu</button></div>
            <div className="space-y-3">
              {vadesiYaklasan.map(c => {
                const gun = gunKaldi(c.vadeTarihi);
                return (
                  <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:border-[#6c63ff]/20 hover:bg-[#6c63ff]/[0.02] transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-8 rounded-full ${c.tip === 'alacak' ? 'bg-green-400' : 'bg-red-400'}`} />
                      <div>
                        <p className="text-[11px] font-medium text-gray-700">{c.kisiAd}</p>
                        <p className="text-[9px] text-gray-400">{c.tip === 'alacak' ? 'Alinan' : 'Verilen'} - {String(cekler.indexOf(c) + 1).padStart(6, '0')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-gray-400">{c.vadeTarihi}</p>
                      <p className={`text-[9px] font-medium ${gun <= 3 ? 'text-red-500' : gun <= 7 ? 'text-orange-500' : 'text-blue-500'}`}>{gun} gun kaldi</p>
                      <p className="text-[11px] font-bold text-gray-800">{fmt(c.tutar)}</p>
                    </div>
                  </div>
                );
              })}
              {vadesiYaklasan.length === 0 && <p className="text-center text-[10px] text-gray-400 py-4">Yaklasan cek yok</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Cek Duzenle' : 'Yeni Cek Ekle'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tur</label><select value={form.tip} onChange={e => setForm({...form, tip: e.target.value as any})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"><option value="alacak">Alinan Cek (Ben aldim)</option><option value="borc">Verilen Cek (Ben verdim)</option></select></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Banka</label><select value={form.banka} onChange={e => setForm({...form, banka: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"><option>Is Bankasi</option><option>Garanti BBVA</option><option>Yapi Kredi</option><option>Akbank</option><option>VakifBank</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Kesideci (Ceki Kesen)</label><input required value={form.kesideci} onChange={e => setForm({...form, kesideci: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="Ceki duzenleyen kisi/firma" /></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Kime Kesildi</label><input required value={form.kisiAd} onChange={e => setForm({...form, kisiAd: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="Cek kimin adina kesildi" /></div>
          </div>
          <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Islenecek Cari Hesap (Opsiyonel)</label><select value={form.cariHesapId} onChange={e => { const cid = e.target.value; setForm({...form, cariHesapId: cid}); }} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"><option value="">Cari hesap secin (opsiyonel)</option>{cariHesaplar.map(c => <option key={c.id} value={c.id}>{c.ad} ({c.bakiye > 0 ? 'Borclu' : c.bakiye < 0 ? 'Alacakli' : 'Notr'})</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tutar</label><MoneyInput value={form.tutar} onChange={v => setForm({...form, tutar: v})} required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Durum</label><select value={form.durum} onChange={e => setForm({...form, durum: e.target.value as any})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"><option value="bekleyen">Bekleyen</option><option value="tahsil_edilen">Tahsil Edilen</option><option value="geciken">Geciken</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Vade Tarihi</label><input type="date" required value={form.vadeTarihi} onChange={e => setForm({...form, vadeTarihi: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Keside Tarihi</label><input type="date" value={form.kesideTarihi} onChange={e => setForm({...form, kesideTarihi: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          </div>
          <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Aciklama</label><input value={form.aciklama} onChange={e => setForm({...form, aciklama: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          <div className="flex gap-2 justify-end pt-2"><button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Iptal</button><button type="submit" className="px-5 py-2 text-sm bg-[#6c63ff] text-white rounded-lg hover:bg-[#5b54e6]">{editItem ? 'Guncelle' : 'Kaydet'}</button></div>
        </form>
      </Modal>
      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) deleteCek(deleteId); setDeleteId(null); }} title="Cek Sil" message="Bu ceki silmek istediginizden emin misiniz?" />

      {/* Hizli Islem Overlay */}
      {hizliMenuOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setHizliMenuOpen(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()} ref={hizliRef}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Zap size={18} className="text-amber-500" /> Hizli Cek Ekle</h3><button onClick={() => setHizliMenuOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button></div>
            <p className="text-[10px] text-gray-400 mb-3">Tab ile alanlar arasi gecis, Enter ile kaydet. (Ctrl+Space)</p>
            <form onSubmit={handleHizliSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tur</label><select autoFocus value={hizliForm.tip} onChange={e => setHizliForm({...hizliForm, tip: e.target.value as any})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#6c63ff]/30"><option value="alacak">Alinan Cek (Ben aldim)</option><option value="borc">Verilen Cek (Ben verdim)</option></select></div>
                <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Banka</label><select value={hizliForm.banka} onChange={e => setHizliForm({...hizliForm, banka: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#6c63ff]/30"><option>Is Bankasi</option><option>Garanti BBVA</option><option>Yapi Kredi</option><option>Akbank</option><option>VakifBank</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Kesideci (Ceki Kesen)</label><input required value={hizliForm.kesideci} onChange={e => setHizliForm({...hizliForm, kesideci: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#6c63ff]/30" placeholder="Ceki duzenleyen kisi/firma" /></div>
                <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Kime Kesildi</label><input required value={hizliForm.kisiAd} onChange={e => setHizliForm({...hizliForm, kisiAd: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#6c63ff]/30" placeholder="Cek kimin adina kesildi" /></div>
              </div>
              <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Islenecek Cari Hesap (Opsiyonel)</label><select value={hizliForm.cariHesapId} onChange={e => setHizliForm({...hizliForm, cariHesapId: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#6c63ff]/30"><option value="">Cari hesap secin (opsiyonel)</option>{cariHesaplar.map(c => <option key={c.id} value={c.id}>{c.ad} ({c.bakiye > 0 ? 'Borclu' : c.bakiye < 0 ? 'Alacakli' : 'Notr'})</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tutar</label><MoneyInput value={hizliForm.tutar} onChange={v => setHizliForm({...hizliForm, tutar: v})} required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#6c63ff]/30" /></div>
                <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Vade Tarihi</label><input type="date" required value={hizliForm.vadeTarihi} onChange={e => setHizliForm({...hizliForm, vadeTarihi: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#6c63ff]/30" /></div>
              </div>
              <button type="submit" className="w-full py-2.5 bg-[#6c63ff] text-white rounded-lg font-medium hover:bg-[#5b54e6]">Kaydet (Enter)</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}