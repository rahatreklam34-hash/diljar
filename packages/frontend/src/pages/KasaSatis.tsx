import { useState, useEffect, useMemo, useRef } from 'react';
import { ScanLine, Search, Plus, Minus, Trash2, X, ShoppingBag, Banknote, CreditCard, Building2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => (s || '').toLowerCase().trim();

export default function KasaSatis() {
  const { products, reload } = useStore();
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<Record<string, any>>({});
  const [varModal, setVarModal] = useState<any>(null);
  const [odeme, setOdeme] = useState('Nakit');
  const [busy, setBusy] = useState(false);
  const [son, setSon] = useState<any>(null);

  const findByCode = (code: string) => { const c = norm(code); return products.find((p) => norm(p.salesCode || '') === c || (p.barkod || '') === code.trim() || norm(p.sku || '') === c); };

  // Global barkod: alan tıklamadan, Enter beklemeden ürün ekle
  useEffect(() => {
    let buf = ''; let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const t = Date.now(); if (t - last > 120) buf = ''; last = t;
      if (e.key === 'Enter') { if (buf.length >= 4) { const p = findByCode(buf); if (p) ekle(p); else toast.error('Ürün bulunamadı: ' + buf); } buf = ''; return; }
      if (e.key.length === 1 && /[A-Za-z0-9._\-]/.test(e.key)) buf += e.key;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [products]);

  const ekle = (p: any, varyasyon?: string) => {
    if ((p.variations || []).length > 0 && !varyasyon) { setVarModal(p); return; }
    const key = p.id + '|' + (varyasyon || '');
    let fiyat = p.satisFiyat; if (varyasyon) { const v = (p.variations || []).find((x: any) => x.deger === varyasyon); if (v) fiyat += v.ekFiyat || 0; }
    setCart((c) => ({ ...c, [key]: { productId: p.id, varyasyon: varyasyon || null, ad: p.ad, fiyat, img: (p.images || [])[0] || '', adet: (c[key]?.adet || 0) + 1 } }));
    toast.success(p.ad + ' eklendi');
  };
  const sub = (key: string) => setCart((c) => { const n = (c[key]?.adet || 0) - 1; const copy = { ...c }; if (n <= 0) delete copy[key]; else copy[key] = { ...copy[key], adet: n }; return copy; });
  const inc = (key: string) => setCart((c) => ({ ...c, [key]: { ...c[key], adet: c[key].adet + 1 } }));
  const del = (key: string) => setCart((c) => { const copy = { ...c }; delete copy[key]; return copy; });

  const items = Object.entries(cart);
  const toplam = items.reduce((s, [, x]: any) => s + x.fiyat * x.adet, 0);

  const search = useMemo(() => { if (q.trim().length < 2) return []; const s = norm(q); return products.filter((p) => norm(p.ad).includes(s) || norm(p.salesCode || '').includes(s) || (p.barkod || '').includes(q.trim())).slice(0, 8); }, [q, products]);

  const tamamla = async () => {
    if (items.length === 0) return; setBusy(true);
    try {
      const body = { items: items.map(([, x]: any) => ({ productId: x.productId, adet: x.adet, varyasyon: x.varyasyon || undefined })), odemeYontemi: odeme };
      const r = await api.post('/store/kasa-order', body);
      setSon(r.data.order); setCart({}); reload();
      toast.success('Satış tamamlandı, gelire işlendi');
    } catch (e) { toast.error(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><ScanLine className="text-emerald-600" size={22} /></div>
        <div><h1 className="text-2xl font-bold text-slate-800">Kasa Satışı</h1><p className="text-sm text-slate-400">Barkod okutarak hızlı mağaza satışı. (Barkodu okutmanız yeterli — tıklamaya/Enter'a gerek yok.)</p></div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
        {/* Ürün arama/ekleme */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="relative mb-3"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const p = findByCode(q) || search[0]; if (p) { ekle(p); setQ(''); } } }} placeholder="Barkod okut veya ürün adı/kodu yaz..." className="w-full pl-9 pr-3 py-2.5 text-base border border-slate-200 rounded-xl" /></div>
          {search.length > 0 && (
            <div className="border border-slate-100 rounded-xl divide-y divide-slate-50 mb-3">
              {search.map((p) => (
                <button key={p.id} onClick={() => { ekle(p); setQ(''); }} className="w-full flex items-center gap-2.5 p-2.5 hover:bg-slate-50 text-left">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">{(p.images || [])[0] && <img src={p.images[0]} className="w-full h-full object-cover" />}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{p.ad}</p><p className="text-[11px] text-slate-400">{p.salesCode ? 'Kod: ' + p.salesCode + ' · ' : ''}{fmt(p.satisFiyat)} · {(p.stokAdeti || 0)} adet</p></div>
                  <Plus size={16} className="text-emerald-600" />
                </button>
              ))}
            </div>
          )}
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-700 flex items-center gap-2"><ScanLine size={18} /> El terminaliyle barkodu okutun; ürün otomatik sepete eklenir.</div>
        </div>

        {/* Sepet / ödeme */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><ShoppingBag size={18} /> Sepet ({items.reduce((s, [, x]: any) => s + x.adet, 0)})</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto mb-3">
            {items.length === 0 && <p className="text-slate-400 text-sm text-center py-6">Sepet boş. Barkod okutun.</p>}
            {items.map(([key, x]: any) => (
              <div key={key} className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">{x.img && <img src={x.img} className="w-full h-full object-cover" />}</div>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{x.ad}</p>{x.varyasyon && <p className="text-[11px] text-slate-400">{x.varyasyon}</p>}<p className="text-xs text-slate-500">{fmt(x.fiyat)} × {x.adet}</p></div>
                <button onClick={() => sub(key)} className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center"><Minus size={12} /></button>
                <span className="w-5 text-center text-sm">{x.adet}</span>
                <button onClick={() => inc(key)} className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center"><Plus size={12} /></button>
                <button onClick={() => del(key)} className="text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <label className="block text-[11px] text-slate-400 mb-1">Ödeme Şekli</label>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[{ k: 'Nakit', i: Banknote }, { k: 'K.Kartı', i: CreditCard }, { k: 'Havale', i: Building2 }].map(({ k, i: Ic }) => (
                <button key={k} onClick={() => setOdeme(k)} className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs ${odeme === k ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium' : 'border-slate-200 text-slate-500'}`}><Ic size={16} />{k}</button>
              ))}
            </div>
            <div className="flex items-center justify-between mb-3"><span className="text-slate-500">Toplam</span><span className="text-2xl font-extrabold text-slate-900">{fmt(toplam)}</span></div>
            <button onClick={tamamla} disabled={busy || items.length === 0} className="w-full bg-green-600 text-white py-3 rounded-2xl font-bold hover:bg-green-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"><Check size={18} /> {busy ? 'Kaydediliyor...' : 'Satışı Tamamla'}</button>
            {son && <p className="text-xs text-green-600 text-center mt-2">Son satış: {son.orderYil}-{String(son.orderNo).padStart(3, '0')} · {fmt(son.toplam)} ✓</p>}
          </div>
        </div>
      </div>

      {/* Varyasyon modal */}
      {varModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setVarModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-white rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800">{varModal.ad} — Beden seç</h3><button onClick={() => setVarModal(null)}><X size={20} className="text-slate-400" /></button></div>
            <div className="flex flex-wrap gap-2">{(varModal.variations || []).map((v: any) => <button key={v.deger} disabled={v.stok <= 0} onClick={() => { ekle(varModal, v.deger); setVarModal(null); }} className={`px-3.5 py-2 rounded-xl border text-sm ${v.stok <= 0 ? 'border-slate-200 text-slate-300 line-through' : 'border-slate-200 text-slate-700 hover:bg-emerald-50'}`}>{v.deger} <span className="text-[10px] text-slate-400">({v.stok})</span></button>)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
