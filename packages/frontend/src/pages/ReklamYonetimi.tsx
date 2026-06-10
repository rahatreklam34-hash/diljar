import { useEffect, useMemo, useState, Fragment } from 'react';
import {
  Megaphone, ShieldCheck, Gauge, Rocket, WandSparkles, ClipboardList, SlidersHorizontal,
  LineChart, MessageSquareText, RefreshCw, Eye, EyeOff, PlayCircle, PauseCircle, AlertCircle,
  CheckCircle2, ChevronRight, Image as ImageIcon, Send, Plug, Unplug, Loader2,
} from 'lucide-react';
import api from '../lib/api';

// ───────────────────────── Tipler ─────────────────────────
type CampaignStatus = 'Güçlü' | 'İncele' | 'Riskli';
interface Campaign {
  campaignId: string; campaignName: string; campaignType: string; campaignTypeLabel: string;
  spend: number; impressions: number; clicks: number; ctr: number; cpc: number; cpm: number;
  results: number; primaryResultLabel: string; primaryResultAction?: string; roas: number;
  objective?: string; deliveryStatus?: string; status: CampaignStatus;
}
interface Entity {
  id: string; name: string; spend: number; impressions: number; clicks: number; ctr: number;
  cpc: number; cpm: number; results: number; primaryResultLabel?: string; roas: number;
  deliveryStatus?: string; previewUrl?: string; imageUrl?: string; thumbnailUrl?: string;
  adsetId?: string; adsetName?: string; creativeName?: string;
}
interface Summary { spend: number; impressions: number; clicks: number; results: number; ctr: number; cpc: number; cpm: number; roas: number; campaignCount: number; currency?: string }
interface InsightsData { account: any; summary: Summary; campaigns: Campaign[]; datePreset: string; fetchedAt: string }

// ───────────────────────── Biçimlendirme ─────────────────────────
const nf = (v: number, d = 0) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v || 0);
const cf = (v: number, c = 'TRY') => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: c || 'TRY', maximumFractionDigits: 2 }).format(v || 0);
const pf = (v: number) => `%${nf(v || 0, 2)}`;
const rf = (v: number) => `${nf(v || 0, 2)}x`;

const statusBadge: Record<CampaignStatus, string> = {
  'Güçlü': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'İncele': 'bg-sky-100 text-sky-700 border-sky-200',
  'Riskli': 'bg-rose-100 text-rose-700 border-rose-200',
};

const datePresets: Record<string, string> = {
  today: 'Bugün', yesterday: 'Dün', last_7d: 'Son 7 gün', last_14d: 'Son 14 gün',
  last_30d: 'Son 30 gün', this_month: 'Bu ay', last_month: 'Geçen ay', custom: 'Özel tarih',
};

const MODULES = [
  { id: 'ozet', label: 'Özet', Ic: Gauge },
  { id: 'kampanyalar', label: 'Kampanyalar', Ic: LineChart },
  { id: 'olustur', label: 'Kampanya Oluştur', Ic: Rocket },
  { id: 'optimizasyon', label: 'Optimizasyon', Ic: SlidersHorizontal },
  { id: 'analiz', label: 'AI Analiz', Ic: ClipboardList },
  { id: 'kreatif', label: 'AI Kreatif', Ic: WandSparkles },
  { id: 'chat', label: 'AI Chat', Ic: MessageSquareText },
  { id: 'hesap', label: 'Meta Bağlantısı', Ic: ShieldCheck },
] as const;
type ModuleId = typeof MODULES[number]['id'];

const quickPrompts = [
  'Bu hesapta en büyük problem ne görünüyor?',
  'Hangi kampanyaya bütçe artırmalıyım?',
  'Hangi kampanyaları durdurmayı düşünmeliyim?',
  'Kreatif tarafında ilk neyi test etmeliyim?',
];

// ───────────────────────── Yerel analiz + optimizasyon ─────────────────────────
function buildLocalAnalysis(d: InsightsData | null): string {
  if (!d || d.campaigns.length === 0) return 'Canlı Meta verisi henüz yüklenmedi. Bağlantıyı kurup Özet sekmesinden verileri yeniledikten sonra analiz bu hesaba göre hazırlanır.';
  const top = [...d.campaigns].filter((c) => c.campaignType === 'sales' && c.roas > 0).sort((a, b) => b.roas - a.roas)[0];
  const cpc = [...d.campaigns].sort((a, b) => b.cpc - a.cpc)[0];
  const low = d.campaigns.find((c) => c.ctr > 0 && c.ctr < 1);
  return [
    `Canlı ön analiz: ${d.summary.campaignCount} kampanyada toplam harcama ${cf(d.summary.spend, d.summary.currency)}, ortalama CTR ${pf(d.summary.ctr)} ve toplam sonuç ${nf(d.summary.results)}.`,
    top ? `Satışta en güçlü kampanya: ${top.campaignName} (${rf(top.roas)} ROAS).` : '',
    cpc && cpc.cpc > 0 ? `En pahalı tıklama: ${cpc.campaignName} (${cf(cpc.cpc, d.summary.currency)} CPC).` : '',
    low ? `Düşük ilgi sinyali: ${low.campaignName} kampanyasında CTR ${pf(low.ctr)}.` : '',
  ].filter(Boolean).join(' ');
}

interface OptAction { id: string; type: string; campaignId: string; campaignName: string; title: string; reason: string; impact: string; executable: boolean }
function buildOptimization(cs: Campaign[]): OptAction[] {
  return cs.flatMap((c) => {
    const a: OptAction[] = [];
    const rl = (c.primaryResultLabel || 'hedef sonuç').toLowerCase();
    if (c.spend > 0 && c.results <= 0 && c.ctr > 0 && c.ctr < 1)
      a.push({ id: `pause-${c.campaignId}`, type: 'pause', campaignId: c.campaignId, campaignName: c.campaignName, title: 'Durdurma adayı', reason: `Harcama var, ${rl} yok ve CTR ${pf(c.ctr)}.`, impact: 'Kampanyayı PAUSED durumuna al', executable: true });
    if (c.campaignType === 'sales' && c.roas >= 3)
      a.push({ id: `scale-${c.campaignId}`, type: 'scale', campaignId: c.campaignId, campaignName: c.campaignName, title: 'Ölçekleme fırsatı', reason: `${rf(c.roas)} ROAS güçlü görünüyor.`, impact: 'Kontrollü bütçe artışı planla', executable: false });
    if (c.campaignType !== 'sales' && c.results > 0 && c.ctr >= 2)
      a.push({ id: `scale-${c.campaignId}`, type: 'scale', campaignId: c.campaignId, campaignName: c.campaignName, title: 'Büyütme fırsatı', reason: `${nf(c.results)} ${rl} ve ${pf(c.ctr)} CTR var.`, impact: 'Kontrollü bütçe ve kreatif varyasyonu planla', executable: false });
    if (c.cpc > 20)
      a.push({ id: `review-${c.campaignId}`, type: 'review', campaignId: c.campaignId, campaignName: c.campaignName, title: 'Yüksek CPC', reason: `CPC ${cf(c.cpc)} seviyesinde.`, impact: 'Kreatif, hedefleme ve teklif mesajını incele', executable: false });
    if (c.campaignType === 'sales' && c.roas > 0 && c.roas < 1.5)
      a.push({ id: `creative-${c.campaignId}`, type: 'creative', campaignId: c.campaignId, campaignName: c.campaignName, title: 'Verimlilik riski', reason: `ROAS ${rf(c.roas)} düşük.`, impact: 'Yeni kreatif açısı ve landing kontrolü', executable: false });
    return a;
  });
}

// ───────────────────────── UI küçük parçalar ─────────────────────────
const card = 'bg-white rounded-2xl border border-slate-200 shadow-sm';
const inp = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const btnP = 'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50';
const btnS = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50';

function Metric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1.5 text-xl font-bold text-slate-800">{value}</p>
      {helper && <p className="mt-0.5 text-[11px] text-slate-400">{helper}</p>}
    </div>
  );
}

// ───────────────────────── Ana bileşen ─────────────────────────
export default function ReklamYonetimi() {
  const [tab, setTab] = useState<ModuleId>('ozet');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [account, setAccount] = useState<any>(null);
  const [adAccountId, setAdAccountId] = useState('');
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [datePreset, setDatePreset] = useState('last_30d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // bağlantı durumunu yükle
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/ads/connection');
        setConnected(!!r.data.connected); setAccount(r.data.account || null); setAdAccountId(r.data.adAccountId || '');
        if (r.data.connected) loadInsights('last_30d');
      } catch { setConnected(false); }
    })();
    // eslint-disable-next-line
  }, []);

  async function loadInsights(preset = datePreset) {
    setLoading(true); setErr('');
    try {
      const r = await api.post('/ads/insights', { datePreset: preset, dateFrom, dateTo });
      setData(r.data.data); setAccount(r.data.data.account);
    } catch (e: any) { setErr(e?.response?.data?.message || 'Veri alınamadı. Meta token izinlerini kontrol edin.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm"><Megaphone size={22} /></span>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Reklam Yönetimi</h1>
            <p className="text-xs text-slate-400">Meta Ads AI paneli — performans, optimizasyon, kreatif ve analiz tek merkezde.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 size={14} /> Bağlı{account?.name ? ` · ${account.name}` : ''}</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-600"><AlertCircle size={14} /> Meta bağlı değil</span>
          )}
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex flex-wrap gap-2">
        {MODULES.map((m) => {
          const active = tab === m.id;
          return (
            <button key={m.id} onClick={() => setTab(m.id)} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium border transition ${active ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              <m.Ic size={16} /> {m.label}
            </button>
          );
        })}
      </div>

      {/* Bağlantı yoksa uyarı (Özet/Kampanyalar için) */}
      {connected === false && tab !== 'hesap' && tab !== 'kreatif' && tab !== 'olustur' && (
        <div className={`${card} p-5 mb-4 flex items-start gap-3`}>
          <AlertCircle className="text-amber-500 shrink-0" size={20} />
          <div>
            <p className="text-sm font-semibold text-slate-700">Önce Meta hesabını bağlayın</p>
            <p className="text-xs text-slate-400 mt-0.5">Canlı veriler ve modüller, Meta access token + reklam hesabı ID girildikten sonra çalışır.</p>
            <button onClick={() => setTab('hesap')} className={`${btnP} mt-3`}><Plug size={15} /> Meta Bağlantısına Git</button>
          </div>
        </div>
      )}

      {tab === 'hesap' && <MetaConnection connected={connected} account={account} adAccountId={adAccountId} onChange={(c, a, id) => { setConnected(c); setAccount(a); setAdAccountId(id); if (c) loadInsights('last_30d'); }} />}
      {tab === 'ozet' && <Ozet data={data} loading={loading} err={err} datePreset={datePreset} dateFrom={dateFrom} dateTo={dateTo} setDatePreset={setDatePreset} setDateFrom={setDateFrom} setDateTo={setDateTo} reload={loadInsights} />}
      {tab === 'kampanyalar' && <Kampanyalar data={data} loading={loading} reload={() => loadInsights()} datePreset={datePreset} dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'olustur' && <KampanyaOlustur connected={!!connected} onCreated={() => loadInsights()} />}
      {tab === 'optimizasyon' && <Optimizasyon data={data} reload={() => loadInsights()} />}
      {tab === 'analiz' && <Analiz data={data} />}
      {tab === 'kreatif' && <Kreatif data={data} />}
      {tab === 'chat' && <Chat data={data} />}
    </div>
  );
}

// ───────────────────────── Meta Bağlantısı ─────────────────────────
function MetaConnection({ connected, account, adAccountId, onChange }: { connected: boolean | null; account: any; adAccountId: string; onChange: (c: boolean, a: any, id: string) => void }) {
  const [token, setToken] = useState('');
  const [accId, setAccId] = useState(adAccountId || '');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { setAccId(adAccountId || ''); }, [adAccountId]);

  const connect = async () => {
    if (!token.trim() || !accId.trim()) { setMsg({ ok: false, text: 'Access token ve reklam hesabı ID gerekli.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/ads/connection', { accessToken: token.trim(), adAccountId: accId.trim() });
      setMsg({ ok: true, text: r.data.message }); setToken(''); onChange(true, r.data.account, r.data.adAccountId);
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Bağlantı doğrulanamadı.' }); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!confirm('Meta bağlantısını kaldırmak istiyor musunuz?')) return;
    setBusy(true);
    try { await api.delete('/ads/connection'); onChange(false, null, ''); setMsg({ ok: true, text: 'Bağlantı kaldırıldı.' }); }
    catch { /* */ } finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-1"><ShieldCheck className="text-indigo-600" size={18} /><h2 className="font-bold text-slate-800">Meta Reklam Hesabı Bağlantısı</h2></div>
        <p className="text-xs text-slate-400 mb-4">Access token sunucuda güvenli şekilde saklanır; tarayıcıya geri gönderilmez. Token izinleri: <code className="text-[11px]">ads_read, ads_management</code>.</p>
        <label className="text-xs font-semibold text-slate-500">Access Token</label>
        <div className="relative mt-1 mb-3">
          <input type={showToken ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAB..." className={`${inp} pr-10`} />
          <button type="button" onClick={() => setShowToken((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showToken ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
        <label className="text-xs font-semibold text-slate-500">Reklam Hesabı ID</label>
        <input value={accId} onChange={(e) => setAccId(e.target.value)} placeholder="act_1234567890 veya 1234567890" className={`${inp} mt-1 mb-4`} />
        <div className="flex gap-2">
          <button onClick={connect} disabled={busy} className={btnP}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Plug size={16} />} {connected ? 'Bağlantıyı Güncelle' : 'Bağlan ve Doğrula'}</button>
          {connected && <button onClick={disconnect} disabled={busy} className={btnS}><Unplug size={16} /> Bağlantıyı Kaldır</button>}
        </div>
        {msg && <p className={`mt-3 text-xs font-medium ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
      </div>

      <div className={`${card} p-5`}>
        <h2 className="font-bold text-slate-800 mb-3">Hesap Durumu</h2>
        {connected && account ? (
          <div className="space-y-2.5 text-sm">
            <Row k="Hesap" v={account.name || '-'} />
            <Row k="Hesap ID" v={account.id || adAccountId} />
            <Row k="Durum" v={account.status || '-'} />
            <Row k="Para Birimi" v={account.currency || '-'} />
            <Row k="Zaman Dilimi" v={account.timezone || '-'} />
            {account.amountSpent != null && <Row k="Toplam Harcama" v={cf(Number(account.amountSpent) / 100, account.currency)} />}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Henüz bağlı bir reklam hesabı yok. Soldaki formdan token ve hesap ID girerek bağlanın.</p>
        )}
      </div>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
    <span className="text-slate-400">{k}</span><span className="font-semibold text-slate-700">{v}</span>
  </div>
);

// ───────────────────────── Özet ─────────────────────────
function Ozet({ data, loading, err, datePreset, dateFrom, dateTo, setDatePreset, setDateFrom, setDateTo, reload }: any) {
  return (
    <div className="space-y-4">
      <div className={`${card} p-4 flex flex-wrap items-end gap-3`}>
        <div>
          <label className="text-xs font-semibold text-slate-500">Tarih Aralığı</label>
          <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className={`${inp} mt-1 min-w-[160px]`}>
            {Object.entries(datePresets).map(([v, l]) => <option key={v} value={v}>{l as string}</option>)}
          </select>
        </div>
        {datePreset === 'custom' && (
          <>
            <div><label className="text-xs font-semibold text-slate-500">Başlangıç</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inp} mt-1`} /></div>
            <div><label className="text-xs font-semibold text-slate-500">Bitiş</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inp} mt-1`} /></div>
          </>
        )}
        <button onClick={() => reload(datePreset)} disabled={loading} className={btnP}>{loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Verileri Yenile</button>
        {data && <span className="text-[11px] text-slate-400 ml-auto">Son çekim: {new Date(data.fetchedAt).toLocaleString('tr-TR')} · {datePresets[data.datePreset] || data.datePreset}</span>}
      </div>

      {err && <div className={`${card} p-4 text-sm text-rose-600 flex items-center gap-2`}><AlertCircle size={16} /> {err}</div>}

      {data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Toplam Harcama" value={cf(data.summary.spend, data.summary.currency)} helper={`${data.summary.campaignCount} kampanya`} />
            <Metric label="Ortalama CTR" value={pf(data.summary.ctr)} helper="Tüm kampanyalar" />
            <Metric label="Ortalama CPC" value={cf(data.summary.cpc, data.summary.currency)} helper="Tıklama maliyeti" />
            <Metric label="ROAS" value={rf(data.summary.roas)} helper="Satış kampanyaları" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Gösterim" value={nf(data.summary.impressions)} />
            <Metric label="Tıklama" value={nf(data.summary.clicks)} />
            <Metric label="Toplam Sonuç" value={nf(data.summary.results)} />
            <Metric label="CPM" value={cf(data.summary.cpm, data.summary.currency)} />
          </div>
        </>
      ) : !loading && !err ? (
        <div className={`${card} p-8 text-center text-sm text-slate-400`}>Veri yok. Meta bağlantısını kurup "Verileri Yenile" deyin.</div>
      ) : null}
    </div>
  );
}

// ───────────────────────── Kampanyalar + detay ─────────────────────────
function Kampanyalar({ data, loading, reload, datePreset, dateFrom, dateTo }: any) {
  const [openId, setOpenId] = useState('');
  const [detail, setDetail] = useState<{ adsets: Entity[]; ads: Entity[]; campaign: Campaign } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState('');
  const [acting, setActing] = useState('');
  const currency = data?.summary?.currency || 'TRY';

  const openCampaign = async (c: Campaign) => {
    if (openId === c.campaignId) { setOpenId(''); setDetail(null); return; }
    setOpenId(c.campaignId); setDetail(null); setDetailErr(''); setDetailLoading(true);
    try {
      const r = await api.post('/ads/campaign-detail', { campaign: c, datePreset, dateFrom, dateTo });
      setDetail(r.data.data);
    } catch (e: any) { setDetailErr(e?.response?.data?.message || 'Detay alınamadı.'); }
    finally { setDetailLoading(false); }
  };

  const toggleCampaign = async (c: Campaign) => {
    const next = (c.deliveryStatus || '').toUpperCase() === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    if (!confirm(`${c.campaignName} kampanyası ${next === 'PAUSED' ? 'durdurulacak' : 'aktifleştirilecek'}. Onaylıyor musunuz?`)) return;
    setActing(c.campaignId);
    try { await api.post('/ads/action', { action: 'update_campaign_status', entityId: c.campaignId, status: next }); await reload(); }
    catch (e: any) { alert(e?.response?.data?.message || 'Aksiyon başarısız.'); }
    finally { setActing(''); }
  };

  const updateBudget = async (e: Entity) => {
    const val = prompt(`${e.name} ad set için yeni GÜNLÜK bütçe (TL):`, '');
    if (!val) return;
    const kurus = String(Math.round(Number(val) * 100));
    if (!/^\d+$/.test(kurus) || Number(kurus) <= 0) { alert('Geçerli bir tutar girin.'); return; }
    setActing(e.id);
    try { await api.post('/ads/action', { action: 'update_adset_budget', entityId: e.id, dailyBudget: kurus }); alert('Ad set bütçesi güncellendi.'); }
    catch (er: any) { alert(er?.response?.data?.message || 'Bütçe güncellenemedi.'); }
    finally { setActing(''); }
  };

  if (!data) return <div className={`${card} p-8 text-center text-sm text-slate-400`}>{loading ? <span className="inline-block w-6 h-6 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin align-middle" /> : 'Önce Özet sekmesinden verileri yükleyin.'}</div>;

  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="font-bold text-slate-800">Kampanyalar ({data.campaigns.length})</h2>
        <button onClick={() => reload()} disabled={loading} className={btnS}>{loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />} Yenile</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
            <th className="px-4 py-2.5">Kampanya</th><th className="px-3 py-2.5">Tür</th><th className="px-3 py-2.5">Harcama</th>
            <th className="px-3 py-2.5">CTR</th><th className="px-3 py-2.5">CPC</th><th className="px-3 py-2.5">Sonuç</th>
            <th className="px-3 py-2.5">ROAS</th><th className="px-3 py-2.5">Durum</th><th className="px-3 py-2.5"></th>
          </tr></thead>
          <tbody>
            {data.campaigns.map((c: Campaign) => (
              <Fragment key={c.campaignId}>
                <tr className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <button onClick={() => openCampaign(c)} className="flex items-center gap-2 text-left font-medium text-slate-700 hover:text-indigo-600">
                      <ChevronRight size={15} className={`transition ${openId === c.campaignId ? 'rotate-90' : ''}`} />{c.campaignName}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-slate-500">{c.campaignTypeLabel}</td>
                  <td className="px-3 py-3 text-slate-700">{cf(c.spend, currency)}</td>
                  <td className="px-3 py-3 text-slate-600">{pf(c.ctr)}</td>
                  <td className="px-3 py-3 text-slate-600">{cf(c.cpc, currency)}</td>
                  <td className="px-3 py-3 text-slate-700">{nf(c.results)} <span className="text-[10px] text-slate-400">{c.primaryResultLabel}</span></td>
                  <td className="px-3 py-3 text-slate-600">{c.roas > 0 ? rf(c.roas) : '-'}</td>
                  <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge[c.status]}`}>{c.status}</span></td>
                  <td className="px-3 py-3">
                    <button onClick={() => toggleCampaign(c)} disabled={acting === c.campaignId} title={(c.deliveryStatus || '').toUpperCase() === 'ACTIVE' ? 'Durdur' : 'Aktifleştir'} className="text-slate-400 hover:text-indigo-600">
                      {acting === c.campaignId ? <Loader2 className="animate-spin" size={17} /> : (c.deliveryStatus || '').toUpperCase() === 'ACTIVE' ? <PauseCircle size={18} /> : <PlayCircle size={18} />}
                    </button>
                  </td>
                </tr>
                {openId === c.campaignId && (
                  <tr key={`${c.campaignId}-d`} className="bg-slate-50/60">
                    <td colSpan={9} className="px-4 py-3">
                      {detailLoading ? <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="animate-spin" size={15} /></p>
                        : detailErr ? <p className="text-sm text-rose-600">{detailErr}</p>
                          : detail ? (
                            <div className="space-y-4">
                              <div>
                                <p className="text-xs font-semibold text-slate-500 mb-2">Ad Set'ler ({detail.adsets.length})</p>
                                <div className="space-y-1.5">
                                  {detail.adsets.length === 0 && <p className="text-xs text-slate-400">Ad set bulunamadı.</p>}
                                  {detail.adsets.map((a) => (
                                    <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs">
                                      <span className="font-medium text-slate-700 min-w-[160px]">{a.name}</span>
                                      <span className="text-slate-500">Harcama: {cf(a.spend, currency)}</span>
                                      <span className="text-slate-500">CTR: {pf(a.ctr)}</span>
                                      <span className="text-slate-500">Sonuç: {nf(a.results)}</span>
                                      <button onClick={() => updateBudget(a)} disabled={acting === a.id} className="ml-auto text-indigo-600 hover:underline font-semibold">{acting === a.id ? '...' : 'Bütçe Düzenle'}</button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-500 mb-2">Reklamlar ({detail.ads.length})</p>
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {detail.ads.length === 0 && <p className="text-xs text-slate-400">Reklam bulunamadı.</p>}
                                  {detail.ads.map((a) => (
                                    <div key={a.id} className="flex gap-2 rounded-lg bg-white border border-slate-200 p-2 text-xs">
                                      {a.previewUrl ? <img src={a.previewUrl} alt="" className="h-12 w-12 rounded object-cover" /> : <div className="h-12 w-12 rounded bg-slate-100 flex items-center justify-center text-slate-300"><ImageIcon size={16} /></div>}
                                      <div className="min-w-0">
                                        <p className="font-medium text-slate-700 truncate">{a.name}</p>
                                        <p className="text-slate-500">{cf(a.spend, currency)} · {pf(a.ctr)} CTR</p>
                                        <p className="text-slate-400">{nf(a.results)} {a.primaryResultLabel}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : null}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {data.campaigns.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">Bu tarih aralığında kampanya verisi yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────── Kampanya Oluştur ─────────────────────────
function KampanyaOlustur({ connected, onCreated }: { connected: boolean; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('Satış');
  const [status, setStatus] = useState<'PAUSED' | 'ACTIVE'>('PAUSED');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const create = async () => {
    if (!name.trim()) { setMsg({ ok: false, text: 'Kampanya adı gerekli.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/ads/action', { action: 'create_campaign', campaignName: name.trim(), objective, status });
      setMsg({ ok: true, text: `Kampanya oluşturuldu (ID: ${r.data.id}).` }); setName(''); onCreated();
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Kampanya oluşturulamadı.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className={`${card} p-5 max-w-xl`}>
      <div className="flex items-center gap-2 mb-1"><Rocket className="text-indigo-600" size={18} /><h2 className="font-bold text-slate-800">Kampanya Oluştur</h2></div>
      <p className="text-xs text-slate-400 mb-4">Meta reklam hesabında yeni bir kampanya açar. Güvenlik için varsayılan durum "Duraklatıldı"dır; yayına almadan önce ad set ve reklam ekleyin.</p>
      {!connected && <p className="text-xs text-amber-600 mb-3 flex items-center gap-1.5"><AlertCircle size={14} /> Önce Meta bağlantısı kurmalısınız.</p>}
      <label className="text-xs font-semibold text-slate-500">Kampanya Adı</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. E-ticaret Dönüşüm | Advantage+" className={`${inp} mt-1 mb-3`} />
      <label className="text-xs font-semibold text-slate-500">Hedef</label>
      <select value={objective} onChange={(e) => setObjective(e.target.value)} className={`${inp} mt-1 mb-3`}>
        {['Satış', 'Lead toplama', 'Trafik', 'Marka bilinirliği', 'Mesaj / WhatsApp'].map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <label className="text-xs font-semibold text-slate-500">Başlangıç Durumu</label>
      <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={`${inp} mt-1 mb-4`}>
        <option value="PAUSED">Duraklatıldı (önerilen)</option>
        <option value="ACTIVE">Aktif</option>
      </select>
      <button onClick={create} disabled={busy || !connected} className={btnP}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Rocket size={16} />} Kampanyayı Oluştur</button>
      {msg && <p className={`mt-3 text-xs font-medium ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}

// ───────────────────────── Optimizasyon ─────────────────────────
function Optimizasyon({ data, reload }: { data: InsightsData | null; reload: () => void }) {
  const actions = useMemo(() => (data ? buildOptimization(data.campaigns) : []), [data]);
  const [acting, setActing] = useState('');
  const tone: Record<string, string> = { pause: 'border-rose-200 bg-rose-50', scale: 'border-emerald-200 bg-emerald-50', review: 'border-amber-200 bg-amber-50', creative: 'border-sky-200 bg-sky-50' };

  const exec = async (a: OptAction) => {
    if (!confirm(`${a.campaignName} kampanyası durdurulacak. Onaylıyor musunuz?`)) return;
    setActing(a.id);
    try { await api.post('/ads/action', { action: 'update_campaign_status', entityId: a.campaignId, status: 'PAUSED' }); await reload(); }
    catch (e: any) { alert(e?.response?.data?.message || 'Aksiyon başarısız.'); }
    finally { setActing(''); }
  };

  if (!data) return <div className={`${card} p-8 text-center text-sm text-slate-400`}>Önce Özet sekmesinden verileri yükleyin.</div>;
  return (
    <div className="space-y-3">
      <div className={`${card} p-4 flex items-center justify-between`}>
        <div><h2 className="font-bold text-slate-800">Optimizasyon Merkezi</h2><p className="text-xs text-slate-400">{actions.length} öneri · riskli kampanyaları durdurun, güçlüleri ölçekleyin.</p></div>
        <button onClick={reload} className={btnS}><RefreshCw size={15} /> Yenile</button>
      </div>
      {actions.length === 0 && <div className={`${card} p-8 text-center text-sm text-slate-400`}>Şu an aksiyon gerektiren kritik sinyal yok. Düzenli takip yeterli.</div>}
      <div className="grid md:grid-cols-2 gap-3">
        {actions.map((a) => (
          <div key={a.id} className={`rounded-2xl border p-4 ${tone[a.type] || 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-800 text-sm">{a.title}</p>
              {a.executable && <span className="text-[10px] font-bold uppercase text-rose-600">Aksiyon</span>}
            </div>
            <p className="text-xs text-slate-500 mt-1">{a.campaignName}</p>
            <p className="text-xs text-slate-600 mt-2">{a.reason}</p>
            <p className="text-[11px] text-slate-400 mt-1">{a.impact}</p>
            {a.executable && <button onClick={() => exec(a)} disabled={acting === a.id} className={`${btnP} mt-3 !py-2`}>{acting === a.id ? <Loader2 className="animate-spin" size={15} /> : <PauseCircle size={15} />} Kampanyayı Durdur</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── AI Analiz ─────────────────────────
function Analiz({ data }: { data: InsightsData | null }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const local = useMemo(() => buildLocalAnalysis(data), [data]);

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post('/ads/ai', { message: 'Bu reklam hesabının genel performansını yönetici özeti ve aksiyon önerileriyle yorumla.', metrics: data?.summary || [], campaigns: data?.campaigns?.slice(0, 20) || [] });
      setAnswer(r.data.answer);
    } catch { setAnswer('AI yanıtı alınamadı.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2"><ClipboardList className="text-indigo-600" size={18} /><h2 className="font-bold text-slate-800">AI Destekli Analiz</h2></div>
          <button onClick={run} disabled={busy} className={btnP}>{busy ? <Loader2 className="animate-spin" size={16} /> : <ClipboardList size={16} />} AI Analizi Çalıştır</button>
        </div>
        <p className="text-xs text-slate-400 mb-3">Canlı veriler OpenAI ile yorumlanır. Anahtar tanımlı değilse yerel ön analiz gösterilir.</p>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 whitespace-pre-line">{answer || local}</div>
      </div>
    </div>
  );
}

// ───────────────────────── AI Kreatif ─────────────────────────
function Kreatif({ data }: { data: InsightsData | null }) {
  const [product, setProduct] = useState('');
  const [audience, setAudience] = useState('');
  const [format, setFormat] = useState('Sosyal medya akış görseli');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [img, setImg] = useState('');
  const [msg, setMsg] = useState('');

  const gen = async () => {
    if (!product.trim()) { setMsg('Ürün/hizmet bilgisi girin.'); return; }
    setBusy(true); setMsg(''); setImg('');
    try {
      const r = await api.post('/ads/creative-image', { product, audience, format, brief, campaignContext: data?.summary });
      if (r.data.ok) setImg(r.data.imageUrl); else setMsg(r.data.message || 'Görsel üretilemedi.');
    } catch (e: any) { setMsg(e?.response?.data?.message || 'Görsel üretilemedi.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-1"><WandSparkles className="text-indigo-600" size={18} /><h2 className="font-bold text-slate-800">AI Kreatif Görsel Üret</h2></div>
        <p className="text-xs text-slate-400 mb-4">Ürün, kitle ve formata göre reklam görseli üretir. OpenAI görsel anahtarı gerekir (Entegrasyonlar).</p>
        <label className="text-xs font-semibold text-slate-500">Ürün / Hizmet</label>
        <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Örn. kadın spor ayakkabı" className={`${inp} mt-1 mb-3`} />
        <label className="text-xs font-semibold text-slate-500">Hedef Kitle</label>
        <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Örn. 25-40 yaş, spor yapan kadınlar" className={`${inp} mt-1 mb-3`} />
        <label className="text-xs font-semibold text-slate-500">Format</label>
        <select value={format} onChange={(e) => setFormat(e.target.value)} className={`${inp} mt-1 mb-3`}>
          {['Sosyal medya akış görseli', 'Story / Reels dikey', 'Kare ürün görseli', 'Kampanya / indirim afişi'].map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className="text-xs font-semibold text-slate-500">Brief (opsiyonel)</label>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} placeholder="Öne çıkmasını istediğin mesaj, renk, atmosfer…" className={`${inp} mt-1 mb-4`} />
        <button onClick={gen} disabled={busy} className={btnP}>{busy ? <Loader2 className="animate-spin" size={16} /> : <WandSparkles size={16} />} Görsel Üret</button>
        {msg && <p className="mt-3 text-xs font-medium text-rose-600">{msg}</p>}
      </div>
      <div className={`${card} p-5 flex items-center justify-center min-h-[320px]`}>
        {img ? <img src={img} alt="AI kreatif" className="max-h-[420px] w-full rounded-xl object-contain" />
          : <div className="text-center text-slate-300"><ImageIcon size={48} className="mx-auto" /><p className="text-sm mt-2 text-slate-400">Üretilen görsel burada görünecek</p></div>}
      </div>
    </div>
  );
}

// ───────────────────────── AI Chat ─────────────────────────
function Chat({ data }: { data: InsightsData | null }) {
  const [msgs, setMsgs] = useState<{ role: 'user' | 'ai'; text: string }[]>([{ role: 'ai', text: buildLocalAnalysis(data) }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (text: string) => {
    const q = text.trim(); if (!q || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: q }]); setInput(''); setBusy(true);
    try {
      const r = await api.post('/ads/ai', { message: q, metrics: data?.summary || [], campaigns: data?.campaigns?.slice(0, 20) || [] });
      setMsgs((m) => [...m, { role: 'ai', text: r.data.answer }]);
    } catch { setMsgs((m) => [...m, { role: 'ai', text: 'AI yanıtı alınamadı.' }]); }
    finally { setBusy(false); }
  };

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center gap-2 mb-3"><MessageSquareText className="text-indigo-600" size={18} /><h2 className="font-bold text-slate-800">AI Chat</h2></div>
      <div className="flex flex-wrap gap-2 mb-3">
        {quickPrompts.map((p) => <button key={p} onClick={() => send(p)} disabled={busy} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">{p}</button>)}
      </div>
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto wt-scroll pr-1 mb-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-700'}`}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="rounded-2xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-400 flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> Yazıyor…</div></div>}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(input)} placeholder="Reklam performansı hakkında sorun…" className={inp} />
        <button onClick={() => send(input)} disabled={busy} className={btnP}><Send size={16} /></button>
      </div>
    </div>
  );
}
