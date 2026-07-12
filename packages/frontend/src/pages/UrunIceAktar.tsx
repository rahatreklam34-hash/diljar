import { useState, useEffect, useRef } from 'react';
import { DownloadCloud, Plug, RefreshCw, CheckCircle2, AlertTriangle, Sparkles, Search, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';

interface Settings { enabled: boolean; baseUrl: string; salesChannel: string; onlyInStock: boolean; apiKey: string; apiSecret: string; hasKey: boolean; hasSecret: boolean; }
interface Counts { new: number; update: number; warn: number; }
interface Row {
  kaynakId: string; matchKey: string; categoryName: string | null; status: 'new' | 'update' | 'warn'; warn?: string;
  product: { ad: string; cinsiyet: string; salesCode: string | null; barkod: string | null; marka: string | null; alisFiyat: number; satisFiyat: number; stokAdeti: number; images: string[]; };
  variations: { ad: string; deger: string; stok: number }[];
}

const ST: Record<string, { t: string; c: string }> = {
  new: { t: 'Yeni', c: 'bg-emerald-100 text-emerald-700' },
  update: { t: 'Güncellenecek', c: 'bg-sky-100 text-sky-700' },
  warn: { t: 'Uyarı', c: 'bg-amber-100 text-amber-700' },
};
const fmt = (n: number) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function UrunIceAktar() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [jobId, setJobId] = useState('');
  const [counts, setCounts] = useState<Counts | null>(null);
  const [filter, setFilter] = useState<'all' | 'new' | 'update' | 'warn'>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loadingRows, setLoadingRows] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [refreshingStock, setRefreshingStock] = useState(false);
  const [stockResult, setStockResult] = useState<any>(null);
  const [balLoading, setBalLoading] = useState<'' | 'preview' | 'apply'>('');
  const [balResult, setBalResult] = useState<any>(null);

  useEffect(() => { api.get('/import/sepetw/settings').then((r) => setS(r.data)).catch(() => setS({ enabled: false, baseUrl: 'https://sepetw.com', salesChannel: 'all', onlyInStock: false, apiKey: '', apiSecret: '', hasKey: false, hasSecret: false })); }, []);

  const up = (k: keyof Settings, v: any) => setS((p) => p ? { ...p, [k]: v } : p);

  const save = async () => { if (!s) return; setSaving(true); try { const r = await api.put('/import/sepetw/settings', s); setS(r.data); toast.success('Ayarlar kaydedildi'); } catch (e) { toast.error(apiErrorMessage(e)); } finally { setSaving(false); } };
  const test = async () => { setTesting(true); try { const r = await api.post('/import/sepetw/test'); toast.success(`Bağlantı başarılı · ${r.data.totalItems} ürün`); } catch (e) { toast.error(apiErrorMessage(e)); } finally { setTesting(false); } };

  const refreshStock = async () => {
    if (!window.confirm("API'den güncel stoklar çekilip eşleşen ürünlerin YALNIZCA stok bilgisi güncellenecek. Ad, fiyat, görsel gibi diğer veriler değişmeyecek. Devam edilsin mi?")) return;
    setRefreshingStock(true); setStockResult(null);
    try {
      const r = await api.post('/import/sepetw/refresh-stock');
      setStockResult(r.data);
      toast.success(`${r.data.updated} ürünün stoğu güncellendi`);
    } catch (e) { toast.error(apiErrorMessage(e)); } finally { setRefreshingStock(false); }
  };

  const syncBalances = async (dryRun: boolean) => {
    if (!dryRun && !window.confirm("Sepetw'den çekilen müşteri bakiyeleri, eşleşen müşterilerin Customer.bakiye alanına yazılacak. Yalnızca kaynakta bakiyesi olan müşteriler güncellenir. Devam edilsin mi?")) return;
    setBalLoading(dryRun ? 'preview' : 'apply'); if (dryRun) setBalResult(null);
    try {
      const r = await api.post('/import/sepetw/sync-balances', { dryRun });
      setBalResult(r.data);
      toast.success(dryRun ? `${r.data.updated} müşteri güncellenebilir (önizleme)` : `${r.data.updated} müşterinin bakiyesi güncellendi`);
    } catch (e) { toast.error(apiErrorMessage(e)); } finally { setBalLoading(''); }
  };

  const preview = async () => {
    setPreviewing(true); setResult(null);
    try {
      const r = await api.post('/import/sepetw/preview');
      setJobId(r.data.jobId); setCounts(r.data.counts); setSel(new Set()); setPage(1); setFilter('all');
      toast.success(`${r.data.totalItems} ürün hazırlandı (kaydedilmedi)`);
    } catch (e) { toast.error(apiErrorMessage(e)); } finally { setPreviewing(false); }
  };

  const loadRows = async () => {
    if (!jobId) return;
    setLoadingRows(true);
    try {
      const r = await api.get(`/import/jobs/${jobId}`, { params: { status: filter, q, page, pageSize } });
      setRows(r.data.rows || []); setTotal(r.data.total || 0); if (r.data.counts) setCounts(r.data.counts);
    } catch (e) { toast.error(apiErrorMessage(e)); } finally { setLoadingRows(false); }
  };
  useEffect(() => { loadRows(); /* eslint-disable-next-line */ }, [jobId, filter, page]);

  // Otomatik arama: q degisince 400ms debounce ile setPage(1)+loadRows().
  // Ilk render'i didMount ref ile atla ki gereksiz fetch olmasin.
  const searchMounted = useRef(false);
  useEffect(() => {
    if (!searchMounted.current) { searchMounted.current = true; return; }
    const t = setTimeout(() => { setPage(1); loadRows(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleVisible = () => setSel((p) => {
    const n = new Set(p); const allIn = rows.every((r) => n.has(r.kaynakId));
    rows.forEach((r) => allIn ? n.delete(r.kaynakId) : n.add(r.kaynakId)); return n;
  });

  // Belirli duruma uyan TUM satirlarin anahtarlarini topla (sayfalari gez)
  const selectAllMatching = async (status: 'new' | 'update') => {
    if (!jobId) return;
    setLoadingRows(true);
    try {
      const keys: string[] = []; let p = 1;
      while (true) {
        const r = await api.get(`/import/jobs/${jobId}`, { params: { status, page: p, pageSize: 200 } });
        const rs: Row[] = r.data.rows || []; rs.forEach((x) => keys.push(x.kaynakId));
        if (p * 200 >= (r.data.total || 0)) break; p++;
      }
      setSel((prev) => { const n = new Set(prev); keys.forEach((k) => n.add(k)); return n; });
      toast.success(`${keys.length} ${ST[status].t.toLowerCase()} ürün seçildi`);
    } catch (e) { toast.error(apiErrorMessage(e)); } finally { setLoadingRows(false); }
  };

  const commit = async () => {
    if (!sel.size) { toast.error('Önce ürün seçin'); return; }
    if (!confirm(`${sel.size} ürün içe aktarılacak (yeni eklenecek / mevcut güncellenecek). Onaylıyor musunuz?`)) return;
    setCommitting(true);
    try {
      const r = await api.post('/import/sepetw/commit', { jobId, selectedKeys: Array.from(sel) });
      setResult(r.data); setSel(new Set());
      toast.success(`${r.data.created} eklendi · ${r.data.updated} güncellendi`);
      loadRows();
    } catch (e) { toast.error(apiErrorMessage(e)); } finally { setCommitting(false); }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><DownloadCloud className="text-emerald-600" size={22} /></div>
        <div><h1 className="text-xl font-bold text-slate-800">Ürün İçe Aktar</h1><p className="text-sm text-slate-400">sepetw.com API'sinden ürünleri çek, önizle, onayla ve aktar</p></div>
      </div>

      {/* 1. Bağlantı */}
      {s && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><Plug size={15} className="text-sky-500" /> Bağlantı Ayarları</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="API Key"><input value={s.apiKey} onChange={(e) => up('apiKey', e.target.value)} className="inp" placeholder="t31_products_live_key_..." /></Field>
            <Field label="API Secret"><input value={s.apiSecret} onChange={(e) => up('apiSecret', e.target.value)} className="inp" placeholder="••••••••" /></Field>
            <Field label="Satış Kanalı"><select value={s.salesChannel} onChange={(e) => up('salesChannel', e.target.value)} className="inp"><option value="all">Tümü</option><option value="magaza">Mağaza</option><option value="mezat">Mezat</option></select></Field>
            <Field label="Stok filtresi"><label className="flex items-center gap-2 text-sm text-slate-600 mt-2"><input type="checkbox" checked={s.onlyInStock} onChange={(e) => up('onlyInStock', e.target.checked)} /> Sadece stoğu olanlar</label></Field>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
            <button onClick={test} disabled={testing} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 disabled:opacity-50">{testing ? 'Test ediliyor...' : 'Bağlantıyı Test Et'}</button>
          </div>
          <p className="text-[11px] text-slate-400">Secret yalnızca sunucuda saklanır, tarayıcıya gönderilmez. Kayıtlı değerler maskeli görünür; değiştirmek için yeniden yazın.</p>
        </div>
      )}

      {/* 1.5 Sadece Stok Güncelle */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Stok Güncelle</h3>
            <p className="text-[11px] text-slate-400">API'den güncel stoğu çeker ve eşleşen ürünlerin <b>yalnızca stok</b> bilgisini günceller. Ad, fiyat, görsel, kategori gibi diğer verilere dokunmaz.</p>
          </div>
          <button onClick={refreshStock} disabled={refreshingStock} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1.5"><RefreshCw size={15} className={refreshingStock ? 'animate-spin' : ''} /> {refreshingStock ? 'Güncelleniyor...' : 'Güncel Stok Çek'}</button>
        </div>
        {stockResult && (
          <div className="flex gap-2 flex-wrap text-sm pt-1">
            <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-medium">{stockResult.updated} ürün güncellendi</span>
            <span className="px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 font-medium">{stockResult.varUpdated} varyasyon</span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-medium">{stockResult.notFound} eşleşmedi</span>
            {stockResult.skipped > 0 && <span className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 font-medium">{stockResult.skipped} atlandı</span>}
          </div>
        )}
      </div>

      {/* 1.6 Müşteri Bakiyelerini Çek */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-start gap-2">
            <div className="w-9 h-9 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center shrink-0"><Wallet size={18} /></div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Müşteri Bakiyelerini Çek</h3>
              <p className="text-[11px] text-slate-400 max-w-xl">Sepetw'deki müşteri bakiyeleri çekilir; telefon ve kullanıcı adı (instagram) ile eşleşen müşterilerin <b>bakiyesi</b> güncellenir. Yalnızca kaynakta bakiyesi olan müşteriler yazılır, diğerlerine dokunulmaz. Önce <b>Önizle</b> ile kontrol et.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => syncBalances(true)} disabled={!!balLoading} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"><Search size={15} className={balLoading === 'preview' ? 'animate-pulse' : ''} /> {balLoading === 'preview' ? 'Önizleniyor...' : 'Önizle'}</button>
            <button onClick={() => syncBalances(false)} disabled={!!balLoading} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5"><Wallet size={15} className={balLoading === 'apply' ? 'animate-pulse' : ''} /> {balLoading === 'apply' ? 'Aktarılıyor...' : 'Bakiyeleri Aktar'}</button>
          </div>
        </div>
        {balResult && (
          <div className="space-y-2 pt-1">
            <div className="flex gap-2 flex-wrap text-sm">
              <span className="px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 font-medium">{balResult.updated} {balResult.dryRun ? 'güncellenecek' : 'güncellendi'}</span>
              <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-medium">{balResult.matched} eşleşti</span>
              <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-medium">{balResult.withBalance} kaynak bakiye / {balResult.totalSepet} müşteri</span>
              {balResult.unchanged > 0 && <span className="px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 font-medium">{balResult.unchanged} değişmedi</span>}
              <span className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 font-medium">{balResult.unmatched} eşleşmedi</span>
            </div>
            {Array.isArray(balResult.sample) && balResult.sample.length > 0 && (
              <div className="overflow-x-auto border border-slate-100 rounded-lg">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="text-slate-400 text-left text-xs uppercase bg-slate-50"><tr><th className="px-3 py-2">Müşteri</th><th className="px-3 py-2">Telefon / Instagram</th><th className="px-3 py-2 text-right">Eski Bakiye</th><th className="px-3 py-2 text-right">Yeni Bakiye</th></tr></thead>
                  <tbody>
                    {balResult.sample.map((x: any, i: number) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{x.ad}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs">{[x.telefon, x.instagram].filter(Boolean).join(' · ') || '-'}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{fmt(x.eskiBakiye)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-violet-700">{fmt(x.yeniBakiye)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {balResult.updated > balResult.sample.length && <p className="px-3 py-2 text-[11px] text-slate-400">… ve {balResult.updated - balResult.sample.length} müşteri daha</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Önizleme */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-slate-800 text-sm">Önizleme</h3>
          <button onClick={preview} disabled={previewing} className="px-4 py-2 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 disabled:opacity-50 flex items-center gap-1.5"><RefreshCw size={15} className={previewing ? 'animate-spin' : ''} /> {previewing ? 'Çekiliyor...' : 'Ürünleri Çek (önizleme)'}</button>
        </div>
        <p className="text-[11px] text-slate-400">Bu adımda hiçbir ürün kaydedilmez; yalnızca eşleştirme yapılır ve aşağıda gösterilir.</p>
        {counts && (
          <div className="flex gap-2 flex-wrap text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-medium">Yeni: {counts.new}</span>
            <span className="px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 font-medium">Güncellenecek: {counts.update}</span>
            <span className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 font-medium">Uyarı: {counts.warn}</span>
          </div>
        )}
      </div>

      {/* 3. Tablo + seçim */}
      {jobId && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'new', 'update', 'warn'] as const).map((f) => (
                <button key={f} onClick={() => { setFilter(f); setPage(1); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f === 'all' ? 'Tümü' : ST[f].t}</button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setPage(1), loadRows())} placeholder="Ara (ad/kod/marka)" className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-48" /></div>
              <button onClick={() => { setPage(1); loadRows(); }} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm">Ara</button>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap items-center text-xs">
            <button onClick={() => selectAllMatching('new')} className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Tüm yenileri seç</button>
            <button onClick={() => selectAllMatching('update')} className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100">Tüm güncellenecekleri seç</button>
            <button onClick={() => setSel(new Set())} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">Seçimi temizle</button>
            <span className="text-slate-500 ml-auto">{sel.size} seçili</span>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="p-2 w-8"><input type="checkbox" checked={rows.length > 0 && rows.every((r) => sel.has(r.kaynakId))} onChange={toggleVisible} /></th>
                  <th className="p-2 text-left">Durum</th>
                  <th className="p-2 text-left">Görsel</th>
                  <th className="p-2 text-left">Ürün</th>
                  <th className="p-2 text-left">Satış Kodu</th>
                  <th className="p-2 text-left">Marka</th>
                  <th className="p-2 text-left">Kategori</th>
                  <th className="p-2 text-right">Alış</th>
                  <th className="p-2 text-right">Satış</th>
                  <th className="p-2 text-right">Stok</th>
                  <th className="p-2 text-right">Var.</th>
                </tr>
              </thead>
              <tbody>
                {loadingRows && <tr><td colSpan={11} className="p-6 text-center text-slate-400">Yükleniyor...</td></tr>}
                {!loadingRows && rows.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-slate-400">Kayıt yok.</td></tr>}
                {!loadingRows && rows.map((r) => (
                  <tr key={r.kaynakId} className={`border-t border-slate-100 hover:bg-slate-50 ${sel.has(r.kaynakId) ? 'bg-emerald-50/50' : ''}`}>
                    <td className="p-2 text-center"><input type="checkbox" checked={sel.has(r.kaynakId)} onChange={() => toggle(r.kaynakId)} /></td>
                    <td className="p-2"><span className={`px-2 py-0.5 rounded text-[11px] font-medium ${ST[r.status].c}`}>{ST[r.status].t}</span>{r.warn && <p className="text-[10px] text-amber-600 mt-0.5 max-w-[160px]">{r.warn}</p>}</td>
                    <td className="p-2">{r.product.images[0] ? <img src={r.product.images[0]} alt="" className="w-10 h-10 rounded object-cover" loading="lazy" /> : <div className="w-10 h-10 rounded bg-slate-100" />}</td>
                    <td className="p-2 font-medium text-slate-700 max-w-[200px] truncate">{r.product.ad}<span className="block text-[10px] text-slate-400">{r.product.cinsiyet}</span></td>
                    <td className="p-2 text-slate-600">{r.product.salesCode || <span className="text-amber-500">—</span>}</td>
                    <td className="p-2 text-slate-600">{r.product.marka || '—'}</td>
                    <td className="p-2 text-slate-500 text-xs">{r.categoryName || '—'}</td>
                    <td className="p-2 text-right text-slate-600">{fmt(r.product.alisFiyat)}</td>
                    <td className="p-2 text-right font-medium text-slate-700">{fmt(r.product.satisFiyat)}</td>
                    <td className="p-2 text-right text-slate-600">{r.product.stokAdeti}</td>
                    <td className="p-2 text-right text-slate-400">{r.variations.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-40">‹</button>
              <span className="text-slate-500">{page} / {totalPages} · {total} kayıt</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-40">›</button>
            </div>
            <button onClick={commit} disabled={committing || !sel.size} className="px-5 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1.5"><Sparkles size={15} /> {committing ? 'Aktarılıyor...' : `Seçilenleri İçe Aktar (${sel.size})`}</button>
          </div>
          <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle size={12} /> "Uyarı" satırları (satış kodu yok / mükerrer) elle kontrol gerektirir; mükerrer eşleşmeler içe aktarmada atlanır.</p>
        </div>
      )}

      {/* 4. Sonuç */}
      {result && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><CheckCircle2 size={16} className="text-emerald-500" /> İçe Aktarma Sonucu</h3>
          <div className="flex gap-2 flex-wrap text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-medium">{result.created} eklendi</span>
            <span className="px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 font-medium">{result.updated} güncellendi</span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-medium">{result.skipped} atlandı</span>
          </div>
          {result.failed?.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 max-h-40 overflow-y-auto">
              {result.failed.map((f: any, i: number) => <p key={i}>• {f.ad}: {f.reason}</p>)}
            </div>
          )}
        </div>
      )}

      <style>{`.inp{width:100%;padding:0.5rem 0.75rem;font-size:0.875rem;border-radius:0.5rem;border:1px solid #e2e8f0;outline:none}.inp:focus{box-shadow:0 0 0 2px #d1fae5}`}</style>
    </div>
  );
}

function Field({ label, children }: any) {
  return <div><label className="text-xs text-slate-500 block mb-1">{label}</label>{children}</div>;
}
