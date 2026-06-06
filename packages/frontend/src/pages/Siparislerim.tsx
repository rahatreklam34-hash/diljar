import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, X, Link2, MessageCircle, Wallet, TrendingUp, Users, Receipt, Search, MoreVertical, FileText, Pencil, Truck, Ticket, Check, CreditCard, Banknote, Building2, Clock, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KANAL: Record<string, string> = { online: 'Online Mağaza', canli: 'Canlı Yayın', manuel: 'Manuel' };

const STATUSES = [
  { key: 'sepet', t: 'Açık Sepetler', short: 'Açık Sepet', c: 'bg-rose-100 text-rose-600' },
  { key: 'hazirlaniyor', t: 'Hazırlanıyor', short: 'Hazırlanıyor', c: 'bg-blue-100 text-blue-700' },
  { key: 'yeni', t: 'Kargo Beklemede', short: 'Kargo Beklemede', c: 'bg-amber-100 text-amber-700' },
  { key: 'kargoda', t: 'Kargoda', short: 'Kargoda', c: 'bg-sky-100 text-sky-700' },
  { key: 'teslim', t: 'Teslim Edildi', short: 'Teslim Edildi', c: 'bg-green-100 text-green-700' },
  { key: 'iptal', t: 'İptal Edilen', short: 'İptal', c: 'bg-red-100 text-red-700' },
  { key: 'kapali', t: 'Kapalı Sepetler', short: 'Kapalı Sepet', c: 'bg-slate-100 text-slate-500' },
];
const STMAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

const KARGO_BRAND: Record<string, { bg: string; kisa: string }> = {
  'Yurtiçi Kargo': { bg: 'bg-orange-500', kisa: 'YK' },
  'Aras Kargo': { bg: 'bg-blue-600', kisa: 'AR' },
  'Sürat Kargo': { bg: 'bg-red-600', kisa: 'SK' },
  'MNG Kargo': { bg: 'bg-amber-500', kisa: 'MNG' },
  'PTT Kargo': { bg: 'bg-yellow-500', kisa: 'PTT' },
  'DHL': { bg: 'bg-yellow-400', kisa: 'DHL' },
};
const KARGO_FIRMALAR = Object.keys(KARGO_BRAND);
function KargoLogo({ firma }: { firma: string }) {
  const b = KARGO_BRAND[firma] || { bg: 'bg-slate-400', kisa: '?' };
  return <div className={`w-12 h-12 rounded-xl ${b.bg} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>{b.kisa}</div>;
}
const siparisNo = (id: string) => '#SIP' + id.slice(-5).toUpperCase();
const orderLabel = (o: any) => o?.orderNo ? `${o.orderYil || new Date(o.createdAt).getFullYear()}-${String(o.orderNo).padStart(3, '0')}` : siparisNo(o.id);
const initials = (ad: string) => (ad || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const waLink = (tel: string) => { let d = (tel || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '90' + d.slice(1); else if (d.length === 10) d = '90' + d; return 'https://wa.me/' + d; };

export default function Siparislerim({ kanalFilter }: { kanalFilter?: 'online' | 'canli' }) {
  const { orders, customers, products, categories, discountCodes, campaigns, reload } = useStore();
  const [tab, setTab] = useState<string>('tumu');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [modal, setModal] = useState(false);
  const perPage = 12;

  const cust = (id?: string) => customers.find((c) => c.id === id);
  const custName = (o: any) => cust(o.customerId)?.ad || o.musteriHandle || 'Misafir';
  const custPhone = (o: any) => cust(o.customerId)?.telefon || '';
  const custInsta = (o: any) => { const ig = cust(o.customerId)?.instagram || (o.musteriHandle && !cust(o.customerId) ? o.musteriHandle : ''); return ig ? String(ig).replace(/^@/, '') : ''; };
  const prodCost = useMemo(() => new Map(products.map((p) => [p.id, p.alisFiyat || 0])), [products]);

  const channelOrders = useMemo(() => orders.filter((o) => !kanalFilter || o.kanal === kanalFilter), [orders, kanalFilter]);

  const kpi = useMemo(() => {
    const valid = channelOrders.filter((o) => o.durum !== 'iptal' && o.durum !== 'sepet');
    const ciro = valid.reduce((s, o) => s + (o.toplam || 0), 0);
    let kar = 0;
    for (const o of valid) {
      const cost = (o.items || []).reduce((x: number, it: any) => x + (prodCost.get(it.productId) || 0) * (it.adet || 1), 0);
      kar += (o.toplam || 0) - cost;
    }
    const aktifMusteri = new Set(channelOrders.map((o) => o.customerId).filter(Boolean)).size;
    return { ciro, kar, toplam: channelOrders.length, aktifMusteri };
  }, [channelOrders, prodCost]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { tumu: channelOrders.length };
    STATUSES.forEach((s) => { m[s.key] = channelOrders.filter((o) => o.durum === s.key).length; });
    return m;
  }, [channelOrders]);

  const filtered = useMemo(() => {
    let list = tab === 'tumu' ? channelOrders : channelOrders.filter((o) => o.durum === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) => siparisNo(o.id).toLowerCase().includes(q) || custName(o).toLowerCase().includes(q) || custPhone(o).includes(q) || custInsta(o).toLowerCase().includes(q));
    }
    return list;
  }, [channelOrders, tab, search, customers]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

  const setDurum = async (o: any, durum: string) => { setMenuId(null); try { await api.patch(`/store/orders/${o.id}`, { durum }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const del = async (id: string) => { setMenuId(null); if (!confirm('Sipariş silinsin mi?')) return; try { await api.delete(`/store/orders/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const copyLink = (o: any) => { if (!o.token) { toast.error('Bu siparişin paylaşım linki yok'); return; } navigator.clipboard.writeText(`${window.location.origin}/sepet/${o.token}`); toast.success('Sepet linki kopyalandı'); };
  const odemeTalep = (o: any) => {
    const link = o.token ? `${window.location.origin}/sepet/${o.token}` : '';
    const kalan = (o.toplam || 0) - (o.tahsilat || 0);
    const msg = `Merhaba, ${fmt(kalan)} tutarındaki siparişiniz için ödeme bağlantınız: ${link}`;
    const tel = custPhone(o);
    if (tel) window.open(waLink(tel) + '?text=' + encodeURIComponent(msg), '_blank');
    else { navigator.clipboard.writeText(msg); toast.success('Ödeme talebi kopyalandı'); }
  };
  const sohbet = (o: any) => { const tel = custPhone(o); if (tel) window.open(waLink(tel), '_blank'); else toast.error('Müşteri telefonu yok'); };

  // ── Yeni Siparis modali ──
  const [form, setForm] = useState<any>({ customerId: '', kanal: kanalFilter || 'manuel', items: [], indirimKodu: '', not: '' });
  const addItem = () => setForm((f: any) => ({ ...f, items: [...f.items, { productId: products[0]?.id || '', ad: products[0]?.ad || '', adet: 1, fiyat: products[0]?.satisFiyat || 0 }] }));
  const setItem = (i: number, patch: any) => setForm((f: any) => ({ ...f, items: f.items.map((it: any, idx: number) => idx === i ? { ...it, ...patch } : it) }));
  const delItem = (i: number) => setForm((f: any) => ({ ...f, items: f.items.filter((_: any, idx: number) => idx !== i) }));
  const onProduct = (i: number, pid: string) => { const p = products.find((x) => x.id === pid); setItem(i, { productId: pid, ad: p?.ad || '', fiyat: p?.satisFiyat || 0 }); };
  const araToplam = form.items.reduce((s: number, it: any) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 0), 0);
  const disc = discountCodes.find((d) => d.aktif && d.code === form.indirimKodu);
  const indirim = disc ? (disc.tip === 'yuzde' ? araToplam * disc.deger / 100 : disc.deger) : 0;
  const toplam = Math.max(0, araToplam - indirim);
  const saveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.items.length === 0) { toast.error('En az 1 ürün ekleyin'); return; }
    try { await api.post('/store/orders', { customerId: form.customerId || null, kanal: form.kanal, items: form.items, araToplam, indirim, toplam, durum: 'yeni', not: form.not || null }); toast.success('Sipariş oluşturuldu'); setModal(false); setForm({ customerId: '', kanal: kanalFilter || 'manuel', items: [], indirimKodu: '', not: '' }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const title = kanalFilter === 'online' ? 'Online Mağaza Satışları' : kanalFilter === 'canli' ? 'Canlı Yayın Satışları' : 'Siparişlerim';

  return (
    <div>
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard icon={Wallet} label="Toplam Ciro" value={fmt(kpi.ciro)} color="text-slate-800" iconBg="bg-indigo-100 text-indigo-600" />
        <KpiCard icon={TrendingUp} label="Tahmini Kâr" value={fmt(kpi.kar)} color="text-green-600" iconBg="bg-green-100 text-green-600" />
        <KpiCard icon={Receipt} label="Toplam Sipariş" value={kpi.toplam} color="text-slate-800" iconBg="bg-amber-100 text-amber-600" />
        <KpiCard icon={Users} label="Aktif Müşteri" value={kpi.aktifMusteri} color="text-slate-800" iconBg="bg-sky-100 text-sky-600" />
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>
          <p className="text-sm text-slate-400">Tüm siparişlerinizi listeleyin, filtreleyin ve yönetin.</p>
        </div>
        <button onClick={() => { setModal(true); if (form.items.length === 0) addItem(); }} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700"><Plus size={18} /> Yeni Sipariş</button>
      </div>

      {/* Durum sekmeleri */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
        <TabBtn active={tab === 'tumu'} onClick={() => { setTab('tumu'); setPage(1); }} label="Tümü" count={counts.tumu} />
        {STATUSES.map((s) => <TabBtn key={s.key} active={tab === s.key} onClick={() => { setTab(s.key); setPage(1); }} label={s.t} count={counts[s.key]} />)}
      </div>

      {/* Arama */}
      <div className="relative max-w-sm mb-4">
        <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Sipariş No, Müşteri Ara..." className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg" />
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Sipariş No</th><th className="px-4 py-3">Müşteri</th><th className="px-4 py-3 text-center">Ürün Adedi</th>
              <th className="px-4 py-3">Durum</th><th className="px-4 py-3">Tutar</th><th className="px-4 py-3">Tahsil Edilen</th>
              <th className="px-4 py-3">Kalan Bakiye</th><th className="px-4 py-3">Tarih</th><th className="px-4 py-3">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((o) => {
              const adet = (o.items || []).reduce((s: number, it: any) => s + (it.adet || 1), 0);
              const kalan = (o.toplam || 0) - (o.tahsilat || 0);
              const st = STMAP[o.durum] || { short: o.durum, c: 'bg-slate-100 text-slate-500' };
              return (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{orderLabel(o)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">{initials(custName(o))}</div>
                      <div><p className="font-medium text-slate-800 leading-tight">{custName(o)}</p>{custInsta(o) && <p className="text-xs text-pink-600 leading-tight">@{custInsta(o)}</p>}{custPhone(o) && <p className="text-xs text-slate-400">{custPhone(o)}</p>}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{adet}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${st.c}`}>{st.short}</span></td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{fmt(o.toplam)}</td>
                  <td className="px-4 py-3 font-medium text-green-600">{fmt(o.tahsilat || 0)}</td>
                  <td className={`px-4 py-3 font-medium ${kalan > 0 ? 'text-red-500' : 'text-slate-400'}`}>{fmt(kalan)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(o.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <ActBtn onClick={() => setDetail(o)} icon={FileText} label="Sepet Detayı" cls="text-slate-600 border-slate-200" />
                      <ActBtn onClick={() => sohbet(o)} icon={MessageCircle} label="Sohbet" cls="text-blue-600 border-blue-200" />
                      <ActBtn onClick={() => copyLink(o)} icon={Link2} label="Link" cls="text-slate-600 border-slate-200" />
                      <ActBtn onClick={() => odemeTalep(o)} icon={Wallet} label="Ödeme Talep" cls="text-green-600 border-green-200" />
                      <button onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); if (menuId === o.id) { setMenuId(null); setMenuPos(null); } else { setMenuId(o.id); setMenuPos({ x: r.right, y: r.bottom }); } }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><MoreVertical size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageItems.length === 0 && <tr><td colSpan={9} className="px-4 py-16 text-center text-slate-400">Sipariş bulunamadı.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Sayfalama */}
      <div className="flex items-center justify-between mt-3 text-sm text-slate-500">
        <span>{filtered.length} kayıt</span>
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40">‹</button>
          <span className="px-3">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40">›</button>
        </div>
      </div>

      {/* Fixed dropdown menü (overflow kırpılmasını önler) */}
      {menuId && menuPos && (() => {
        const o = channelOrders.find((x) => x.id === menuId);
        if (!o) return null;
        const estH = STATUSES.length * 34 + 70;
        const up = menuPos.y + estH > window.innerHeight - 8;
        const top = up ? Math.max(8, menuPos.y - estH - 28) : menuPos.y + 4;
        return (
          <>
            <div className="fixed inset-0 z-[90]" onClick={() => { setMenuId(null); setMenuPos(null); }} />
            <div className="fixed z-[95] w-48 bg-white border border-slate-200 rounded-lg shadow-xl py-1 max-h-[70vh] overflow-y-auto" style={{ top, left: menuPos.x, transform: 'translateX(-100%)' }}>
              <p className="px-3 py-1 text-[10px] text-slate-400 uppercase">Durum Değiştir</p>
              {STATUSES.map((s) => <button key={s.key} onClick={() => { setDurum(o, s.key); setMenuPos(null); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">{s.t}</button>)}
              <div className="border-t border-slate-100 my-1" />
              <button onClick={() => { del(o.id); setMenuPos(null); }} className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50">Sil</button>
            </div>
          </>
        );
      })()}

      {detail && <DetailModal order={detail} customer={cust(detail.customerId)} custName={custName(detail)} custPhone={custPhone(detail)} products={products} categories={categories} discountCodes={discountCodes} campaigns={campaigns} onClose={() => setDetail(null)} reload={reload} />}

      {/* Yeni siparis modali */}
      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setModal(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={saveOrder} className="w-full max-w-lg bg-white rounded-2xl p-6 max-h-[88vh] overflow-y-auto space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Yeni Sipariş</h3><button type="button" onClick={() => setModal(false)}><X size={20} className="text-slate-400" /></button></div>
            <div className="grid grid-cols-2 gap-2">
              <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="px-3 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Misafir müşteri</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select>
              <select value={form.kanal} onChange={(e) => setForm({ ...form, kanal: e.target.value })} className="px-3 py-2 text-sm border border-slate-200 rounded-lg">{Object.entries(KANAL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
            <div className="space-y-2">
              {form.items.map((it: any, i: number) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={it.productId} onChange={(e) => onProduct(i, e.target.value)} className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg">{products.map((p) => <option key={p.id} value={p.id}>{p.ad}</option>)}</select>
                  <input type="number" value={it.adet} min={1} onChange={(e) => setItem(i, { adet: Number(e.target.value) })} className="w-16 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
                  <input type="number" value={it.fiyat} onChange={(e) => setItem(i, { fiyat: Number(e.target.value) })} className="w-24 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
                  <button type="button" onClick={() => delItem(i)} className="text-red-500"><Trash2 size={15} /></button>
                </div>
              ))}
              <button type="button" onClick={addItem} className="text-sm text-indigo-600 inline-flex items-center gap-1"><Plus size={14} /> Ürün ekle</button>
            </div>
            <input value={form.indirimKodu} onChange={(e) => setForm({ ...form, indirimKodu: e.target.value })} placeholder="İndirim kodu (ops.)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Ara Toplam</span><span>{fmt(araToplam)}</span></div>
              {indirim > 0 && <div className="flex justify-between text-green-600"><span>İndirim</span><span>-{fmt(indirim)}</span></div>}
              <div className="flex justify-between font-bold text-slate-800"><span>Toplam</span><span>{fmt(toplam)}</span></div>
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700">Siparişi Oluştur</button>
          </form>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Ic, label, value, color, iconBg }: any) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}><Ic size={20} /></div>
      <div><p className="text-xs text-slate-400">{label}</p><p className={`text-lg font-bold ${color}`}>{value}</p></div>
    </div>
  );
}
function TabBtn({ active, onClick, label, count }: any) {
  return (
    <button onClick={onClick} className={`px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-1.5 ${active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
      {label} {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>}
    </button>
  );
}
function ActBtn({ onClick, icon: Ic, label, cls }: any) {
  return <button onClick={onClick} title={label} className={`inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-lg hover:bg-slate-50 ${cls}`}><Ic size={13} /><span className="hidden xl:inline">{label}</span></button>;
}

function DetailModal({ order, customer, custName, custPhone, products, categories, discountCodes, campaigns, onClose, reload }: any) {
  const [durum, setDurumState] = useState<string>(order.durum);
  const [tahsilat, setTahsilat] = useState<number>(order.tahsilat || 0);
  const [kargoUcreti, setKargoUcreti] = useState<number>(order.kargoUcreti || 0);
  const [indirim, setIndirim] = useState<number>(order.indirim || 0);
  const [items, setItems] = useState<any[]>(Array.isArray(order.items) ? order.items.map((x: any) => ({ ...x })) : []);
  const [odemeYontemi, setOdemeYontemi] = useState<string>(order.odemeYontemi || 'Banka');
  const [kargoFirmasi] = useState<string>(order.kargoFirmasi || 'Yurtiçi Kargo');
  const [kargoTakip] = useState<string>(order.kargoTakip || '');
  const [adres, setAdres] = useState<string>(order.adres || '');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<number | null>(null);
  const [discTip, setDiscTip] = useState<'yuzde' | 'tutar'>('yuzde');
  const [discVal, setDiscVal] = useState<string>('');
  const [kupon, setKupon] = useState<string>(order.indirimKodu || '');
  const [odemeSekli, setOdemeSekli] = useState<string>('Banka');
  const [odemeEkle, setOdemeEkle] = useState<string>('');
  const [odemeLinki, setOdemeLinki] = useState<string>(order.odemeLinki || '');
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [kampanyalar, setKampanyalar] = useState<any[]>(Array.isArray(order.kampanyalar) ? order.kampanyalar : []);

  const prodOf = (pid: string) => products.find((p: any) => p.id === pid);
  const imgOf = (pid: string) => (prodOf(pid)?.images || [])[0] || '';
  const katOf = (pid: string) => { const k = prodOf(pid)?.kategoriId; return categories?.find((c: any) => c.id === k)?.ad || ''; };
  const renkOf = (pid: string) => { const p = prodOf(pid); const v = (p?.variations || []).find((x: any) => /renk|color/i.test(x.ad)); return v?.deger || ''; };
  const cleanAd = (it: any) => { const p = prodOf(it.productId); return p?.ad || String(it.ad || '').replace(/\s*\([^)]*\)\s*$/, ''); };
  const bedenOf = (it: any) => { if (it.varyasyon) return it.varyasyon; if (it.beden) return it.beden; const m = String(it.ad || '').match(/\(([^)]+)\)\s*$/); return m ? m[1] : ''; };
  const sepetTutari = useMemo(() => items.reduce((s, it) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 0), 0), [items]);
  // Kampanya indirimini, kapsamdaki ürünlere orantılı dağıt -> her satırda indirim gösterimi
  const itemDiscMap = useMemo(() => {
    const map = new Map<number, number>();
    const toplamInd = Number(indirim) || 0;
    if (toplamInd <= 0) return map;
    const kampList = (Array.isArray(kampanyalar) ? kampanyalar : [])
      .map((k: any) => (campaigns || []).find((c: any) => c.id === k.id)).filter(Boolean);
    const inScope = (it: any) => {
      if (!kampList.length) return true; // kampanya detayı yoksa tüm sepete orantılı dağıt
      return kampList.some((c: any) => {
        if (c.kapsam === 'hepsi') return true;
        if (c.kapsam === 'urun') return it.productId === c.productId;
        if (c.kapsam === 'kategori') { const p = prodOf(it.productId); return p && p.kategoriId === c.kategoriId; }
        return false;
      });
    };
    const scoped = items.map((it, i) => ({ it, i })).filter(({ it }) => inScope(it));
    const scopedToplam = scoped.reduce((s, { it }) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 0), 0);
    if (scopedToplam > 0) scoped.forEach(({ it, i }) => map.set(i, ((Number(it.fiyat) || 0) * (Number(it.adet) || 0) / scopedToplam) * toplamInd));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, kampanyalar, campaigns, indirim]);
  const toplamTutar = Math.max(0, sepetTutari + (Number(kargoUcreti) || 0) - (Number(indirim) || 0));
  const kalan = toplamTutar - (Number(tahsilat) || 0);
  const odemeDurumu = kalan <= 0 ? 'Ödendi' : (tahsilat > 0 ? 'Kısmi' : 'Bekliyor');

  const loadEvents = async () => { try { const r = await api.get(`/store/orders/${order.id}/events`); setEvents(r.data || []); } catch { /* */ } };
  const loadFresh = async () => {
    try {
      const r = await api.get(`/store/orders/${order.id}`); const o = r.data;
      setItems(Array.isArray(o.items) ? o.items.map((x: any) => ({ ...x })) : []);
      setDurumState(o.durum); setTahsilat(o.tahsilat || 0); setKargoUcreti(o.kargoUcreti || 0);
      setIndirim(o.indirim || 0); setKupon(o.indirimKodu || ''); setAdres(o.adres || ''); setOdemeYontemi(o.odemeYontemi || 'Banka');
      setKampanyalar(Array.isArray(o.kampanyalar) ? o.kampanyalar : []);
      setOdemeLinki(o.odemeLinki || '');
    } catch { /* */ }
  };
  useEffect(() => { loadEvents(); loadFresh(); /* eslint-disable-next-line */ }, [order.id]);

  // ESC ile kapat
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (lightbox) setLightbox(null); else onClose(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lightbox, onClose]);

  const persist = async (extra: any = {}) => {
    setSaving(true);
    try {
      await api.patch(`/store/orders/${order.id}`, {
        durum, tahsilat: Number(tahsilat) || 0, kargoUcreti: Number(kargoUcreti) || 0,
        indirim: Number(indirim) || 0, indirimKodu: kupon || null, items,
        araToplam: sepetTutari, toplam: toplamTutar, odemeYontemi, adres: adres || null, ...extra,
      });
      toast.success('Kaydedildi');
      reload(); loadEvents();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setSaving(false); }
  };

  const setItemField = (i: number, patch: any) => setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  // Sunucuda iptal/silme -> stok iadesi
  const removeItem = async (i: number) => {
    if (!confirm('Ürün sepetten çıkarılsın mı? (Stok iade edilir)')) return;
    try {
      const r = await api.post(`/store/orders/${order.id}/item-remove`, { index: i });
      setItems(Array.isArray(r.data?.items) ? r.data.items : []);
      toast.success('Ürün çıkarıldı, stok iade edildi'); reload(); loadEvents();
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const applyDiscount = () => {
    const v = Number(discVal) || 0;
    const amount = discTip === 'yuzde' ? sepetTutari * v / 100 : v;
    setIndirim(Math.min(amount, sepetTutari));
    toast.success('İndirim uygulandı');
  };
  const applyKupon = () => {
    const code = kupon.trim();
    if (!code) { setIndirim(0); return; }
    const d = discountCodes.find((x: any) => x.aktif && x.code?.toLowerCase() === code.toLowerCase());
    if (!d) { toast.error('Geçersiz / pasif kupon kodu'); return; }
    const amount = d.tip === 'yuzde' ? sepetTutari * d.deger / 100 : d.deger;
    setIndirim(Math.min(amount, sepetTutari));
    toast.success(`Kupon uygulandı: ${d.tip === 'yuzde' ? '%' + d.deger : fmt(d.deger)}`);
  };

  const addOdeme = () => {
    const amt = Number(odemeEkle) || 0;
    if (amt <= 0) { toast.error('Geçerli bir tutar girin'); return; }
    const yeni = (Number(tahsilat) || 0) + amt;
    setTahsilat(yeni);
    setOdemeYontemi(odemeSekli);
    setOdemeEkle('');
    persist({ tahsilat: yeni, odemeYontemi: odemeSekli, _log: `Ödeme eklendi: ${fmt(amt)} (${odemeSekli})` });
    toast.success(`${fmt(amt)} ödeme eklendi (${odemeSekli})`);
  };

  const waLink = (tel: string) => { let dd = (tel || '').replace(/\D/g, ''); if (dd.startsWith('0')) dd = '90' + dd.slice(1); else if (dd.length === 10) dd = '90' + dd; return 'https://wa.me/' + dd; };
  const sohbet = () => { if (custPhone) window.open(waLink(custPhone), '_blank'); else toast.error('Müşteri telefonu yok'); };
  const copyLink = () => { if (!order.token) { toast.error('Bu siparişin paylaşım linki yok'); return; } navigator.clipboard.writeText(`${window.location.origin}/sepet/${order.token}`); toast.success('Sepet linki kopyalandı'); };
  const odemeTalep = () => {
    const link = order.token ? `${window.location.origin}/sepet/${order.token}` : '';
    const msg = `Merhaba, ${fmt(kalan)} tutarındaki siparişiniz için ödeme bağlantınız: ${link}`;
    if (custPhone) window.open(waLink(custPhone) + '?text=' + encodeURIComponent(msg), '_blank');
    else { navigator.clipboard.writeText(msg); toast.success('Ödeme talebi kopyalandı'); }
  };
  const iptal = async () => {
    if (!confirm('Sipariş iptal edilsin mi? Ürünler stoğa iade edilir.')) return;
    try { await api.post(`/store/orders/${order.id}/cancel`); toast.success('Sipariş iptal edildi, stok iade edildi'); reload(); onClose(); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };

  // PDF: Turkce + urun gorseli destekli yazdirilabilir HTML
  const exportPDF = () => {
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
    const rows = items.map((it) => {
      const img = imgOf(it.productId);
      const detay = [katOf(it.productId), renkOf(it.productId), prodOf(it.productId)?.barkod].filter(Boolean).join(' · ');
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          ${img ? `<img src="${esc(img)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px"/>` : ''}
          <div><div style="font-weight:600">${esc(cleanAd(it))}</div><div style="font-size:11px;color:#888">${esc(detay)}</div></div>
        </div></td>
        <td>${esc(it.varyasyon || it.beden || '-')}</td>
        <td>${esc(it.adet)}</td>
        <td>${fmt(it.fiyat)}</td>
        <td>${fmt((Number(it.fiyat) || 0) * (Number(it.adet) || 0))}</td>
      </tr>`;
    }).join('');
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(orderLabel(order))}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:24px}h1{font-size:20px;margin:0}
      .muted{color:#64748b;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;font-size:13px}th{color:#64748b;font-size:11px;text-transform:uppercase}
      .tot{margin-top:16px;width:280px;margin-left:auto}.tot div{display:flex;justify-content:space-between;padding:3px 0;font-size:13px}
      .tot .b{font-weight:700;border-top:1px solid #e2e8f0;padding-top:6px}</style></head>
      <body>
        <h1>Sipariş ${esc(orderLabel(order))}</h1>
        <div class="muted">Müşteri: ${esc(custName)}${custPhone ? ' · Tel: ' + esc(custPhone) : ''}</div>
        <div class="muted">Tarih: ${esc(new Date(order.createdAt).toLocaleString('tr-TR'))} · Durum: ${esc(STMAP[durum]?.t || durum)}</div>
        ${adres ? `<div class="muted">Adres: ${esc(adres)}</div>` : ''}
        <table><thead><tr><th>Ürün</th><th>Beden</th><th>Adet</th><th>Fiyat</th><th>Toplam</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="tot">
          <div><span>Sepet Tutarı</span><span>${fmt(sepetTutari)}</span></div>
          <div><span>Kargo</span><span>${fmt(kargoUcreti)}</span></div>
          <div><span>İndirim</span><span>-${fmt(indirim)}</span></div>
          <div class="b"><span>Toplam</span><span>${fmt(toplamTutar)}</span></div>
          <div><span>Tahsil Edilen</span><span>${fmt(tahsilat)}</span></div>
          <div><span>Kalan</span><span>${fmt(kalan)}</span></div>
        </div>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Açılır pencere engellendi'); return; }
    w.document.write(html); w.document.close();
  };

  const dt = (d: string) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const st = STMAP[durum] || { t: durum, c: 'bg-slate-100 text-slate-500' };

  // Kargo durum timeline (API ornek)
  const kargoSteps = [
    { k: 'Hazırlanıyor', done: true },
    { k: 'Kargoya Verildi', done: !!kargoTakip || durum === 'kargoda' || durum === 'teslim' },
    { k: 'Dağıtımda', done: durum === 'teslim' },
    { k: 'Teslim Edildi', done: durum === 'teslim' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-3 sm:p-6 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-5xl bg-white rounded-2xl my-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200 bg-white rounded-t-2xl flex-wrap sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-800">Sipariş Detayı</h3>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.c}`}>{st.t}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400">
              <span className="font-mono text-slate-600 font-semibold">{orderLabel(order)}</span>
              <span>Oluşturulma: {dt(order.createdAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportPDF} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50"><FileText size={15} /> PDF</button>
            <button onClick={() => { setDurumState('kargoda'); persist({ durum: 'kargoda' }); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Truck size={15} /> Kargola</button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
          </div>
        </div>

        <div className="p-5 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* SOL PANEL */}
            <div className="lg:col-span-2 space-y-4">
              {/* Müşteri & Durum */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card title="MÜŞTERİ">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">{initials(custName)}</div>
                    <div className="min-w-0"><p className="font-medium text-slate-800 truncate text-sm">{custName}</p><p className="text-xs text-slate-400 truncate">{custPhone || (customer?.instagram ? '@' + customer.instagram : 'Bilgi yok')}</p></div>
                    <button onClick={sohbet} title="Sohbet" className="ml-auto p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50"><MessageCircle size={16} /></button>
                  </div>
                  <textarea value={adres} onChange={(e) => setAdres(e.target.value)} onBlur={() => persist()} rows={2} placeholder="Teslimat adresi..." className="w-full text-sm text-slate-600 border border-slate-200 rounded-lg px-2 py-1.5 resize-none" />
                  {customer && ((customer.bakiye || 0) !== 0 || (customer.indirimYuzde || 0) > 0) && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {(customer.bakiye || 0) !== 0 && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${customer.bakiye > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>Bakiye: {fmt(customer.bakiye)}</span>}
                      {(customer.indirimYuzde || 0) > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700">Özel indirim: %{customer.indirimYuzde}</span>}
                    </div>
                  )}
                </Card>
                <Card title="DURUM & ÖDEME">
                  <label className="block text-[11px] text-slate-400 mb-1">Sipariş Durumu</label>
                  <select value={durum} onChange={(e) => setDurumState(e.target.value)} onBlur={() => persist()} className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 mb-2">
                    {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.t}</option>)}
                  </select>
                  <div className="flex items-center justify-between text-sm py-1"><span className="text-slate-400">Ödeme Durumu</span><span className={`font-medium ${odemeDurumu === 'Ödendi' ? 'text-green-600' : odemeDurumu === 'Kısmi' ? 'text-amber-600' : 'text-red-500'}`}>{odemeDurumu}</span></div>
                  <div className="flex items-center justify-between text-sm py-1"><span className="text-slate-400">Son Ödeme</span><span className="text-slate-600">{odemeYontemi}</span></div>
                </Card>
              </div>

              {/* Sepetteki Ürünler */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">Sepetteki Ürünler ({items.length})</h4>
                <table className="w-full text-sm">
                  <thead className="text-slate-400 text-left text-xs"><tr><th className="py-2">Ürün</th><th className="py-2 w-20">Beden</th><th className="py-2 w-16">Adet</th><th className="py-2 w-24">Fiyat</th><th className="py-2 w-24">Toplam</th><th className="py-2 text-right w-20">İşlem</th></tr></thead>
                  <tbody>
                    {items.map((it, i) => {
                      const img = imgOf(it.productId);
                      const detay = [katOf(it.productId), renkOf(it.productId), prodOf(it.productId)?.barkod].filter(Boolean).join(' · ');
                      return (
                        <tr key={i} className="border-t border-slate-100 align-top">
                          <td className="py-2.5"><div className="flex items-center gap-2.5">
                            <div className="w-11 h-11 rounded-lg bg-slate-100 overflow-hidden shrink-0 cursor-zoom-in hover:ring-2 hover:ring-indigo-300" onClick={() => img && setLightbox(img)}>{img ? <img src={img} className="w-full h-full object-cover" /> : null}</div>
                            <div className="min-w-0">
                              <p className="text-slate-700 font-medium leading-tight">{cleanAd(it)}</p>
                              {detay && <p className="text-[11px] text-slate-400 truncate">{detay}</p>}
                            </div>
                          </div></td>
                          <td className="py-2.5">{bedenOf(it) ? <span className="inline-block text-xs px-2 py-0.5 bg-slate-100 rounded-md text-slate-600">{bedenOf(it)}</span> : <span className="text-slate-400">-</span>}</td>
                          <td className="py-2.5">{editItem === i ? <input type="number" min={1} value={it.adet} onChange={(e) => setItemField(i, { adet: Number(e.target.value) })} className="w-14 border border-slate-200 rounded px-1.5 py-0.5" /> : <span className="text-slate-600">{it.adet}</span>}</td>
                          <td className="py-2.5">{editItem === i ? <input type="number" value={it.fiyat} onChange={(e) => setItemField(i, { fiyat: Number(e.target.value) })} className="w-20 border border-slate-200 rounded px-1.5 py-0.5" /> : <span className="text-slate-600">{fmt(it.fiyat)}</span>}</td>
                          <td className="py-2.5">{(() => {
                            const brut = (Number(it.fiyat) || 0) * (Number(it.adet) || 0);
                            const disc = itemDiscMap.get(i) || 0;
                            if (disc > 0) return (
                              <div className="leading-tight">
                                <span className="line-through text-slate-400 text-xs mr-1">{fmt(brut)}</span>
                                <span className="font-semibold text-green-600">{fmt(brut - disc)}</span>
                                <span className="block text-[9px] text-amber-600 font-medium inline-flex items-center gap-0.5"><Tag size={9} /> -{fmt(disc)}</span>
                              </div>
                            );
                            return <span className="font-medium text-slate-700">{fmt(brut)}</span>;
                          })()}</td>
                          <td className="py-2.5"><div className="flex items-center justify-end gap-1">
                            {editItem === i
                              ? <button onClick={() => { setEditItem(null); persist({ _log: `Ürün düzenlendi: ${cleanAd(it)} (Adet: ${it.adet}, Fiyat: ${fmt(it.fiyat)})` }); }} title="Onayla" className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100"><Check size={14} /></button>
                              : <button onClick={() => setEditItem(i)} title="Düzenle" className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"><Pencil size={14} /></button>}
                            <button onClick={() => removeItem(i)} title="Sil (stok iade)" className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 size={14} /></button>
                          </div></td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-400">Ürün yok</td></tr>}
                  </tbody>
                </table>
                <div className="flex justify-end items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                  <span className="text-sm text-slate-400">Sepet Toplamı:</span><span className="text-lg font-bold text-slate-800">{fmt(sepetTutari)}</span>
                  <button onClick={() => persist()} disabled={saving} className="ml-2 px-3 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50">Kaydet</button>
                </div>
              </div>

              {/* Kargo Bilgileri (read-only / API) & Hızlı İşlemler */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card title="KARGO BİLGİLERİ (API)">
                  <div className="flex items-center gap-3 mb-3">
                    <KargoLogo firma={kargoFirmasi} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">{kargoFirmasi}</p>
                      <p className="text-[11px] text-slate-400">Otomatik · API ile çekilir</p>
                    </div>
                    {kargoTakip
                      ? <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">Kargoya Verildi</span>
                      : <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">HAZIRLANIYOR</span>}
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] text-slate-400">Takip Kodu</span>
                    <span className="text-sm font-mono text-slate-600">{kargoTakip || '—'}</span>
                  </div>
                  {/* Durum timeline */}
                  <div className="space-y-2">
                    {kargoSteps.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`w-2.5 h-2.5 rounded-full ${s.done ? 'bg-green-500' : 'bg-slate-200'}`} />
                        <span className={s.done ? 'text-slate-700' : 'text-slate-400'}>{s.k}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3">Bu alan kargo entegrasyonu tamamlanınca otomatik dolar; manuel düzenlenemez.</p>
                </Card>
                <Card title="SEPET HAREKETLERİ">
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {events.length === 0 && <p className="text-xs text-slate-400">Henüz hareket yok.</p>}
                    {events.map((ev) => (
                      <div key={ev.id} className="flex gap-2.5 text-sm">
                        <div className="mt-0.5"><Clock size={13} className="text-slate-300" /></div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-700 leading-tight">{ev.islem}</p>
                          {ev.detay && <p className="text-[11px] text-slate-500 break-words">{ev.detay}</p>}
                          <p className="text-[10px] text-slate-400 mt-0.5">{dt(ev.createdAt)} · {ev.kullanici || 'Sistem'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>

            {/* SAĞ PANEL */}
            <div className="space-y-4">
              {/* Hızlı İşlemler (en üstte) */}
              <Card title="HIZLI İŞLEMLER">
                <div className="grid grid-cols-2 gap-2">
                  <QuickBtn onClick={sohbet} icon={MessageCircle} label="Sohbet" />
                  <QuickBtn onClick={copyLink} icon={Link2} label="Link Kopyala" />
                  <QuickBtn onClick={odemeTalep} icon={Wallet} label="Ödeme Talep" cls="text-green-600 border-green-200 hover:bg-green-50" />
                  <QuickBtn onClick={iptal} icon={Trash2} label="Sepeti İptal" cls="text-red-500 border-red-200 hover:bg-red-50" />
                </div>
              </Card>

              {/* İndirim + Kupon */}
              <Card title="İNDİRİM & KUPON">
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 mb-2">
                  <button onClick={() => setDiscTip('yuzde')} className={`px-3 py-1 text-sm rounded-md ${discTip === 'yuzde' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500'}`}>Yüzde</button>
                  <button onClick={() => setDiscTip('tutar')} className={`px-3 py-1 text-sm rounded-md ${discTip === 'tutar' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500'}`}>Tutar</button>
                </div>
                <div className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1.5 text-slate-400 text-sm">{discTip === 'yuzde' ? '%' : '₺'}</span>
                    <input type="number" value={discVal} onChange={(e) => setDiscVal(e.target.value)} placeholder="0" className="w-full pl-7 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
                  </div>
                  <button onClick={applyDiscount} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Uygula</button>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1"><Ticket size={13} className="absolute left-2.5 top-2 text-slate-400" /><input value={kupon} onChange={(e) => setKupon(e.target.value)} placeholder="Kupon kodu" className="w-full pl-7 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg" /></div>
                  <button onClick={applyKupon} className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600">Uygula</button>
                </div>
              </Card>

              {/* Ödeme Özeti */}
              <Card title="ÖDEME ÖZETİ">
                <SumRow label="Sepet Tutarı" value={fmt(sepetTutari)} />
                <div className="flex items-center justify-between text-sm py-1"><span className="text-slate-400">Kargo Ücreti</span>
                  <input type="number" value={kargoUcreti} onChange={(e) => setKargoUcreti(Number(e.target.value))} onBlur={() => persist()} className="w-24 text-right text-sm border border-slate-200 rounded px-1.5 py-0.5" />
                </div>
                <div className="flex items-center justify-between text-sm py-1"><span className="text-slate-400">İndirim</span><span className="text-green-600">-{fmt(indirim)}</span></div>
                {kampanyalar.length > 0 && (
                  <div className="flex flex-wrap gap-1 py-1">
                    {kampanyalar.map((k: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium" title={k.ad}><Tag size={10} /> {k.ad} ({k.ozet}) -{fmt(k.indirim)}</span>
                    ))}
                  </div>
                )}
                <div className="border-t border-slate-100 my-1.5" />
                <SumRow label="Toplam Tutar" value={fmt(toplamTutar)} bold />
                <SumRow label="Tahsil Edilen" value={fmt(tahsilat)} cls="text-green-600" />
                <div className="flex items-center justify-between text-sm py-1.5 mt-1 px-2 rounded-lg bg-slate-50"><span className="text-slate-500 font-medium">Kalan Bakiye</span><span className={`font-bold ${kalan > 0 ? 'text-red-500' : 'text-green-600'}`}>{fmt(kalan)}</span></div>
              </Card>

              {/* Ödeme Ekle */}
              <Card title="ÖDEME EKLE">
                <label className="block text-[11px] text-slate-400 mb-1">Ödeme Şekli</label>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {[{ k: 'Banka', i: Building2 }, { k: 'K.Kartı', i: CreditCard }, { k: 'Bakiye', i: Banknote }].map(({ k, i: Ic }) => (
                    <button key={k} onClick={() => setOdemeSekli(k)} className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs ${odemeSekli === k ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><Ic size={18} />{k}</button>
                  ))}
                </div>
                <label className="block text-[11px] text-slate-400 mb-1">Tutar</label>
                <div className="flex gap-2">
                  <input type="number" value={odemeEkle} onChange={(e) => setOdemeEkle(e.target.value)} placeholder="0,00" className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                  <button onClick={addOdeme} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 inline-flex items-center gap-1"><Plus size={14} /> Ekle</button>
                </div>
                {kalan > 0 && <button onClick={() => setOdemeEkle(String(kalan))} className="mt-2 text-xs text-indigo-600">Kalanı doldur ({fmt(kalan)})</button>}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <label className="block text-[11px] text-slate-400 mb-1">Kredi Kartı Ödeme Linki (müşteriye "Sepeti Öde" butonu)</label>
                  <div className="flex gap-2">
                    <input value={odemeLinki} onChange={(e) => setOdemeLinki(e.target.value)} placeholder="https://... ödeme linkini yapıştırın" className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                    <button onClick={() => persist({ odemeLinki: odemeLinki || null, odemeLinkiSon: odemeLinki ? new Date(Date.now() + 60 * 60000).toISOString() : null, _log: odemeLinki ? 'Ödeme linki eklendi (60 dk geçerli)' : 'Ödeme linki kaldırıldı' })} className="px-3 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900">Kaydet</button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Kaydedince müşterinin sepet sayfasında 60 dk geri sayımlı "Sepeti Öde" butonu açılır.</p>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-6" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
          <img src={lightbox} className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button onClick={(e) => { e.stopPropagation(); setLightbox(null); }} className="absolute top-5 right-5 text-white/80 hover:text-white"><X size={28} /></button>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: any) {
  return <div className="bg-white rounded-xl border border-slate-200 p-4"><h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">{title}</h4>{children}</div>;
}
function SumRow({ label, value, bold, cls }: any) {
  return <div className="flex items-center justify-between text-sm py-1"><span className="text-slate-400">{label}</span><span className={`${bold ? 'font-bold text-slate-800' : 'font-medium text-slate-700'} ${cls || ''}`}>{value}</span></div>;
}
function QuickBtn({ onClick, icon: Ic, label, cls }: any) {
  return <button onClick={onClick} className={`inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs border rounded-lg ${cls || 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}><Ic size={14} /> {label}</button>;
}
