import MoneyInput from '../components/MoneyInput';
import { useState, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { useUrlState } from '../lib/useUrlState';
import { useQuickAction } from '../lib/quickAction';
import { useFocusTrap } from '../lib/useFocusTrap';
import { Hareket } from '../types';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Search, Edit2, Trash2, ArrowUpRight, ArrowDownRight, Eye, Download, ChevronLeft, ChevronRight, TrendingDown, DollarSign, BarChart3, Calendar, Zap, X, Tag, FileSpreadsheet, FileText } from 'lucide-react';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const DEFAULT_KATEGORILER = ['Tahsilat', 'Satis', 'Hizmet', 'Kira', 'Personel', 'Ulasim', 'Ofis Giderleri', 'Malzeme', 'Fatura', 'Diger'];

export default function GelirGider() {
  const { hareketler, addHareket, updateHareket, deleteHareket, kasaBanka, krediKartlari, updateKasaBanka, krediKartindanHarcama } = useApp();

  // Kategori yonetimi
  const [kategoriler, setKategoriler] = useState<string[]>(() => { try { const s = localStorage.getItem('gelir_gider_kategoriler'); return s ? JSON.parse(s) : DEFAULT_KATEGORILER; } catch { return DEFAULT_KATEGORILER; } });
  const [kategoriModalOpen, setKategoriModalOpen] = useState(false);
  const [yeniKategori, setYeniKategori] = useState('');
  useEffect(() => { localStorage.setItem('gelir_gider_kategoriler', JSON.stringify(kategoriler)); }, [kategoriler]);

  // State
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Hareket | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useUrlState('q', '');
  const [filterKategori, setFilterKategori] = useUrlState('kat', 'all');
  const [tab, setTab] = useUrlState('tab', 'all');
  const [periyot, setPeriyot] = useState('tumu');
  const [dateFrom, setDateFrom] = useState('2000-01-01');
  const [dateTo, setDateTo] = useState('2099-12-31');
  const [page, setPage] = useUrlState('page', 1);
  const perPage = 10;
  const [form, setForm] = useState({ tarih: new Date().toISOString().split('T')[0], saat: new Date().toTimeString().slice(0, 5), aciklama: '', tutar: '', tip: 'gelir' as 'gelir' | 'gider', kategori: kategoriler[0] || 'Diger', odemeYontemi: 'Banka (Havale)', kaynakId: '', kaynakTip: 'kasa_banka' as 'kasa_banka' | 'kredi_karti' | 'yok' });

  // Hizli islem - keyboard shortcut
  const [hizliMenuOpen, setHizliMenuOpen] = useState(false);
  const [typedKeys, setTypedKeys] = useState('');
  const hizliRef = useRef<HTMLDivElement>(null);
  const tutarRef = useRef<HTMLInputElement>(null);
  useFocusTrap(hizliMenuOpen, hizliRef);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (modalOpen || kategoriModalOpen) return;
      // Escape panel acikken her zaman kapatir (Ctrl+Space yalnizca global paleti acar)
      if (e.key === 'Escape' && hizliMenuOpen) {
        e.preventDefault();
        setHizliMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalOpen, kategoriModalOpen, hizliMenuOpen]);

  // Hizli islem submit
  const [hizliForm, setHizliForm] = useState({ aciklama: '', tutar: '', tip: 'gider' as 'gelir' | 'gider', kategori: kategoriler[0] || 'Diger', kaynakId: '', kaynakTip: 'kasa_banka' as 'kasa_banka' | 'kredi_karti' | 'yok' });
  const handleHizliSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tutar = Number(hizliForm.tutar);
    if (!hizliForm.aciklama || !tutar) return;
    // Kaynak zorunlu: gelir nereye eklendi / gider nereden cikti
    if (hizliForm.kaynakTip === 'yok' || !hizliForm.kaynakId) {
      toast.error(hizliForm.tip === 'gelir'
        ? 'Lutfen gelirin eklenecegi kaynagi secin (kasa / banka).'
        : 'Lutfen giderin cikacagi kaynagi secin (kasa / banka veya kredi karti).');
      return;
    }
    const data = { tarih: new Date().toISOString().split('T')[0], saat: new Date().toTimeString().slice(0, 5), aciklama: hizliForm.aciklama, tutar, tip: hizliForm.tip, kategori: hizliForm.kategori, kasaBankaId: hizliForm.kaynakTip === 'kasa_banka' ? hizliForm.kaynakId : undefined };
    if (hizliForm.kaynakTip === 'kredi_karti' && hizliForm.tip === 'gider') {
      krediKartindanHarcama(hizliForm.kaynakId, tutar, hizliForm.aciklama, hizliForm.kategori);
    } else {
      const hesap = kasaBanka.find(k => k.id === hizliForm.kaynakId);
      if (hesap) updateKasaBanka(hizliForm.kaynakId, { bakiye: hizliForm.tip === 'gider' ? hesap.bakiye - tutar : hesap.bakiye + tutar });
      addHareket(data);
    }
    setHizliForm({ aciklama: '', tutar: '', tip: 'gider', kategori: kategoriler[0] || 'Diger', kaynakId: '', kaynakTip: 'kasa_banka' });
    setHizliMenuOpen(false);
  };

  // Periyot
  const setPeriyotAndDates = (p: string) => {
    setPeriyot(p); setPage(1);
    const now = new Date(); const today = now.toISOString().split('T')[0];
    if (p === 'gunluk') { setDateFrom(today); setDateTo(today); }
    else if (p === 'haftalik') { const d = new Date(now); d.setDate(now.getDate() - 7); setDateFrom(d.toISOString().split('T')[0]); setDateTo(today); }
    else if (p === 'aylik') { const d = new Date(now); d.setMonth(now.getMonth() - 1); setDateFrom(d.toISOString().split('T')[0]); setDateTo(today); }
    else if (p === 'yillik') { const d = new Date(now); d.setFullYear(now.getFullYear() - 1); setDateFrom(d.toISOString().split('T')[0]); setDateTo(today); }
    else { setDateFrom('2000-01-01'); setDateTo('2099-12-31'); }
  };

  const resetForm = () => setForm({ tarih: new Date().toISOString().split('T')[0], saat: new Date().toTimeString().slice(0, 5), aciklama: '', tutar: '', tip: 'gelir', kategori: kategoriler[0] || 'Diger', odemeYontemi: 'Banka (Havale)', kaynakId: '', kaynakTip: 'kasa_banka' });
  const openCreate = () => { resetForm(); setEditItem(null); setModalOpen(true); };
  const openEdit = (item: Hareket) => { setEditItem(item); setForm({ tarih: item.tarih, saat: item.saat || '00:00', aciklama: item.aciklama, tutar: item.tutar.toString(), tip: item.tip, kategori: item.kategori, odemeYontemi: 'Banka (Havale)', kaynakId: item.kasaBankaId || '', kaynakTip: item.kasaBankaId ? 'kasa_banka' : 'yok' }); setModalOpen(true); };

  // Global hizli islem (Ctrl+Space) -> Gelir/Gider Ekle komutu kaynak-zorunlu hizli paneli acar
  useQuickAction('pending_gelirgider_action', (p) => {
    const tip = p?.tip === 'gider' ? 'gider' : 'gelir';
    setHizliForm({ aciklama: '', tutar: '', tip, kategori: kategoriler[0] || 'Diger', kaynakId: '', kaynakTip: 'kasa_banka' });
    setHizliMenuOpen(true);
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tutar = Number(form.tutar);
    if (!tutar || !form.aciklama) return;
    const data = { tarih: form.tarih, saat: form.saat, aciklama: form.aciklama, tutar, tip: form.tip, kategori: form.kategori, kasaBankaId: form.kaynakTip === 'kasa_banka' && form.kaynakId ? form.kaynakId : undefined };
    // Kaynak bakiye guncelleme
    if (form.kaynakTip === 'kasa_banka' && form.kaynakId) {
      const hesap = kasaBanka.find(k => k.id === form.kaynakId);
      if (hesap) {
        if (form.tip === 'gider') updateKasaBanka(form.kaynakId, { bakiye: hesap.bakiye - tutar });
        else updateKasaBanka(form.kaynakId, { bakiye: hesap.bakiye + tutar });
      }
    } else if (form.kaynakTip === 'kredi_karti' && form.kaynakId && form.tip === 'gider') {
      krediKartindanHarcama(form.kaynakId, tutar, form.aciklama, form.kategori);
      setModalOpen(false); resetForm(); return;
    }
    if (editItem) updateHareket(editItem.id, data); else addHareket(data);
    setModalOpen(false); resetForm();
  };

  const fmt = (v: number) => v.toLocaleString('tr-TR');
  const filtered = useMemo(() => hareketler.filter(h => h.tarih >= dateFrom && h.tarih <= dateTo).filter(h => tab === 'all' || h.tip === (tab === 'gelirler' ? 'gelir' : 'gider')).filter(h => filterKategori === 'all' || h.kategori === filterKategori).filter(h => h.aciklama.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.tarih.localeCompare(a.tarih)), [hareketler, dateFrom, dateTo, tab, filterKategori, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const allF = useMemo(() => hareketler.filter(h => h.tarih >= dateFrom && h.tarih <= dateTo), [hareketler, dateFrom, dateTo]);
  const toplamGelir = allF.filter(h => h.tip === 'gelir').reduce((s, h) => s + h.tutar, 0);
  const toplamGider = allF.filter(h => h.tip === 'gider').reduce((s, h) => s + h.tutar, 0);
  const netGelir = toplamGelir - toplamGider;
  const gelirCount = allF.filter(h => h.tip === 'gelir').length;
  const giderCount = allF.filter(h => h.tip === 'gider').length;
  const totalCount = allF.length;
  const ortIslem = totalCount > 0 ? Math.round((toplamGelir + toplamGider) / totalCount) : 0;
  // En yuksek 5 odeme
  const enYuksek5 = allF.filter(h => h.tip === 'gider').sort((a, b) => b.tutar - a.tutar).slice(0, 5);

  // Export functions
  const exportExcel = () => {
    const data = filtered.map(h => ({ Tarih: h.tarih, Saat: h.saat || '', Tur: h.tip === 'gelir' ? 'Gelir' : 'Gider', Aciklama: h.aciklama, Kategori: h.kategori, Tutar: h.tutar }));
    data.push({ Tarih: '', Saat: '', Tur: '', Aciklama: 'TOPLAM GELIR', Kategori: '', Tutar: toplamGelir });
    data.push({ Tarih: '', Saat: '', Tur: '', Aciklama: 'TOPLAM GIDER', Kategori: '', Tutar: toplamGider });
    data.push({ Tarih: '', Saat: '', Tur: '', Aciklama: 'NET', Kategori: '', Tutar: netGelir });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gelir-Gider');
    XLSX.writeFile(wb, `gelir_gider_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Gelir / Gider Raporu', 14, 18);
    doc.setFontSize(9);
    doc.text(`Tarih Araligi: ${dateFrom === '2000-01-01' ? 'Tum Zamanlar' : dateFrom} - ${dateTo === '2099-12-31' ? 'Tum Zamanlar' : dateTo}`, 14, 25);
    doc.text(`Toplam Gelir: ${fmt(toplamGelir)} TL | Toplam Gider: ${fmt(toplamGider)} TL | Net: ${fmt(netGelir)} TL`, 14, 31);
    doc.text(`Toplam ${filtered.length} islem | Filtre: ${filterKategori === 'all' ? 'Tum Kategoriler' : filterKategori} | ${tab === 'all' ? 'Tum Islemler' : tab}`, 14, 37);
    const rows = filtered.map(h => [h.tarih, h.tip === 'gelir' ? 'Gelir' : 'Gider', h.aciklama, h.kategori, `${h.tutar.toLocaleString('tr-TR')} TL`]);
    autoTable(doc, { startY: 42, head: [['Tarih', 'Tur', 'Aciklama', 'Kategori', 'Tutar']], body: rows, styles: { fontSize: 8 }, headStyles: { fillColor: [108, 99, 255] } });
    doc.save(`gelir_gider_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const doughnutData = useMemo(() => ({ labels: ['Gelir', 'Gider'], datasets: [{ data: [toplamGelir, toplamGider], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0 }] }), [toplamGelir, toplamGider]);
  const aylikTrend = useMemo(() => { const months: Record<string, { gelir: number; gider: number }> = {}; hareketler.forEach(h => { const m = h.tarih.slice(0, 7); if (!months[m]) months[m] = { gelir: 0, gider: 0 }; if (h.tip === 'gelir') months[m].gelir += h.tutar; else months[m].gider += h.tutar; }); const sorted = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).slice(-6); const aylar = ['', 'Oca', 'Sub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Agu', 'Eyl', 'Eki', 'Kas', 'Ara']; return { labels: sorted.map(([m]) => `${aylar[parseInt(m.split('-')[1])]} ${m.split('-')[0]}`), datasets: [{ label: 'Gelir', data: sorted.map(([, v]) => v.gelir), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.05)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#10b981' }, { label: 'Gider', data: sorted.map(([, v]) => v.gider), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#ef4444' }] }; }, [hareketler]);
  const giderKat = useMemo(() => { const map: Record<string, number> = {}; allF.filter(h => h.tip === 'gider').forEach(h => { map[h.kategori] = (map[h.kategori] || 0) + h.tutar; }); const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5); const colors = ['#0F7C45', '#10b981', '#f59e0b', '#3b82f6', '#6b7280']; const toplam = sorted.reduce((s, [, v]) => s + v, 0); return { labels: sorted.map(s => s[0]), data: sorted.map(s => s[1]), colors, toplam }; }, [allF]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-gray-800">Gelir / Gider</h1><p className="text-[11px] text-gray-400">Gelir ve giderlerinizi anlik olarak takip edin. <span className="text-[#1F9D57]">"hizli islem" yazarak hizli menu acar.</span></p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg px-1 py-1">
            {[{ k: 'gunluk', l: 'Gun' }, { k: 'haftalik', l: 'Hafta' }, { k: 'aylik', l: 'Ay' }, { k: 'yillik', l: 'Yil' }, { k: 'tumu', l: 'Tumu' }].map(p => (
              <button key={p.k} onClick={() => setPeriyotAndDates(p.k)} className={`px-2 py-1 text-[9px] rounded font-medium ${periyot === p.k ? 'bg-[#1F9D57] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{p.l}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-lg"><Calendar size={12} className="text-gray-400" /><input type="date" value={dateFrom === '2000-01-01' ? '' : dateFrom} onChange={e => { setDateFrom(e.target.value || '2000-01-01'); setPeriyot('ozel'); setPage(1); }} className="text-[9px] outline-none bg-transparent w-[80px]" /><span className="text-[8px] text-gray-300">-</span><input type="date" value={dateTo === '2099-12-31' ? '' : dateTo} onChange={e => { setDateTo(e.target.value || '2099-12-31'); setPeriyot('ozel'); setPage(1); }} className="text-[9px] outline-none bg-transparent w-[80px]" /></div>
          <button onClick={() => setHizliMenuOpen(true)} className="flex items-center gap-1 px-3 py-2 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-medium hover:bg-amber-100" title="Ctrl+Space"><Zap size={12} /> Hizli Islem <span className="text-[8px] text-amber-400 ml-1">(Ctrl+Space)</span></button>
          <button onClick={() => setKategoriModalOpen(true)} className="flex items-center gap-1 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-[10px] font-medium hover:bg-gray-50"><Tag size={12} /> Kategoriler</button>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1F9D57] text-white rounded-lg text-xs font-medium hover:bg-[#178A49]"><Plus size={14} /> Yeni Islem</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><ArrowUpRight size={18} className="text-green-500" /></div><div><p className="text-[9px] text-gray-400">Toplam Gelir</p><p className="text-lg font-bold text-gray-800">{fmt(toplamGelir)}</p></div></div><p className="text-[9px] text-gray-400 mt-2">{gelirCount} islem</p></div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"><ArrowDownRight size={18} className="text-red-500" /></div><div><p className="text-[9px] text-gray-400">Toplam Gider</p><p className="text-lg font-bold text-gray-800">{fmt(toplamGider)}</p></div></div><p className="text-[9px] text-gray-400 mt-2">{giderCount} islem</p></div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><DollarSign size={18} className="text-blue-500" /></div><div><p className="text-[9px] text-gray-400">Net Gelir</p><p className="text-lg font-bold text-gray-800">{fmt(netGelir)}</p></div></div></div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center"><BarChart3 size={18} className="text-purple-500" /></div><div><p className="text-[9px] text-gray-400">Ortalama Islem</p><p className="text-lg font-bold text-gray-800">{fmt(ortIslem)}</p></div></div><p className="text-[9px] text-gray-400 mt-2">{totalCount} islem</p></div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"><p className="text-[9px] text-gray-400 mb-1">En Yuksek 5 Odeme</p><div className="space-y-1">{enYuksek5.slice(0, 3).map((h, i) => (<div key={h.id} className="flex justify-between text-[9px]"><span className="text-gray-600 truncate max-w-[80px]">{i + 1}. {h.kategori}</span><span className="font-bold text-gray-800">{fmt(h.tutar)}</span></div>))}{enYuksek5.length > 3 && <p className="text-[8px] text-gray-400">+{enYuksek5.length - 3} daha...</p>}</div></div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-[12px] font-semibold text-gray-700 mb-3">Gelir - Gider Dagilimi</h3>
          <div className="flex items-center gap-4"><div className="w-[120px] h-[120px] relative shrink-0"><Doughnut data={doughnutData} options={{ cutout: '65%', plugins: { legend: { display: false } } }} /><div className="absolute inset-0 flex flex-col items-center justify-center"><p className="text-sm font-bold text-gray-800">{fmt(netGelir)}</p><p className="text-[8px] text-gray-400">Net Gelir</p></div></div><div className="space-y-3"><div className="flex items-center gap-2 text-[10px]"><span className="w-2 h-2 rounded-full bg-green-500" /><span>Gelir</span><span className="font-bold ml-auto">{fmt(toplamGelir)}</span><span className="text-gray-400">({toplamGelir + toplamGider > 0 ? Math.round((toplamGelir / (toplamGelir + toplamGider)) * 100) : 0}%)</span></div><div className="flex items-center gap-2 text-[10px]"><span className="w-2 h-2 rounded-full bg-red-500" /><span>Gider</span><span className="font-bold ml-auto">{fmt(toplamGider)}</span><span className="text-gray-400">({toplamGelir + toplamGider > 0 ? Math.round((toplamGider / (toplamGelir + toplamGider)) * 100) : 0}%)</span></div></div></div>
        </div>
        <div className="lg:col-span-5 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2"><h3 className="text-[12px] font-semibold text-gray-700">Aylik Trend</h3><div className="flex gap-2 text-[9px]"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Gelir</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Gider</span></div></div>
          <div className="h-[140px]"><Line data={aylikTrend} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 8 }, callback: (v: any) => `${(v / 1000).toFixed(0)}B` } }, x: { ticks: { font: { size: 8 } } } } }} /></div>
        </div>
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2"><h3 className="text-[12px] font-semibold text-gray-700">Gider Kategorileri</h3><button onClick={() => setFilterKategori('all')} className="text-[8px] text-[#1F9D57] hover:underline">Tumunu Goster</button></div>
          <div className="space-y-1.5">{giderKat.labels.map((l, i) => (<div key={l} className="flex items-center justify-between text-[9px] cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5" onClick={() => { setFilterKategori(l); setTab('giderler'); setPage(1); }}><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: giderKat.colors[i] }} />{l}</span><span className="flex gap-2"><span className="font-medium">{fmt(giderKat.data[i])}</span><span className="text-gray-400">%{giderKat.toplam > 0 ? Math.round((giderKat.data[i] / giderKat.toplam) * 100) : 0}</span></span></div>))}</div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-4 border-b border-gray-100 overflow-x-auto">{[{ key: 'all', label: 'Tum Islemler' }, { key: 'gelirler', label: 'Gelirler' }, { key: 'giderler', label: 'Giderler' }].map(t => (<button key={t.key} onClick={() => { setTab(t.key); setPage(1); }} className={`py-3 text-[11px] font-medium border-b-2 whitespace-nowrap ${tab === t.key ? 'border-[#1F9D57] text-[#1F9D57]' : 'border-transparent text-gray-400'}`}>{t.label}</button>))}</div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-50">
          <select value={filterKategori} onChange={e => { setFilterKategori(e.target.value); setPage(1); }} className="px-2 py-1.5 text-[10px] border border-gray-200 rounded-lg outline-none"><option value="all">Tum Kategoriler</option>{kategoriler.map(k => <option key={k} value={k}>{k}</option>)}</select>
          <div className="relative flex-1"><Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Aciklama, kategori ara..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full pl-7 pr-3 py-1.5 text-[10px] border border-gray-200 rounded-lg outline-none" /></div>
          <button onClick={exportExcel} className="px-2.5 py-1.5 text-[10px] border border-gray-200 rounded-lg text-gray-600 flex items-center gap-1 hover:bg-green-50 hover:text-green-600 hover:border-green-200"><FileSpreadsheet size={10} /> Excel</button><button onClick={exportPDF} className="px-2.5 py-1.5 text-[10px] border border-gray-200 rounded-lg text-gray-600 flex items-center gap-1 hover:bg-red-50 hover:text-red-600 hover:border-red-200"><FileText size={10} /> PDF</button>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-[10px]"><thead><tr className="border-b border-gray-100 bg-gray-50/50"><th className="text-left px-4 py-2 text-gray-400 font-medium">Tarih</th><th className="text-left px-4 py-2 text-gray-400 font-medium">Tur</th><th className="text-left px-4 py-2 text-gray-400 font-medium">Aciklama</th><th className="text-left px-4 py-2 text-gray-400 font-medium">Kategori</th><th className="text-right px-4 py-2 text-gray-400 font-medium">Tutar</th><th className="text-center px-4 py-2 text-gray-400 font-medium">Islem</th></tr></thead><tbody>{paginated.map(h => (<tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50/50"><td className="px-4 py-2 text-gray-600">{h.tarih}</td><td className="px-4 py-2"><span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${h.tip === 'gelir' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{h.tip === 'gelir' ? 'Gelir' : 'Gider'}</span></td><td className="px-4 py-2 text-gray-700 font-medium">{h.aciklama}</td><td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[9px]">{h.kategori}</span></td><td className="px-4 py-2 text-right font-bold text-gray-800">{fmt(h.tutar)}</td><td className="px-4 py-2"><div className="flex items-center justify-center gap-1"><button onClick={() => openEdit(h)} className="p-1 text-gray-400 hover:text-amber-500 rounded"><Edit2 size={11} /></button><button onClick={() => setDeleteId(h.id)} className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 size={11} /></button></div></td></tr>))}{paginated.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400">Kayit bulunamadi</td></tr>}</tbody></table></div>
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100"><span className="text-[10px] text-gray-400">Toplam {filtered.length} islem</span><div className="flex items-center gap-0.5"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 text-gray-400 disabled:opacity-30"><ChevronLeft size={13} /></button>{Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (<button key={p} onClick={() => setPage(p)} className={`w-6 h-6 rounded text-[9px] font-medium ${page === p ? 'bg-[#1F9D57] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{p}</button>))}{totalPages > 5 && <span className="text-gray-400">...</span>}<button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 text-gray-400 disabled:opacity-30"><ChevronRight size={13} /></button></div><span className="text-[10px] text-gray-400">{perPage}/sayfa</span></div>
      </div>

      {/* Hizli Islem Overlay */}
      {hizliMenuOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setHizliMenuOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()} ref={hizliRef}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Zap size={18} className="text-amber-500" /> Hizli Islem</h3><button onClick={() => setHizliMenuOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button></div>
            <p className="text-[10px] text-gray-400 mb-3">Mause kullanmadan islem ekleyin. Tab ile alanlar arasi gecis yapin.</p>
            <form onSubmit={handleHizliSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tip</label><select autoFocus value={hizliForm.tip} onChange={e => { const nt = e.target.value as 'gelir' | 'gider'; setHizliForm(f => ({ ...f, tip: nt, kaynakTip: nt === 'gelir' && f.kaynakTip === 'kredi_karti' ? 'kasa_banka' : f.kaynakTip, kaynakId: nt === 'gelir' && f.kaynakTip === 'kredi_karti' ? '' : f.kaynakId })); }} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1F9D57]/30"><option value="gelir">Gelir</option><option value="gider">Gider</option></select></div>
                <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Kategori</label><select value={hizliForm.kategori} onChange={e => setHizliForm({...hizliForm, kategori: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1F9D57]/30">{kategoriler.map(k => <option key={k} value={k}>{k}</option>)}</select></div>
              </div>
              <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tutar</label><MoneyInput value={hizliForm.tutar} onChange={v => setHizliForm({...hizliForm, tutar: v})} required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1F9D57]/30" /></div>
              <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Aciklama</label><input required value={hizliForm.aciklama} onChange={e => setHizliForm({...hizliForm, aciklama: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1F9D57]/30" placeholder="Islem aciklamasi" /></div>
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-[10px] font-medium text-gray-600 mb-1">{hizliForm.tip === 'gelir' ? 'Gelir nereye eklendi?' : 'Gider nereden cikti?'} <span className="text-red-500">* (zorunlu)</span></label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button type="button" onClick={() => setHizliForm({...hizliForm, kaynakTip: 'kasa_banka', kaynakId: ''})} className={`px-2 py-1.5 text-[10px] rounded-lg border ${hizliForm.kaynakTip === 'kasa_banka' ? 'border-[#1F9D57] bg-[#1F9D57]/10 text-[#1F9D57]' : 'border-gray-200 text-gray-500'}`}>Kasa / Banka</button>
                  <button type="button" onClick={() => setHizliForm({...hizliForm, kaynakTip: 'kredi_karti', kaynakId: ''})} disabled={hizliForm.tip === 'gelir'} className={`px-2 py-1.5 text-[10px] rounded-lg border disabled:opacity-40 ${hizliForm.kaynakTip === 'kredi_karti' ? 'border-[#1F9D57] bg-[#1F9D57]/10 text-[#1F9D57]' : 'border-gray-200 text-gray-500'}`}>{hizliForm.tip === 'gelir' ? 'Kredi Karti (sadece gider)' : 'Kredi Karti'}</button>
                </div>
                {hizliForm.kaynakTip === 'kasa_banka' && (
                  <select required value={hizliForm.kaynakId} onChange={e => setHizliForm({...hizliForm, kaynakId: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
                    <option value="">Hesap secin...</option>
                    {kasaBanka.map(k => <option key={k.id} value={k.id}>{k.ad} ({k.tip}) - {k.bakiye.toLocaleString('tr-TR')} ₺</option>)}
                  </select>
                )}
                {hizliForm.kaynakTip === 'kredi_karti' && (
                  <select required value={hizliForm.kaynakId} onChange={e => setHizliForm({...hizliForm, kaynakId: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
                    <option value="">Kredi karti secin...</option>
                    {krediKartlari.map(k => <option key={k.id} value={k.id}>{k.ad} - Borc: {k.borc.toLocaleString('tr-TR')} ₺</option>)}
                  </select>
                )}
                {((hizliForm.kaynakTip === 'kasa_banka' && kasaBanka.length === 0) || (hizliForm.kaynakTip === 'kredi_karti' && krediKartlari.length === 0)) && (
                  <p className="text-[9px] text-red-400 mt-1">Once Kasa & Banka sayfasindan hesap/kart ekleyin.</p>
                )}
              </div>
              <button type="submit" className="w-full py-2.5 bg-[#1F9D57] text-white rounded-lg font-medium hover:bg-[#178A49]">Kaydet (Enter)</button>
            </form>
          </div>
        </div>
      )}

      {/* Kategori Yonetimi Modal */}
      <Modal isOpen={kategoriModalOpen} onClose={() => setKategoriModalOpen(false)} title="Kategori Yonetimi">
        <div className="space-y-3">
          <div className="flex gap-2"><input value={yeniKategori} onChange={e => setYeniKategori(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && yeniKategori.trim()) { setKategoriler(prev => [...prev, yeniKategori.trim()]); setYeniKategori(''); } }} placeholder="Yeni kategori adi..." className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /><button onClick={() => { if (yeniKategori.trim()) { setKategoriler(prev => [...prev, yeniKategori.trim()]); setYeniKategori(''); } }} className="px-4 py-2 bg-[#1F9D57] text-white text-sm rounded-lg">Ekle</button></div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">{kategoriler.map((k, i) => (<div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg"><span className="text-sm text-gray-700">{k}</span><button onClick={() => setKategoriler(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button></div>))}</div>
        </div>
      </Modal>

      {/* Normal Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Islem Duzenle' : 'Yeni Islem Ekle'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tarih</label><input type="date" required value={form.tarih} onChange={e => setForm({...form, tarih: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div><div><label className="block text-[10px] font-medium text-gray-600 mb-1">Saat</label><input type="time" required value={form.saat} onChange={e => setForm({...form, saat: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tip</label><select value={form.tip} onChange={e => setForm({...form, tip: e.target.value as any})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"><option value="gelir">Gelir</option><option value="gider">Gider</option></select></div><div><label className="block text-[10px] font-medium text-gray-600 mb-1">Kategori</label><select value={form.kategori} onChange={e => setForm({...form, kategori: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg">{kategoriler.map(k => <option key={k} value={k}>{k}</option>)}</select></div></div>
          <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tutar</label><MoneyInput value={form.tutar} onChange={v => setForm({...form, tutar: v})} required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Aciklama</label><input required value={form.aciklama} onChange={e => setForm({...form, aciklama: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          <div className="border-t border-gray-100 pt-3">
            <label className="block text-[10px] font-medium text-gray-600 mb-1">Kaynak / Hedef Hesap (Bakiye otomatik guncellenir)</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button type="button" onClick={() => setForm({...form, kaynakTip: 'kasa_banka', kaynakId: ''})} className={`px-2 py-1.5 text-[10px] rounded-lg border ${form.kaynakTip === 'kasa_banka' ? 'border-[#1F9D57] bg-[#1F9D57]/10 text-[#1F9D57]' : 'border-gray-200 text-gray-500'}`}>Kasa / Banka</button>
              <button type="button" onClick={() => setForm({...form, kaynakTip: form.tip === 'gider' ? 'kredi_karti' : 'yok', kaynakId: ''})} className={`px-2 py-1.5 text-[10px] rounded-lg border ${form.kaynakTip === 'kredi_karti' ? 'border-[#1F9D57] bg-[#1F9D57]/10 text-[#1F9D57]' : 'border-gray-200 text-gray-500'}`} disabled={form.tip === 'gelir'}>{form.tip === 'gider' ? 'Kredi Karti' : 'Kredi Karti (sadece gider)'}</button>
            </div>
            {form.kaynakTip === 'kasa_banka' && (
              <select value={form.kaynakId} onChange={e => setForm({...form, kaynakId: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg">
                <option value="">Hesap secin (opsiyonel)...</option>
                {kasaBanka.map(k => <option key={k.id} value={k.id}>{k.ad} ({k.tip}) - {k.bakiye.toLocaleString('tr-TR')} ₺</option>)}
              </select>
            )}
            {form.kaynakTip === 'kredi_karti' && (
              <select value={form.kaynakId} onChange={e => setForm({...form, kaynakId: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg">
                <option value="">Kredi karti secin...</option>
                {krediKartlari.map(k => <option key={k.id} value={k.id}>{k.ad} - Borc: {k.borc.toLocaleString('tr-TR')} ₺ / Limit: {k.limit.toLocaleString('tr-TR')} ₺</option>)}
              </select>
            )}
            {form.kaynakTip === 'kasa_banka' && form.kaynakId && <p className="text-[9px] text-green-600 mt-1">{form.tip === 'gelir' ? 'Secilen hesaba para eklenecek' : 'Secilen hesaptan para dusulecek'}</p>}
            {form.kaynakTip === 'kredi_karti' && form.kaynakId && <p className="text-[9px] text-orange-600 mt-1">Kredi karti borcuna eklenecek</p>}
          </div>
          <div className="flex gap-2 justify-end pt-2"><button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Iptal</button><button type="submit" className="px-5 py-2 text-sm bg-[#1F9D57] text-white rounded-lg hover:bg-[#178A49]">{editItem ? 'Guncelle' : 'Kaydet'}</button></div>
        </form>
      </Modal>
      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) deleteHareket(deleteId); setDeleteId(null); }} title="Islem Sil" message="Bu islemi silmek istediginizden emin misiniz?" />
    </div>
  );
}