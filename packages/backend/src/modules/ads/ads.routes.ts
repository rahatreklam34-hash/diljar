import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';

const router = Router();
const META_API_VERSION = process.env.META_API_VERSION || 'v23.0';

// ───────────────────────── Tipler ─────────────────────────
type CampaignType = 'sales' | 'traffic' | 'messages' | 'leads' | 'awareness' | 'engagement' | 'app' | 'other';
type CampaignStatus = 'Güçlü' | 'İncele' | 'Riskli';

interface AdAction { action_type?: string; value?: string }
interface InsightRow {
  campaign_id?: string; campaign_name?: string; adset_id?: string; adset_name?: string; ad_id?: string; ad_name?: string;
  spend?: string; impressions?: string; clicks?: string; ctr?: string; cpc?: string; cpm?: string;
  actions?: AdAction[]; purchase_roas?: Array<{ value?: string }>;
}
interface CampaignMetaRow { id?: string; name?: string; status?: string; effective_status?: string; objective?: string }
interface EntityMetaRow { id?: string; name?: string; status?: string; effective_status?: string; creative?: { id?: string; name?: string; thumbnail_url?: string; image_url?: string; video_id?: string } }
interface ListResponse<T> { data?: T[]; paging?: { next?: string }; error?: { message?: string; type?: string; code?: number } }

// ───────────────────────── Yardımcılar ─────────────────────────
const normalizeAdAccountId = (v: string) => { const t = (v || '').trim(); return !t ? '' : t.startsWith('act_') ? t : `act_${t}`; };
const toNumber = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const statusLabel = (s?: number) => {
  const m: Record<number, string> = { 1: 'Aktif', 2: 'Devre dışı', 3: 'Ödenmemiş bakiye', 7: 'İnceleme bekliyor', 8: 'Uzlaşma bekliyor', 9: 'Askıda', 100: 'Kapatıldı', 101: 'Silindi' };
  return typeof s === 'number' ? m[s] || `Durum kodu: ${s}` : 'Bilinmiyor';
};
const campaignTypeLabel = (t: CampaignType) => ({ sales: 'Satış', traffic: 'Trafik', messages: 'Mesaj', leads: 'Lead', awareness: 'Bilinirlik', engagement: 'Etkileşim', app: 'Uygulama', other: 'Diğer' }[t]);

const inferTypeFromObjective = (objective?: string): CampaignType => {
  const v = (objective || '').toUpperCase();
  if (v.includes('SALES') || v.includes('CONVERSIONS') || v.includes('PRODUCT_CATALOG')) return 'sales';
  if (v.includes('LEAD')) return 'leads';
  if (v.includes('TRAFFIC') || v.includes('LINK_CLICKS') || v.includes('LANDING_PAGE')) return 'traffic';
  if (v.includes('MESSAGES')) return 'messages';
  if (v.includes('AWARENESS') || v.includes('REACH')) return 'awareness';
  if (v.includes('ENGAGEMENT') || v.includes('VIDEO') || v.includes('POST')) return 'engagement';
  if (v.includes('APP')) return 'app';
  return 'other';
};
const inferTypeFromActions = (actions?: AdAction[]): CampaignType | undefined => {
  if (!Array.isArray(actions)) return undefined;
  const at = actions.map((i) => i.action_type || '').join('|').toLowerCase();
  if (at.includes('messaging') || at.includes('message')) return 'messages';
  if (at.includes('purchase')) return 'sales';
  if (at.includes('lead')) return 'leads';
  if (at.includes('profile_visit')) return 'traffic';
  if (at.includes('post_engagement') || at.includes('page_engagement') || at.includes('video_view')) return 'engagement';
  return undefined;
};
const resolveType = (obj: CampaignType, act?: CampaignType): CampaignType => {
  if (['sales', 'traffic', 'leads', 'awareness', 'app'].includes(obj)) return obj;
  if (obj === 'engagement' && act === 'messages') return 'messages';
  return act || obj;
};
const findActionValue = (actions: AdAction[] | undefined, types: string[]) => {
  if (!Array.isArray(actions)) return undefined;
  for (const t of types) { const a = actions.find((i) => i.action_type === t); if (a) return { value: toNumber(a.value), actionType: t }; }
  return undefined;
};

const actionGroups: Record<CampaignType, { label: string; actions: string[] }> = {
  sales: { label: 'Satın alma', actions: ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_conversion.purchase'] },
  leads: { label: 'Lead', actions: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration'] },
  messages: { label: 'Mesaj görüşmesi', actions: ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply', 'onsite_conversion.total_messaging_connection', 'messaging_conversation_started_7d'] },
  traffic: { label: 'Profil / site ziyareti', actions: ['profile_visit', 'onsite_conversion.profile_visit', 'onsite_conversion.instagram_profile_visit', 'instagram_profile_visit', 'landing_page_view', 'link_click'] },
  engagement: { label: 'Etkileşim', actions: ['post_engagement', 'page_engagement', 'video_view', 'post_reaction'] },
  awareness: { label: 'Gösterim', actions: [] },
  app: { label: 'Uygulama aksiyonu', actions: ['mobile_app_install', 'app_custom_event', 'omni_app_install'] },
  other: { label: 'Hedef sonuç', actions: [] },
};

function extractPrimaryResult(actions: AdAction[] | undefined, objective: string | undefined, clicks: number, impressions: number) {
  const campaignType = resolveType(inferTypeFromObjective(objective), inferTypeFromActions(actions));
  const group = actionGroups[campaignType];
  const match = findActionValue(actions, group.actions);
  if (match) return { value: match.value, label: group.label, actionType: match.actionType, campaignType };
  if (campaignType === 'traffic') return { value: clicks, label: 'Tıklama / ziyaret', campaignType };
  if (campaignType === 'awareness') return { value: impressions, label: 'Gösterim', campaignType };
  return { value: 0, label: group.label, campaignType };
}
const extractRoas = (pr?: Array<{ value?: string }>) => (!Array.isArray(pr) ? 0 : toNumber(pr.find((i) => i.value !== undefined)?.value));

function classify(c: { campaignType: CampaignType; spend: number; results: number; ctr: number; cpc: number; roas: number }): CampaignStatus {
  const costPerResult = c.results > 0 ? c.spend / c.results : 0;
  const noRes = c.spend > 0 && c.results <= 0;
  const lowCtr = c.ctr > 0 && c.ctr < 1;
  if (c.campaignType === 'sales') {
    if (noRes || lowCtr || c.cpc > 20 || (c.roas > 0 && c.roas < 1.5)) return 'Riskli';
    if (c.roas >= 3 || (c.results > 0 && c.ctr >= 2)) return 'Güçlü';
    return 'İncele';
  }
  if (c.campaignType === 'traffic') {
    if (noRes || lowCtr || c.cpc > 20) return 'Riskli';
    if (c.ctr >= 2 || c.results >= 100) return 'Güçlü';
    return 'İncele';
  }
  if (c.campaignType === 'messages' || c.campaignType === 'leads') {
    if (noRes || lowCtr || (costPerResult > 0 && costPerResult > 500)) return 'Riskli';
    if (c.results >= 10 && c.ctr >= 1.5) return 'Güçlü';
    return 'İncele';
  }
  if (noRes || lowCtr || c.cpc > 20) return 'Riskli';
  if (c.ctr >= 2.5 || c.results >= 1000) return 'Güçlü';
  return 'İncele';
}

function buildSummary(campaigns: any[], currency?: string) {
  const sales = campaigns.filter((c) => c.campaignType === 'sales' && c.roas > 0);
  const s = campaigns.reduce((t, c) => ({ spend: t.spend + c.spend, impressions: t.impressions + c.impressions, clicks: t.clicks + c.clicks, results: t.results + c.results }), { spend: 0, impressions: 0, clicks: 0, results: 0 });
  return {
    spend: s.spend, impressions: s.impressions, clicks: s.clicks, results: s.results,
    ctr: s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0,
    cpc: s.clicks > 0 ? s.spend / s.clicks : 0,
    cpm: s.impressions > 0 ? (s.spend / s.impressions) * 1000 : 0,
    roas: sales.length > 0 ? sales.reduce((t, c) => t + c.roas, 0) / sales.length : 0,
    campaignCount: campaigns.length, currency,
  };
}

const buildGraphUrl = (endpoint: string, params: Record<string, string>) => {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url;
};
async function graphGet<T>(endpoint: string, params: Record<string, string>, accessToken: string): Promise<T> {
  const res = await fetch(buildGraphUrl(endpoint, { ...params, access_token: accessToken }), { method: 'GET', headers: { Accept: 'application/json' } });
  const data: any = await res.json();
  if (!res.ok || data.error) throw new ApiError(res.status || 400, data.error?.message || 'Meta API isteği başarısız oldu.');
  return data as T;
}
async function graphList<T>(endpoint: string, params: Record<string, string>, accessToken: string): Promise<T[]> {
  const rows: T[] = []; let nextUrl: string | undefined; let page = 0;
  do {
    const res = nextUrl
      ? await fetch(nextUrl, { method: 'GET', headers: { Accept: 'application/json' } })
      : await fetch(buildGraphUrl(endpoint, { ...params, access_token: accessToken }), { method: 'GET', headers: { Accept: 'application/json' } });
    const data = (await res.json()) as ListResponse<T>;
    if (!res.ok || data.error) throw new ApiError(res.status || 400, data.error?.message || 'Meta verisi alınamadı.');
    rows.push(...(data.data || [])); nextUrl = data.paging?.next; page += 1;
  } while (nextUrl && page < 6);
  return rows;
}
async function graphPost(endpoint: string, payload: Record<string, string>) {
  const res = await fetch(buildGraphUrl(endpoint, {}), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(payload) });
  const data: any = await res.json();
  if (!res.ok || data.error) throw new ApiError(res.status || 400, data.error?.message || 'Meta aksiyonu uygulanamadı.');
  return data as { id?: string; success?: boolean };
}

function dateParams(body: any): Record<string, string> {
  const allowed = new Set(['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month', 'custom']);
  const req = allowed.has(body.datePreset || '') ? body.datePreset : 'last_30d';
  if (req === 'custom' && body.dateFrom && body.dateTo) return { time_range: JSON.stringify({ since: body.dateFrom, until: body.dateTo }) };
  return { date_preset: req === 'custom' ? 'last_30d' : req };
}

// Kayıtlı Meta bağlantısı (token sunucuda saklanır, istemciye gönderilmez)
async function getMeta(tenantId: string): Promise<{ accessToken: string; adAccountId: string; account: any } | null> {
  const s = await prisma.integrationSetting.findFirst({ where: { scope: 'TENANT', tenantId, provider: 'meta' } });
  const c: any = s?.config || {};
  if (!c.accessToken || !c.adAccountId) return null;
  return { accessToken: c.accessToken, adAccountId: c.adAccountId, account: c.account || {} };
}
async function getOpenAI(tenantId: string): Promise<{ apiKey: string; model: string } | null> {
  let s = await prisma.integrationSetting.findFirst({ where: { scope: 'TENANT', tenantId, provider: 'openai', enabled: true } });
  if (!s) s = await prisma.integrationSetting.findFirst({ where: { scope: 'PLATFORM', provider: 'openai', enabled: true } });
  const c: any = s?.config || {};
  if (!c.api_key) return null;
  return { apiKey: c.api_key, model: c.model || 'gpt-4o-mini' };
}

// ───────────────────────── Bağlantı uçları ─────────────────────────
router.get('/connection', asyncHandler(async (req: Request, res: Response) => {
  const m = await getMeta(req.tenantId!);
  res.json({ connected: !!m, adAccountId: m?.adAccountId || '', account: m?.account || null });
}));

router.post('/connection', asyncHandler(async (req: Request, res: Response) => {
  const accessToken = String(req.body?.accessToken || '').trim();
  const adAccountId = normalizeAdAccountId(String(req.body?.adAccountId || ''));
  if (!accessToken || !adAccountId) throw new ApiError(400, 'Meta access token ve reklam hesabı ID alanlarını doldurun.');
  const acc = await graphGet<any>(adAccountId, { fields: 'id,name,account_status,currency,timezone_name,amount_spent,balance' }, accessToken);
  const account = { id: acc.id, name: acc.name || adAccountId, status: statusLabel(acc.account_status), currency: acc.currency, timezone: acc.timezone_name, amountSpent: acc.amount_spent, balance: acc.balance };
  await prisma.integrationSetting.upsert({
    where: { scope_tenantId_provider: { scope: 'TENANT', tenantId: req.tenantId!, provider: 'meta' } },
    update: { config: { accessToken, adAccountId, account }, enabled: true, category: 'ADS' },
    create: { scope: 'TENANT', tenantId: req.tenantId!, provider: 'meta', category: 'ADS', enabled: true, config: { accessToken, adAccountId, account } },
  });
  res.json({ ok: true, message: 'Meta reklam hesabı bağlantısı doğrulandı ve kaydedildi.', account, adAccountId });
}));

router.delete('/connection', asyncHandler(async (req: Request, res: Response) => {
  await prisma.integrationSetting.deleteMany({ where: { scope: 'TENANT', tenantId: req.tenantId!, provider: 'meta' } });
  res.json({ ok: true });
}));

// ───────────────────────── Insights (özet + kampanyalar) ─────────────────────────
router.post('/insights', asyncHandler(async (req: Request, res: Response) => {
  const m = await getMeta(req.tenantId!);
  if (!m) throw new ApiError(400, 'Önce Meta hesabını bağlayın.');
  const dp = dateParams(req.body || {});
  const presetVal = (dp.date_preset || (req.body?.datePreset === 'custom' ? 'custom' : 'last_30d'));

  const acc = await graphGet<any>(m.adAccountId, { fields: 'id,name,account_status,currency,timezone_name,amount_spent,balance' }, m.accessToken);
  const account = { id: acc.id, name: acc.name || m.adAccountId, status: statusLabel(acc.account_status), currency: acc.currency, timezone: acc.timezone_name, amountSpent: acc.amount_spent, balance: acc.balance };

  const [insightRows, campaignMetaRows] = await Promise.all([
    graphList<InsightRow>(`${m.adAccountId}/insights`, { fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,actions,purchase_roas', level: 'campaign', limit: '500', ...dp }, m.accessToken),
    graphList<CampaignMetaRow>(`${m.adAccountId}/campaigns`, { fields: 'id,name,status,effective_status,objective', limit: '500' }, m.accessToken),
  ]);
  const metaById = new Map(campaignMetaRows.map((c) => [c.id, c]));
  const campaigns = insightRows.filter((r) => r.campaign_id).map((r) => {
    const meta = metaById.get(r.campaign_id);
    const clicks = toNumber(r.clicks); const impressions = toNumber(r.impressions);
    const pr = extractPrimaryResult(r.actions, meta?.objective, clicks, impressions);
    const base = {
      campaignId: r.campaign_id || '', campaignName: r.campaign_name || meta?.name || 'Adsız kampanya',
      campaignType: pr.campaignType, campaignTypeLabel: campaignTypeLabel(pr.campaignType),
      spend: toNumber(r.spend), impressions, clicks, ctr: toNumber(r.ctr), cpc: toNumber(r.cpc), cpm: toNumber(r.cpm),
      results: pr.value, primaryResultLabel: pr.label, primaryResultAction: pr.actionType,
      roas: extractRoas(r.purchase_roas), objective: meta?.objective, deliveryStatus: meta?.effective_status || meta?.status,
    };
    return { ...base, status: classify(base) };
  }).sort((a, b) => b.spend - a.spend);

  res.json({ ok: true, message: 'Meta reklam verileri canlı alındı.', data: { account, summary: buildSummary(campaigns, account.currency), campaigns, datePreset: presetVal, dateFrom: req.body?.dateFrom, dateTo: req.body?.dateTo, fetchedAt: new Date().toISOString() } });
}));

// ───────────────────────── Kampanya detayı (ad set + reklamlar) ─────────────────────────
router.post('/campaign-detail', asyncHandler(async (req: Request, res: Response) => {
  const m = await getMeta(req.tenantId!);
  if (!m) throw new ApiError(400, 'Önce Meta hesabını bağlayın.');
  const campaign = req.body?.campaign;
  if (!campaign?.campaignId) throw new ApiError(400, 'Kampanya ID gerekli.');
  const dp = dateParams(req.body || {});

  const extractResults = (actions: AdAction[] | undefined) => {
    if (campaign.primaryResultAction) { const d = findActionValue(actions, [campaign.primaryResultAction]); if (d) return { value: d.value, label: campaign.primaryResultLabel, actionType: d.actionType }; }
    const pri = [
      ...(campaign.campaignType === 'sales' ? ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_conversion.purchase'] : []),
      ...(campaign.campaignType === 'leads' ? ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'] : []),
      ...(campaign.campaignType === 'messages' ? ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply', 'messaging_conversation_started_7d'] : []),
      ...(campaign.campaignType === 'traffic' ? ['profile_visit', 'onsite_conversion.profile_visit', 'onsite_conversion.instagram_profile_visit', 'landing_page_view', 'link_click'] : []),
      ...(campaign.campaignType === 'engagement' ? ['post_engagement', 'page_engagement', 'video_view', 'post_reaction'] : []),
    ];
    const match = findActionValue(actions, pri);
    return { value: match?.value || 0, label: campaign.primaryResultLabel, actionType: match?.actionType };
  };

  const [adsetRows, adRows, adsetMetaRows, adMetaRows] = await Promise.all([
    graphList<InsightRow>(`${campaign.campaignId}/insights`, { fields: 'adset_id,adset_name,spend,impressions,clicks,ctr,cpc,cpm,actions,purchase_roas', level: 'adset', limit: '500', ...dp }, m.accessToken),
    graphList<InsightRow>(`${campaign.campaignId}/insights`, { fields: 'ad_id,ad_name,adset_id,adset_name,spend,impressions,clicks,ctr,cpc,cpm,actions,purchase_roas', level: 'ad', limit: '500', ...dp }, m.accessToken),
    graphList<EntityMetaRow>(`${campaign.campaignId}/adsets`, { fields: 'id,name,status,effective_status', limit: '500' }, m.accessToken),
    graphList<EntityMetaRow>(`${campaign.campaignId}/ads`, { fields: 'id,name,status,effective_status,creative{id,name,thumbnail_url,image_url,video_id}', limit: '500' }, m.accessToken),
  ]);
  const adsetMetaById = new Map(adsetMetaRows.map((i) => [i.id, i]));
  const adMetaById = new Map(adMetaRows.map((i) => [i.id, i]));

  const adsets = adsetRows.filter((r) => r.adset_id).map((r) => {
    const meta = adsetMetaById.get(r.adset_id); const pr = extractResults(r.actions);
    return { id: r.adset_id || '', name: r.adset_name || meta?.name || 'Adsız ad set', spend: toNumber(r.spend), impressions: toNumber(r.impressions), clicks: toNumber(r.clicks), ctr: toNumber(r.ctr), cpc: toNumber(r.cpc), cpm: toNumber(r.cpm), results: pr.value, primaryResultLabel: pr.label, primaryResultAction: pr.actionType, roas: extractRoas(r.purchase_roas), deliveryStatus: meta?.effective_status || meta?.status };
  });
  const ads = adRows.filter((r) => r.ad_id).map((r) => {
    const meta = adMetaById.get(r.ad_id); const pr = extractResults(r.actions);
    return { id: r.ad_id || '', name: r.ad_name || meta?.name || 'Adsız reklam', adsetId: r.adset_id, adsetName: r.adset_name, spend: toNumber(r.spend), impressions: toNumber(r.impressions), clicks: toNumber(r.clicks), ctr: toNumber(r.ctr), cpc: toNumber(r.cpc), cpm: toNumber(r.cpm), results: pr.value, primaryResultLabel: pr.label, primaryResultAction: pr.actionType, roas: extractRoas(r.purchase_roas), deliveryStatus: meta?.effective_status || meta?.status, previewUrl: meta?.creative?.thumbnail_url || meta?.creative?.image_url, thumbnailUrl: meta?.creative?.thumbnail_url, imageUrl: meta?.creative?.image_url, videoId: meta?.creative?.video_id, creativeName: meta?.creative?.name };
  });
  res.json({ ok: true, message: 'Kampanya detayı canlı alındı.', data: { campaign, adsets, ads, fetchedAt: new Date().toISOString() } });
}));

// ───────────────────────── Aksiyonlar (oluştur/durum/bütçe) ─────────────────────────
const objectiveToMeta = (v?: string) => ({ 'Satış': 'OUTCOME_SALES', 'Lead toplama': 'OUTCOME_LEADS', 'Trafik': 'OUTCOME_TRAFFIC', 'Marka bilinirliği': 'OUTCOME_AWARENESS', 'Mesaj / WhatsApp': 'OUTCOME_ENGAGEMENT' } as Record<string, string>)[v || ''] || v || 'OUTCOME_TRAFFIC';

router.post('/action', asyncHandler(async (req: Request, res: Response) => {
  const m = await getMeta(req.tenantId!);
  if (!m) throw new ApiError(400, 'Önce Meta hesabını bağlayın.');
  const body = req.body || {};
  if (body.action === 'create_campaign') {
    const name = String(body.campaignName || '').trim();
    if (!name) throw new ApiError(400, 'Kampanya adı gerekli.');
    const result = await graphPost(`${m.adAccountId}/campaigns`, { access_token: m.accessToken, name, objective: objectiveToMeta(body.objective), status: body.status || 'PAUSED', special_ad_categories: '[]' });
    return res.json({ ok: true, message: 'Kampanya Meta reklam hesabında oluşturuldu.', id: result.id });
  }
  const entityId = String(body.entityId || '').trim();
  if (!entityId) throw new ApiError(400, 'Aksiyon için entity ID gerekli.');
  if (['update_campaign_status', 'update_adset_status', 'update_ad_status'].includes(body.action)) {
    const result = await graphPost(entityId, { access_token: m.accessToken, status: body.status || 'PAUSED' });
    return res.json({ ok: true, message: 'Meta durumu güncellendi.', id: entityId, success: result.success ?? true });
  }
  if (body.action === 'update_adset_budget') {
    const daily = String(body.dailyBudget || '').trim();
    if (!/^\d+$/.test(daily)) throw new ApiError(400, 'Ad set bütçesi kuruş cinsinden tam sayı olmalı.');
    const result = await graphPost(entityId, { access_token: m.accessToken, daily_budget: daily });
    return res.json({ ok: true, message: 'Ad set bütçesi güncellendi.', id: entityId, success: result.success ?? true });
  }
  throw new ApiError(400, 'Bilinmeyen Meta aksiyonu.');
}));

// ───────────────────────── AI analiz / chat ─────────────────────────
const aiFallback = 'AI ön analizi: En güçlü alan remarketing ve Advantage+ kampanyaları. Soğuk kitle kreatif testinde CTR düşük ve CPC yüksek görünüyor. İlk aksiyon olarak düşük CTR kampanyada kreatif açısını yenileyin, remarketing bütçesini kontrollü artırın ve ROAS düşük kampanyalarda hedef kitleyi yeniden segmentleyin.';
router.post('/ai', asyncHandler(async (req: Request, res: Response) => {
  const oa = await getOpenAI(req.tenantId!);
  if (!oa) return res.json({ answer: aiFallback, mode: 'fallback' });
  const body = req.body || {};
  const prompt = [
    'Meta Ads AI paneli için Türkçe reklam performansı danışmanı gibi cevap ver.',
    'Kısa, net ve aksiyon odaklı ol. Bilmediğin veriyi uydurma.',
    `Kullanıcı sorusu: ${body.message || 'Genel performansı yorumla.'}`,
    `Metrikler: ${JSON.stringify(body.metrics ?? [])}`,
    `Kampanyalar: ${JSON.stringify(body.campaigns ?? [])}`,
    'Cevap formatı: 1 kısa özet + 3 maddelik aksiyon önerisi.',
  ].join('\n\n');
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oa.apiKey}` }, body: JSON.stringify({ model: oa.model, messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 550 }) });
    const data: any = await r.json();
    if (!r.ok) return res.json({ answer: `AI yanıtı üretilemedi: ${data.error?.message || 'API hatası'}`, mode: 'error' });
    const answer = data?.choices?.[0]?.message?.content || aiFallback;
    res.json({ answer: String(answer).trim(), mode: 'openai' });
  } catch { res.json({ answer: aiFallback, mode: 'fallback' }); }
}));

// ───────────────────────── AI kreatif görsel ─────────────────────────
router.post('/creative-image', asyncHandler(async (req: Request, res: Response) => {
  const oa = await getOpenAI(req.tenantId!);
  if (!oa) throw new ApiError(400, 'Görsel üretimi için Entegrasyonlar > OpenAI anahtarı tanımlı olmalı.');
  const body = req.body || {};
  const prompt = [
    'Create a premium performance marketing ad visual.',
    'Style: modern, clean product/service advertising composition, no fake UI text blocks, no clutter.',
    `Product or service: ${body.product || 'product'}.`,
    `Target audience: ${body.audience || 'business owners and customers'}.`,
    `Ad format: ${body.format || 'social media feed visual'}.`,
    body.brief ? `Creative brief: ${body.brief}.` : '',
    'Avoid copyrighted logos and unreadable text. Leave clean space for overlay copy.',
  ].filter(Boolean).join('\n');
  const models = Array.from(new Set([process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', 'dall-e-3']));
  let lastMessage = 'AI görseli üretilemedi.';
  for (const model of models) {
    const bodyReq = model.startsWith('dall-e-3') ? { model, prompt, size: '1024x1024', quality: 'standard', n: 1 } : { model, prompt, size: '1024x1024', n: 1 };
    const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oa.apiKey}` }, body: JSON.stringify(bodyReq) });
    const data: any = await r.json();
    if (!r.ok || data.error) { lastMessage = data.error?.message || lastMessage; continue; }
    const img = data.data?.[0];
    const imageUrl = img?.b64_json ? `data:image/png;base64,${img.b64_json}` : img?.url;
    if (imageUrl) return res.json({ ok: true, message: 'AI kreatif görseli üretildi.', imageUrl, model });
  }
  res.json({ ok: false, message: lastMessage });
}));

export default router;
