import MoneyInput from '../components/MoneyInput';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { allMenuItems } from '../lib/menu';
import { Landmark, ArrowUpRight, ArrowDownRight, Plus, Eye, EyeOff, GripVertical, TrendingUp, RefreshCw, Brain, AlertTriangle, Lightbulb, Target, Wallet, Pencil, Check, CreditCard, PiggyBank } from 'lucide-react';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import Modal from '../components/Modal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const WIDGET_DEFS: { id: string; title: string; defaultSpan: number }[] = [
  { id: 'gelirgider', title: 'Gelir - Gider Trendi', defaultSpan: 6 },
  { id: 'borcgrup', title: 'Borc Dagilimi', defaultSpan: 3 },
  { id: 'hesaplar', title: 'Hesap Bakiyeleri', defaultSpan: 3 },
  { id: 'kategori', title: 'Kategori Bazli Gider', defaultSpan: 4 },
  { id: 'nakitozet', title: 'Nakit Akis Ozeti', defaultSpan: 4 },
  { id: 'sonislemler', title: 'Son Islemler', defaultSpan: 4 },
  { id: 'aylik', title: 'Aylik Karsilastirma', defaultSpan: 6 },
  { id: 'butce', title: 'Butce Durumu', defaultSpan: 6 },
  { id: 'odemeprogram', title: 'Odeme Programi', defaultSpan: 12 },
  { id: 'ai', title: 'Yapay Zeka Tavsiyeleri', defaultSpan: 12 },
];

const loadLS = (k: string, def: any) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };

export default function Dashboard() {
  const { cariHesaplar, cariHareketler, hareketler, kasaBanka, krediKartlari, birikimHesaplari, cekler, duzenliOdemeler, emanetParalar, addHareket } = useApp();
  const { user, canAccess } = useAuth();
  const adKisa = (user?.fullName || 'Kullanici').split(' ')[0];
  const dashShortcuts = (Array.isArray(user?.prefs?.shortcuts) ? user!.prefs!.shortcuts : ['/canli-yayin', '/kasa-satis', '/siparisler', '/depo/urunlerim', '/musterilerim'])
    .map((to: string) => allMenuItems.find((m) => m.to === to))
    .filter((m): m is NonNullable<typeof m> => !!m && canAccess(m.to))
    .slice(0, 6);
  const navigate = useNavigate();
  const [yeniIslemOpen, setYeniIslemOpen] = useState(false);
  const [periyot, setPeriyot] = useState('tumu');
  const [dateFrom, setDateFrom] = useState('2000-01-01');
  const [dateTo, setDateTo] = useState('2099-12-31');
  const [odemeHorizon, setOdemeHorizon] = useState('ay');
  const [islemForm, setIslemForm] = useState({ tarih: new Date().toISOString().split('T')[0], saat: new Date().toTimeString().slice(0, 5), aciklama: '', tutar: '', tip: 'gelir' as 'gelir' | 'gider', kategori: 'Tahsilat' });

  // --- Widget düzenleme durumu ---
  const [editMode, setEditMode] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>(() => {
    const ids = WIDGET_DEFS.map(w => w.id);
    const saved = loadLS('dash_order_v2', null);
    if (!saved || !Array.isArray(saved)) return ids;
    const merged = saved.filter((id: string) => ids.includes(id));
    ids.forEach(id => { if (!merged.includes(id)) merged.push(id); });
    return merged;
  });
  const [hidden, setHidden] = useState<Record<string, boolean>>(() => loadLS('dash_hidden_v2', {}));
  const [spans, setSpans] = useState<Record<string, number>>(() => {
    const saved = loadLS('dash_spans_v2', {});
    const base: Record<string, number> = {};
    WIDGET_DEFS.forEach(w => { base[w.id] = saved[w.id] ?? w.defaultSpan; });
    return base;
  });
  useEffect(() => { localStorage.setItem('dash_order_v2', JSON.stringify(order)); }, [order]);
  useEffect(() => { localStorage.setItem('dash_hidden_v2', JSON.stringify(hidden)); }, [hidden]);
  useEffect(() => { localStorage.setItem('dash_spans_v2', JSON.stringify(spans)); }, [spans]);

  const resetLayout = () => {
    const ids = WIDGET_DEFS.map(w => w.id);
    setOrder(ids); setHidden({});
    const base: Record<string, number> = {}; WIDGET_DEFS.forEach(w => { base[w.id] = w.defaultSpan; }); setSpans(base);
  };
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    setOrder(prev => { const arr = [...prev]; const from = arr.indexOf(dragId); const to = arr.indexOf(targetId); arr.splice(from, 1); arr.splice(to, 0, dragId); return arr; });
    setDragId(null);
  };

  const setPeriyotAndDates = (p: string) => {
    setPeriyot(p);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (p === 'gunluk') { setDateFrom(today); setDateTo(today); }
    else if (p === 'haftalik') { const d = new Date(now); d.setDate(now.getDate() - 7); setDateFrom(d.toISOString().split('T')[0]); setDateTo(today); }
    else if (p === 'aylik') { const d = new Date(now); d.setMonth(now.getMonth() - 1); setDateFrom(d.toISOString().split('T')[0]); setDateTo(today); }
    else if (p === '6aylik') { const d = new Date(now); d.setMonth(now.getMonth() - 6); setDateFrom(d.toISOString().split('T')[0]); setDateTo(today); }
    else if (p === 'yillik') { const d = new Date(now); d.setFullYear(now.getFullYear() - 1); setDateFrom(d.toISOString().split('T')[0]); setDateTo(today); }
    else if (p === 'tumu') { setDateFrom('2000-01-01'); setDateTo('2099-12-31'); }
  };

  const handleYeniIslem = (e: React.FormEvent) => { e.preventDefault(); addHareket({ tarih: islemForm.tarih, saat: islemForm.saat, aciklama: islemForm.aciklama, tutar: Number(islemForm.tutar), tip: islemForm.tip, kategori: islemForm.kategori }); setYeniIslemOpen(false); setIslemForm({ tarih: new Date().toISOString().split('T')[0], saat: new Date().toTimeString().slice(0, 5), aciklama: '', tutar: '', tip: 'gelir', kategori: 'Tahsilat' }); };

  const fmt = (v: number) => Math.round(v).toLocaleString('tr-TR');

  // --- Likit (Kasa = nakit + banka + birikim) ---
  const kasaToplam = kasaBanka.filter(k => k.tip === 'kasa').reduce((s, k) => s + k.bakiye, 0);
  const bankaToplam = kasaBanka.filter(k => k.tip === 'banka').reduce((s, k) => s + k.bakiye, 0);
  const birikimToplam = birikimHesaplari.reduce((s, b) => s + b.bakiye, 0);
  const likitToplam = kasaToplam + bankaToplam + birikimToplam;

  // --- Borclarim (gruplu) ---  bakiye > 0 = benim borcum
  const cariBorc = cariHesaplar.filter(c => c.bakiye > 0).reduce((s, c) => s + c.bakiye, 0);
  const cekBorc = cekler.filter(c => c.tip === 'borc' && c.durum === 'bekleyen').reduce((s, c) => s + c.tutar, 0);
  const kkBorc = krediKartlari.reduce((s, k) => s + k.borc, 0);
  const emanetBorc = emanetParalar.filter(e => e.durum === 'aktif').reduce((s, e) => s + e.tutar, 0);
  const krediBorc = 0;
  const toplamBorc = cariBorc + cekBorc + kkBorc + emanetBorc + krediBorc;

  // --- Alacaklarim (gruplu) ---  bakiye < 0 = benim alacagim
  const cariAlacak = cariHesaplar.filter(c => c.bakiye < 0).reduce((s, c) => s + Math.abs(c.bakiye), 0);
  const cekAlacak = cekler.filter(c => c.tip === 'alacak' && c.durum === 'bekleyen').reduce((s, c) => s + c.tutar, 0);
  const toplamAlacak = cariAlacak + cekAlacak;

  const netVarlik = likitToplam + toplamAlacak - toplamBorc;

  const borcGruplari = [
    { label: 'Cari Borclarim', value: cariBorc, color: '#ef4444' },
    { label: 'Cek Borclarim', value: cekBorc, color: '#f59e0b' },
    { label: 'K.Karti Borclarim', value: kkBorc, color: '#8b5cf6' },
    { label: 'Kredi Borclarim', value: krediBorc, color: '#6366f1' },
    { label: 'Emanet Borclarim', value: emanetBorc, color: '#06b6d4' },
  ].filter(x => x.value > 0);

  // --- Filtered by date ---
  const filteredHareketler = useMemo(() => hareketler.filter(h => h.tarih >= dateFrom && h.tarih <= dateTo), [hareketler, dateFrom, dateTo]);
  const toplamGelir = filteredHareketler.filter(h => h.tip === 'gelir').reduce((s, h) => s + h.tutar, 0);
  const toplamGider = filteredHareketler.filter(h => h.tip === 'gider').reduce((s, h) => s + h.tutar, 0);
  const netKar = toplamGelir - toplamGider;

  // Önceki dönem (karşılaştırma)
  const periodDays = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000));
  const prevFrom = new Date(new Date(dateFrom).getTime() - periodDays * 86400000).toISOString().split('T')[0];
  const prevTo = new Date(new Date(dateFrom).getTime() - 86400000).toISOString().split('T')[0];
  const prevHareketler = useMemo(() => hareketler.filter(h => h.tarih >= prevFrom && h.tarih <= prevTo), [hareketler, prevFrom, prevTo]);
  const prevGelir = prevHareketler.filter(h => h.tip === 'gelir').reduce((s, h) => s + h.tutar, 0);
  const prevGider = prevHareketler.filter(h => h.tip === 'gider').reduce((s, h) => s + h.tutar, 0);
  const prevNetKar = prevGelir - prevGider;

  const pctChange = (curr: number, prev: number) => { if (prev === 0) return curr > 0 ? '+100' : '0'; return ((curr - prev) / Math.abs(prev) * 100).toFixed(1); };
  const gelirChange = pctChange(toplamGelir, prevGelir);
  const giderChange = pctChange(toplamGider, prevGider);
  const netChange = pctChange(netKar, prevNetKar);

  // Dönem içi cari borç hareketi (gerçek veri): alis_fatura borcu artirir, odeme azaltir
  const filteredCari = useMemo(() => cariHareketler.filter(h => h.tarih >= dateFrom && h.tarih <= dateTo), [cariHareketler, dateFrom, dateTo]);
  const borcArtis = filteredCari.filter(h => h.tip === 'alis_fatura' || h.tip === 'iade_ver').reduce((s, h) => s + h.tutar, 0);
  const borcAzalis = filteredCari.filter(h => h.tip === 'odeme').reduce((s, h) => s + h.tutar, 0);
  const donemBorcHareketi = borcArtis - borcAzalis;

  const gelirGiderChart = useMemo(() => {
    const dates = [...new Set(filteredHareketler.map(h => h.tarih))].sort();
    const gM: Record<string, number> = {}, gdM: Record<string, number> = {};
    filteredHareketler.forEach(h => { if (h.tip === 'gelir') gM[h.tarih] = (gM[h.tarih] || 0) + h.tutar; else gdM[h.tarih] = (gdM[h.tarih] || 0) + h.tutar; });
    const aylar = ['Oca', 'Sub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Agu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return { labels: dates.map(d => { const p = d.split('-'); return `${parseInt(p[2])} ${aylar[parseInt(p[1]) - 1] || ''}`; }), datasets: [{ label: 'Gelir', data: dates.map(d => gM[d] || 0), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: true, tension: 0.4, pointRadius: 2 }, { label: 'Gider', data: dates.map(d => gdM[d] || 0), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', fill: true, tension: 0.4, pointRadius: 2 }] };
  }, [filteredHareketler]);

  const giderChart = useMemo(() => {
    const map: Record<string, number> = {};
    filteredHareketler.filter(h => h.tip === 'gider').forEach(g => { map[g.kategori] = (map[g.kategori] || 0) + g.tutar; });
    const toplam = Object.values(map).reduce((s, v) => s + v, 0);
    const colors = ['#ef4444', '#f59e0b', '#6366f1', '#10b981', '#8b5cf6', '#06b6d4', '#ec4899'];
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return { labels: sorted.map(s => s[0]), data: sorted.map(s => s[1]), colors: colors.slice(0, Math.max(1, sorted.length)), toplam };
  }, [filteredHareketler]);

  const aylikData = useMemo(() => {
    const yil = new Date().getFullYear();
    const gel = Array(12).fill(0), gid = Array(12).fill(0);
    hareketler.forEach(h => { const d = new Date(h.tarih); if (d.getFullYear() === yil) { if (h.tip === 'gelir') gel[d.getMonth()] += h.tutar; else gid[d.getMonth()] += h.tutar; } });
    return { gel, gid };
  }, [hareketler]);

  // --- Ödeme programı ---
  const today = new Date().toISOString().split('T')[0];
  const horizonEnd = useMemo(() => { const d = new Date(); const map: Record<string, number> = { bugun: 0, hafta: 7, ay: 30, '3ay': 90, '6ay': 180, yil: 365, tum: 36500 }; d.setDate(d.getDate() + (map[odemeHorizon] ?? 36500)); return d.toISOString().split('T')[0]; }, [odemeHorizon]);
  const nextDue = (o: any): string => {
    const now = new Date(); const gun = Math.min(o.odemeGunu || 1, 28);
    if (o.periyot === 'aylik') { let d = new Date(now.getFullYear(), now.getMonth(), gun); if (d < now) d = new Date(now.getFullYear(), now.getMonth() + 1, gun); return d.toISOString().split('T')[0]; }
    if (o.periyot === 'yillik') { let d = new Date(now.getFullYear(), 0, gun); if (d < now) d = new Date(now.getFullYear() + 1, 0, gun); return d.toISOString().split('T')[0]; }
    const d = new Date(now); d.setDate(now.getDate() + 7); return d.toISOString().split('T')[0];
  };
  const yaklasanCekler = cekler.filter(c => c.tip === 'borc' && c.durum === 'bekleyen' && c.vadeTarihi >= today && c.vadeTarihi <= horizonEnd).sort((a, b) => a.vadeTarihi.localeCompare(b.vadeTarihi)).slice(0, 5);
  const yaklasanDuzenli = duzenliOdemeler.filter(o => o.durum === 'aktif').map(o => ({ ...o, _due: nextDue(o) })).filter(o => o._due >= today && o._due <= horizonEnd).sort((a, b) => a._due.localeCompare(b._due)).slice(0, 5);
  const cariOdemeleri = cariHesaplar.filter(c => c.bakiye > 0).sort((a, b) => b.bakiye - a.bakiye).slice(0, 5);

  // ====== Widget içerikleri ======
  const renderWidget = (id: string) => {
    switch (id) {
      case 'gelirgider':
        return (<>
          <div className="flex items-center justify-between mb-3"><h3 className="text-[12px] font-semibold text-gray-700">Gelir - Gider Trendi</h3><div className="flex gap-3 text-[10px]"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Gelir</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Gider</span></div></div>
          <div className="h-[180px]">{filteredHareketler.length ? <Line data={gelirGiderChart} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 8 }, callback: (v: any) => `${(v / 1000).toFixed(0)}K` } }, x: { ticks: { font: { size: 8 }, maxRotation: 0 } } } }} /> : <div className="h-full flex items-center justify-center text-[11px] text-gray-400">Bu donemde hareket yok</div>}</div>
        </>);
      case 'borcgrup':
        return (<>
          <div className="flex items-center justify-between mb-3"><h3 className="text-[12px] font-semibold text-gray-700">Borc Dagilimi</h3></div>
          {toplamBorc > 0 ? (<div className="flex flex-col items-center">
            <div className="w-[100px] h-[100px] relative mb-2"><Doughnut data={{ labels: borcGruplari.map(b => b.label), datasets: [{ data: borcGruplari.map(b => b.value), backgroundColor: borcGruplari.map(b => b.color), borderWidth: 0 }] }} options={{ cutout: '68%', plugins: { legend: { display: false } } }} /><div className="absolute inset-0 flex flex-col items-center justify-center"><p className="text-[8px] text-gray-400">Toplam Borc</p><p className="text-[11px] font-bold text-red-500">{fmt(toplamBorc)}</p></div></div>
            <div className="w-full space-y-1">{borcGruplari.map(b => (<div key={b.label} className="flex items-center justify-between text-[9px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />{b.label}</span><span className="font-medium text-gray-700">{fmt(b.value)}</span></div>))}</div>
          </div>) : <div className="h-[120px] flex items-center justify-center text-[11px] text-gray-400">Borc yok</div>}
        </>);
      case 'hesaplar':
        return (<>
          <div className="flex items-center justify-between mb-3"><h3 className="text-[12px] font-semibold text-gray-700">Hesap Bakiyeleri</h3></div>
          <div className="space-y-2.5 max-h-[180px] overflow-y-auto">
            {[...kasaBanka, ...birikimHesaplari.map(b => ({ ...b, tip: 'birikim' as any }))].map((b: any) => (
              <div key={b.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className={`w-6 h-6 rounded-lg flex items-center justify-center ${b.tip === 'kasa' ? 'bg-amber-50' : b.tip === 'birikim' ? 'bg-emerald-50' : 'bg-blue-50'}`}>{b.tip === 'kasa' ? <Wallet size={11} className="text-amber-500" /> : b.tip === 'birikim' ? <PiggyBank size={11} className="text-emerald-500" /> : <Landmark size={11} className="text-blue-500" />}</div><span className="text-[10px] text-gray-700">{b.ad}</span></div>
                <span className="text-[10px] font-bold text-gray-800">{fmt(b.bakiye)}</span>
              </div>
            ))}
            {krediKartlari.map(k => (<div key={k.id} className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-lg flex items-center justify-center bg-purple-50"><CreditCard size={11} className="text-purple-500" /></div><span className="text-[10px] text-gray-700">{k.ad}</span></div><span className="text-[10px] font-bold text-red-500">-{fmt(k.borc)}</span></div>))}
            {kasaBanka.length === 0 && birikimHesaplari.length === 0 && krediKartlari.length === 0 && <p className="text-[10px] text-gray-400">Hesap eklenmemis</p>}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between"><span className="text-[10px] font-medium text-gray-500">Likit Toplam</span><span className="text-[11px] font-bold text-gray-800">{fmt(likitToplam)}</span></div>
          </div>
        </>);
      case 'kategori':
        return (<>
          <div className="flex items-center justify-between mb-3"><h3 className="text-[12px] font-semibold text-gray-700">Kategori Bazli Gider</h3></div>
          <div className="space-y-2">
            {giderChart.labels.length ? giderChart.labels.slice(0, 6).map((label, i) => {
              const pct = giderChart.toplam > 0 ? ((giderChart.data[i] / giderChart.toplam) * 100).toFixed(1) : '0';
              const barWidth = giderChart.toplam > 0 ? Math.round((giderChart.data[i] / giderChart.toplam) * 100) : 0;
              return (<div key={label} className="flex items-center gap-3 text-[10px]"><span className="w-16 text-gray-600 shrink-0 truncate">{label}</span><div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${barWidth}%`, backgroundColor: giderChart.colors[i] }} /></div><span className="text-gray-700 font-medium w-16 text-right">{fmt(giderChart.data[i])}</span><span className="text-gray-400 w-8 text-right">%{pct}</span></div>);
            }) : <p className="text-[11px] text-gray-400">Bu donemde gider yok</p>}
          </div>
        </>);
      case 'nakitozet':
        return (<>
          <h3 className="text-[12px] font-semibold text-gray-700 mb-3">Nakit Akis Ozeti</h3>
          <table className="w-full text-[10px]">
            <thead><tr className="border-b border-gray-100"><th className="text-left py-1.5 text-gray-400 font-medium">Aciklama</th><th className="text-right py-1.5 text-gray-400 font-medium">Tutar</th><th className="text-right py-1.5 text-gray-400 font-medium">Oran</th></tr></thead>
            <tbody>
              <tr className="border-b border-gray-50"><td className="py-1.5 text-gray-700">Toplam Gelir</td><td className="py-1.5 text-right font-bold text-green-500">{fmt(toplamGelir)}</td><td className="py-1.5 text-right text-gray-400">%100</td></tr>
              <tr className="border-b border-gray-50"><td className="py-1.5 text-gray-700">Toplam Gider</td><td className="py-1.5 text-right font-medium text-red-500">{fmt(toplamGider)}</td><td className="py-1.5 text-right text-gray-400">%{toplamGelir > 0 ? ((toplamGider / toplamGelir) * 100).toFixed(1) : 0}</td></tr>
              <tr className="border-b border-gray-50"><td className="py-1.5 text-gray-700">Cari Borc Odemesi</td><td className="py-1.5 text-right font-medium text-gray-700">{fmt(borcAzalis)}</td><td className="py-1.5 text-right text-gray-400">-</td></tr>
              <tr><td className="py-1.5 text-gray-700 font-medium">Net Nakit Akisi</td><td className={`py-1.5 text-right font-bold ${netKar >= 0 ? 'text-blue-500' : 'text-red-500'}`}>{fmt(netKar)}</td><td className="py-1.5 text-right text-gray-400">%{toplamGelir > 0 ? ((netKar / toplamGelir) * 100).toFixed(1) : 0}</td></tr>
            </tbody>
          </table>
        </>);
      case 'sonislemler':
        return (<>
          <div className="flex items-center justify-between mb-3"><h3 className="text-[12px] font-semibold text-gray-700">Son Islemler</h3><button onClick={() => navigate('/gelir-gider')} className="text-[9px] text-[#6c63ff] font-medium hover:underline">Tumunu Gor</button></div>
          <div className="space-y-2">
            {hareketler.length ? hareketler.slice(0, 6).map(h => (
              <div key={h.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className={`w-6 h-6 rounded-lg flex items-center justify-center ${h.tip === 'gelir' ? 'bg-green-50' : 'bg-red-50'}`}>{h.tip === 'gelir' ? <ArrowUpRight size={11} className="text-green-500" /> : <ArrowDownRight size={11} className="text-red-500" />}</div><div><p className="text-[10px] text-gray-700 font-medium truncate max-w-[110px]">{h.aciklama}</p><p className="text-[8px] text-gray-400">{h.tarih}</p></div></div>
                <span className={`text-[10px] font-bold ${h.tip === 'gelir' ? 'text-green-500' : 'text-red-500'}`}>{h.tip === 'gelir' ? '+' : '-'}{fmt(h.tutar)}</span>
              </div>
            )) : <p className="text-[11px] text-gray-400">Henuz islem yok</p>}
          </div>
        </>);
      case 'aylik':
        return (<>
          <div className="flex items-center justify-between mb-3"><h3 className="text-[12px] font-semibold text-gray-700">Aylik Karsilastirma</h3><span className="text-[9px] text-gray-400">{new Date().getFullYear()}</span></div>
          <div className="flex gap-2 text-[9px] mb-2"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Gelir</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Gider</span></div>
          <div className="h-[150px]"><Bar data={{ labels: ['Oca', 'Sub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Agu', 'Eyl', 'Eki', 'Kas', 'Ara'], datasets: [{ label: 'Gelir', data: aylikData.gel, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 2 }, { label: 'Gider', data: aylikData.gid, backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 2 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { ticks: { font: { size: 7 } } } } }} /></div>
        </>);
      case 'butce':
        return (<>
          <div className="flex items-center justify-between mb-3"><h3 className="text-[12px] font-semibold text-gray-700">Butce Durumu</h3></div>
          <div className="flex justify-between mb-3"><div><p className="text-[9px] text-gray-400">Toplam Gelir</p><p className="text-sm font-bold text-gray-800">{fmt(toplamGelir)}</p></div><div className="text-right"><p className="text-[9px] text-gray-400">Harcanan</p><p className="text-sm font-bold text-red-500">{fmt(toplamGider)}</p></div></div>
          <div className="w-full h-2 bg-gray-100 rounded-full mb-3 overflow-hidden"><div className={`h-full rounded-full ${toplamGider > toplamGelir ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${toplamGelir > 0 ? Math.min(100, (toplamGider / toplamGelir) * 100) : 0}%` }} /></div>
          <div className="space-y-1.5">{giderChart.labels.slice(0, 4).map((label, i) => (<div key={label} className="flex items-center justify-between text-[9px]"><span className="text-gray-600">{label}</span><div className="flex gap-3"><span className="text-gray-700 font-medium">{fmt(giderChart.data[i])}</span><span className="text-gray-400">%{giderChart.toplam > 0 ? Math.round((giderChart.data[i] / giderChart.toplam) * 100) : 0}</span></div></div>))}</div>
        </>);
      case 'odemeprogram':
        return (<>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold text-gray-700">Odeme Programi</h3>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">{[{ k: 'bugun', l: 'Bugun' }, { k: 'hafta', l: 'Hafta' }, { k: 'ay', l: 'Ay' }, { k: '3ay', l: '3 Ay' }, { k: '6ay', l: '6 Ay' }, { k: 'yil', l: 'Yil' }, { k: 'tum', l: 'Tum' }].map(p => (<button key={p.k} onClick={() => setOdemeHorizon(p.k)} className={`px-2 py-0.5 text-[9px] font-medium rounded-md ${odemeHorizon === p.k ? 'bg-white shadow-sm text-[#6c63ff]' : 'text-gray-500 hover:bg-white'}`}>{p.l}</button>))}</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] font-medium text-gray-600 mb-2 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Yaklasan Cek Odemeleri</p>
              <div className="space-y-1.5">{yaklasanCekler.map(c => (<div key={c.id} className="flex items-center justify-between text-[9px] bg-red-50 rounded-lg px-2 py-1.5"><div><p className="font-medium text-gray-700">{c.kisiAd}</p><p className="text-gray-400">{c.vadeTarihi}</p></div><span className="font-bold text-red-600">{fmt(c.tutar)} TL</span></div>))}{yaklasanCekler.length === 0 && <p className="text-[9px] text-gray-400">Bekleyen cek yok</p>}</div>
            </div>
            <div>
              <p className="text-[10px] font-medium text-gray-600 mb-2 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" />Duzenli Odemeler</p>
              <div className="space-y-1.5">{yaklasanDuzenli.map(o => (<div key={o.id} className="flex items-center justify-between text-[9px] bg-orange-50 rounded-lg px-2 py-1.5"><div><p className="font-medium text-gray-700">{o.ad}</p><p className="text-gray-400">{o._due}</p></div><span className="font-bold text-orange-600">{o.sabitTutar ? `${fmt(o.tutar)} TL` : 'Degisken'}</span></div>))}{yaklasanDuzenli.length === 0 && <p className="text-[9px] text-gray-400">Yaklasan odeme yok</p>}<button onClick={() => navigate('/duzenli-odemeler')} className="text-[9px] text-[#6c63ff] hover:underline mt-1">Tumu →</button></div>
            </div>
            <div>
              <p className="text-[10px] font-medium text-gray-600 mb-2 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Cari Borc Odemeleri</p>
              <div className="space-y-1.5">{cariOdemeleri.map(c => (<div key={c.id} className="flex items-center justify-between text-[9px] bg-blue-50 rounded-lg px-2 py-1.5"><p className="font-medium text-gray-700">{c.ad}</p><span className="font-bold text-blue-600">{fmt(c.bakiye)} TL</span></div>))}{cariOdemeleri.length === 0 && <p className="text-[9px] text-gray-400">Cari borc yok</p>}</div>
            </div>
          </div>
        </>);
      case 'ai':
        return (<>
          <div className="flex items-center justify-between mb-3"><span className="flex items-center gap-2 text-[12px] font-semibold text-gray-700"><Brain size={14} className="text-[#6c63ff]" />Yapay Zeka Tavsiyeleri</span></div>
          <div className="bg-gradient-to-r from-[#6c63ff]/5 to-purple-50 rounded-lg p-3 mb-3 border border-[#6c63ff]/10"><p className="text-[11px] font-bold text-gray-800 mb-0.5">Gunluk Yatirim Tavsiyesi</p><p className="text-[10px] text-gray-600">{netKar > 0 ? `Bu donem ${fmt(Math.round(netKar * 0.3))} TL yatirim kapasiteniz var. Oneri: %50 TL mevduat, %30 altin/doviz, %20 hisse/fon.` : 'Oncelikle giderlerinizi azaltarak kar marjinizi yukseltin.'}</p></div>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-green-50 rounded-lg p-3 cursor-pointer hover:bg-green-100" onClick={() => navigate('/gelir-gider')}><TrendingUp size={14} className="text-green-600 mb-1" /><p className="text-[10px] font-bold text-gray-800">Net nakit akisi</p><p className="text-[9px] text-gray-500">{netKar >= 0 ? `+${fmt(netKar)} TL pozitif` : `${fmt(netKar)} TL negatif`}</p></div>
            <div className="bg-red-50 rounded-lg p-3 cursor-pointer hover:bg-red-100" onClick={() => navigate('/cari-hesaplar')}><AlertTriangle size={14} className="text-red-600 mb-1" /><p className="text-[10px] font-bold text-gray-800">Toplam borc</p><p className="text-[9px] text-gray-500">{fmt(toplamBorc)} TL</p></div>
            <div className="bg-orange-50 rounded-lg p-3 cursor-pointer hover:bg-orange-100" onClick={() => navigate('/cekler')}><Target size={14} className="text-orange-600 mb-1" /><p className="text-[10px] font-bold text-gray-800">Yaklasan cek odemesi</p><p className="text-[9px] text-gray-500">{fmt(yaklasanCekler.reduce((s, c) => s + c.tutar, 0))} TL</p></div>
            <div className="bg-purple-50 rounded-lg p-3 cursor-pointer hover:bg-purple-100" onClick={() => navigate('/gelir-gider')}><Lightbulb size={14} className="text-purple-600 mb-1" /><p className="text-[10px] font-bold text-gray-800">Gider degisimi</p><p className="text-[9px] text-gray-500">Onceki doneme gore %{giderChange}</p></div>
          </div>
        </>);
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-lg font-bold text-gray-800">Merhaba, {adKisa} 👋</h1><p className="text-[11px] text-gray-400">{new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
            {[{ key: 'gunluk', label: 'Gun' }, { key: 'haftalik', label: 'Hafta' }, { key: 'aylik', label: 'Ay' }, { key: '6aylik', label: '6 Ay' }, { key: 'yillik', label: 'Yil' }, { key: 'tumu', label: 'Tumu' }].map(p => (
              <button key={p.key} onClick={() => setPeriyotAndDates(p.key)} className={`px-2.5 py-1 text-[10px] rounded-md font-medium transition-all ${periyot === p.key ? 'bg-[#6c63ff] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{p.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-lg">
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPeriyot('ozel'); }} className="text-[10px] outline-none bg-transparent w-[90px]" />
            <span className="text-[9px] text-gray-400">-</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPeriyot('ozel'); }} className="text-[10px] outline-none bg-transparent w-[90px]" />
          </div>
          <button onClick={() => setEditMode(e => !e)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border ${editMode ? 'bg-green-600 text-white border-green-600 hover:bg-green-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{editMode ? <><Check size={14} /> Bitti</> : <><Pencil size={14} /> Duzenle</>}</button>
          <button onClick={() => setYeniIslemOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6c63ff] text-white rounded-lg text-xs font-medium hover:bg-[#5b54e6]"><Plus size={14} /> Yeni Islem</button>
        </div>
      </div>

      {/* Düzenleme panel: gizli widget'lar + sıfırla */}
      {editMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-medium text-amber-700 flex items-center gap-1"><GripVertical size={13} /> Widget'lari surukleyip birakarak siralayin, boyutlandirin veya gizleyin.</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {WIDGET_DEFS.filter(w => hidden[w.id]).map(w => (
              <button key={w.id} onClick={() => setHidden(h => ({ ...h, [w.id]: false }))} className="flex items-center gap-1 px-2 py-1 bg-white border border-amber-300 rounded-lg text-[10px] text-amber-700 hover:bg-amber-100"><Eye size={11} /> {w.title}</button>
            ))}
          </div>
          <button onClick={resetLayout} className="ml-auto flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[10px] text-gray-600 hover:bg-gray-50"><RefreshCw size={11} /> Varsayilana Don</button>
        </div>
      )}

      {/* Üst Menü: Kasa Durumu / Borçlarım / Alacaklarım / Net Varlık */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1"><Wallet size={14} className="text-amber-500" /><span className="text-[10px] text-gray-400 font-medium">Kasa Durumu (Likit)</span></div>
          <p className="text-xl font-bold text-amber-600">{fmt(likitToplam)} TL</p>
          <p className="text-[9px] text-gray-400 mt-1">Kasa {fmt(kasaToplam)} • Banka {fmt(bankaToplam)} • Birikim {fmt(birikimToplam)}</p>
        </div>
        <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-[10px] text-gray-400 font-medium">Borclarim</span></div>
          <p className="text-xl font-bold text-red-600">{fmt(toplamBorc)} TL</p>
          <div className="mt-1.5 space-y-0.5">
            <div className="flex justify-between text-[9px]"><span className="text-gray-500">Cari</span><span className="text-gray-700 font-medium">{fmt(cariBorc)}</span></div>
            <div className="flex justify-between text-[9px]"><span className="text-gray-500">Cek</span><span className="text-gray-700 font-medium">{fmt(cekBorc)}</span></div>
            <div className="flex justify-between text-[9px]"><span className="text-gray-500">K.Karti</span><span className="text-gray-700 font-medium">{fmt(kkBorc)}</span></div>
            {emanetBorc > 0 && <div className="flex justify-between text-[9px]"><span className="text-gray-500">Emanet</span><span className="text-gray-700 font-medium">{fmt(emanetBorc)}</span></div>}
          </div>
          <p className="text-[8px] text-gray-400 mt-1 pt-1 border-t border-gray-100">Bu donem cari borc hareketi: <span className={donemBorcHareketi >= 0 ? 'text-red-500 font-medium' : 'text-green-500 font-medium'}>{donemBorcHareketi >= 0 ? '+' : ''}{fmt(donemBorcHareketi)}</span></p>
        </div>
        <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /><span className="text-[10px] text-gray-400 font-medium">Alacaklarim</span></div>
          <p className="text-xl font-bold text-green-600">{fmt(toplamAlacak)} TL</p>
          <div className="mt-1.5 space-y-0.5">
            <div className="flex justify-between text-[9px]"><span className="text-gray-500">Cari</span><span className="text-gray-700 font-medium">{fmt(cariAlacak)}</span></div>
            <div className="flex justify-between text-[9px]"><span className="text-gray-500">Cek</span><span className="text-gray-700 font-medium">{fmt(cekAlacak)}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1"><span className="text-sm">💎</span><span className="text-[10px] text-gray-400 font-medium">Net Varlik</span></div>
          <p className={`text-xl font-bold ${netVarlik >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{fmt(netVarlik)} TL</p>
          <p className="text-[9px] text-gray-400 mt-1">Likit + Alacak - Borc</p>
        </div>
      </div>

      {/* Dönem KPI'ları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Toplam Gelir', value: toplamGelir, color: 'text-gray-800', trend: `${Number(gelirChange) >= 0 ? '+' : ''}%${gelirChange}`, trendColor: Number(gelirChange) >= 0 ? 'text-green-500' : 'text-red-500', icon: '📈' },
          { label: 'Toplam Gider', value: toplamGider, color: 'text-gray-800', trend: `${Number(giderChange) >= 0 ? '+' : ''}%${giderChange}`, trendColor: Number(giderChange) >= 0 ? 'text-red-500' : 'text-green-500', icon: '📉' },
          { label: 'Net Kar', value: netKar, color: netKar >= 0 ? 'text-green-600' : 'text-red-600', trend: `${Number(netChange) >= 0 ? '+' : ''}%${netChange}`, trendColor: Number(netChange) >= 0 ? 'text-green-500' : 'text-red-500', icon: '💰' },
          { label: 'Cari Borc Odemesi', value: borcAzalis, color: 'text-gray-800', trend: '', trendColor: '', icon: '🔻' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1"><span className="text-sm">{card.icon}</span><span className="text-[9px] text-gray-400 font-medium">{card.label}</span></div>
            <p className={`text-lg font-bold ${card.color}`}>{fmt(card.value)} TL</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{card.trend ? <><span className={`${card.trendColor} font-medium`}>{card.trend}</span> Onceki doneme gore</> : 'Bu donem'}</p>
          </div>
        ))}
      </div>

      {/* Hizli Islemler (kisisel kisayollar) */}
      {dashShortcuts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5"><span className="text-[#6c63ff]">⚡</span> Hizli Islemler</h3>
            <span className="text-[9px] text-gray-400">Sol menudeki "Kisayollarim" bolumunden duzenleyin</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {dashShortcuts.map((it) => { const Icon = it.icon; return (
              <button key={it.to} onClick={() => navigate(it.to)} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-[#6c63ff]/40 hover:bg-[#6c63ff]/5 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-[#6c63ff]/10 flex items-center justify-center"><Icon size={18} className="text-[#6c63ff]" /></div>
                <span className="text-[10px] text-gray-600 text-center leading-tight">{it.label}</span>
              </button>
            ); })}
          </div>
        </div>
      )}

      {/* Düzenlenebilir widget grid */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(12, minmax(0,1fr))' }}>
        {order.filter(id => !hidden[id]).map(id => {
          const def = WIDGET_DEFS.find(w => w.id === id); if (!def) return null;
          const span = spans[id] || def.defaultSpan;
          return (
            <div
              key={id}
              draggable={editMode}
              onDragStart={() => editMode && setDragId(id)}
              onDragOver={e => { if (editMode) e.preventDefault(); }}
              onDrop={() => editMode && onDrop(id)}
              className={`bg-white rounded-xl border shadow-sm p-4 relative ${editMode ? 'border-dashed border-[#6c63ff]/40 cursor-move' : 'border-gray-100'} ${dragId === id ? 'opacity-40' : ''}`}
              style={{ gridColumn: `span ${span} / span ${span}` }}
            >
              {editMode && (
                <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 bg-white/95 border border-gray-200 rounded-lg px-1 py-0.5 shadow-sm">
                  <GripVertical size={12} className="text-gray-400" />
                  {[4, 6, 8, 12].map(s => (<button key={s} onClick={() => setSpans(sp => ({ ...sp, [id]: s }))} className={`px-1 text-[9px] rounded ${span === s ? 'bg-[#6c63ff] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{s}</button>))}
                  <button onClick={() => setHidden(h => ({ ...h, [id]: true }))} className="p-0.5 text-gray-400 hover:text-red-500"><EyeOff size={12} /></button>
                </div>
              )}
              {renderWidget(id)}
            </div>
          );
        })}
      </div>

      {/* Yeni Islem Modal */}
      <Modal isOpen={yeniIslemOpen} onClose={() => setYeniIslemOpen(false)} title="Yeni Islem Ekle">
        <form onSubmit={handleYeniIslem} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tarih</label><input type="date" required value={islemForm.tarih} onChange={e => setIslemForm({ ...islemForm, tarih: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Saat</label><input type="time" required value={islemForm.saat} onChange={e => setIslemForm({ ...islemForm, saat: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tip</label><select value={islemForm.tip} onChange={e => setIslemForm({ ...islemForm, tip: e.target.value as any })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"><option value="gelir">Gelir</option><option value="gider">Gider</option></select></div>
            <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Kategori</label><select value={islemForm.kategori} onChange={e => setIslemForm({ ...islemForm, kategori: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"><option>Tahsilat</option><option>Satis</option><option>Kira</option><option>Maas</option><option>Fatura</option><option>Malzeme</option><option>Diger</option></select></div>
          </div>
          <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Tutar</label><MoneyInput value={islemForm.tutar} onChange={v => setIslemForm({ ...islemForm, tutar: v })} required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          <div><label className="block text-[10px] font-medium text-gray-600 mb-1">Aciklama</label><input required value={islemForm.aciklama} onChange={e => setIslemForm({ ...islemForm, aciklama: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" /></div>
          <div className="flex gap-2 justify-end"><button type="button" onClick={() => setYeniIslemOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Iptal</button><button type="submit" className="px-5 py-2 text-sm bg-[#6c63ff] text-white rounded-lg">Kaydet</button></div>
        </form>
      </Modal>
    </div>
  );
}
