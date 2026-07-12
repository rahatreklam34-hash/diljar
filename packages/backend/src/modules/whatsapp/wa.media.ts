// WhatsApp medya disk depolama + public URL üretimi.
// Hem gelen medyayı (webhook indirip kaydeder) hem giden medyayı (panelden yüklenen) saklar.
// app.ts içinde `app.use('/wa-media', express.static(mediaDir()))` ile public servis edilir.
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';

const MEDIA_DIR = process.env.WA_MEDIA_DIR || path.resolve(process.cwd(), 'wa_media');

export function mediaDir(): string { return MEDIA_DIR; }

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/amr': 'amr',
  'application/pdf': 'pdf',
};
function extFor(mime: string): string {
  const clean = String(mime || '').split(';')[0].trim();
  return EXT_BY_MIME[clean] || (clean.split('/')[1] || 'bin');
}

export function publicUrl(file: string): string {
  const base = (env.APP_DOMAIN || '').replace(/\/$/, '');
  return `${base}/wa-media/${file}`;
}

export function saveMedia(buffer: Buffer, mime: string, origName?: string): { file: string; url: string; path: string } {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const safe = origName ? origName.replace(/[^\w.\-]+/g, '_').slice(-60) : '';
  const ext = extFor(mime);
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safe ? '_' + safe : ''}${safe && /\.[a-z0-9]+$/i.test(safe) ? '' : '.' + ext}`;
  const full = path.join(MEDIA_DIR, name);
  fs.writeFileSync(full, buffer);
  return { file: name, url: publicUrl(name), path: full };
}

export function mediaKindFromMime(mime: string): string {
  const c = String(mime || '').toLowerCase();
  if (c.startsWith('image/')) return 'image';
  if (c.startsWith('video/')) return 'video';
  if (c.startsWith('audio/')) return 'audio';
  return 'document';
}
