import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, X, Package, CheckCircle2, AlertTriangle, Ban, EyeOff, Download, Upload, Copy, BarChart3, List, LayoutGrid, Settings, Wallet, TrendingUp, ScanLine, Tag, RefreshCw, Store, Globe } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import ImageDropzone from '../components/ImageDropzone';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const CINSIYET = ['kadin', 'erkek', 'unisex', 'cocuk'];
const PERIYOT: Record<string, number> = { '7': 7, '30': 30, '90': 90, '0': 99999 };

interface Props { autoAdd?: boolean }

export default function Urunlerim({ autoAdd }: Props) {
  const { products, categories, salesCodes, variationTemplates, orders, reload } = useStore();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [katFilter, setKatFilter] = useState('');
  const [markaFilter, setMarkaFilter] = useState('');
  const [stokFilter, setStokFilter] = useState('all');
  const [magazaFilter, setMagazaFilter] = useState('all');
  const [durumFilter, setDurumFilter] = useState('all');
  const [tab, setTab] = useState('tum');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState('30');
  const [modalOpen, setModalOpen] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [info, setInfo] = useState<any | null>(null);
  const [bulk, setBulk] = useState<null | 'fiyat' | 'stok' | 'kategori'>(null);
  const [bulkForm, setBulkForm] = useState<any>({ mode: 'yuzde', val: '', kategoriId: '' });
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (autoAdd) openNew(); /* eslint-disable-next-line */ }, [autoAdd]);

  const katName = (id?: string) => categories.find((c) => c.id === id)?.ad || '';
  const availableCodes = salesCodes.filter((c) => !c.used || (edit && c.code === edit.salesCode));
  const markalar = useMemo(() => Array.from(new Set(products.map((p) => p.marka).filter(Boolean))) as string[], [products]);

  // Satış verisi (ciro + adet), dönem filtreli
  const sold = useMemo(() => {
    const rev = new Map<string, number>(); const qty = new Map<string, number>();
    const cutoff = Date.now() - PERIYOT[period] * 86400000;
    for (const o of orders) { if (o.durum === 'iptal') continue; if (new Date(o.createdAt).getTime() < cutoff) continue; for (const it of (o.items || [])) { if (!it.productId) continue; rev.set(it.productId, (rev.get(it.productId) || 0) + (Number(it.fiyat) || 0) * (Number(it.adet) || 1)); qty.set(it.productId, (qty.get(it.productId) || 0) + (Number(it.adet) || 1)); } }
    return { rev, qty };
  }, [orders, period]);
  // Tüm zamanlar satış (KPI/tablo için)
  const soldAll = useMemo(() => {
    const rev = new Map<string, number>(); const qty = new Map<string, number>();
    for (const o of orders) { if (o.durum === 'iptal') continue; for (const it of (o.items || [])) { if (!it.productId) continue; rev.set(it.productId, (rev.get(it.productId) || 0) + (Number(it.fiyat) || 0) * (Number(it.adet) || 1)); qty.set(it.productId, (qty.get(it.productId) || 0) + (Number(it.adet) || 1)); } }
    return { rev, qty };
  }, [orders]);

  const durumOf = (p: any) => {
    const s = p.stokAdeti || 0;
    if (!p.aktif) return { t: 'Pasif', c: 'bg-slate-100 text-slate-500' };
    if (s === 0) return { t: 'Stok Yok', c: 'bg-red-100 text-red-600' };
    if (s <= 5) return { t: 'Stok Azaldı', c: 'bg-amber-100 text-amber-700' };
    return { t: 'Aktif', c: 'bg-green-100 text-green-700' };
  };
  const stokColor = (s: number) => s === 0 ? 'text-red-500' : s <= 5 ? 'text-amber-600' : 'text-green-600';
  const varyasyonOzet = (p: any) => (p.variations || []).map((v: any) => v.deger).slice(0, 2).join(' / ');

  const kpi = useMemo(() => {
    let stokta = 0, azalan = 0, yok = 0, pasif = 0, maliyet = 0;
    for (const p of products) { const s = p.stokAdeti || 0; if (!p.aktif) pasif++; if (s === 0) yok++; else { stokta++; if (s <= 5) azalan++; } maliyet += (p.alisFiyat || 0) * s; }
    let satis = 0; for (const v of soldAll.rev.values()) satis += v;
    const toplam = products.length || 1;
    const kar = satis - maliyet;
    return { toplam: products.length, stokta, azalan, yok, pasif, maliyet, satis, kar, karPct: satis ? (kar / satis) * 100 : 0, pct: (n: number) => ((n / toplam) * 100).toFixed(1) };
  }, [products, soldAll]);

  const topSellers = useMemo(() => products.map((p) => ({ p, q: sold.qty.get(p.id) || 0 })).filter((x) => x.q > 0).sort((a, b) => b.q - a.q).slice(0, 8), [products, sold]);
  const maxQ = topSellers[0]?.q || 1;

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      if (katFilter && p.kategoriId !== katFilter) return false;
      if (markaFilter && p.marka !== markaFilter) return false;
      if (durumFilter === 'aktif' && !p.aktif) return false;
      if (durumFilter === 'pasif' && p.aktif) return false;
      if (magazaFilter === 'acik' && !p.onlineMagaza) return false;
      if (magazaFilter === 'kapali' && p.onlineMagaza) return false;
      const s = p.stokAdeti || 0;
      if (stokFilter === 'var' && s <= 0) return false;
      if (stokFilter === 'azalan' && !(s > 0 && s <= 5)) return false;
      if (stokFilter === 'yok' && s !== 0) return false;
      if (search) { const q = search.toLowerCase(); return [p.ad, p.sku, p.salesCode, p.barkod, p.marka].some((f) => (f || '').toLowerCase().includes(q)); }
      return true;
    });
    if (tab === 'stok') list = [...list].sort((a, b) => (a.stokAdeti || 0) - (b.stokAdeti || 0));
    else if (tab === 'encok') list = [...list].sort((a, b) => (soldAll.qty.get(b.id) || 0) - (soldAll.qty.get(a.id) || 0));
    else if (tab === 'kar') list = [...list].sort((a, b) => ((soldAll.rev.get(b.id) || 0) - (b.alisFiyat || 0) * (b.stokAdeti || 0)) - ((soldAll.rev.get(a.id) || 0) - (a.alisFiyat || 0) * (a.stokAdeti || 0)));
    return list;
  }, [products, katFilter, markaFilter, durumFilter, stokFilter, magazaFilter, search, tab, soldAll]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);
  const pageIds = pageItems.map((p) => p.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
  const toggleSelAll = () => setSel((s) => { const n = new Set(s); if (allSelected) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id)); return n; });
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selProducts = () => products.filter((p) => sel.has(p.id));

  // ── Form ──
  const empty = { ad: '', sku: '', salesCode: '', marka: '', cinsiyet: 'unisex', kategoriId: '', alisFiyat: '', satisFiyat: '', eskiFiyat: '', oneCikan: false, onlineMagaza: false, stokAdeti: '', aciklama: '', tedarikciAd: '', tedarikciBarkod: '', lokasyon: '', images: [] as string[] };
  const [form, setForm] = useState<any>(empty);
  const [varRows, setVarRows] = useState<any[]>([]);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const applyTemplate = (id: string) => { const t = variationTemplates.find((x: any) => x.id === id); if (!t) return; setVarRows((t.values || []).map((deger: string) => ({ ad: t.ad, deger, stok: '' }))); };
  const setVarStok = (i: number, stok: string) => setVarRows((rs) => rs.map((r, idx) => idx === i ? { ...r, stok } : r));
  const delVar = (i: number) => setVarRows((rs) => rs.filter((_, idx) => idx !== i));

  function openNew() { setEdit(null); setForm({ ...empty }); setVarRows([]); setModalOpen(true); }
  function openEdit(p: any) {
    setEdit(p);
    setForm({ ad: p.ad, sku: p.sku || '', salesCode: p.salesCode || '', marka: p.marka || '', cinsiyet: p.cinsiyet || 'unisex', kategoriId: p.kategoriId || '', alisFiyat: p.alisFiyat ?? '', satisFiyat: p.satisFiyat ?? '', eskiFiyat: p.eskiFiyat ?? '', oneCikan: !!p.oneCikan, onlineMagaza: !!p.onlineMagaza, stokAdeti: p.stokAdeti ?? '', aciklama: p.aciklama || '', tedarikciAd: p.tedarikciAd || '', tedarikciBarkod: p.tedarikciBarkod || '', lokasyon: p.lokasyon || '', images: p.images || [] });
    setVarRows((p.variations || []).map((v: any) => ({ ad: v.ad, deger: v.deger, stok: String(v.stok ?? '') })));
    setModalOpen(true);
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ad || !form.cinsiyet || !form.lokasyon) { toast.error('Ürün adı, cinsiyet ve lokasyon zorunludur'); return; }
    if ((form.images || []).length === 0) { toast.error('En az 1 ürün görseli ekleyin'); return; }
    const variations = varRows.filter((r) => r.deger).map((r) => ({ ad: r.ad, deger: r.deger, stok: Number(r.stok) || 0 }));
    const body = {
      ad: form.ad, sku: form.sku || null, salesCode: form.salesCode || null, marka: form.marka || null, cinsiyet: form.cinsiyet,
      kategoriId: form.kategoriId || null, alisFiyat: Number(form.alisFiyat) || 0, satisFiyat: Number(form.satisFiyat) || 0,
      eskiFiyat: form.eskiFiyat ? Number(form.eskiFiyat) : null, oneCikan: !!form.oneCikan, onlineMagaza: !!form.onlineMagaza,
      stokAdeti: variations.length ? variations.reduce((s, v) => s + v.stok, 0) : (Number(form.stokAdeti) || 0),
      aciklama: form.aciklama || null, tedarikciAd: form.tedarikciAd || null, tedarikciBarkod: form.tedarikciBarkod || null, lokasyon: form.lokasyon, images: form.images, variations,
    };
    try { if (edit) await api.patch(`/store/products/${edit.id}`, body); else await api.post('/store/products', body); toast.success('Kaydedildi'); setModalOpen(false); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const del = async (p: any) => { if (!confirm(`"${p.ad}" silinsin mi?`)) return; try { await api.delete(`/store/products/${p.id}`); toast.success('Silindi'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const duplicate = async (p: any) => { try { await api.post('/store/products', { ad: p.ad + ' (Kopya)', sku: null, salesCode: null, marka: p.marka || null, cinsiyet: p.cinsiyet, kategoriId: p.kategoriId || null, alisFiyat: p.alisFiyat || 0, satisFiyat: p.satisFiyat || 0, eskiFiyat: p.eskiFiyat || null, oneCikan: false, stokAdeti: 0, aciklama: p.aciklama || null, lokasyon: p.lokasyon || 'Depo', images: p.images || [], variations: (p.variations || []).map((v: any) => ({ ad: v.ad, deger: v.deger, stok: 0 })) }); toast.success('Kopyalandı'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  const excelIndir = () => {
    const rows = filtered.map((p) => { const stok = p.stokAdeti || 0; const maliyet = (p.alisFiyat || 0) * stok; const ciro = soldAll.rev.get(p.id) || 0; return { 'Ürün': p.ad, 'SKU': p.sku || '', 'Satış Kodu': p.salesCode || '', 'Barkod': p.barkod || '', 'Kategori': katName(p.kategoriId), 'Marka': p.marka || '', 'Alış Fiyatı': p.alisFiyat || 0, 'Satış Fiyatı': p.satisFiyat || 0, 'Stok': stok, 'Toplam Maliyet': maliyet, 'Yapılan Satış': ciro, '+/- Durum': ciro - maliyet, 'Durum': durumOf(p).t }; });
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Ürünler'); XLSX.writeFile(wb, 'urunler.xlsx');
  };
  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const buf = await file.arrayBuffer(); const wb = XLSX.read(buf); const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (!rows.length) { toast.error('Satır yok'); return; }
      let ok = 0;
      for (const r of rows) { const ad = r['Ürün'] || r['Ürün Adı'] || r['ad']; if (!ad) continue; try { await api.post('/store/products', { ad: String(ad), sku: r['SKU'] ? String(r['SKU']) : null, salesCode: r['Satış Kodu'] ? String(r['Satış Kodu']) : null, marka: r['Marka'] ? String(r['Marka']) : null, cinsiyet: 'unisex', alisFiyat: Number(r['Alış Fiyatı']) || 0, satisFiyat: Number(r['Satış Fiyatı']) || 0, stokAdeti: Number(r['Stok']) || 0, lokasyon: r['Lokasyon'] ? String(r['Lokasyon']) : 'Depo', images: [] }); ok++; } catch { /* */ } }
      toast.success(`${ok} ürün içe aktarıldı`); reload();
    } catch { toast.error('Dosya okunamadı'); } finally { if (importRef.current) importRef.current.value = ''; }
  };

  const barkodYazdir = (list?: any[]) => {
    const arr = list || (sel.size ? selProducts() : filtered);
    if (!arr.length) { toast.error('Ürün yok'); return; }
    const bars = (val: string) => Array.from(val || '0000').map((ch) => { const w = (ch.charCodeAt(0) % 3) + 1; return `<span style="display:inline-block;width:${w}px;height:38px;background:#111;margin-right:1px"></span>`; }).join('');
    const labels = arr.map((p) => `<div style="border:1px solid #ddd;border-radius:6px;padding:8px;text-align:center;width:200px;display:inline-block;margin:4px;vertical-align:top">
      <div style="font-size:12px;font-weight:600;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(p.ad || '').replace(/</g, '')}</div>
      <div style="font-size:10px;color:#888;margin-bottom:4px">${p.sku || p.salesCode || ''}</div>
      <div style="line-height:0">${bars(p.barkod || '')}</div>
      <div style="font-family:monospace;font-size:11px;letter-spacing:2px;margin-top:2px">${p.barkod || '-'}</div>
      <div style="font-size:11px;font-weight:700;margin-top:2px">${fmt(p.satisFiyat)}</div>
    </div>`).join('');
    const w = window.open('', '_blank'); if (!w) { toast.error('Açılır pencere engellendi'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barkod</title></head><body style="font-family:Arial">${labels}<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
    w.document.close();
  };

  const runBulk = async () => {
    const list = selProducts(); if (!list.length) { toast.error('Önce ürün seçin'); return; }
    try {
      for (const p of list) {
        if (bulk === 'fiyat') { const v = Number(bulkForm.val) || 0; const yeni = bulkForm.mode === 'yuzde' ? Math.round((p.satisFiyat || 0) * (1 + v / 100)) : bulkForm.mode === 'set' ? v : (p.satisFiyat || 0) + v; await api.patch(`/store/products/${p.id}`, { satisFiyat: yeni }); }
        else if (bulk === 'stok') { await api.patch(`/store/products/${p.id}`, { stokAdeti: Number(bulkForm.val) || 0 }); }
        else if (bulk === 'kategori') { await api.patch(`/store/products/${p.id}`, { kategoriId: bulkForm.kategoriId || null }); }
      }
      toast.success(`${list.length} ürün güncellendi`); setBulk(null); setSel(new Set()); reload();
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  // Online mağaza yayını
  const toggleOnline = async (p: any) => {
    try { await api.patch(`/store/products/${p.id}`, { onlineMagaza: !p.onlineMagaza }); toast.success(!p.onlineMagaza ? 'Mağazaya açıldı' : 'Mağazadan kaldırıldı'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const runPublish = async (open: boolean) => {
    const list = selProducts(); if (!list.length) { toast.error('Önce ürün seçin'); return; }
    try { for (const p of list) await api.patch(`/store/products/${p.id}`, { onlineMagaza: open }); toast.success(`${list.length} ürün ${open ? 'mağazaya açıldı' : 'mağazadan kaldırıldı'}`); setSel(new Set()); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const pages = useMemo(() => { const a: (number | string)[] = []; if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) a.push(i); return a; } a.push(1, 2, 3, 4, 5, '...', totalPages); return a; }, [totalPages]);

  // Stok donut segmentleri
  const donut = [
    { t: 'Stokta Olan', n: kpi.stokta, c: '#22c55e' }, { t: 'Stokta Azalan', n: kpi.azalan, c: '#f59e0b' },
    { t: 'Stokta Olmayan', n: kpi.yok, c: '#ef4444' }, { t: 'Pasif Ürün', n: kpi.pasif, c: '#94a3b8' },
  ];
  const donutTotal = donut.reduce((s, d) => s + d.n, 0) || 1;

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center"><Package className="text-indigo-600" size={22} /></div>
          <div><h1 className="text-2xl font-bold text-slate-800">Ürünlerim</h1><p className="text-sm text-slate-400">Tüm ürünlerinizi yönetin, analiz edin ve barkod yazdırın.</p></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={excelIndir} className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50"><Download size={16} className="text-green-600" /> Excel İndir</button>
          <button onClick={() => barkodYazdir()} className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50"><ScanLine size={16} className="text-indigo-600" /> Barkod Yazdır</button>
          <button onClick={() => importRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50"><Upload size={16} /> Ürünleri İçe Aktar</button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" onChange={importFile} className="hidden" />
          <button onClick={openNew} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"><Plus size={16} /> Yeni Ürün Ekle</button>
        </div>
      </div>

      {/* KPI (8) */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Kpi icon={Package} cls="bg-indigo-100 text-indigo-600" label="Toplam Ürün" value={kpi.toplam.toLocaleString('tr-TR')} sub="Aktif ürün" />
        <Kpi icon={CheckCircle2} cls="bg-green-100 text-green-600" label="Stokta Olan" value={kpi.stokta} sub={`%${kpi.pct(kpi.stokta)}`} />
        <Kpi icon={AlertTriangle} cls="bg-amber-100 text-amber-600" label="Stokta Azalan" value={kpi.azalan} sub={`%${kpi.pct(kpi.azalan)}`} />
        <Kpi icon={Ban} cls="bg-red-100 text-red-600" label="Stokta Olmayan" value={kpi.yok} sub={`%${kpi.pct(kpi.yok)}`} />
        <Kpi icon={EyeOff} cls="bg-slate-200 text-slate-600" label="Pasif Ürün" value={kpi.pasif} sub={`%${kpi.pct(kpi.pasif)}`} />
        <Kpi icon={Wallet} cls="bg-sky-100 text-sky-600" label="Toplam Maliyet" value={fmt0(kpi.maliyet)} />
        <Kpi icon={Wallet} cls="bg-violet-100 text-violet-600" label="Yapılan Satış" value={fmt0(kpi.satis)} />
        <Kpi icon={TrendingUp} cls="bg-emerald-100 text-emerald-600" label="Kâr / Zarar" value={fmt0(kpi.kar)} sub={`%${kpi.karPct.toFixed(1)}`} valueCls={kpi.kar >= 0 ? 'text-green-600' : 'text-red-600'} />
      </div>

      {/* Sekmeler */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {[['tum', 'Tüm Ürünler'], ['stok', 'Stok Durumu'], ['encok', 'En Çok Satılanlar'], ['kar', 'Kâr / Zarar Analizi']].map(([k, t]) => (
          <button key={k} onClick={() => { setTab(k); setPage(1); }} className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${tab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
        {/* SOL: filtre + tablo */}
        <div className="space-y-4 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Ürün adı, barkod, SKU veya satış kodu ara..." className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl" /></div>
            <Sel label="Kategori" value={katFilter} onChange={(v) => { setKatFilter(v); setPage(1); }} options={[['', 'Tümü'], ...categories.map((c) => [c.id, c.ad] as [string, string])]} />
            <Sel label="Marka" value={markaFilter} onChange={(v) => { setMarkaFilter(v); setPage(1); }} options={[['', 'Tümü'], ...markalar.map((m) => [m, m] as [string, string])]} />
            <Sel label="Durum" value={durumFilter} onChange={(v) => { setDurumFilter(v); setPage(1); }} options={[['all', 'Tümü'], ['aktif', 'Aktif'], ['pasif', 'Pasif']]} />
            <Sel label="Stok Durumu" value={stokFilter} onChange={(v) => { setStokFilter(v); setPage(1); }} options={[['all', 'Tümü'], ['var', 'Stokta Var'], ['azalan', 'Azalan'], ['yok', 'Stok Yok']]} />
            <Sel label="Mağaza" value={magazaFilter} onChange={(v) => { setMagazaFilter(v); setPage(1); }} options={[['all', 'Tümü'], ['acik', 'Mağazada'], ['kapali', 'Mağazada Değil']]} />
            <button onClick={() => { setSearch(''); setKatFilter(''); setMarkaFilter(''); setDurumFilter('all'); setStokFilter('all'); setMagazaFilter('all'); setPage(1); }} className="px-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50 self-end">Temizle</button>
            <div className="flex items-center gap-1 self-end">
              <button onClick={() => setView('list')} className={`w-9 h-9 rounded-lg border flex items-center justify-center ${view === 'list' ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'border-slate-200 text-slate-400'}`}><List size={16} /></button>
              <button onClick={() => setView('grid')} className={`w-9 h-9 rounded-lg border flex items-center justify-center ${view === 'grid' ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'border-slate-200 text-slate-400'}`}><LayoutGrid size={16} /></button>
              <button onClick={() => toast('Görünüm ayarları yakında')} className="w-9 h-9 rounded-lg border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-slate-50"><Settings size={16} /></button>
            </div>
          </div>

          {sel.size > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 flex items-center gap-2 flex-wrap text-sm">
              <span className="text-indigo-700 font-medium">{sel.size} ürün seçili</span>
              <button onClick={() => runPublish(true)} className="ml-auto px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1"><Store size={13} /> Mağazaya Aç</button>
              <button onClick={() => runPublish(false)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs inline-flex items-center gap-1"><EyeOff size={13} /> Mağazadan Kaldır</button>
              <button onClick={() => { setBulkForm({ mode: 'yuzde', val: '', kategoriId: '' }); setBulk('fiyat'); }} className="px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs">Toplu Fiyat</button>
              <button onClick={() => { setBulkForm({ mode: 'set', val: '', kategoriId: '' }); setBulk('stok'); }} className="px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs">Stok Güncelle</button>
              <button onClick={() => { setBulkForm({ mode: '', val: '', kategoriId: categories[0]?.id || '' }); setBulk('kategori'); }} className="px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs">Kategori Ata</button>
              <button onClick={() => barkodYazdir(selProducts())} className="px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs">Barkod Yazdır</button>
              <button onClick={() => setSel(new Set())} className="text-indigo-500 text-xs">Temizle</button>
              <button onClick={() => setSel(new Set(filtered.map((p) => p.id)))} className="text-indigo-600 text-xs font-medium">Tüm filtreyi seç ({filtered.length})</button>
            </div>
          )}

          {view === 'list' ? (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[1040px]">
                <thead className="text-slate-400 text-left text-xs uppercase border-b border-slate-100 whitespace-nowrap">
                  <tr>
                    <th className="px-3 py-3"><input type="checkbox" checked={allSelected} onChange={toggleSelAll} /></th>
                    <th className="px-3 py-3">Ürün</th><th className="px-3 py-3">Barkod</th><th className="px-3 py-3">SKU</th><th className="px-3 py-3">Satış Kodu</th>
                    <th className="px-3 py-3">Alış</th><th className="px-3 py-3">Satış</th><th className="px-3 py-3">Stok</th><th className="px-3 py-3">Maliyet</th>
                    <th className="px-3 py-3">Yapılan Satış</th><th className="px-3 py-3">+/- Durum</th><th className="px-3 py-3">Mağaza</th><th className="px-3 py-3">Durum</th><th className="px-3 py-3 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p) => {
                    const stok = p.stokAdeti || 0; const maliyet = (p.alisFiyat || 0) * stok; const ciro = soldAll.rev.get(p.id) || 0; const fark = ciro - maliyet; const d = durumOf(p); const vz = varyasyonOzet(p);
                    return (
                      <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="px-3 py-3"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggleSel(p.id)} /></td>
                        <td className="px-3 py-3"><div className="flex items-center gap-2.5"><img src={(p.images || [])[0] || ''} className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0" /><div className="min-w-0"><p className="font-medium text-slate-800 truncate">{p.ad}</p><p className="text-xs text-slate-400">{vz || katName(p.kategoriId) || p.marka || '-'}</p></div></div></td>
                        <td className="px-3 py-3 text-slate-500 font-mono text-xs">{p.barkod || '-'}</td>
                        <td className="px-3 py-3 text-slate-500 font-mono text-xs">{p.sku || '-'}</td>
                        <td className="px-3 py-3 text-slate-500 font-mono text-xs">{p.salesCode || '-'}</td>
                        <td className="px-3 py-3 text-slate-600">{fmt(p.alisFiyat)}</td>
                        <td className="px-3 py-3 text-slate-600">{fmt(p.satisFiyat)}</td>
                        <td className={`px-3 py-3 font-bold ${stokColor(stok)}`}>{stok}</td>
                        <td className="px-3 py-3 text-slate-600">{fmt(maliyet)}</td>
                        <td className="px-3 py-3 text-slate-600">{fmt(ciro)}</td>
                        <td className={`px-3 py-3 font-semibold ${fark >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fark >= 0 ? '+' : ''}{fmt0(fark)}</td>
                        <td className="px-3 py-3"><button onClick={() => toggleOnline(p)} title={p.onlineMagaza ? 'Mağazadan kaldır' : 'Mağazaya aç'} className={`inline-flex items-center gap-1 whitespace-nowrap text-xs px-2.5 py-1 rounded-full font-medium border ${p.onlineMagaza ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{p.onlineMagaza ? <Globe size={12} /> : <Ban size={12} />}{p.onlineMagaza ? 'Mağazada' : 'Kapalı'}</button></td>
                        <td className="px-3 py-3"><span className={`inline-block whitespace-nowrap text-xs px-2.5 py-1 rounded-full font-medium ${d.c}`}>{d.t}</span></td>
                        <td className="px-3 py-3"><div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          <IBtn onClick={() => openEdit(p)} icon={Pencil} title="Düzenle" />
                          <IBtn onClick={() => duplicate(p)} icon={Copy} title="Kopyala" />
                          <IBtn onClick={() => nav(`/depo/urun/${p.id}`)} icon={BarChart3} title="Stok Kartı" />
                          <IBtn onClick={() => barkodYazdir([p])} icon={ScanLine} title="Barkod" />
                          <IBtn onClick={() => del(p)} icon={Trash2} title="Sil" cls="text-red-400 border-red-100 hover:bg-red-50" />
                        </div></td>
                      </tr>
                    );
                  })}
                  {pageItems.length === 0 && <tr><td colSpan={14} className="px-4 py-16 text-center text-slate-400">Ürün bulunamadı.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {pageItems.map((p) => { const stok = p.stokAdeti || 0; const d = durumOf(p); return (
                <div key={p.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="relative aspect-square bg-slate-100"><img src={(p.images || [])[0] || ''} className="w-full h-full object-cover" /><span className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-medium ${d.c}`}>{d.t}</span><button onClick={() => toggleOnline(p)} title={p.onlineMagaza ? 'Mağazadan kaldır' : 'Mağazaya aç'} className={`absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${p.onlineMagaza ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white/90 text-slate-500 border-slate-200'}`}>{p.onlineMagaza ? <Globe size={11} /> : <Store size={11} />}{p.onlineMagaza ? 'Mağazada' : 'Aç'}</button></div>
                  <div className="p-3"><p className="font-medium text-slate-800 truncate">{p.ad}</p><p className="text-xs text-slate-400 mb-2">{p.sku || p.salesCode || '-'}</p><div className="flex items-center justify-between text-sm"><span className="font-semibold">{fmt(p.satisFiyat)}</span><span className={`text-xs font-bold ${stokColor(stok)}`}>{stok} adet</span></div>
                    <div className="flex items-center gap-1 mt-2"><IBtn onClick={() => openEdit(p)} icon={Pencil} title="Düzenle" /><IBtn onClick={() => duplicate(p)} icon={Copy} title="Kopyala" /><IBtn onClick={() => barkodYazdir([p])} icon={ScanLine} title="Barkod" /><IBtn onClick={() => del(p)} icon={Trash2} title="Sil" cls="text-red-400 border-red-100 hover:bg-red-50" /></div>
                  </div>
                </div>
              ); })}
              {pageItems.length === 0 && <div className="col-span-full text-center text-slate-400 py-16 bg-white rounded-2xl border border-slate-200">Ürün bulunamadı.</div>}
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-slate-500">Toplam {filtered.length.toLocaleString('tr-TR')} ürün</p>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50">‹</button>
              {pages.map((p, i) => p === '...' ? <span key={i} className="px-2 text-slate-400">…</span> : <button key={i} onClick={() => setPage(p as number)} className={`w-8 h-8 rounded-lg text-sm ${page === p ? 'bg-indigo-600 text-white' : 'border border-slate-200 hover:bg-slate-50'}`}>{p}</button>)}
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50">›</button>
            </div>
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="px-3 py-2 text-sm border border-slate-200 rounded-xl">{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / sayfa</option>)}</select>
          </div>
        </div>

        {/* SAĞ panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-slate-700">En Çok Satılanlar</h3>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="text-xs px-2 py-1 border border-slate-200 rounded-lg">{[['7', '7 gün'], ['30', '30 gün'], ['90', '90 gün'], ['0', 'Tümü']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
            </div>
            <div className="space-y-2.5">
              {topSellers.map(({ p, q }, i) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                  <img src={(p.images || [])[0] || ''} className="w-9 h-9 rounded-lg object-cover bg-slate-100 shrink-0" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-700 truncate">{p.ad}</p><div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(q / maxQ) * 100}%` }} /></div></div>
                  <span className="text-xs text-slate-500 whitespace-nowrap">{q} adet</span>
                </div>
              ))}
              {topSellers.length === 0 && <p className="text-sm text-slate-400">Bu dönemde satış yok.</p>}
            </div>
            <button onClick={() => { setTab('encok'); setPeriod('0'); }} className="w-full mt-3 text-sm text-indigo-600 font-medium">Tümünü Gör →</button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Stok Durumu</h3>
            <div className="flex items-center gap-4">
              <Donut segments={donut} total={donutTotal} />
              <div className="flex-1 space-y-1.5">
                {donut.map((d) => (<div key={d.t} className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: d.c }} />{d.t}</span><span className="text-slate-500">{d.n} ({((d.n / donutTotal) * 100).toFixed(1)}%)</span></div>))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Hızlı İşlemler</h3>
            <div className="grid grid-cols-2 gap-2">
              <QBtn onClick={() => barkodYazdir()} icon={ScanLine} label="Barkod Yazdır" />
              <QBtn onClick={() => { if (!sel.size) { toast.error('Önce ürün seçin'); return; } setBulkForm({ mode: 'yuzde', val: '', kategoriId: '' }); setBulk('fiyat'); }} icon={Wallet} label="Toplu Fiyat Güncelle" />
              <QBtn onClick={() => { if (!sel.size) { toast.error('Önce ürün seçin'); return; } setBulkForm({ mode: 'set', val: '', kategoriId: '' }); setBulk('stok'); }} icon={RefreshCw} label="Stok Güncelle" />
              <QBtn onClick={() => { if (!sel.size) { toast.error('Önce ürün seçin'); return; } setBulkForm({ mode: '', val: '', kategoriId: categories[0]?.id || '' }); setBulk('kategori'); }} icon={Tag} label="Toplu Kategori Ata" />
              <button onClick={() => { setDurumFilter('pasif'); setPage(1); }} className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"><EyeOff size={15} /> Pasif Ürünleri Göster</button>
            </div>
          </div>
        </div>
      </div>

      {/* Satış bilgisi modal */}
      {info && (() => { const stok = info.stokAdeti || 0; const maliyet = (info.alisFiyat || 0) * stok; const ciro = soldAll.rev.get(info.id) || 0; const adet = soldAll.qty.get(info.id) || 0; return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setInfo(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-white rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-slate-800">Satış Bilgisi</h3><button onClick={() => setInfo(null)}><X size={18} className="text-slate-400" /></button></div>
            <div className="flex items-center gap-3 mb-4"><img src={(info.images || [])[0] || ''} className="w-14 h-14 rounded-lg object-cover bg-slate-100" /><div><p className="font-medium text-slate-800">{info.ad}</p><p className="text-xs text-slate-400">{info.sku || info.salesCode || '-'}</p></div></div>
            <div className="space-y-2 text-sm"><Row l="Satılan Adet" v={`${adet} adet`} /><Row l="Yapılan Satış" v={fmt(ciro)} /><Row l="Güncel Stok" v={`${stok} adet`} /><Row l="Toplam Maliyet" v={fmt(maliyet)} /><Row l="+/- Durum" v={fmt(ciro - maliyet)} cls={ciro - maliyet >= 0 ? 'text-green-600' : 'text-red-500'} /></div>
          </div>
        </div>
      ); })()}

      {/* Toplu işlem modal */}
      {bulk && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setBulk(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-800">{bulk === 'fiyat' ? 'Toplu Fiyat Güncelle' : bulk === 'stok' ? 'Stok Güncelle' : 'Kategori Ata'}</h3><button onClick={() => setBulk(null)}><X size={18} className="text-slate-400" /></button></div>
            <p className="text-xs text-slate-400">{sel.size} ürün etkilenecek.</p>
            {bulk === 'fiyat' && (<>
              <div className="grid grid-cols-3 gap-2">{[['yuzde', '% Değişim'], ['tutar', '± Tutar'], ['set', 'Sabit']].map(([m, t]) => <button key={m} onClick={() => setBulkForm((f: any) => ({ ...f, mode: m }))} className={`py-2 text-xs rounded-lg border ${bulkForm.mode === m ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>{t}</button>)}</div>
              <input type="number" value={bulkForm.val} onChange={(e) => setBulkForm((f: any) => ({ ...f, val: e.target.value }))} placeholder={bulkForm.mode === 'yuzde' ? 'ör. 10 (=%10 zam), -10 (indirim)' : 'Tutar'} className={inp} />
            </>)}
            {bulk === 'stok' && <input type="number" value={bulkForm.val} onChange={(e) => setBulkForm((f: any) => ({ ...f, val: e.target.value }))} placeholder="Yeni stok adedi" className={inp} />}
            {bulk === 'kategori' && <select value={bulkForm.kategoriId} onChange={(e) => setBulkForm((f: any) => ({ ...f, kategoriId: e.target.value }))} className={inp}><option value="">Kategori yok</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select>}
            <button onClick={runBulk} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700">Uygula</button>
          </div>
        </div>
      )}

      {/* Form modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setModalOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-2xl bg-white rounded-2xl p-6 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-slate-800">{edit ? 'Ürünü Düzenle' : 'Yeni Ürün'}</h3><button type="button" onClick={() => setModalOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            <label className="block text-xs text-slate-500 mb-1">Ürün Görseli * (max 5, ilki kapak)</label>
            <ImageDropzone images={form.images} onChange={(imgs) => set('images', imgs)} max={5} />
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <Field label="Ürün Adı *"><input required value={form.ad} onChange={(e) => set('ad', e.target.value)} className={inp} /></Field>
              <Field label="SKU"><input value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="ör. PRTS-001-XL-BLK" className={inp} /></Field>
              <Field label="Satış Kodu">{availableCodes.length > 0 ? (<select value={form.salesCode} onChange={(e) => set('salesCode', e.target.value)} className={inp}><option value="">Seçiniz (havuzdan)</option>{availableCodes.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}</select>) : (<input value={form.salesCode} onChange={(e) => set('salesCode', e.target.value)} placeholder="Havuz boş - manuel" className={inp} />)}</Field>
              <Field label="Marka"><input value={form.marka} onChange={(e) => set('marka', e.target.value)} className={inp} /></Field>
              <Field label="Cinsiyet *"><select required value={form.cinsiyet} onChange={(e) => set('cinsiyet', e.target.value)} className={inp}>{CINSIYET.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
              <Field label="Kategori"><select value={form.kategoriId} onChange={(e) => set('kategoriId', e.target.value)} className={inp}><option value="">Seçiniz</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select></Field>
              <Field label="Lokasyon *"><input required value={form.lokasyon} onChange={(e) => set('lokasyon', e.target.value)} placeholder="Raf / Depo" className={inp} /></Field>
              <Field label="Alış Fiyatı"><input type="number" step="0.01" value={form.alisFiyat} onChange={(e) => set('alisFiyat', e.target.value)} className={inp} /></Field>
              <Field label="Satış Fiyatı"><input type="number" step="0.01" value={form.satisFiyat} onChange={(e) => set('satisFiyat', e.target.value)} className={inp} /></Field>
              <Field label="Eski/Liste Fiyatı"><input type="number" step="0.01" value={form.eskiFiyat} onChange={(e) => set('eskiFiyat', e.target.value)} className={inp} /></Field>
              <Field label="Stok Adeti"><input type="number" value={form.stokAdeti} onChange={(e) => set('stokAdeti', e.target.value)} className={inp} /></Field>
              <Field label="Barkod"><input value={edit?.barkod || 'Otomatik oluşturulacak'} disabled className={inp + ' bg-slate-50 text-slate-400'} /></Field>
              <Field label="Tedarikçi Adı"><input value={form.tedarikciAd} onChange={(e) => set('tedarikciAd', e.target.value)} className={inp} /></Field>
              <Field label="Tedarikçi Satış Barkodu"><input value={form.tedarikciBarkod} onChange={(e) => set('tedarikciBarkod', e.target.value)} className={inp} /></Field>
            </div>
            <Field label="Ürün Açıklaması"><textarea rows={2} value={form.aciklama} onChange={(e) => set('aciklama', e.target.value)} className={inp} /></Field>
            <div className="flex items-center gap-5 flex-wrap mt-3">
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.oneCikan} onChange={(e) => set('oneCikan', e.target.checked)} /> Öne çıkan ürün</label>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.onlineMagaza} onChange={(e) => set('onlineMagaza', e.target.checked)} /> <Store size={15} className="text-emerald-600" /> Online mağazada yayınla</label>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-2"><label className="text-sm font-medium text-slate-700">Varyasyon Stokları</label><select onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); e.target.value = ''; }} className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg"><option value="">Şablondan ekle...</option>{variationTemplates.map((t: any) => <option key={t.id} value={t.id}>{t.ad}</option>)}</select></div>
              {varRows.length === 0 ? (<p className="text-xs text-slate-400">Varyasyon yoksa boş bırakın; stok yukarıdan girilir.</p>) : (
                <div className="space-y-2">{varRows.map((r, i) => (<div key={i} className="flex items-center gap-2"><span className="text-xs text-slate-500 w-16">{r.ad}</span><span className="text-sm font-medium text-slate-700 flex-1">{r.deger}</span><input type="number" value={r.stok} onChange={(e) => setVarStok(i, e.target.value)} placeholder="Stok" className="w-24 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" /><button type="button" onClick={() => delVar(i)} className="text-red-500"><X size={15} /></button></div>))}<p className="text-[10px] text-slate-400">Toplam stok varyasyonların toplamıdır.</p></div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4"><button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">İptal</button><button type="submit" className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">Kaydet</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

const inp = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300';
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="block text-xs text-slate-500 mb-1">{label}</label>{children}</div>; }
function Kpi({ icon: Ic, cls, label, value, sub, valueCls }: any) {
  return <div className="bg-white rounded-2xl border border-slate-200 p-3.5"><div className="flex items-center gap-2 mb-1.5"><div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}><Ic size={18} /></div><p className="text-[11px] text-slate-400 leading-tight">{label}</p></div><p className={`text-xl font-bold ${valueCls || 'text-slate-800'}`}>{typeof value === 'number' ? value.toLocaleString('tr-TR') : value}</p>{sub && <p className="text-[11px] text-slate-400">{sub}</p>}</div>;
}
function IBtn({ onClick, icon: Ic, title, cls }: any) { return <button onClick={onClick} title={title} className={`w-8 h-8 rounded-lg border flex items-center justify-center ${cls || 'border-slate-200 text-slate-400 hover:bg-slate-100'}`}><Ic size={14} /></button>; }
function QBtn({ onClick, icon: Ic, label }: any) { return <button onClick={onClick} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"><Ic size={14} /> {label}</button>; }
function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return <div className="flex flex-col"><label className="text-[10px] text-slate-400 mb-0.5 ml-1">{label}</label><select value={value} onChange={(e) => onChange(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-xl min-w-[130px] bg-white">{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>;
}
function Row({ l, v, cls }: any) { return <div className="flex justify-between"><span className="text-slate-500">{l}</span><span className={`font-medium ${cls || 'text-slate-800'}`}>{v}</span></div>; }
function Donut({ segments, total }: { segments: { t: string; n: number; c: string }[]; total: number }) {
  const r = 38, c = 2 * Math.PI * r; let off = 0;
  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#eef2f7" strokeWidth="11" />
        {segments.map((s, i) => { const len = (s.n / total) * c; const el = <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={s.c} strokeWidth="11" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} />; off += len; return el; })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold text-slate-800">{total}</span><span className="text-[9px] text-slate-400">ürün</span></div>
    </div>
  );
}
