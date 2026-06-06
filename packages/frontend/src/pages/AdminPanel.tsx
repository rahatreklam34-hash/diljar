import { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard, Building2, CreditCard, TrendingUp, LifeBuoy,
  ClipboardList, LogOut, Snowflake, Play, Coins, Check, X, Send,
  Package, Plus, Pencil, Trash2, Phone, Eye, Menu, Plug, Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Chart as ChartJS, ArcElement, BarElement, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import api, { apiErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';

ChartJS.register(ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const fmtKurus = (k: number) => '₺' + (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('tr-TR') : '-');
const STATUS_TR: Record<string, string> = { TRIAL: 'Deneme', ACTIVE: 'Aktif', TRIAL_EXPIRED: 'Süresi Doldu', PAST_DUE: 'Ödeme Bekliyor', FROZEN: 'Donduruldu', CANCELLED: 'İptal' };
const STATUS_COLOR: Record<string, string> = { TRIAL: 'bg-blue-100 text-blue-700', ACTIVE: 'bg-green-100 text-green-700', TRIAL_EXPIRED: 'bg-amber-100 text-amber-700', PAST_DUE: 'bg-orange-100 text-orange-700', FROZEN: 'bg-slate-200 text-slate-600', CANCELLED: 'bg-red-100 text-red-700' };

type Tab = 'genel' | 'firmalar' | 'paketler' | 'odemeler' | 'gelir' | 'destek' | 'loglar' | 'entegrasyonlar';

export default function AdminPanel() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('genel');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'genel', label: 'Genel Bakış', icon: LayoutDashboard },
    { id: 'firmalar', label: 'Firmalar', icon: Building2 },
    { id: 'paketler', label: 'Paketler / Fiyatlar', icon: Package },
    { id: 'odemeler', label: 'Ödemeler', icon: CreditCard },
    { id: 'gelir', label: 'Gelir Raporu', icon: TrendingUp },
    { id: 'entegrasyonlar', label: 'Entegrasyonlar', icon: Plug },
    { id: 'destek', label: 'Destek Talepleri', icon: LifeBuoy },
    { id: 'loglar', label: 'İşlem Logları', icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50">
      <button onClick={() => setMobileNav(true)} className="lg:hidden fixed top-3 left-3 z-[60] p-2 bg-slate-900 text-white rounded-lg shadow-lg" aria-label="Menü">
        <Menu size={20} />
      </button>
      {mobileNav && <div className="lg:hidden fixed inset-0 bg-black/50 z-[55]" onClick={() => setMobileNav(false)} />}
      <aside className={`w-64 bg-slate-900 text-slate-300 flex flex-col fixed inset-y-0 left-0 z-[58] transition-transform duration-300 ${mobileNav ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-5 border-b border-slate-800">
          <h1 className="text-white font-bold text-lg">WTech</h1>
          <p className="text-xs text-slate-500">Yönetim Paneli</p>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setMobileNav(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${tab === t.id ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}>
              <t.icon size={18} /> {t.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-2 px-2">{user?.fullName}</div>
          <button onClick={() => logout()} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-slate-800"><LogOut size={18} /> Çıkış</button>
          <p className="text-[10px] text-slate-600 text-center mt-3">© {new Date().getFullYear()} WTech Yazılım A.Ş.</p>
        </div>
      </aside>
      <main className="flex-1 ml-0 lg:ml-64 p-4 pt-16 lg:p-6 overflow-x-hidden">
        {tab === 'genel' && <GenelBakis />}
        {tab === 'firmalar' && <Firmalar onDetail={setDetailId} />}
        {tab === 'paketler' && <Paketler />}
        {tab === 'odemeler' && <Odemeler />}
        {tab === 'gelir' && <Gelir />}
        {tab === 'entegrasyonlar' && <AdminEntegrasyonlar />}
        {tab === 'destek' && <Destek />}
        {tab === 'loglar' && <Loglar />}
      </main>
      {detailId && <TenantDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function Card({ label, value, color = 'text-slate-800', sub }: { label: string; value: any; color?: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ───────── Genel Bakış (grafikli + beklenti) ─────────
function GenelBakis() {
  const [s, setS] = useState<any>(null);
  const [a, setA] = useState<any>(null);
  useEffect(() => {
    api.get('/admin/stats').then((r) => setS(r.data)).catch(() => {});
    api.get('/admin/analytics').then((r) => setA(r.data)).catch(() => {});
  }, []);
  if (!s || !a) return <div className="text-slate-400">Yükleniyor...</div>;

  const statusKeys = Object.keys(a.statusBreakdown || {});
  const statusColors: Record<string, string> = { TRIAL: '#3b82f6', ACTIVE: '#22c55e', TRIAL_EXPIRED: '#f59e0b', PAST_DUE: '#f97316', FROZEN: '#94a3b8', CANCELLED: '#ef4444' };

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-5">Genel Bakış</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card label="Toplam Firma" value={s.tenantCount} />
        <Card label="Aktif Abonelik" value={s.activeCount} color="text-green-600" />
        <Card label="Deneme" value={s.trialCount} color="text-blue-600" />
        <Card label="Ücretli Müşteri" value={a.paidCount} color="text-indigo-600" />
        <Card label="Aylık Gelir Beklentisi (MRR)" value={fmtKurus(a.mrr)} color="text-indigo-600" sub="Aktif aboneliklerden tahmini" />
        <Card label="Yıllık Beklenti" value={fmtKurus(a.projectedAnnual)} color="text-purple-600" sub="MRR × 12" />
        <Card label="Bekleyen Ödeme" value={s.pendingPayments} color="text-amber-600" />
        <Card label="Açık Destek" value={s.openTickets} color="text-orange-600" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-3">Firma Durum Dağılımı</h3>
          {statusKeys.length === 0 ? <p className="text-slate-400 text-sm">Veri yok</p> : (
            <Doughnut
              data={{
                labels: statusKeys.map((k) => STATUS_TR[k] || k),
                datasets: [{ data: statusKeys.map((k) => a.statusBreakdown[k]), backgroundColor: statusKeys.map((k) => statusColors[k] || '#cbd5e1'), borderWidth: 0 }],
              }}
              options={{ plugins: { legend: { position: 'bottom' } } }}
            />
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-3">Aylık Gelir (Son 6 Ay)</h3>
          <Bar
            data={{
              labels: a.months,
              datasets: [{ label: 'Gelir (₺)', data: a.revenue.map((v: number) => v / 100), backgroundColor: '#6366f1', borderRadius: 6 }],
            }}
            options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
          />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-3">Yeni Kayıtlar (Son 6 Ay)</h3>
          <Line
            data={{
              labels: a.months,
              datasets: [{ label: 'Kayıt', data: a.registrations, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.15)', fill: true, tension: 0.3 }],
            }}
            options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }}
          />
        </div>
      </div>
    </div>
  );
}

// ───────── Firmalar (filtre + telefon + tarih + detay) ─────────
function Firmalar({ onDetail }: { onDetail: (id: string) => void }) {
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'tumu' | 'aktif' | 'pasif' | 'ucretli'>('tumu');
  const load = useCallback(() => api.get('/admin/tenants', { params: { q } }).then((r) => setList(r.data)).catch(() => {}), [q]);
  useEffect(() => { load(); }, [load]);

  const freeze = async (id: string) => { try { await api.patch(`/admin/tenants/${id}/freeze`); toast.success('Donduruldu'); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const activate = async (id: string) => { try { await api.patch(`/admin/tenants/${id}/activate`, { billingCycle: 'MONTHLY' }); toast.success('Aktifleştirildi'); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const addCredit = async (id: string) => {
    const v = prompt('Eklenecek kredi miktarı (negatif = düş):');
    if (v === null) return;
    const amount = Number(v.replace(',', '.'));
    if (isNaN(amount)) return toast.error('Geçersiz miktar');
    try { await api.post(`/admin/tenants/${id}/credit`, { amount }); toast.success('Kredi güncellendi'); load(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const PASSIVE = ['FROZEN', 'CANCELLED', 'TRIAL_EXPIRED', 'PAST_DUE'];
  const filtered = list.filter((t) => {
    if (filter === 'aktif') return t.status === 'ACTIVE';
    if (filter === 'pasif') return PASSIVE.includes(t.status);
    if (filter === 'ucretli') return (t.payments?.length || 0) > 0;
    return true;
  });

  const tabBtn = (id: typeof filter, label: string) => (
    <button onClick={() => setFilter(id)} className={`px-4 py-1.5 rounded-lg text-sm font-medium ${filter === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{label}</button>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-xl font-bold text-slate-800">Firmalar</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Firma ara..." className="px-4 py-2 border border-slate-200 rounded-lg" />
      </div>
      <div className="flex gap-2 mb-4">
        {tabBtn('tumu', `Tümü (${list.length})`)}
        {tabBtn('aktif', `Aktif (${list.filter((t) => t.status === 'ACTIVE').length})`)}
        {tabBtn('pasif', `Pasif (${list.filter((t) => PASSIVE.includes(t.status)).length})`)}
        {tabBtn('ucretli', `Ücretli (${list.filter((t) => (t.payments?.length || 0) > 0).length})`)}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3">Firma</th><th className="px-4 py-3">İletişim</th><th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">Plan</th><th className="px-4 py-3">Başlangıç</th><th className="px-4 py-3">Bitiş</th>
              <th className="px-4 py-3">Kredi</th><th className="px-4 py-3">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const sub = t.subscriptions?.[0];
              const bitis = t.status === 'TRIAL' ? t.trialEndsAt : sub?.currentPeriodEnd;
              return (
                <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{t.name}</div>
                    {(t.payments?.length || 0) > 0 && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Ücretli</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    <div>{t.users?.[0]?.email || '-'}</div>
                    {t.phone && <div className="flex items-center gap-1 text-xs text-slate-400"><Phone size={11} /> {t.phone}</div>}
                  </td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status]}`}>{STATUS_TR[t.status]}</span></td>
                  <td className="px-4 py-3 text-slate-600">{sub?.plan?.name || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{dt(t.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{dt(bitis)}</td>
                  <td className="px-4 py-3 text-slate-600">{t.creditBalance}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => onDetail(t.id)} title="Hesap Dökümü" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><Eye size={16} /></button>
                      <button onClick={() => activate(t.id)} title="Aktifleştir" className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"><Play size={16} /></button>
                      <button onClick={() => freeze(t.id)} title="Dondur" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Snowflake size={16} /></button>
                      <button onClick={() => addCredit(t.id)} title="Kredi Ekle" className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600"><Coins size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Kayıt yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────── Üye Hesap Dökümü (detay) ─────────
function TenantDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [t, setT] = useState<any>(null);
  useEffect(() => { api.get(`/admin/tenants/${id}`).then((r) => setT(r.data)).catch(() => {}); }, [id]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl bg-white rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">{t?.name || 'Hesap Dökümü'}</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        {!t ? <p className="text-slate-400">Yükleniyor...</p> : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-slate-400">Durum</p><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status]}`}>{STATUS_TR[t.status]}</span></div>
              <div><p className="text-slate-400">Telefon</p><p className="font-medium">{t.phone || '-'}</p></div>
              <div><p className="text-slate-400">Kredi</p><p className="font-medium">{t.creditBalance}</p></div>
              <div><p className="text-slate-400">Kayıt</p><p className="font-medium">{dt(t.createdAt)}</p></div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-700 mb-2">Kullanıcılar</h4>
              <div className="space-y-1 text-sm">
                {t.users?.map((u: any) => <div key={u.id} className="flex justify-between border-b border-slate-50 py-1"><span>{u.fullName} ({u.email})</span><span className="text-slate-400">{u.role}</span></div>)}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-700 mb-2">Abonelik Geçmişi</h4>
              {t.subscriptions?.length ? (
                <table className="w-full text-sm"><tbody>
                  {t.subscriptions.map((s: any) => (
                    <tr key={s.id} className="border-b border-slate-50"><td className="py-1">{s.plan?.name || 'Deneme'}</td><td>{STATUS_TR[s.status]}</td><td>{s.billingCycle}</td><td className="text-slate-400">{dt(s.currentPeriodStart)} → {dt(s.currentPeriodEnd)}</td></tr>
                  ))}
                </tbody></table>
              ) : <p className="text-slate-400 text-sm">Kayıt yok</p>}
            </div>

            <div>
              <h4 className="font-semibold text-slate-700 mb-2">Ödemeler</h4>
              {t.payments?.length ? (
                <table className="w-full text-sm"><tbody>
                  {t.payments.map((p: any) => (
                    <tr key={p.id} className="border-b border-slate-50"><td className="py-1">{fmtKurus(p.amount)}</td><td>{p.method}</td><td>{p.status}</td><td className="text-slate-400">{dt(p.createdAt)}</td></tr>
                  ))}
                </tbody></table>
              ) : <p className="text-slate-400 text-sm">Ödeme yok</p>}
            </div>

            <div>
              <h4 className="font-semibold text-slate-700 mb-2">Kredi Hareketleri</h4>
              {t.creditLedger?.length ? (
                <table className="w-full text-sm"><tbody>
                  {t.creditLedger.map((c: any) => (
                    <tr key={c.id} className="border-b border-slate-50"><td className="py-1">{c.amount > 0 ? '+' : ''}{c.amount}</td><td>{c.type}</td><td className="text-slate-500">{c.description}</td><td className="text-slate-400">{dt(c.createdAt)}</td></tr>
                  ))}
                </tbody></table>
              ) : <p className="text-slate-400 text-sm">Hareket yok</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────── Paketler / Fiyatlar ─────────
function Paketler() {
  const [list, setList] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const load = () => api.get('/admin/plans').then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const empty = { name: '', priceMonthly: 0, priceYearly: 0, creditPerMonth: 0, features: [] as string[], isActive: true };
  const [form, setForm] = useState<any>(empty);
  const open = (p?: any) => { setForm(p ? { ...p, features: p.features || [] } : empty); setEdit(p || {}); };
  const save = async () => {
    const body = {
      name: form.name,
      priceMonthly: Math.round(Number(form.priceMonthly) * 100),
      priceYearly: Math.round(Number(form.priceYearly) * 100),
      creditPerMonth: Number(form.creditPerMonth) || 0,
      features: typeof form.features === 'string' ? form.features.split('\n').map((x: string) => x.trim()).filter(Boolean) : form.features,
      isActive: !!form.isActive,
    };
    try {
      if (edit?.id) await api.patch(`/admin/plans/${edit.id}`, body);
      else await api.post('/admin/plans', body);
      toast.success('Kaydedildi'); setEdit(null); load();
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (id: string) => {
    if (!confirm('Bu planı silmek/pasifleştirmek istediğinize emin misiniz?')) return;
    try { await api.delete(`/admin/plans/${id}`); toast.success('İşlendi'); load(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  // düzenleme formunda fiyat TL göster (kuruş -> TL)
  const openEdit = (p: any) => { open({ ...p, priceMonthly: p.priceMonthly / 100, priceYearly: p.priceYearly / 100, features: (p.features || []).join('\n') }); };
  const openNew = () => { open(); setForm({ ...empty, features: '' }); };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-slate-800">Paketler / Fiyatlar</h2>
        <button onClick={openNew} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"><Plus size={18} /> Yeni Paket</button>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {list.map((p) => (
          <div key={p.id} className={`bg-white rounded-2xl p-6 border-2 ${p.isActive ? 'border-slate-100' : 'border-dashed border-slate-300 opacity-70'}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">{p.name}</h3>
              <div className="flex gap-1">
                <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil size={15} /></button>
                <button onClick={() => del(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
              </div>
            </div>
            <div className="mt-2"><span className="text-2xl font-bold text-indigo-600">{fmtKurus(p.priceMonthly)}</span><span className="text-slate-400 text-sm">/ay</span></div>
            <p className="text-xs text-slate-400">Yıllık {fmtKurus(p.priceYearly)} · {p.creditPerMonth} kredi/ay</p>
            {!p.isActive && <span className="text-xs text-amber-600">Pasif</span>}
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {(p.features || []).map((f: string, i: number) => <li key={i}>• {f}</li>)}
            </ul>
          </div>
        ))}
        {list.length === 0 && <p className="text-slate-400">Henüz paket yok</p>}
      </div>

      {edit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setEdit(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{edit?.id ? 'Paketi Düzenle' : 'Yeni Paket'}</h3><button onClick={() => setEdit(null)}><X size={20} className="text-slate-400" /></button></div>
            <label className="block text-sm text-slate-600">Ad
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-slate-600">Aylık (₺)
                <input type="number" value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg" /></label>
              <label className="block text-sm text-slate-600">Yıllık (₺)
                <input type="number" value={form.priceYearly} onChange={(e) => setForm({ ...form, priceYearly: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg" /></label>
            </div>
            <label className="block text-sm text-slate-600">Aylık Kredi
              <input type="number" value={form.creditPerMonth} onChange={(e) => setForm({ ...form, creditPerMonth: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg" /></label>
            <label className="block text-sm text-slate-600">Özellikler (her satır bir madde)
              <textarea rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg" /></label>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Aktif (yeni kayıtlarda görünür)</label>
            <button onClick={save} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700">Kaydet</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Odemeler() {
  const [list, setList] = useState<any[]>([]);
  const load = () => api.get('/admin/payments').then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const confirm2 = async (id: string) => { try { await api.post(`/admin/payments/${id}/confirm`); toast.success('Onaylandı'); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const reject = async (id: string) => { try { await api.post(`/admin/payments/${id}/reject`); toast.success('Reddedildi'); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-5">Ödemeler</h2>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left"><tr><th className="px-4 py-3">Firma</th><th className="px-4 py-3">Tutar</th><th className="px-4 py-3">Yöntem</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">İşlem</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-3 text-slate-800">{p.tenant?.name}</td>
                <td className="px-4 py-3 font-medium">{fmtKurus(p.amount)}</td>
                <td className="px-4 py-3 text-slate-500">{p.method}</td>
                <td className="px-4 py-3">{p.status}</td>
                <td className="px-4 py-3">
                  {p.status === 'PENDING' && (
                    <div className="flex gap-1">
                      <button onClick={() => confirm2(p.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"><Check size={16} /></button>
                      <button onClick={() => reject(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"><X size={16} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Ödeme yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Gelir() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get('/admin/revenue').then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div className="text-slate-400">Yükleniyor...</div>;
  const months = Object.entries(data.byMonth || {}) as [string, number][];
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-5">Abonelik Gelir Raporu</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card label="Toplam Gelir" value={fmtKurus(data.total)} color="text-indigo-600" />
        <Card label="Onaylı Ödeme" value={data.count} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-3">Aylık Dağılım</h3>
        {months.length === 0 && <p className="text-slate-400 text-sm">Veri yok</p>}
        <div className="space-y-2">
          {months.map(([m, v]) => (
            <div key={m} className="flex items-center justify-between text-sm"><span className="text-slate-500">{m}</span><span className="font-medium text-slate-800">{fmtKurus(v)}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Destek() {
  const [list, setList] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [reply, setReply] = useState('');
  const load = () => api.get('/admin/tickets').then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const open = async (id: string) => { const r = await api.get(`/admin/tickets/${id}`); setActive(r.data); };
  const send = async () => {
    if (!active || !reply.trim()) return;
    try { await api.post(`/admin/tickets/${active.id}/messages`, { content: reply }); setReply(''); open(active.id); load(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const close = async (id: string) => { try { await api.patch(`/admin/tickets/${id}`, { status: 'CLOSED' }); open(id); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-5">Destek Talepleri</h2>
        <div className="space-y-2">
          {list.map((t) => (
            <button key={t.id} onClick={() => open(t.id)} className={`w-full text-left bg-white rounded-xl border p-4 ${active?.id === t.id ? 'border-indigo-400' : 'border-slate-200'}`}>
              <div className="flex justify-between"><span className="font-medium text-slate-800">{t.subject}</span><span className="text-xs text-slate-400">{t.status}</span></div>
              <div className="text-xs text-slate-400 mt-1">{t.tenant?.name} · {new Date(t.updatedAt).toLocaleString('tr-TR')}</div>
            </button>
          ))}
          {list.length === 0 && <p className="text-slate-400 text-sm">Talep yok</p>}
        </div>
      </div>
      {active && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col max-h-[75vh]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">{active.subject}</h3>
            <button onClick={() => close(active.id)} className="text-xs text-slate-400 hover:text-red-500">Kapat</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3">
            {active.messages?.map((m: any) => (
              <div key={m.id} className={`flex ${m.isAdmin ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.isAdmin ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  <p>{m.content}</p>
                  <p className={`text-[10px] mt-1 ${m.isAdmin ? 'text-indigo-200' : 'text-slate-400'}`}>{m.isAdmin ? 'Siz (Destek)' : 'Müşteri'} · {new Date(m.createdAt).toLocaleString('tr-TR')}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Yanıt yazın..." className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg" />
            <button onClick={send} className="bg-indigo-600 text-white px-4 rounded-lg hover:bg-indigo-700"><Send size={18} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function Loglar() {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { api.get('/admin/audit').then((r) => setList(r.data)).catch(() => {}); }, []);
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-5">İşlem Logları</h2>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left"><tr><th className="px-4 py-3">Tarih</th><th className="px-4 py-3">Firma</th><th className="px-4 py-3">İşlem</th><th className="px-4 py-3">Detay</th></tr></thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="px-4 py-3 text-slate-400">{new Date(l.createdAt).toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3 text-slate-600">{l.tenant?.name}</td>
                <td className="px-4 py-3 font-medium text-slate-700">{l.action}</td>
                <td className="px-4 py-3 text-slate-500">{l.detail}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Log yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───── Platform Ödeme Entegrasyonları (abonelik tahsilatı) ─────
function AdminEntegrasyonlar() {
  const MASK = '••••••••';
  const [providers, setProviders] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const load = () => api.get('/admin/integrations').then((r) => setSettings(r.data)).catch(() => {});
  useEffect(() => {
    api.get('/admin/integrations/catalog').then((r) => setProviders([...(r.data.payment || []), ...(r.data.ai || [])])).catch(() => {});
    load();
  }, []);
  const getS = (p: string) => settings.find((s) => s.provider === p);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2"><Plug size={20} className="text-indigo-600" /><h2 className="text-xl font-bold text-slate-800">Entegrasyonlar</h2></div>
      <p className="text-sm text-slate-400 mb-5">Abonelik tahsilatı (PayTR/iyzico) ve yapay zeka asistanı (OpenAI) ayarları. Bu ayarlar tüm platform için geçerlidir.</p>
      <div className="grid md:grid-cols-2 gap-5">
        {providers.map((d) => <AdminProviderCard key={d.provider} def={d} setting={getS(d.provider)} mask={MASK} onSaved={load} />)}
        {providers.length === 0 && <p className="text-slate-400">Sağlayıcı bulunamadı</p>}
      </div>
    </div>
  );
}

function AdminProviderCard({ def, setting, mask, onSaved }: { def: any; setting: any; mask: string; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(setting?.enabled || false);
  const [mode, setMode] = useState(setting?.mode || 'TEST');
  const [config, setConfig] = useState<Record<string, string>>(() => ({ ...(setting?.config || {}) }));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setEnabled(setting?.enabled || false); setMode(setting?.mode || 'TEST'); setConfig({ ...(setting?.config || {}) }); }, [setting]);
  const save = async () => {
    setBusy(true);
    try { await api.put(`/admin/integrations/${def.provider}`, { enabled, mode, config }); toast.success(`${def.label} kaydedildi`); onSaved(); }
    catch (e) { toast.error(apiErrorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className={`bg-white rounded-2xl border p-5 ${enabled ? 'border-indigo-300' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-800">{def.label}</h3>
        <label className="inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <div className="w-10 h-5 bg-slate-200 peer-checked:bg-indigo-500 rounded-full relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-5" />
        </label>
      </div>
      {def.description && <p className="text-xs text-slate-400 mb-3">{def.description}</p>}
      <div className="space-y-3">
        {def.fields.map((f: any) => (
          <div key={f.key}>
            <label className="block text-xs text-slate-500 mb-1">{f.label}{f.optional && ' (opsiyonel)'}</label>
            <input type={f.type === 'password' ? 'password' : 'text'} value={config[f.key] || ''} placeholder={f.type === 'password' && setting?.config?.[f.key] === mask ? mask : ''} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
        ))}
        <div className="flex items-center justify-between pt-1">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg">
            <option value="TEST">Test Modu</option><option value="LIVE">Canlı Mod</option>
          </select>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"><Save size={15} /> Kaydet</button>
        </div>
      </div>
    </div>
  );
}
