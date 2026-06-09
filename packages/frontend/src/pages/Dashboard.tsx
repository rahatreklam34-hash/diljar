import MoneyInput from '../components/MoneyInput';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { allMenuItems } from '../lib/menu';
import {
  Landmark, ArrowUpRight, ArrowDownRight, Plus,
  Wallet, Pencil, CreditCard, PiggyBank,
  BarChart3, Activity, Zap, ArrowRight, Calendar, Users,
  FileText, Receipt, Target, Package
} from 'lucide-react';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import Modal from '../components/Modal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

export default function Dashboard() {
  const { cariHesaplar, cariHareketler, hareketler, kasaBanka, krediKartlari, birikimHesaplari, cekler, duzenliOdemeler, emanetParalar, addHareket } = useApp();
  const { products, orders } = useStore();
  const { user, canAccess } = useAuth();
  const adKisa = (user?.fullName || 'Kullanici').split(' ')[0];
  const navigate = useNavigate();

  // Depo: toplam stok adedi + ürün çeşidi
  const depoStok = useMemo(() => {
    let adet = 0;
    for (const p of (products || [])) adet += Number(p?.stokAdeti) || 0;
    return { adet, cesit: (products || []).length };
  }, [products]);

  const dashShortcuts = (Array.isArray(user?.prefs?.shortcuts) ? user!.prefs!.shortcuts : ['/canli-yayin', '/kasa-satis', '/siparisler', '/depo/urunlerim', '/musterilerim'])
    .map((to: string) => allMenuItems.find((m) => m.to === to))
    .filter((m): m is NonNullable<typeof m> => !!m && canAccess(m.to))
    .slice(0, 6);

  const [yeniIslemOpen, setYeniIslemOpen] = useState(false);
  const [periyot, setPeriyot] = useState('tumu');
  const [dateFrom, setDateFrom] = useState('2000-01-01');
  const [dateTo, setDateTo] = useState('2099-12-31');
  const [odemeHorizon, setOdemeHorizon] = useState('ay');
  const [islemForm, setIslemForm] = useState({ tarih: new Date().toISOString().split('T')[0], saat: new Date().toTimeString().slice(0, 5), aciklama: '', tutar: '', tip: 'gelir' as 'gelir' | 'gider', kategori: 'Tahsilat' });

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

  // --- Likit ---
  const kasaToplam = kasaBanka.filter(k => k.tip === 'kasa').reduce((s, k) => s + k.bakiye, 0);
  const bankaToplam = kasaBanka.filter(k => k.tip === 'banka').reduce((s, k) => s + k.bakiye, 0);
  const birikimToplam = birikimHesaplari.reduce((s, b) => s + b.bakiye, 0);
  const likitToplam = kasaToplam + bankaToplam + birikimToplam;

  // --- Borclarim ---
  const cariBorc = cariHesaplar.filter(c => c.bakiye > 0).reduce((s, c) => s + c.bakiye, 0);
  const cekBorc = cekler.filter(c => c.tip === 'borc' && c.durum === 'bekleyen').reduce((s, c) => s + c.tutar, 0);
  const kkBorc = krediKartlari.reduce((s, k) => s + k.borc, 0);
  const emanetBorc = emanetParalar.filter(e => e.durum === 'aktif').reduce((s, e) => s + e.tutar, 0);
  const krediBorc = 0;
  const toplamBorc = cariBorc + cekBorc + kkBorc + emanetBorc + krediBorc;

  // --- Alacaklarim ---
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

  // --- Satilan urun maliyeti (SMM / COGS) -> kar buna gore duzeltilir ---
  const prodCost = useMemo(() => new Map((products || []).map((p: any) => [p.id, Number(p.alisFiyat) || 0])), [products]);
  const smm = useMemo(() => (orders || [])
    .filter((o: any) => o.durum && o.durum !== 'sepet' && o.durum !== 'iptal')
    .filter((o: any) => { const d = String(o.createdAt || '').slice(0, 10); return d >= dateFrom && d <= dateTo; })
    .reduce((s: number, o: any) => s + (Array.isArray(o.items) ? o.items : []).reduce((x: number, it: any) => x + (prodCost.get(it.productId) || 0) * (Number(it.adet) || 1), 0), 0), [orders, prodCost, dateFrom, dateTo]);
  const gercekKar = netKar - smm; // urun maliyeti dusulmus gercek kar
  const donemNet = toplamGelir - toplamGider; // gelen para - giderler (kasaya yansiyan net)

  // Önceki dönem
  const periodDays = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000));
  const prevFrom = new Date(new Date(dateFrom).getTime() - periodDays * 86400000).toISOString().split('T')[0];
  const prevTo = new Date(new Date(dateFrom).getTime() - 86400000).toISOString().split('T')[0];
  const prevHareketler = useMemo(() => hareketler.filter(h => h.tarih >= prevFrom && h.tarih <= prevTo), [hareketler, prevFrom, prevTo]);
  const prevGelir = prevHareketler.filter(h => h.tip === 'gelir').reduce((s, h) => s + h.tutar, 0);
  const prevGider = prevHareketler.filter(h => h.tip === 'gider').reduce((s, h) => s + h.tutar, 0);

  const pctChange = (curr: number, prev: number) => { if (prev === 0) return curr > 0 ? '+100' : '0'; return ((curr - prev) / Math.abs(prev) * 100).toFixed(1); };
  const gelirChange = pctChange(toplamGelir, prevGelir);
  const giderChange = pctChange(toplamGider, prevGider);
  const netChange = pctChange(netKar, prevGelir - prevGider);

  // Dönem içi cari borç hareketi
  const filteredCari = useMemo(() => cariHareketler.filter(h => h.tarih >= dateFrom && h.tarih <= dateTo), [cariHareketler, dateFrom, dateTo]);
  const borcAzalis = filteredCari.filter(h => h.tip === 'odeme').reduce((s, h) => s + h.tutar, 0);
  const kalanKasa = toplamGelir - toplamGider - borcAzalis; // gelirden gider ve borc odemesi dusuldukten sonra kalan

  const gelirGiderChart = useMemo(() => {
    const dates = [...new Set(filteredHareketler.map(h => h.tarih))].sort();
    const gM: Record<string, number> = {}, gdM: Record<string, number> = {};
    filteredHareketler.forEach(h => { if (h.tip === 'gelir') gM[h.tarih] = (gM[h.tarih] || 0) + h.tutar; else gdM[h.tarih] = (gdM[h.tarih] || 0) + h.tutar; });
    const aylar = ['Oca', 'Sub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Agu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return { labels: dates.map(d => { const p = d.split('-'); return `${parseInt(p[2])} ${aylar[parseInt(p[1]) - 1] || ''}`; }), datasets: [{ label: 'Gelir', data: dates.map(d => gM[d] || 0), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: true, tension: 0.4, pointRadius: 2 }, { label: 'Gider', data: dates.map(d => gdM[d] || 0), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', fill: true, tension: 0.4, pointRadius: 2 }] };
  }, [filteredHareketler]);

  // Ödeme programı
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

  // Finansal sağlık skoru
  const healthScore = useMemo(() => {
    let score = 70;
    if (netVarlik > 0) score += 15;
    if (toplamBorc === 0) score += 10;
    if (toplamGelir > toplamGider) score += 5;
    return Math.min(100, Math.max(0, score));
  }, [netVarlik, toplamBorc, toplamGelir, toplamGider]);
  const healthColor = healthScore >= 80 ? 'text-green-500' : healthScore >= 60 ? 'text-amber-500' : 'text-red-500';
  const healthRing = healthScore >= 80 ? '#22c55e' : healthScore >= 60 ? '#f59e0b' : '#ef4444';

  // Finans kısayol kartları
  const financeCards = [
    { label: 'Cari Hesaplar', to: '/cari-hesaplar', icon: Users, color: 'bg-blue-50 text-blue-600', desc: `${cariHesaplar.length} hesap` },
    { label: 'Kasa & Banka', to: '/kasa-banka', icon: Landmark, color: 'bg-amber-50 text-amber-600', desc: `${fmt(likitToplam)} TL` },
    { label: 'Gelir / Gider', to: '/gelir-gider', icon: BarChart3, color: 'bg-emerald-50 text-emerald-600', desc: `Net ${fmt(netKar)} TL` },
    { label: 'Cekler', to: '/cekler', icon: FileText, color: 'bg-rose-50 text-rose-600', desc: `${fmt(cekBorc + cekAlacak)} TL` },
    { label: 'Duzenli Odemeler', to: '/duzenli-odemeler', icon: Calendar, color: 'bg-indigo-50 text-indigo-600', desc: `${duzenliOdemeler.filter(o => o.durum === 'aktif').length} aktif` },
    { label: 'Finansal Durum', to: '/finansal-durum', icon: Activity, color: 'bg-cyan-50 text-cyan-600', desc: `Net ${fmt(netVarlik)} TL` },
    { label: 'Hedeflerim', to: '/hedeflerim', icon: Target, color: 'bg-purple-50 text-purple-600', desc: 'Incele' },
    { label: 'Banka Hareketleri', to: '/banka-hareketleri', icon: Receipt, color: 'bg-orange-50 text-orange-600', desc: `${hareketler.length} kayit` },
  ].filter(c => canAccess(c.to));

  return (
    <div className="space-y-5">
      {/* Ust bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Merhaba, {adKisa} 👋</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">{new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => canAccess('/depo/urunlerim') && navigate('/depo/urunlerim')} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:border-[#6c63ff]/40 transition-colors" title="Depodaki toplam stok">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0"><Package size={16} className="text-indigo-600" /></div>
            <div className="text-left leading-tight">
              <p className="text-[9px] text-gray-400 font-medium">Depodaki Urun</p>
              <p className="text-sm font-bold text-gray-800">{depoStok.adet.toLocaleString('tr-TR')} adet</p>
              <p className="text-[8px] text-gray-400">{depoStok.cesit} cesit urun</p>
            </div>
          </button>
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
          <button onClick={() => setYeniIslemOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6c63ff] text-white rounded-lg text-xs font-medium hover:bg-[#5b54e6]"><Plus size={14} /> Yeni Islem</button>
        </div>
      </div>

      {/* Finans kisayol kartlari */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {financeCards.map(c => {
          const Icon = c.icon;
          return (
            <button key={c.label} onClick={() => navigate(c.to)} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-left hover:border-[#6c63ff]/30 hover:shadow-md transition-all group">
              <div className={`w-9 h-9 rounded-lg ${c.color.split(' ')[0]} flex items-center justify-center mb-2`}><Icon size={16} className={c.color.split(' ')[1]} /></div>
              <p className="text-[11px] font-semibold text-gray-800 group-hover:text-[#6c63ff]">{c.label}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">{c.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Kasa Durumu: Aldim - Verdim - Borc Odemesi = Kalan */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-bold text-gray-800 flex items-center gap-1.5"><Wallet size={15} className="text-amber-500" /> Kasa Durumu <span className="text-[9px] text-gray-400 font-normal">(secili donem)</span></h3>
          {canAccess('/kasa-banka') && <button onClick={() => navigate('/kasa-banka')} className="text-[10px] text-[#6c63ff] font-medium hover:underline flex items-center gap-0.5">Detay <ArrowRight size={11} /></button>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-green-50 border border-green-100 p-3">
            <div className="flex items-center gap-1.5 mb-1"><ArrowDownRight size={14} className="text-green-600" /><span className="text-[10px] text-green-700 font-semibold">Aldim (Gelir)</span></div>
            <p className="text-xl font-bold text-green-700">{fmt(toplamGelir)} TL</p>
            <p className="text-[9px] text-green-600/70 mt-0.5">Tahsilat / satis geliri</p>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-100 p-3">
            <div className="flex items-center gap-1.5 mb-1"><ArrowUpRight size={14} className="text-red-500" /><span className="text-[10px] text-red-600 font-semibold">Verdim (Gider)</span></div>
            <p className="text-xl font-bold text-red-600">{fmt(toplamGider)} TL</p>
            <p className="text-[9px] text-red-500/70 mt-0.5">Odeme / masraf</p>
          </div>
          <div className="rounded-xl bg-orange-50 border border-orange-100 p-3">
            <div className="flex items-center gap-1.5 mb-1"><CreditCard size={14} className="text-orange-500" /><span className="text-[10px] text-orange-600 font-semibold">Borca Odenen</span></div>
            <p className="text-xl font-bold text-orange-600">{fmt(borcAzalis)} TL</p>
            <p className="text-[9px] text-orange-500/70 mt-0.5">Cari borc odemesi</p>
          </div>
          <div className={`rounded-xl p-3 border ${kalanKasa >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-1.5 mb-1"><Wallet size={14} className={kalanKasa >= 0 ? 'text-amber-600' : 'text-red-600'} /><span className={`text-[10px] font-semibold ${kalanKasa >= 0 ? 'text-amber-700' : 'text-red-700'}`}>Kalan Kasa</span></div>
            <p className={`text-xl font-bold ${kalanKasa >= 0 ? 'text-amber-700' : 'text-red-700'}`}>{fmt(kalanKasa)} TL</p>
            <p className={`text-[9px] mt-0.5 ${kalanKasa >= 0 ? 'text-amber-600/70' : 'text-red-600/70'}`}>Gelir - Gider - Borc odemesi</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <span className="text-[10px] text-gray-500">Gercek hesap bakiyesi (Kasa + Banka + Birikim)</span>
          <span className="text-sm font-bold text-amber-700">{fmt(likitToplam)} TL <span className="text-[9px] text-gray-400 font-normal">· Kasa {fmt(kasaToplam)} · Banka {fmt(bankaToplam)} · Birikim {fmt(birikimToplam)}</span></span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Toplam Gelir', value: toplamGelir, color: 'text-gray-800', trend: `${Number(gelirChange) >= 0 ? '+' : ''}%${gelirChange}`, trendColor: Number(gelirChange) >= 0 ? 'text-green-500' : 'text-red-500', icon: '📈', sub: '' },
          { label: 'Toplam Gider', value: toplamGider, color: 'text-gray-800', trend: `${Number(giderChange) >= 0 ? '+' : ''}%${giderChange}`, trendColor: Number(giderChange) >= 0 ? 'text-red-500' : 'text-green-500', icon: '📉', sub: '' },
          { label: 'Net Kar (Maliyet Dusuldu)', value: gercekKar, color: gercekKar >= 0 ? 'text-green-600' : 'text-red-600', trend: '', trendColor: '', icon: '💰', sub: smm > 0 ? `Urun maliyeti (SMM) -${fmt(smm)} dusuldu` : 'Gelir - Gider - urun maliyeti' },
          { label: 'Nakit Bakiye', value: likitToplam, color: 'text-amber-600', trend: '', trendColor: '', icon: '💵', sub: '' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1"><span className="text-sm">{card.icon}</span><span className="text-[9px] text-gray-400 font-medium">{card.label}</span></div>
            <p className={`text-lg font-bold ${card.color}`}>{fmt(card.value)} TL</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{card.sub ? <span className="text-amber-600 font-medium">{card.sub}</span> : card.trend ? <><span className={`${card.trendColor} font-medium`}>{card.trend}</span> Onceki doneme gore</> : 'Guncel'}</p>
          </div>
        ))}
        <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2"><span className="text-[9px] text-gray-400 font-medium">Finansal Saglik</span><Activity size={14} className="text-gray-300" /></div>
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 transform -rotate-90"><circle cx="24" cy="24" r="20" stroke="#f3f4f6" strokeWidth="4" fill="none" /><circle cx="24" cy="24" r="20" stroke={healthRing} strokeWidth="4" fill="none" strokeDasharray={`${2 * Math.PI * 20}`} strokeDashoffset={`${2 * Math.PI * 20 * (1 - healthScore / 100)}`} strokeLinecap="round" /></svg>
              <div className="absolute inset-0 flex items-center justify-center"><span className="text-[10px] font-bold text-gray-800">{healthScore}</span></div>
            </div>
            <div>
              <p className={`text-sm font-bold ${healthColor}`}>{healthScore >= 80 ? 'Mukemmel' : healthScore >= 60 ? 'Iyi' : 'Dikkat'}</p>
              <p className="text-[9px] text-gray-400">Genel durum</p>
            </div>
          </div>
        </div>
      </div>

      {/* Orta: Gelir/Gider Grafigi + Nakit Akisi */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold text-gray-700">Gelir - Gider Trendi</h3>
            <div className="flex gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Gelir</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Gider</span>
            </div>
          </div>
          <div className="h-[220px]">{filteredHareketler.length ? <Line data={gelirGiderChart} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 9 }, callback: (v: any) => `${(v / 1000).toFixed(0)}K` } }, x: { ticks: { font: { size: 9 }, maxRotation: 0 } } } }} /> : <div className="h-full flex items-center justify-center text-[11px] text-gray-400">Bu donemde hareket yok</div>}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-[12px] font-semibold text-gray-700 mb-3">Nakit Akis Ozeti</h3>
          <table className="w-full text-[10px]">
            <thead><tr className="border-b border-gray-100"><th className="text-left py-1.5 text-gray-400 font-medium">Aciklama</th><th className="text-right py-1.5 text-gray-400 font-medium">Tutar</th><th className="text-right py-1.5 text-gray-400 font-medium">Oran</th></tr></thead>
            <tbody>
              <tr className="border-b border-gray-50"><td className="py-1.5 text-gray-700">Toplam Gelir</td><td className="py-1.5 text-right font-bold text-green-500">{fmt(toplamGelir)}</td><td className="py-1.5 text-right text-gray-400">%100</td></tr>
              <tr className="border-b border-gray-50"><td className="py-1.5 text-gray-700">Toplam Gider</td><td className="py-1.5 text-right font-medium text-red-500">{fmt(toplamGider)}</td><td className="py-1.5 text-right text-gray-400">%{toplamGelir > 0 ? ((toplamGider / toplamGelir) * 100).toFixed(1) : 0}</td></tr>
              <tr className="border-b border-gray-50"><td className="py-1.5 text-gray-700">Satilan Urun Maliyeti (SMM)</td><td className="py-1.5 text-right font-medium text-orange-500">{fmt(smm)}</td><td className="py-1.5 text-right text-gray-400">%{toplamGelir > 0 ? ((smm / toplamGelir) * 100).toFixed(1) : 0}</td></tr>
              <tr className="border-b border-gray-50"><td className="py-1.5 text-gray-700">Cari Borc Odemesi</td><td className="py-1.5 text-right font-medium text-gray-700">{fmt(borcAzalis)}</td><td className="py-1.5 text-right text-gray-400">-</td></tr>
              <tr><td className="py-1.5 text-gray-700 font-medium">Net Kar (maliyet dusulmus)</td><td className={`py-1.5 text-right font-bold ${gercekKar >= 0 ? 'text-blue-500' : 'text-red-500'}`}>{fmt(gercekKar)}</td><td className="py-1.5 text-right text-gray-400">%{toplamGelir > 0 ? ((gercekKar / toplamGelir) * 100).toFixed(1) : 0}</td></tr>
            </tbody>
          </table>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2"><span className="text-[10px] text-gray-500">Borc Dagilimi</span><span className="text-[9px] text-gray-400">{fmt(toplamBorc)} TL</span></div>
            {toplamBorc > 0 ? (
              <div className="flex flex-col items-center">
                <div className="w-[80px] h-[80px] relative mb-2"><Doughnut data={{ labels: borcGruplari.map(b => b.label), datasets: [{ data: borcGruplari.map(b => b.value), backgroundColor: borcGruplari.map(b => b.color), borderWidth: 0 }] }} options={{ cutout: '68%', plugins: { legend: { display: false } } }} /></div>
                <div className="w-full space-y-1">{borcGruplari.map(b => (<div key={b.label} className="flex items-center justify-between text-[9px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />{b.label}</span><span className="font-medium text-gray-700">{fmt(b.value)}</span></div>))}</div>
              </div>
            ) : (<div className="h-[80px] flex items-center justify-center text-[11px] text-gray-400">Borc yok</div>)}
          </div>
        </div>
      </div>

      {/* Alt: Yaklasan Odemeler + Son Islemler + Hizli Erisim */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Yaklasan Odemeler */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold text-gray-700">Yaklasan Odemeler</h3>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">{[{ k: 'bugun', l: 'Bugun' }, { k: 'hafta', l: 'Hafta' }, { k: 'ay', l: 'Ay' }, { k: '3ay', l: '3 Ay' }, { k: '6ay', l: '6 Ay' }, { k: 'yil', l: 'Yil' }, { k: 'tum', l: 'Tum' }].map(p => (<button key={p.k} onClick={() => setOdemeHorizon(p.k)} className={`px-2 py-0.5 text-[9px] font-medium rounded-md ${odemeHorizon === p.k ? 'bg-white shadow-sm text-[#6c63ff]' : 'text-gray-500 hover:bg-white'}`}>{p.l}</button>))}</div>
          </div>
          <div className="space-y-2">
            {yaklasanCekler.map(c => (<div key={c.id} className="flex items-center justify-between text-[9px] bg-red-50 rounded-lg px-2 py-1.5"><div><p className="font-medium text-gray-700">{c.kisiAd}</p><p className="text-gray-400">{c.vadeTarihi}</p></div><span className="font-bold text-red-600">{fmt(c.tutar)} TL</span></div>))}
            {yaklasanDuzenli.map(o => (<div key={o.id} className="flex items-center justify-between text-[9px] bg-orange-50 rounded-lg px-2 py-1.5"><div><p className="font-medium text-gray-700">{o.ad}</p><p className="text-gray-400">{o._due}</p></div><span className="font-bold text-orange-600">{o.sabitTutar ? `${fmt(o.tutar)} TL` : 'Degisken'}</span></div>))}
            {cariOdemeleri.map(c => (<div key={c.id} className="flex items-center justify-between text-[9px] bg-blue-50 rounded-lg px-2 py-1.5"><p className="font-medium text-gray-700">{c.ad}</p><span className="font-bold text-blue-600">{fmt(c.bakiye)} TL</span></div>))}
            {yaklasanCekler.length === 0 && yaklasanDuzenli.length === 0 && cariOdemeleri.length === 0 && <p className="text-[11px] text-gray-400 py-4 text-center">Yaklasan odeme yok</p>}
          </div>
        </div>

        {/* Son Islemler */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3"><h3 className="text-[12px] font-semibold text-gray-700">Son Islemler</h3><button onClick={() => navigate('/gelir-gider')} className="text-[9px] text-[#6c63ff] font-medium hover:underline flex items-center gap-0.5">Tumunu Gor <ArrowRight size={10} /></button></div>
          <div className="space-y-2">
            {hareketler.length ? hareketler.slice(0, 8).map(h => (
              <div key={h.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className={`w-6 h-6 rounded-lg flex items-center justify-center ${h.tip === 'gelir' ? 'bg-green-50' : 'bg-red-50'}`}>{h.tip === 'gelir' ? <ArrowUpRight size={11} className="text-green-500" /> : <ArrowDownRight size={11} className="text-red-500" />}</div><div><p className="text-[10px] text-gray-700 font-medium truncate max-w-[120px]">{h.aciklama}</p><p className="text-[8px] text-gray-400">{h.tarih}</p></div></div>
                <span className={`text-[10px] font-bold ${h.tip === 'gelir' ? 'text-green-500' : 'text-red-500'}`}>{h.tip === 'gelir' ? '+' : '-'}{fmt(h.tutar)}</span>
              </div>
            )) : <p className="text-[11px] text-gray-400">Henuz islem yok</p>}
          </div>
        </div>

        {/* Hizli Erisim */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5"><Zap size={14} className="text-amber-500" /> Hizli Erisim</h3>
            <button onClick={() => window.dispatchEvent(new Event('open-shortcut-editor'))} className="text-[11px] text-[#6c63ff] font-medium hover:underline flex items-center gap-0.5"><Pencil size={12} /> Duzenle</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {dashShortcuts.map(it => { const Icon = it.icon; return (
              <button key={it.to} onClick={() => navigate(it.to)} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-gray-100 hover:border-[#6c63ff]/40 hover:bg-[#6c63ff]/5 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-[#6c63ff]/10 flex items-center justify-center"><Icon size={16} className="text-[#6c63ff]" /></div>
                <span className="text-[9px] text-gray-600 text-center leading-tight">{it.label}</span>
              </button>
            ); })}
          </div>
        </div>
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
