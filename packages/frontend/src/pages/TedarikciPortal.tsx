// Tedarikçi Portalı — /tedarikci (public, auth gerektirmez)
// Toptancı: kod+PIN ile giriş → ürün yükle → ürünlerini gör → satışlarını gör (satış fiyatı GİZLİ)
import { useState, useEffect } from 'react';
import { Package, X, LogOut, Eye, EyeOff, Upload, BarChart3, Pencil, Trash2, ScanLine, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import ImageDropzone from '../components/ImageDropzone';

const BASE = (import.meta as any).env?.VITE_API_URL || '/api/v1';

// Tedarikçiye özel axios örneği (supplier JWT)
const sApi = axios.create({ baseURL: BASE });
sApi.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('supplier_token');
  if (token) { cfg.headers = cfg.headers || {} as any; (cfg.headers as any)['Authorization'] = `Bearer ${token}`; }
  return cfg;
});

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Basit barkod yazdırma (satış fiyatı tedarikçide gösterilmez)
function printBarkod(arr: any[]) {
  if (!arr.length) { toast.error('Ürün yok'); return; }
  const bars = (val: string) => Array.from(val || '0000').map((ch) => { const w = (ch.charCodeAt(0) % 3) + 1; return `<span style="display:inline-block;width:${w}px;height:38px;background:#111;margin-right:1px"></span>`; }).join('');
  const labels = arr.map((p) => `<div style="border:1px solid #ddd;border-radius:6px;padding:8px;text-align:center;width:200px;display:inline-block;margin:4px;vertical-align:top">
    <div style="font-size:12px;font-weight:600;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(p.ad || '').replace(/</g, '')}</div>
    <div style="font-size:10px;color:#888;margin-bottom:4px">${p.salesCode || ''}</div>
    <div style="line-height:0">${bars(p.salesCode || p.id || '')}</div>
    <div style="font-family:monospace;font-size:11px;letter-spacing:2px;margin-top:2px">${p.salesCode || '-'}</div>
  </div>`).join('');
  const w = window.open('', '_blank'); if (!w) { toast.error('Açılır pencere engellendi'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barkod</title></head><body style="font-family:Arial">${labels}<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close();
}

export default function TedarikciPortal() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('supplier_token'));
  const [supplier, setSupplier] = useState<any>(null);
  const [tab, setTab] = useState<'urunler' | 'yukle' | 'satislar' | 'encok' | 'hesap'>('urunler');

  // Giriş formu
  const [loginCode, setLoginCode] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);

  // Ürünler
  const [products, setProducts] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [account, setAccount] = useState<any | null>(null);

  // Yükleme formu
  const [form, setForm] = useState({ ad: '', bedenler: '', alisFiyat: '', cinsiyet: '', aciklama: '', images: [] as string[] });
  const [formVars, setFormVars] = useState<{ deger: string; stok: number }[]>([]);
  const [formBusy, setFormBusy] = useState(false);

  // Düzenleme
  const [editProd, setEditProd] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ ad: '', bedenler: '', alisFiyat: '', cinsiyet: '', aciklama: '', images: [] as string[] });
  const [editVars, setEditVars] = useState<{ deger: string; stok: number }[]>([]);
  const [editBusy, setEditBusy] = useState(false);

  const parseBedenler = (s: string) => s.split(',').map((b) => b.trim()).filter(Boolean).map((b) => ({ deger: b, stok: 1 }));
  const onBedenlerChange = (val: string) => { setForm((f) => ({ ...f, bedenler: val })); setFormVars(parseBedenler(val)); };
  const onEditBedenlerChange = (val: string) => {
    setEditForm((f) => ({ ...f, bedenler: val }));
    const arr = val.split(',').map((b) => b.trim()).filter(Boolean);
    setEditVars((prev) => arr.map((deger) => { const ex = prev.find((v) => v.deger === deger); return ex ? ex : { deger, stok: 1 }; }));
  };

  const loadProducts = async () => { try { const r = await sApi.get('/public/supplier/products'); setProducts(r.data || []); } catch { /* */ } };
  const loadSales = async () => { try { const r = await sApi.get('/public/supplier/sales'); setSales(r.data || []); } catch { /* */ } };
  const loadAccount = async () => { try { const r = await sApi.get('/public/supplier/account'); setAccount(r.data || null); } catch { /* */ } };

  useEffect(() => {
    if (!token) return;
    sApi.get('/public/supplier/me').then((r) => setSupplier(r.data)).catch(() => { localStorage.removeItem('supplier_token'); setToken(null); });
    loadProducts();
    loadSales();
  }, [token]);

  const login = async () => {
    if (!loginCode.trim() || !pin.trim()) { toast.error('Giriş kodu ve PIN zorunludur'); return; }
    setLoginBusy(true);
    try {
      const r = await axios.post(`${BASE}/public/supplier/login`, { loginCode: loginCode.trim(), pin: pin.trim() });
      localStorage.setItem('supplier_token', r.data.token);
      setToken(r.data.token);
      setSupplier(r.data.supplier);
      toast.success(`Hoş geldiniz, ${r.data.supplier.ad}`);
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Giriş başarısız'); }
    setLoginBusy(false);
  };

  const logout = () => { localStorage.removeItem('supplier_token'); setToken(null); setSupplier(null); setProducts([]); setSales([]); };

  const saveProduct = async () => {
    if (!form.ad.trim()) { toast.error('Ürün adı zorunludur'); return; }
    setFormBusy(true);
    try {
      await sApi.post('/public/supplier/products', { ad: form.ad, images: form.images, variations: formVars, alisFiyat: Number(form.alisFiyat) || 0, cinsiyet: form.cinsiyet || null, aciklama: form.aciklama || null });
      toast.success('Ürün yüklendi — taslak korundu, yeni görsel + ad + stok girin');
      // Taslak mantığı: cinsiyet, açıklama, bedenler ve alış fiyatı korunur; sadece ad + görsel sıfırlanır
      setForm((f) => ({ ...f, ad: '', images: [] }));
      await loadProducts();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Hata'); }
    setFormBusy(false);
  };

  const openEdit = (p: any) => {
    const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
    setEditProd(p);
    setEditForm({ ad: p.ad || '', bedenler: vars.map((v) => v.deger).join(','), alisFiyat: String(p.alisFiyat || ''), cinsiyet: p.cinsiyet || '', aciklama: p.aciklama || '', images: Array.isArray(p.images) ? p.images : [] });
    setEditVars(vars.map((v) => ({ deger: v.deger, stok: Number(v.stok) || 0 })));
  };

  const saveEdit = async () => {
    if (!editProd) return;
    setEditBusy(true);
    try {
      await sApi.patch(`/public/supplier/products/${editProd.id}`, { ad: editForm.ad, images: editForm.images, variations: editVars, alisFiyat: Number(editForm.alisFiyat) || 0, cinsiyet: editForm.cinsiyet || null, aciklama: editForm.aciklama || null });
      toast.success('Ürün güncellendi');
      setEditProd(null);
      await loadProducts();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Hata'); }
    setEditBusy(false);
  };

  const deleteProd = async (p: any) => {
    if (!confirm(`"${p.ad}" silinsin mi?`)) return;
    try { await sApi.delete(`/public/supplier/products/${p.id}`); toast.success('Ürün silindi'); await loadProducts(); } catch (e: any) { toast.error(e?.response?.data?.error || 'Hata'); }
  };

  // ── Giriş ekranı ──────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-3"><Package size={28} className="text-violet-600" /></div>
            <h1 className="text-xl font-bold text-slate-800">Tedarikçi Portalı</h1>
            <p className="text-sm text-slate-400 mt-1">Giriş kodunuz ve PIN'iniz ile giriş yapın</p>
          </div>
          <div className="space-y-3">
            <div><label className="block text-xs text-slate-500 mb-1">Giriş Kodu</label><input value={loginCode} onChange={(e) => setLoginCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} placeholder="Giriş kodunuz" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">PIN</label>
              <div className="relative"><input type={showPin ? 'text' : 'password'} value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} placeholder="PIN" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 pr-10" /><button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-3 top-2.5 text-slate-400">{showPin ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            </div>
            <button onClick={login} disabled={loginBusy} className="w-full bg-violet-600 text-white py-2.5 rounded-xl font-medium hover:bg-violet-700 disabled:opacity-50">{loginBusy ? 'Giriş yapılıyor...' : 'Giriş Yap'}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Portal ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center"><Package size={18} className="text-violet-600" /></div>
          <div><p className="font-bold text-slate-800 text-sm">Tedarikçi Portalı</p><p className="text-[11px] text-slate-400">{supplier?.ad}</p></div>
        </div>
        <button onClick={logout} className="inline-flex items-center gap-1.5 text-slate-500 hover:text-red-500 text-sm"><LogOut size={16} /> Çıkış</button>
      </div>

      {/* Sekmeler */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 mb-4 flex-wrap">
          <button onClick={() => setTab('urunler')} className={`flex-1 min-w-[80px] py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'urunler' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>Ürünlerim ({products.length})</button>
          <button onClick={() => setTab('yukle')} className={`flex-1 min-w-[80px] py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'yukle' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>Ürün Yükle</button>
          <button onClick={() => { setTab('satislar'); loadSales(); }} className={`flex-1 min-w-[80px] py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'satislar' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>Satışlarım</button>
          <button onClick={() => { setTab('encok'); loadSales(); }} className={`flex-1 min-w-[80px] py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'encok' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>En Çok Satılanlar</button>
          <button onClick={() => { setTab('hesap'); loadAccount(); }} className={`flex-1 min-w-[80px] py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'hesap' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>Cari</button>
        </div>

        {/* Ürünlerim */}
        {tab === 'urunler' && (
          <div className="space-y-3">
            {products.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-16 text-slate-400">
                <Package size={32} className="mb-3 text-slate-300" />
                <p className="font-medium text-slate-500">Henüz ürün yüklemediniz</p>
                <button onClick={() => setTab('yukle')} className="mt-3 text-sm text-violet-600 hover:underline">Ürün Yükle →</button>
              </div>
            ) : products.map((p) => {
              const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
              const topStok = vars.reduce((s: number, v: any) => s + (v.stok || 0), 0);
              const img = Array.isArray(p.images) ? p.images[0] : null;
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3">
                  {img ? <img src={img} className="w-16 h-16 rounded-xl object-cover shrink-0" /> : <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Package size={20} className="text-slate-300" /></div>}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">{p.ad}{p.cinsiyet ? <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full align-middle font-medium">{p.cinsiyet}</span> : null}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Kod: {p.salesCode || '-'} · Alış: {fmt(p.alisFiyat)} · Toplam Stok: {topStok}</p>
                    {p.aciklama ? <p className="text-[11px] text-slate-400 mt-0.5 italic line-clamp-2">{p.aciklama}</p> : null}
                    {vars.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {vars.map((v: any, i: number) => <span key={i} className={`text-xs px-2 py-0.5 rounded-lg border ${v.stok > 0 ? 'bg-white border-slate-200 text-slate-600' : 'bg-red-50 border-red-200 text-red-400 line-through'}`}>{v.deger}: {v.stok}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button onClick={() => openEdit(p)} title="Düzenle" className="p-1.5 rounded-lg bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-200"><Pencil size={15} /></button>
                    <button onClick={() => printBarkod([p])} title="Barkod Yazdır" className="p-1.5 rounded-lg bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 border border-slate-200"><ScanLine size={15} /></button>
                    <button onClick={() => deleteProd(p)} title="Sil" className="p-1.5 rounded-lg bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200"><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Ürün Yükle */}
        {tab === 'yukle' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><Upload size={18} className="text-violet-600" /> Yeni Ürün Yükle</h2>
            <p className="text-xs text-slate-400">Satış fiyatı firma tarafından belirlenir. Siz sadece alış fiyatınızı girin.</p>

            <div><label className="block text-xs text-slate-500 mb-1">Ürün Adı *</label><input value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} placeholder="Ürün adı" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" /></div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Cinsiyet</label>
              <select value={form.cinsiyet} onChange={(e) => setForm({ ...form, cinsiyet: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white">
                <option value="">Seçiniz</option>
                <option value="Kadın">Kadın</option>
                <option value="Erkek">Erkek</option>
                <option value="Unisex">Unisex</option>
                <option value="Çocuk">Çocuk</option>
              </select>
            </div>

            <div><label className="block text-xs text-slate-500 mb-1">Açıklama (kalıp / opsiyonel)</label><textarea value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} rows={2} placeholder="Kalıp bilgisi, beden notu vb. (opsiyonel)" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl resize-none" /></div>

            <div><label className="block text-xs text-slate-500 mb-1">Görsel</label><ImageDropzone images={form.images} onChange={(imgs) => setForm({ ...form, images: imgs })} max={3} /></div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Bedenler (virgülle ayır: S,M,L,XL)</label>
              <input value={form.bedenler} onChange={(e) => onBedenlerChange(e.target.value)} placeholder="S,M,L,XL" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
              {formVars.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] text-slate-400">Her beden için stok adedi:</p>
                  <div className="flex flex-wrap gap-2">
                    {formVars.map((v, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                        <span className="text-xs font-medium text-slate-700">{v.deger}</span>
                        <input type="number" min={0} value={v.stok} onChange={(e) => { const next = [...formVars]; next[i] = { ...next[i], stok: Math.max(0, Number(e.target.value) || 0) }; setFormVars(next); }} className="w-12 text-center text-xs border border-slate-200 rounded px-1 py-0.5" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div><label className="block text-xs text-slate-500 mb-1">Alış Fiyatı (₺)</label><input type="number" value={form.alisFiyat} onChange={(e) => setForm({ ...form, alisFiyat: e.target.value })} placeholder="0" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" /></div>

            <button onClick={saveProduct} disabled={formBusy} className="w-full bg-violet-600 text-white py-3 rounded-xl font-medium hover:bg-violet-700 disabled:opacity-50">{formBusy ? 'Yükleniyor...' : 'Ürünü Yükle'}</button>
          </div>
        )}

        {/* Satışlarım */}
        {tab === 'satislar' && (
          <div className="space-y-3">
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
              <p className="text-xs text-violet-700 font-medium flex items-center gap-1.5"><BarChart3 size={14} /> Satış fiyatları gizlidir. Sadece adet ve beden bilgisi gösterilmektedir.</p>
            </div>
            {sales.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-16 text-slate-400">
                <BarChart3 size={32} className="mb-3 text-slate-300" />
                <p className="font-medium text-slate-500">Henüz satış yok</p>
              </div>
            ) : sales.map((e: any, i: number) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3">
                {e.image ? <img src={e.image} className="w-14 h-14 rounded-xl object-cover shrink-0" /> : <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Package size={18} className="text-slate-300" /></div>}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">{e.ad}</p>
                  <p className="text-sm text-indigo-600 font-bold mt-0.5">{e.toplam} adet satıldı · <span className="text-emerald-600">Ciro {fmt(e.ciro)}</span></p>
                  {Object.keys(e.bedenler || {}).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {Object.entries(e.bedenler).map(([b, n]: any) => <span key={b} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{b}: {n}</span>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* En Çok Satılanlar */}
        {tab === 'encok' && (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5"><BarChart3 size={14} /> En çok satılan ürünleriniz adet sırasına göre listelenir.</p>
            </div>
            {sales.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-16 text-slate-400">
                <BarChart3 size={32} className="mb-3 text-slate-300" />
                <p className="font-medium text-slate-500">Henüz satış yok</p>
              </div>
            ) : [...sales].sort((a: any, b: any) => (b.toplam || 0) - (a.toplam || 0)).map((e: any, i: number) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-orange-300 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</div>
                {e.image ? <img src={e.image} className="w-12 h-12 rounded-xl object-cover shrink-0" /> : <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Package size={16} className="text-slate-300" /></div>}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{e.ad}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Ciro {fmt(e.ciro)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-indigo-600">{e.toplam}</p>
                  <p className="text-[10px] text-slate-400">adet</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'hesap' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-[11px] text-slate-400 mb-1">Toplam Borç</p>
                <p className="text-lg font-bold text-slate-800">{fmt(account?.borc || 0)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-[11px] text-slate-400 mb-1">Ödenen</p>
                <p className="text-lg font-bold text-emerald-600">{fmt(account?.odenen || 0)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-[11px] text-slate-400 mb-1">Kalan</p>
                <p className="text-lg font-bold text-red-600">{fmt(account?.kalan || 0)}</p>
              </div>
            </div>
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
              <p className="text-xs text-violet-700 font-medium flex items-center gap-1.5"><Wallet size={14} /> Borç, satılan ürünlerinizin alış fiyatı toplamıdır. Firma ödeme yaptıkça düşer.</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-800 mb-3 text-sm">Ödeme Geçmişi</p>
              {(!account?.payments || account.payments.length === 0) ? (
                <p className="text-sm text-slate-400 text-center py-6">Henüz ödeme kaydı yok</p>
              ) : (
                <div className="space-y-2">
                  {account.payments.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-emerald-600">{fmt(p.tutar)}</p>
                        {p.not && <p className="text-[11px] text-slate-400">{p.not}</p>}
                      </div>
                      <p className="text-[11px] text-slate-400">{new Date(p.createdAt).toLocaleDateString('tr-TR')}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>

      {/* Ürün Düzenleme Modal */}
      {editProd && (
        <div className="fixed inset-0 z-[120] overflow-y-auto p-4 flex items-start sm:items-center justify-center bg-black/50" onClick={() => setEditProd(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 my-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Pencil size={18} className="text-violet-600" /> Ürünü Düzenle</h3><button onClick={() => setEditProd(null)}><X size={20} className="text-slate-400" /></button></div>
            <div><label className="block text-xs text-slate-500 mb-1">Ürün Adı</label><input value={editForm.ad} onChange={(e) => setEditForm({ ...editForm, ad: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Cinsiyet</label>
              <select value={editForm.cinsiyet} onChange={(e) => setEditForm({ ...editForm, cinsiyet: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="">Seçiniz</option>
                <option value="Kadın">Kadın</option>
                <option value="Erkek">Erkek</option>
                <option value="Unisex">Unisex</option>
                <option value="Çocuk">Çocuk</option>
              </select>
            </div>
            <div><label className="block text-xs text-slate-500 mb-1">Açıklama (opsiyonel)</label><textarea value={editForm.aciklama} onChange={(e) => setEditForm({ ...editForm, aciklama: e.target.value })} rows={2} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">Görsel</label><ImageDropzone images={editForm.images} onChange={(imgs) => setEditForm({ ...editForm, images: imgs })} max={3} /></div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Bedenler (virgülle ayır)</label>
              <input value={editForm.bedenler} onChange={(e) => onEditBedenlerChange(e.target.value)} placeholder="S,M,L,XL" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              {editVars.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] text-slate-400">Her beden için stok adedi:</p>
                  <div className="flex flex-wrap gap-2">
                    {editVars.map((v, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                        <span className="text-xs font-medium text-slate-700">{v.deger}</span>
                        <input type="number" min={0} value={v.stok} onChange={(e) => { const next = [...editVars]; next[i] = { ...next[i], stok: Math.max(0, Number(e.target.value) || 0) }; setEditVars(next); }} className="w-12 text-center text-xs border border-slate-200 rounded px-1 py-0.5" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div><label className="block text-xs text-slate-500 mb-1">Alış Fiyatı (₺)</label><input type="number" value={editForm.alisFiyat} onChange={(e) => setEditForm({ ...editForm, alisFiyat: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <button onClick={saveEdit} disabled={editBusy} className="w-full bg-violet-600 text-white py-2.5 rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50">{editBusy ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
