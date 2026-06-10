import crypto from 'crypto';
import { prisma } from '../../lib/prisma';

// Tami sabitleri (resmi SDK ile birebir doğrulandı, sandbox'ta test edildi)
const FIXED_KID = '00ff6ea8-3511-4d04-946c-ba569208306f';
const FIXED_K = '87919a8f-957b-427b-ae12-167622ab52b5';
const HOSTS: Record<string, string> = {
  test: 'https://sandbox-paymentapi.tami.com.tr',
  prod: 'https://paymentapi.tami.com.tr',
};

export interface TamiCreds { merchant: string; terminal: string; secret: string; host: string; mode: string }

export async function getTami(tenantId: string): Promise<TamiCreds | null> {
  const s = await prisma.integrationSetting.findFirst({ where: { scope: 'TENANT', tenantId, provider: 'tami', enabled: true } });
  const c: any = s?.config || {};
  if (!c.merchant_number || !c.terminal_number || !c.secret_key) return null;
  const mode = String(c.mode || 'test').toLowerCase() === 'prod' ? 'prod' : 'test';
  return { merchant: String(c.merchant_number), terminal: String(c.terminal_number), secret: String(c.secret_key), host: HOSTS[mode], mode };
}

const rnd = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// PHP json_encode taklidi: forward-slash kaçışı + unicode \uXXXX (imza payload'u için zorunlu)
function phpJson(obj: any): string {
  let s = JSON.stringify(obj);
  s = s.replace(/\//g, '\\/');
  s = s.replace(/[\u0080-\uffff]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
  return s;
}

function pgToken(c: TamiCreds): string {
  const h = crypto.createHash('sha256').update(c.merchant + c.terminal + c.secret, 'utf8').digest('base64');
  return `${c.merchant}:${c.terminal}:${h}`;
}

// securityHash = body'nin JWS (HS512) imzası (v2). kid/k gizli anahtar + sabitlerden türetilir.
function jwsSign(c: TamiCreds, body: any): string {
  const kid = crypto.createHash('sha512').update(c.secret + FIXED_KID, 'utf8').digest('base64');
  const keyRaw = crypto.createHash('sha512').update(c.secret + FIXED_K + c.merchant + c.terminal, 'utf8').digest();
  const header = { kid, typ: 'JWT', alg: 'HS512' };
  const headerB64 = b64url(Buffer.from(phpJson(header), 'utf8'));
  const payloadB64 = b64url(Buffer.from(phpJson(body), 'utf8'));
  const sig = crypto.createHmac('sha512', keyRaw).update(headerB64 + '.' + payloadB64).digest();
  return `${headerB64}.${payloadB64}.${b64url(sig)}`;
}

const correlationId = () => `tami_${rnd(10)}_${Math.floor(Date.now() / 1000)}_${rnd(10)}`;

async function tamiPost(c: TamiCreds, path: string, body: any): Promise<any> {
  const r = await fetch(c.host + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'PG-Auth-Token': pgToken(c), 'correlationId': correlationId(), 'PG-Api-Version': 'v2' },
    body: JSON.stringify(body),
  });
  try { return await r.json(); } catch { return { success: false, errorMessage: 'Tami yanıtı okunamadı' }; }
}

export interface TamiCard { number: string; cvv: string; expireMonth: number; expireYear: number; holderName: string }
export interface TamiInit {
  orderId: string; amount: number; callbackUrl: string; card: TamiCard;
  buyer: any; billingAddress: any; shippingAddress: any; basket: any;
}

// 3D başlatma → threeDSHtmlContent (base64 HTML) döner
export async function tamiInitAuth(c: TamiCreds, i: TamiInit): Promise<any> {
  const body: any = {
    orderId: i.orderId,
    amount: i.amount,
    currency: 'TRY',
    installmentCount: 1,
    card: { cvv: i.card.cvv, expireMonth: i.card.expireMonth, expireYear: i.card.expireYear, holderName: i.card.holderName, number: i.card.number },
    billingAddress: i.billingAddress,
    shippingAddress: i.shippingAddress,
    buyer: i.buyer,
    basket: i.basket,
    securityHash: '',
    paymentGroup: 'PRODUCT',
    callbackUrl: i.callbackUrl,
  };
  body.securityHash = jwsSign(c, body);
  return tamiPost(c, '/payment/auth', body);
}

// 3D sonrası satışı kesinleştir
export async function tamiComplete3ds(c: TamiCreds, orderId: string): Promise<any> {
  const hashBody = { orderId };
  const securityHash = jwsSign(c, hashBody);
  return tamiPost(c, '/payment/complete-3ds', { orderId, securityHash });
}

// Callback hash doğrulama (hashedData) — alan sırası SDK ile birebir
export function verifyTamiCallback(secret: string, body: any): boolean {
  const parts = ['cardOrganization', 'cardBrand', 'cardType', 'maskedNumber', 'installmentCount', 'currencyCode', 'txnAmount', 'orderId', 'systemTime', 'success'];
  let hashStr = '';
  for (const p of parts) { if (body[p] !== undefined && body[p] !== null) hashStr += String(body[p]); }
  const gen = crypto.createHmac('sha256', secret).update(hashStr).digest('base64');
  return gen === body.hashedData;
}
