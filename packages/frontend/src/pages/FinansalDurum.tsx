import { useState, useMemo, useRef, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, AlertTriangle, Plus, RefreshCw, FileText, Wallet } from 'lucide-react';
import { Chart, ArcElement, DoughnutController, LineElement, PointElement, LinearScale, CategoryScale, BarElement, BarController, LineController, Tooltip, Legend } from 'chart.js';
import { useApp } from '../context/AppContext';

Chart.register(ArcElement, DoughnutController, LineElement, PointElement, LinearScale, CategoryScale, BarElement, BarController, LineController, Tooltip, Legend);

function fmt(n: number) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function getMonthKey(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
}

export default function FinansalDurum() {
  const { hareketler, kasaBanka, cariHesaplar, personelHareketler, cekler } = useApp();

  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

  const lineRef = useRef<HTMLCanvasElement>(null);
  const nakitRef = useRef<HTMLCanvasElement>(null);
  const borcRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const lineChart = useRef<Chart | null>(null);
  const nakitChart = useRef<Chart | null>(null);
  const borcChart = useRef<Chart | null>(null);
  const barChart = useRef<Chart | null>(null);

  const filtered = useMemo(() => hareketler.filter(h => {
    if (filterStart && h.tarih < filterStart) return false;
    if (filterEnd && h.tarih > filterEnd) return false;
    return true;
  }), [hareketler, filterStart, filterEnd]);

  const toplamGelir = useMemo(() => filtered.filter(h => h.tip === 'gelir').reduce((a, b) => a + b.tutar, 0), [filtered]);
  const toplamGider = useMemo(() => filtered.filter(h => h.tip === 'gider').reduce((a, b) => a + b.tutar, 0), [filtered]);
  const netGelir = toplamGelir - toplamGider;
  const toplamBakiye = kasaBanka.reduce((a, b) => a + b.bakiye, 0);
  const toplamBorc = cariHesaplar.filter(c => c.bakiye > 0).reduce((a, b) => a + b.bakiye, 0);
  const toplamAlacak = cariHesaplar.filter(c => c.bakiye < 0).reduce((a, b) => a + Math.abs(b.bakiye), 0);
  const maasToplam = personelHareketler.filter(h => h.tip === 'maas').reduce((a, b) => a + b.tutar, 0);
  const borcOdeme = cekler.filter(c => c.tip === 'borc').reduce((a, b) => a + b.tutar, 0);
  const yatirim = 0;
  const kalan = toplamGelir - toplamGider - maasToplam - borcOdeme;

  // Butce: hedef gelir as 150% of expenses
  const butceHedef = toplamGider * 1.5 || 100000;
  const butcePct = butceHedef > 0 ? Math.min((toplamGelir / butceHedef) * 100, 100) : 0;

  const giderByKategori = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter(h => h.tip === 'gider').forEach(h => { map[h.kategori] = (map[h.kategori] || 0) + h.tutar; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filtered]);

  const months12 = Array.from({ length: 12 }, (_, i) => ({ key: getMonthKey(11 - i), label: getMonthLabel(11 - i) }));
  const m12Gelir = months12.map(m => hareketler.filter(h => h.tip === 'gelir' && h.tarih.startsWith(m.key)).reduce((a, b) => a + b.tutar, 0));
  const m12Gider = months12.map(m => hareketler.filter(h => h.tip === 'gider' && h.tarih.startsWith(m.key)).reduce((a, b) => a + b.tutar, 0));

  const months6 = Array.from({ length: 6 }, (_, i) => ({ key: getMonthKey(5 - i), label: getMonthLabel(5 - i) }));
  const m6Gelir = months6.map(m => filtered.filter(h => h.tip === 'gelir' && h.tarih.startsWith(m.key)).reduce((a, b) => a + b.tutar, 0));
  const m6Gider = months6.map(m => filtered.filter(h => h.tip === 'gider' && h.tarih.startsWith(m.key)).reduce((a, b) => a + b.tutar, 0));

  useEffect(() => {
    if (!lineRef.current) return;
    if (lineChart.current) lineChart.current.destroy();
    lineChart.current = new Chart(lineRef.current, {
      type: 'line',
      data: {
        labels: months6.map(m => m.label),
        datasets: [
          { label: 'Gelir', data: m6Gelir, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, fill: true },
          { label: 'Gider', data: m6Gider, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', tension: 0.4, fill: true },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: ctx => ` ${fmt(Number(ctx.parsed.y))} ₺` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => fmt(Number(v)) } } },
      },
    });
    return () => { lineChart.current?.destroy(); };
  }, [m6Gelir, m6Gider]);

  useEffect(() => {
    if (!nakitRef.current) return;
    if (nakitChart.current) nakitChart.current.destroy();
    const gidVal = toplamGider;
    const borcVal = borcOdeme;
    const yatVal = yatirim;
    const kalVal = Math.max(kalan, 0);
    nakitChart.current = new Chart(nakitRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Giderlere', 'Borc Odemelerine', 'Yatirimlara', 'Kalan'],
        datasets: [{ data: [gidVal, borcVal, yatVal, kalVal], backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'], borderWidth: 0 }],
      },
      options: {
        cutout: '65%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.parsed)} ₺` } } },
      },
    });
    return () => { nakitChart.current?.destroy(); };
  }, [toplamGider, borcOdeme, kalan]);

  useEffect(() => {
    if (!borcRef.current) return;
    if (borcChart.current) borcChart.current.destroy();
    borcChart.current = new Chart(borcRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Toplam Borc', 'Alacak'],
        datasets: [{ data: [toplamBorc, toplamAlacak], backgroundColor: ['#ef4444', '#10b981'], borderWidth: 0 }],
      },
      options: {
        cutout: '65%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.parsed)} ₺` } } },
      },
    });
    return () => { borcChart.current?.destroy(); };
  }, [toplamBorc, toplamAlacak]);

  useEffect(() => {
    if (!barRef.current) return;
    if (barChart.current) barChart.current.destroy();
    barChart.current = new Chart(barRef.current, {
      type: 'bar',
      data: {
        labels: months12.map(m => m.label),
        datasets: [
          { label: 'Gelir', data: m12Gelir, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 },
          { label: 'Gider', data: m12Gider, backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: ctx => ` ${fmt(Number(ctx.parsed.y))} ₺` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => fmt(Number(v)) } } },
      },
    });
    return () => { barChart.current?.destroy(); };
  }, [m12Gelir, m12Gider]);

  const sonIslemler = [...hareketler].sort((a, b) => b.tarih.localeCompare(a.tarih)).slice(0, 8);

  const nakitItems = [
    { label: 'Toplam Gelen', val: toplamGelir, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Giderlere', val: toplamGider, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Borca', val: borcOdeme, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Yatirima', val: yatirim, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Kalan', val: kalan, color: kalan >= 0 ? 'text-green-700' : 'text-red-700', bg: kalan >= 0 ? 'bg-green-100' : 'bg-red-100' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Finansal Durumum</h1>
          <p className="text-gray-500 text-sm">Finansal sagliginizin kapsamli ozeti</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 text-sm transition-colors"><Plus size={15} />Gelir Ekle</button>
          <button className="flex items-center gap-2 px-3 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 text-sm transition-colors"><Plus size={15} />Gider Ekle</button>
          <button className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 text-sm transition-colors"><RefreshCw size={15} />Transfer</button>
          <button className="flex items-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 text-sm transition-colors"><FileText size={15} />Fatura Ekle</button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex flex-wrap gap-4 items-center">
        <span className="text-sm font-medium text-gray-600">Tarih Araligi:</span>
        <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        <span className="text-gray-400">-</span>
        <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        {(filterStart || filterEnd) && (
          <button onClick={() => { setFilterStart(''); setFilterEnd(''); }} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">Temizle</button>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Toplam Gelir', val: toplamGelir, icon: TrendingUp, color: 'from-green-500 to-green-600' },
          { label: 'Toplam Gider', val: toplamGider, icon: TrendingDown, color: 'from-red-500 to-red-600' },
          { label: 'Net Gelir', val: netGelir, icon: DollarSign, color: netGelir >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-600 to-red-700' },
          { label: 'Toplam Bakiye', val: toplamBakiye, icon: Wallet, color: 'from-blue-500 to-blue-600' },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`bg-gradient-to-br ${card.color} text-white rounded-2xl p-5`}>
              <div className="flex items-center gap-2 mb-2"><div className="p-1.5 bg-white/20 rounded-lg"><Icon size={16} /></div><span className="text-xs opacity-80">{card.label}</span></div>
              <div className="text-xl font-bold">{fmt(card.val)} ₺</div>
            </div>
          );
        })}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Line */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm lg:col-span-2">
          <h3 className="font-semibold text-gray-700 mb-4">Gelir-Gider Trendi (Son 6 Ay)</h3>
          <canvas ref={lineRef} height={160} />
        </div>

        {/* Nakit Dagilimi */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4">Nakitin Dagilimi</h3>
          <div className="relative flex items-center justify-center" style={{ height: 160 }}>
            <canvas ref={nakitRef} />
          </div>
          <div className="mt-3 space-y-1">
            {[
              { label: 'Giderlere', color: '#ef4444', val: toplamGider },
              { label: 'Borc Odemelerine', color: '#f59e0b', val: borcOdeme },
              { label: 'Yatirimlara', color: '#3b82f6', val: yatirim },
              { label: 'Kalan', color: '#10b981', val: Math.max(kalan, 0) },
            ].map(item => {
              const total = toplamGider + borcOdeme + yatirim + Math.max(kalan, 0);
              const pct = total > 0 ? (item.val / total * 100).toFixed(1) : '0.0';
              return (
                <div key={item.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: item.color }} /><span className="text-gray-600">{item.label}</span></div>
                  <span className="font-medium text-gray-700">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hesap Bakiyeleri + Nakit Akis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hesap Bakiyeleri */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4">Hesap Bakiyeleri</h3>
          <div className="space-y-3">
            {kasaBanka.map(acc => {
              const pct = toplamBakiye > 0 ? (acc.bakiye / toplamBakiye) * 100 : 0;
              return (
                <div key={acc.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 text-xs rounded-md ${acc.tip === 'kasa' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{acc.tip === 'kasa' ? 'Kasa' : 'Banka'}</span>
                      <span className="text-gray-700 font-medium">{acc.ad}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{fmt(acc.bakiye)} ₺</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Nakit Akis Ozeti */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4">Nakit Akis Ozeti</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 font-medium text-gray-500">Kalem</th>
                  <th className="text-right py-2 font-medium text-gray-500">Tutar</th>
                  <th className="text-right py-2 font-medium text-gray-500">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {nakitItems.map(item => {
                  const pct = toplamGelir > 0 ? Math.abs((item.val / toplamGelir) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={item.label}>
                      <td className="py-2.5 text-gray-700">{item.label}</td>
                      <td className={`py-2.5 text-right font-semibold ${item.color}`}>{fmt(item.val)} ₺</td>
                      <td className="py-2.5 text-right text-gray-500">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Kategori + Borc */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Kategori Bazli Gider */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4">Kategori Bazli Gider</h3>
          {giderByKategori.length === 0 ? (
            <div className="text-center text-gray-400 py-8">Gider verisi yok</div>
          ) : (
            <div className="space-y-3">
              {giderByKategori.map(([kat, val]) => {
                const pct = toplamGider > 0 ? (val / toplamGider) * 100 : 0;
                return (
                  <div key={kat}>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>{kat}</span>
                      <span className="font-medium">{fmt(val)} ₺ ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Borc Durumu */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4">Borc Durumu</h3>
          <div className="relative flex items-center justify-center" style={{ height: 150 }}>
            <canvas ref={borcRef} />
          </div>
          <div className="mt-3 space-y-2">
            {cariHesaplar.filter(c => c.bakiye > 0).slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 truncate flex-1">{c.ad}</span>
                <span className="font-semibold text-red-600 ml-2">{fmt(c.bakiye)} ₺</span>
              </div>
            ))}
            {cariHesaplar.filter(c => c.bakiye < 0).slice(0, 3).map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 truncate flex-1">{c.ad}</span>
                <span className="font-semibold text-green-600 ml-2">+{fmt(Math.abs(c.bakiye))} ₺</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Son Islemler + Butce */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Son Islemler */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700">Son Islemler</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {sonIslemler.map(h => (
              <div key={h.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <div>
                  <div className="text-sm font-medium text-gray-800 truncate">{h.aciklama}</div>
                  <div className="text-xs text-gray-400">{h.tarih} · {h.kategori}</div>
                </div>
                <div className={`font-semibold text-sm ${h.tip === 'gelir' ? 'text-green-600' : 'text-red-600'}`}>
                  {h.tip === 'gelir' ? '+' : '-'}{fmt(h.tutar)} ₺
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Butce Durumu */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4">Butce Durumu</h3>
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Gelir Hedefi Ilerleme</span>
              <span className="font-semibold text-gray-800">{butcePct.toFixed(1)}%</span>
            </div>
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${butcePct >= 100 ? 'bg-green-500' : butcePct >= 60 ? 'bg-blue-500' : 'bg-yellow-500'}`} style={{ width: `${butcePct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{fmt(toplamGelir)} ₺ gerceklesen</span>
              <span>{fmt(butceHedef)} ₺ hedef</span>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Toplam Gelir', val: toplamGelir, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Toplam Gider', val: toplamGider, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Net Bakiye', val: netGelir, icon: PiggyBank, color: netGelir >= 0 ? 'text-emerald-600' : 'text-red-600', bg: netGelir >= 0 ? 'bg-emerald-50' : 'bg-red-50' },
              { label: 'Toplam Borc', val: toplamBorc, icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50' },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.label} className={`flex items-center justify-between p-3 ${item.bg} rounded-xl`}>
                  <div className="flex items-center gap-2"><Icon size={15} className={item.color} /><span className="text-sm text-gray-700">{item.label}</span></div>
                  <span className={`font-semibold text-sm ${item.color}`}>{fmt(item.val)} ₺</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 12 Ay Karsilastirma */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-4">Aylik Karsilastirma (Son 12 Ay)</h3>
        <canvas ref={barRef} height={120} />
      </div>
    </div>
  );
}
