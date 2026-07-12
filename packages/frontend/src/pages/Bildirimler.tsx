import { useState, useMemo, useEffect } from 'react';
import { Bell, CheckCheck, Trash2, AlertTriangle, Clock, CreditCard, TrendingDown, Users, Info, CheckCircle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUrlState } from '../lib/useUrlState';

type BildirimTip = 'odeme' | 'uyari' | 'hatirlatma' | 'sistem';

interface Bildirim {
  id: string;
  tip: BildirimTip;
  baslik: string;
  aciklama: string;
  tutar?: number;
  tarih: string;
  okundu: boolean;
  kaynak: 'auto' | 'user';
}

const tipIcon: Record<BildirimTip, React.FC<{ size?: number | string; className?: string }>> = {
  odeme: CreditCard,
  uyari: AlertTriangle,
  hatirlatma: Clock,
  sistem: Info,
};

const tipBadge: Record<BildirimTip, string> = {
  odeme: 'bg-red-100 text-red-700',
  uyari: 'bg-yellow-100 text-yellow-700',
  hatirlatma: 'bg-blue-100 text-blue-700',
  sistem: 'bg-gray-100 text-gray-600',
};

const tipLabel: Record<BildirimTip, string> = {
  odeme: 'Odeme', uyari: 'Uyari', hatirlatma: 'Hatirlatma', sistem: 'Sistem',
};

type Tab = 'tumu' | 'okunmamis' | 'odeme' | 'uyari' | 'hatirlatma' | 'sistem';

function fmt(n: number) { return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} gun once`;
  if (hours > 0) return `${hours} saat once`;
  if (mins > 0) return `${mins} dakika once`;
  return 'Az once';
}

function loadLS<T>(key: string, def: T): T {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
}
function saveLS(key: string, val: unknown) { localStorage.setItem(key, JSON.stringify(val)); }

type PrefKey = 'gecikencek' | 'yaklasancek' | 'yuksekborc' | 'dusukbakiye' | 'maas' | 'butce';

export default function Bildirimler() {
  const { cekler, kasaBanka, cariHesaplar, personelHareketler, hareketler } = useApp();

  const [userBildirimler, setUserBildirimler] = useState<Bildirim[]>(() => loadLS('bildirimler', []));
  const [readIds, setReadIds] = useState<string[]>(() => loadLS('bildirimRead', []));
  const [deletedIds, setDeletedIds] = useState<string[]>(() => loadLS('bildirimDeleted', []));
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(() => loadLS('bildirimPrefs', {
    gecikencek: true, yaklasancek: true, yuksekborc: true, dusukbakiye: true, maas: true, butce: true,
  }));

  const [activeTab, setActiveTab] = useUrlState<Tab>('tab', 'tumu');

  useEffect(() => { saveLS('bildirimler', userBildirimler); }, [userBildirimler]);
  useEffect(() => { saveLS('bildirimRead', readIds); }, [readIds]);
  useEffect(() => { saveLS('bildirimDeleted', deletedIds); }, [deletedIds]);
  useEffect(() => { saveLS('bildirimPrefs', prefs); }, [prefs]);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const in7Days = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];

  const autoBildirimler = useMemo((): Bildirim[] => {
    const list: Bildirim[] = [];

    if (prefs.gecikencek) {
      cekler.filter(c => c.durum === 'geciken').forEach(c => {
        list.push({ id: `geciken-${c.id}`, tip: 'odeme', baslik: 'Geciken Cek Odemesi', aciklama: `${c.kisiAd} - ${c.vadeTarihi} vadeli cek gecikti`, tutar: c.tutar, tarih: c.vadeTarihi + 'T00:00:00', okundu: readIds.includes(`geciken-${c.id}`), kaynak: 'auto' });
      });
    }

    if (prefs.yaklasancek) {
      cekler.filter(c => c.durum === 'bekleyen' && c.vadeTarihi >= todayStr && c.vadeTarihi <= in7Days).forEach(c => {
        list.push({ id: `yaklasan-${c.id}`, tip: 'hatirlatma', baslik: 'Yaklasan Cek Vadesi', aciklama: `${c.kisiAd} - ${c.vadeTarihi} tarihinde vade dolacak`, tutar: c.tutar, tarih: todayStr + 'T00:00:00', okundu: readIds.includes(`yaklasan-${c.id}`), kaynak: 'auto' });
      });
    }

    if (prefs.yuksekborc) {
      const yuksek = cariHesaplar.filter(c => c.bakiye > 500000);
      if (yuksek.length > 0) {
        yuksek.forEach(c => {
          list.push({ id: `yuksekborc-${c.id}`, tip: 'uyari', baslik: 'Yuksek Borc Uyarisi', aciklama: `${c.ad} hesabinin borcu 500.000 ₺ ustunde`, tutar: c.bakiye, tarih: todayStr + 'T00:00:00', okundu: readIds.includes(`yuksekborc-${c.id}`), kaynak: 'auto' });
        });
      }
    }

    if (prefs.dusukbakiye) {
      const dusuk = kasaBanka.filter(k => k.bakiye < 50000);
      dusuk.forEach(k => {
        list.push({ id: `dusukbakiye-${k.id}`, tip: 'uyari', baslik: 'Dusuk Bakiye Uyarisi', aciklama: `${k.ad} bakiyesi 50.000 ₺ altina dustu`, tutar: k.bakiye, tarih: todayStr + 'T00:00:00', okundu: readIds.includes(`dusukbakiye-${k.id}`), kaynak: 'auto' });
      });
    }

    if (prefs.maas) {
      const currMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const maasOdendi = personelHareketler.filter(h => h.tip === 'maas' && h.tarih.startsWith(currMonth)).length > 0;
      if (!maasOdendi) {
        list.push({ id: `maas-${currMonth}`, tip: 'hatirlatma', baslik: 'Maas Odeme Donemi', aciklama: `${today.toLocaleDateString('tr-TR', { month: 'long' })} maas odemeleri henuz yapilmamis olabilir`, tarih: todayStr + 'T00:00:00', okundu: readIds.includes(`maas-${currMonth}`), kaynak: 'auto' });
      }
    }

    if (prefs.butce) {
      const gider = hareketler.filter(h => h.tip === 'gider').reduce((a, b) => a + b.tutar, 0);
      const gelir = hareketler.filter(h => h.tip === 'gelir').reduce((a, b) => a + b.tutar, 0);
      if (gider > gelir * 0.9 && gelir > 0) {
        list.push({ id: 'butce-asim', tip: 'uyari', baslik: 'Butce Asimi Uyarisi', aciklama: `Giderler gelirin %${((gider / gelir) * 100).toFixed(0)}'una ulasti`, tutar: gider - gelir, tarih: todayStr + 'T00:00:00', okundu: readIds.includes('butce-asim'), kaynak: 'auto' });
      }
    }

    return list.filter(b => !deletedIds.includes(b.id));
  }, [cekler, cariHesaplar, kasaBanka, personelHareketler, hareketler, prefs, readIds, deletedIds, todayStr, in7Days]);

  const allBildirimler = useMemo(() => {
    const user = userBildirimler.filter(b => !deletedIds.includes(b.id)).map(b => ({ ...b, okundu: readIds.includes(b.id) || b.okundu }));
    return [...autoBildirimler, ...user].sort((a, b) => b.tarih.localeCompare(a.tarih));
  }, [autoBildirimler, userBildirimler, deletedIds, readIds]);

  const filtered = useMemo(() => {
    if (activeTab === 'tumu') return allBildirimler;
    if (activeTab === 'okunmamis') return allBildirimler.filter(b => !b.okundu);
    return allBildirimler.filter(b => b.tip === activeTab);
  }, [allBildirimler, activeTab]);

  const okunmamisCount = allBildirimler.filter(b => !b.okundu).length;
  const odemeCount = allBildirimler.filter(b => b.tip === 'odeme').length;
  const uyariCount = allBildirimler.filter(b => b.tip === 'uyari').length;
  const tamamlananCount = allBildirimler.filter(b => b.okundu).length;

  function markRead(id: string) {
    setReadIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }

  function markUnread(id: string) {
    setReadIds(prev => prev.filter(x => x !== id));
  }

  function deleteBildirim(id: string) {
    setDeletedIds(prev => [...prev, id]);
  }

  function markAllRead() {
    setReadIds(prev => [...new Set([...prev, ...allBildirimler.map(b => b.id)])]);
  }

  function togglePref(key: PrefKey) {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const yaklasakOdemeler = useMemo(() => {
    return cekler.filter(c => c.durum === 'bekleyen' && c.vadeTarihi >= todayStr).sort((a, b) => a.vadeTarihi.localeCompare(b.vadeTarihi)).slice(0, 5);
  }, [cekler, todayStr]);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'tumu', label: 'Tumu', count: allBildirimler.length },
    { key: 'okunmamis', label: 'Okunmamis', count: okunmamisCount },
    { key: 'odeme', label: 'Odemeler', count: odemeCount },
    { key: 'uyari', label: 'Uyarilar', count: uyariCount },
    { key: 'hatirlatma', label: 'Hatirlatmalar' },
    { key: 'sistem', label: 'Sistem' },
  ];

  const prefItems: { key: PrefKey; label: string }[] = [
    { key: 'gecikencek', label: 'Geciken Cekler' },
    { key: 'yaklasancek', label: 'Yaklasan Cek Vadeleri' },
    { key: 'yuksekborc', label: 'Yuksek Borc Uyarisi' },
    { key: 'dusukbakiye', label: 'Dusuk Bakiye Uyarisi' },
    { key: 'maas', label: 'Maas Donemi' },
    { key: 'butce', label: 'Butce Asimi' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Bildirimler</h1>
          <p className="text-gray-500 text-sm">Onemli uyari ve hatirlatmalar</p>
        </div>
        {okunmamisCount > 0 && (
          <button onClick={markAllRead} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 text-sm font-medium transition-colors">
            <CheckCheck size={16} />Tumunu Okundu Isaretle
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Toplam', val: allBildirimler.length, color: 'from-emerald-500 to-emerald-600', icon: Bell },
          { label: 'Okunmamis', val: okunmamisCount, color: 'from-blue-500 to-blue-600', icon: Bell },
          { label: 'Yaklasan Odeme', val: yaklasakOdemeler.length, color: 'from-red-500 to-red-600', icon: CreditCard },
          { label: 'Uyarilar', val: uyariCount, color: 'from-yellow-500 to-yellow-600', icon: AlertTriangle },
          { label: 'Tamamlanan', val: tamamlananCount, color: 'from-green-500 to-green-600', icon: CheckCircle },
        ].map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`bg-gradient-to-br ${c.color} text-white rounded-2xl p-4`}>
              <div className="flex items-center gap-2 mb-1"><Icon size={16} className="opacity-80" /><span className="text-xs opacity-80">{c.label}</span></div>
              <div className="text-2xl font-bold">{c.val}</div>
            </div>
          );
        })}
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Notifications */}
        <div className="lg:col-span-3 space-y-4">
          {/* Tabs */}
          <div className="bg-white rounded-2xl border border-gray-100 p-2 shadow-sm flex flex-wrap gap-1">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors ${activeTab === t.key ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={`text-xs rounded-full px-1.5 py-0.5 ${activeTab === t.key ? 'bg-white/30' : 'bg-gray-200 text-gray-600'}`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Notification List */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Bell size={40} className="mb-3 opacity-30" />
                <p className="text-sm">Bildirim bulunamadi</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map(b => {
                  const Icon = tipIcon[b.tip];
                  return (
                    <div key={b.id} className={`px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors ${!b.okundu ? 'bg-blue-50/30' : ''}`}>
                      <div className={`p-2 rounded-xl flex-shrink-0 ${tipBadge[b.tip]}`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800 text-sm">{b.baslik}</span>
                              <span className={`px-1.5 py-0.5 text-xs rounded-md ${tipBadge[b.tip]}`}>{tipLabel[b.tip]}</span>
                              {!b.okundu && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />}
                            </div>
                            <div className="text-sm text-gray-500 mt-0.5">{b.aciklama}</div>
                            {b.tutar !== undefined && (
                              <div className="text-sm font-semibold text-gray-700 mt-0.5">{fmt(b.tutar)} ₺</div>
                            )}
                            <div className="text-xs text-gray-400 mt-1">{timeAgo(b.tarih)}</div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {b.okundu ? (
                              <button onClick={() => markUnread(b.id)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Okunmadi isaretle"><TrendingDown size={14} /></button>
                            ) : (
                              <button onClick={() => markRead(b.id)} className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors" title="Okundu isaretle"><CheckCircle size={14} /></button>
                            )}
                            <button onClick={() => deleteBildirim(b.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><X size={14} /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Yaklasan Odemeler */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><CreditCard size={16} className="text-red-500" />Yaklasan Odemeler</h3>
            {yaklasakOdemeler.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">Yaklasan odeme yok</div>
            ) : (
              <div className="space-y-2">
                {yaklasakOdemeler.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-2 bg-red-50 rounded-xl">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{c.kisiAd}</div>
                      <div className="text-xs text-gray-400">{c.vadeTarihi}</div>
                    </div>
                    <div className="text-sm font-semibold text-red-600">{fmt(c.tutar)} ₺</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bildirim Tercihleri */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Bell size={16} className="text-blue-500" />Bildirim Tercihleri</h3>
            <div className="space-y-3">
              {prefItems.map(p => (
                <div key={p.key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{p.label}</span>
                  <button
                    onClick={() => togglePref(p.key)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${prefs[p.key] ? 'bg-blue-500' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${prefs[p.key] ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
