import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, X, Copy, Search, Check, Link2, Tag, Package, ChevronLeft, ExternalLink, ShoppingBag, Sparkles, Ticket, Eye, MousePointerClick, TrendingUp, MoreVertical, Grid3X3, List, Pen, SlidersHorizontal, LayoutGrid, Clock, Pause, GripVertical, Smartphone, Rocket, Layers, Coins } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useUrlState } from '../lib/useUrlState';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';

const openChat = (phone: string, name?: string) => window.dispatchEvent(new CustomEvent('open-chat', { detail: { phone, name } }));

const fmtK = (n: number) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
};
const fmtP = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '₺';
const fmtPK = (n: number) => {
  if (n >= 1000000) return '₺' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return '₺' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return '₺' + n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
};
const pctChange = (cur: number, prev: number) => {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
};

function MiniSparkline({ color = '#8b5cf6' }: { color?: string }) {
  const pts = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 7; i++) arr.push(Math.random() * 20 + 5);
    return arr;
  }, []);
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const range = max - min || 1;
  const w = 60; const h = 20;
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (pts.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0"><path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

export default function KatalogYonetimi() {
  const navigate = useNavigate();
  const { canDo } = useAuth();
  const store: any = useStore() || {};
  const products: any[] = store.products || [];
  const categories: any[] = store.categories || [];

  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [reqStats, setReqStats] = useState<any>({});
  const [reqTotal, setReqTotal] = useState(0);
  const [reqPage, setReqPage] = useState(1);
  const [reqSearch, setReqSearch] = useState('');
  const [reqDurum, setReqDurum] = useState('');
  const [reqCatalog, setReqCatalog] = useState('');
  const [reqDateFrom, setReqDateFrom] = useState('');
  const [reqDateTo, setReqDateTo] = useState('');
  const [reqListMode, setReqListMode] = useState<'list' | 'grid'>('list');
  const [catSettings, setCatSettings] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ rezervSureDk: 30, otomatikIptal: true, bildirimAktif: true, hatirlatmaDk: '10,20', dekontHatirlatmaDk: '5', siparisOnayMesaji: '', dekontIsteMesaji: '', kartOdemeMesaji: '', dekontAlindiMesaji: '', iptalMesaji: '', odemeOnayMesaji: '' });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [detailReq, setDetailReq] = useState<any>(null);
  const [view, setView] = useState<'list' | 'edit' | 'requests' | 'canli'>('list');
  const [stats, setStats] = useState<Record<string, any>>({});
  const [stockReport, setStockReport] = useState<any>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockExpand, setStockExpand] = useState<Record<string, boolean>>({});
  const [listMode, setListMode] = useState<'grid' | 'list'>('grid');
  const [searchQ, setSearchQ] = useUrlState('q', '');
  const [durumFilter, setDurumFilter] = useUrlState('durum', '');
  const [sortBy, setSortBy] = useUrlState('sort', 'updatedAt');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  // Editor state
  const [ad, setAd] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [aktif, setAktif] = useState(true);
  const [pids, setPids] = useState<string[]>([]);
  const [kampanyalar, setKampanyalar] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [filterMarka, setFilterMarka] = useState('');
  const [filterKategori, setFilterKategori] = useState('');
  const [filterCinsiyet, setFilterCinsiyet] = useState('');
  const [kForm, setKForm] = useState({ tip: 'adetIndirim', kosul: '', indirimTip: 'yuzde', indirimDeger: '', aciklama: '' });

  // Kupon state
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponForm, setCouponForm] = useState({ code: '', tip: 'yuzde', deger: '', maxKullanim: '', baslangic: '', bitis: '' });
  const [couponAdding, setCouponAdding] = useState(false);

  // Enhance state (DB-backed)
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [enhancePrompt, setEnhancePrompt] = useState('');
  const [enhanceJobs, setEnhanceJobs] = useState<any[]>([]);
  const [enhanceMode, setEnhanceMode] = useState<'setup' | 'review'>('setup');
  const [enhanceSelected, setEnhanceSelected] = useState<Set<string>>(new Set());
  const [enhFiltStok, setEnhFiltStok] = useState(false);
  const [enhFiltMarka, setEnhFiltMarka] = useState('');
  const [enhFiltKategori, setEnhFiltKategori] = useState('');
  const [enhFiltCinsiyet, setEnhFiltCinsiyet] = useState('');
  const [enhFiltAd, setEnhFiltAd] = useState('');
  const [enhRefImage, setEnhRefImage] = useState<string | null>(null);
  const [enhStarting, setEnhStarting] = useState(false);
  const [enhRetryPrompt, setEnhRetryPrompt] = useState('');
  const [enhRetryId, setEnhRetryId] = useState<string | null>(null);
  const [enhLightbox, setEnhLightbox] = useState<string | null>(null);
  const [enhCompare, setEnhCompare] = useState<{ old: string; new: string } | null>(null);
  const [enhSel, setEnhSel] = useState<Set<string>>(new Set());
  const [enhPromptView, setEnhPromptView] = useState<{ ad: string; prompt: string } | null>(null);
  const [enhStatusFilt, setEnhStatusFilt] = useState<string>('');
  // Job başına varyant seçimi: { selected: url[], cover: url }
  const [enhPick, setEnhPick] = useState<Record<string, { selected: string[]; cover: string }>>({});
  // Kalıcı prompt kütüphanesi
  const [promptPresets, setPromptPresets] = useState<any[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [catRes, statRes] = await Promise.all([
        api.get('/store/catalogs'),
        api.get('/store/catalogs/stats').catch(() => ({ data: { stats: {} } })),
      ]);
      setCatalogs(catRes.data.rows || []);
      setStats(statRes.data.stats || {});
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openEditor = (c: any) => {
    setEditing(c); setAd(c.ad || ''); setWhatsapp(c.whatsapp || ''); setAktif(c.aktif ?? true);
    setPids(Array.isArray(c.productIds) ? c.productIds : []);
    setKampanyalar(Array.isArray(c.kampanyalar) ? c.kampanyalar : []);
    setQ(''); setFilterMarka(''); setFilterKategori(''); setFilterCinsiyet('');
    setCoupons([]); setCouponForm({ code: '', tip: 'yuzde', deger: '', maxKullanim: '', baslangic: '', bitis: '' }); setCouponAdding(false);
    loadCoupons(c.id);
    setView('edit');
  };
  const closeEditor = () => { setEditing(null); setView('list'); load(); };

  const loadCoupons = async (catId: string) => { try { const r = await api.get(`/store/catalogs/${catId}/coupons`); setCoupons(r.data || []); } catch {} };
  const addCoupon = async () => {
    if (!couponForm.code || !couponForm.deger) { toast.error('Kupon kodu ve indirim değeri zorunlu'); return; }
    setCouponAdding(true);
    try {
      await api.post(`/store/catalogs/${editing?.id}/coupons`, {
        code: couponForm.code, tip: couponForm.tip, deger: Number(couponForm.deger),
        maxKullanim: couponForm.maxKullanim ? Number(couponForm.maxKullanim) : null,
        baslangic: couponForm.baslangic || null, bitis: couponForm.bitis || null
      });
      toast.success('Kupon eklendi');
      setCouponForm({ code: '', tip: 'yuzde', deger: '', maxKullanim: '', baslangic: '', bitis: '' });
      loadCoupons(editing?.id);
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setCouponAdding(false); }
  };
  const toggleCoupon = async (c: any) => { try { await api.patch(`/store/catalogs/${editing?.id}/coupons/${c.id}`, { aktif: !c.aktif }); loadCoupons(editing?.id); } catch (e: any) { toast.error(apiErrorMessage(e)); } };
  const deleteCoupon = async (c: any) => { if (!confirm('Bu kuponu silmek istediğinize emin misiniz?')) return; try { await api.delete(`/store/catalogs/${editing?.id}/coupons/${c.id}`); loadCoupons(editing?.id); toast.success('Kupon silindi'); } catch (e: any) { toast.error(apiErrorMessage(e)); } };

  const create = async () => {
    try { const r = await api.post('/store/catalogs', { ad: 'Yeni Katalog' }); setCatalogs([r.data.catalog, ...catalogs]); openEditor(r.data.catalog); toast.success('Katalog oluşturuldu'); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (id: string) => {
    if (!confirm('Bu kataloğu silmek istediğinize emin misiniz?')) return;
    try { await api.delete(`/store/catalogs/${id}`); setCatalogs(catalogs.filter((c) => c.id !== id)); toast.success('Silindi'); setMenuOpen(null); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const toggleAktif = async (c: any) => {
    try { await api.put(`/store/catalogs/${c.id}`, { aktif: !c.aktif }); load(); setMenuOpen(null); toast.success(c.aktif ? 'Pasife alındı' : 'Aktif edildi'); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const copyLink = (slug: string) => { navigator.clipboard?.writeText(`https://diljar.com/ozel-katalog/${slug}`); toast.success('Link kopyalandı'); };
  const openStockReport = async (c: any) => {
    setStockReport({ catalog: { ad: c.ad, slug: c.slug }, rows: [], totals: null });
    setStockExpand({});
    setStockLoading(true);
    try {
      const r = await api.get(`/store/catalogs/${c.id}/stock-report`);
      setStockReport({ catalog: r.data.catalog || { ad: c.ad, slug: c.slug }, rows: r.data.rows || [], totals: r.data.totals || null });
    } catch (e: any) { toast.error(apiErrorMessage(e)); setStockReport(null); }
    finally { setStockLoading(false); }
  };
  const loadRequests = async (page = 1) => {
    try {
      const params: any = { page, limit: 20 };
      if (reqSearch) params.search = reqSearch;
      if (reqDurum) params.durum = reqDurum;
      if (reqCatalog) params.catalogId = reqCatalog;
      if (reqDateFrom) params.from = reqDateFrom;
      if (reqDateTo) params.to = reqDateTo;
      const [r, s] = await Promise.all([
        api.get('/store/catalog-requests', { params }),
        api.get('/store/catalog-settings').catch(() => ({ data: { settings: null } })),
      ]);
      setRequests(r.data.rows || []);
      setReqStats(r.data.stats || {});
      setReqTotal(r.data.total || 0);
      setReqPage(r.data.page || 1);
      if (s.data.settings) {
        setCatSettings(s.data.settings);
        setSettingsForm({
          rezervSureDk: s.data.settings.rezervSureDk || 30,
          otomatikIptal: s.data.settings.otomatikIptal ?? true,
          bildirimAktif: s.data.settings.bildirimAktif ?? true,
          hatirlatmaDk: s.data.settings.hatirlatmaDk || '10,20',
          dekontHatirlatmaDk: s.data.settings.dekontHatirlatmaDk || '5',
          siparisOnayMesaji: s.data.settings.siparisOnayMesaji || '',
          dekontIsteMesaji: s.data.settings.dekontIsteMesaji || '',
          kartOdemeMesaji: s.data.settings.kartOdemeMesaji || '',
          dekontAlindiMesaji: s.data.settings.dekontAlindiMesaji || '',
          iptalMesaji: s.data.settings.iptalMesaji || '',
          odemeOnayMesaji: s.data.settings.odemeOnayMesaji || '',
        });
      }
      setView('requests');
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  // Otomatik arama: reqSearch degisince 400ms debounce ile loadRequests(1).
  // Ilk render'i didMount ref ile atla ki gereksiz fetch olmasin.
  const reqSearchMounted = useRef(false);
  useEffect(() => {
    if (!reqSearchMounted.current) { reqSearchMounted.current = true; return; }
    const t = setTimeout(() => loadRequests(1), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqSearch]);

  // Editor helpers
  const catMap = useMemo(() => { const m = new Map(); (categories || []).forEach((c: any) => m.set(c.id, c.ad)); return m; }, [categories]);
  const markalar = useMemo(() => { const s = new Set<string>(); (products || []).forEach((p: any) => { if (p.marka) s.add(p.marka); }); return Array.from(s).sort(); }, [products]);
  const filteredProducts = useMemo(() => {
    let list = (products || []).filter((p: any) => p.aktif);
    if (q) { const ql = q.toLowerCase(); list = list.filter((p: any) => (p.ad || '').toLowerCase().includes(ql) || (p.salesCode || '').toLowerCase().includes(ql) || (p.barkod || '').toLowerCase().includes(ql) || (p.sku || '').toLowerCase().includes(ql)); }
    if (filterMarka) list = list.filter((p: any) => p.marka === filterMarka);
    if (filterKategori) list = list.filter((p: any) => p.kategoriId === filterKategori);
    if (filterCinsiyet) list = list.filter((p: any) => p.cinsiyet === filterCinsiyet);
    return list;
  }, [products, q, filterMarka, filterKategori, filterCinsiyet]);

  const addProduct = (id: string) => { if (!pids.includes(id)) setPids([...pids, id]); };
  const pidsSet = useMemo(() => new Set(pids), [pids]);
  const addAll = () => { const n = filteredProducts.map((p: any) => p.id).filter((id: string) => !pidsSet.has(id)); setPids([...pids, ...n]); toast.success(n.length + ' ürün eklendi'); };
  const removeProduct = (id: string) => setPids(pids.filter((x) => x !== id));
  // Ürün havuzu çoklu seçim + sürükle-bırak sıralama
  const [poolSel, setPoolSel] = useState<Set<string>>(new Set());
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [catView, setCatView] = useState<'list' | 'grid'>('list');
  const [catQ, setCatQ] = useState('');
  const [prodOverrides, setProdOverrides] = useState<Record<string, any>>({});
  const [editCell, setEditCell] = useState<{ id: string; field: string } | null>(null);
  const [editVal, setEditVal] = useState('');
  const [fStok, setFStok] = useState('');
  const [fMarka, setFMarka] = useState('');
  const [fBeden, setFBeden] = useState('');
  const [fCinsiyet, setFCinsiyet] = useState('');
  const [fKategori, setFKategori] = useState('');
  const togglePoolSel = (id: string) => setPoolSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const poolAddable = useMemo(() => filteredProducts.filter((p: any) => !pidsSet.has(p.id)), [filteredProducts, pidsSet]);
  const toggleSelectAllPool = () => setPoolSel((s) => { const ids = poolAddable.map((p: any) => p.id); const all = ids.every((id: string) => s.has(id)); return all ? new Set() : new Set(ids); });
  const addSelectedToCatalog = () => { const n = [...poolSel].filter((id) => !pidsSet.has(id)); if (!n.length) { toast.error('Önce ürün seçin'); return; } setPids([...pids, ...n]); setPoolSel(new Set()); toast.success(n.length + ' ürün eklendi'); };
  const moveProduct = (from: number, to: number) => { if (from === to || from < 0 || to < 0 || from >= pids.length || to >= pids.length) return; setPids((prev) => { const a = [...prev]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; }); };
  const varText = (p: any) => { const vs = (p?.variations || []).map((v: any) => v?.deger).filter(Boolean); return vs.length ? vs.slice(0, 2).join(' / ') : (p?.varyasyon || '-'); };
  const stokOf = (p: any) => Number(p?.stokAdeti ?? p?.stok ?? 0);
  const saveOnly = async () => { setSaving(true); try { await api.put(`/store/catalogs/${editing?.id}`, { ad, aktif, whatsapp, productIds: pids, kampanyalar }); toast.success('Kaydedildi'); await load(); } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setSaving(false); } };
  const addKampanya = () => { if (!kForm.kosul || !kForm.indirimDeger) { toast.error('Koşul ve indirim değeri gerekli'); return; } setKampanyalar([...kampanyalar, { ...kForm, kosul: Number(kForm.kosul), indirimDeger: Number(kForm.indirimDeger) }]); setKForm({ tip: 'adetIndirim', kosul: '', indirimTip: 'yuzde', indirimDeger: '', aciklama: '' }); };
  const removeKampanya = (i: number) => setKampanyalar(kampanyalar.filter((_, idx) => idx !== i));
  const prodMap = useMemo(() => { const m = new Map(); (products || []).forEach((p: any) => m.set(p.id, p)); return m; }, [products]);
  const prodOf = (id: string) => { const base = prodMap.get(id); if (!base) return base; const ov = prodOverrides[id]; return ov ? { ...base, ...ov } : base; };
  const saveField = async (id: string, field: string, raw: string) => {
    if ((field === 'satisFiyat' || field === 'eskiFiyat') && !canDo('fiyat-degistir')) { setEditCell(null); toast.error('Fiyat değiştirme yetkiniz yok'); return; }
    const cur = prodOf(id);
    let val: any;
    if (field === 'satisFiyat' || field === 'eskiFiyat') {
      const num = raw.trim() === '' ? null : Number(String(raw).replace(/\./g, '').replace(',', '.'));
      if (field === 'satisFiyat' && (num == null || isNaN(num))) { setEditCell(null); return; }
      val = num != null && isNaN(num) ? null : num;
    } else {
      val = String(raw).trim();
      if (!val) { setEditCell(null); return; }
    }
    setEditCell(null);
    if (cur && cur[field] === val) return;
    setProdOverrides((o) => ({ ...o, [id]: { ...(o[id] || {}), [field]: val } }));
    try { await api.patch(`/store/products/${id}`, { [field]: val }); toast.success('Güncellendi'); store.reload?.(); }
    catch (e: any) { toast.error(apiErrorMessage(e)); setProdOverrides((o) => { const n = { ...o }; if (n[id]) { const c = { ...n[id] }; delete c[field]; n[id] = c; } return n; }); }
  };
  const startEdit = (p: any, field: string) => { setEditCell({ id: p.id, field }); setEditVal(field === 'ad' ? (p.ad || '') : (p[field] != null ? String(p[field]) : '')); };
  const saveSira = (fromIdx: number, raw: string) => {
    setEditCell(null);
    const n = parseInt(String(raw).replace(/\D/g, ''), 10);
    if (!n || isNaN(n)) return;
    const to = Math.min(Math.max(n, 1), pids.length) - 1;
    if (to !== fromIdx) moveProduct(fromIdx, to);
  };
  const editInputProps = (id: string, field: string) => ({
    autoFocus: true, value: editVal,
    onChange: (e: any) => setEditVal(e.target.value),
    onBlur: () => saveField(id, field, editVal),
    onKeyDown: (e: any) => { if (e.key === 'Enter') { e.preventDefault(); saveField(id, field, editVal); } else if (e.key === 'Escape') { setEditCell(null); } },
    onMouseDown: (e: any) => e.stopPropagation(),
    onClick: (e: any) => e.stopPropagation(),
  });
  const catStats = useMemo(() => {
    let stok = 0, deger = 0; for (const id of pids) { const p = prodMap.get(id); if (!p) continue; const s = Number(p?.stokAdeti ?? p?.stok ?? 0); stok += s; deger += s * Number(p.satisFiyat || 0); }
    return { adet: pids.length, stok, deger };
  }, [pids, prodMap]);
  const save = async () => { setSaving(true); try { await api.put(`/store/catalogs/${editing?.id}`, { ad, aktif, whatsapp, productIds: pids, kampanyalar }); toast.success('Kaydedildi'); closeEditor(); } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setSaving(false); } };

  // Enhance (DB-backed)
  const allEnhanceProducts = useMemo(() => pids.map((id) => prodOf(id)).filter((p: any) => p && (p.images || [])[0]), [pids, prodMap]);
  // Filtre seçenekleri yalnızca katalogdaki ürünlerden türetilir
  const catalogProducts = useMemo(() => pids.map((id) => prodOf(id)).filter(Boolean), [pids, prodMap]);
  const bedenlerOf = (p: any) => (p?.variations || []).filter((v: any) => /beden|numara|size/i.test(v?.ad || '')).map((v: any) => String(v?.deger || '').trim()).filter(Boolean);
  const catFilterOpts = useMemo(() => {
    const marka = new Set<string>(), beden = new Set<string>(), cinsiyet = new Set<string>(), kategori = new Set<string>();
    for (const p of catalogProducts) {
      if (p.marka) marka.add(String(p.marka).trim());
      if (p.cinsiyet) cinsiyet.add(String(p.cinsiyet).trim());
      if (p.kategoriId) kategori.add(p.kategoriId);
      bedenlerOf(p).forEach((b: string) => beden.add(b));
    }
    return {
      marka: [...marka].sort((a, b) => a.localeCompare(b, 'tr')),
      beden: [...beden].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true })),
      cinsiyet: [...cinsiyet].sort((a, b) => a.localeCompare(b, 'tr')),
      kategori: [...kategori].map((id) => ({ id, ad: catMap.get(id) || id })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr')),
    };
  }, [catalogProducts, catMap]);
  const matchCatFilters = (p: any) => {
    if (catQ.trim() && !((p.ad || '') + ' ' + (p.salesCode || '')).toLowerCase().includes(catQ.trim().toLowerCase())) return false;
    if (fStok === 'var' && stokOf(p) <= 0) return false;
    if (fStok === 'yok' && stokOf(p) > 0) return false;
    if (fMarka && String(p.marka || '').trim() !== fMarka) return false;
    if (fCinsiyet && String(p.cinsiyet || '').trim() !== fCinsiyet) return false;
    if (fKategori && p.kategoriId !== fKategori) return false;
    if (fBeden && !bedenlerOf(p).includes(fBeden)) return false;
    return true;
  };
  const catFiltreAktif = !!(catQ.trim() || fStok || fMarka || fBeden || fCinsiyet || fKategori);
  const enhMarkalar = useMemo(() => Array.from(new Set(catalogProducts.map((p: any) => p.marka).filter(Boolean))).sort() as string[], [catalogProducts]);
  const enhKategoriler = useMemo(() => {
    const m = new Map<string, string>();
    catalogProducts.forEach((p: any) => { if (p.kategoriId) m.set(p.kategoriId, catMap.get(p.kategoriId) || p.kategoriId); });
    return Array.from(m, ([id, ad]) => ({ id, ad }));
  }, [catalogProducts, catMap]);
  const enhCinsiyetler = useMemo(() => Array.from(new Set(catalogProducts.map((p: any) => p.cinsiyet).filter(Boolean))) as string[], [catalogProducts]);
  const filteredEnhanceProducts = useMemo(() => {
    let list = allEnhanceProducts;
    if (enhFiltStok) list = list.filter((p: any) => (p.stokAdeti || 0) > 0);
    if (enhFiltMarka) list = list.filter((p: any) => p.marka === enhFiltMarka);
    if (enhFiltKategori) list = list.filter((p: any) => p.kategoriId === enhFiltKategori);
    if (enhFiltCinsiyet) list = list.filter((p: any) => p.cinsiyet === enhFiltCinsiyet);
    if (enhFiltAd) { const al = enhFiltAd.toLowerCase(); list = list.filter((p: any) => (p.ad || '').toLowerCase().includes(al) || (p.salesCode || '').toLowerCase().includes(al)); }
    return list;
  }, [allEnhanceProducts, enhFiltStok, enhFiltMarka, enhFiltKategori, enhFiltCinsiyet, enhFiltAd]);

  const openEnhanceSetup = () => { setEnhanceOpen(true); setEnhanceMode('setup'); setEnhanceSelected(new Set()); setEnhFiltStok(false); setEnhFiltMarka(''); setEnhFiltKategori(''); setEnhFiltCinsiyet(''); setEnhFiltAd(''); setEnhRefImage(null); loadPromptPresets(); };
  const openEnhanceReview = async () => { setEnhanceOpen(true); setEnhanceMode('review'); await loadEnhJobs(); };
  const toggleEnhanceSelect = (id: string) => { const s = new Set(enhanceSelected); if (s.has(id)) s.delete(id); else s.add(id); setEnhanceSelected(s); };
  const loadEnhJobs = async () => { try { const r = await api.get('/store/enhance-jobs', { params: { catalogId: editing?.id } }); setEnhanceJobs(r.data.rows || []); } catch {} };
  const startEnhance = async (ids: string[]) => { if (ids.length === 0) { toast.error('En az 1 ürün seçin'); return; } setEnhStarting(true); try { const r = await api.post(`/store/catalogs/${editing?.id}/enhance-start`, { productIds: ids, prompt: enhancePrompt || null, referenceImage: enhRefImage || null }); toast.success(`${r.data.created} ürün kuyruğa eklendi`); setEnhanceMode('review'); await loadEnhJobs(); } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setEnhStarting(false); } };
  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setEnhRefImage(reader.result as string); reader.readAsDataURL(file); };
  const approveJob = async (id: string) => {
    const pick = enhPick[id];
    const body = pick && pick.selected.length > 0 ? { selected: pick.selected, cover: pick.cover || pick.selected[0] } : {};
    try { await api.post(`/store/enhance-jobs/${id}/approve`, body); toast.success('Onaylandı'); await loadEnhJobs(); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  // Varyant seç/kaldır
  const togglePick = (jobId: string, url: string) => {
    setEnhPick((prev) => {
      const cur = prev[jobId] || { selected: [], cover: '' };
      const has = cur.selected.includes(url);
      const selected = has ? cur.selected.filter((u) => u !== url) : [...cur.selected, url];
      let cover = cur.cover;
      if (has && cover === url) cover = selected[0] || '';
      if (!has && !cover) cover = url;
      return { ...prev, [jobId]: { selected, cover } };
    });
  };
  // Kapak işaretle (seçili değilse otomatik seç)
  const setCover = (jobId: string, url: string) => {
    setEnhPick((prev) => {
      const cur = prev[jobId] || { selected: [], cover: '' };
      const selected = cur.selected.includes(url) ? cur.selected : [...cur.selected, url];
      return { ...prev, [jobId]: { selected, cover: url } };
    });
  };
  // Prompt kütüphanesi
  const loadPromptPresets = async () => { try { const r = await api.get('/store/enhance-prompts'); setPromptPresets(r.data.rows || []); } catch {} };
  const savePromptPreset = async () => {
    const prompt = (enhancePrompt || '').trim();
    if (!prompt) { toast.error('Önce prompt yazın'); return; }
    const baslik = window.prompt('Prompt için bir başlık girin:', prompt.slice(0, 40));
    if (baslik === null) return;
    setSavingPreset(true);
    try { await api.post('/store/enhance-prompts', { baslik, prompt }); toast.success('Prompt kaydedildi'); await loadPromptPresets(); } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setSavingPreset(false); }
  };
  const deletePromptPreset = async (id: string) => { try { await api.delete(`/store/enhance-prompts/${id}`); await loadPromptPresets(); } catch (e: any) { toast.error(apiErrorMessage(e)); } };
  const usePromptPreset = (pr: any) => { setEnhancePrompt(pr.prompt); api.post(`/store/enhance-prompts/${pr.id}/use`).catch(() => {}); };
  const rejectJob = async (id: string) => { try { await api.post(`/store/enhance-jobs/${id}/reject`); toast.success('Reddedildi'); await loadEnhJobs(); } catch (e: any) { toast.error(apiErrorMessage(e)); } };
  const retryJob = async (id: string) => { try { await api.post(`/store/enhance-jobs/${id}/retry`, { prompt: enhRetryPrompt || undefined }); toast.success('Tekrar kuyruğa eklendi'); setEnhRetryId(null); setEnhRetryPrompt(''); await loadEnhJobs(); } catch (e: any) { toast.error(apiErrorMessage(e)); } };
  const toggleEnhSel = (id: string) => setEnhSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const cancelJob = async (id: string) => { try { await api.post(`/store/enhance-jobs/${id}/cancel`); toast.success('İptal edildi'); setEnhSel((s) => { const n = new Set(s); n.delete(id); return n; }); await loadEnhJobs(); } catch (e: any) { toast.error(apiErrorMessage(e)); } };
  const cancelSelectedJobs = async () => {
    const ids = [...enhSel];
    if (!ids.length) { toast.error('İptal edilecek işlem seçin'); return; }
    if (!confirm(`${ids.length} bekleyen işlem iptal edilsin mi?`)) return;
    try { const r = await api.post('/store/enhance-jobs/cancel', { ids }); toast.success(`${r.data?.cancelled ?? ids.length} işlem iptal edildi`); setEnhSel(new Set()); await loadEnhJobs(); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  const updateDurum = async (id: string, durum: string) => { try { await api.patch(`/store/catalog-requests/${id}`, { durum }); setRequests(requests.map((r) => r.id === id ? { ...r, durum, ...(durum === 'iptal' ? { iptalZamani: new Date().toISOString(), iptalSebebi: 'manual' } : {}), ...(durum === 'tamamlandi' ? { odemeTarihi: new Date().toISOString() } : {}) } : r)); toast.success('Güncellendi'); } catch (e: any) { toast.error(apiErrorMessage(e)); } };

  const manualTrigger = async (id: string) => {
    if (!confirm('Bu talebi manuel olarak siparişe dönüştürmek istediğinize emin misiniz?\n\nRezervasyonu başlatacak, stoktan düşecek ve müşteriye sipariş bildirimi gönderilecek.')) return;
    try {
      const r = await api.post(`/store/catalog-requests/${id}/manual-trigger`);
      setRequests(requests.map((req) => req.id === id ? { ...req, ...r.data.request } : req));
      toast.success('Sipariş oluşturuldu, rezerv başlatıldı');
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  const [paymentOpen, setPaymentOpen] = useState<any>(null);
  const [paymentForm, setPaymentForm] = useState({ tahsilatLinki: '' });
  const [paymentSaving, setPaymentSaving] = useState(false);

  const openPayment = (r: any) => { setPaymentForm({ tahsilatLinki: r.tahsilatLinki || '' }); setPaymentOpen(r); };

  const submitPayment = async () => {
    if (!paymentOpen) return;
    const link = (paymentForm.tahsilatLinki || '').trim();
    // K.kartı ile ödeme yapıldıysa tahsilat linki zorunlu
    if (paymentOpen.kartOdeme && !link) { toast.error('Kredi kartı ödemesi için tahsilat linki zorunludur'); return; }
    setPaymentSaving(true);
    try {
      const payable = (paymentOpen.toplam || 0) - (paymentOpen.indirim || 0);
      const res = await api.patch(`/store/catalog-requests/${paymentOpen.id}`, {
        tahsilatLinki: link || undefined,
        tahsilat: payable,
        odemeYontemi: paymentOpen.kartOdeme ? 'Kredi Kartı' : (paymentOpen.odemeYontemi || 'Havale'),
      });
      setRequests(requests.map((r) => r.id === paymentOpen.id ? { ...r, ...res.data.request } : r));
      toast.success('Ödeme bulundu ve kaydedildi');
      setPaymentOpen(null);
      setDetailReq(null);
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setPaymentSaving(false); }
  };

  const toggleTimer = async (id: string, action: 'stop' | 'start') => {
    try {
      const res = await api.patch(`/store/catalog-requests/${id}/timer`, { action, dakika: catSettings?.rezervSureDk || 30 });
      setRequests(requests.map((r) => r.id === id ? { ...r, ...res.data.request } : r));
      toast.success(action === 'stop' ? 'Sayaç durduruldu' : 'Sayaç yeniden başlatıldı');
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try { await api.put('/store/catalog-settings', settingsForm); toast.success('Ayarlar kaydedildi'); setSettingsOpen(false); } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setSettingsSaving(false); }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const fmtDateTime = (d: string) => `${fmtDate(d)} - ${fmtTime(d)}`;

  const ReservTimer = ({ bitis }: { bitis: string | null }) => {
    const [remaining, setRemaining] = useState('');
    const [pct, setPct] = useState(100);
    useEffect(() => {
      if (!bitis) return;
      const calc = () => {
        const diff = new Date(bitis).getTime() - Date.now();
        if (diff <= 0) { setRemaining('00:00'); setPct(0); return; }
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setRemaining(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        const total = (catSettings?.rezervSureDk || 30) * 60000;
        setPct(Math.max(0, Math.min(100, (diff / total) * 100)));
      };
      calc();
      const iv = setInterval(calc, 1000);
      return () => clearInterval(iv);
    }, [bitis]);
    if (!bitis) return null;
    const color = pct > 50 ? 'text-emerald-600' : pct > 20 ? 'text-amber-600' : 'text-rose-600';
    const barColor = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-rose-500';
    return (
      <div className="text-center">
        <p className="text-[10px] text-slate-400">Kalan Süre</p>
        <p className={`text-sm font-bold ${color}`}>{remaining}</p>
        <div className="w-16 h-1 bg-slate-200 rounded-full mt-1 mx-auto"><div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} /></div>
      </div>
    );
  };

  const durumBadge = (d: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      beklemede: { label: 'WP Bekleniyor', cls: 'bg-slate-50 text-slate-600' },
      rezervde: { label: 'Rezervde', cls: 'bg-blue-50 text-blue-700' },
      odeme_bekliyor: { label: 'Ödeme Bekliyor', cls: 'bg-amber-50 text-amber-700' },
      tamamlandi: { label: 'Tamamlandı', cls: 'bg-emerald-50 text-emerald-700' },
      iptal: { label: 'İptal Edildi', cls: 'bg-rose-50 text-rose-600' },
      bekliyor: { label: 'Bekliyor', cls: 'bg-amber-50 text-amber-700' },
      onaylandi: { label: 'Onaylandı', cls: 'bg-emerald-50 text-emerald-700' },
    };
    const m = map[d] || { label: d, cls: 'bg-slate-100 text-slate-600' };
    return <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${m.cls}`}>{m.label}</span>;
  };

  const reqTotalPages = Math.ceil(reqTotal / 20);

  // List view: filter & sort
  const filteredCatalogs = useMemo(() => {
    let list = catalogs;
    if (searchQ) { const ql = searchQ.toLowerCase(); list = list.filter((c) => (c.ad || '').toLowerCase().includes(ql)); }
    if (durumFilter === 'aktif') list = list.filter((c) => c.aktif);
    else if (durumFilter === 'pasif') list = list.filter((c) => !c.aktif);
    if (sortBy === 'ad') list = [...list].sort((a, b) => (a.ad || '').localeCompare(b.ad || ''));
    else if (sortBy === 'ciro') list = [...list].sort((a, b) => (stats[b.id]?.ciro || 0) - (stats[a.id]?.ciro || 0));
    else if (sortBy === 'siparis') list = [...list].sort((a, b) => (stats[b.id]?.siparis || 0) - (stats[a.id]?.siparis || 0));
    else list = [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }, [catalogs, searchQ, durumFilter, sortBy, stats]);

  // Totals
  const totalProducts = catalogs.reduce((s, c) => s + (Array.isArray(c.productIds) ? c.productIds.length : 0), 0);
  const totalViews = Object.values(stats).reduce((s: number, st: any) => s + (st?.goruntulenme || 0), 0);
  const totalOrders = Object.values(stats).reduce((s: number, st: any) => s + (st?.siparis || 0), 0);
  const totalCiro = Object.values(stats).reduce((s: number, st: any) => s + (st?.ciro || 0), 0);
  const totalViews30 = Object.values(stats).reduce((s: number, st: any) => s + (st?.goruntulenme30 || 0), 0);
  const totalViews30Prev = Object.values(stats).reduce((s: number, st: any) => s + (st?.goruntulenme30Prev || 0), 0);
  const totalOrders30 = Object.values(stats).reduce((s: number, st: any) => s + (st?.siparis30 || 0), 0);
  const totalOrders30Prev = Object.values(stats).reduce((s: number, st: any) => s + (st?.siparis30Prev || 0), 0);
  const totalCiro30 = Object.values(stats).reduce((s: number, st: any) => s + (st?.ciro30 || 0), 0);
  const totalCiro30Prev = Object.values(stats).reduce((s: number, st: any) => s + (st?.ciro30Prev || 0), 0);

  const getCatalogImage = (c: any) => {
    const ids: string[] = Array.isArray(c.productIds) ? c.productIds : [];
    for (const id of ids.slice(0, 5)) {
      const p = prodOf(id);
      if (p && (p.images || [])[0]) return p.images[0];
    }
    return null;
  };

  const PctBadge = ({ val }: { val: number }) => (
    <span className={`text-[10px] font-medium ${val > 0 ? 'text-emerald-600' : val < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
      {val > 0 ? '↑' : val < 0 ? '↓' : ''} {Math.abs(val)}%
    </span>
  );

  // ═══ CANLI İZLEME VIEW ═══
  if (view === 'canli') return <CanliIzleme onBack={() => setView('list')} />;

  // ═══ REQUESTS VIEW ═══
  if (view === 'requests') return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Katalog Talepleri</h1>
          <p className="text-sm text-slate-400">Katalog üzerinden gelen talepleri yönetin. Ödeme gelmezse ürün otomatik iptal edilir.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSettingsOpen(true)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"><SlidersHorizontal size={15} /> Ayarlar</button>
          <button onClick={() => loadRequests(1)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 inline-flex items-center gap-1.5"><TrendingUp size={15} /> Yenile</button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[
          { label: 'Toplam Talepler', value: String(reqStats.toplam || 0), sub: `Bugün +${reqStats.bugun || 0}`, color: 'text-slate-600 border-slate-200 bg-slate-50/50' },
          { label: 'WP Bekleniyor', value: String(reqStats.beklemede || 0), sub: `Toplam değer ${fmtPK(reqStats.beklemedeTutar || 0)}`, color: 'text-gray-600 border-gray-200 bg-gray-50/50' },
          { label: 'Rezervde', value: String(reqStats.rezervde || 0), sub: `Toplam değer ${fmtPK(reqStats.rezervdeTutar || 0)}`, color: 'text-blue-600 border-blue-200 bg-blue-50/50' },
          { label: 'Ödeme Bekleyen', value: String(reqStats.odemeBekleyen || 0), sub: `Toplam değer ${fmtPK(reqStats.odemeBekleyenTutar || 0)}`, color: 'text-amber-600 border-amber-200 bg-amber-50/50' },
          { label: 'Tamamlanan', value: String(reqStats.tamamlanan || 0), sub: `Toplam değer ${fmtPK(reqStats.tamamlananTutar || 0)}`, color: 'text-emerald-600 border-emerald-200 bg-emerald-50/50' },
          { label: 'İptal Edilen', value: String(reqStats.iptal || 0), sub: `Toplam değer ${fmtPK(reqStats.iptalTutar || 0)}`, color: 'text-rose-600 border-rose-200 bg-rose-50/50' },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl border px-3 py-2.5 ${s.color}`}>
            <p className="text-[10px] font-medium opacity-70">{s.label}</p>
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-[10px] opacity-60">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-slate-200 p-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={reqSearch} onChange={(e) => setReqSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadRequests(1)} placeholder="Talep no, müşteri adı, ürün ara..." className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none" />
        </div>
        <select value={reqDurum} onChange={(e) => { setReqDurum(e.target.value); setTimeout(() => loadRequests(1), 0); }} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2">
          <option value="">Tümü</option><option value="beklemede">WP Bekleniyor</option><option value="rezervde">Rezervde</option><option value="odeme_bekliyor">Ödeme Bekleyen</option><option value="tamamlandi">Tamamlanan</option><option value="iptal">İptal</option>
        </select>
        <select value={reqCatalog} onChange={(e) => { setReqCatalog(e.target.value); setTimeout(() => loadRequests(1), 0); }} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2">
          <option value="">Tüm Kataloglar</option>{catalogs.map(c => <option key={c.id} value={c.id}>{c.ad}</option>)}
        </select>
        <input type="date" value={reqDateFrom} onChange={(e) => setReqDateFrom(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-2" />
        <span className="text-xs text-slate-400">-</span>
        <input type="date" value={reqDateTo} onChange={(e) => setReqDateTo(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-2" />
        <button onClick={() => loadRequests(1)} className="px-3 py-2 text-xs bg-slate-800 text-white rounded-lg">Ara</button>
        {(reqSearch || reqDurum || reqCatalog || reqDateFrom || reqDateTo) && <button onClick={() => { setReqSearch(''); setReqDurum(''); setReqCatalog(''); setReqDateFrom(''); setReqDateTo(''); setTimeout(() => loadRequests(1), 0); }} className="px-2.5 py-2 text-xs border border-rose-200 text-rose-500 rounded-lg inline-flex items-center gap-1"><X size={13} /> Temizle</button>}
        <div className="flex gap-0.5 ml-auto">
          <button onClick={() => setReqListMode('list')} className={`p-2 rounded-lg border ${reqListMode === 'list' ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-400'}`}><List size={15} /></button>
          <button onClick={() => setReqListMode('grid')} className={`p-2 rounded-lg border ${reqListMode === 'grid' ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-400'}`}><LayoutGrid size={15} /></button>
        </div>
      </div>

      {/* Table */}
      {requests.length === 0 ? <p className="text-center text-slate-400 py-12">Henüz talep yok</p> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-[10px] text-slate-500 uppercase tracking-wider"><tr>
              <th className="px-3 py-2.5 text-left">Talep</th>
              <th className="px-3 py-2.5 text-left">Sepet Detayı</th>
              <th className="px-3 py-2.5 text-center">Durum</th>
              <th className="px-3 py-2.5 text-center">Rezerv Süresi</th>
              <th className="px-3 py-2.5 text-right">Tutar</th>
              <th className="px-3 py-2.5 text-center">İşlemler</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{requests.map((r: any) => {
              const items: any[] = Array.isArray(r.items) ? r.items : [];
              const maxShow = 2;
              const shownItems = items.slice(0, maxShow);
              const extraCount = items.length - maxShow;
              return (
                <tr key={r.id} className="hover:bg-slate-50/50 group">
                  <td className="px-3 py-3">
                    <p className="font-mono font-bold text-violet-700 text-sm">{r.talepNo}</p>
                    <p className="text-[10px] text-slate-400">{fmtDateTime(r.createdAt)}</p>
                    {r.sepetSipNo && <p className="text-[10px] text-slate-500 font-mono">Sipariş: {r.sepetSipNo}</p>}
                    {r.musteri && <p className="text-[10px] text-slate-500 mt-0.5">{r.musteri}</p>}
                    {r.customer?.instagram && <p className="text-[10px] text-pink-500">@{r.customer.instagram}</p>}
                    <div className="flex items-center gap-1 mt-0.5">
                      {r.wpIletildi ? <span className="text-[9px] bg-green-100 text-green-700 px-1 py-0.5 rounded font-medium">WP İletildi</span> : <span className="text-[9px] bg-slate-100 text-slate-400 px-1 py-0.5 rounded">WP Bekliyor</span>}
                      {r.dekontAlindi && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-medium">Dekont Alındı</span>}
                      {r.kartOdeme && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-medium">K.Kartı</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-xs font-medium text-slate-700">{items.length} ürün</p>
                    {shownItems.map((it: any, idx: number) => (
                      <p key={idx} className="text-[11px] text-slate-500 truncate max-w-[300px]">{it.adet || 1} x {it.ad || it.urunAd || '-'}</p>
                    ))}
                    {extraCount > 0 && <p className="text-[10px] text-blue-500">+{extraCount} ürün daha</p>}
                  </td>
                  <td className="px-3 py-3 text-center">{durumBadge(r.durum)}</td>
                  <td className="px-3 py-3">
                    {r.durum === 'beklemede' ? (
                      <div className="text-center"><p className="text-[10px] text-slate-500 font-medium">WP mesajı bekleniyor</p><p className="text-[10px] text-slate-400">{fmtDateTime(r.createdAt)}</p><button onClick={() => manualTrigger(r.id)} className="mt-1.5 px-2.5 py-1 text-[10px] bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 transition-colors">Siparişi Oluştur</button></div>
                    ) : r.kartOdeme ? (
                      <div className="text-center"><p className="text-[10px] text-amber-600 font-semibold">Sayaç Durdu</p><p className="text-[10px] text-slate-400">K.Kartı Bekleniyor</p></div>
                    ) : (r.durum === 'rezervde' || r.durum === 'odeme_bekliyor') && r.rezervBitis ? (
                      <ReservTimer bitis={r.rezervBitis} />
                    ) : r.durum === 'tamamlandi' ? (
                      <div className="text-center"><p className="text-[10px] text-slate-400">Tamamlandı</p><p className="text-[10px] text-slate-500">{fmtDateTime(r.updatedAt || r.createdAt)}</p></div>
                    ) : r.durum === 'iptal' ? (
                      <div className="text-center"><p className="text-[10px] text-slate-400">İptal Zamanı</p><p className="text-[10px] text-slate-500">{r.iptalZamani ? fmtDateTime(r.iptalZamani) : '-'}</p></div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-semibold text-slate-800">{fmtP(r.toplam || 0)}</p>
                    {r.tahsilat > 0 && <p className="text-[10px] text-emerald-600 font-medium">Tahsilat: {fmtP(r.tahsilat)}</p>}
                    {r.tahsilat > 0 && r.tahsilat < (r.toplam - (r.indirim || 0)) && <p className="text-[10px] text-amber-500">Kalan: {fmtP((r.toplam - (r.indirim || 0)) - r.tahsilat)}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {r.telefon && <button onClick={() => openChat(String(r.telefon).replace(/\D/g, ''), r.musteri || '')} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="Sohbet Aç"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.644-1.217A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-2.168 0-4.19-.573-5.945-1.575l-.427-.253-2.755.722.735-2.686-.278-.443A9.777 9.777 0 012.182 12c0-5.422 4.396-9.818 9.818-9.818S21.818 6.578 21.818 12 17.422 21.818 12 21.818z"/></svg></button>}
                      {r.telefon && <button onClick={() => navigate(`/whatsapp?phone=${encodeURIComponent(String(r.telefon).replace(/\D/g, ''))}`)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500" title="WP Paneline Git"><ExternalLink size={14} /></button>}
                      <button onClick={() => setDetailReq(r)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title="Detay"><Eye size={14} /></button>
                      {r.sepetToken && <button onClick={() => window.open(`/sepet/${r.sepetToken}`, '_blank')} className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-500" title="Sepet Detayı"><ExternalLink size={14} /></button>}
                      {(r.durum === 'rezervde' || r.durum === 'odeme_bekliyor' || r.durum === 'bekliyor') && <>
                        <button onClick={() => openPayment(r)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600" title="Ödeme Bul"><Check size={14} /></button>
                        {r.kartOdeme ? (
                          <button onClick={() => toggleTimer(r.id, 'start')} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="Sayacı Başlat"><Clock size={14} /></button>
                        ) : (
                          <button onClick={() => toggleTimer(r.id, 'stop')} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500" title="Sayacı Durdur"><Pause size={14} /></button>
                        )}
                        <button onClick={() => updateDurum(r.id, 'iptal')} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500" title="İptal"><X size={14} /></button>
                      </>}
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
          {/* Pagination */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 text-xs text-slate-400">
            <span>{reqTotal} kayıttan {((reqPage - 1) * 20) + 1} - {Math.min(reqPage * 20, reqTotal)} arası gösteriliyor</span>
            <div className="flex gap-1">
              <button disabled={reqPage <= 1} onClick={() => loadRequests(reqPage - 1)} className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-30">&lt;</button>
              {Array.from({ length: Math.min(5, reqTotalPages) }, (_, i) => {
                const p = reqPage <= 3 ? i + 1 : reqPage + i - 2;
                if (p < 1 || p > reqTotalPages) return null;
                return <button key={p} onClick={() => loadRequests(p)} className={`px-2.5 py-1 rounded border ${p === reqPage ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 hover:bg-slate-50'}`}>{p}</button>;
              })}
              {reqTotalPages > 5 && <span className="px-1 py-1">...</span>}
              {reqTotalPages > 5 && <button onClick={() => loadRequests(reqTotalPages)} className={`px-2.5 py-1 rounded border ${reqPage === reqTotalPages ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 hover:bg-slate-50'}`}>{reqTotalPages}</button>}
              <button disabled={reqPage >= reqTotalPages} onClick={() => loadRequests(reqPage + 1)} className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-30">&gt;</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Bar */}
      <div className="bg-slate-800 rounded-xl p-3 flex items-center gap-4 flex-wrap text-white">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center shrink-0"><SlidersHorizontal size={16} /></div>
          <div><p className="text-xs font-semibold">Rezerv Süresi Ayarları</p><p className="text-[10px] text-slate-400">Varsayılan rezerv süresi {catSettings?.rezervSureDk || 30} dakika olarak ayarlanmıştır.</p></div>
          <button onClick={() => setSettingsOpen(true)} className="ml-2 px-3 py-1 text-[10px] bg-violet-600 rounded-lg hover:bg-violet-700">Düzenle</button>
        </div>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 bg-sky-600 rounded-lg flex items-center justify-center shrink-0"><Package size={16} /></div>
          <div><p className="text-xs font-semibold">Otomatik İptal</p><p className="text-[10px] text-slate-400">Süre dolduğunda ödeme yapılmazsa ürün otomatik iptal edilir.</p></div>
          <span className={`ml-2 px-2 py-0.5 text-[10px] rounded-full font-medium ${catSettings?.otomatikIptal !== false ? 'bg-emerald-600' : 'bg-slate-600'}`}>{catSettings?.otomatikIptal !== false ? 'Aktif' : 'Pasif'}</span>
        </div>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center shrink-0"><TrendingUp size={16} /></div>
          <div><p className="text-xs font-semibold">Bildirimler</p><p className="text-[10px] text-slate-400">Müşteriye rezerv ve iptal bildirimleri otomatik gönderilir.</p></div>
          <span className={`ml-2 px-2 py-0.5 text-[10px] rounded-full font-medium ${catSettings?.bildirimAktif !== false ? 'bg-emerald-600' : 'bg-slate-600'}`}>{catSettings?.bildirimAktif !== false ? 'Aktif' : 'Pasif'}</span>
        </div>
      </div>

      {/* Back button */}
      <button onClick={() => setView('list')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"><ChevronLeft size={16} /> Kataloglarıma Dön</button>

      {/* Detail Modal */}
      {detailReq && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setDetailReq(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">Talep Detayı</h2>
              <button onClick={() => setDetailReq(null)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-xs text-slate-400">Talep No</span><span className="font-mono font-bold text-violet-700">{detailReq.talepNo}</span></div>
              <div className="flex justify-between"><span className="text-xs text-slate-400">Müşteri</span><span className="text-sm">{detailReq.musteri || '-'}</span></div>
              {detailReq.customer?.instagram && <div className="flex justify-between"><span className="text-xs text-slate-400">Instagram</span><span className="text-sm text-pink-600">@{detailReq.customer.instagram}</span></div>}
              <div className="flex justify-between items-center"><span className="text-xs text-slate-400">Telefon</span><div className="flex items-center gap-2"><span className="text-sm">{detailReq.telefon || '-'}</span>{detailReq.telefon && <><button onClick={() => openChat(String(detailReq.telefon).replace(/\D/g, ''), detailReq.musteri || '')} className="p-1 rounded hover:bg-green-50 text-green-600" title="Sohbet Aç"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.644-1.217A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-2.168 0-4.19-.573-5.945-1.575l-.427-.253-2.755.722.735-2.686-.278-.443A9.777 9.777 0 012.182 12c0-5.422 4.396-9.818 9.818-9.818S21.818 6.578 21.818 12 17.422 21.818 12 21.818z"/></svg></button><button onClick={() => navigate(`/whatsapp?phone=${encodeURIComponent(String(detailReq.telefon).replace(/\D/g, ''))}`)} className="p-1 rounded hover:bg-blue-50 text-blue-500" title="WP Paneline Git"><ExternalLink size={13} /></button></>}</div></div>
              <div className="flex justify-between"><span className="text-xs text-slate-400">Durum</span>{durumBadge(detailReq.durum)}</div>
              <div className="flex justify-between"><span className="text-xs text-slate-400">Oluşturulma</span><span className="text-sm">{fmtDateTime(detailReq.createdAt)}</span></div>

              {/* WhatsApp & Dekont Durumu */}
              <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase">İletişim Durumu</h3>
                <div className="flex justify-between"><span className="text-xs text-slate-400">WhatsApp</span>{detailReq.wpIletildi ? <span className="text-xs text-green-600 font-medium">Iletildi</span> : <span className="text-xs text-slate-400">Bekliyor</span>}</div>
                <div className="flex justify-between"><span className="text-xs text-slate-400">Dekont</span>{detailReq.dekontAlindi ? <span className="text-xs text-blue-600 font-medium">Alındı ({fmtDateTime(detailReq.dekontZamani)})</span> : <span className="text-xs text-slate-400">Bekleniyor</span>}</div>
                {detailReq.kartOdeme && <div className="flex justify-between"><span className="text-xs text-slate-400">K.Kartı</span><span className="text-xs text-amber-600 font-medium">Talep Edildi - Sayaç Durdu</span></div>}
                {detailReq.sepetSipNo && <div className="flex justify-between"><span className="text-xs text-slate-400">Sipariş No</span><span className="text-xs font-mono font-bold text-slate-700">{detailReq.sepetSipNo}</span></div>}
                {detailReq.sepetToken && (
                  <a href={`/sepet/${detailReq.sepetToken}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-violet-600 hover:underline mt-1"><ExternalLink size={12} /> Sepet Detayını Görüntüle</a>
                )}
              </div>

              {detailReq.kuponKodu && <div className="flex justify-between"><span className="text-xs text-slate-400">Kupon</span><span className="text-sm font-mono">{detailReq.kuponKodu}</span></div>}
              <div className="flex justify-between"><span className="text-xs text-slate-400">İndirim</span><span className="text-sm text-green-600">{fmtP(detailReq.indirim || 0)}</span></div>
              <div className="flex justify-between"><span className="text-xs text-slate-400">Toplam</span><span className="text-lg font-bold">{fmtP(detailReq.toplam || 0)}</span></div>
              {/* Ödeme Bilgisi */}
              {(detailReq.tahsilat > 0 || detailReq.odemeTarihi || detailReq.tahsilatLinki) && (
                <div className="bg-emerald-50 rounded-xl p-3 space-y-1.5">
                  <h3 className="text-xs font-semibold text-emerald-700 uppercase flex items-center gap-1"><Check size={12} /> Ödeme Bilgisi</h3>
                  <div className="flex justify-between"><span className="text-xs text-emerald-600">Tahsilat</span><span className="text-sm font-bold text-emerald-700">{fmtP(detailReq.tahsilat || 0)}</span></div>
                  {detailReq.odemeYontemi && <div className="flex justify-between"><span className="text-xs text-emerald-600">Ödeme Yöntemi</span><span className="text-sm">{detailReq.odemeYontemi}</span></div>}
                  {detailReq.odemeTarihi && <div className="flex justify-between"><span className="text-xs text-emerald-600">Ödeme Tarihi</span><span className="text-sm">{fmtDateTime(detailReq.odemeTarihi)}</span></div>}
                  {detailReq.odemeNotu && <div className="flex justify-between"><span className="text-xs text-emerald-600">Not</span><span className="text-sm">{detailReq.odemeNotu}</span></div>}
                  {detailReq.tahsilatLinki && (
                    <div className="flex justify-between items-center gap-2 pt-1 border-t border-emerald-200">
                      <span className="text-xs text-emerald-600 flex items-center gap-1"><Link2 size={12} /> Tahsilat Linki</span>
                      <a href={detailReq.tahsilatLinki} target="_blank" rel="noreferrer" className="text-xs font-medium text-violet-600 hover:underline truncate max-w-[180px]">{detailReq.tahsilatLinki}</a>
                    </div>
                  )}
                  {detailReq.tahsilat < (detailReq.toplam - (detailReq.indirim || 0)) && (
                    <div className="flex justify-between pt-1 border-t border-emerald-200"><span className="text-xs text-amber-600 font-medium">Kalan</span><span className="text-sm font-bold text-amber-600">{fmtP((detailReq.toplam - (detailReq.indirim || 0)) - (detailReq.tahsilat || 0))}</span></div>
                  )}
                </div>
              )}
              <hr />
              <h3 className="text-xs font-semibold text-slate-500 uppercase">Ürünler</h3>
              {(Array.isArray(detailReq.items) ? detailReq.items : []).map((it: any, i: number) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <div className="flex-1"><p className="text-sm text-slate-800">{it.ad || it.urunAd || '-'}</p><p className="text-[10px] text-slate-400">{it.varyasyon || it.beden || ''} · {it.salesCode || ''}</p></div>
                  <span className="text-xs text-slate-500">{it.adet || 1} x {fmtP(it.fiyat || 0)}</span>
                </div>
              ))}
              {detailReq.durum === 'beklemede' && (
                <div className="space-y-2 pt-3">
                  <button onClick={() => { manualTrigger(detailReq.id); setDetailReq(null); }} className="w-full py-2.5 text-sm bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 flex items-center justify-center gap-2"><Package size={16} /> Siparişi Oluştur</button>
                  <button onClick={() => { updateDurum(detailReq.id, 'iptal'); setDetailReq(null); }} className="w-full py-2 text-xs bg-rose-100 text-rose-600 rounded-lg font-medium">İptal Et</button>
                </div>
              )}
              {(detailReq.durum === 'rezervde' || detailReq.durum === 'odeme_bekliyor' || detailReq.durum === 'bekliyor') && (
                <div className="space-y-2 pt-3">
                  <button onClick={() => openPayment(detailReq)} className="w-full py-2.5 text-sm bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2"><Check size={16} /> Ödeme Bul</button>
                  <div className="flex gap-2">
                    {detailReq.kartOdeme ? (
                      <button onClick={() => { toggleTimer(detailReq.id, 'start'); setDetailReq(null); }} className="flex-1 py-2 text-xs bg-green-100 text-green-700 rounded-lg font-medium flex items-center justify-center gap-1"><Clock size={12} /> Sayacı Başlat</button>
                    ) : (
                      <button onClick={() => { toggleTimer(detailReq.id, 'stop'); setDetailReq(null); }} className="flex-1 py-2 text-xs bg-amber-100 text-amber-700 rounded-lg font-medium flex items-center justify-center gap-1"><Pause size={12} /> Sayacı Durdur</button>
                    )}
                    <button onClick={() => { updateDurum(detailReq.id, 'iptal'); setDetailReq(null); }} className="flex-1 py-2 text-xs bg-rose-100 text-rose-600 rounded-lg font-medium">İptal Et</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setSettingsOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">Katalog Talep Ayarları</h2>
              <button onClick={() => setSettingsOpen(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Rezerv Süresi (dakika)</label>
                <input type="number" value={settingsForm.rezervSureDk} onChange={(e) => setSettingsForm({ ...settingsForm, rezervSureDk: Number(e.target.value) })} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <p className="text-[10px] text-slate-400 mt-1">Sipariş oluşturulduktan sonra ürünler bu süre boyunca müşteri için rezerve edilir.</p>
              </div>
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-slate-700">Otomatik İptal</p><p className="text-[10px] text-slate-400">Süre dolunca ödeme yapılmamışsa otomatik iptal et</p></div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settingsForm.otomatikIptal} onChange={(e) => setSettingsForm({ ...settingsForm, otomatikIptal: e.target.checked })} className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-slate-700">WhatsApp Bildirimleri</p><p className="text-[10px] text-slate-400">Sipariş, hatırlatma ve iptal bildirimleri gönder</p></div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settingsForm.bildirimAktif} onChange={(e) => setSettingsForm({ ...settingsForm, bildirimAktif: e.target.checked })} className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Ödeme Hatırlatma Zamanları (dakika, virgülle ayırın)</label>
                <input value={settingsForm.hatirlatmaDk} onChange={(e) => setSettingsForm({ ...settingsForm, hatirlatmaDk: e.target.value })} placeholder="10,20" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <p className="text-[10px] text-slate-400 mt-1">Örn: "10,20" → Sipariş sonrası 10. ve 20. dakikada hatırlatma gönderilir.</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Dekont Hatırlatma Zamanları (dakika, virgülle ayırın)</label>
                <input value={settingsForm.dekontHatirlatmaDk || '5'} onChange={(e) => setSettingsForm({ ...settingsForm, dekontHatirlatmaDk: e.target.value })} placeholder="5" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <p className="text-[10px] text-slate-400 mt-1">WhatsApp ile iletildikten sonra dekont gelmezse hatırlatma gönderilir.</p>
              </div>

              <hr className="border-slate-200" />
              <h3 className="text-sm font-semibold text-slate-700">Mesaj Şablonları</h3>
              <p className="text-[10px] text-slate-400">Kullanılabilir değişkenler: {'{talepNo}'} {'{sipNo}'} {'{musteri}'} {'{araToplam}'} {'{indirim}'} {'{toplam}'} {'{urunler}'} {'{kalanDk}'} {'{sepetLink}'}</p>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Sipariş Onay Mesajı</label>
                <textarea rows={4} value={settingsForm.siparisOnayMesaji || ''} onChange={(e) => setSettingsForm({ ...settingsForm, siparisOnayMesaji: e.target.value })} placeholder="Boş bırakılırsa varsayılan mesaj kullanılır" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Dekont Hatırlatma Mesajı</label>
                <textarea rows={3} value={settingsForm.dekontIsteMesaji || ''} onChange={(e) => setSettingsForm({ ...settingsForm, dekontIsteMesaji: e.target.value })} placeholder="Boş bırakılırsa varsayılan mesaj kullanılır" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Kredi Kartı Yanıt Mesajı</label>
                <textarea rows={3} value={settingsForm.kartOdemeMesaji || ''} onChange={(e) => setSettingsForm({ ...settingsForm, kartOdemeMesaji: e.target.value })} placeholder="Boş bırakılırsa varsayılan mesaj kullanılır" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Dekont Alındı Mesajı</label>
                <textarea rows={3} value={settingsForm.dekontAlindiMesaji || ''} onChange={(e) => setSettingsForm({ ...settingsForm, dekontAlindiMesaji: e.target.value })} placeholder="Boş bırakılırsa varsayılan mesaj kullanılır" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <p className="text-[10px] text-slate-400 mt-0.5">Müşteri dekont/medya gönderdiğinde otomatik giden yanıt</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Sipariş İptal Mesajı</label>
                <textarea rows={3} value={settingsForm.iptalMesaji || ''} onChange={(e) => setSettingsForm({ ...settingsForm, iptalMesaji: e.target.value })} placeholder="Boş bırakılırsa varsayılan mesaj kullanılır" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <p className="text-[10px] text-slate-400 mt-0.5">Süre dolup otomatik iptal edildiğinde gönderilir</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Ödeme Onay Mesajı</label>
                <textarea rows={3} value={settingsForm.odemeOnayMesaji || ''} onChange={(e) => setSettingsForm({ ...settingsForm, odemeOnayMesaji: e.target.value })} placeholder="Boş bırakılırsa varsayılan mesaj kullanılır" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <p className="text-[10px] text-slate-400 mt-0.5">Ödeme onaylandığında müşteriye gönderilir</p>
              </div>

              <button onClick={saveSettings} disabled={settingsSaving} className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 disabled:opacity-50">{settingsSaving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Ödeme Bul Modal */}
      {paymentOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60" onClick={() => setPaymentOpen(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">Ödeme Bul</h2>
              <button onClick={() => setPaymentOpen(null)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-1">
              <div className="flex justify-between"><span className="text-xs text-slate-400">Talep No</span><span className="font-mono font-bold text-violet-700">{paymentOpen.talepNo}</span></div>
              <div className="flex justify-between"><span className="text-xs text-slate-400">Müşteri</span><span className="text-sm">{paymentOpen.musteri || '-'}</span></div>
              <div className="flex justify-between"><span className="text-xs text-slate-400">Toplam</span><span className="text-sm font-bold">{fmtP(paymentOpen.toplam || 0)}</span></div>
              {(paymentOpen.indirim || 0) > 0 && <div className="flex justify-between"><span className="text-xs text-slate-400">İndirim</span><span className="text-sm text-green-600">-{fmtP(paymentOpen.indirim)}</span></div>}
              <div className="flex justify-between border-t border-slate-200 pt-1"><span className="text-xs font-medium text-slate-600">Ödenecek</span><span className="text-lg font-bold text-emerald-700">{fmtP((paymentOpen.toplam || 0) - (paymentOpen.indirim || 0))}</span></div>
              <div className="flex justify-between"><span className="text-xs text-slate-400">Ödeme Tipi</span><span className={`text-sm font-medium ${paymentOpen.kartOdeme ? 'text-violet-600' : 'text-slate-600'}`}>{paymentOpen.kartOdeme ? 'Kredi Kartı' : (paymentOpen.odemeYontemi || 'Havale / Nakit')}</span></div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1 flex items-center gap-1">
                  <Link2 size={12} /> Tahsilat Linki {paymentOpen.kartOdeme && <span className="text-rose-500 font-semibold">(zorunlu)</span>}
                </label>
                <input
                  value={paymentForm.tahsilatLinki}
                  onChange={(e) => setPaymentForm({ tahsilatLinki: e.target.value })}
                  placeholder="https://... tahsilat / ödeme linkini yapıştırın"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5"
                />
                {paymentOpen.kartOdeme
                  ? <p className="text-[11px] text-rose-500 mt-1">Kredi kartı ile ödeme yapıldığı için tahsilat linki zorunludur.</p>
                  : <p className="text-[11px] text-slate-400 mt-1">Tahsilat linki opsiyoneldir, varsa yapıştırabilirsiniz.</p>}
              </div>
              <button onClick={submitPayment} disabled={paymentSaving || (paymentOpen.kartOdeme && !paymentForm.tahsilatLinki.trim())} className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">{paymentSaving ? 'İşleniyor...' : <><Check size={16} /> Ödemeyi Bul ve Kaydet</>}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  if (view === 'edit' && editing) {
    const previewUrl = `https://diljar.com/ozel-katalog/${editing.slug}`;
    const minTutar = kampanyalar.filter((k) => k.tip === 'tutarIndirim').map((k) => Number(k.kosul)).sort((a, b) => a - b)[0];
    const stokPill = (s: number) => s >= 100 ? 'bg-emerald-100 text-emerald-700' : s >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-600';
    return (
    <div className="pb-6">
      {/* Üst başlık */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button onClick={closeEditor} className="w-9 h-9 inline-flex items-center justify-center text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50"><ChevronLeft size={18} /></button>
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">Katalog Düzenle <Sparkles size={18} className="text-violet-500" /></h1>
          <p className="text-xs text-slate-400 mt-0.5">Katalog bilgilerini düzenleyin, ürün ekleyin ve kampanyalarınızı yönetin.</p>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          <button onClick={() => window.open(previewUrl, '_blank', 'width=430,height=920')} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"><Smartphone size={15} /> Önizle (Mobil)</button>
          <button onClick={() => copyLink(editing.slug)} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"><Link2 size={15} /> Linki Kopyala</button>
          {pids.length > 0 && <button onClick={openEnhanceSetup} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fuchsia-600 text-white text-sm font-medium hover:bg-fuchsia-700"><Sparkles size={15} /> Görselleri Profesyonelleştir</button>}
          <button onClick={saveOnly} disabled={saving} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
        </div>
      </div>

      {/* Ayarlar kartı */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500">Katalog Adı</label>
            <input value={ad} onChange={(e) => setAd(e.target.value)} className="w-full mt-1.5 text-sm border border-slate-200 rounded-xl px-3 py-2.5" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">WhatsApp Numarası</label>
            <div className="flex items-center gap-2 mt-1.5">
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="05xxxxxxxxx" className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5" />
              <button onClick={() => setAktif(!aktif)} title="Aktif" className={`shrink-0 w-12 h-7 rounded-full transition-colors relative ${aktif ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${aktif ? 'left-[26px]' : 'left-0.5'}`} /></button>
            </div>
            <span className={`text-[11px] font-medium ${aktif ? 'text-emerald-600' : 'text-slate-400'}`}>{aktif ? 'Aktif' : 'Pasif'}</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Kampanya</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <select value={kForm.tip} onChange={(e) => setKForm({ ...kForm, tip: e.target.value })} className="text-xs border border-slate-200 rounded-xl px-2 py-2.5"><option value="adetIndirim">Adet koşulu</option><option value="tutarIndirim">Tutar koşulu</option></select>
              <input value={kForm.kosul} onChange={(e) => setKForm({ ...kForm, kosul: e.target.value })} placeholder={kForm.tip === 'adetIndirim' ? 'Min adet' : 'Min tutar'} className="text-xs border border-slate-200 rounded-xl px-2 py-2.5" />
              <select value={kForm.indirimTip} onChange={(e) => setKForm({ ...kForm, indirimTip: e.target.value })} className="text-xs border border-slate-200 rounded-xl px-2 py-2.5"><option value="yuzde">% İndirim</option><option value="tutar">₺ İndirim</option></select>
              <input value={kForm.indirimDeger} onChange={(e) => setKForm({ ...kForm, indirimDeger: e.target.value })} placeholder="İndirim" className="text-xs border border-slate-200 rounded-xl px-2 py-2.5" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Kupon Kodu (isteğe bağlı)</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <input value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} placeholder="KOD15" className="text-xs border border-slate-200 rounded-xl px-2 py-2.5 font-mono" />
              <select value={couponForm.tip} onChange={(e) => setCouponForm({ ...couponForm, tip: e.target.value })} className="text-xs border border-slate-200 rounded-xl px-2 py-2.5"><option value="yuzde">% İndirim</option><option value="tutar">₺ İndirim</option></select>
              <input value={couponForm.deger} onChange={(e) => setCouponForm({ ...couponForm, deger: e.target.value })} placeholder="Değer" type="number" className="text-xs border border-slate-200 rounded-xl px-2 py-2.5" />
              <input value={couponForm.bitis} onChange={(e) => setCouponForm({ ...couponForm, bitis: e.target.value })} type="date" title="Geçerlilik" className="text-xs border border-slate-200 rounded-xl px-2 py-2.5" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 flex-wrap">
          <button onClick={addKampanya} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600"><Plus size={13} /> Kampanya Ekle</button>
          <button onClick={addCoupon} disabled={couponAdding} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"><Ticket size={13} /> Kupon Ekle</button>
          {kampanyalar.map((k, i) => (<span key={'k' + i} className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 rounded-full pl-2.5 pr-1 py-1 text-[11px]"><Tag size={11} />{k.tip === 'adetIndirim' ? `${k.kosul} adet` : `${k.kosul}₺+`} → {k.indirimTip === 'yuzde' ? `%${k.indirimDeger}` : `${k.indirimDeger}₺`}<button onClick={() => removeKampanya(i)} className="text-amber-400 hover:text-rose-500"><X size={12} /></button></span>))}
          {coupons.map((c) => (<span key={c.id} className={`inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-1 text-[11px] ${c.aktif ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-400'}`}><Ticket size={11} /><span className="font-mono font-bold">{c.code}</span>{c.tip === 'yuzde' ? `%${c.deger}` : `${c.deger}₺`}<button onClick={() => toggleCoupon(c)} className="hover:text-emerald-600">{c.aktif ? '●' : '○'}</button><button onClick={() => deleteCoupon(c)} className="text-slate-300 hover:text-rose-500"><X size={12} /></button></span>))}
        </div>
      </div>

      {/* Paneller: Ürün Havuzu üstte, Katalog Ürünleri altta */}
      <div className="space-y-5">
        {/* Ürün Havuzu */}
        <div className="bg-white rounded-2xl border border-slate-200 flex flex-col">
          <div className="p-5 pb-3">
            <h3 className="text-base font-bold text-slate-800">Ürün Havuzu <span className="text-slate-400 font-medium">({products.length})</span></h3>
            <p className="text-xs text-slate-400 mt-0.5">Kataloga ekleyebileceğiniz tüm ürünler</p>
            <div className="relative mt-3"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün ara (isim, kod, barkod...)" className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl" /></div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <select value={filterMarka} onChange={(e) => setFilterMarka(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2.5 py-2"><option value="">Marka</option>{markalar.map((m) => <option key={m} value={m}>{m}</option>)}</select>
              <select value={filterKategori} onChange={(e) => setFilterKategori(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2.5 py-2"><option value="">Kategori</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select>
              <select value={filterCinsiyet} onChange={(e) => setFilterCinsiyet(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2.5 py-2"><option value="">Cinsiyet</option><option value="kadin">Kadın</option><option value="erkek">Erkek</option><option value="unisex">Unisex</option></select>
            </div>
          </div>
          <div className="px-5 flex items-center justify-between border-y border-slate-100 py-2 bg-slate-50/50">
            <button onClick={toggleSelectAllPool} className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className={`w-4 h-4 rounded border flex items-center justify-center ${poolAddable.length > 0 && poolAddable.every((p: any) => poolSel.has(p.id)) ? 'bg-violet-600 border-violet-600' : 'border-slate-300'}`}>{poolAddable.length > 0 && poolAddable.every((p: any) => poolSel.has(p.id)) && <Check size={11} className="text-white" />}</span>
              {poolSel.size > 0 ? `${poolSel.size} ürün seçili` : 'Tümünü Seç'}
            </button>
            <span className="text-xs text-slate-400">{poolAddable.length} eklenebilir</span>
          </div>
          <div className="flex-1 max-h-[420px] overflow-y-auto p-2">
            {filteredProducts.map((p: any) => { const added = pidsSet.has(p.id); const sel = poolSel.has(p.id); return (
              <label key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer ${added ? 'opacity-50' : sel ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                <input type="checkbox" disabled={added} checked={sel} onChange={() => togglePoolSel(p.id)} className="w-4 h-4 accent-violet-600" />
                <img loading="lazy" src={(p.images || [])[0] || ''} className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0" />
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{p.ad}</p><p className="text-[10px] text-slate-400">{catMap.get(p.kategoriId) || '-'}{p.salesCode ? ' · ' + p.salesCode : ''}</p></div>
                <div className="text-right shrink-0"><p className="text-xs font-semibold text-slate-700">{fmtP(p.satisFiyat)}</p><p className="text-[10px] text-slate-400">Stok: {stokOf(p)}</p></div>
                {added && <Check size={15} className="text-emerald-500 shrink-0" />}
              </label>
            ); })}
            {filteredProducts.length === 0 && <p className="text-center text-slate-400 text-sm py-8">Ürün bulunamadı</p>}
          </div>
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">{products.length} üründen {poolSel.size} ürün seçildi</span>
            <button onClick={addSelectedToCatalog} disabled={poolSel.size === 0} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 disabled:opacity-40"><Plus size={15} /> Seçilenleri Ekle ({poolSel.size})</button>
          </div>
        </div>

        {/* Katalog Ürünleri */}
        <div className="bg-white rounded-2xl border border-slate-200 flex flex-col">
          <div className="p-5 pb-3 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-base font-bold text-slate-800">Katalog Ürünleri <span className="text-slate-400 font-medium">({pids.length})</span></h3>
              <p className="text-xs text-slate-400 mt-0.5">Sürükleyerek veya sıra no'ya çift tıklayıp yeni numara yazarak sıralayın.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={catQ} onChange={(e) => setCatQ(e.target.value)} placeholder="Katalogda ara (isim, satış kodu...)" className="w-64 max-w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl" /></div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                <button onClick={() => setCatView('list')} className={`p-1.5 rounded ${catView === 'list' ? 'bg-white shadow-sm text-violet-600' : 'text-slate-400'}`}><List size={15} /></button>
                <button onClick={() => setCatView('grid')} className={`p-1.5 rounded ${catView === 'grid' ? 'bg-white shadow-sm text-violet-600' : 'text-slate-400'}`}><LayoutGrid size={15} /></button>
              </div>
            </div>
          </div>
          <div className="px-5 pb-3 flex items-center gap-2 flex-wrap border-b border-slate-100">
            <select value={fStok} onChange={(e) => setFStok(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"><option value="">Stok (Tümü)</option><option value="var">Stokta var</option><option value="yok">Tükendi</option></select>
            <select value={fMarka} onChange={(e) => setFMarka(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"><option value="">Marka (Tümü)</option>{catFilterOpts.marka.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            <select value={fBeden} onChange={(e) => setFBeden(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"><option value="">Beden (Tümü)</option>{catFilterOpts.beden.map((b) => <option key={b} value={b}>{b}</option>)}</select>
            <select value={fCinsiyet} onChange={(e) => setFCinsiyet(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"><option value="">Cinsiyet (Tümü)</option>{catFilterOpts.cinsiyet.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select value={fKategori} onChange={(e) => setFKategori(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"><option value="">Kategori (Tümü)</option>{catFilterOpts.kategori.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}</select>
            {catFiltreAktif && <button onClick={() => { setCatQ(''); setFStok(''); setFMarka(''); setFBeden(''); setFCinsiyet(''); setFKategori(''); }} className="text-xs text-rose-500 hover:text-rose-600 px-2 py-1.5 flex items-center gap-1"><X size={13} /> Temizle</button>}
          </div>
          <div className="flex-1 max-h-[480px] overflow-y-auto px-2 pb-2">
            {pids.length === 0 ? <p className="text-center text-slate-400 text-sm py-12">Henüz ürün eklenmedi. Soldan ürün seçip ekleyin.</p> : catView === 'list' ? (
              <table className="w-full">
                <thead><tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100"><th className="text-left font-semibold py-2 pl-2">Sıra</th><th className="text-left font-semibold py-2">Ürün</th><th className="text-left font-semibold py-2 hidden sm:table-cell">Varyasyon</th><th className="text-center font-semibold py-2">Stok</th><th className="text-right font-semibold py-2">Eski Fiyat</th><th className="text-right font-semibold py-2">Fiyat</th><th className="text-right font-semibold py-2 pr-2">İşlem</th></tr></thead>
                <tbody>
                  {pids.map((id, i) => { const p: any = prodOf(id); if (!p) return null; if (!matchCatFilters(p)) return null; const s = stokOf(p); return (
                    <tr key={id} draggable onDragStart={() => setDragIdx(i)} onDragEnter={() => setOverIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIdx !== null) moveProduct(dragIdx, i); setDragIdx(null); setOverIdx(null); }} onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                      className={`border-b border-slate-50 group ${overIdx === i && dragIdx !== i ? 'bg-violet-50' : dragIdx === i ? 'opacity-40' : 'hover:bg-slate-50/60'}`}>
                      <td className="py-2.5 pl-2"><div className="flex items-center gap-1.5"><GripVertical size={15} className="text-slate-300 cursor-grab active:cursor-grabbing group-hover:text-slate-400" />{editCell?.id === id && editCell?.field === 'sira' ? (<input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => saveSira(i, editVal)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveSira(i, editVal); } else if (e.key === 'Escape') setEditCell(null); }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} inputMode="numeric" className="w-9 h-6 text-center text-xs font-bold border border-violet-300 rounded-lg outline-none" />) : (<span onDoubleClick={() => { setEditCell({ id, field: 'sira' }); setEditVal(String(i + 1)); }} title="Sıra no yazarak taşı" className="w-6 h-6 rounded-lg bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center cursor-text">{i + 1}</span>)}</div></td>
                      <td className="py-2.5"><div className="flex items-center gap-2.5"><img loading="lazy" src={(p.images || [])[0] || ''} className="w-9 h-9 rounded-lg object-cover bg-slate-100 shrink-0" /><div className="min-w-0">{editCell?.id === id && editCell?.field === 'ad' ? (<input {...editInputProps(id, 'ad')} className="text-sm font-medium border border-violet-300 rounded px-1.5 py-0.5 w-[180px] outline-none" />) : (<p onDoubleClick={() => startEdit(p, 'ad')} title="Çift tıklayarak düzenle" className="text-sm font-medium text-slate-800 truncate max-w-[180px] cursor-text">{p.ad}</p>)}<p className="text-[10px] text-slate-400">{catMap.get(p.kategoriId) || '-'}</p></div></div></td>
                      <td className="py-2.5 hidden sm:table-cell text-xs text-slate-500">{varText(p)}</td>
                      <td className="py-2.5 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${stokPill(s)}`}>{s}</span></td>
                      <td className="py-2.5 text-right">{editCell?.id === id && editCell?.field === 'eskiFiyat' ? (<input {...editInputProps(id, 'eskiFiyat')} inputMode="decimal" className="text-sm border border-violet-300 rounded px-1.5 py-0.5 w-20 text-right outline-none" />) : (<span onDoubleClick={() => startEdit(p, 'eskiFiyat')} title="Çift tıklayarak düzenle" className={`text-xs cursor-text ${p.eskiFiyat ? 'text-slate-400 line-through' : 'text-slate-300'}`}>{p.eskiFiyat ? fmtP(p.eskiFiyat) : '—'}</span>)}</td>
                      <td className="py-2.5 text-right">{editCell?.id === id && editCell?.field === 'satisFiyat' ? (<input {...editInputProps(id, 'satisFiyat')} inputMode="decimal" className="text-sm font-semibold border border-violet-300 rounded px-1.5 py-0.5 w-20 text-right outline-none" />) : (<span onDoubleClick={() => startEdit(p, 'satisFiyat')} title="Çift tıklayarak düzenle" className="text-sm font-semibold text-slate-700 cursor-text">{fmtP(p.satisFiyat)}</span>)}</td>
                      <td className="py-2.5 pr-2 text-right"><button onClick={() => removeProduct(id)} className="text-slate-300 hover:text-rose-500 p-1"><Trash2 size={15} /></button></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-1">
                {pids.map((id, i) => { const p: any = prodOf(id); if (!p) return null; if (!matchCatFilters(p)) return null; return (
                  <div key={id} draggable onDragStart={() => setDragIdx(i)} onDragEnter={() => setOverIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIdx !== null) moveProduct(dragIdx, i); setDragIdx(null); setOverIdx(null); }} onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                    className={`relative border rounded-xl p-2 cursor-grab active:cursor-grabbing ${overIdx === i && dragIdx !== i ? 'border-violet-400 bg-violet-50' : dragIdx === i ? 'opacity-40 border-slate-200' : 'border-slate-200 hover:border-slate-300'}`}>
                    {editCell?.id === id && editCell?.field === 'sira' ? (<input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => saveSira(i, editVal)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveSira(i, editVal); } else if (e.key === 'Escape') setEditCell(null); }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} inputMode="numeric" className="absolute top-1.5 left-1.5 w-7 h-5 text-center rounded-lg border border-violet-400 text-violet-700 text-[10px] font-bold z-20 outline-none" />) : (<span onDoubleClick={() => { setEditCell({ id, field: 'sira' }); setEditVal(String(i + 1)); }} title="Sıra no yazarak taşı" className="absolute top-1.5 left-1.5 w-5 h-5 rounded-lg bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center z-10 cursor-text">{i + 1}</span>)}
                    <button onClick={() => removeProduct(id)} className="absolute top-1.5 right-1.5 w-5 h-5 bg-white/90 rounded-full text-slate-400 hover:text-rose-500 flex items-center justify-center shadow"><X size={12} /></button>
                    <img loading="lazy" src={(p.images || [])[0] || ''} className="w-full aspect-square rounded-lg object-cover bg-slate-100" />
                    {editCell?.id === id && editCell?.field === 'ad' ? (<input {...editInputProps(id, 'ad')} className="text-[11px] font-medium border border-violet-300 rounded px-1 py-0.5 w-full mt-1.5 outline-none" />) : (<p onDoubleClick={() => startEdit(p, 'ad')} title="Çift tıklayarak düzenle" className="text-[11px] font-medium text-slate-700 truncate mt-1.5 cursor-text">{p.ad}</p>)}
                    <div className="flex items-center gap-1.5">
                      {editCell?.id === id && editCell?.field === 'satisFiyat' ? (<input {...editInputProps(id, 'satisFiyat')} inputMode="decimal" className="text-[11px] font-semibold border border-violet-300 rounded px-1 py-0.5 w-16 outline-none" />) : (<span onDoubleClick={() => startEdit(p, 'satisFiyat')} title="Çift tıklayarak düzenle" className="text-[11px] font-semibold text-slate-600 cursor-text">{fmtP(p.satisFiyat)}</span>)}
                      {editCell?.id === id && editCell?.field === 'eskiFiyat' ? (<input {...editInputProps(id, 'eskiFiyat')} inputMode="decimal" className="text-[10px] border border-violet-300 rounded px-1 py-0.5 w-14 outline-none" />) : (<span onDoubleClick={() => startEdit(p, 'eskiFiyat')} title="Eski fiyat — çift tıklayarak düzenle" className={`text-[10px] cursor-text ${p.eskiFiyat ? 'text-slate-400 line-through' : 'text-slate-300'}`}>{p.eskiFiyat ? fmtP(p.eskiFiyat) : '—'}</span>)}
                    </div>
                  </div>
                ); })}
              </div>
            )}
          </div>
          <div className="p-4 border-t border-slate-100 flex items-center gap-3 text-xs text-slate-400"><span>{pids.length} ürün</span><span className="ml-auto flex items-center gap-2">Stok:<span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Yüksek</span><span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Orta</span><span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 font-medium">Düşük</span></span></div>
        </div>
      </div>

      {/* Alt özet kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center"><Package size={20} className="text-violet-600" /></div><div><p className="text-xs text-slate-400">Toplam Ürün</p><p className="text-xl font-bold text-slate-800">{catStats.adet}</p></div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center"><Layers size={20} className="text-emerald-600" /></div><div><p className="text-xs text-slate-400">Toplam Stok</p><p className="text-xl font-bold text-slate-800">{catStats.stok}</p></div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-sky-100 flex items-center justify-center"><Ticket size={20} className="text-sky-600" /></div><div><p className="text-xs text-slate-400">Minimum Sipariş</p><p className="text-xl font-bold text-slate-800">{minTutar ? minTutar + '₺' : '-'}</p></div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-fuchsia-100 flex items-center justify-center"><Coins size={20} className="text-fuchsia-600" /></div><div><p className="text-xs text-slate-400">Tahmini Değer</p><p className="text-lg font-bold text-slate-800">{fmtP(catStats.deger)}</p></div></div>
        <button onClick={save} disabled={saving} className="bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-2xl p-4 text-white flex flex-col items-center justify-center hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-60"><span className="inline-flex items-center gap-2 font-semibold"><Rocket size={18} /> {saving ? 'Kaydediliyor...' : 'Kaydet ve Yayınla'}</span><span className="text-[10px] text-white/70 mt-1">Katalog anında paylaşılır</span></button>
      </div>

      {enhanceOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setEnhanceOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl bg-white rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Sparkles size={20} className="text-fuchsia-600" /> Görselleri Profesyonelleştir</h2>
              <div className="flex gap-2">
                {enhanceMode === 'setup' && <button onClick={openEnhanceReview} className="text-xs text-violet-600 hover:underline">Sonuçları İncele →</button>}
                {enhanceMode === 'review' && <button onClick={() => setEnhanceMode('setup')} className="text-xs text-violet-600 hover:underline">← Yeni İşlem Başlat</button>}
                <button onClick={() => setEnhanceOpen(false)}><X size={20} className="text-slate-400" /></button>
              </div>
            </div>

            {enhanceMode === 'setup' && (<>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-500">Prompt (talimat)</label>
                  <button onClick={savePromptPreset} disabled={savingPreset} className="text-[11px] text-violet-600 hover:underline disabled:opacity-50">{savingPreset ? 'Kaydediliyor...' : '+ Prompt kaydet'}</button>
                </div>
                <textarea value={enhancePrompt} onChange={(e) => setEnhancePrompt(e.target.value)} rows={3} placeholder="Boş bırakırsanız varsayılan profesyonel stüdyo prompt'u kullanılır..." className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none" />
                {promptPresets.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] text-slate-400 mb-1">Kayıtlı promptlar (tıkla → kullan):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {promptPresets.map((pr: any) => (
                        <span key={pr.id} className="group inline-flex items-center gap-1 pl-2 pr-1 py-1 text-[11px] bg-violet-50 text-violet-700 rounded-full border border-violet-100">
                          <button onClick={() => usePromptPreset(pr)} title={pr.prompt} className="hover:underline max-w-[160px] truncate">{pr.baslik}</button>
                          <button onClick={() => deletePromptPreset(pr.id)} className="text-violet-300 hover:text-rose-500"><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="mb-4">
                <label className="text-xs text-slate-500 mb-1 block">Referans Görsel (opsiyonel)</label>
                <div className="flex items-center gap-3">
                  {enhRefImage ? (
                    <div className="relative">
                      <img src={enhRefImage} className="w-20 h-20 rounded-lg object-cover border border-slate-200" />
                      <button onClick={() => setEnhRefImage(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-rose-600"><X size={12} /></button>
                    </div>
                  ) : (
                    <label className="cursor-pointer px-4 py-2 text-xs border border-dashed border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50 hover:border-violet-300">
                      Görsel Yükle
                      <input type="file" accept="image/*" onChange={handleRefImageUpload} className="hidden" />
                    </label>
                  )}
                  <p className="text-[10px] text-slate-400">Yüklenen görsel tüm ürünlere stil referansı olarak uygulanır.</p>
                </div>
              </div>
              <div className="flex gap-2 mb-4">
                <button disabled={enhStarting} onClick={() => startEnhance(filteredEnhanceProducts.map((p: any) => p.id))} className="px-4 py-2 bg-fuchsia-600 text-white rounded-lg text-sm font-medium hover:bg-fuchsia-700 disabled:opacity-50">{enhStarting ? 'Başlatılıyor...' : `Tümüne Uygula (${filteredEnhanceProducts.length})`}</button>
                <button disabled={enhStarting} onClick={() => startEnhance(Array.from(enhanceSelected))} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50">Seçilenlere Uygula ({enhanceSelected.size})</button>
              </div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className="relative min-w-[160px]"><Search size={13} className="absolute left-2 top-2 text-slate-400" /><input value={enhFiltAd} onChange={(e) => setEnhFiltAd(e.target.value)} placeholder="Ürün adı ara..." className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg" /></div>
                <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={enhFiltStok} onChange={(e) => setEnhFiltStok(e.target.checked)} className="rounded" /><span className="text-slate-600">Sadece stokta</span></label>
                <select value={enhFiltMarka} onChange={(e) => setEnhFiltMarka(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"><option value="">Marka</option>{enhMarkalar.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                <select value={enhFiltKategori} onChange={(e) => setEnhFiltKategori(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"><option value="">Kategori</option>{enhKategoriler.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select>
                <select value={enhFiltCinsiyet} onChange={(e) => setEnhFiltCinsiyet(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"><option value="">Cinsiyet</option>{enhCinsiyetler.map((c) => <option key={c} value={c}>{c === 'kadin' ? 'Kadın' : c === 'erkek' ? 'Erkek' : c === 'unisex' ? 'Unisex' : c}</option>)}</select>
                <span className="text-[10px] text-slate-400">{filteredEnhanceProducts.length} ürün</span>
              </div>
              <p className="text-xs text-slate-400 mb-2">Seçmek için tıklayın:</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[300px] overflow-y-auto">
                {filteredEnhanceProducts.map((p: any) => (
                  <div key={p.id} onClick={() => toggleEnhanceSelect(p.id)} className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 ${enhanceSelected.has(p.id) ? 'border-fuchsia-500 ring-2 ring-fuchsia-200' : 'border-transparent hover:border-slate-300'}`}>
                    <img loading="lazy" src={(p.images || [])[0]} className="w-full h-full object-cover" />
                    {enhanceSelected.has(p.id) && <div className="absolute inset-0 bg-fuchsia-500/20 flex items-center justify-center"><Check size={24} className="text-white drop-shadow" /></div>}
                    <p className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">{p.ad}</p>
                  </div>
                ))}
              </div>
            </>)}

            {enhanceMode === 'review' && (<>
              {(() => {
                const pendingIds = enhanceJobs.filter((j: any) => j.status === 'pending').map((j: any) => j.id);
                const allSel = pendingIds.length > 0 && pendingIds.every((id: string) => enhSel.has(id));
                const toggleAll = () => setEnhSel(allSel ? new Set() : new Set(pendingIds));
                return (
                  <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-slate-600 font-medium">{enhanceJobs.length} işlem</p>
                      {pendingIds.length > 0 && (
                        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                          <input type="checkbox" checked={allSel} onChange={toggleAll} className="accent-violet-600" />
                          Tümünü seç ({pendingIds.length} bekleyen)
                        </label>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {enhSel.size > 0 && (
                        <button onClick={cancelSelectedJobs} className="px-2.5 py-1 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 flex items-center gap-1">
                          <X size={13} /> Seçilenleri İptal ({enhSel.size})
                        </button>
                      )}
                      <button onClick={loadEnhJobs} className="text-xs text-violet-600 hover:underline">Yenile</button>
                    </div>
                  </div>
                );
              })()}
              {(() => {
                const counts: Record<string, number> = {};
                enhanceJobs.forEach((j: any) => { counts[j.status] = (counts[j.status] || 0) + 1; });
                const opts = [
                  { v: '', label: 'Tümü', cls: 'bg-slate-100 text-slate-600', activeCls: 'bg-slate-700 text-white' },
                  { v: 'pending', label: 'Bekliyor', cls: 'bg-amber-50 text-amber-700', activeCls: 'bg-amber-600 text-white' },
                  { v: 'processing', label: 'İşleniyor', cls: 'bg-fuchsia-50 text-fuchsia-700', activeCls: 'bg-fuchsia-600 text-white' },
                  { v: 'done', label: 'İşlendi', cls: 'bg-blue-50 text-blue-700', activeCls: 'bg-blue-600 text-white' },
                  { v: 'approved', label: 'Onaylandı', cls: 'bg-green-50 text-green-700', activeCls: 'bg-green-600 text-white' },
                  { v: 'rejected', label: 'Reddedildi', cls: 'bg-rose-50 text-rose-600', activeCls: 'bg-rose-600 text-white' },
                ];
                return (
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {opts.map((o) => {
                      const n = o.v === '' ? enhanceJobs.length : (counts[o.v] || 0);
                      const active = enhStatusFilt === o.v;
                      return (
                        <button key={o.v} onClick={() => setEnhStatusFilt(o.v)} className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition ${active ? o.activeCls : o.cls}`}>
                          {o.label} ({n})
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              {(() => {
                const filteredJobs = enhStatusFilt ? enhanceJobs.filter((j: any) => j.status === enhStatusFilt) : enhanceJobs;
                return filteredJobs.length === 0 ? <div className="h-[60vh] flex items-center justify-center"><p className="text-center text-slate-400">{enhanceJobs.length === 0 ? 'Henüz işlem yok' : 'Bu durumda işlem yok'}</p></div> : (
                <div className="space-y-3 h-[60vh] overflow-y-auto">
                  {filteredJobs.map((j: any) => {
                    const p: any = prodOf(j.productId);
                    const statusLabel = j.status === 'done' ? 'İşlendi' : j.status === 'approved' ? 'Onaylandı' : j.status === 'rejected' ? 'Reddedildi' : j.status === 'processing' ? 'İşleniyor...' : 'Bekliyor';
                    const statusCls = j.status === 'approved' ? 'bg-green-50 text-green-700' : j.status === 'done' ? 'bg-blue-50 text-blue-700' : j.status === 'rejected' ? 'bg-rose-50 text-rose-600' : j.status === 'processing' ? 'bg-fuchsia-50 text-fuchsia-700' : 'bg-amber-50 text-amber-700';
                    return (
                      <div key={j.id} className="p-3 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-3">
                          {j.status === 'pending' && (
                            <input type="checkbox" checked={enhSel.has(j.id)} onChange={() => toggleEnhSel(j.id)} className="accent-violet-600 shrink-0" />
                          )}
                          <img loading="lazy" src={j.oldImage} onClick={() => setEnhLightbox(j.oldImage)} className="w-14 h-14 rounded-lg object-cover shrink-0 cursor-zoom-in hover:ring-2 hover:ring-slate-300" />
                          {j.newImage && <img loading="lazy" src={j.newImage} onClick={() => setEnhLightbox(j.newImage)} className="w-14 h-14 rounded-lg object-cover shrink-0 cursor-zoom-in ring-2 ring-fuchsia-200 hover:ring-fuchsia-400" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-800 truncate">{p?.ad || j.productId.slice(-6)}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusCls}`}>{statusLabel}</span>
                            {j.error && <p className="text-[10px] text-rose-500 mt-0.5">{j.error}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0 flex-wrap items-center">
                            {j.prompt && <button onClick={() => setEnhPromptView({ ad: p?.ad || j.productId.slice(-6), prompt: j.prompt })} className="px-2 py-1 text-[10px] bg-violet-100 text-violet-700 rounded hover:bg-violet-200">Prompt</button>}
                            {j.newImage && <button onClick={() => setEnhCompare({ old: j.oldImage, new: j.newImage })} className="px-2 py-1 text-[10px] bg-slate-100 text-slate-600 rounded hover:bg-slate-200">Karşılaştır</button>}
                            {j.status === 'done' && (j.newImage || (Array.isArray(j.newImages) && j.newImages.length > 0)) && (() => {
                              const multi = Array.isArray(j.newImages) && j.newImages.length > 1;
                              const selN = enhPick[j.id]?.selected.length || 0;
                              const dis = multi && selN === 0;
                              return <button onClick={() => approveJob(j.id)} disabled={dis} className="px-2 py-1 text-[10px] bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-40">{multi ? `Seçileni Onayla${selN ? ` (${selN})` : ''}` : 'Onayla'}</button>;
                            })()}
                            {j.status === 'done' && <button onClick={() => rejectJob(j.id)} className="px-2 py-1 text-[10px] bg-rose-100 text-rose-600 rounded hover:bg-rose-200">Reddet</button>}
                            {j.status === 'pending' && <button onClick={() => cancelJob(j.id)} className="px-2 py-1 text-[10px] bg-rose-100 text-rose-600 rounded hover:bg-rose-200">İptal</button>}
                            {(j.status === 'rejected' || j.status === 'done') && (
                              enhRetryId === j.id ? null : <button onClick={() => { setEnhRetryId(j.id); setEnhRetryPrompt(''); }} className="px-2 py-1 text-[10px] bg-fuchsia-100 text-fuchsia-700 rounded hover:bg-fuchsia-200">Tekrar</button>
                            )}
                          </div>
                        </div>
                        {j.status === 'done' && Array.isArray(j.newImages) && j.newImages.length > 1 && (() => {
                          const pick = enhPick[j.id] || { selected: [], cover: '' };
                          return (
                            <div className="mt-3">
                              <p className="text-[11px] text-slate-500 mb-1.5">Beğendiğiniz varyant(lar)ı seçin, birini kapak yapın:</p>
                              <div className="grid grid-cols-3 gap-2">
                                {j.newImages.map((url: string, idx: number) => {
                                  const sel = pick.selected.includes(url);
                                  const isCover = pick.cover === url;
                                  return (
                                    <div key={idx} className={`relative rounded-lg overflow-hidden border-2 ${sel ? 'border-green-500 ring-2 ring-green-200' : 'border-transparent hover:border-slate-300'}`}>
                                      <img loading="lazy" src={url} onClick={() => togglePick(j.id, url)} className="w-full aspect-square object-cover cursor-pointer" />
                                      <button onClick={() => setEnhLightbox(url)} className="absolute top-1 right-1 bg-black/50 text-white rounded p-0.5 hover:bg-black/70"><Search size={12} /></button>
                                      {sel && <div className="absolute top-1 left-1 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center"><Check size={12} /></div>}
                                      <button onClick={() => setCover(j.id, url)} className={`absolute bottom-1 left-1 right-1 text-[9px] py-0.5 rounded font-medium ${isCover ? 'bg-amber-400 text-white' : 'bg-white/85 text-slate-600 hover:bg-amber-100'}`}>{isCover ? '★ Kapak' : 'Kapak yap'}</button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                        {enhRetryId === j.id && (
                          <div className="mt-2 bg-slate-50 rounded-lg px-3 py-2.5 space-y-2">
                            <p className="text-xs text-slate-600 font-medium">Bu görselde ne düzeltilsin?</p>
                            <div className="flex gap-2 flex-wrap">
                              {['Arka planı daha temiz yap', 'Ürünü daha parlak göster', 'Gölgeleri azalt', 'Renkleri daha canlı yap', 'Daha yakın çek'].map((s) => (
                                <button key={s} onClick={() => setEnhRetryPrompt(enhRetryPrompt ? enhRetryPrompt + '. ' + s : s)} className="px-2 py-1 text-[10px] bg-white border border-slate-200 rounded-lg hover:bg-violet-50 hover:border-violet-200">{s}</button>
                              ))}
                            </div>
                            <textarea value={enhRetryPrompt} onChange={(e) => setEnhRetryPrompt(e.target.value)} rows={2} placeholder="Düzeltme talimatı yazın veya yukarıdan seçin... (boş = sıfırdan varsayılan prompt ile dene)" className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 resize-none" />
                            <div className="flex gap-2">
                              <button onClick={() => retryJob(j.id)} className="px-3 py-1.5 text-xs bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700">Tekrar Dene</button>
                              <button onClick={() => setEnhRetryId(null)} className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">İptal</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
              })()}
            </>)}

            {enhLightbox && (
              <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={() => setEnhLightbox(null)}>
                <img src={enhLightbox} className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
                <button onClick={() => setEnhLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={28} /></button>
              </div>
            )}

            {enhPromptView && (
              <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={() => setEnhPromptView(null)}>
                <div className="bg-white rounded-2xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Sparkles size={17} className="text-violet-600" /> Kullanılan Prompt</h3>
                    <button onClick={() => setEnhPromptView(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">{enhPromptView.ad}</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap max-h-[50vh] overflow-y-auto">{enhPromptView.prompt}</div>
                  <button onClick={() => { navigator.clipboard.writeText(enhPromptView.prompt); toast.success('Prompt kopyalandı'); }}
                    className="mt-3 w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">Promptu Kopyala</button>
                </div>
              </div>
            )}

            {enhCompare && (
              <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={() => setEnhCompare(null)}>
                <div onClick={(e) => e.stopPropagation()} className="max-w-5xl w-full flex gap-4 items-center">
                  <div className="flex-1 text-center"><p className="text-white text-xs mb-2 font-medium">Eski Görsel</p><img src={enhCompare.old} className="w-full rounded-xl object-contain max-h-[80vh]" /></div>
                  <div className="flex-1 text-center"><p className="text-white text-xs mb-2 font-medium">Yeni Görsel</p><img src={enhCompare.new} className="w-full rounded-xl object-contain max-h-[80vh]" /></div>
                </div>
                <button onClick={() => setEnhCompare(null)} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={28} /></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
  }

  // ═══ LIST VIEW (Redesigned) ═══
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">Kataloglarım</h1>
          <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">{catalogs.length}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => loadRequests()} className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"><ShoppingBag size={15} /> Gelen Talepler</button>
          <button onClick={() => setView('canli')} className="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-700 hover:bg-emerald-100 inline-flex items-center gap-1.5"><Eye size={15} /> Canlı İzleme</button>
          <button onClick={create} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-sm"><Plus size={15} /> Yeni Katalog</button>
        </div>
      </div>

      {/* Compact Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: 'Aktif Katalog', value: String(catalogs.filter(c => c.aktif).length), color: 'text-emerald-600 border-emerald-200 bg-emerald-50/50' },
          { label: 'Toplam Ürün', value: fmtK(totalProducts), color: 'text-violet-600 border-violet-200 bg-violet-50/50' },
          { label: 'Görüntülenme', value: fmtK(totalViews), color: 'text-sky-600 border-sky-200 bg-sky-50/50', pct: pctChange(totalViews30, totalViews30Prev) },
          { label: 'Sipariş', value: fmtK(totalOrders), color: 'text-amber-600 border-amber-200 bg-amber-50/50', pct: pctChange(totalOrders30, totalOrders30Prev) },
          { label: 'Başarılı Ciro', value: fmtPK(totalCiro), color: 'text-emerald-600 border-emerald-200 bg-emerald-50/50', pct: pctChange(totalCiro30, totalCiro30Prev) },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl border px-3 py-2.5 ${s.color}`}>
            <p className="text-[10px] font-medium opacity-70">{s.label}</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold">{s.value}</span>
              {s.pct !== undefined && <PctBadge val={s.pct} />}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Katalog ara..." className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-emerald-400 outline-none" />
        </div>
        <select value={durumFilter} onChange={(e) => setDurumFilter(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2">
          <option value="">Tümü</option><option value="aktif">Aktif</option><option value="pasif">Pasif</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2">
          <option value="updatedAt">Son Güncellenen</option><option value="ad">Ada Göre</option><option value="siparis">Siparişe Göre</option><option value="ciro">Ciroya Göre</option>
        </select>
        <div className="flex gap-0.5 ml-auto">
          <button onClick={() => setListMode('grid')} className={`p-2 rounded-lg border ${listMode === 'grid' ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-400'}`}><LayoutGrid size={15} /></button>
          <button onClick={() => setListMode('list')} className={`p-2 rounded-lg border ${listMode === 'list' ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-400'}`}><List size={15} /></button>
        </div>
        {(searchQ || durumFilter) && <button onClick={() => { setSearchQ(''); setDurumFilter(''); }} className="px-2.5 py-2 text-xs border border-rose-200 text-rose-500 rounded-lg hover:bg-rose-50 inline-flex items-center gap-1"><X size={13} /> Temizle</button>}
      </div>

      {/* Catalog Cards */}
      {loading ? <p className="text-center text-slate-400 py-12">Yükleniyor...</p> : filteredCatalogs.length === 0 ? (
        <div className="text-center py-12"><Package size={32} className="mx-auto mb-2 text-slate-300" /><p className="text-slate-400 text-sm">Katalog bulunamadı.</p></div>
      ) : (
        <div className={listMode === 'grid' ? 'grid gap-3 md:grid-cols-2' : 'space-y-3'}>
          {filteredCatalogs.map((c) => {
            const img = getCatalogImage(c);
            const st = stats[c.id] || {};
            const pCount = Array.isArray(c.productIds) ? c.productIds.length : 0;
            const kCount = Array.isArray(c.kampanyalar) ? c.kampanyalar.length : 0;
            const viewPct = pctChange(st.goruntulenme30 || 0, st.goruntulenme30Prev || 0);
            const orderPct = pctChange(st.siparis30 || 0, st.siparis30Prev || 0);
            const ciroPct = pctChange(st.ciro30 || 0, st.ciro30Prev || 0);
            return (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-sm transition-shadow relative">
                {/* Header row */}
                <div className="px-4 py-3 flex gap-3 items-start">
                  {img && <img loading="lazy" src={img} className="w-14 h-14 rounded-lg object-cover bg-slate-100 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${c.aktif ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.aktif ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {c.aktif ? 'Aktif' : 'Pasif'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 truncate mt-0.5 flex items-center gap-1.5">
                      {c.ad}
                      <button onClick={() => openEditor(c)} className="text-slate-300 hover:text-violet-600"><Pen size={12} /></button>
                    </h3>
                    <p className="text-[10px] text-slate-400">{pCount} ürün · {kCount} kampanya</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-slate-400 bg-slate-50 rounded px-1.5 py-0.5 truncate max-w-[220px]">diljar.com/ozel-katalog/{c.slug}</span>
                      <button onClick={() => copyLink(c.slug)} className="text-slate-300 hover:text-violet-600"><Copy size={12} /></button>
                    </div>
                  </div>
                  <div className="relative shrink-0">
                    <button onClick={() => setMenuOpen(menuOpen === c.id ? null : c.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><MoreVertical size={16} /></button>
                    {menuOpen === c.id && (<>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg border border-slate-200 shadow-lg py-1 min-w-[130px]">
                        <button onClick={() => toggleAktif(c)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50">{c.aktif ? 'Pasife Al' : 'Aktif Et'}</button>
                        <button onClick={() => { setMenuOpen(null); del(c.id); }} className="w-full text-left px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50">Sil</button>
                      </div>
                    </>)}
                  </div>
                </div>

                {/* Stok Analizi + Performans */}
                <div className="grid grid-cols-5 border-t border-slate-100 divide-x divide-slate-100">
                  {[
                    { label: 'Stoklu', val: `${st.stokluUrun || 0}/${st.urunSayisi || pCount}`, sub: `${fmtK(st.toplamStok || 0)} adet`, color: 'text-violet-600' },
                    { label: 'Görüntülenme', val: fmtK(st.goruntulenme || 0), pct: viewPct, color: 'text-sky-600' },
                    { label: 'Başarılı', val: `${st.basariliSiparis || 0}`, sub: fmtPK(st.basariliCiro || 0), color: 'text-emerald-600' },
                    { label: 'Bekleyen', val: `${st.bekleyenSiparis || 0}`, sub: fmtPK(st.bekleyenCiro || 0), color: 'text-amber-600' },
                    { label: 'İptal', val: `${st.iptalSiparis || 0}`, sub: fmtPK(st.iptalCiro || 0), color: 'text-rose-500' },
                  ].map((item, idx) => (
                    <div key={idx} className="px-2 py-2 text-center">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wide">{item.label}</p>
                      <p className={`text-sm font-bold ${item.color}`}>{item.val}</p>
                      {item.sub && <p className="text-[10px] text-slate-400">{item.sub}</p>}
                      {item.pct !== undefined && <PctBadge val={item.pct} />}
                    </div>
                  ))}
                </div>

                {/* Maliyet satırı — tıkla, detay raporu aç */}
                {(() => {
                  const tAlis = st.toplamAlis || 0;
                  const tSatis = st.toplamSatis || 0;
                  const potKar = tSatis - tAlis;
                  const marjPct = tSatis > 0 ? (potKar / tSatis) * 100 : 0;
                  return (
                    <div onClick={() => openStockReport(c)} title="Güncel stok maliyet detayını gör" className="border-t border-slate-100 px-4 py-2 flex items-center gap-4 text-[10px] text-slate-400 flex-wrap cursor-pointer hover:bg-slate-50 transition-colors">
                      <span>Alış Maliyeti: <strong className="text-slate-600">{fmtPK(tAlis)}</strong></span>
                      <span>Satış Değeri: <strong className="text-slate-600">{fmtPK(tSatis)}</strong></span>
                      <span>Pot. Kâr: <strong className={potKar >= 0 ? 'text-emerald-600' : 'text-rose-500'}>{fmtPK(potKar)}</strong></span>
                      <span>Marj: <strong className={potKar >= 0 ? 'text-emerald-600' : 'text-rose-500'}>%{marjPct.toFixed(1)}</strong></span>
                      <span>Gerçekleşen: <strong className="text-emerald-600">{fmtPK(st.basariliCiro || 0)}</strong></span>
                      <span className="text-emerald-500 font-medium">Detay →</span>
                      <span className="ml-auto text-slate-300">{new Date(c.updatedAt).toLocaleDateString('tr-TR')} {new Date(c.updatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  );
                })()}

                {/* Actions */}
                <div className="border-t border-slate-100 grid grid-cols-3">
                  <button onClick={() => openEditor(c)} className="py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 border-r border-slate-100"><Pen size={13} /> Düzenle</button>
                  <button onClick={() => openEditor(c)} className="py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 border-r border-slate-100"><Package size={13} /> Ürünleri Yönet</button>
                  <a href={`/ozel-katalog/${c.slug}`} target="_blank" rel="noopener noreferrer" className="py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 inline-flex items-center justify-center gap-1.5 rounded-br-xl"><ExternalLink size={13} /> Görüntüle</a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create new catalog card */}
      <div onClick={create} className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors">
        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0"><Plus size={20} className="text-emerald-600" /></div>
        <div>
          <p className="text-sm font-semibold text-emerald-700">Yeni Katalog Oluştur</p>
          <p className="text-xs text-slate-400">Yeni bir katalog oluşturarak ürünlerinizi paylaşın ve satışlarınızı artırın.</p>
        </div>
      </div>

      {stockReport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setStockReport(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-5xl bg-white rounded-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Güncel Stok Maliyet Raporu</h2>
                <p className="text-xs text-slate-400">{stockReport.catalog?.ad} · yalnız aktif & stoklu ürünler</p>
              </div>
              <button onClick={() => setStockReport(null)}><X size={20} className="text-slate-400" /></button>
            </div>
            {stockLoading ? (
              <div className="py-16 text-center text-sm text-slate-400">Yükleniyor...</div>
            ) : (stockReport.rows || []).length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">Stoğu olan aktif ürün bulunamadı.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500 z-10">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Ürün</th>
                      <th className="px-3 py-2 font-medium text-right">Stok</th>
                      <th className="px-3 py-2 font-medium text-right">Birim Alış</th>
                      <th className="px-3 py-2 font-medium text-right">Birim Satış</th>
                      <th className="px-3 py-2 font-medium text-right">Top. Alış</th>
                      <th className="px-3 py-2 font-medium text-right">Top. Satış</th>
                      <th className="px-3 py-2 font-medium text-right">Kâr</th>
                      <th className="px-3 py-2 font-medium text-right">Marj</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(stockReport.rows || []).map((r: any) => {
                      const hasVars = (r.variations || []).length > 0;
                      const open = !!stockExpand[r.id];
                      return (
                        <Fragment key={r.id}>
                          <tr className={hasVars ? 'cursor-pointer hover:bg-slate-50' : ''} onClick={hasVars ? () => setStockExpand((s) => ({ ...s, [r.id]: !s[r.id] })) : undefined}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                {hasVars && <span className="text-slate-300">{open ? '▾' : '▸'}</span>}
                                <div>
                                  <p className="font-medium text-slate-700 max-w-[260px] truncate">{r.ad}</p>
                                  {r.kod && <p className="text-[10px] text-slate-400">{r.kod}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-violet-600">{fmtK(r.stok)}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{fmtP(r.alisFiyat)}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{fmtP(r.satisFiyatEfektif)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{fmtP(r.toplamAlis)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{fmtP(r.toplamSatis)}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${r.kar >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{fmtP(r.kar)}</td>
                            <td className={`px-3 py-2 text-right ${r.kar >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>%{r.marj.toFixed(1)}</td>
                          </tr>
                          {hasVars && open && (r.variations || []).map((v: any, vi: number) => (
                            <tr key={r.id + '-' + vi} className="bg-slate-50/60">
                              <td className="px-3 py-1.5 pl-9 text-[11px] text-slate-500">{v.ad}: <strong className="text-slate-600">{v.deger}</strong>{v.ekFiyat ? <span className="text-amber-600"> (+{fmtP(v.ekFiyat)})</span> : null}</td>
                              <td className="px-3 py-1.5 text-right text-slate-500">{fmtK(v.stok)}</td>
                              <td className="px-3 py-1.5"></td>
                              <td className="px-3 py-1.5 text-right text-slate-500">{fmtP(v.birimSatis)}</td>
                              <td className="px-3 py-1.5"></td>
                              <td className="px-3 py-1.5 text-right text-slate-500">{fmtP(v.birimSatis * v.stok)}</td>
                              <td className="px-3 py-1.5"></td>
                              <td className="px-3 py-1.5"></td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  {stockReport.totals && (
                    <tfoot className="sticky bottom-0 bg-slate-100 font-bold text-slate-700">
                      <tr>
                        <td className="px-3 py-2.5">Toplam ({stockReport.totals.stokluUrun} ürün)</td>
                        <td className="px-3 py-2.5 text-right text-violet-700">{fmtK(stockReport.totals.toplamStok)}</td>
                        <td className="px-3 py-2.5"></td>
                        <td className="px-3 py-2.5"></td>
                        <td className="px-3 py-2.5 text-right">{fmtP(stockReport.totals.toplamAlis)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtP(stockReport.totals.toplamSatis)}</td>
                        <td className={`px-3 py-2.5 text-right ${stockReport.totals.kar >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{fmtP(stockReport.totals.kar)}</td>
                        <td className={`px-3 py-2.5 text-right ${stockReport.totals.kar >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>%{stockReport.totals.marj.toFixed(1)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Canlı İzleme Component'i ───
function CanliIzleme({ onBack }: { onBack: () => void }) {
  const [visitors, setVisitors] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [toplam, setToplam] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterCatalog, setFilterCatalog] = useState('');
  const [catalogs, setCatalogs] = useState<{ id: string; ad: string }[]>([]);

  // Katalog listesini yükle
  useEffect(() => {
    api.get('/store/catalogs').then(r => setCatalogs((r.data?.rows || r.data || []).map((c: any) => ({ id: c.id, ad: c.ad })))).catch(() => {});
  }, []);

  const fetchLive = () => {
    api.get('/store/catalog-live', { params: filterCatalog ? { catalogId: filterCatalog } : {} })
      .then(r => {
        setVisitors(r.data.visitors || []);
        setStats(r.data.stats || {});
        setToplam(r.data.toplam || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchLive(); const iv = setInterval(fetchLive, 5000); return () => clearInterval(iv); }, [filterCatalog]);

  const durumBadge = (d: string) => {
    const map: Record<string, { text: string; cls: string; icon: string }> = {
      geziyor: { text: 'Geziyor', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: '👁️' },
      urun_inceliyor: { text: 'Ürün İnceliyor', cls: 'bg-violet-50 text-violet-700 border-violet-200', icon: '🔍' },
      sepette: { text: 'Sepette', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: '🛒' },
      siparis_veriyor: { text: 'Sipariş Veriyor', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '📦' },
    };
    const m = map[d] || { text: d, cls: 'bg-slate-50 text-slate-600 border-slate-200', icon: '•' };
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${m.cls}`}>{m.icon} {m.text}</span>;
  };

  const toplamSepetli = visitors.filter(v => v.sepetUrunSayisi > 0).length;
  const toplamSepetTutar = visitors.reduce((s, v) => s + (v.sepetToplam || 0), 0);
  const durumDagilimi = { geziyor: 0, urun_inceliyor: 0, sepette: 0, siparis_veriyor: 0 };
  visitors.forEach(v => { if (v.durum in durumDagilimi) (durumDagilimi as any)[v.durum]++; });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"><ChevronLeft size={16} /> Geri</button>
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" /> Canlı İzleme
            </h2>
            <p className="text-xs text-slate-400">Her 5 saniyede otomatik güncellenir</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={filterCatalog} onChange={e => setFilterCatalog(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white">
            <option value="">Tüm Kataloglar</option>
            {catalogs.map(c => <option key={c.id} value={c.id}>{c.ad}</option>)}
          </select>
        </div>
      </div>

      {/* Özet Kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Aktif Ziyaretçi</p>
          <p className="text-2xl font-bold text-slate-700">{toplam}</p>
        </div>
        <div className="bg-white border border-blue-100 rounded-xl p-3 text-center">
          <p className="text-[10px] text-blue-400 uppercase font-semibold">Geziyor</p>
          <p className="text-2xl font-bold text-blue-600">{durumDagilimi.geziyor}</p>
        </div>
        <div className="bg-white border border-violet-100 rounded-xl p-3 text-center">
          <p className="text-[10px] text-violet-400 uppercase font-semibold">Ürün İnceliyor</p>
          <p className="text-2xl font-bold text-violet-600">{durumDagilimi.urun_inceliyor}</p>
        </div>
        <div className="bg-white border border-amber-100 rounded-xl p-3 text-center">
          <p className="text-[10px] text-amber-400 uppercase font-semibold">Sepette</p>
          <p className="text-2xl font-bold text-amber-600">{toplamSepetli}</p>
          <p className="text-[10px] text-amber-500">{toplamSepetTutar.toLocaleString('tr-TR')}₺</p>
        </div>
        <div className="bg-white border border-emerald-100 rounded-xl p-3 text-center">
          <p className="text-[10px] text-emerald-400 uppercase font-semibold">Sipariş Veriyor</p>
          <p className="text-2xl font-bold text-emerald-600">{durumDagilimi.siparis_veriyor}</p>
        </div>
      </div>

      {/* Ziyaretçi Listesi */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Yükleniyor...</div>
      ) : visitors.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <Eye size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Şu an aktif ziyaretçi yok</p>
          <p className="text-xs text-slate-400 mt-1">Katalog linkiniz açıldığında buradan canlı takip edebilirsiniz</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
            <p className="text-xs font-semibold text-slate-600">{visitors.length} aktif ziyaretçi</p>
          </div>
          <div className="divide-y divide-slate-100">
            {visitors.map((v, i) => (
              <div key={v.visitorId + v.catalogId} className="px-4 py-3 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{i + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-slate-700">Ziyaretçi #{v.visitorId.slice(0, 6)}</span>
                        {durumBadge(v.durum)}
                        <span className="text-[10px] text-slate-400">Sayfa {v.sayfaNo}</span>
                        <span className="text-[10px] text-slate-400">{v.sureDk < 1 ? '<1dk' : `${v.sureDk}dk`}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{v.catalogAd} {v.ip ? `• ${v.ip}` : ''}</p>
                      {/* İncelenen ürün */}
                      {v.sonGorulen && (
                        <div className="flex items-center gap-2 mt-1.5 bg-violet-50/50 rounded-lg px-2 py-1 w-fit">
                          {v.sonGorulenImg && <img src={v.sonGorulenImg} alt="" className="w-7 h-7 rounded object-cover" />}
                          <p className="text-[10px] text-violet-700">🔍 {v.sonGorulen}</p>
                        </div>
                      )}
                      {/* Sepet içeriği */}
                      {v.sepetUrunSayisi > 0 && (
                        <div className="mt-1.5 bg-amber-50/50 rounded-lg px-2 py-1 w-fit">
                          <p className="text-[10px] font-medium text-amber-700">🛒 {v.sepetUrunSayisi} ürün — {(v.sepetToplam || 0).toLocaleString('tr-TR')}₺</p>
                          <p className="text-[10px] text-amber-600/70 truncate max-w-[350px]">{(v.sepetUrunler || []).join(' • ')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Katalog Bazlı Dağılım */}
      {catalogs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Katalog Bazlı Durum</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {catalogs.map(c => {
              const s = stats[c.id];
              return (
                <div key={c.id} className={`border rounded-lg p-3 cursor-pointer transition-colors ${filterCatalog === c.id ? 'border-violet-300 bg-violet-50/50' : 'border-slate-100 bg-slate-50/30 hover:bg-slate-50'}`} onClick={() => setFilterCatalog(filterCatalog === c.id ? '' : c.id)}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700 truncate">{c.ad}</p>
                    {s ? <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> : <span className="w-2 h-2 bg-slate-300 rounded-full" />}
                  </div>
                  {s ? (
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-blue-600 font-medium">{s.aktif} kişi</span>
                      <span className="text-[10px] text-amber-600">{s.sepetli} sepetli</span>
                      <span className="text-[10px] text-emerald-600">{(s.toplam || 0).toLocaleString('tr-TR')}₺</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">Aktif ziyaretçi yok</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
