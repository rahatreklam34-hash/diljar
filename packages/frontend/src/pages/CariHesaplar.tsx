import MoneyInput from '../components/MoneyInput';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useQuickAction } from '../lib/quickAction';
import { CariHesap, CariHareket, paraCinsleri } from '../types';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, Search, Edit2, Trash2, ArrowDown, ArrowUp, FileText, ChevronLeft, ChevronRight,
  Eye, MoreHorizontal, Download, Filter, X, Upload, Calendar, TrendingUp, TrendingDown,
  CreditCard, RefreshCw, CheckCircle, XCircle, ChevronDown, Phone, Mail, MapPin, Hash,
  DollarSign, BarChart3, Users, ArrowRight, ArrowLeft, ShoppingCart, Zap
} from 'lucide-react';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const TIP_LABELS: Record<string, string> = {
  alis_fatura: 'Alis Faturasi',
  satis_fatura: 'Satis Faturasi',
  odeme: 'Odeme',
  tahsilat: 'Tahsilat',
};

// Neumorphism Soft hizli islem kartlari
const HIZLI_ACTIONS: { tip: CariHareket['tip']; label: string; sub: string; icon: any; bg: string; text: string }[] = [
  { tip: 'tahsilat', label: 'Tahsilat Yap', sub: 'Alacak Islemi', icon: ArrowDown, bg: 'bg-green-500', text: 'text-green-600' },
  { tip: 'odeme', label: 'Odeme Yap', sub: 'Borc Islemi', icon: ArrowUp, bg: 'bg-red-500', text: 'text-red-600' },
  { tip: 'alis_fatura', label: 'Alis Faturasi', sub: 'Borc Kaydi', icon: ShoppingCart, bg: 'bg-blue-500', text: 'text-blue-600' },
  { tip: 'satis_fatura', label: 'Satis Faturasi', sub: 'Alacak Kaydi', icon: ShoppingCart, bg: 'bg-orange-500', text: 'text-orange-600' },
  { tip: 'iade_al', label: 'Iade Al', sub: 'Alacak Iadesi', icon: ArrowLeft, bg: 'bg-purple-500', text: 'text-purple-600' },
  { tip: 'iade_ver', label: 'Iade Ver', sub: 'Borc Iadesi', icon: ArrowRight, bg: 'bg-pink-500', text: 'text-pink-600' },
];

export default function CariHesaplar() {
  const { cariHesaplar, cariHareketler, addCariHesap, updateCariHesap, deleteCariHesap, addCariHareket, updateCariHareket, deleteCariHareket } = useApp();

  const [selectedCari, setSelectedCari] = useState<CariHesap | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [filterGrup, setFilterGrup] = useState('all');
  const [filterBakiye, setFilterBakiye] = useState('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [panelTab, setPanelTab] = useState('genel');
  const [panelPeriod, setPanelPeriod] = useState('6ay');

  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const actionRef = useRef<HTMLDivElement>(null);

  // Satira tiklayinca acilan hizli islem modali (cari onceden secili)
  const [rowActionCari, setRowActionCari] = useState<CariHesap | null>(null);

  // Hizli islem modal
  const [hizliModalOpen, setHizliModalOpen] = useState(false);
  const [hizliTip, setHizliTip] = useState<CariHareket['tip']>('alis_fatura');
  const [hizliTipLabel, setHizliTipLabel] = useState('');
  const [hizliSelectedCariId, setHizliSelectedCariId] = useState('');
  const [hizliForm, setHizliForm] = useState({ tarih: new Date().toISOString().split('T')[0], saat: new Date().toTimeString().slice(0, 5), aciklama: '', tutar: '' });

  const [cariModalOpen, setCariModalOpen] = useState(false);
  const [editCari, setEditCari] = useState<CariHesap | null>(null);
  const [hareketModalOpen, setHareketModalOpen] = useState(false);
  const [hareketTip, setHareketTip] = useState<CariHareket['tip']>('alis_fatura');
  const [hareketTarget, setHareketTarget] = useState<CariHesap | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteHareketId, setDeleteHareketId] = useState<string | null>(null);

  const [detailTab, setDetailTab] = useState('dokum');
  const [detailDateFrom, setDetailDateFrom] = useState('');
  const [detailDateTo, setDetailDateTo] = useState('');
  const [detailFilter, setDetailFilter] = useState('all');
  const [belgeler, setBelgeler] = useState<{id: string; ad: string; tarih: string}[]>(() => {
    try { const s = localStorage.getItem('cari_belgeler'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [notlar, setNotlar] = useState<{id: string; cariId: string; metin: string; tarih: string}[]>(() => {
    try { const s = localStorage.getItem('cari_notlar'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [notInput, setNotInput] = useState('');

  const [cariForm, setCariForm] = useState({ ad: '', bakiye: '0', paraCinsi: 'TRY', telefon: '', email: '', adres: '' });
  const [hareketForm, setHareketForm] = useState({ tarih: new Date().toISOString().split('T')[0], saat: new Date().toTimeString().slice(0, 5), aciklama: '', tutar: '' });

  useEffect(() => { localStorage.setItem('cari_belgeler', JSON.stringify(belgeler)); }, [belgeler]);
  useEffect(() => { localStorage.setItem('cari_notlar', JSON.stringify(notlar)); }, [notlar]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (actionRef.current && !actionRef.current.contains(e.target as Node)) setActionMenuId(null); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useQuickAction('pending_cari_action', (action) => {
    if (!action || !action.tip) return;
    if (action.tip === 'yeni_cari') { openCariModal(); return; }
    if (cariHesaplar.length === 0) { alert('Once bir cari hesap olusturun.'); return; }
    openHizliModal(action.tip as CariHareket['tip'], action.label || action.tip);
  });

  const openCariModal = (item?: CariHesap) => {
    if (item) { setEditCari(item); setCariForm({ ad: item.ad, bakiye: item.bakiye.toString(), paraCinsi: item.paraCinsi, telefon: item.telefon || '', email: item.email || '', adres: item.adres || '' }); }
    else { setEditCari(null); setCariForm({ ad: '', bakiye: '0', paraCinsi: 'TRY', telefon: '', email: '', adres: '' }); }
    setCariModalOpen(true);
  };

  const handleCariSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ad: cariForm.ad, bakiye: Number(cariForm.bakiye), paraCinsi: cariForm.paraCinsi, telefon: cariForm.telefon, email: cariForm.email, adres: cariForm.adres };
    if (editCari) { updateCariHesap(editCari.id, data); if (selectedCari?.id === editCari.id) setSelectedCari({ ...selectedCari, ...data } as CariHesap); }
    else addCariHesap(data);
    setCariModalOpen(false);
  };

  const openHareketModal = (cari: CariHesap, tip: CariHareket['tip']) => {
    setHareketTarget(cari);
    setHareketTip(tip);
    setHareketForm({ tarih: new Date().toISOString().split('T')[0], saat: new Date().toTimeString().slice(0, 5), aciklama: '', tutar: '' });
    setHareketModalOpen(true);
    setActionMenuId(null);
  };

  const handleHareketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hareketTarget) return;
    addCariHareket({ cariHesapId: hareketTarget.id, tarih: hareketForm.tarih, saat: hareketForm.saat, aciklama: hareketForm.aciklama, tutar: Number(hareketForm.tutar), tip: hareketTip });
    setHareketModalOpen(false);
  };

  // Satir-aksiyon modalindan bir karta tiklayinca: cari onceden secili olarak hareket formunu ac
  const handleRowAction = (tip: CariHareket['tip']) => {
    if (!rowActionCari) return;
    const cari = rowActionCari;
    setRowActionCari(null);
    openHareketModal(cari, tip);
  };

  const openHizliModal = (tip: CariHareket['tip'], label: string) => {
    setHizliTip(tip);
    setHizliTipLabel(label);
    setHizliSelectedCariId(cariHesaplar[0]?.id || '');
    setHizliForm({ tarih: new Date().toISOString().split('T')[0], saat: new Date().toTimeString().slice(0, 5), aciklama: '', tutar: '' });
    setHizliModalOpen(true);
  };

  const handleHizliSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cari = cariHesaplar.find(c => c.id === hizliSelectedCariId);
    if (!cari) return;
    addCariHareket({ cariHesapId: cari.id, tarih: hizliForm.tarih, saat: hizliForm.saat, aciklama: hizliForm.aciklama, tutar: Number(hizliForm.tutar), tip: hizliTip });
    setHizliModalOpen(false);
  };

  const addNot = () => {
    if (!notInput.trim() || !selectedCari) return;
    setNotlar(prev => [...prev, { id: Date.now().toString(), cariId: selectedCari.id, metin: notInput, tarih: new Date().toISOString().split('T')[0] }]);
    setNotInput('');
  };

  const addBelge = () => {
    if (!selectedCari) return;
    const ad = prompt('Belge adi girin:');
    if (!ad) return;
    setBelgeler(prev => [...prev, { id: Date.now().toString(), ad, tarih: new Date().toISOString().split('T')[0] }]);
  };

  const exportPDF = (cari: CariHesap) => {
    const hareketler = cariHareketler.filter(h => h.cariHesapId === cari.id).sort((a, b) => a.tarih.localeCompare(b.tarih));
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`Hesap Ekstresi - ${cari.ad}`, 14, 18);
    doc.setFontSize(9);
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')} | Net: ₺${cari.bakiye.toLocaleString('tr-TR')}`, 14, 25);
    if (cari.telefon) doc.text(`Tel: ${cari.telefon}`, 14, 30);
    let bakiye = 0;
    const rows = hareketler.map(h => {
      if (h.tip === 'alis_fatura') { bakiye += h.tutar; return [h.tarih, 'Alis Faturasi', h.aciklama, `+${h.tutar.toLocaleString('tr-TR')}`, ``, `${bakiye.toLocaleString('tr-TR')}`]; }
      if (h.tip === 'satis_fatura') { bakiye -= h.tutar; return [h.tarih, 'Satis Faturasi', h.aciklama, ``, `-${h.tutar.toLocaleString('tr-TR')}`, `${bakiye.toLocaleString('tr-TR')}`]; }
      if (h.tip === 'odeme') { bakiye -= h.tutar; return [h.tarih, 'Odeme', h.aciklama, ``, `+${h.tutar.toLocaleString('tr-TR')}`, `${bakiye.toLocaleString('tr-TR')}`]; }
      if (h.tip === 'tahsilat') { bakiye += h.tutar; return [h.tarih, 'Tahsilat', h.aciklama, `-${h.tutar.toLocaleString('tr-TR')}`, ``, `${bakiye.toLocaleString('tr-TR')}`]; }
      return [h.tarih, h.tip, h.aciklama, '', '', `${bakiye}`];
    });
    autoTable(doc, { startY: 34, head: [['Tarih', 'Tip', 'Aciklama', 'Giris (+)', 'Cikis (+)', 'Net']], body: rows, styles: { fontSize: 8 }, headStyles: { fillColor: [108, 99, 255] } });
    doc.save(`${cari.ad.replace(/\s+/g, '_')}_ekstre.pdf`);
  };

  const fmt = (v: number) => v.toLocaleString('tr-TR');

  const filtered = useMemo(() => {
    return cariHesaplar
      .filter(c => c.ad.toLowerCase().includes(search.toLowerCase()))
      .filter(c => {
        if (filterBakiye === 'all') return true;
        if (filterBakiye === 'borclu') return c.bakiye > 0;
        if (filterBakiye === 'alacakli') return c.bakiye < 0;
        if (filterBakiye === 'sifir') return c.bakiye === 0;
        return true;
      });
  }, [cariHesaplar, filterBakiye, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  // Bakiye > 0 = benim borcum, Bakiye < 0 = benim alacagim
  const toplamBorc = cariHesaplar.filter(c => c.bakiye > 0).reduce((s, c) => s + c.bakiye, 0);
  const toplamAlacak = cariHesaplar.filter(c => c.bakiye < 0).reduce((s, c) => s + Math.abs(c.bakiye), 0);
  const borcluSayisi = cariHesaplar.filter(c => c.bakiye > 0).length;
  const alacakliSayisi = cariHesaplar.filter(c => c.bakiye < 0).length;
  const netBakiye = toplamBorc - toplamAlacak;

  // Detail computations
  const detailHareketler = useMemo(() => {
    if (!selectedCari) return [];
    let items = cariHareketler.filter(h => h.cariHesapId === selectedCari.id);
    if (detailDateFrom) items = items.filter(h => h.tarih >= detailDateFrom);
    if (detailDateTo) items = items.filter(h => h.tarih <= detailDateTo);
    if (detailFilter === 'alis') items = items.filter(h => h.tip === 'alis_fatura');
    else if (detailFilter === 'satis') items = items.filter(h => h.tip === 'satis_fatura');
    else if (detailFilter === 'odeme') items = items.filter(h => h.tip === 'odeme');
    else if (detailFilter === 'tahsilat') items = items.filter(h => h.tip === 'tahsilat');
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [selectedCari, cariHareketler, detailDateFrom, detailDateTo, detailFilter]);

  const detailStats = useMemo(() => {
    if (!selectedCari) return { alis: 0, satis: 0, odeme: 0, tahsilat: 0 };
    const h = cariHareketler.filter(x => x.cariHesapId === selectedCari.id);
    return {
      alis: h.filter(x => x.tip === 'alis_fatura').reduce((s, x) => s + x.tutar, 0),
      satis: h.filter(x => x.tip === 'satis_fatura').reduce((s, x) => s + x.tutar, 0),
      odeme: h.filter(x => x.tip === 'odeme').reduce((s, x) => s + x.tutar, 0),
      tahsilat: h.filter(x => x.tip === 'tahsilat').reduce((s, x) => s + x.tutar, 0),
    };
  }, [selectedCari, cariHareketler]);

  const panelHareketler = useMemo(() => {
    if (!selectedCari) return [];
    return cariHareketler
      .filter(h => h.cariHesapId === selectedCari.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
  }, [selectedCari, cariHareketler]);

  const tipLabel = (t: string) => {
    const labels: Record<string, string> = {
      alis_fatura: 'Alis Faturasi',
      satis_fatura: 'Satis Faturasi',
      odeme: 'Odeme',
      tahsilat: 'Tahsilat',
      iade_al: 'Iade Al',
      iade_ver: 'Iade Ver',
    };
    return labels[t] || t;
  };

  const tipBadge = (t: string) => {
    if (t === 'alis_fatura') return <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-red-100 text-red-700">Alis Faturasi</span>;
    if (t === 'satis_fatura') return <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-green-100 text-green-700">Satis Faturasi</span>;
    if (t === 'odeme') return <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-blue-100 text-blue-700">Odeme</span>;
    if (t === 'tahsilat') return <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-purple-100 text-purple-700">Tahsilat</span>;
    if (t === 'iade_al') return <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-indigo-100 text-indigo-700">Iade Al</span>;
    if (t === 'iade_ver') return <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-pink-100 text-pink-700">Iade Ver</span>;
    return <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-gray-100 text-gray-600">{t}</span>;
  };

  // ========== DETAIL VIEW ==========
  if (detailOpen && selectedCari) {
    const cariNotlar = notlar.filter(n => n.cariId === selectedCari.id);
    const allH = cariHareketler.filter(h => h.cariHesapId === selectedCari.id).sort((a, b) => b.tarih.localeCompare(a.tarih) || b.createdAt.localeCompare(a.createdAt));

    const sortedAsc = [...allH].sort((a, b) => a.tarih.localeCompare(b.tarih) || a.createdAt.localeCompare(b.createdAt));
    let runBalance = 0;
    const balanceMap = new Map<string, number>();
    sortedAsc.forEach(h => {
      if (h.tip === 'alis_fatura' || h.tip === 'tahsilat') runBalance += h.tutar;
      else runBalance -= h.tutar;
      balanceMap.set(h.id, runBalance);
    });

    let dokumItems = allH;
    if (detailFilter === 'alis') dokumItems = dokumItems.filter(h => h.tip === 'alis_fatura');
    else if (detailFilter === 'satis') dokumItems = dokumItems.filter(h => h.tip === 'satis_fatura');
    else if (detailFilter === 'odeme') dokumItems = dokumItems.filter(h => h.tip === 'odeme');
    else if (detailFilter === 'tahsilat') dokumItems = dokumItems.filter(h => h.tip === 'tahsilat');
    if (detailDateFrom) dokumItems = dokumItems.filter(h => h.tarih >= detailDateFrom);
    if (detailDateTo) dokumItems = dokumItems.filter(h => h.tarih <= detailDateTo);

    const acikIslemler = allH.filter(h => h.tip === 'alis_fatura' || h.tip === 'satis_fatura');

    const toplamAlis = allH.filter(h => h.tip === 'alis_fatura').reduce((s, h) => s + h.tutar, 0);
    const toplamSatis = allH.filter(h => h.tip === 'satis_fatura').reduce((s, h) => s + h.tutar, 0);
    const toplamOdeme = allH.filter(h => h.tip === 'odeme').reduce((s, h) => s + h.tutar, 0);
    const toplamTahsilat = allH.filter(h => h.tip === 'tahsilat').reduce((s, h) => s + h.tutar, 0);

    const dokumTabs = ['dokum', 'acik', 'belgeler', 'iletisim', 'notlar'];
    const dokumTabLabels: Record<string, string> = { dokum: 'Hesap Dokumu', acik: 'Acik Faturalar', belgeler: 'Belgeler', iletisim: 'Iletisim', notlar: 'Notlar' };

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <button onClick={() => setDetailOpen(false)} className="hover:text-[#6c63ff] flex items-center gap-1"><ChevronLeft size={12} /> Cari Hesaplar</button>
          <span>{'>'}</span>
          <span className="text-gray-700 font-medium">{selectedCari.ad}</span>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">{selectedCari.ad}</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => openHareketModal(selectedCari, 'odeme')} className="px-2 py-1.5 text-[10px] font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-1">Odeme Yap</button>
            <button onClick={() => openHareketModal(selectedCari, 'tahsilat')} className="px-2 py-1.5 text-[10px] font-medium bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 flex items-center gap-1">Tahsilat Al</button>
            <button onClick={() => openHareketModal(selectedCari, 'alis_fatura')} className="px-2 py-1.5 text-[10px] font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 flex items-center gap-1">Alis Faturasi</button>
            <button onClick={() => openHareketModal(selectedCari, 'satis_fatura')} className="px-2 py-1.5 text-[10px] font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 flex items-center gap-1">Satis Faturasi</button>
            <button onClick={() => exportPDF(selectedCari)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Download size={14} /></button>
            <button onClick={() => openCariModal(selectedCari)} className="p-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50"><Edit2 size={14} /></button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3">
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <p className="text-[9px] text-gray-400 mb-1">Toplam Alis</p>
            <p className="text-lg font-bold text-red-600">₺{fmt(toplamAlis)}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <p className="text-[9px] text-gray-400 mb-1">Toplam Satis</p>
            <p className="text-lg font-bold text-green-600">₺{fmt(toplamSatis)}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <p className="text-[9px] text-gray-400 mb-1">Net Bakiye</p>
            <p className={`text-lg font-bold ${selectedCari.bakiye > 0 ? 'text-red-600' : selectedCari.bakiye < 0 ? 'text-green-600' : 'text-gray-500'}`}>
              ₺{fmt(Math.abs(selectedCari.bakiye))}
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <p className="text-[9px] text-gray-400 mb-1">Odeme Yapilan</p>
            <p className="text-lg font-bold text-blue-600">₺{fmt(toplamOdeme)}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <p className="text-[9px] text-gray-400 mb-1">Tahsilat Alinan</p>
            <p className="text-lg font-bold text-purple-600">₺{fmt(toplamTahsilat)}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-1 px-4 border-b border-gray-100">
            {dokumTabs.map(t => (
              <button key={t} onClick={() => setDetailTab(t)} className={`px-3 py-3 text-[11px] font-medium border-b-2 transition-colors ${detailTab === t ? 'border-[#6c63ff] text-[#6c63ff]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{dokumTabLabels[t]}</button>
            ))}
          </div>

          <div className="p-4">
            {detailTab === 'dokum' && (
              <div>
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <div className="relative flex-1 min-w-[150px]">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Islem ara..." className="w-full pl-8 pr-3 py-1.5 text-[10px] border border-gray-200 rounded-lg outline-none" />
                  </div>
                  <select value={detailFilter} onChange={e => setDetailFilter(e.target.value)} className="px-2.5 py-1.5 text-[10px] border border-gray-200 rounded-lg">
                    <option value="all">Islem Turu: Tumu</option>
                    <option value="alis">Alis Faturasi</option>
                    <option value="satis">Satis Faturasi</option>
                    <option value="odeme">Odeme</option>
                    <option value="tahsilat">Tahsilat</option>
                  </select>
                  <select className="px-2.5 py-1.5 text-[10px] border border-gray-200 rounded-lg" onChange={e => { const v = e.target.value; const now = new Date(); if (v === 'bu_ay') { setDetailDateFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`); setDetailDateTo(now.toISOString().split('T')[0]); } else if (v === 'son_3') { const d = new Date(now); d.setMonth(d.getMonth()-3); setDetailDateFrom(d.toISOString().split('T')[0]); setDetailDateTo(now.toISOString().split('T')[0]); } else if (v === 'son_6') { const d = new Date(now); d.setMonth(d.getMonth()-6); setDetailDateFrom(d.toISOString().split('T')[0]); setDetailDateTo(now.toISOString().split('T')[0]); } else if (v === 'bu_yil') { setDetailDateFrom(`${now.getFullYear()}-01-01`); setDetailDateTo(now.toISOString().split('T')[0]); } else { setDetailDateFrom(''); setDetailDateTo(''); } }}>
                    <option value="all">Tarih Araligi: Tumu</option>
                    <option value="bu_ay">Bu Ay</option>
                    <option value="son_3">Son 3 Ay</option>
                    <option value="son_6">Son 6 Ay</option>
                    <option value="bu_yil">Bu Yil</option>
                  </select>
                  <button onClick={() => exportPDF(selectedCari)} className="px-3 py-1.5 text-[10px] border border-red-200 rounded-lg text-red-600 flex items-center gap-1 hover:bg-red-50"><FileText size={10} /> PDF</button>
                </div>

                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400">
                      <th className="text-left py-2 px-2 font-medium">Tarih</th>
                      <th className="text-left py-2 px-2 font-medium">Islem Turu</th>
                      <th className="text-left py-2 px-2 font-medium">Aciklama</th>
                      <th className="text-right py-2 px-2 font-medium">Borc (+)</th>
                      <th className="text-right py-2 px-2 font-medium">Alacak (+)</th>
                      <th className="text-right py-2 px-2 font-medium">Bakiye</th>
                      <th className="center py-2 px-2 font-medium">Durum</th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dokumItems.map((h) => {
                      const isBorc = h.tip === 'alis_fatura' || h.tip === 'tahsilat';
                      const isAlacak = h.tip === 'satis_fatura' || h.tip === 'odeme';
                      const bal = balanceMap.get(h.id) || 0;
                      return (
                        <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-2.5 px-2 text-gray-600">{h.tarih}</td>
                          <td className="py-2.5 px-2">{tipBadge(h.tip)}</td>
                          <td className="py-2.5 px-2 text-gray-700">{h.aciklama}</td>
                          <td className="py-2.5 px-2 text-right text-red-600">{isBorc ? '₺' + fmt(h.tutar) : <span className="text-gray-300">₺0</span>}</td>
                          <td className="py-2.5 px-2 text-right text-green-600">{isAlacak ? '₺' + fmt(h.tutar) : <span className="text-gray-300">₺0</span>}</td>
                          <td className={`py-2.5 px-2 text-right font-semibold ${bal > 0 ? 'text-red-600' : bal < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                            ₺{fmt(Math.abs(bal))}
                          </td>
                          <td className="py-2.5 px-2 text-center"><span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${isAlacak ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>{isAlacak ? 'Tamamlandi' : 'Acik'}</span></td>
                          <td className="py-2.5 px-2"><button onClick={() => setDeleteHareketId(h.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={10} /></button></td>
                        </tr>
                      );
                    })}
                    {dokumItems.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">Hareket bulunamadi</td></tr>}
                  </tbody>
                  {dokumItems.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-gray-200 font-semibold">
                        <td colSpan={3} className="py-2.5 px-2 text-gray-700">Toplam</td>
                        <td className="py-2.5 px-2 text-right text-red-600">₺{fmt(dokumItems.filter(h => h.tip === 'alis_fatura' || h.tip === 'tahsilat').reduce((s, h) => s + h.tutar, 0))}</td>
                        <td className="py-2.5 px-2 text-right text-green-600">₺{fmt(dokumItems.filter(h => h.tip === 'satis_fatura' || h.tip === 'odeme').reduce((s, h) => s + h.tutar, 0))}</td>
                        <td className={`py-2.5 px-2 text-right ${selectedCari.bakiye > 0 ? 'text-red-600' : selectedCari.bakiye < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                          ₺{fmt(Math.abs(selectedCari.bakiye))}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {detailTab === 'acik' && (
              <div>
                <p className="text-xs text-gray-500 mb-3">Acik faturalar ({acikIslemler.length} adet)</p>
                <table className="w-full text-[10px]">
                  <thead><tr className="border-b border-gray-200 text-gray-400"><th className="text-left py-2">Tarih</th><th className="text-left py-2">Aciklama</th><th className="text-right py-2">Tutar</th><th className="text-left py-2">Tip</th></tr></thead>
                  <tbody>{acikIslemler.map(h => (<tr key={h.id} className="border-b border-gray-50"><td className="py-2 text-gray-600">{h.tarih}</td><td className="py-2 text-gray-700">{h.aciklama}</td><td className="py-2 text-right font-medium text-gray-700">₺{fmt(h.tutar)}</td><td className="py-2">{tipBadge(h.tip)}</td></tr>))}{acikIslemler.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-gray-400">Acik fatura yok</td></tr>}</tbody>
                </table>
              </div>
            )}

            {detailTab === 'belgeler' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] text-gray-500">Yuklu belgeler</p>
                  <button onClick={addBelge} className="px-3 py-1.5 text-[10px] bg-[#6c63ff] text-white rounded-lg hover:bg-[#5b54e6] flex items-center gap-1"><Upload size={11} /> Belge Yukle</button>
                </div>
                <div className="space-y-2">
                  {belgeler.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2"><FileText size={14} className="text-blue-500" /><div><p className="text-[11px] font-medium text-gray-700">{b.ad}</p><p className="text-[9px] text-gray-400">{b.tarih}</p></div></div>
                      <button onClick={() => setBelgeler(prev => prev.filter(x => x.id !== b.id))} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                    </div>
                  ))}
                  {belgeler.length === 0 && <p className="text-center text-[10px] text-gray-400 py-6">Henuz belge yuklenmedi</p>}
                </div>
              </div>
            )}

            {detailTab === 'iletisim' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3"><p className="text-[9px] text-gray-400 mb-1">Telefon</p><p className="text-sm font-medium text-gray-700">{selectedCari.telefon || '-'}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3"><p className="text-[9px] text-gray-400 mb-1">E-posta</p><p className="text-sm font-medium text-gray-700">{selectedCari.email || '-'}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3"><p className="text-[9px] text-gray-400 mb-1">Adres</p><p className="text-sm font-medium text-gray-700">{selectedCari.adres || '-'}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3"><p className="text-[9px] text-gray-400 mb-1">Para Cinsi</p><p className="text-sm font-medium text-gray-700">{selectedCari.paraCinsi}</p></div>
                </div>
              </div>
            )}

            {detailTab === 'notlar' && (
              <div>
                <div className="flex gap-2 mb-3">
                  <input value={notInput} onChange={e => setNotInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNot()} placeholder="Not ekle..." className="flex-1 px-3 py-1.5 text-[11px] border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-[#6c63ff]/30" />
                  <button onClick={addNot} className="px-3 py-1.5 text-[10px] bg-[#6c63ff] text-white rounded-lg hover:bg-[#5b54e6]">Ekle</button>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {cariNotlar.map(n => (
                    <div key={n.id} className="flex items-start justify-between p-2.5 bg-gray-50 rounded-lg">
                      <div><p className="text-[11px] text-gray-700">{n.metin}</p><p className="text-[9px] text-gray-400">{n.tarih}</p></div>
                      <button onClick={() => setNotlar(prev => prev.filter(x => x.id !== n.id))} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={11} /></button>
                    </div>
                  ))}
                  {cariNotlar.length === 0 && <p className="text-center text-[10px] text-gray-400 py-4">Henuz not eklenmedi.</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        <Modal isOpen={hareketModalOpen} onClose={() => setHareketModalOpen(false)} title={`${tipLabel(hareketTip)} - ${hareketTarget?.ad || ''}`}>
          <form onSubmit={handleHareketSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tarih</label><input type="date" required value={hareketForm.tarih} onChange={e => setHareketForm({...hareketForm, tarih: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
              <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Saat</label><input type="time" required value={hareketForm.saat} onChange={e => setHareketForm({...hareketForm, saat: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
            </div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tutar</label><MoneyInput value={hareketForm.tutar} onChange={v => setHareketForm({...hareketForm, tutar: v})} required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Aciklama</label><input required value={hareketForm.aciklama} onChange={e => setHareketForm({...hareketForm, aciklama: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
            <div className="flex gap-2 justify-end"><button type="button" onClick={() => setHareketModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Iptal</button><button type="submit" className="px-5 py-2 text-sm bg-[#6c63ff] text-white rounded-lg">Kaydet</button></div>
          </form>
        </Modal>
        <ConfirmDialog isOpen={!!deleteHareketId} onClose={() => setDeleteHareketId(null)} onConfirm={() => { if (deleteHareketId) deleteCariHareket(deleteHareketId); setDeleteHareketId(null); }} title="Hareket Sil" message="Bu hareketi silmek istediginizden emin misiniz?" />
      </div>
    );
  }

  // ========== LIST VIEW ==========
  return (
    <div className="space-y-3">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Cari Hesaplar</h1>
          <p className="text-[11px] text-gray-400">Cari hesaplarinizin hareketlerini takip edin.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[11px] font-medium">
            <Calendar size={13} />
            {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}
          </div>
          <button onClick={() => openCariModal()} className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6c63ff] text-white rounded-lg text-xs font-medium hover:bg-[#5b54e6] transition-colors">
            <Plus size={14} /> Yeni Cari
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm flex items-center justify-between hover:border-[#6c63ff]/30 transition-colors cursor-default">
          <div>
            <p className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Toplam Cari</p>
            <p className="text-xl font-bold text-gray-800 mt-0.5">{cariHesaplar.length}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center"><Users size={15} className="text-violet-500" /></div>
        </div>
        <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm flex items-center justify-between hover:border-green-200 transition-colors cursor-default">
          <div>
            <p className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Toplam Alacak</p>
            <p className="text-xl font-bold text-green-600 mt-0.5">₺{fmt(toplamAlacak)}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{alacakliSayisi} cari</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center"><TrendingUp size={15} className="text-green-500" /></div>
        </div>
        <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm flex items-center justify-between hover:border-red-200 transition-colors cursor-default">
          <div>
            <p className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Toplam Borc</p>
            <p className="text-xl font-bold text-red-500 mt-0.5">₺{fmt(toplamBorc)}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{borcluSayisi} cari</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center"><TrendingDown size={15} className="text-red-500" /></div>
        </div>
        <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm flex items-center justify-between hover:border-blue-200 transition-colors cursor-default">
          <div>
            <p className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Net Durum</p>
            <p className={`text-xl font-bold mt-0.5 ${netBakiye > 0 ? 'text-red-500' : netBakiye < 0 ? 'text-green-600' : 'text-gray-500'}`}>
              ₺{fmt(Math.abs(netBakiye))}
            </p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><DollarSign size={15} className="text-blue-500" /></div>
        </div>
      </div>

      {/* Hizli Islemler - Neumorphism Soft */}
      <div className="flex flex-wrap gap-2.5">
        {HIZLI_ACTIONS.map(a => {
          const Icon = a.icon;
          return (
            <button key={a.tip} onClick={() => openHizliModal(a.tip, a.label)} className="flex items-center gap-2.5 pl-2.5 pr-4 py-2 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_6px_18px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 ${a.bg}`}><Icon size={16} /></div>
              <div className="text-left">
                <p className="text-[12px] font-semibold text-gray-800 leading-tight">{a.label}</p>
                <p className="text-[9px] text-gray-400 leading-tight">{a.sub}</p>
              </div>
            </button>
          );
        })}
        <button onClick={() => openCariModal()} className="flex items-center gap-2.5 pl-2.5 pr-4 py-2 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_6px_18px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[#6c63ff] bg-[#6c63ff]/10 shrink-0"><Plus size={18} /></div>
          <div className="text-left">
            <p className="text-[12px] font-semibold text-[#6c63ff] leading-tight">Yeni Cari</p>
            <p className="text-[9px] text-gray-400 leading-tight">Cari Ekle</p>
          </div>
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Cari ara..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full pl-7 pr-3 py-1.5 text-[11px] border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-[#6c63ff]/30" />
          </div>
          <select value={filterGrup} onChange={e => { setFilterGrup(e.target.value); setPage(1); }} className="px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg outline-none bg-white">
            <option value="all">Tum Gruplar</option>
          </select>
          <select value={filterBakiye} onChange={e => { setFilterBakiye(e.target.value); setPage(1); }} className="px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg outline-none bg-white">
            <option value="all">Bakiye Durumu</option>
            <option value="borclu">Borcluyum</option>
            <option value="alacakli">Alacakliyim</option>
            <option value="sifir">Sifir</option>
          </select>
          <button onClick={() => { setSearch(''); setFilterGrup('all'); setFilterBakiye('all'); setPage(1); }} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            <Filter size={12} /> Filtrele
          </button>
          <span className="ml-auto text-[10px] text-gray-400">{filtered.length} kayit</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Cari Adi</th>
                <th className="text-left px-3 py-2.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Grup</th>
                <th className="text-left px-3 py-2.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Telefon</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-semibold text-red-500 uppercase tracking-wide">Borc (+)</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-semibold text-green-500 uppercase tracking-wide">Alacak (+)</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Net Bakiye</th>
                <th className="text-center px-3 py-2.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Son Hareket</th>
                <th className="text-center px-3 py-2.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Islemler</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(item => {
                const initials = item.ad.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                const borcum = item.bakiye > 0 ? item.bakiye : 0; // benim borcum
                const alacagim = item.bakiye < 0 ? Math.abs(item.bakiye) : 0; // benim alacagim
                const avatarColor = item.bakiye > 0 ? 'bg-red-500' : item.bakiye < 0 ? 'bg-green-500' : 'bg-gray-400';
                return (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-3 py-2.5">
                      <button onClick={() => setRowActionCari(item)} className="flex items-center gap-2 group">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0 ${avatarColor}`}>{initials}</div>
                        <span className="font-medium text-gray-800 truncate max-w-[130px] group-hover:text-[#6c63ff] transition-colors">{item.ad}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 text-[10px]">-</td>
                    <td className="px-3 py-2.5 text-gray-500 text-[10px]">{item.telefon || '-'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-red-500">{borcum > 0 ? `₺${fmt(borcum)}` : <span className="text-gray-300 font-normal">-</span>}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-green-600">{alacagim > 0 ? `₺${fmt(alacagim)}` : <span className="text-gray-300 font-normal">-</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-bold ${item.bakiye > 0 ? 'text-red-500' : item.bakiye < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        {item.bakiye !== 0 ? `₺${fmt(Math.abs(item.bakiye))}` : '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-400 text-[9px]">{item.sonHareketTarihi || '-'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button title="Hizli Islem" onClick={() => setRowActionCari(item)} className="flex items-center gap-1 px-2 py-1.5 text-[9px] font-semibold bg-[#6c63ff]/10 text-[#6c63ff] rounded-lg hover:bg-[#6c63ff]/20 transition-colors"><Zap size={11} /> Islem</button>
                        <button title="Detay" onClick={() => { setSelectedCari(item); setDetailTab('dokum'); setDetailOpen(true); }} className="p-1.5 rounded-lg hover:bg-violet-100 text-violet-500 transition-colors"><Eye size={13} /></button>
                        <button title="Duzenle" onClick={() => openCariModal(item)} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-500 transition-colors"><Edit2 size={13} /></button>
                        <button title="Sil" onClick={() => setDeleteId(item.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-[11px]"><Users size={28} className="mx-auto mb-2 text-gray-200" />Kayit bulunamadi</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-3 py-2.5 border-t border-gray-100 bg-gray-50/50">
          <span className="text-[10px] text-gray-400">Toplam {filtered.length} cari</span>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 text-gray-400 disabled:opacity-30 hover:text-gray-600"><ChevronLeft size={13} /></button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} className={`w-6 h-6 rounded text-[10px] font-medium ${page === p ? 'bg-[#6c63ff] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 text-gray-400 disabled:opacity-30 hover:text-gray-600"><ChevronRight size={13} /></button>
          </div>
          <div className="flex items-center gap-1">
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} className="px-1.5 py-0.5 text-[10px] border border-gray-200 rounded-lg outline-none bg-white">
              <option value={10}>10/sayfa</option>
              <option value={20}>20/sayfa</option>
              <option value={50}>50/sayfa</option>
            </select>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={cariModalOpen} onClose={() => setCariModalOpen(false)} title={editCari ? 'Cari Duzenle' : 'Yeni Cari Kart'}>
        <form onSubmit={handleCariSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="block text-[10px] font-medium text-gray-600 mb-1">Ad / Firma</label><input required value={cariForm.ad} onChange={e => setCariForm({...cariForm, ad: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="Cari hesap adi..." /></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Para Cinsi</label><select value={cariForm.paraCinsi} onChange={e => setCariForm({...cariForm, paraCinsi: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg">{paraCinsleri.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Telefon</label><input value={cariForm.telefon} onChange={e => setCariForm({...cariForm, telefon: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="0532 ..." /></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">E-posta</label><input value={cariForm.email} onChange={e => setCariForm({...cariForm, email: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="info@..." /></div>
            <div className="col-span-2"><label className="block text-[10px] font-medium text-gray-600 mb-1">Adres</label><input value={cariForm.adres} onChange={e => setCariForm({...cariForm, adres: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="Sehir / Adres" /></div>
          </div>
          <div className="flex gap-2 justify-end"><button type="button" onClick={() => setCariModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Iptal</button><button type="submit" className="px-5 py-2 text-sm bg-[#6c63ff] text-white rounded-lg">{editCari ? 'Guncelle' : 'Kaydet'}</button></div>
        </form>
      </Modal>

      <Modal isOpen={hareketModalOpen} onClose={() => setHareketModalOpen(false)} title={`${tipLabel(hareketTip)} - ${hareketTarget?.ad || ''}`}>
        <form onSubmit={handleHareketSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tarih</label><input type="date" required value={hareketForm.tarih} onChange={e => setHareketForm({...hareketForm, tarih: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Saat</label><input type="time" required value={hareketForm.saat} onChange={e => setHareketForm({...hareketForm, saat: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          </div>
          <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tutar</label><MoneyInput value={hareketForm.tutar} onChange={v => setHareketForm({...hareketForm, tutar: v})} required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Aciklama</label><input required value={hareketForm.aciklama} onChange={e => setHareketForm({...hareketForm, aciklama: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          <div className="flex gap-2 justify-end"><button type="button" onClick={() => setHareketModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Iptal</button><button type="submit" className="px-5 py-2 text-sm bg-[#6c63ff] text-white rounded-lg">Kaydet</button></div>
        </form>
      </Modal>

      <Modal isOpen={hizliModalOpen} onClose={() => setHizliModalOpen(false)} title={`Hizli Islem – ${hizliTipLabel}`}>
        <form onSubmit={handleHizliSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-1">Cari Sec</label>
            <select required value={hizliSelectedCariId} onChange={e => setHizliSelectedCariId(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-[#6c63ff]/30">
              <option value="">— Cari seciniz —</option>
              {cariHesaplar.map(c => (<option key={c.id} value={c.id}>{c.ad}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tarih</label><input type="date" required value={hizliForm.tarih} onChange={e => setHizliForm({...hizliForm, tarih: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Saat</label><input type="time" required value={hizliForm.saat} onChange={e => setHizliForm({...hizliForm, saat: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          </div>
          <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tutar</label><MoneyInput value={hizliForm.tutar} onChange={v => setHizliForm({...hizliForm, tutar: v})} required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Aciklama</label><input required value={hizliForm.aciklama} onChange={e => setHizliForm({...hizliForm, aciklama: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          <div className="flex gap-2 justify-end"><button type="button" onClick={() => setHizliModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Iptal</button><button type="submit" className="px-5 py-2 text-sm bg-[#6c63ff] text-white rounded-lg">Kaydet</button></div>
        </form>
      </Modal>

      {/* Satira tiklayinca acilan hizli islem modali */}
      <Modal isOpen={!!rowActionCari} onClose={() => setRowActionCari(null)} title={rowActionCari?.ad || ''}>
        {rowActionCari && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
              <div>
                <p className="text-[10px] text-gray-400">Guncel Bakiye</p>
                <p className={`text-lg font-bold ${rowActionCari.bakiye > 0 ? 'text-red-600' : rowActionCari.bakiye < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                  ₺{fmt(Math.abs(rowActionCari.bakiye))}
                  <span className="text-[10px] font-medium ml-1.5">{rowActionCari.bakiye > 0 ? '(Borcum)' : rowActionCari.bakiye < 0 ? '(Alacagim)' : ''}</span>
                </p>
              </div>
              {rowActionCari.telefon && <div className="text-right"><p className="text-[10px] text-gray-400">Telefon</p><p className="text-xs font-medium text-gray-700">{rowActionCari.telefon}</p></div>}
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {HIZLI_ACTIONS.map(a => {
                const Icon = a.icon;
                return (
                  <button key={a.tip} onClick={() => handleRowAction(a.tip)} className="flex flex-col items-center gap-1.5 px-2 py-3 bg-white rounded-xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_6px_18px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${a.bg}`}><Icon size={18} /></div>
                    <p className="text-[11px] font-semibold text-gray-800 leading-tight text-center">{a.label}</p>
                    <p className="text-[8px] text-gray-400 leading-tight">{a.sub}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <button onClick={() => { const c = rowActionCari; setRowActionCari(null); setSelectedCari(c); setDetailTab('dokum'); setDetailOpen(true); }} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100"><Eye size={13} /> Detay</button>
              <button onClick={() => exportPDF(rowActionCari)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><FileText size={13} /> PDF</button>
              <button onClick={() => { const c = rowActionCari; setRowActionCari(null); openCariModal(c); }} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"><Edit2 size={13} /> Duzenle</button>
              <button onClick={() => { const id = rowActionCari.id; setRowActionCari(null); setDeleteId(id); }} className="flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Trash2 size={13} /></button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) deleteCariHesap(deleteId); setDeleteId(null); }} title="Cari Sil" message="Bu cari hesabi silmek istediginizden emin misiniz?" />
      <ConfirmDialog isOpen={!!deleteHareketId} onClose={() => setDeleteHareketId(null)} onConfirm={() => { if (deleteHareketId) deleteCariHareket(deleteHareketId); setDeleteHareketId(null); }} title="Hareket Sil" message="Bu hareketi silmek istediginizden emin misiniz?" />
    </div>
  );
}
