import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Send, MessageCircle, Smartphone, Megaphone, CreditCard, ShoppingCart, Package,
  Tag, User, Users, History, Plus, ChevronDown, Settings as SettingsIcon, Truck,
  CheckCircle, XCircle, MessageSquare, Clock, Zap, RefreshCw, Info, X, Loader2,
  ListChecks, Wallet, Hourglass,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { loadCustomSegments, evalSegment, loadCustomerTags } from './MusteriDavranislari';
import { useStore } from '../context/StoreContext';

type Template = {
  id: string; name: string; language?: string; category?: string;
  bodyText?: string | null; headerText?: string | null; footerText?: string | null;
  buttonsJson?: any; status?: string; sampleJson?: any;
};
type Audience = {
  audience: { tumMusteri: number; tumMusteriToplam: number; sepetOlan: number; odemesizSepet: number };
  segment: { sepetOlan: number; odemesizSepet: number; sepetTutar: number; odemesizTutar: number; toplamTutar: number };
  kapasite: { gunlukLimit: number; gonderilenBugun: number; kalan: number | null };
};
type Job = { id: string; status: string; total?: number; sent?: number; createdAt?: string; templateId?: string; filterJson?: any };
type Recipient = { phone: string; ad: string; tutar: number; ref: string; durum: string };

const tl = (n: number) => '₺' + (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf = (n: number) => (Number(n) || 0).toLocaleString('tr-TR');

const CAMPAIGN_TYPES: { key: string; icon: any; label: string; sub: string; color: string; tags: string[]; audience: string; keywords: string[] }[] = [
  { key: 'duyuru', icon: Megaphone, label: 'Genel Duyuru', sub: 'Tüm müşterilere duyuru', color: 'text-sky-600 bg-sky-50', tags: ['duyuru'], audience: 'all', keywords: ['duyuru', 'genel', 'announce'] },
  { key: 'odeme', icon: CreditCard, label: 'Ödeme Talep Et', sub: 'Mevcut sepetler için ödeme talep edin', color: 'text-violet-600 bg-violet-50', tags: ['ödeme-talebi'], audience: 'unpaid', keywords: ['payment', 'odeme', 'ödeme', 'tahsilat'] },
  { key: 'sepet', icon: ShoppingCart, label: 'Sepeti Hatırlat', sub: 'Ödemesiz sepetleri hatırlat', color: 'text-amber-600 bg-amber-50', tags: ['sepet-hatirlatma'], audience: 'cart', keywords: ['sepet', 'cart', 'hatirlat'] },
  { key: 'siparis', icon: Package, label: 'Sipariş Bilgilendirme', sub: 'Sipariş durum mesajları', color: 'text-emerald-600 bg-emerald-50', tags: ['siparis'], audience: 'all', keywords: ['siparis', 'order', 'onay'] },
  { key: 'kampanya', icon: Tag, label: 'Kampanya / İndirim', sub: 'İndirim ve kampanya mesajları', color: 'text-rose-600 bg-rose-50', tags: ['kampanya'], audience: 'all', keywords: ['kampanya', 'indirim', 'promo'] },
  { key: 'ozel', icon: User, label: 'Özel Mesaj', sub: 'Kişiselleştirilmiş mesaj gönder', color: 'text-slate-600 bg-slate-100', tags: ['özel'], audience: 'manual', keywords: [] },
];

const QUICK_ACTIONS: { key: string; icon: any; label: string; color: string }[] = [
  { key: 'odeme', icon: CreditCard, label: 'Ödeme Talep Et', color: 'text-violet-600' },
  { key: 'sepet', icon: ShoppingCart, label: 'Sepeti Hatırlat', color: 'text-amber-600' },
  { key: 'siparis', icon: Truck, label: 'Kargo Bilgilendir', color: 'text-sky-600' },
  { key: 'siparis-onay', icon: CheckCircle, label: 'Sipariş Onayla', color: 'text-emerald-600' },
  { key: 'iptal', icon: XCircle, label: 'İptal Bilgilendir', color: 'text-rose-600' },
  { key: 'ozel', icon: MessageSquare, label: 'Özel Mesaj Gönder', color: 'text-slate-500' },
];

const VAR_LABELS = ['Ad Soyad', 'Sepet Tutarı', 'Sepet Linki', 'Ürün Sayısı', 'Sipariş No', 'Durum', 'Link'];
// Ödeme talebi şablonunda değişken sırası farklıdır: {{1}}=Ad, {{2}}=Sipariş No, {{3}}=Link, {{4}}=Tutar
const VAR_LABELS_ODEME = ['Ad Soyad', 'Sipariş No', 'Ödeme Linki', 'Tutar'];
function isOdemeTalebi(tpl?: Template | null): boolean {
  const n = String(tpl?.name || '').toLowerCase();
  return n === 'odeme_talebi' || /odeme[_\s-]*(talebi|talep|link|baglant)/.test(n);
}
function varLabelsFor(tpl?: Template | null): string[] {
  return isOdemeTalebi(tpl) ? VAR_LABELS_ODEME : VAR_LABELS;
}
const SPEED: Record<string, { label: string; rate: number }> = {
  slow: { label: 'Yavaş (Güvenli)', rate: 60 },
  normal: { label: 'Normal (Önerilen)', rate: 120 },
  fast: { label: 'Hızlı', rate: 300 },
};

function parseVars(body?: string | null): number[] {
  const set = new Set<number>();
  for (const m of String(body || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)) set.add(Number(m[1]));
  return Array.from(set).sort((a, b) => a - b);
}
// Önizleme: manuel değer > şablon örnek değeri (sampleJson) > alan etiketi.
// Backend enqueueBulk aynı sıralamayı kullanır (manuel → otomatik/alıcı verisi → sampleJson),
// bu yüzden panelde görünen metin, gerçekte gönderilen şablon gövdesiyle birebir örtüşür.
function renderBody(tpl: Template | null | undefined, vars: string[], body?: string | null): string {
  const src = body != null ? body : (tpl?.bodyText || '');
  const labels = varLabelsFor(tpl);
  const sample: string[] = Array.isArray(tpl?.sampleJson) ? (tpl!.sampleJson as any[]).map((v) => String(v ?? '')) : [];
  return String(src || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const i = Number(n) - 1;
    const manual = (vars[i] && vars[i].trim()) || '';
    const def = (sample[i] || '').trim();
    return manual || def || `[${labels[i] || 'değişken ' + n}]`;
  });
}

export default function TopluMesaj() {
  const [searchParams] = useSearchParams();
  const { orders, customers } = useStore();
  const [channel, setChannel] = useState<'api' | 'sms'>('api');
  const [campaign, setCampaign] = useState('odeme');
  const [audienceType, setAudienceType] = useState('cart');
  const [manualPhones, setManualPhones] = useState('');
  const [selectedSegKey, setSelectedSegKey] = useState('');
  const [selectedTagKey, setSelectedTagKey] = useState('');

  const savedSegments = useMemo(() => loadCustomSegments(), []);
  const savedTags = useMemo(() => loadCustomerTags(), []);

  // Segment/tag/phones'ten gelen parametreler
  useEffect(() => {
    const phones = searchParams.get('phones');
    const ch = searchParams.get('channel');
    const segKey = searchParams.get('segment');
    const tagKey = searchParams.get('tag');
    if (tagKey) {
      setSelectedTagKey(tagKey);
      setAudienceType('tag');
      setCampaign('duyuru');
    } else if (segKey) {
      setSelectedSegKey(segKey);
      setAudienceType('segment');
      setCampaign('duyuru');
    } else if (phones) {
      setManualPhones(phones.replace(/,/g, '\n'));
      setAudienceType('phones');
      setCampaign('duyuru');
    }
    if (ch === 'sms') setChannel('sms');
    else if (ch === 'whatsapp') setChannel('api');
  }, [searchParams]);

  // Tag -> telefon listesi çözümle
  const tagPhones = useMemo(() => {
    if (audienceType !== 'tag' || !selectedTagKey) return [] as string[];
    const tag = savedTags.find(t => t.key === selectedTagKey);
    if (!tag) return [] as string[];
    const custMap = new Map(customers.map((c: any) => [c.id, c]));
    return tag.customerIds.map(id => custMap.get(id)?.telefon).filter(Boolean) as string[];
  }, [audienceType, selectedTagKey, savedTags, customers]);

  // Segment -> telefon listesi çözümle
  const segmentPhones = useMemo(() => {
    if (audienceType !== 'segment' || !selectedSegKey) return [] as string[];
    const seg = savedSegments.find(s => s.key === selectedSegKey);
    if (!seg) return [] as string[];
    const VALID = (o: any) => o.durum !== 'iptal' && o.durum !== 'sepet';
    const daysBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 86400000;
    const custMap = new Map(customers.map((c: any) => [c.id, c]));
    const pc = new Map<string, { ciro: number; sipSayisi: number; sonSipGun: number; ilkSipGun: number; iadeSayisi: number; sehir: string; segment: string; telefon: string }>();
    const validOrders = orders.filter(VALID);
    for (const o of validOrders) {
      const cid = o.customerId; if (!cid) continue;
      const c = custMap.get(cid); if (!c) continue;
      const dt = new Date(o.createdAt);
      const existing = pc.get(cid) || { ciro: 0, sipSayisi: 0, sonSipGun: 9999, ilkSipGun: 0, iadeSayisi: 0, sehir: c.sehir || '', segment: 'Normal', telefon: c.telefon || '' };
      existing.sipSayisi++;
      const sonG = daysBetween(new Date(), dt);
      if (sonG < existing.sonSipGun) existing.sonSipGun = sonG;
      if (sonG > existing.ilkSipGun) existing.ilkSipGun = sonG;
      if (o.durum === 'iade') existing.iadeSayisi++;
      for (const it of (o.items || [])) existing.ciro += (Number(it.fiyat) || 0) * (Number(it.adet) || 1);
      pc.set(cid, existing);
    }
    const phones: string[] = [];
    for (const [, row] of pc) {
      const r: any = { ...row, ortSip: row.sipSayisi ? row.ciro / row.sipSayisi : 0 };
      if (row.ciro >= 10000) r.segment = 'VIP';
      else if (row.sipSayisi >= 5) r.segment = 'Sadık';
      else if (row.sonSipGun > 90) r.segment = 'Kaybedilen';
      else if (row.sonSipGun > 60) r.segment = 'Riskli';
      if (evalSegment(seg, r) && row.telefon) phones.push(row.telefon);
    }
    return phones;
  }, [audienceType, selectedSegKey, savedSegments, orders, customers]);
  const [templateId, setTemplateId] = useState('');
  const [vars, setVars] = useState<string[]>([]);
  const [smsBody, setSmsBody] = useState('');
  const [tags, setTags] = useState<string[]>(['ödeme-talebi', 'vip-müşteriler']);
  const [tagInput, setTagInput] = useState('');
  const [note, setNote] = useState('');
  const [sendTime, setSendTime] = useState<'now' | 'scheduled' | 'recurring'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [speed, setSpeed] = useState('normal');
  const [retry, setRetry] = useState('unsent');
  const [optOut, setOptOut] = useState(true);
  const [previewTab, setPreviewTab] = useState<'whatsapp' | 'sms'>('whatsapp');

  const [aud, setAud] = useState<Audience | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [recipOpen, setRecipOpen] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [recipList, setRecipList] = useState<Recipient[]>([]);
  const [recipLoading, setRecipLoading] = useState(false);
  const [recipSearch, setRecipSearch] = useState('');

  useEffect(() => { void load(); }, []);
  useEffect(() => { setPreviewTab(channel === 'sms' ? 'sms' : 'whatsapp'); }, [channel]);

  async function load() {
    setLoading(true);
    try {
      const [a, t] = await Promise.all([
        api.get('/whatsapp/bulk-audience'),
        api.get('/whatsapp/templates'),
      ]);
      setAud(a.data);
      const tpls: Template[] = Array.isArray(t.data?.templates) ? t.data.templates : (Array.isArray(t.data) ? t.data : []);
      setTemplates(tpls);
      const firstApproved = tpls.find((x) => (x.status || '').toLowerCase() === 'approved');
      if (firstApproved && !templateId) setTemplateId(firstApproved.id);
    } catch (e: any) {
      toast.error(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const approvedTemplates = useMemo(() => templates.filter((t) => (t.status || '').toLowerCase() === 'approved'), [templates]);
  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId) || null, [templates, templateId]);
  const bodyText = channel === 'sms' || campaign === 'ozel' ? smsBody : (selectedTemplate?.bodyText || '');
  const templateVars = useMemo(() => parseVars(selectedTemplate?.bodyText), [selectedTemplate]);
  const rendered = (channel === 'sms' || campaign === 'ozel')
    ? renderBody(null, vars, smsBody)
    : renderBody(selectedTemplate, vars);
  const charLimit = channel === 'sms' ? 160 : 1024;
  const charCount = (channel === 'sms' || campaign === 'ozel' ? smsBody : rendered).length;

  const manualCount = manualPhones.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.length >= 10).length;
  const recipientCount = useMemo(() => {
    if (!aud) return 0;
    if (audienceType === 'all') return aud.audience.tumMusteri;
    if (audienceType === 'cart') return aud.audience.sepetOlan;
    if (audienceType === 'unpaid') return aud.audience.odemesizSepet;
    if (audienceType === 'phones' || audienceType === 'manual') return manualCount;
    if (audienceType === 'segment') return segmentPhones.length;
    if (audienceType === 'tag') return tagPhones.length;
    return aud.audience.tumMusteri;
  }, [aud, audienceType, manualCount, segmentPhones, tagPhones]);

  const estimateMin = Math.max(1, Math.ceil(recipientCount / (SPEED[speed]?.rate || 120)));
  const credit = aud?.kapasite?.kalan;

  function applyCampaign(key: string) {
    const c = CAMPAIGN_TYPES.find((x) => x.key === key);
    if (!c) return;
    setCampaign(key);
    setAudienceType(c.audience);
    if (c.tags.length) setTags((prev) => Array.from(new Set([...c.tags, ...prev.filter((t) => !CAMPAIGN_TYPES.some((ct) => ct.tags.includes(t)))])));
    if (key !== 'ozel' && channel === 'api' && c.keywords.length) {
      const match = approvedTemplates.find((t) => c.keywords.some((k) => (t.name + ' ' + (t.category || '')).toLowerCase().includes(k)));
      if (match) setTemplateId(match.id);
    }
  }
  function applyQuickAction(key: string) {
    if (key === 'siparis-onay' || key === 'iptal') { setCampaign('siparis'); setAudienceType('all'); }
    else applyCampaign(key);
  }

  const currentAudienceLabel = audienceType === 'segment'
    ? `Segment: ${savedSegments.find(s => s.key === selectedSegKey)?.label || 'Seçilmedi'} (${segmentPhones.length})`
    : audienceType === 'tag'
    ? `Etiket: ${savedTags.find(t => t.key === selectedTagKey)?.label || 'Seçilmedi'} (${tagPhones.length})`
    : ({ all: 'Tüm Müşteriler', cart: 'Sepeti Olan Müşteriler', unpaid: 'Ödemesiz Sepetler', phones: 'Telefon Listesi', manual: 'Manuel Numara' } as any)[audienceType] || 'Müşteriler';

  const filteredRecipients = useMemo(() => {
    const q = recipSearch.trim().toLowerCase();
    if (!q) return recipList;
    return recipList.filter((r) => r.ad.toLowerCase().includes(q) || r.phone.includes(q));
  }, [recipList, recipSearch]);
  const showAmountCol = audienceType === 'cart' || audienceType === 'unpaid';
  const showRefCol = audienceType === 'cart' || audienceType === 'unpaid';

  async function refreshPreviewCount() {
    setRecipLoading(true);
    try {
      const phones = manualPhones.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      const r = await api.post('/whatsapp/bulk-audience/preview', { audience: { type: audienceType, phones }, detail: true });
      setPreviewCount(r.data?.count ?? null);
      setRecipList(Array.isArray(r.data?.recipients) ? r.data.recipients : []);
    } catch {
      setPreviewCount(null);
      setRecipList([]);
    } finally {
      setRecipLoading(false);
    }
  }

  async function onStart() {
    if (recipientCount <= 0) { toast.error('Geçerli alıcı bulunamadı.'); return; }
    if (channel === 'api') {
      if (campaign === 'ozel') { toast.error('WhatsApp toplu gönderimi için bir şablon seçin (Özel metin yalnızca SMS ile gönderilebilir).'); return; }
      if (!templateId) { toast.error('Lütfen bir şablon seçin.'); return; }
      const tpl = templates.find((t) => t.id === templateId);
      if (tpl && (tpl.status || '').toLowerCase() !== 'approved') { toast.error('Seçili şablon onaylı değil. Onaylı bir şablon seçin.'); return; }
    } else {
      if (!smsBody.trim()) { toast.error('SMS metni boş olamaz.'); return; }
    }
    setSending(true);
    try {
      const phones = audienceType === 'segment' ? segmentPhones : audienceType === 'tag' ? tagPhones : manualPhones.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      const payload: any = {
        channel,
        audience: { type: (audienceType === 'segment' || audienceType === 'tag') ? 'phones' : audienceType, phones },
        templateId: channel === 'api' ? templateId : undefined,
        vars,
        body: channel === 'sms' ? smsBody : undefined,
        tags,
        note,
        schedule: sendTime === 'scheduled' ? { mode: 'at', at: scheduleAt } : { mode: 'now' },
      };
      const r = await api.post('/whatsapp/bulk-send', payload);
      const d = r.data || {};
      if (channel === 'sms') toast.success(`SMS gönderimi başlatıldı: ${nf(d.sent || 0)} alıcı`);
      else toast.success(`Toplu gönderim kuyruğa alındı: ${nf(d.total || recipientCount)} alıcı`);
      void load();
    } catch (e: any) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function onTest() {
    const phone = window.prompt('Test mesajı gönderilecek numara (90... formatında):', '');
    if (!phone) return;
    const body = rendered || smsBody;
    if (!body.trim()) { toast.error('Önce mesaj içeriği oluşturun.'); return; }
    try {
      await api.post('/whatsapp/send', { phone, body, channel });
      toast.success('Test mesajı gönderildi.');
    } catch (e: any) {
      toast.error(apiErrorMessage(e));
    }
  }

  async function openHistory() {
    setHistOpen(true);
    setHistLoading(true);
    try {
      const r = await api.get('/whatsapp/bulk');
      const list: Job[] = Array.isArray(r.data?.jobs) ? r.data.jobs : (Array.isArray(r.data) ? r.data : []);
      setJobs(list);
    } catch (e: any) {
      toast.error(apiErrorMessage(e));
    } finally {
      setHistLoading(false);
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  }

  const stats = [
    { icon: Users, label: 'Toplam Alıcı', value: nf(aud?.audience.tumMusteri || 0), c: 'text-emerald-600 bg-emerald-50' },
    { icon: Send, label: 'Gönderilecek', value: nf(recipientCount), c: 'text-sky-600 bg-sky-50' },
    { icon: Hourglass, label: 'Tahmini Süre', value: `~ ${estimateMin} dk`, c: 'text-violet-600 bg-violet-50' },
    { icon: Wallet, label: channel === 'sms' ? 'SMS Bakiyesi' : 'Günlük Kalan', value: credit == null ? '—' : nf(credit), c: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6 space-y-4">
      {/* Başlık + üst istatistikler */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0"><Send size={20} /></div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">Toplu Mesaj Gönder</h1>
            <p className="text-sm text-slate-400">WhatsApp API veya SMS ile toplu mesaj gönderin. Şablon seçebilir, ödeme talep edebilir ve kampanya oluşturabilirsiniz.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 px-4 py-3 min-w-[140px]">
              <div className="flex items-center gap-2 mb-1"><span className={`w-7 h-7 rounded-lg flex items-center justify-center ${s.c}`}><s.icon size={15} /></span><span className="text-[11px] text-slate-400">{s.label}</span></div>
              <div className="text-lg font-extrabold text-slate-800">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Kanal + aksiyonlar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1">
          <button onClick={() => setChannel('api')} className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition ${channel === 'api' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><MessageCircle size={15} /> WhatsApp API</button>
          <button onClick={() => setChannel('sms')} className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition ${channel === 'sms' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Smartphone size={15} /> SMS</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openHistory} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"><History size={15} /> Geçmiş Kampanyalar</button>
          <button onClick={() => { setCampaign('duyuru'); setTemplateId(approvedTemplates[0]?.id || ''); setNote(''); setTags([]); toast.success('Yeni kampanya hazır'); }} className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 flex items-center gap-2"><Plus size={16} /> Yeni Kampanya</button>
        </div>
      </div>

      {/* Kampanya türü kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {CAMPAIGN_TYPES.map((c) => (
          <button key={c.key} onClick={() => applyCampaign(c.key)} className={`text-left bg-white rounded-2xl border p-3 transition ${campaign === c.key ? 'border-violet-300 ring-2 ring-violet-100' : 'border-slate-200 hover:border-slate-300'}`}>
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${c.color}`}><c.icon size={17} /></span>
            <div className="text-sm font-bold text-slate-800 leading-tight">{c.label}</div>
            <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{c.sub}</div>
          </button>
        ))}
      </div>

      {/* Ana grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.35fr_0.85fr_1fr] gap-4 items-start">
        {/* 1. Alıcılar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">1. Alıcılar</h3>
          <div className="space-y-1">
            {[
              { k: 'all', label: 'Tüm Müşteriler', count: aud?.audience.tumMusteri },
              { k: 'tag', label: 'Etiketli Müşteriler', count: undefined },
              { k: 'segment', label: 'Müşteri Segment', count: undefined },
              { k: 'cart', label: 'Sepeti Olan Müşteriler', count: aud?.audience.sepetOlan, rec: true },
              { k: 'unpaid', label: 'Ödemesiz Sepetler', count: aud?.audience.odemesizSepet },
              { k: 'phones', label: 'Telefon Numarası Listesi', count: undefined },
              { k: 'manual', label: 'Manuel Numara Ekle', count: undefined },
            ].map((r) => (
              <button key={r.k} onClick={() => setAudienceType(r.k)} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition ${audienceType === r.k ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${audienceType === r.k ? 'border-emerald-500' : 'border-slate-300'}`}>{audienceType === r.k && <span className="w-2 h-2 rounded-full bg-emerald-500" />}</span>
                <span className="flex-1 text-left">{r.label}</span>
                {r.rec && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Önerilen</span>}
                {r.count != null && <span className="text-[12px] font-semibold text-slate-500">{nf(r.count)}</span>}
              </button>
            ))}
          </div>

          {(audienceType === 'phones' || audienceType === 'manual') && (
            <textarea value={manualPhones} onChange={(e) => setManualPhones(e.target.value)} rows={3} placeholder="Numaraları virgül veya satırla ayırın&#10;905551112233, 905334445566" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-100 resize-none" />
          )}

          {audienceType === 'tag' && (
            <div className="space-y-2">
              <select value={selectedTagKey} onChange={(e) => setSelectedTagKey(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-100 bg-white">
                <option value="">Etiket seçin...</option>
                {savedTags.map((t) => <option key={t.key} value={t.key}>{t.label} ({t.customerIds.length} kişi)</option>)}
              </select>
              {selectedTagKey && (
                <div className="text-xs text-slate-500 bg-emerald-50 rounded-lg px-3 py-2">
                  <span className="font-semibold text-emerald-700">{tagPhones.length}</span> müşteri bu etikette (telefonu olan)
                </div>
              )}
              {savedTags.length === 0 && (
                <p className="text-xs text-slate-400">Henüz etiket tanımlanmamış. Müşteri Davranışları sayfasından etiket oluşturabilirsiniz.</p>
              )}
            </div>
          )}

          {audienceType === 'segment' && (
            <div className="space-y-2">
              <select value={selectedSegKey} onChange={(e) => setSelectedSegKey(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-100 bg-white">
                <option value="">Segment seçin...</option>
                {savedSegments.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {selectedSegKey && (
                <div className="text-xs text-slate-500 bg-emerald-50 rounded-lg px-3 py-2">
                  <span className="font-semibold text-emerald-700">{segmentPhones.length}</span> müşteri bu segmentte eşleşiyor
                </div>
              )}
              {savedSegments.length === 0 && (
                <p className="text-xs text-slate-400">Henüz segment tanımlanmamış. Müşteri Davranışları sayfasından segment oluşturabilirsiniz.</p>
              )}
            </div>
          )}

          <div className="bg-slate-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2"><span className="text-[12px] font-semibold text-slate-500">Seçili Alıcılar</span><span className="text-sm font-extrabold text-emerald-600">{nf(recipientCount)} kişi</span></div>
            <button onClick={() => { setRecipOpen(true); setRecipSearch(''); void refreshPreviewCount(); }} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center justify-center gap-2"><ListChecks size={15} /> Alıcıları Yönet</button>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-1.5 text-[13px]">
            <div className="text-[12px] font-semibold text-slate-500 mb-1">Segment Bilgisi</div>
            <Row label="Sepeti Olan" value={nf(aud?.segment.sepetOlan || 0)} />
            <Row label="Ödemesiz Sepet" value={nf(aud?.segment.odemesizSepet || 0)} />
            <Row label="Toplam Tutar" value={tl(aud?.segment.toplamTutar || 0)} strong />
          </div>
        </div>

        {/* 2. Mesaj İçeriği */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">2. Mesaj İçeriği</h3>
          {channel === 'api' && campaign !== 'ozel' ? (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full appearance-none px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100 pr-9">
                    <option value="">Şablon Seçin</option>
                    {approvedTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language || 'tr'})</option>)}
                    {approvedTemplates.length === 0 && <option value="" disabled>Onaylı şablon yok</option>}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <a href="/whatsapp/ayarlar?sub=sablon" className="px-3 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap"><SettingsIcon size={14} /> Şablonları Yönet</a>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 min-h-[160px] text-[13px] text-slate-700 whitespace-pre-wrap break-words">
                {selectedTemplate?.headerText && <div className="font-bold mb-1">{selectedTemplate.headerText}</div>}
                {rendered || <span className="text-slate-400">Şablon seçildiğinde içerik burada görünür.</span>}
                {selectedTemplate?.footerText && <div className="text-[11px] text-slate-400 mt-2">{selectedTemplate.footerText}</div>}
                {Array.isArray(selectedTemplate?.buttonsJson) && selectedTemplate!.buttonsJson.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                    {selectedTemplate!.buttonsJson.map((b: any, i: number) => <div key={i} className="text-center text-emerald-600 text-[12px] font-medium">{b?.text || b?.label || 'Buton'}</div>)}
                  </div>
                )}
              </div>
              {templateVars.length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold text-slate-500 mb-1.5">Değişkenler</div>
                  <div className="flex flex-wrap gap-1.5">
                    {templateVars.map((n) => (
                      <input key={n} value={vars[n - 1] || ''} onChange={(e) => { const c = [...vars]; c[n - 1] = e.target.value; setVars(c); }} placeholder={`{{${n}}} ${varLabelsFor(selectedTemplate)[n - 1] || ''}`} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] outline-none focus:ring-2 focus:ring-emerald-100 w-36" />
                    ))}
                  </div>
                </div>
              )}
              <div className="text-right text-[11px] text-slate-400">{charCount} / {charLimit}</div>
            </>
          ) : (
            <>
              <textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} rows={7} maxLength={channel === 'sms' ? 612 : 1024} placeholder={channel === 'sms' ? 'SMS metnini yazın…' : 'Özel mesaj metnini yazın…'} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-100 resize-none" />
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{channel === 'sms' ? 'SMS, opt-out olmayan numaralara gönderilir.' : 'Özel mesaj yalnızca SMS kanalı ile toplu gönderilebilir.'}</span>
                <span>{charCount} / {charLimit}{channel === 'sms' && charCount > 0 ? ` · ${Math.ceil(charCount / 160)} SMS` : ''}</span>
              </div>
            </>
          )}
        </div>

        {/* 3. Hızlı İşlemler */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
          <h3 className="font-bold text-slate-800 text-sm mb-1">3. Hızlı İşlemler</h3>
          {QUICK_ACTIONS.map((a) => {
            const active = (a.key === campaign) || (a.key === 'siparis-onay' && campaign === 'siparis');
            return (
              <button key={a.key} onClick={() => applyQuickAction(a.key)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition ${active ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
                <a.icon size={16} className={active ? 'text-violet-600' : a.color} />
                {a.label}
              </button>
            );
          })}
        </div>

        {/* Önizleme */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800 text-sm">Önizleme</h3></div>
          <div className="flex gap-1 mb-3 bg-slate-100 rounded-lg p-1">
            <button onClick={() => setPreviewTab('whatsapp')} className={`flex-1 py-1.5 rounded-md text-[12px] font-semibold ${previewTab === 'whatsapp' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>WhatsApp</button>
            <button onClick={() => setPreviewTab('sms')} className={`flex-1 py-1.5 rounded-md text-[12px] font-semibold ${previewTab === 'sms' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>SMS</button>
          </div>
          {previewTab === 'whatsapp' ? (
            <div className="rounded-2xl bg-[#e5ddd5] p-3 min-h-[260px]">
              <div className="bg-emerald-600 text-white rounded-t-xl px-3 py-2 flex items-center gap-2 text-sm font-semibold"><span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">W</span> WTech <CheckCircle size={13} className="text-emerald-200" /></div>
              <div className="bg-white rounded-b-xl rounded-tr-xl p-3 mt-1 text-[13px] text-slate-700 whitespace-pre-wrap break-words shadow-sm">
                {(rendered || smsBody) || <span className="text-slate-400">Mesaj içeriği burada görünecek…</span>}
                <div className="text-right text-[10px] text-slate-400 mt-1">{new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} ✓✓</div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-100 p-3 min-h-[260px]">
              <div className="bg-white rounded-xl p-3 text-[13px] text-slate-700 whitespace-pre-wrap break-words shadow-sm">{smsBody || rendered || <span className="text-slate-400">SMS içeriği burada görünecek…</span>}</div>
            </div>
          )}
          <div className="text-center text-[11px] text-slate-400 mt-2">Karakter: {charCount} / {charLimit} · {channel === 'sms' ? Math.max(1, Math.ceil(charCount / 160)) : 1} Mesaj</div>
          <button onClick={onTest} className="w-full mt-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center justify-center gap-2"><Send size={14} /> Test Mesajı Gönder</button>
        </div>
      </div>

      {/* Alt grid: ayarlar / etiketleme / özet */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* 4. Gönderim Ayarları */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">4. Gönderim Ayarları</h3>
          <div>
            <div className="text-[12px] font-semibold text-slate-500 mb-1.5">Gönderim Zamanı</div>
            <div className="space-y-1">
              {[{ k: 'now', l: 'Hemen Gönder' }, { k: 'scheduled', l: 'Belirli Bir Zamanda Gönder' }, { k: 'recurring', l: 'Zamanla (Aralıklı Gönderim)' }].map((o) => (
                <button key={o.k} onClick={() => setSendTime(o.k as any)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition ${sendTime === o.k ? 'text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${sendTime === o.k ? 'border-emerald-500' : 'border-slate-300'}`}>{sendTime === o.k && <span className="w-2 h-2 rounded-full bg-emerald-500" />}</span>{o.l}
                </button>
              ))}
            </div>
            {sendTime === 'scheduled' && <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-100" />}
          </div>
          <div>
            <div className="text-[12px] font-semibold text-slate-500 mb-1.5">Gönderim Hızı</div>
            <select value={speed} onChange={(e) => setSpeed(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100">
              {Object.entries(SPEED).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Sistem, güvenli hızda gönderim yapar.</p>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-slate-500 mb-1.5">Tekrar Gönderim</div>
            <select value={retry} onChange={(e) => setRetry(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100">
              <option value="none">Tekrar gönderme</option>
              <option value="unsent">Gönderilmemişlere tekrar gönder</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Başarısız olan mesajlar otomatik tekrar gönderilir.</p>
          </div>
          <label className="flex items-center justify-between gap-2 pt-1">
            <span className="text-sm text-slate-600 flex items-center gap-1.5">Opt-out olanları gönderimden hariç tut <Info size={13} className="text-slate-300" /></span>
            <button onClick={() => setOptOut((v) => !v)} className={`w-11 h-6 rounded-full transition relative ${optOut ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${optOut ? 'left-[22px]' : 'left-0.5'}`} /></button>
          </label>
        </div>

        {/* 5. Etiketleme */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">5. Etiketleme</h3>
          <div>
            <div className="text-[12px] font-semibold text-slate-500 mb-1.5">Kampanya Etiketleri</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <span key={t} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[12px] font-medium flex items-center gap-1">{t}<button onClick={() => setTags(tags.filter((x) => x !== t))}><X size={12} className="text-slate-400 hover:text-rose-500" /></button></span>
              ))}
            </div>
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Etiket ekle, Enter'a bas…" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-100" />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-slate-500 mb-1.5">Not (Opsiyonel)</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 255))} rows={4} placeholder="Bu kampanya hakkında not…" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-100 resize-none" />
            <div className="text-right text-[11px] text-slate-400">{note.length} / 255</div>
          </div>
        </div>

        {/* 6. Gönderim Özeti */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">6. Gönderim Özeti</h3>
          <div className="space-y-2 text-[13px]">
            <Row label="Kanal" value={channel === 'sms' ? 'SMS' : 'WhatsApp API'} icon={channel === 'sms' ? Smartphone : MessageCircle} />
            <Row label="Kampanya Türü" value={CAMPAIGN_TYPES.find((c) => c.key === campaign)?.label || '—'} icon={Megaphone} />
            <Row label="Alıcı Grubu" value={currentAudienceLabel} icon={Users} />
            <Row label="Alıcı Sayısı" value={`${nf(recipientCount)} kişi`} icon={User} />
            <Row label="Mesaj Sayısı" value={channel === 'sms' ? `${Math.max(1, Math.ceil(charCount / 160))}` : '1'} icon={MessageSquare} />
            <Row label="Tahmini Süre" value={`~ ${estimateMin} dk`} icon={Clock} />
          </div>
          <button onClick={onStart} disabled={sending} className="w-full mt-1 px-4 py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-60 flex items-center justify-center gap-2">
            {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Gönderimi Başlat
          </button>
          <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1"><Zap size={12} /> {SPEED[speed]?.label} hızında gönderilir</p>
        </div>
      </div>

      {/* Bilgi şeridi */}
      <div className="bg-sky-50 border border-sky-100 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-[12px] text-sky-700 flex items-center gap-2"><Info size={15} /> WhatsApp gönderimleriniz, Meta politikalarına ve KVKK mevzuatına uygun olarak yapılır. Opt-out olan numaralara mesaj gönderilmez.</p>
      </div>

      {/* Geçmiş kampanyalar modalı */}
      {histOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setHistOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><History size={17} className="text-emerald-500" /> Geçmiş Kampanyalar</h3>
              <button onClick={() => setHistOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="p-4 overflow-y-auto">
              {histLoading ? (
                <div className="text-center py-10 text-slate-400"><Loader2 size={22} className="animate-spin mx-auto" /></div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">Henüz kampanya gönderilmemiş.</div>
              ) : (
                <div className="space-y-2">
                  {jobs.map((j) => (
                    <div key={j.id} className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2.5">
                      <div>
                        <div className="text-sm font-semibold text-slate-700">{templates.find((t) => t.id === j.templateId)?.name || 'Toplu Gönderim'}</div>
                        <div className="text-[11px] text-slate-400">{j.createdAt ? new Date(j.createdAt).toLocaleString('tr-TR') : ''}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right"><div className="text-sm font-bold text-slate-700">{nf(j.sent ?? 0)}/{nf(j.total ?? 0)}</div><div className="text-[10px] text-slate-400">gönderildi</div></div>
                        <span className={`px-2 py-1 rounded-md text-[11px] font-medium ${statusColor(j.status)}`}>{statusLabel(j.status)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alıcıları Yönet modalı */}
      {recipOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setRecipOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Users size={17} className="text-emerald-500" /> Alıcıları Yönet</h3>
              <button onClick={() => setRecipOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-slate-600">Seçili grup: <span className="font-semibold text-slate-800">{currentAudienceLabel}</span></div>
                <button onClick={refreshPreviewCount} className="text-sm text-emerald-600 hover:underline flex items-center gap-1"><RefreshCw size={13} className={recipLoading ? 'animate-spin' : ''} /> Yenile</button>
              </div>
              {(audienceType === 'phones' || audienceType === 'manual') && (
                <textarea value={manualPhones} onChange={(e) => setManualPhones(e.target.value)} rows={3} placeholder="Numaraları virgül veya satırla ayırın" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-100 resize-none" />
              )}
              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <div className="text-[12px] text-slate-500">Geçerli alıcı</div>
                <div className="text-xl font-extrabold text-emerald-600">{previewCount != null ? nf(previewCount) : nf(recipientCount)} kişi</div>
              </div>

              {/* Alıcı listesi */}
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
                  <ListChecks size={14} className="text-slate-400" />
                  <span className="text-[12px] font-semibold text-slate-500 flex-1">Alıcı Listesi</span>
                  <input value={recipSearch} onChange={(e) => setRecipSearch(e.target.value)} placeholder="Ara: ad / telefon" className="px-2.5 py-1 rounded-lg border border-slate-200 text-[12px] outline-none focus:ring-2 focus:ring-emerald-100 w-44" />
                </div>
                <div className="max-h-[40vh] overflow-y-auto">
                  {recipLoading ? (
                    <div className="text-center py-8 text-slate-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>
                  ) : filteredRecipients.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">{previewCount === 0 ? 'Bu grupta alıcı bulunamadı.' : 'Liste için "Yenile"ye basın.'}</div>
                  ) : (
                    <table className="w-full text-[13px]">
                      <thead className="text-[11px] text-slate-400 sticky top-0 bg-white">
                        <tr className="border-b border-slate-100">
                          <th className="text-left font-medium px-3 py-2">Müşteri</th>
                          <th className="text-left font-medium px-3 py-2">Telefon</th>
                          {showAmountCol && <th className="text-right font-medium px-3 py-2">Tutar</th>}
                          {showRefCol && <th className="text-left font-medium px-3 py-2">Sipariş</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecipients.map((r, i) => (
                          <tr key={r.phone + i} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-700 font-medium">{r.ad}{r.durum && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{r.durum}</span>}</td>
                            <td className="px-3 py-2 text-slate-500">{r.phone}</td>
                            {showAmountCol && <td className="px-3 py-2 text-right font-semibold text-slate-700">{r.tutar > 0 ? tl(r.tutar) : '—'}</td>}
                            {showRefCol && <td className="px-3 py-2 text-slate-500">{r.ref || '—'}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {showAmountCol && filteredRecipients.length > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50 text-[12px]">
                    <span className="text-slate-500">{nf(filteredRecipients.length)} alıcı</span>
                    <span className="font-bold text-slate-700">Toplam: {tl(filteredRecipients.reduce((a, r) => a + (r.tutar || 0), 0))}</span>
                  </div>
                )}
              </div>

              <button onClick={() => setRecipOpen(false)} className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600">Tamam</button>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="fixed bottom-4 right-4 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-[12px] text-slate-500 flex items-center gap-2 shadow"><Loader2 size={13} className="animate-spin" /> Yükleniyor…</div>}
    </div>
  );
}

function Row({ label, value, strong, icon: Icon }: { label: string; value: string; strong?: boolean; icon?: any }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 flex items-center gap-1.5">{Icon && <Icon size={14} className="text-slate-400" />}{label}</span>
      <span className={strong ? 'font-bold text-slate-800' : 'font-medium text-slate-700'}>{value}</span>
    </div>
  );
}
function statusColor(s?: string) {
  const k = (s || '').toLowerCase();
  if (k === 'done' || k === 'completed' || k === 'sent') return 'bg-emerald-50 text-emerald-700';
  if (k === 'running' || k === 'sending' || k === 'queued') return 'bg-sky-50 text-sky-700';
  if (k === 'failed' || k === 'error') return 'bg-rose-50 text-rose-600';
  if (k === 'canceled' || k === 'cancelled') return 'bg-slate-100 text-slate-500';
  return 'bg-slate-100 text-slate-500';
}
function statusLabel(s?: string) {
  const k = (s || '').toLowerCase();
  return ({ done: 'Tamamlandı', completed: 'Tamamlandı', sent: 'Gönderildi', running: 'Gönderiliyor', sending: 'Gönderiliyor', queued: 'Kuyrukta', failed: 'Başarısız', error: 'Hata', canceled: 'İptal', cancelled: 'İptal' } as any)[k] || (s || '—');
}
