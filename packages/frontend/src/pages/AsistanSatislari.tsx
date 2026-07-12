import { useState, useMemo } from 'react';
import { Bot, Wallet, TrendingUp, Receipt, XCircle, Search, Link2, Trash2, Eye, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { useUrlState } from '../lib/useUrlState';
import { buildSepetCopyText } from './Siparislerim';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const orderLabel = (o: any) => o?.orderNo ? `${o.orderYil || new Date(o.createdAt).getFullYear()}-${String(o.orderNo).padStart(3, '0')}` : '#SIP' + o.id.slice(-5).toUpperCase();
const STMAP: Record<string, { t: string; c: string }> = {
  sepet: { t: 'Açık Sepet', c: 'bg-rose-100 text-rose-600' }, yeni: { t: 'Ödeme Bekliyor', c: 'bg-amber-100 text-amber-700' },
  hazirlaniyor: { t: 'Hazırlanıyor', c: 'bg-blue-100 text-blue-700' }, kargoda: { t: 'Kargoda', c: 'bg-sky-100 text-sky-700' },
  teslim: { t: 'Tamamlandı', c: 'bg-green-100 text-green-700' }, tamamlandi: { t: 'Tamamlandı', c: 'bg-green-100 text-green-700' },
  iptal: { t: 'İptal', c: 'bg-red-100 text-red-700' },
};

export default function AsistanSatislari() {
  const { orders, customers, products, reload, storeSetting } = useStore();
  const [search, setSearch] = useUrlState('q', '');
  const [tab, setTab] = useUrlState('tab', 'hepsi');
  const prodCost = useMemo(() => new Map(products.map((p) => [p.id, p.alisFiyat || 0])), [products]);
  const cust = (id?: string) => customers.find((c) => c.id === id);
  const custName = (o: any) => cust(o.customerId)?.ad || o.musteriHandle || 'Misafir';
  const custInsta = (o: any) => { const ig = cust(o.customerId)?.instagram; return ig ? String(ig).replace(/^@/, '') : ''; };

  const botOrders = useMemo(() => orders.filter((o) => o.botSatis), [orders]);

  const costOf = (o: any) => (o.items || []).reduce((s: number, it: any) => s + (prodCost.get(it.productId) || 0) * (it.adet || 1), 0);

  const kpi = useMemo(() => {
    const valid = botOrders.filter((o) => o.durum !== 'iptal' && o.durum !== 'sepet');
    const ciro = valid.reduce((s, o) => s + (o.toplam || 0), 0);
    const kar = valid.reduce((s, o) => s + ((o.toplam || 0) - costOf(o)), 0);
    const iptal = botOrders.filter((o) => o.durum === 'iptal').length;
    const tahsil = valid.reduce((s, o) => s + (o.tahsilat || 0), 0);
    return { ciro, kar, adet: valid.length, iptal, tahsil, karOran: ciro ? (kar / ciro) * 100 : 0 };
  }, [botOrders, prodCost]);

  const filtered = useMemo(() => {
    let list = botOrders;
    if (tab === 'aktif') list = list.filter((o) => o.durum !== 'iptal');
    if (tab === 'iptal') list = list.filter((o) => o.durum === 'iptal');
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter((o) => orderLabel(o).toLowerCase().includes(q) || custName(o).toLowerCase().includes(q) || custInsta(o).toLowerCase().includes(q)); }
    return list;
  }, [botOrders, tab, search, customers]);

  const copyLink = (o: any) => { if (!o.token) { toast.error('Link yok'); return; } navigator.clipboard.writeText(buildSepetCopyText(`${window.location.origin}/sepet/${o.token}`, storeSetting)); toast.success('Sipariş linki + ödeme bilgileri kopyalandı'); };
  const iptal = async (o: any) => { if (!confirm('Asistan satışı iptal edilsin mi? Ürünler stoğa iade edilir.')) return; try { await api.post(`/store/orders/${o.id}/cancel`); toast.success('İptal edildi'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Bot className="text-emerald-600" size={22} /></div>
        <div><h1 className="text-2xl font-bold text-slate-800">Asistan Satışları</h1><p className="text-sm text-slate-400">Yapay zeka asistanının gerçekleştirdiği satışlar ve karlılık raporu.</p></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={Wallet} cls="bg-emerald-100 text-emerald-600" label="Toplam Ciro" value={fmt0(kpi.ciro)} />
        <Kpi icon={TrendingUp} cls="bg-green-100 text-green-600" label="Toplam Kâr" value={fmt0(kpi.kar)} valueCls="text-green-600" />
        <Kpi icon={TrendingUp} cls="bg-emerald-100 text-emerald-600" label="Karlılık" value={`%${kpi.karOran.toFixed(1)}`} valueCls="text-emerald-600" />
        <Kpi icon={Receipt} cls="bg-sky-100 text-sky-600" label="Satış Adedi" value={String(kpi.adet)} />
        <Kpi icon={Wallet} cls="bg-amber-100 text-amber-600" label="Tahsil Edilen" value={fmt0(kpi.tahsil)} />
        <Kpi icon={XCircle} cls="bg-red-100 text-red-600" label="İptal" value={String(kpi.iptal)} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 border-b border-slate-200">
          {[['hepsi', 'Tümü'], ['aktif', 'Aktif Satışlar'], ['iptal', 'İptal Edilenler']].map(([k, t]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-2.5 text-sm font-medium border-b-2 ${tab === k ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t}</button>
          ))}
        </div>
        <div className="relative ml-auto min-w-[220px]"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sipariş / müşteri ara..." className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="text-slate-400 text-left text-xs uppercase border-b border-slate-100">
            <tr><th className="px-4 py-3">Sipariş</th><th className="px-4 py-3">Müşteri</th><th className="px-4 py-3">Ürün</th><th className="px-4 py-3">Tutar</th><th className="px-4 py-3">Maliyet</th><th className="px-4 py-3">Kâr</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">Tarih</th><th className="px-4 py-3 text-right">İşlem</th></tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const adet = (o.items || []).reduce((s: number, it: any) => s + (it.adet || 1), 0);
              const maliyet = costOf(o); const kar = (o.toplam || 0) - maliyet; const st = STMAP[o.durum] || { t: o.durum, c: 'bg-slate-100 text-slate-500' };
              return (
                <tr key={o.id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${o.durum === 'iptal' ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{orderLabel(o)}</td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-800">{custName(o)}</p>{custInsta(o) && <p className="text-xs text-pink-600">@{custInsta(o)}</p>}</td>
                  <td className="px-4 py-3 text-slate-500">{adet} ürün</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{fmt(o.toplam)}</td>
                  <td className="px-4 py-3 text-slate-500">{fmt(maliyet)}</td>
                  <td className={`px-4 py-3 font-semibold ${kar >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(kar)}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.c}`}>{st.t}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(o.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                    <IBtn onClick={() => copyLink(o)} icon={Link2} title="Sipariş Linki" />
                    {cust(o.customerId)?.telefon && <IBtn onClick={() => window.open('https://wa.me/' + String(cust(o.customerId)?.telefon).replace(/\D/g, '').replace(/^0/, '90'), '_blank')} icon={MessageCircle} title="Mesaj" />}
                    {cust(o.customerId) && <IBtn onClick={() => window.location.assign(`/musterilerim/${o.customerId}`)} icon={Eye} title="Müşteri" />}
                    {o.durum !== 'iptal' && <IBtn onClick={() => iptal(o)} icon={Trash2} title="İptal Et" cls="text-red-400 border-red-100 hover:bg-red-50" />}
                  </div></td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-16 text-center text-slate-400">Asistan satışı bulunamadı. Asistan, sohbet üzerinden satış yaptıkça burada listelenir.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ icon: Ic, cls, label, value, valueCls }: any) {
  return <div className="bg-white rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2 mb-2"><div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}><Ic size={18} /></div><p className="text-xs text-slate-400">{label}</p></div><p className={`text-xl font-bold ${valueCls || 'text-slate-800'}`}>{value}</p></div>;
}
function IBtn({ onClick, icon: Ic, title, cls }: any) { return <button onClick={onClick} title={title} className={`w-8 h-8 rounded-lg border flex items-center justify-center ${cls || 'border-slate-200 text-slate-400 hover:bg-slate-100'}`}><Ic size={14} /></button>; }
