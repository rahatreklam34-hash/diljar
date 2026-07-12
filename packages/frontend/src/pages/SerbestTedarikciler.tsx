import { useState, useEffect } from 'react';
import { UserCog, Plus, X, Eye, EyeOff, Trash2, Package, Copy, RefreshCw, Pencil, ScanLine, Tag, Wallet, CheckSquare, Square, ChevronLeft, ChevronRight, Share2, Link2, Check, Search, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { printBarkodLabels } from '../lib/barkod';
import { useStore } from '../context/StoreContext';
import ImageDropzone from '../components/ImageDropzone';

const CINSIYET = ['kadin', 'erkek', 'unisex', 'cocuk'];
const CINS_LBL: Record<string, string> = { kadin: 'Kadın', erkek: 'Erkek', unisex: 'Unisex', cocuk: 'Çocuk' };

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Barkod yazdırma — gerçek taranabilir Code128 SVG (PDF/yazdırmada görünür)
function printBarkod(arr: any[]) {
  if (!arr.length) { toast.error('Ürün yok'); return; }
  if (!printBarkodLabels(arr, { showPrice: true })) toast.error('Açılır pencere engellendi');
}

export default function SerbestTedarikciler() {
  const { categories } = useStore();
  const katName = (id: string) => categories.find((c: any) => c.id === id)?.ad || '';
  const [lightbox, setLightbox] = useState<{ imgs: string[]; idx: number } | null>(null);
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
  const [prodSearch, setProdSearch] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'multiplier' | 'fixed'>('multiplier');
  const [bulkVal, setBulkVal] = useState('2.10');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Toplu düzeltme (ad / marka / cinsiyet)
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEdit, setBulkEdit] = useState({ ad: '', marka: '', cinsiyet: '' });
  const [bulkEditBusy, setBulkEditBusy] = useState(false);

  // Ürün düzenleme
  const [editProd, setEditProd] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ ad: '', bedenler: '', satisFiyat: '', alisFiyat: '', marka: '', cinsiyet: '', kategoriId: '' });
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editVars, setEditVars] = useState<{ deger: string; stok: number }[]>([]);
  const [editBusy, setEditBusy] = useState(false);

  // Paylaşım katalogları
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catEditing, setCatEditing] = useState<any | null>(null);
  const [catSearch, setCatSearch] = useState('');
  const [catBusy, setCatBusy] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [catDragIdx, setCatDragIdx] = useState<number | null>(null);

  // Listede satır içi düzenleme (ad / marka)
  const [inlineEdit, setInlineEdit] = useState<{ id: string; field: 'ad' | 'marka' } | null>(null);
  const [inlineVal, setInlineVal] = useState('');

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
    setEditForm({ ad: p.ad || '', bedenler: vars.map((v) => v.deger).join(','), satisFiyat: String(p.satisFiyat || ''), alisFiyat: String(p.alisFiyat || ''), marka: p.marka || '', cinsiyet: p.cinsiyet || '', kategoriId: p.kategoriId || '' });
    setEditImages(Array.isArray(p.images) ? p.images : []);
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
        marka: editForm.marka,
        cinsiyet: editForm.cinsiyet,
        kategoriId: editForm.kategoriId,
        images: editImages,
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
  const selAll = () => setSel((prev) => { const ids = shownProds.map((p) => p.id); const allSel = ids.length > 0 && ids.every((id) => prev.has(id)); return allSel ? new Set() : new Set(ids); });
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

  const applyBulkEdit = async () => {
    const ids = [...sel];
    if (ids.length === 0) { toast.error('Önce ürün seçin'); return; }
    const be = bulkEdit;
    if (!be.ad.trim() && !be.marka.trim() && !be.cinsiyet) { toast.error('Değiştirilecek en az bir alan girin'); return; }
    setBulkEditBusy(true);
    try {
      const body: any = { ids };
      if (be.ad.trim()) body.ad = be.ad.trim();
      if (be.marka.trim()) body.marka = be.marka.trim();
      if (be.cinsiyet) body.cinsiyet = be.cinsiyet;
      const r = await api.post('/store/free/products/bulk-edit', body);
      toast.success(`${r.data?.count || 0} ürün güncellendi`);
      setBulkEditOpen(false); setSel(new Set());
      setBulkEdit({ ad: '', marka: '', cinsiyet: '' });
      await loadAllProds();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    setBulkEditBusy(false);
  };

  // ─── Paylaşım katalogları ───
  const loadCatalogs = async () => { setCatLoading(true); try { const r = await api.get('/store/free/catalogs'); setCatalogs(r.data || []); } catch (e) { toast.error(apiErrorMessage(e)); } setCatLoading(false); };
  const openCatManager = async () => { setCatManagerOpen(true); setCatEditing(null); setCatSearch(''); await loadCatalogs(); if (allProds.length === 0) await loadAllProds(); };
  const catLink = (token: string) => `${window.location.origin}/katalog/t/${token}`;
  const copy = (text: string) => { try { navigator.clipboard?.writeText(text); toast.success('Kopyalandı'); } catch { toast.error('Kopyalanamadı'); } };
  const createCatalog = async () => {
    if (!newCatName.trim()) { toast.error('Katalog adı girin'); return; }
    setCatBusy(true);
    try {
      const r = await api.post('/store/free/catalogs', { ad: newCatName.trim() });
      setNewCatName('');
      await loadCatalogs();
      setCatEditing({ ...r.data, productIds: Array.isArray(r.data.productIds) ? r.data.productIds : [] });
    } catch (e) { toast.error(apiErrorMessage(e)); }
    setCatBusy(false);
  };
  const editCatalog = (c: any) => { setCatSearch(''); setCatEditing({ ...c, whatsapp: c.whatsapp || '05334413472', productIds: Array.isArray(c.productIds) ? c.productIds.map(String) : [] }); };
  const toggleCatProduct = (pid: string) => setCatEditing((c: any) => { if (!c) return c; const ids: string[] = Array.isArray(c.productIds) ? c.productIds : []; return { ...c, productIds: ids.includes(pid) ? ids.filter((x) => x !== pid) : [...ids, pid] }; });
  const catFilteredProds = () => allProds.filter((p) => !catSearch.trim() || (p.ad || '').toLowerCase().includes(catSearch.toLowerCase()) || (p.salesCode || '').toLowerCase().includes(catSearch.toLowerCase()));
  const toggleCatAll = () => setCatEditing((c: any) => {
    if (!c) return c;
    const ids: string[] = Array.isArray(c.productIds) ? c.productIds : [];
    const fil = catFilteredProds().map((p) => p.id);
    const hepsiSecili = fil.length > 0 && fil.every((id) => ids.includes(id));
    if (hepsiSecili) return { ...c, productIds: ids.filter((id) => !fil.includes(id)) };
    return { ...c, productIds: Array.from(new Set([...ids, ...fil])) };
  });
  const saveCatalog = async () => {
    if (!catEditing) return;
    if (!String(catEditing.ad || '').trim()) { toast.error('Katalog adı girin'); return; }
    setCatBusy(true);
    try {
      await api.patch(`/store/free/catalogs/${catEditing.id}`, { ad: catEditing.ad, whatsapp: catEditing.whatsapp, aktif: catEditing.aktif, productIds: catEditing.productIds });
      toast.success('Katalog kaydedildi');
      await loadCatalogs();
      setCatEditing(null);
    } catch (e) { toast.error(apiErrorMessage(e)); }
    setCatBusy(false);
  };
  const toggleCatalogAktif = async (c: any) => {
    try { await api.patch(`/store/free/catalogs/${c.id}`, { aktif: !c.aktif }); await loadCatalogs(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const deleteCatalog = async (id: string) => {
    if (!confirm('Katalog silinsin mi?')) return;
    try { await api.delete(`/store/free/catalogs/${id}`); await loadCatalogs(); if (catEditing?.id === id) setCatEditing(null); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const moveCatItem = (from: number, to: number) => setCatEditing((c: any) => {
    if (!c) return c;
    const ids: string[] = [...(c.productIds || [])];
    if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) return c;
    const [m] = ids.splice(from, 1); ids.splice(to, 0, m);
    return { ...c, productIds: ids };
  });
  const setCatItemPos = (from: number, pos: number) => {
    const len = catEditing?.productIds?.length || 1;
    moveCatItem(from, Math.max(0, Math.min(len - 1, (pos || 1) - 1)));
  };

  // ─── Satır içi (liste) düzenleme ───
  const startInline = (p: any, field: 'ad' | 'marka') => { setInlineEdit({ id: p.id, field }); setInlineVal(p[field] || ''); };
  const commitInline = async () => {
    if (!inlineEdit) return;
    const { id, field } = inlineEdit; const val = inlineVal.trim();
    setInlineEdit(null);
    const cur = allProds.find((x) => x.id === id);
    if (!cur || (cur[field] || '') === val) return;
    setAllProds((prev) => prev.map((x) => (x.id === id ? { ...x, [field]: val } : x)));
    try { await api.patch(`/store/free/products/${id}`, { [field]: val }); } catch (e) { toast.error(apiErrorMessage(e)); loadAllProds(); }
  };
  const setCinsiyetInline = async (p: any, val: string) => {
    setAllProds((prev) => prev.map((x) => (x.id === p.id ? { ...x, cinsiyet: val } : x)));
    try { await api.patch(`/store/free/products/${p.id}`, { cinsiyet: val }); } catch (e) { toast.error(apiErrorMessage(e)); loadAllProds(); }
  };

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

  // Ürün arama filtresi (ad / kod / marka / tedarikçi)
  const q = prodSearch.trim().toLocaleLowerCase('tr');
  const shownProds = q
    ? allProds.filter((p) => [p.ad, p.salesCode, p.marka, p.supplierAd].some((f) => (f || '').toLocaleLowerCase('tr').includes(q)))
    : allProds;

  const allSelected = sel.size > 0 && shownProds.length > 0 && shownProds.every((p) => sel.has(p.id));

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><UserCog size={20} className="text-green-600" /></div>
          <div><h1 className="text-lg font-bold text-slate-800">Serbest Satış · Tedarikçiler</h1><p className="text-xs text-slate-400">Geçici depo ürünleri ve toptancı hesapları</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { load(); loadAllProds(); }} className="inline-flex items-center gap-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg text-sm"><RefreshCw size={14} /> Yenile</button>
          <button onClick={openCatManager} className="inline-flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700"><Share2 size={16} /> Paylaşım Katalogları</button>
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"><Plus size={16} /> Tedarikçi Ekle</button>
        </div>
      </div>

      {/* Üst sekme */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        <button onClick={() => setView('urunler')} className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${view === 'urunler' ? 'bg-green-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}><Package size={15} /> Ürünler ({allProds.length})</button>
        <button onClick={() => setView('tedarikciler')} className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${view === 'tedarikciler' ? 'bg-green-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}><UserCog size={15} /> Tedarikçiler ({list.length})</button>
      </div>

      {/* ÜRÜNLER (depo görünümü) */}
      {view === 'urunler' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <button onClick={selAll} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-green-600">{allSelected ? <CheckSquare size={16} /> : <Square size={16} />} Tümünü Seç</button>
              {sel.size > 0 && <span className="text-green-600 font-medium">{sel.size} seçili</span>}
            </div>
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} placeholder="Ürün, kod, marka veya tedarikçi ara..." className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-300" />
              {prodSearch && <button onClick={() => setProdSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => printBarkod(sel.size > 0 ? allProds.filter((p) => sel.has(p.id)) : allProds)} className="inline-flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded-lg"><ScanLine size={13} /> Barkod Yazdır</button>
              <button onClick={() => setBulkOpen(true)} className="inline-flex items-center gap-1.5 text-xs bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg"><Tag size={13} /> Toplu Fiyat {sel.size > 0 ? `(${sel.size})` : '(Tümü)'}</button>
              <button onClick={() => setBulkEditOpen(true)} className="inline-flex items-center gap-1.5 text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1.5 rounded-lg"><Pencil size={13} /> Toplu Düzelt {sel.size > 0 ? `(${sel.size})` : '(Tümü)'}</button>
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

          {/* Toplu düzeltme paneli */}
          {bulkEditOpen && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold text-indigo-800">Toplu Düzelt — {sel.size > 0 ? `${sel.size} seçili ürüne uygulanacak` : 'önce ürün seçin'}</p><button onClick={() => setBulkEditOpen(false)}><X size={18} className="text-indigo-500" /></button></div>
              <p className="text-xs text-indigo-600 -mt-1">Girilen değerler yalnızca seçili ürünlere uygulanır. Boş bırakılan alanlar değişmez.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-indigo-700 mb-1">Ürün Adı</label>
                  <input value={bulkEdit.ad} onChange={(e) => setBulkEdit((s) => ({ ...s, ad: e.target.value }))} placeholder="Boş = değişmez" className="w-full text-sm border border-indigo-200 rounded-lg px-3 py-2 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-indigo-700 mb-1">Marka</label>
                  <input value={bulkEdit.marka} onChange={(e) => setBulkEdit((s) => ({ ...s, marka: e.target.value }))} placeholder="Boş = değişmez" className="w-full text-sm border border-indigo-200 rounded-lg px-3 py-2 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-indigo-700 mb-1">Cinsiyet</label>
                  <select value={bulkEdit.cinsiyet} onChange={(e) => setBulkEdit((s) => ({ ...s, cinsiyet: e.target.value }))} className="w-full text-sm border border-indigo-200 rounded-lg px-3 py-2 bg-white">
                    <option value="">Değiştirme</option>
                    <option value="kadin">Kadın</option>
                    <option value="erkek">Erkek</option>
                    <option value="cocuk">Çocuk</option>
                    <option value="unisex">Unisex</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setBulkEditOpen(false)} className="text-sm text-slate-500 px-3 py-2">İptal</button>
                <button onClick={applyBulkEdit} disabled={bulkEditBusy || sel.size === 0} className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">{bulkEditBusy ? 'Uygulanıyor...' : `Seçili ${sel.size} ürüne uygula`}</button>
              </div>
            </div>
          )}

          {/* Ürün tablosu */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {prodLoading ? (
              <div className="flex justify-center p-10"><span className="w-7 h-7 border-2 border-slate-200 border-t-green-500 rounded-full animate-spin" /></div>
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
                      <th className="px-3 py-3">Marka</th>
                      <th className="px-3 py-3">Cinsiyet</th>
                      <th className="px-3 py-3">Kod</th>
                      <th className="px-3 py-3">Alış</th>
                      <th className="px-3 py-3">Satış</th>
                      <th className="px-3 py-3">Stok</th>
                      <th className="px-3 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownProds.length === 0 ? (
                      <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400 text-sm">"{prodSearch}" için ürün bulunamadı.</td></tr>
                    ) : shownProds.map((p) => {
                      const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
                      const topStok = vars.reduce((s: number, v: any) => s + (v.stok || 0), 0);
                      const img = Array.isArray(p.images) ? p.images[0] : null;
                      return (
                        <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50 align-middle">
                          <td className="px-3 py-2.5"><button onClick={() => toggleSel(p.id)} className="text-slate-400 hover:text-green-600">{sel.has(p.id) ? <CheckSquare size={16} className="text-green-600" /> : <Square size={16} />}</button></td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              {img ? <img src={img} onClick={() => setLightbox({ imgs: p.images, idx: 0 })} className="w-10 h-10 rounded-lg object-cover shrink-0 cursor-zoom-in hover:ring-2 hover:ring-emerald-400 transition" /> : <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={14} className="text-slate-300" /></div>}
                              <div className="min-w-0">
                                {inlineEdit && inlineEdit.id === p.id && inlineEdit.field === 'ad' ? (
                                  <input autoFocus value={inlineVal} onChange={(e) => setInlineVal(e.target.value)} onBlur={commitInline} onKeyDown={(e) => { if (e.key === 'Enter') commitInline(); if (e.key === 'Escape') setInlineEdit(null); }} className="font-medium text-slate-800 border border-emerald-400 rounded px-1.5 py-0.5 text-sm w-[220px]" />
                                ) : (
                                  <p onDoubleClick={() => startInline(p, 'ad')} title="Düzeltmek için çift tıklayın" className="font-medium text-slate-800 truncate max-w-[220px] cursor-text">{p.ad}</p>
                                )}
                                {vars.length > 0 && <div className="flex flex-wrap gap-1 mt-0.5">{vars.map((v: any, i: number) => <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border ${v.stok > 0 ? 'border-slate-200 text-slate-500' : 'border-red-200 text-red-400 line-through'}`}>{v.deger}:{v.stok}</span>)}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs">{p.supplierAd || '—'}</td>
                          <td className="px-3 py-2.5">
                            {inlineEdit && inlineEdit.id === p.id && inlineEdit.field === 'marka' ? (
                              <input autoFocus value={inlineVal} onChange={(e) => setInlineVal(e.target.value)} onBlur={commitInline} onKeyDown={(e) => { if (e.key === 'Enter') commitInline(); if (e.key === 'Escape') setInlineEdit(null); }} className="text-xs border border-emerald-400 rounded px-1.5 py-0.5 w-[110px]" />
                            ) : (
                              <span onClick={() => startInline(p, 'marka')} title="Düzenlemek için tıklayın" className="text-xs text-slate-600 cursor-text hover:bg-slate-100 rounded px-1.5 py-0.5 inline-block min-w-[44px]">{p.marka || '—'}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <select value={p.cinsiyet || ''} onChange={(e) => setCinsiyetInline(p, e.target.value)} className="text-xs border border-slate-200 rounded px-1 py-1 bg-white cursor-pointer">
                              <option value="">—</option>
                              {CINSIYET.map((c) => <option key={c} value={c}>{CINS_LBL[c] || c}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2.5"><code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">{p.salesCode || '-'}</code></td>
                          <td className="px-3 py-2.5 text-slate-600">{fmt(p.alisFiyat || 0)}</td>
                          <td className="px-3 py-2.5 font-semibold text-emerald-600">{fmt(p.satisFiyat || 0)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{topStok}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEdit(p)} title="Düzenle" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Pencil size={14} /></button>
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
            <div className="flex justify-center p-10"><span className="w-7 h-7 border-2 border-slate-200 border-t-green-500 rounded-full animate-spin" /></div>
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
                          <button onClick={() => openDetail(s.id)} className="inline-flex items-center gap-1 text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg text-xs"><Package size={13} /> Detay</button>
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
            <button onClick={addSupplier} disabled={addBusy} className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">{addBusy ? 'Ekleniyor...' : 'Ekle'}</button>
          </div>
        </div>
      )}

      {/* Yeni Tedarikçi Kimlik Bilgileri */}
      {newCred && (
        <div className="fixed inset-0 z-[120] overflow-y-auto p-4 flex items-start sm:items-center justify-center bg-black/50" onClick={() => setNewCred(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4 my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">Giriş Bilgileri</h3><button onClick={() => setNewCred(null)}><X size={20} className="text-slate-400" /></button></div>
            <div className="bg-green-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-green-800">{newCred.ad}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><span className="text-xs text-slate-500">Giriş Kodu</span><div className="flex items-center gap-2"><code className="text-sm font-mono font-bold text-slate-800">{newCred.loginCode}</code><button onClick={() => copy(newCred.loginCode)} className="text-green-600"><Copy size={14} /></button></div></div>
                <div className="flex items-center justify-between"><span className="text-xs text-slate-500">PIN</span><div className="flex items-center gap-2"><code className="text-sm font-mono font-bold text-slate-800">{newCred.pin}</code><button onClick={() => copy(newCred.pin)} className="text-green-600"><Copy size={14} /></button></div></div>
              </div>
              <p className="text-[11px] text-slate-400">Portal adresi: <strong>{window.location.origin}/tedarikci</strong></p>
              <button onClick={() => copy(`Giriş Kodu: ${newCred.loginCode}\nPIN: ${newCred.pin}\nPortal: ${window.location.origin}/tedarikci`)} className="w-full text-xs bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 inline-flex items-center justify-center gap-1.5"><Copy size={13} /> Tümünü Kopyala</button>
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
              <button onClick={() => setDetailTab('urunler')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${detailTab === 'urunler' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>Ürünler ({detailProds.length})</button>
              <button onClick={() => setDetailTab('satislar')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${detailTab === 'satislar' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>Satışlar ({detailSales.length})</button>
              <button onClick={() => setDetailTab('hesap')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${detailTab === 'hesap' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>Cari / Borç</button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {detailTab === 'urunler' ? (
                <div className="space-y-2">
                  {detailProds.length > 0 && (
                    <div className="flex justify-end mb-2"><button onClick={() => printBarkod(detailProds)} className="inline-flex items-center gap-1.5 text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg"><ScanLine size={13} /> Tüm Ürünlerin Barkodunu Yazdır</button></div>
                  )}
                  {detailProds.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">Henüz ürün yüklenmemiş.</p> : detailProds.map((p) => {
                    const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
                    const topStok = vars.reduce((s: number, v: any) => s + (v.stok || 0), 0);
                    const img = Array.isArray(p.images) ? p.images[0] : null;
                    return (
                      <div key={p.id} className="flex items-center gap-3 border border-slate-200 rounded-xl p-3">
                        {img ? <img src={img} onClick={() => setLightbox({ imgs: p.images, idx: 0 })} className="w-12 h-12 rounded-lg object-cover shrink-0 cursor-zoom-in hover:ring-2 hover:ring-emerald-400 transition" /> : <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={16} className="text-slate-300" /></div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 text-sm truncate">{p.ad}</p>
                          <p className="text-[11px] text-slate-400">Kod: {p.salesCode || '-'} · Alış: {fmt(p.alisFiyat)} · Satış: {fmt(p.satisFiyat || 0)} · Stok: {topStok}</p>
                          {(p.marka || p.kategoriId || p.cinsiyet) && <div className="flex flex-wrap gap-1 mt-1">{p.kategoriId && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">{katName(p.kategoriId) || 'Kategori'}</span>}{p.marka && <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">{p.marka}</span>}{p.cinsiyet && <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">{p.cinsiyet}</span>}</div>}
                          {vars.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{vars.map((v: any, i: number) => <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border ${v.stok > 0 ? 'border-slate-200 text-slate-500' : 'border-red-200 text-red-400 line-through'}`}>{v.deger}:{v.stok}</span>)}</div>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => openEdit(p)} title="Düzenle" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Pencil size={14} /></button>
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
                      <div className="flex items-center justify-between gap-2"><p className="font-medium text-slate-800 text-sm">{e.ad}</p><div className="text-right"><span className="text-sm font-bold text-emerald-600">{e.toplam} adet</span><p className="text-[11px] text-slate-400">Alış cirosu: {fmt(e.ciro)}</p></div></div>
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
                    <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Wallet size={14} className="text-green-600" /> Ödeme Ekle</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="number" value={payForm.tutar} onChange={(e) => setPayForm({ ...payForm, tutar: e.target.value })} placeholder="Tutar ₺" className="w-28 text-sm border border-slate-200 rounded-lg px-3 py-2" />
                      <input value={payForm.not} onChange={(e) => setPayForm({ ...payForm, not: e.target.value })} placeholder="Not (opsiyonel)" className="flex-1 min-w-[140px] text-sm border border-slate-200 rounded-lg px-3 py-2" />
                      <button onClick={addPayment} disabled={payBusy} className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">{payBusy ? '...' : 'Kaydet'}</button>
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
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-4 my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Pencil size={18} className="text-emerald-600" /> Ürünü Düzenle</h3><button onClick={() => setEditProd(null)}><X size={20} className="text-slate-400" /></button></div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ürün Görselleri <span className="text-slate-400">(ilki kapak görseli)</span></label>
              <ImageDropzone images={editImages} onChange={setEditImages} max={6} />
            </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Kategori</label>
                <select value={editForm.kategoriId} onChange={(e) => setEditForm({ ...editForm, kategoriId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                  <option value="">— Seçiniz —</option>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.ad}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Cinsiyet</label>
                <select value={editForm.cinsiyet} onChange={(e) => setEditForm({ ...editForm, cinsiyet: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                  <option value="">— Seçiniz —</option>
                  {CINSIYET.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div><label className="block text-xs text-slate-500 mb-1">Marka</label><input value={editForm.marka} onChange={(e) => setEditForm({ ...editForm, marka: e.target.value })} placeholder="Marka adı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <button onClick={saveEdit} disabled={editBusy} className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50">{editBusy ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>
        </div>
      )}

      {/* Paylaşım Katalogları Yöneticisi */}
      {catManagerOpen && (
        <div className="fixed inset-0 z-[130] overflow-y-auto p-4 flex items-start sm:items-center justify-center bg-black/50" onClick={() => { setCatManagerOpen(false); setCatEditing(null); }}>
          <div className="w-full max-w-2xl bg-white rounded-2xl p-6 space-y-4 my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Share2 size={18} className="text-teal-600" /> Paylaşım Katalogları</h3>
              <button onClick={() => { setCatManagerOpen(false); setCatEditing(null); }}><X size={20} className="text-slate-400" /></button>
            </div>

            {!catEditing ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">Tedarikçi ürünlerinden katalog oluşturup link ile paylaşın. Müşteri beden seçip WhatsApp ile sipariş talebi gönderir.</p>
                <div className="flex items-center gap-2">
                  <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createCatalog()} placeholder="Yeni katalog adı (ör: Yazlık Koleksiyon)" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                  <button onClick={createCatalog} disabled={catBusy} className="inline-flex items-center gap-1.5 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"><Plus size={15} /> Oluştur</button>
                </div>
                <div className="max-h-[55vh] overflow-y-auto space-y-2">
                  {catLoading ? (
                    <div className="flex justify-center p-8"><span className="w-6 h-6 border-2 border-slate-200 border-t-teal-500 rounded-full animate-spin" /></div>
                  ) : catalogs.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-8">Henüz katalog yok.</p>
                  ) : catalogs.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 border border-slate-200 rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2"><p className="font-medium text-slate-800 truncate">{c.ad}</p><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.aktif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{c.aktif ? 'Aktif' : 'Pasif'}</span></div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{c.urunSayisi || 0} ürün · /katalog/t/{c.token}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => copy(catLink(c.token))} title="Linki Kopyala" className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg"><Link2 size={15} /></button>
                        <button onClick={() => window.open(catLink(c.token), '_blank')} title="Aç" className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"><Eye size={15} /></button>
                        <button onClick={() => editCatalog(c)} title="Ürünleri Düzenle" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Pencil size={15} /></button>
                        <button onClick={() => toggleCatalogAktif(c)} title={c.aktif ? 'Pasifleştir' : 'Aktifleştir'} className={`p-1.5 rounded-lg ${c.aktif ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}>{c.aktif ? <EyeOff size={15} /> : <Check size={15} />}</button>
                        <button onClick={() => deleteCatalog(c.id)} title="Sil" className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button onClick={() => setCatEditing(null)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><ChevronLeft size={14} /> Kataloglara dön</button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Katalog Adı</label><input value={catEditing.ad} onChange={(e) => setCatEditing((c: any) => ({ ...c, ad: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                  <div><label className="block text-xs text-slate-500 mb-1">WhatsApp Sipariş Numarası <span className="text-slate-300">(manuel)</span></label><input type="tel" inputMode="tel" value={catEditing.whatsapp || ''} onChange={(e) => setCatEditing((c: any) => ({ ...c, whatsapp: e.target.value }))} placeholder="Örn: 05334413472 veya 905334413472" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                </div>
                <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
                  <Link2 size={14} className="text-teal-600 shrink-0" />
                  <code className="text-[11px] text-teal-700 truncate flex-1">{catLink(catEditing.token)}</code>
                  <button onClick={() => copy(catLink(catEditing.token))} className="text-teal-600 hover:text-teal-800"><Copy size={14} /></button>
                </div>
                {(catEditing.productIds || []).length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Sıralama <span className="text-slate-400 font-normal">(sürükle-bırak, ok tuşları veya sıra no)</span></label>
                    <div className="max-h-[28vh] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {(catEditing.productIds || []).map((pid: string, idx: number) => {
                        const p = allProds.find((x) => x.id === pid);
                        if (!p) return null;
                        const img = Array.isArray(p.images) ? p.images[0] : null;
                        const len = (catEditing.productIds || []).length;
                        return (
                          <div key={pid} draggable onDragStart={() => setCatDragIdx(idx)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (catDragIdx !== null) moveCatItem(catDragIdx, idx); setCatDragIdx(null); }} className={`flex items-center gap-2 px-2 py-1.5 bg-white ${catDragIdx === idx ? 'opacity-40' : ''}`}>
                            <GripVertical size={14} className="text-slate-300 cursor-grab shrink-0" />
                            <input type="number" min={1} max={len} value={idx + 1} onChange={(e) => setCatItemPos(idx, parseInt(e.target.value) || 1)} className="w-11 text-center text-xs border border-slate-200 rounded px-1 py-0.5 shrink-0" />
                            {img ? <img src={img} className="w-8 h-8 rounded object-cover shrink-0" /> : <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center shrink-0"><Package size={12} className="text-slate-300" /></div>}
                            <span className="text-sm text-slate-700 truncate flex-1">{p.ad}</span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button onClick={() => moveCatItem(idx, idx - 1)} disabled={idx === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp size={14} /></button>
                              <button onClick={() => moveCatItem(idx, idx + 1)} disabled={idx === len - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown size={14} /></button>
                              <button onClick={() => toggleCatProduct(pid)} title="Çıkar" className="p-1 text-red-400 hover:text-red-600"><X size={14} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-600">Ürünler ({(catEditing.productIds || []).length} seçili)</label>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={toggleCatAll} className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-800">
                        {(() => { const fil = catFilteredProds().map((p) => p.id); const hepsi = fil.length > 0 && fil.every((id) => (catEditing.productIds || []).includes(id)); return hepsi ? <><CheckSquare size={13} /> Tümünü Kaldır</> : <><Square size={13} /> Tümünü Seç</>; })()}
                      </button>
                      <div className="relative"><Search size={13} className="absolute left-2.5 top-2 text-slate-400" /><input value={catSearch} onChange={(e) => setCatSearch(e.target.value)} placeholder="Ürün ara..." className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg" /></div>
                    </div>
                  </div>
                  <div className="max-h-[40vh] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {catFilteredProds().map((p) => {
                      const checked = (catEditing.productIds || []).includes(p.id);
                      const img = Array.isArray(p.images) ? p.images[0] : null;
                      return (
                        <button key={p.id} onClick={() => toggleCatProduct(p.id)} className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${checked ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                          {checked ? <CheckSquare size={16} className="text-teal-600 shrink-0" /> : <Square size={16} className="text-slate-300 shrink-0" />}
                          {img ? <img src={img} className="w-9 h-9 rounded-lg object-cover shrink-0" /> : <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={13} className="text-slate-300" /></div>}
                          <div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800 truncate">{p.ad}</p><p className="text-[11px] text-slate-400">{p.salesCode || '-'} · {fmt(p.satisFiyat || 0)}</p></div>
                        </button>
                      );
                    })}
                    {allProds.length === 0 && <p className="text-slate-400 text-sm text-center py-6">Ürün bulunamadı.</p>}
                  </div>
                </div>
                <button onClick={saveCatalog} disabled={catBusy} className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50">{catBusy ? 'Kaydediliyor...' : 'Kataloğu Kaydet'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Görsel büyütme (lightbox) */}
      {lightbox && lightbox.imgs && lightbox.imgs.length > 0 && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={28} /></button>
          {lightbox.imgs.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); setLightbox((l) => l && ({ ...l, idx: (l.idx - 1 + l.imgs.length) % l.imgs.length })); }} className="absolute left-4 text-white/80 hover:text-white p-2"><ChevronLeft size={36} /></button>
          )}
          <img src={lightbox.imgs[lightbox.idx]} onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl" />
          {lightbox.imgs.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); setLightbox((l) => l && ({ ...l, idx: (l.idx + 1) % l.imgs.length })); }} className="absolute right-4 text-white/80 hover:text-white p-2"><ChevronRight size={36} /></button>
          )}
          {lightbox.imgs.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2" onClick={(e) => e.stopPropagation()}>
              {lightbox.imgs.map((im, i) => (
                <button key={i} onClick={() => setLightbox((l) => l && ({ ...l, idx: i }))} className={`w-12 h-12 rounded-lg overflow-hidden border-2 ${i === lightbox.idx ? 'border-emerald-400' : 'border-transparent opacity-60'}`}><img src={im} className="w-full h-full object-cover" /></button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
