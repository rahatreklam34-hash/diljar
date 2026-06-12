// Bekleyen Siparişler — DROPSHOPING
// Tedarikçiye ait (drop) ürünlerden yapılan satışlar. Açık / Kapalı sekmeli.
// Ürün teslim alındıysa admin siparişi "Kapat" ile kapatır.
import { useState, useEffect, useMemo } from 'react';
import { ClipboardList, Package, CheckCircle2, RotateCcw, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BekleyenSiparisler() {
  const [tab, setTab] = useState<'acik' | 'kapali'>('acik');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (closed: boolean) => {
    setLoading(true);
    try {
      const r = await api.get('/store/free/pending-orders', { params: { closed: closed ? '1' : '0' } });
      setOrders(r.data || []);
    } catch (e) { toast.error(apiErrorMessage(e)); }
    setLoading(false);
  };

  useEffect(() => { load(tab === 'kapali'); }, [tab]);

  const close = async (o: any) => {
    setBusyId(o.id);
    try { await api.post(`/store/free/pending-orders/${o.id}/close`); toast.success('Sipariş kapatıldı'); setOrders((p) => p.filter((x) => x.id !== o.id)); }
    catch (e) { toast.error(apiErrorMessage(e)); }
    setBusyId(null);
  };

  const reopen = async (o: any) => {
    setBusyId(o.id);
    try { await api.post(`/store/free/pending-orders/${o.id}/reopen`); toast.success('Sipariş yeniden açıldı'); setOrders((p) => p.filter((x) => x.id !== o.id)); }
    catch (e) { toast.error(apiErrorMessage(e)); }
    setBusyId(null);
  };

  const toplamCiro = useMemo(() => orders.reduce((s, o) => s + (o.tutar || 0), 0), [orders]);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center"><ClipboardList size={18} className="text-emerald-600" /></div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Bekleyen Siparişler</h1>
            <p className="text-[11px] text-slate-400">Tedarikçi (drop) ürün siparişleri — teslim alınca kapatın</p>
          </div>
        </div>
        <button onClick={() => load(tab === 'kapali')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><RefreshCw size={15} /> Yenile</button>
      </div>

      {/* Sekmeler */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 mb-4">
        <button onClick={() => setTab('acik')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'acik' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>Açık Siparişler</button>
        <button onClick={() => setTab('kapali')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'kapali' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-700'}`}>Kapalı Siparişler</button>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <p className="text-[11px] text-slate-400">Sipariş Adedi</p>
          <p className="text-lg font-bold text-slate-800">{orders.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <p className="text-[11px] text-slate-400">Toplam Tutar</p>
          <p className="text-lg font-bold text-emerald-600">{fmt(toplamCiro)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><span className="w-7 h-7 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" /></div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-16 text-slate-400">
          <ClipboardList size={32} className="mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">{tab === 'acik' ? 'Açık sipariş yok' : 'Kapalı sipariş yok'}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {orders.map((o) => (
            <div key={o.id} className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
              {o.gorsel ? <img src={o.gorsel} className="w-14 h-14 rounded-xl object-cover shrink-0" /> : <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Package size={18} className="text-slate-300" /></div>}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate flex items-center gap-1.5">{o.urun}<span className="bg-green-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">drop</span></p>
                <p className="text-xs text-slate-400 mt-0.5">{o.user || '-'}{o.beden ? ` · Beden: ${o.beden}` : ''}{o.supplierAd ? ` · ${o.supplierAd}` : ''}</p>
                <p className="text-xs mt-0.5"><span className="text-emerald-600 font-bold">{fmt(o.tutar)}</span><span className="text-slate-400"> · {new Date(o.createdAt).toLocaleDateString('tr-TR')}</span></p>
              </div>
              {tab === 'acik' ? (
                <button onClick={() => close(o)} disabled={busyId === o.id} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-sm px-3 py-2 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 shrink-0"><CheckCircle2 size={16} /> Kapat</button>
              ) : (
                <button onClick={() => reopen(o)} disabled={busyId === o.id} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 text-sm px-3 py-2 rounded-xl font-medium hover:bg-slate-200 disabled:opacity-50 shrink-0"><RotateCcw size={16} /> Yeniden Aç</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
