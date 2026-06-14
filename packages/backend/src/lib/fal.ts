import { env } from '../config/env';
import { ApiError } from './http';

// Seedream 4.5 (ByteDance) görsel düzenleme — fal.ai üzerinden.
// Ürün fotoğrafını profesyonel stüdyo çekimine dönüştürür.
const FAL_MODEL = 'fal-ai/bytedance/seedream/v4.5/edit';

const DEFAULT_PROMPT =
  'Transform this into a professional e-commerce product photograph. ' +
  'Keep the exact same product, colors, shape, fabric, pattern and details unchanged. ' +
  'Place it on a clean seamless studio background, add soft diffused professional lighting, ' +
  'remove noise and harsh shadows, sharp focus, high detail, catalog quality, realistic.';

export interface EnhanceResult {
  image: string; // data URI (base64) veya https url
}

// dataUri (base64) bir ürün görselini fal.ai Seedream 4.5 ile profesyonelleştirir.
export async function enhanceProductImage(dataUri: string, prompt?: string): Promise<EnhanceResult> {
  if (!env.FAL_KEY) {
    throw new ApiError(503, 'Görsel iyileştirme için FAL_KEY tanımlı değil. Sunucu .env dosyasına FAL_KEY ekleyin.');
  }
  if (!dataUri || typeof dataUri !== 'string') {
    throw new ApiError(422, 'Geçersiz görsel');
  }

  let resp: Response;
  try {
    resp = await fetch(`https://fal.run/${FAL_MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt || DEFAULT_PROMPT,
        image_urls: [dataUri],
        image_size: 'auto_2K', // v4.5 'auto' kabul etmiyor; auto_2K en/boy oranını korur
        num_images: 1,
        sync_mode: true, // sonucu data URI olarak döndür (CORS / ekstra indirme gerekmez)
        enable_safety_checker: true,
      }),
    });
  } catch (e: any) {
    throw new ApiError(502, 'Görsel servisine ulaşılamadı: ' + (e?.message || 'ağ hatası'));
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) throw new ApiError(502, 'FAL_KEY geçersiz veya yetkisiz.');
    throw new ApiError(502, `Görsel servisi hatası (${resp.status}): ${txt.slice(0, 200)}`);
  }

  const data: any = await resp.json().catch(() => null);
  const url = data?.images?.[0]?.url;
  if (!url || typeof url !== 'string') {
    throw new ApiError(502, 'Görsel servisi sonuç döndürmedi.');
  }
  return { image: url };
}
