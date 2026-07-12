import { env } from '../config/env';
import { ApiError } from './http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

let sharp: any;
try { sharp = require('sharp'); } catch { sharp = null; }

const FAL_MODEL = 'fal-ai/bytedance/seedream/v4.5/edit';

const DEFAULT_PROMPT =
  'Transform this into a professional e-commerce product photograph. ' +
  'Keep the exact same product, colors, shape, fabric, pattern and details unchanged. ' +
  'Place it on a clean seamless studio background, add soft diffused professional lighting, ' +
  'remove noise and harsh shadows, sharp focus, high detail, catalog quality, realistic.';

const IMG_DIR = '/var/www/finanstakip/product-images';
const IMG_BASE_URL = 'https://diljar.com/product-images';
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
const WEBP_QUALITY = 80;

export interface EnhanceResult {
  image: string;     // Birincil görsel (geri uyum) = images[0]
  images: string[];  // Tüm üretilen varyantlar
}

// Görseli optimize et: WebP formatına çevir, max boyut sınırla
async function optimizeImage(input: Buffer): Promise<Buffer> {
  if (!sharp) return input; // sharp yoksa orijinali döndür
  return sharp(input)
    .resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

// Buffer'ı dosyaya yaz, URL döndür
function saveToFile(buf: Buffer, ext: string = 'webp'): string {
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 12);
  const filename = 'enh_' + Date.now().toString(36) + '_' + hash + '.' + ext;
  fs.writeFileSync(path.join(IMG_DIR, filename), buf);
  return IMG_BASE_URL + '/' + filename;
}

// Sonuç URL'sini indir, optimize et, kaydet; başarısızsa orijinal URL'yi döndür
async function downloadAndStore(resultUrl: string): Promise<string> {
  try {
    const imgResp = await fetch(resultUrl);
    if (!imgResp.ok) throw new Error('download failed');
    const arrayBuf = await imgResp.arrayBuffer();
    const rawBuf = Buffer.from(arrayBuf);
    const optimized = await optimizeImage(rawBuf);
    return saveToFile(optimized, 'webp');
  } catch (e: any) {
    console.error('Image optimize failed, using original URL:', e?.message);
    return resultUrl;
  }
}

export async function enhanceProductImage(
  imageUrlOrData: string,
  prompt?: string,
  referenceImage?: string,
  count: number = 1,
): Promise<EnhanceResult> {
  if (!env.FAL_KEY) {
    throw new ApiError(503, 'Görsel iyileştirme için FAL_KEY tanımlı değil.');
  }
  if (!imageUrlOrData || typeof imageUrlOrData !== 'string') {
    throw new ApiError(422, 'Geçersiz görsel');
  }

  const numImages = Math.max(1, Math.min(Number(count) || 1, 4));
  const imageUrls = [imageUrlOrData];
  let finalPrompt = prompt || DEFAULT_PROMPT;

  if (referenceImage && typeof referenceImage === 'string') {
    imageUrls.push(referenceImage);
    finalPrompt += ' Use the second image as a style/aesthetic reference for lighting, background and overall feel.';
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
        prompt: finalPrompt,
        image_urls: imageUrls,
        image_size: 'square_hd',
        num_images: numImages,
        sync_mode: true,
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
  const resultUrls: string[] = Array.isArray(data?.images)
    ? data.images.map((im: any) => im?.url).filter((u: any) => u && typeof u === 'string')
    : [];
  if (resultUrls.length === 0) {
    throw new ApiError(502, 'Görsel servisi sonuç döndürmedi.');
  }

  // Tüm varyantları indir + optimize et + kaydet
  const stored = await Promise.all(resultUrls.map((u) => downloadAndStore(u)));
  return { image: stored[0], images: stored };
}
