import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/http';
import {
  SepetwConfig, fetchAllProducts, mapProduct, testConnection, MappedRow,
  fetchAllCustomers, normalizePhone, normalizeUsername,
} from './import.sepetw';

const PROVIDER = 'sepetw';

function genBarcode(): string {
  return '20' + Date.now().toString().slice(-9) + Math.floor(Math.random() * 90 + 10).toString();
}

function mask(v?: string | null): string {
  if (!v) return '';
  const s = String(v);
  if (s.length <= 8) return '•'.repeat(s.length);
  return s.slice(0, 4) + '•'.repeat(Math.max(4, s.length - 8)) + s.slice(-4);
}

// ───── Ayarlar ─────

export async function getSettings(tenantId: string) {
  const row = await prisma.integrationSetting.findUnique({
    where: { scope_tenantId_provider: { scope: 'TENANT', tenantId, provider: PROVIDER } },
  }).catch(() => null);
  const cfg = (row?.config as any) || {};
  return {
    enabled: !!row?.enabled,
    baseUrl: cfg.baseUrl || 'https://sepetw.com',
    salesChannel: cfg.salesChannel || 'all',
    onlyInStock: !!cfg.onlyInStock,
    apiKey: mask(cfg.apiKey),
    apiSecret: mask(cfg.apiSecret),
    hasKey: !!cfg.apiKey,
    hasSecret: !!cfg.apiSecret,
  };
}

export async function saveSettings(tenantId: string, body: any) {
  const existing = await prisma.integrationSetting.findUnique({
    where: { scope_tenantId_provider: { scope: 'TENANT', tenantId, provider: PROVIDER } },
  }).catch(() => null);
  const prev = (existing?.config as any) || {};
  // Maskeli (•) gelen degerleri overwrite etme
  const incomingKey = typeof body.apiKey === 'string' && !body.apiKey.includes('•') ? body.apiKey.trim() : undefined;
  const incomingSecret = typeof body.apiSecret === 'string' && !body.apiSecret.includes('•') ? body.apiSecret.trim() : undefined;
  const config = {
    baseUrl: (body.baseUrl || prev.baseUrl || 'https://sepetw.com').trim(),
    salesChannel: body.salesChannel || prev.salesChannel || 'all',
    onlyInStock: body.onlyInStock !== undefined ? !!body.onlyInStock : !!prev.onlyInStock,
    apiKey: incomingKey !== undefined ? incomingKey : (prev.apiKey || ''),
    apiSecret: incomingSecret !== undefined ? incomingSecret : (prev.apiSecret || ''),
  };
  await prisma.integrationSetting.upsert({
    where: { scope_tenantId_provider: { scope: 'TENANT', tenantId, provider: PROVIDER } },
    update: { config, enabled: true, category: 'IMPORT' },
    create: { scope: 'TENANT', tenantId, provider: PROVIDER, category: 'IMPORT', enabled: true, config },
  });
  return getSettings(tenantId);
}

async function loadConfig(tenantId: string): Promise<SepetwConfig> {
  const row = await prisma.integrationSetting.findUnique({
    where: { scope_tenantId_provider: { scope: 'TENANT', tenantId, provider: PROVIDER } },
  }).catch(() => null);
  const cfg = (row?.config as any) || {};
  if (!cfg.apiKey || !cfg.apiSecret) throw new ApiError(400, 'Once API Key ve Secret kaydedin.');
  return {
    baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, apiSecret: cfg.apiSecret,
    salesChannel: cfg.salesChannel || 'all', onlyInStock: !!cfg.onlyInStock,
  };
}

export async function testSettings(tenantId: string) {
  const cfg = await loadConfig(tenantId);
  return testConnection(cfg);
}

// ───── Onizleme (DB YAZMA YOK) ─────

type RowStatus = 'new' | 'update' | 'warn';
interface PreviewRow extends MappedRow { status: RowStatus; }

export async function buildPreview(tenantId: string) {
  const cfg = await loadConfig(tenantId);
  const raw = await fetchAllProducts(cfg);
  const mapped: MappedRow[] = raw.map(mapProduct);

  // Mevcut urunleri satis koduna gore say
  const codes = Array.from(new Set(mapped.map((m) => m.matchKey).filter(Boolean)));
  const existing = codes.length
    ? await prisma.product.findMany({ where: { tenantId, salesCode: { in: codes } }, select: { salesCode: true } })
    : [];
  const existCount = new Map<string, number>();
  for (const e of existing) {
    if (!e.salesCode) continue;
    existCount.set(e.salesCode, (existCount.get(e.salesCode) || 0) + 1);
  }
  // Kaynak partisinde tekrar eden satis kodlari
  const batchCount = new Map<string, number>();
  for (const m of mapped) {
    if (m.matchKey) batchCount.set(m.matchKey, (batchCount.get(m.matchKey) || 0) + 1);
  }

  let cNew = 0, cUpd = 0, cWarn = 0;
  const rows: PreviewRow[] = mapped.map((m) => {
    let status: RowStatus;
    const warns: string[] = m.warn ? [m.warn] : [];
    if (!m.matchKey) {
      status = 'warn';
    } else if ((batchCount.get(m.matchKey) || 0) > 1) {
      status = 'warn'; warns.push('Kaynakta ayni satis kodu birden fazla');
    } else if ((existCount.get(m.matchKey) || 0) > 1) {
      status = 'warn'; warns.push('Bizde ayni satis koduyla birden fazla urun');
    } else if ((existCount.get(m.matchKey) || 0) === 1) {
      status = 'update';
    } else {
      status = 'new';
    }
    if (status === 'new') cNew++; else if (status === 'update') cUpd++; else cWarn++;
    return { ...m, status, warn: warns.length ? warns.join('; ') : undefined };
  });

  const counts = { new: cNew, update: cUpd, warn: cWarn };
  const job = await prisma.importJob.create({
    data: {
      tenantId, provider: PROVIDER, status: 'preview',
      salesChannel: cfg.salesChannel || 'all',
      totalItems: rows.length, counts, rows: rows as any,
    },
  });
  return { jobId: job.id, totalItems: rows.length, counts };
}

export async function getJobRows(tenantId: string, jobId: string, opts: { status?: string; q?: string; page?: number; pageSize?: number }) {
  const job = await prisma.importJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) throw new ApiError(404, 'Is bulunamadi');
  let rows: PreviewRow[] = (job.rows as any) || [];
  if (opts.status && opts.status !== 'all') rows = rows.filter((r) => r.status === opts.status);
  if (opts.q) {
    const q = opts.q.toLocaleLowerCase('tr-TR');
    rows = rows.filter((r) =>
      r.product.ad.toLocaleLowerCase('tr-TR').includes(q) ||
      (r.matchKey || '').toLocaleLowerCase('tr-TR').includes(q) ||
      (r.product.marka || '').toLocaleLowerCase('tr-TR').includes(q));
  }
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize || 50));
  const total = rows.length;
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  return { jobId, status: job.status, counts: job.counts, total, page, pageSize, rows: slice };
}

// ───── Onay + Ice aktar ─────

async function ensureCategory(tenantId: string, name: string, cache: Map<string, string>): Promise<string> {
  if (cache.has(name)) return cache.get(name)!;
  let cat = await prisma.productCategory.findFirst({ where: { tenantId, ad: name } });
  if (!cat) cat = await prisma.productCategory.create({ data: { tenantId, ad: name } });
  cache.set(name, cat.id);
  return cat.id;
}

export async function commit(tenantId: string, jobId: string, selectedKeys: string[]) {
  const job = await prisma.importJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) throw new ApiError(404, 'Is bulunamadi');
  const allRows: PreviewRow[] = (job.rows as any) || [];
  const sel = new Set(selectedKeys || []);
  const rows = allRows.filter((r) => sel.has(r.kaynakId));
  if (!rows.length) throw new ApiError(422, 'Hicbir satir secilmedi');

  const catCache = new Map<string, string>();
  let created = 0, updated = 0, skipped = 0;
  const failed: { kaynakId: string; ad: string; reason: string }[] = [];

  for (const row of rows) {
    try {
      const salesCode = row.product.salesCode;
      if (!salesCode) { skipped++; failed.push({ kaynakId: row.kaynakId, ad: row.product.ad, reason: 'Satis kodu yok' }); continue; }

      const matches = await prisma.product.findMany({ where: { tenantId, salesCode }, select: { id: true } });
      if (matches.length > 1) { skipped++; failed.push({ kaynakId: row.kaynakId, ad: row.product.ad, reason: 'Mukerrer eslesme — elle cozun' }); continue; }

      const kategoriId = row.categoryName ? await ensureCategory(tenantId, row.categoryName, catCache) : null;
      const data: any = {
        ad: row.product.ad,
        cinsiyet: row.product.cinsiyet,
        salesCode,
        barkod: row.product.barkod || genBarcode(),
        marka: row.product.marka,
        aciklama: row.product.aciklama,
        eskiFiyat: row.product.eskiFiyat,
        alisFiyat: row.product.alisFiyat,
        satisFiyat: row.product.satisFiyat,
        stokAdeti: row.product.stokAdeti,
        lokasyon: row.product.lokasyon || '',
        images: row.product.images,
        kategoriId,
        kaynak: PROVIDER,
        kaynakId: row.kaynakId,
      };

      await prisma.$transaction(async (tx) => {
        let productId: string;
        if (matches.length === 1) {
          const p = await tx.product.update({ where: { id: matches[0].id }, data });
          productId = p.id;
          await tx.productVariation.deleteMany({ where: { productId, tenantId } });
          updated++;
        } else {
          const p = await tx.product.create({ data: { ...data, tenantId } });
          productId = p.id;
          created++;
        }
        // Satis kodunu havuza ekle/isaretle: havuzda yoksa olustur, varsa secili (used) yap ve urune bagla
        await tx.salesCode.upsert({
          where: { tenantId_code: { tenantId, code: salesCode } },
          update: { used: true, productId },
          create: { tenantId, code: salesCode, used: true, productId },
        });
        for (const v of row.variations) {
          if (!v.deger) continue;
          await tx.productVariation.create({
            data: { tenantId, productId, ad: v.ad || 'Varyasyon', deger: v.deger, stok: v.stok || 0, ekFiyat: v.ekFiyat || 0, barkod: v.barkod || null },
          });
        }
      });
    } catch (e: any) {
      failed.push({ kaynakId: row.kaynakId, ad: row.product.ad, reason: e?.message || 'hata' });
    }
  }

  const result = { created, updated, skipped, failed };
  await prisma.importJob.update({ where: { id: jobId }, data: { status: 'committed', result } });
  return result;
}

// ───── Sadece STOK guncelle (diger alanlara DOKUNMAZ) ─────
// API'den guncel urunleri ceker; yalnizca eslesen (salesCode + kaynak=sepetw)
// urunlerin stokAdeti'ni ve mevcut varyasyonlarinin stok'unu gunceller.
// Ad, fiyat, gorsel, kategori, barkod vb. hicbir alana dokunmaz; varyasyon
// silme/olusturma yapmaz.
export async function refreshStock(tenantId: string) {
  const cfg = await loadConfig(tenantId);
  const raw = await fetchAllProducts(cfg);
  const mapped: MappedRow[] = raw.map(mapProduct);

  let updated = 0, notFound = 0, skipped = 0, varUpdated = 0;
  const failed: { salesCode: string; reason: string }[] = [];

  for (const m of mapped) {
    const salesCode = m.matchKey;
    if (!salesCode) { skipped++; continue; }
    try {
      const matches = await prisma.product.findMany({
        where: { tenantId, salesCode, kaynak: PROVIDER },
        select: { id: true },
      });
      if (matches.length === 0) { notFound++; continue; }
      if (matches.length > 1) { skipped++; failed.push({ salesCode, reason: 'Mukerrer eslesme — atlandi' }); continue; }
      const productId = matches[0].id;

      await prisma.$transaction(async (tx) => {
        // Sadece toplam stok adedi
        await tx.product.update({ where: { id: productId }, data: { stokAdeti: m.product.stokAdeti } });
        // Mevcut varyasyonlarin stogunu deger'e gore guncelle (silme/olusturma yok)
        const dbVars = await tx.productVariation.findMany({ where: { tenantId, productId }, select: { id: true, deger: true } });
        const byDeger = new Map(dbVars.map((v) => [String(v.deger), v.id]));
        for (const sv of m.variations) {
          if (!sv.deger) continue;
          const vid = byDeger.get(String(sv.deger));
          if (vid) { await tx.productVariation.update({ where: { id: vid }, data: { stok: sv.stok || 0 } }); varUpdated++; }
        }
      });
      updated++;
    } catch (e: any) {
      failed.push({ salesCode, reason: e?.message || 'hata' });
    }
  }

  return { fetched: mapped.length, updated, notFound, skipped, varUpdated, failed };
}

// ───── Musteri BAKIYE senkronu (sepetw → diljar Customer.bakiye) ─────
// sepetw /api/external/customers ucundan tum musterileri ceker; telefon (son 10
// hane) ve kullaniciadi (instagram) ile diljar musterilerini eslestirip, kaynakta
// bakiyesi olan (null/0 disinda) musterilerin bakiyesini Customer.bakiye'ye yazar.
// dryRun=true ise DB'ye yazmaz, yalnizca eslesme ozetini ve ornek listeyi doner.
export async function syncBalances(tenantId: string, opts?: { dryRun?: boolean }) {
  const cfg = await loadConfig(tenantId);
  const dryRun = !!opts?.dryRun;
  const remote = await fetchAllCustomers(cfg);

  // Kaynak musteriler: bakiyesi olanlar icin telefon + kullaniciadi index'i
  const byPhone = new Map<string, any>();
  const byUser = new Map<string, any>();
  let withBalance = 0;
  for (const rc of remote) {
    const bakiye = rc.bakiye == null ? null : Number(rc.bakiye);
    const hasBal = bakiye != null && Number.isFinite(bakiye) && bakiye !== 0;
    if (hasBal) withBalance++;
    const ph = normalizePhone(rc.telefon);
    const us = normalizeUsername(rc.kullaniciadi);
    if (ph && !byPhone.has(ph)) byPhone.set(ph, rc);
    if (us && !byUser.has(us)) byUser.set(us, rc);
  }

  const customers = await prisma.customer.findMany({
    where: { tenantId },
    select: { id: true, ad: true, telefon: true, instagram: true, bakiye: true },
  });

  let matched = 0, updated = 0, unchanged = 0, noBalance = 0, unmatched = 0;
  const sample: any[] = [];

  for (const c of customers) {
    const us = normalizeUsername(c.instagram);
    const ph = normalizePhone(c.telefon);
    const hit = (us && byUser.get(us)) || (ph && byPhone.get(ph)) || null;
    if (!hit) { unmatched++; continue; }
    matched++;
    const bakiye = hit.bakiye == null ? null : Number(hit.bakiye);
    if (bakiye == null || !Number.isFinite(bakiye) || bakiye === 0) { noBalance++; continue; }
    if (Math.abs((c.bakiye || 0) - bakiye) < 0.005) { unchanged++; continue; }
    if (sample.length < 50) sample.push({ ad: c.ad, telefon: c.telefon, instagram: c.instagram, eskiBakiye: c.bakiye || 0, yeniBakiye: bakiye });
    if (!dryRun) {
      await prisma.customer.update({ where: { id: c.id }, data: { bakiye } });
    }
    updated++;
  }

  return {
    dryRun,
    totalSepet: remote.length,
    withBalance,
    totalCustomers: customers.length,
    matched,
    updated,
    unchanged,
    noBalance,
    unmatched,
    sample,
  };
}
