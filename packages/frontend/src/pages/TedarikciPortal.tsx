// Tedarikçi Portalı — /tedarikci (public, auth gerektirmez)
// Toptancı: kod+PIN ile giriş → ürün yükle → ürünlerini gör → satışlarını gör (satış fiyatı GİZLİ)
import { useState, useEffect } from 'react';
import { Package, Plus, X, LogOut, Eye, EyeOff, Upload, BarChart3 } from 'lucide-react';
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

export default function TedarikciPortal() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('supplier_token'));
  const [supplier, setSupplier] = useState<any>(null);
  const [tab, setTab] = useState<'urunler' | 'yukle' | 'satislar'>('urunler');

  // Giriş formu
  const [loginCode, setLoginCode] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);

  // Ürünler
  const [products, setProducts] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);

  // Yükleme formu
  const [form, setForm] = useState({ ad: '', bedenler: '', alisFiyat: '', images: [] as string[] });
  const [formVars, setFormVars] = useState<{ deger: string; stok: number }[]>([]);
  const [formBusy, setFormBusy] = useState(false);

  const parseBedenler = (s: string) => s.split(',').map((b) => b.trim()).filter(Boolean).map((b) => ({ deger: b, stok: 1 }));
  const onBedenlerChange = (val: string) => { setForm((f) => ({ ...f, bedenler: val })); setFormVars(parseBedenler(val)); };

  const loadProducts = async () => { try { const r = await sApi.get('/public/supplier/products'); setProducts(r.data || []); } catch { /* */ } };
  const loadSales = async () => { try { const r = await sApi.get('/public/supplier/sales'); setSales(r.data || []); } catch { /* */ } };

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
      await sApi.post('/public/supplier/products', { ad: form.ad, images: form.images, variations: formVars, alisFiyat: Number(form.alisFiyat) || 0 });
      toast.success('Ürün yüklendi');
      setForm({ ad: '', bedenler: '', alisFiyat: '', images: [] });
      setFormVars([]);
      await loadProducts();
      setTab('urunler');
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Hata'); }
    setFormBusy(false);
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
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 mb-4">
          <button onClick={() => setTab('urunler')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'urunler' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>Ürünlerim ({products.length})</button>
          <button onClick={() => setTab('yukle')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'yukle' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>Ürün Yükle</button>
          <button onClick={() => { setTab('satislar'); loadSales(); }} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'satislar' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>Satışlarım</button>
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
                    <p className="font-semibold text-slate-800">{p.ad}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Kod: {p.salesCode || '-'} · Alış: {fmt(p.alisFiyat)} · Toplam Stok: {topStok}</p>
                    {vars.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {vars.map((v: any, i: number) => <span key={i} className={`text-xs px-2 py-0.5 rounded-lg border ${v.stok > 0 ? 'bg-white border-slate-200 text-slate-600' : 'bg-red-50 border-red-200 text-red-400 line-through'}`}>{v.deger}: {v.stok}</span>)}
                      </div>
                    )}
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
                  <p className="text-sm text-indigo-600 font-bold mt-0.5">{e.toplam} adet satıldı</p>
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

        <div className="h-8" />
      </div>
    </div>
  );
}
