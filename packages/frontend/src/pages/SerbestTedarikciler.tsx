import { useState, useEffect } from 'react';
import { UserCog, Plus, X, Eye, EyeOff, Trash2, Package, Copy, RefreshCw, Pencil, ScanLine, Tag, Wallet, CheckSquare, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { printBarkodLabels } from '../lib/barkod';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Barkod yazdırma — gerçek taranabilir Code128 SVG (PDF/yazdırmada görünür)
function printBarkod(arr: any[]) {
  if (!arr.length) { toast.error('Ürün yok'); return; }
  if (!printBarkodLabels(arr, { showPrice: true })) toast.error('Açılır pencere engellendi');
}

export default function SerbestTedarikciler() {
  const [view, setView] = useState<'urunler' | 'tedarikciler'>('urunler');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ ad: '', pin: '' });
  const [addBusy, setAddBusy] = useState(false);
  const [newCred, setNewCred] = useState<{ loginCode: string; pin: string; ad: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailProds, setDetailProds] = useState<any[]>([]);
  const [detailSales, setDetailSales] = useState<any[]>([]);
  const [detailTab, setDetailTab] = useState<'urunler' | 'satislar' | 'hesap'>('urunler');
  const [account, setAccount] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ tutar: '', not: '' });
  const [payBusy, setPayBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);

  // Tüm serbest ürünler (depo görünümü)
  const [allProds, setAllProds] = useState<any[]>([]);
  const [prodLoading, setProdLoading] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'multiplier' | 'fixed'>('multiplier');
  const [bulkVal, setBulkVal] = useState('2.10');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Ürün düzenleme
  const [editProd, setEditProd] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ ad: '', bedenler: '', satisFiyat: '', alisFiyat: '' });
  const [editVars, setEditVars] = useState<{ deger: string; stok: number }[]>([]);
  const [editBusy, setEditBusy] = useState(false);

  const load = async () => { setLoading(true); try { const r = await api.get('/store/free/suppliers'); setList(r.data || []); } catch (e) { toast.error(apiErrorMessage(e)); } setLoading(false); };
  const loadAllProds = async () => { setProdLoading(true); try { const r = await api.get('/store/free/products'); setAllProds(r.data || []); } catch (e) { toast.error(apiErrorMessage(e)); } setProdLoading(false); };
  useEffect(() => { load(); loadAllProds(); }, []);

  const addSupplier = async () => {
    if (!addForm.ad.trim()) { toast.error('Ad zorunludur'); return; }
    setAddBusy(true);
    try {
      const r = await api.post('/store/free/suppliers', { ad: addForm.ad, pin: addForm.pin || undefined });
      setNewCred({ loginCode: r.data.loginCode, pin: r.data.pin, ad: r.data.ad });
      setAddForm({ ad: '', pin: '' });
      setAddOpen(false);
      await load();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    setAddBusy(false);
  };

  const toggleAktif = async (s: any) => {
    try { await api.patch(`/store/free/suppliers/${s.id}`, { aktif: !s.aktif }); await load(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const loadDetail = async (id: string) => {
    try {
      const [pr, sa, ac] = await Promise.all([
        api.get(`/store/free/suppliers/${id}/products`),
        api.get(`/store/free/suppliers/${id}/sales`),
        api.get(`/store/free/suppliers/${id}/account`),
      ]);
      setDetailProds(pr.data || []);
      setDetailSales(sa.data || []);
      setAccount(ac.data || null);
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const openDetail = async (id: string) => { setDetailId(id); setDetailTab('urunler'); await loadDetail(id); };

  const addPayment = async () => {
    if (!detailId) return;
    const tutar = Number(payForm.tutar) || 0;
    if (tutar <= 0) { toast.error('Geçerli bir tutar girin'); return; }
    setPayBusy(true);
    try {
      await api.post(`/store/free/suppliers/${detailId}/payments`, { tutar, not: payForm.not || undefined });
      toast.success('Ödeme kaydedildi');
      setPayForm({ tutar: '', not: '' });
      await loadDetail(detailId);
    } catch (e) { toast.error(apiErrorMessage(e)); }
    setPayBusy(false);
  };

  const deletePayment = async (pid: string) => {
    if (!detailId || !confirm('Ödeme kaydı silinsin mi?')) return;
    try { await api.delete(`/store/free/suppliers/${detailId}/payments/${pid}`); await loadDetail(detailId); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const openEdit = (p: any) => {
    const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
    setEditProd(p);
    setEditForm({ ad: p.ad || '', bedenler: vars.map((v) => v.deger).join(','), satisFiyat: String(p.satisFiyat || ''), alisFiyat: String(p.alisFiyat || '') });
    setEditVars(vars.map((v) => ({ deger: v.deger, stok: Number(v.stok) || 0 })));
  };

  const onEditBedenlerChange = (val: string) => {
    setEditForm((f) => ({ ...f, bedenler: val }));
    const arr = val.split(',').map((b) => b.trim()).filter(Boolean);
    setEditVars((prev) => arr.map((deger) => { const ex = prev.find((v) => v.deger === deger); return ex ? ex : { deger, stok: 1 }; }));
  };

  const refreshLists = async () => { await loadAllProds(); if (detailId) await loadDetail(detailId); };

  const saveEdit = async () => {
    if (!editProd) return;
    setEditBusy(true);
    try {
      await api.patch(`/store/free/products/${editProd.id}`, {
        ad: editForm.ad,
        variations: editVars,
        satisFiyat: Number(editForm.satisFiyat) || 0,
        alisFiyat: Number(editForm.alisFiyat) || 0,
      });
      toast.success('Ürün güncellendi');
      setEditProd(null);
      await refreshLists();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    setEditBusy(false);
  };

  const deleteProd = async (p: any) => {
    if (!confirm(`"${p.ad}" silinsin mi?`)) return;
    try { await api.delete(`/store/free/products/${p.id}`); toast.success('Ürün silindi'); await refreshLists(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  // Toplu fiyat
  const toggleSel = (id: string) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selAll = () => setSel((prev) => prev.size === allProds.length ? new Set() : new Set(allProds.map((p) => p.id)));
  const applyBulk = async () => {
    const ids = [...sel];
    const v = Number(bulkVal);
    if (bulkMode === 'multiplier' && !(v > 0)) { toast.error('Geçerli bir çarpan girin'); return; }
    if (bulkMode === 'fixed' && !(v >= 0)) { toast.error('Geçerli bir fiyat girin'); return; }
    setBulkBusy(true);
    try {
      const body: any = ids.length > 0 ? { ids } : {};
      if (bulkMode === 'multiplier') body.multiplier = v; else body.satisFiyat = v;
      const r = await api.post('/store/free/products/bulk-price', body);
      toast.success(`${r.data?.count || 0} ürün güncellendi`);
      setBulkOpen(false); setSel(new Set());
      await loadAllProds();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    setBulkBusy(false);
  };

  const copy = (text: string) => { navigator.clipboard?.writeText(text); toast.success('Kopyalandı'); };

  const detailSupplier = list.find((s) => s.id === detailId);

  // Satış özeti (ürün bazlı) — ciro alış fiyatına göre
  const salesSummary = detailSales.reduce((acc: Record<string, { ad: string; toplam: number; ciro: number; bedenler: Record<string, number> }>, o: any) => {
    const key = o.freeProductId || o.urun;
    if (!acc[key]) acc[key] = { ad: o.urun, toplam: 0, ciro: 0, bedenler: {} };
    acc[key].toplam++;
    acc[key].ciro += (o.alis || 0);
    if (o.beden) acc[key].bedenler[o.beden] = (acc[key].bedenler[o.beden] || 0) + 1;
    return acc;
  }, {});

  const allSelected = sel.size > 0 && sel.size === allProds.length;

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center"><UserCog size={20} className="text-violet-600" /></div>
          <div><h1 className="text-lg font-bold text-slate-800">Serbest Satış · Tedarikçiler</h1><p className="text-xs text-slate-400">Geçici depo ürünleri ve toptancı hesapları</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { load(); loadAllProds(); }} className="inline-flex items-center gap-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg text-sm"><RefreshCw size={14} /> Yenile</button>
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700"><Plus size={16} /> Tedarikçi Ekle</button>
        </div>
      </div>

      {/* Üst sekme */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        <button onClick={() => setView('urunler')} className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${view === 'urunler' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}><Package size={15} /> Ürünler ({allProds.length})</button>
        <button onClick={() => setView('tedarikciler')} className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${view === 'tedarikciler' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}><UserCog size={15} /> Tedarikçiler ({list.length})</button>
      </div>

      {/* ÜRÜNLER (depo görünümü) */}
      {view === 'urunler' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <button onClick={selAll} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-violet-600">{allSelected ? <CheckSquare size={16} /> : <Square size={16} />} Tümünü Seç</button>
              {sel.size > 0 && <span className="text-violet-600 font-medium">{sel.size} seçili</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => printBarkod(sel.size > 0 ? allProds.filter((p) => sel.has(p.id)) : allProds)} className="inline-flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded-lg"><ScanLine size={13} /> Barkod Yazdır</button>
              <button onClick={() => setBulkOpen(true)} className="inline-flex items-center gap-1.5 text-xs bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg"><Tag size={13} /> Toplu Fiyat {sel.size > 0 ? `(${sel.size})` : '(Tümü)'}</button>
            </div>
          </div>

          {/* Toplu fiyat paneli */}
          {bulkOpen && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold text-amber-800">Toplu Fiyat Güncelle — {sel.size > 0 ? `${sel.size} seçili ürün` : 'tüm ürünler'}</p><button onClick={() => setBulkOpen(false)}><X size={18} className="text-amber-500" /></button></div>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={bulkMode} onChange={(e) => setBulkMode(e.target.value as any)} className="text-sm border border-amber-200 rounded-lg px-2 py-2 bg-white">
                  <option value="multiplier">Alış × Çarpan</option>
                  <option value="fixed">Sabit Satış Fiyatı</option>
                </select>
                <input type="number" step="0.01" value={bulkVal} onChange={(e) => setBulkVal(e.target.value)} className="w-28 text-sm border border-amber-200 rounded-lg px-3 py-2" placeholder={bulkMode === 'multiplier' ? '2.10' : '0.00'} />
                <span className="text-xs text-amber-600">{bulkMode === 'multiplier' ? 'Örn: 2.10 → satış = alış × 2.10' : 'Tüm seçili ürünlerin satış fiyatı bu değer olur'}</span>
                <button onClick={applyBulk} disabled={bulkBusy} className="bg-amber-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50">{bulkBusy ? 'Uygulanıyor...' : 'Uygula'}</button>
              </div>
            </div>
          )}

          {/* Ürün tablosu */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {prodLoading ? (
              <div className="flex justify-center p-10"><span className="w-7 h-7 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" /></div>
            ) : allProds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400"><Package size={32} className="mb-3 text-slate-300" /><p className="font-medium text-slate-500">Henüz ürün yok</p><p className="text-sm mt-1">Serbest Satış ekranından veya tedarikçi portalından ürün ekleyin.</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-slate-50 text-slate-500 text-left text-xs">
                    <tr>
                      <th className="px-3 py-3 w-8"></th>
                      <th className="px-3 py-3">Ürün</th>
                      <th className="px-3 py-3">Tedarikçi</th>
                      <th className="px-3 py-3">Kod</th>
                      <th className="px-3 py-3">Alış</th>
                      <th className="px-3 py-3">Satış</th>
                      <th className="px-3 py-3">Stok</th>
                      <th className="px-3 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allProds.map((p) => {
                      const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
                      const topStok = vars.reduce((s: number, v: any) => s + (v.stok || 0), 0);
                      const img = Array.isArray(p.images) ? p.images[0] : null;
                      return (
                        <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50 align-middle">
                          <td className="px-3 py-2.5"><button onClick={() => toggleSel(p.id)} className="text-slate-400 hover:text-violet-600">{sel.has(p.id) ? <CheckSquare size={16} className="text-violet-600" /> : <Square size={16} />}</button></td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              {img ? <img src={img} className="w-10 h-10 rounded-lg object-cover shrink-0" /> : <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={14} className="text-slate-300" /></div>}
                              <div className="min-w-0">
                                <p className="font-medium text-slate-800 truncate max-w-[220px]">{p.ad}</p>
                                {vars.length > 0 && <div className="flex flex-wrap gap-1 mt-0.5">{vars.map((v: any, i: number) => <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border ${v.stok > 0 ? 'border-slate-200 text-slate-500' : 'border-red-200 text-red-400 line-through'}`}>{v.deger}:{v.stok}</span>)}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs">{p.supplierAd || '—'}</td>
                          <td className="px-3 py-2.5"><code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">{p.salesCode || '-'}</code></td>
                          <td className="px-3 py-2.5 text-slate-600">{fmt(p.alisFiyat || 0)}</td>
                          <td className="px-3 py-2.5 font-semibold text-emerald-600">{fmt(p.satisFiyat || 0)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{topStok}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEdit(p)} title="Düzenle" className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil size={14} /></button>
                              <button onClick={() => printBarkod([p])} title="Barkod Yazdır" className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"><ScanLine size={14} /></button>
                              <button onClick={() => deleteProd(p)} title="Sil" className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEDARİKÇİLER */}
      {view === 'tedarikciler' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center p-10"><span className="w-7 h-7 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" /></div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <UserCog size={32} className="mb-3 text-slate-300" />
              <p className="font-medium text-slate-500">Henüz tedarikçi yok</p>
              <p className="text-sm mt-1">Tedarikçi ekleyerek ürün yüklemelerine izin verin.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-50 text-slate-500 text-left"><tr><th className="px-4 py-3">Ad</th><th className="px-4 py-3">Giriş Kodu</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">Kayıt</th><th className="px-4 py-3">İşlem</th></tr></thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{s.ad}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><code className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono">{s.loginCode}</code><button onClick={() => copy(s.loginCode)} className="text-slate-400 hover:text-slate-600"><Copy size={13} /></button></div></td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.aktif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{s.aktif ? 'Aktif' : 'Pasif'}</span></td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{new Date(s.createdAt).toLocaleDateString('tr-TR')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openDetail(s.id)} className="inline-flex items-center gap-1 text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg text-xs"><Package size={13} /> Detay</button>
                          <button onClick={() => toggleAktif(s)} className={`px-2 py-1 rounded-lg text-xs ${s.aktif ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}>{s.aktif ? 'Pasifleştir' : 'Aktifleştir'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tedarikçi Ekle Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-[110] overflow-y-auto p-4 flex items-start sm:items-center justify-center bg-black/50" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4 my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">Tedarikçi Ekle</h3><button onClick={() => setAddOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            <p className="text-xs text-slate-400">Giriş kodu otomatik oluşturulur. PIN boş bırakılırsa da otomatik atanır.</p>
            <div><label className="block text-xs text-slate-500 mb-1">Tedarikçi Adı *</label><input value={addForm.ad} onChange={(e) => setAddForm({ ...addForm, ad: e.target.value })} placeholder="Firma / kişi adı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">PIN (boş = otomatik)</label>
              <div className="relative"><input type={showPin ? 'text' : 'password'} value={addForm.pin} onChange={(e) => setAddForm({ ...addForm, pin: e.target.value })} placeholder="Boş bırakın veya belirleyin" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg pr-9" /><button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-2.5 top-2.5 text-slate-400">{showPin ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            </div>
            <button onClick={addSupplier} disabled={addBusy} className="w-full bg-violet-600 text-white py-2.5 rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50">{addBusy ? 'Ekleniyor...' : 'Ekle'}</button>
          </div>
        </div>
      )}

      {/* Yeni Tedarikçi Kimlik Bilgileri */}
      {newCred && (
        <div className="fixed inset-0 z-[120] overflow-y-auto p-4 flex items-start sm:items-center justify-center bg-black/50" onClick={() => setNewCred(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4 my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">Giriş Bilgileri</h3><button onClick={() => setNewCred(null)}><X size={20} className="text-slate-400" /></button></div>
            <div className="bg-violet-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-violet-800">{newCred.ad}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><span className="text-xs text-slate-500">Giriş Kodu</span><div className="flex items-center gap-2"><code className="text-sm font-mono font-bold text-slate-800">{newCred.loginCode}</code><button onClick={() => copy(newCred.loginCode)} className="text-violet-600"><Copy size={14} /></button></div></div>
                <div className="flex items-center justify-between"><span className="text-xs text-slate-500">PIN</span><div className="flex items-center gap-2"><code className="text-sm font-mono font-bold text-slate-800">{newCred.pin}</code><button onClick={() => copy(newCred.pin)} className="text-violet-600"><Copy size={14} /></button></div></div>
              </div>
              <p className="text-[11px] text-slate-400">Portal adresi: <strong>{window.location.origin}/tedarikci</strong></p>
              <button onClick={() => copy(`Giriş Kodu: ${newCred.loginCode}\nPIN: ${newCred.pin}\nPortal: ${window.location.origin}/tedarikci`)} className="w-full text-xs bg-violet-600 text-white py-2 rounded-lg hover:bg-violet-700 inline-flex items-center justify-center gap-1.5"><Copy size={13} /> Tümünü Kopyala</button>
            </div>
            <p className="text-[11px] text-red-500">Bu bilgileri şimdi kaydedin — PIN bir daha gösterilmeyecek.</p>
          </div>
        </div>
      )}

      {/* Tedarikçi Detay Modal */}
      {detailId && detailSupplier && (
        <div className="fixed inset-0 z-[110] overflow-y-auto p-4 flex items-start sm:items-center justify-center bg-black/50" onClick={() => setDetailId(null)}>
          <div className="w-full max-w-2xl bg-white rounded-2xl p-6 space-y-4 my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">{detailSupplier.ad}</h3><button onClick={() => setDetailId(null)}><X size={20} className="text-slate-400" /></button></div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setDetailTab('urunler')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${detailTab === 'urunler' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Ürünler ({detailProds.length})</button>
              <button onClick={() => setDetailTab('satislar')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${detailTab === 'satislar' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Satışlar ({detailSales.length})</button>
              <button onClick={() => setDetailTab('hesap')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${detailTab === 'hesap' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Cari / Borç</button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {detailTab === 'urunler' ? (
                <div className="space-y-2">
                  {detailProds.length > 0 && (
                    <div className="flex justify-end mb-2"><button onClick={() => printBarkod(detailProds)} className="inline-flex items-center gap-1.5 text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1.5 rounded-lg"><ScanLine size={13} /> Tüm Ürünlerin Barkodunu Yazdır</button></div>
                  )}
                  {detailProds.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">Henüz ürün yüklenmemiş.</p> : detailProds.map((p) => {
                    const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
                    const topStok = vars.reduce((s: number, v: any) => s + (v.stok || 0), 0);
                    const img = Array.isArray(p.images) ? p.images[0] : null;
                    return (
                      <div key={p.id} className="flex items-center gap-3 border border-slate-200 rounded-xl p-3">
                        {img ? <img src={img} className="w-12 h-12 rounded-lg object-cover shrink-0" /> : <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={16} className="text-slate-300" /></div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 text-sm truncate">{p.ad}</p>
                          <p className="text-[11px] text-slate-400">Kod: {p.salesCode || '-'} · Alış: {fmt(p.alisFiyat)} · Satış: {fmt(p.satisFiyat || 0)} · Stok: {topStok}</p>
                          {vars.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{vars.map((v: any, i: number) => <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border ${v.stok > 0 ? 'border-slate-200 text-slate-500' : 'border-red-200 text-red-400 line-through'}`}>{v.deger}:{v.stok}</span>)}</div>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => openEdit(p)} title="Düzenle" className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil size={14} /></button>
                          <button onClick={() => printBarkod([p])} title="Barkod Yazdır" className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"><ScanLine size={14} /></button>
                          <button onClick={() => deleteProd(p)} title="Sil" className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : detailTab === 'satislar' ? (
                <div className="space-y-2">
                  {Object.keys(salesSummary).length === 0 ? <p className="text-slate-400 text-sm text-center py-8">Henüz satış yok.</p> : Object.values(salesSummary).map((e: any, i: number) => (
                    <div key={i} className="border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2"><p className="font-medium text-slate-800 text-sm">{e.ad}</p><div className="text-right"><span className="text-sm font-bold text-indigo-600">{e.toplam} adet</span><p className="text-[11px] text-slate-400">Alış cirosu: {fmt(e.ciro)}</p></div></div>
                      {Object.keys(e.bedenler).length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{Object.entries(e.bedenler).map(([b, n]: any) => <span key={b} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{b}: {n}</span>)}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Cari özet */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-[11px] text-slate-400">Toplam Borç</p><p className="text-base font-bold text-slate-800">{fmt(account?.borc || 0)}</p></div>
                    <div className="bg-emerald-50 rounded-xl p-3 text-center"><p className="text-[11px] text-emerald-500">Ödenen</p><p className="text-base font-bold text-emerald-600">{fmt(account?.odenen || 0)}</p></div>
                    <div className="bg-red-50 rounded-xl p-3 text-center"><p className="text-[11px] text-red-500">Kalan</p><p className="text-base font-bold text-red-600">{fmt(account?.kalan || 0)}</p></div>
                  </div>
                  {/* Ödeme ekle */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Wallet size={14} className="text-violet-600" /> Ödeme Ekle</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="number" value={payForm.tutar} onChange={(e) => setPayForm({ ...payForm, tutar: e.target.value })} placeholder="Tutar ₺" className="w-28 text-sm border border-slate-200 rounded-lg px-3 py-2" />
                      <input value={payForm.not} onChange={(e) => setPayForm({ ...payForm, not: e.target.value })} placeholder="Not (opsiyonel)" className="flex-1 min-w-[140px] text-sm border border-slate-200 rounded-lg px-3 py-2" />
                      <button onClick={addPayment} disabled={payBusy} className="bg-violet-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50">{payBusy ? '...' : 'Kaydet'}</button>
                    </div>
                  </div>
                  {/* Ödeme geçmişi */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500">Ödeme Geçmişi</p>
                    {(!account?.payments || account.payments.length === 0) ? <p className="text-slate-400 text-sm text-center py-6">Henüz ödeme kaydı yok.</p> : account.payments.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                        <div><p className="text-sm font-medium text-emerald-600">{fmt(p.tutar)}</p>{p.not && <p className="text-[11px] text-slate-400">{p.not}</p>}</div>
                        <div className="flex items-center gap-2"><span className="text-[11px] text-slate-400">{new Date(p.createdAt).toLocaleDateString('tr-TR')}</span><button onClick={() => deletePayment(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ürün Düzenleme Modal */}
      {editProd && (
        <div className="fixed inset-0 z-[120] overflow-y-auto p-4 flex items-start sm:items-center justify-center bg-black/50" onClick={() => setEditProd(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 space-y-4 my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Pencil size={18} className="text-indigo-600" /> Ürünü Düzenle</h3><button onClick={() => setEditProd(null)}><X size={20} className="text-slate-400" /></button></div>
            <div><label className="block text-xs text-slate-500 mb-1">Ürün Adı</label><input value={editForm.ad} onChange={(e) => setEditForm({ ...editForm, ad: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
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
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">Satış Fiyatı (₺)</label><input type="number" value={editForm.satisFiyat} onChange={(e) => setEditForm({ ...editForm, satisFiyat: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Alış Fiyatı (₺)</label><input type="number" value={editForm.alisFiyat} onChange={(e) => setEditForm({ ...editForm, alisFiyat: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>
            <button onClick={saveEdit} disabled={editBusy} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">{editBusy ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
