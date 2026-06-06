import https from 'https';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/http';

interface IsbankCfg {
  env: string; clientId: string; clientSecret: string; serviceAccountId: string; serviceAccountSecret: string;
  scope: string; pfxBase64: string; passphrase: string; certPem: string;
}

async function loadConfig(tenantId: string): Promise<IsbankCfg> {
  const s = await prisma.integrationSetting.findFirst({ where: { scope: 'TENANT', tenantId, provider: 'isbank' } });
  if (!s || !s.enabled) throw new ApiError(400, 'İş Bankası entegrasyonu yapılandırılmamış veya pasif.');
  const c: any = s.config || {};
  const cfg: IsbankCfg = {
    env: (c.env || 'uat').toLowerCase(), clientId: c.client_id || '', clientSecret: c.client_secret || '',
    serviceAccountId: c.service_account_id || '', serviceAccountSecret: c.service_account_secret || '',
    scope: c.scope || 'read:accounts', pfxBase64: c.pfx_base64 || '', passphrase: c.pfx_passphrase || '', certPem: c.client_cert_pem || '',
  };
  if (!cfg.clientId || !cfg.clientSecret || !cfg.serviceAccountId || !cfg.serviceAccountSecret) throw new ApiError(400, 'İş Bankası kimlik bilgileri eksik.');
  if (!cfg.pfxBase64) throw new ApiError(400, 'İstemci sertifikası (.p12) eksik. mTLS için gereklidir.');
  return cfg;
}

function host(env: string) { return env === 'prod' ? 'https://api.isbank.com.tr' : 'https://api.uat.isbank.com.tr'; }

function agentOf(cfg: IsbankCfg) {
  return new https.Agent({ pfx: Buffer.from(cfg.pfxBase64, 'base64'), passphrase: cfg.passphrase || undefined, minVersion: 'TLSv1.2', rejectUnauthorized: true });
}

// Düşük seviyeli istek (mTLS + JSON)
function doRequest(opts: { cfg: IsbankCfg; method: string; path: string; headers?: any; body?: string; form?: boolean }): Promise<{ status: number; json: any; headers: any }> {
  const url = new URL(host(opts.cfg.env) + opts.path);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: url.hostname, port: 443, path: url.pathname + url.search, method: opts.method,
      agent: agentOf(opts.cfg), headers: opts.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => { let json: any = null; try { json = data ? JSON.parse(data) : null; } catch { json = { raw: data }; } resolve({ status: res.statusCode || 0, json, headers: res.headers }); });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// Token önbelleği (tenant bazlı, ~18 dk)
const tokenCache = new Map<string, { token: string; exp: number }>();

async function getToken(tenantId: string, cfg: IsbankCfg): Promise<string> {
  const cached = tokenCache.get(tenantId);
  if (cached && cached.exp > Date.now()) return cached.token;
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const form = new URLSearchParams({ grant_type: 'password', scope: cfg.scope, username: cfg.serviceAccountId, password: cfg.serviceAccountSecret, client_id: cfg.clientId, client_secret: cfg.clientSecret }).toString();
  const r = await doRequest({ cfg, method: 'POST', path: '/api/isbank/v1/stos-identity-provider/oauth2/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Authorization: `Basic ${basic}`, 'Content-Length': Buffer.byteLength(form) }, body: form });
  if (r.status !== 200 || !r.json?.access_token) throw new ApiError(502, `İş Bankası token alınamadı (HTTP ${r.status}): ${JSON.stringify(r.json)}`);
  const token = r.json.access_token as string;
  tokenCache.set(tenantId, { token, exp: Date.now() + 18 * 60 * 1000 });
  return token;
}

function apiHeaders(cfg: IsbankCfg, token: string) {
  const h: any = { Accept: 'application/json', 'X-Isbank-Client-Id': cfg.clientId, 'X-Isbank-Client-Secret': cfg.clientSecret, Authorization: `Bearer ${token}` };
  if (cfg.certPem) h['X-Client-Certificate'] = cfg.certPem.replace(/\r?\n/g, '');
  return h;
}

export async function isbankTest(tenantId: string) {
  const cfg = await loadConfig(tenantId);
  const token = await getToken(tenantId, cfg);
  return { ok: true, env: cfg.env, tokenAlindi: !!token };
}

export async function isbankAccounts(tenantId: string, params: { currency_code?: string; account_type?: string }) {
  const cfg = await loadConfig(tenantId);
  const token = await getToken(tenantId, cfg);
  const qs = new URLSearchParams();
  if (params.currency_code) qs.set('currency_code', params.currency_code);
  if (params.account_type) qs.set('account_type', params.account_type);
  const r = await doRequest({ cfg, method: 'GET', path: '/api/isbank/v2/accounts' + (qs.toString() ? '?' + qs.toString() : ''), headers: apiHeaders(cfg, token) });
  if (r.status !== 200) throw new ApiError(502, `Hesaplar alınamadı (HTTP ${r.status}): ${JSON.stringify(r.json)}`);
  return r.json?.data || [];
}

export async function isbankTransactions(tenantId: string, accountId: string, params: { beginDate?: string; endDate?: string; pageSize?: string; financialType?: string; from?: string; transactionGroupList?: string }) {
  const cfg = await loadConfig(tenantId);
  const token = await getToken(tenantId, cfg);
  const qs = new URLSearchParams({ accountId });
  if (params.beginDate) qs.set('beginDate', params.beginDate);
  if (params.endDate) qs.set('endDate', params.endDate);
  if (params.pageSize) qs.set('pageSize', params.pageSize);
  if (params.financialType) qs.set('financialType', params.financialType);
  if (params.from) qs.set('from', params.from);
  if (params.transactionGroupList) qs.set('transactionGroupList', params.transactionGroupList);
  qs.set('remittanceDetail', 'true'); qs.set('eftDetail', 'true'); qs.set('fastDetail', 'true');
  const r = await doRequest({ cfg, method: 'GET', path: '/api/isbank/v1/deposit/transactions?' + qs.toString(), headers: apiHeaders(cfg, token) });
  if (r.status !== 200) throw new ApiError(502, `Hesap hareketleri alınamadı (HTTP ${r.status}): ${JSON.stringify(r.json)}`);
  const list = r.json?.data?.result?.accountMovementDtoList || [];
  const next = (r.headers && (r.headers['latsts'] || r.headers['link'])) || null;
  return { hareketler: list, next };
}
