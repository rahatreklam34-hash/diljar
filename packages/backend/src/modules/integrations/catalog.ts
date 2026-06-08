// Entegrasyon sağlayıcı kataloğu - frontend dinamik form için kullanılır.
export interface ProviderField {
  key: string;
  label: string;
  type?: 'text' | 'password';
  optional?: boolean;
}
export interface ProviderDef {
  provider: string;
  label: string;
  category: 'PAYMENT' | 'CARGO' | 'AI' | 'BANKING' | 'SMS';
  description?: string;
  fields: ProviderField[];
}

export const SMS_PROVIDERS: ProviderDef[] = [
  {
    provider: 'netgsm',
    label: 'NetGSM (SMS)',
    category: 'SMS',
    description: 'Toplu SMS ve sipariş bildirimleri için NetGSM API. Kullanıcı kodu, şifre ve onaylı gönderici başlığı (msgheader) gereklidir.',
    fields: [
      { key: 'usercode', label: 'Kullanıcı Kodu (Abone No / 850...)' },
      { key: 'password', label: 'API Şifresi', type: 'password' },
      { key: 'msgheader', label: 'Gönderici Başlığı (onaylı başlık)' },
    ],
  },
];

export const AI_PROVIDERS: ProviderDef[] = [
  {
    provider: 'openai',
    label: 'OpenAI (ChatGPT)',
    category: 'AI',
    description: 'Yapay zeka asistanı yanıtları için OpenAI API anahtarı',
    fields: [
      { key: 'api_key', label: 'API Key (sk-...)', type: 'password' },
      { key: 'model', label: 'Model (varsayılan: gpt-4o-mini)', optional: true },
    ],
  },
];

export const PAYMENT_PROVIDERS: ProviderDef[] = [
  {
    provider: 'paytr',
    label: 'PayTR',
    category: 'PAYMENT',
    description: 'PayTR sanal POS / iframe ödeme altyapısı',
    fields: [
      { key: 'merchant_id', label: 'Mağaza No (Merchant ID)' },
      { key: 'merchant_key', label: 'Mağaza Anahtarı (Merchant Key)', type: 'password' },
      { key: 'merchant_salt', label: 'Mağaza Gizli Anahtarı (Merchant Salt)', type: 'password' },
    ],
  },
  {
    provider: 'iyzico',
    label: 'iyzico',
    category: 'PAYMENT',
    description: 'iyzico ödeme altyapısı',
    fields: [
      { key: 'api_key', label: 'API Key' },
      { key: 'secret_key', label: 'Secret Key', type: 'password' },
    ],
  },
];

export const CARGO_PROVIDERS: ProviderDef[] = [
  {
    provider: 'yurtici',
    label: 'Yurtiçi Kargo',
    category: 'CARGO',
    fields: [
      { key: 'ws_username', label: 'Web Servis Kullanıcı Adı' },
      { key: 'ws_password', label: 'Web Servis Şifre', type: 'password' },
      { key: 'customer_code', label: 'Müşteri Kodu', optional: true },
    ],
  },
  {
    provider: 'aras',
    label: 'Aras Kargo',
    category: 'CARGO',
    fields: [
      { key: 'username', label: 'Kullanıcı Adı' },
      { key: 'password', label: 'Şifre', type: 'password' },
      { key: 'customer_code', label: 'Müşteri Kodu', optional: true },
    ],
  },
  {
    provider: 'surat',
    label: 'Sürat Kargo',
    category: 'CARGO',
    fields: [
      { key: 'username', label: 'Kullanıcı Adı' },
      { key: 'password', label: 'Şifre', type: 'password' },
      { key: 'customer_code', label: 'Müşteri Kodu', optional: true },
    ],
  },
  {
    provider: 'dhl',
    label: 'DHL',
    category: 'CARGO',
    fields: [
      { key: 'api_key', label: 'API Key' },
      { key: 'api_secret', label: 'API Secret', type: 'password' },
      { key: 'account_number', label: 'Hesap Numarası', optional: true },
    ],
  },
];

export const BANKING_PROVIDERS: ProviderDef[] = [
  {
    provider: 'isbank',
    label: 'İş Bankası (Hesap Hareketleri)',
    category: 'BANKING',
    description: 'İş Bankası Account Info API ile hesap ve hesap hareketleri çekme (mTLS gerekli)',
    fields: [
      { key: 'env', label: 'Ortam (uat / prod)' },
      { key: 'client_id', label: 'Client ID (API Portal uygulaması)' },
      { key: 'client_secret', label: 'Client Secret', type: 'password' },
      { key: 'service_account_id', label: 'Service Account ID (Ticari İnternet Bankacılığı)' },
      { key: 'service_account_secret', label: 'Service Account Secret', type: 'password' },
      { key: 'scope', label: 'Scope (varsayılan: read:accounts)', optional: true },
      { key: 'pfx_base64', label: 'İstemci Sertifikası (.p12 base64)', type: 'password' },
      { key: 'pfx_passphrase', label: 'Sertifika Şifresi', type: 'password' },
      { key: 'client_cert_pem', label: 'İstemci Sertifika İçeriği (PEM, X-Client-Certificate)', type: 'password', optional: true },
    ],
  },
];

export const ALL_PROVIDERS = [...PAYMENT_PROVIDERS, ...CARGO_PROVIDERS, ...AI_PROVIDERS, ...BANKING_PROVIDERS, ...SMS_PROVIDERS];

export function findProvider(provider: string): ProviderDef | undefined {
  return ALL_PROVIDERS.find((p) => p.provider === provider);
}

// Gizli alanları maskele (frontend'e gönderirken)
export function maskConfig(provider: string, config: any): any {
  const def = findProvider(provider);
  if (!def || !config) return config;
  const out: any = { ...config };
  for (const f of def.fields) {
    if (f.type === 'password' && out[f.key]) out[f.key] = '••••••••';
  }
  return out;
}
