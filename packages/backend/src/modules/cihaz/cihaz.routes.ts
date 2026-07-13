import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { asyncHandler, ApiError } from '../../lib/http';

// ───────── Etkileşim Ağı → Chrome eklentisi tabanlı cihaz (tarayıcı) komuta-kontrol ─────────
// İki router:
//   cihazPanelRoutes  → /api/v1/cihaz        (panel; authenticate + attachTenant arkasında)
//   cihazAgentRoutes  → /api/v1/cihaz-agent  (eklenti; PUBLIC, device JWT ile)

const ONLINE_WINDOW_MS = 25_000; // sonGoruldu bu süre içindeyse çevrimiçi say
const isOnline = (sonGoruldu: Date | null | undefined) =>
  !!sonGoruldu && Date.now() - new Date(sonGoruldu).getTime() < ONLINE_WINDOW_MS;

// Kısa, okunur aktivasyon kodu (ör. DJ-7F3K-9A2Q)
function genAktivasyonKodu(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // karışabilenler (0/O, 1/I) hariç
  const blok = () => Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  return `DJ-${blok()}-${blok()}`;
}

const deviceToken = (cihazId: string, tenantId: string) =>
  jwt.sign({ cihazId, tenantId, type: 'device' }, env.JWT_SECRET, { expiresIn: '365d' } as any);

function verifyDevice(req: Request): { cihazId: string; tenantId: string } {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok) throw new ApiError(401, 'Cihaz token gerekli');
  try {
    const p: any = jwt.verify(tok, env.JWT_SECRET);
    if (p.type !== 'device' || !p.cihazId || !p.tenantId) throw new Error('bad');
    return { cihazId: p.cihazId, tenantId: p.tenantId };
  } catch {
    throw new ApiError(401, 'Geçersiz cihaz token');
  }
}

// Bir görevin genel durumunu, cihaz sonuçlarına göre yeniden hesapla
async function recomputeGorevDurum(gorevId: string) {
  const sonuclar = await prisma.cihazGorevSonuc.findMany({ where: { gorevId } });
  if (!sonuclar.length) return;
  const durumlar = sonuclar.map((s) => s.durum);
  const hepsiBitti = durumlar.every((d) => d === 'basarili' || d === 'basarisiz');
  const herhangiBasarisiz = durumlar.some((d) => d === 'basarisiz');
  const herhangiBasarili = durumlar.some((d) => d === 'basarili');
  const calisan = durumlar.some((d) => d === 'calisiyor');
  let durum = 'beklemede';
  if (hepsiBitti) durum = herhangiBasarisiz ? (herhangiBasarili ? 'kismi' : 'basarisiz') : 'basarili';
  else if (calisan || herhangiBasarili || herhangiBasarisiz) durum = 'calisiyor';
  await prisma.cihazGorev.update({ where: { id: gorevId }, data: { durum } });
}

// ═════════════════════════ PANEL ROUTER ═════════════════════════
const panel = Router();

// Cihaz listesi + özet sayaçlar
panel.get('/', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const [cihazlar, gruplar] = await Promise.all([
    prisma.cihaz.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' } }),
    prisma.cihazGrup.findMany({ where: { tenantId: t }, orderBy: { ad: 'asc' } }),
  ]);
  const items = cihazlar.map((c) => ({ ...c, cevrimici: isOnline(c.sonGoruldu) }));
  const online = items.filter((c) => c.cevrimici).length;
  const [bekleyenGorev, basarisizGorev] = await Promise.all([
    prisma.cihazGorevSonuc.count({ where: { tenantId: t, durum: { in: ['beklemede', 'calisiyor'] } } }),
    prisma.cihazGorevSonuc.count({ where: { tenantId: t, durum: 'basarisiz' } }),
  ]);
  res.json({
    cihazlar: items,
    gruplar,
    ozet: {
      toplam: items.length,
      cevrimici: online,
      cevrimdisi: items.length - online,
      aktifGrup: gruplar.length,
      bekleyenGorev,
      basarisizGorev,
    },
  });
}));

// Cihaz oluştur → aktivasyon kodu üret
panel.post('/', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const ad = String(req.body?.ad || '').trim();
  if (!ad) throw new ApiError(400, 'Cihaz adı gerekli');
  let kod = genAktivasyonKodu();
  // benzersizlik garanti
  for (let i = 0; i < 5; i++) {
    const v = await prisma.cihaz.findUnique({ where: { aktivasyonKodu: kod } });
    if (!v) break;
    kod = genAktivasyonKodu();
  }
  const created = await prisma.cihaz.create({
    data: {
      tenantId: t,
      ad,
      aktivasyonKodu: kod,
      grupId: req.body?.grupId || null,
      etiketler: req.body?.etiketler || null,
      notlar: req.body?.notlar || null,
    },
  });
  res.status(201).json(created);
}));

// Cihaz güncelle
panel.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const found = await prisma.cihaz.findFirst({ where: { id: req.params.id, tenantId: t } });
  if (!found) throw new ApiError(404, 'Cihaz bulunamadı');
  const data: any = {};
  for (const k of ['ad', 'grupId', 'etiketler', 'durum', 'notlar']) {
    if (k in req.body) data[k] = req.body[k];
  }
  res.json(await prisma.cihaz.update({ where: { id: req.params.id }, data }));
}));

// Cihaz sil
panel.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const found = await prisma.cihaz.findFirst({ where: { id: req.params.id, tenantId: t } });
  if (!found) throw new ApiError(404, 'Cihaz bulunamadı');
  await prisma.cihaz.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// Aktivasyon kodunu yenile (cihaz bağlantısını sıfırlar)
panel.post('/:id/aktivasyon-yenile', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const found = await prisma.cihaz.findFirst({ where: { id: req.params.id, tenantId: t } });
  if (!found) throw new ApiError(404, 'Cihaz bulunamadı');
  const kod = genAktivasyonKodu();
  const upd = await prisma.cihaz.update({
    where: { id: req.params.id },
    data: { aktivasyonKodu: kod, baglandi: false, cevrimici: false, sonGoruldu: null },
  });
  res.json(upd);
}));

// Toplu işlem: grup taşı / etiket ekle-çıkar / durum / sil
panel.post('/bulk', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const islem = String(req.body?.islem || '');
  const deger = req.body?.deger;
  if (!ids.length) throw new ApiError(400, 'Cihaz seçilmedi');
  const rows = await prisma.cihaz.findMany({ where: { id: { in: ids }, tenantId: t } });
  const validIds = rows.map((r) => r.id);
  if (!validIds.length) throw new ApiError(404, 'Cihaz bulunamadı');
  let sonuc = 0;
  if (islem === 'grup') {
    const r = await prisma.cihaz.updateMany({ where: { id: { in: validIds }, tenantId: t }, data: { grupId: deger?.grupId ?? null } });
    sonuc = r.count;
  } else if (islem === 'durum') {
    const r = await prisma.cihaz.updateMany({ where: { id: { in: validIds }, tenantId: t }, data: { durum: String(deger?.durum || 'aktif') } });
    sonuc = r.count;
  } else if (islem === 'sil') {
    const r = await prisma.cihaz.deleteMany({ where: { id: { in: validIds }, tenantId: t } });
    sonuc = r.count;
  } else if (islem === 'etiket-ekle' || islem === 'etiket-cikar') {
    const yeni = String(deger?.etiket || '').trim();
    if (!yeni) throw new ApiError(400, 'Etiket gerekli');
    for (const c of rows) {
      const set = new Set(String(c.etiketler || '').split(',').map((x) => x.trim()).filter(Boolean));
      if (islem === 'etiket-ekle') set.add(yeni); else set.delete(yeni);
      await prisma.cihaz.update({ where: { id: c.id }, data: { etiketler: Array.from(set).join(',') } });
      sonuc++;
    }
  } else {
    throw new ApiError(400, 'Geçersiz işlem');
  }
  res.json({ ok: true, sonuc });
}));

// ── Gruplar CRUD ──
panel.post('/gruplar', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const ad = String(req.body?.ad || '').trim();
  if (!ad) throw new ApiError(400, 'Grup adı gerekli');
  const created = await prisma.cihazGrup.create({ data: { tenantId: t, ad, aciklama: req.body?.aciklama || null } });
  res.status(201).json(created);
}));
panel.patch('/gruplar/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const found = await prisma.cihazGrup.findFirst({ where: { id: req.params.id, tenantId: t } });
  if (!found) throw new ApiError(404, 'Grup bulunamadı');
  const data: any = {};
  if ('ad' in req.body) data.ad = String(req.body.ad || '').trim();
  if ('aciklama' in req.body) data.aciklama = req.body.aciklama || null;
  res.json(await prisma.cihazGrup.update({ where: { id: req.params.id }, data }));
}));
panel.delete('/gruplar/:id', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const found = await prisma.cihazGrup.findFirst({ where: { id: req.params.id, tenantId: t } });
  if (!found) throw new ApiError(404, 'Grup bulunamadı');
  await prisma.cihaz.updateMany({ where: { tenantId: t, grupId: req.params.id }, data: { grupId: null } });
  await prisma.cihazGrup.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ── Görev oluştur + hedeflere dağıt ──
panel.post('/gorev', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const hedefTip = String(req.body?.hedefTip || 'cihaz'); // cihaz | grup | tumu
  const hedefId = req.body?.hedefId || null; // grup id
  const cihazIds: string[] = Array.isArray(req.body?.cihazIds) ? req.body.cihazIds : [];
  const adimlar = Array.isArray(req.body?.adimlar) ? req.body.adimlar : [];
  const baslik = req.body?.baslik ? String(req.body.baslik) : null;
  if (!adimlar.length) throw new ApiError(400, 'En az bir adım gerekli');

  // Adım doğrulama
  for (const a of adimlar) {
    if (!a || typeof a !== 'object') throw new ApiError(400, 'Geçersiz adım');
    if (!['ac', 'yaz', 'tikla'].includes(a.tip)) throw new ApiError(400, `Geçersiz adım tipi: ${a.tip}`);
    if (a.tip === 'ac' && !a.url) throw new ApiError(400, 'Sayfa Aç adımında URL gerekli');
    if (a.tip === 'yaz' && (!a.selector || a.deger == null)) throw new ApiError(400, 'Metin Yaz adımında selector ve değer gerekli');
    if (a.tip === 'tikla' && !a.selector) throw new ApiError(400, 'Tıkla adımında selector gerekli');
  }

  // Hedef cihazları belirle
  let hedefCihazlar: { id: string }[] = [];
  if (hedefTip === 'tumu') {
    hedefCihazlar = await prisma.cihaz.findMany({ where: { tenantId: t, durum: 'aktif' }, select: { id: true } });
  } else if (hedefTip === 'grup') {
    if (!hedefId) throw new ApiError(400, 'Grup seçilmedi');
    hedefCihazlar = await prisma.cihaz.findMany({ where: { tenantId: t, grupId: hedefId }, select: { id: true } });
  } else {
    if (!cihazIds.length) throw new ApiError(400, 'Cihaz seçilmedi');
    hedefCihazlar = await prisma.cihaz.findMany({ where: { tenantId: t, id: { in: cihazIds } }, select: { id: true } });
  }
  if (!hedefCihazlar.length) throw new ApiError(404, 'Hedef cihaz bulunamadı');

  const gorev = await prisma.$transaction(async (tx) => {
    const g = await tx.cihazGorev.create({
      data: {
        tenantId: t, baslik, hedefTip, hedefId,
        adimlar, durum: 'beklemede',
        olusturan: (req as any).user?.fullName || (req as any).user?.email || null,
      },
    });
    await tx.cihazGorevSonuc.createMany({
      data: hedefCihazlar.map((c) => ({ tenantId: t, gorevId: g.id, cihazId: c.id, durum: 'beklemede' })),
    });
    return g;
  });
  res.status(201).json({ ok: true, gorevId: gorev.id, hedef: hedefCihazlar.length });
}));

// ── Görev listesi (canlı takip / loglar) ──
panel.get('/gorevler', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const gorevler = await prisma.cihazGorev.findMany({
    where: { tenantId: t },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { sonuclar: true },
  });
  const cihazlar = await prisma.cihaz.findMany({ where: { tenantId: t }, select: { id: true, ad: true } });
  const adMap = new Map(cihazlar.map((c) => [c.id, c.ad]));
  const out = gorevler.map((g) => ({
    id: g.id,
    baslik: g.baslik,
    hedefTip: g.hedefTip,
    durum: g.durum,
    adimlar: g.adimlar,
    olusturan: g.olusturan,
    createdAt: g.createdAt,
    sonuclar: g.sonuclar.map((s) => ({
      id: s.id, cihazId: s.cihazId, cihazAd: adMap.get(s.cihazId) || '(silinmiş cihaz)',
      durum: s.durum, mesaj: s.mesaj, tamamlandiAt: s.tamamlandiAt,
    })),
  }));
  res.json({ gorevler: out });
}));

// ═════════════════════════ AGENT ROUTER (PUBLIC) ═════════════════════════
const agent = Router();

// Aktivasyon: kod → device token
agent.post('/activate', asyncHandler(async (req: Request, res: Response) => {
  const kod = String(req.body?.aktivasyonKodu || '').trim().toUpperCase();
  const tarayiciBilgi = req.body?.tarayiciBilgi ? String(req.body.tarayiciBilgi).slice(0, 300) : null;
  if (!kod) throw new ApiError(400, 'Aktivasyon kodu gerekli');
  const cihaz = await prisma.cihaz.findUnique({ where: { aktivasyonKodu: kod } });
  if (!cihaz) throw new ApiError(404, 'Geçersiz aktivasyon kodu');
  await prisma.cihaz.update({
    where: { id: cihaz.id },
    data: { baglandi: true, tarayiciBilgi, cevrimici: true, sonGoruldu: new Date() },
  });
  res.json({ ok: true, token: deviceToken(cihaz.id, cihaz.tenantId), cihazId: cihaz.id, ad: cihaz.ad });
}));

// Poll: heartbeat + bekleyen görev adımlarını çek
agent.get('/poll', asyncHandler(async (req: Request, res: Response) => {
  const { cihazId, tenantId } = verifyDevice(req);
  const cihaz = await prisma.cihaz.findFirst({ where: { id: cihazId, tenantId } });
  if (!cihaz) throw new ApiError(404, 'Cihaz bulunamadı');
  await prisma.cihaz.update({ where: { id: cihazId }, data: { cevrimici: true, sonGoruldu: new Date() } });

  // bu cihazın bekleyen sonuç kayıtları → calisiyor'a çek ve adımlarını döndür
  const bekleyen = await prisma.cihazGorevSonuc.findMany({
    where: { cihazId, tenantId, durum: 'beklemede' },
    orderBy: { createdAt: 'asc' },
    take: 5,
  });
  const gorevIds = [...new Set(bekleyen.map((b) => b.gorevId))];
  const gorevler = gorevIds.length
    ? await prisma.cihazGorev.findMany({ where: { id: { in: gorevIds } } })
    : [];
  const gorevMap = new Map(gorevler.map((g) => [g.id, g]));

  const gorevlerOut = [];
  for (const b of bekleyen) {
    const g = gorevMap.get(b.gorevId);
    if (!g || g.durum === 'iptal') continue;
    await prisma.cihazGorevSonuc.update({ where: { id: b.id }, data: { durum: 'calisiyor', cekildiAt: new Date() } });
    gorevlerOut.push({ gorevSonucId: b.id, gorevId: g.id, baslik: g.baslik, adimlar: g.adimlar });
  }
  if (gorevlerOut.length) {
    for (const gid of gorevIds) await recomputeGorevDurum(gid);
  }
  res.json({ ok: true, gorevler: gorevlerOut });
}));

// Sonuç bildir
agent.post('/sonuc', asyncHandler(async (req: Request, res: Response) => {
  const { cihazId, tenantId } = verifyDevice(req);
  const gorevSonucId = String(req.body?.gorevSonucId || '');
  const durum = String(req.body?.durum || ''); // basarili | basarisiz
  const mesaj = req.body?.mesaj ? String(req.body.mesaj).slice(0, 1000) : null;
  const aktifSekmeUrl = req.body?.aktifSekmeUrl ? String(req.body.aktifSekmeUrl).slice(0, 500) : null;
  if (!['basarili', 'basarisiz', 'calisiyor'].includes(durum)) throw new ApiError(400, 'Geçersiz durum');
  const sonuc = await prisma.cihazGorevSonuc.findFirst({ where: { id: gorevSonucId, cihazId, tenantId } });
  if (!sonuc) throw new ApiError(404, 'Görev sonucu bulunamadı');
  await prisma.cihazGorevSonuc.update({
    where: { id: sonuc.id },
    data: { durum, mesaj, tamamlandiAt: durum === 'calisiyor' ? null : new Date() },
  });
  if (aktifSekmeUrl) await prisma.cihaz.update({ where: { id: cihazId }, data: { aktifSekmeUrl } });
  await recomputeGorevDurum(sonuc.gorevId);
  res.json({ ok: true });
}));

export const cihazPanelRoutes = panel;
export const cihazAgentRoutes = agent;
