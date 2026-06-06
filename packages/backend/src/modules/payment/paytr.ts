import crypto from 'crypto';

export interface PaytrConfig {
  merchant_id: string;
  merchant_key: string;
  merchant_salt: string;
}

export interface PaytrTokenOpts {
  config: PaytrConfig;
  testMode: boolean;
  merchantOid: string;
  email: string;
  amountKurus: number;
  userName: string;
  userAddress: string;
  userPhone: string;
  userIp: string;
  okUrl: string;
  failUrl: string;
  basket: [string, string, number][]; // [ [ad, fiyat(string), adet], ... ]
}

export async function createPaytrToken(opts: PaytrTokenOpts): Promise<{ ok: true; token: string } | { ok: false; reason: string }> {
  const { config } = opts;
  const user_basket = Buffer.from(JSON.stringify(opts.basket)).toString('base64');
  const no_installment = '0';
  const max_installment = '0';
  const currency = 'TL';
  const test_mode = opts.testMode ? '1' : '0';
  const payment_amount = String(Math.max(1, Math.round(opts.amountKurus)));

  const hashStr =
    config.merchant_id + opts.userIp + opts.merchantOid + opts.email + payment_amount +
    user_basket + no_installment + max_installment + currency + test_mode;
  const paytr_token = crypto.createHmac('sha256', config.merchant_key).update(hashStr + config.merchant_salt).digest('base64');

  const params = new URLSearchParams({
    merchant_id: config.merchant_id,
    user_ip: opts.userIp,
    merchant_oid: opts.merchantOid,
    email: opts.email,
    payment_amount,
    paytr_token,
    user_basket,
    debug_on: '1',
    no_installment,
    max_installment,
    user_name: opts.userName,
    user_address: opts.userAddress,
    user_phone: opts.userPhone,
    merchant_ok_url: opts.okUrl,
    merchant_fail_url: opts.failUrl,
    timeout_limit: '30',
    currency,
    test_mode,
  });

  try {
    const resp = await fetch('https://www.paytr.com/odeme/api/get-token', { method: 'POST', body: params as any });
    const data: any = await resp.json();
    if (data.status === 'success') return { ok: true, token: data.token };
    return { ok: false, reason: data.reason || 'PayTR token alinamadi' };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'PayTR baglanti hatasi' };
  }
}

// PayTR bildirim (callback) hash dogrulama
export function verifyPaytrCallback(config: PaytrConfig, body: any): boolean {
  const token = crypto
    .createHmac('sha256', config.merchant_key)
    .update(body.merchant_oid + config.merchant_salt + body.status + body.total_amount)
    .digest('base64');
  return token === body.hash;
}
