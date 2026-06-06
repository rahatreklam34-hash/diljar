import { prisma } from '../../lib/prisma';

const todayParts = () => {
  const d = new Date();
  return { tarih: d.toISOString().split('T')[0], saat: d.toTimeString().slice(0, 5) };
};

// tx içinde sistem logu ekle
async function addLog(tx: any, tenantId: string, modul: string, islem: string, detay: string) {
  const { tarih, saat } = todayParts();
  await tx.sistemLog.create({ data: { tenantId, tarih, saat, modul, islem, detay } });
}

function isPositiveEffect(tip: string): boolean {
  // Cari bakiye: alis_fatura | tahsilat | iade_al => +tutar ; satis_fatura | odeme | iade_ver => -tutar
  return tip === 'alis_fatura' || tip === 'tahsilat' || tip === 'iade_al';
}

// ───────── Tüm tenant verisini tek seferde döndür (bootstrap) ─────────
export async function getBootstrap(tenantId: string) {
  const [
    cariHesaplar, cariHareketler, hareketler, kasaBanka, krediKartlari,
    birikimHesaplari, cekler, personeller, personelHareketler,
    duzenliOdemeler, emanetParalar, hedefler, sistemLoglari,
  ] = await Promise.all([
    prisma.cariHesap.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.cariHareket.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    prisma.hareket.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    prisma.kasaBanka.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.krediKarti.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.birikimHesabi.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.cek.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.personel.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.personelHareket.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    prisma.duzenliOdeme.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.emanetPara.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.hedef.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.sistemLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 500 }),
  ]);
  return {
    cariHesaplar, cariHareketler, hareketler, kasaBanka, krediKartlari,
    birikimHesaplari, cekler, personeller, personelHareketler,
    duzenliOdemeler, emanetParalar, hedefler, sistemLoglari,
  };
}

// ───────── Cari Hareket (bakiye etkili) ─────────
export async function addCariHareket(tenantId: string, createdBy: string, data: any) {
  return prisma.$transaction(async (tx) => {
    const h = await tx.cariHareket.create({
      data: {
        tenantId, createdBy,
        cariHesapId: data.cariHesapId,
        tarih: data.tarih, saat: data.saat, aciklama: data.aciklama,
        tutar: data.tutar, tip: data.tip, cekId: data.cekId || null,
      },
    });
    const delta = isPositiveEffect(data.tip) ? data.tutar : -data.tutar;
    await tx.cariHesap.updateMany({
      where: { id: data.cariHesapId, tenantId },
      data: { bakiye: { increment: delta }, sonHareketTarihi: `${data.tarih} ${data.saat}` },
    });
    await addLog(tx, tenantId, 'Cari Hareket', 'Ekleme', `${data.aciklama} - ${data.tutar} TL`);
    return h;
  });
}

export async function updateCariHareket(tenantId: string, id: string, data: any) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.cariHareket.findFirst({ where: { id, tenantId } });
    if (!old) throw Object.assign(new Error('Kayıt bulunamadı'), { status: 404 });
    // eski etkiyi geri al
    const oldDelta = isPositiveEffect(old.tip) ? old.tutar : -old.tutar;
    const newTip = data.tip ?? old.tip;
    const newTutar = data.tutar ?? old.tutar;
    const newDelta = isPositiveEffect(newTip) ? newTutar : -newTutar;
    const diff = newDelta - oldDelta;
    const updated = await tx.cariHareket.update({ where: { id }, data });
    if (diff !== 0) {
      await tx.cariHesap.updateMany({ where: { id: old.cariHesapId, tenantId }, data: { bakiye: { increment: diff } } });
    }
    return updated;
  });
}

export async function deleteCariHareket(tenantId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.cariHareket.findFirst({ where: { id, tenantId } });
    if (!old) return { ok: true };
    const delta = isPositiveEffect(old.tip) ? old.tutar : -old.tutar;
    await tx.cariHesap.updateMany({ where: { id: old.cariHesapId, tenantId }, data: { bakiye: { increment: -delta } } });
    await tx.cariHareket.delete({ where: { id } });
    await addLog(tx, tenantId, 'Cari Hareket', 'Silme', `${old.aciklama} silindi`);
    return { ok: true };
  });
}

// ───────── Çek (cari + kasa zinciri) ─────────
export async function addCek(tenantId: string, createdBy: string, cek: any) {
  return prisma.$transaction(async (tx) => {
    const newCek = await tx.cek.create({
      data: {
        tenantId, createdBy,
        kisiAd: cek.kisiAd, kesideci: cek.kesideci || null, tutar: cek.tutar,
        vadeTarihi: cek.vadeTarihi, durum: cek.durum, tip: cek.tip,
        aciklama: cek.aciklama || null, cariHesapId: cek.cariHesapId || null,
      },
    });
    if (cek.cariHesapId) {
      // alacak -> tahsilat (+), borc -> odeme (-)
      const tip = cek.tip === 'alacak' ? 'tahsilat' : 'odeme';
      const aciklama = cek.tip === 'alacak' ? `Cek Tahsilati - ${cek.kisiAd}` : `Cek Odemesi - ${cek.kisiAd}`;
      const { tarih, saat } = todayParts();
      await tx.cariHareket.create({
        data: { tenantId, createdBy, cariHesapId: cek.cariHesapId, tarih, saat, aciklama, tutar: cek.tutar, tip, cekId: newCek.id },
      });
      const delta = tip === 'tahsilat' ? cek.tutar : -cek.tutar;
      await tx.cariHesap.updateMany({ where: { id: cek.cariHesapId, tenantId }, data: { bakiye: { increment: delta }, sonHareketTarihi: `${tarih} ${saat}` } });
    }
    await addLog(tx, tenantId, 'Cekler', 'Ekleme', `${cek.kisiAd} - ${cek.tutar} TL`);
    return newCek;
  });
}

export async function updateCek(tenantId: string, id: string, patch: any) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.cek.findFirst({ where: { id, tenantId } });
    if (!old) throw Object.assign(new Error('Çek bulunamadı'), { status: 404 });
    const updated = await tx.cek.update({ where: { id }, data: patch });

    if (patch.durum && patch.durum !== old.durum) {
      const wasOpen = old.durum === 'bekleyen';
      const nowSettled = patch.durum === 'tahsil_edilen' || patch.durum === 'geciken';
      if (wasOpen && nowSettled) {
        const { tarih, saat } = todayParts();
        // ilk kasa hesabını seç
        const kasalar = await tx.kasaBanka.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
        const target = kasalar.find((k) => k.tip === 'kasa') || kasalar[0];
        if (old.tip === 'alacak') {
          if (target) await tx.kasaBanka.update({ where: { id: target.id }, data: { bakiye: { increment: old.tutar } } });
          await tx.hareket.create({ data: { tenantId, tarih, saat, aciklama: `Cek Tahsilati - ${old.kisiAd}`, tutar: old.tutar, tip: 'gelir', kategori: 'Cek Tahsilati' } });
        } else {
          if (target) await tx.kasaBanka.update({ where: { id: target.id }, data: { bakiye: { increment: -old.tutar } } });
          await tx.hareket.create({ data: { tenantId, tarih, saat, aciklama: `Cek Odemesi - ${old.kisiAd}`, tutar: old.tutar, tip: 'gider', kategori: 'Cek Odemesi' } });
        }
      }
    }
    return updated;
  });
}

export async function deleteCek(tenantId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const cek = await tx.cek.findFirst({ where: { id, tenantId } });
    if (!cek) return { ok: true };
    if (cek.cariHesapId) {
      const linked = await tx.cariHareket.findMany({ where: { cekId: id, tenantId } });
      if (linked.length) {
        let totalDelta = 0;
        for (const h of linked) {
          totalDelta += isPositiveEffect(h.tip) ? h.tutar : -h.tutar;
        }
        await tx.cariHesap.updateMany({ where: { id: cek.cariHesapId, tenantId }, data: { bakiye: { increment: -totalDelta } } });
        await tx.cariHareket.deleteMany({ where: { cekId: id, tenantId } });
      }
    }
    await tx.cek.delete({ where: { id } });
    await addLog(tx, tenantId, 'Cekler', 'Silme', `${cek.kisiAd} cek silindi`);
    return { ok: true };
  });
}

// ───────── Gelir/Gider ─────────
export async function addHareket(tenantId: string, createdBy: string, data: any) {
  return prisma.$transaction(async (tx) => {
    const h = await tx.hareket.create({
      data: {
        tenantId, createdBy,
        tarih: data.tarih, saat: data.saat, aciklama: data.aciklama,
        tutar: data.tutar, tip: data.tip, kategori: data.kategori,
        cariHesapId: data.cariHesapId || null, kasaBankaId: data.kasaBankaId || null,
      },
    });
    // kaynak (kasa/banka) belirtilmişse bakiye etkile: gelir +, gider -
    if (data.kasaBankaId) {
      const delta = data.tip === 'gelir' ? data.tutar : -data.tutar;
      await tx.kasaBanka.updateMany({ where: { id: data.kasaBankaId, tenantId }, data: { bakiye: { increment: delta } } });
    }
    await addLog(tx, tenantId, 'Gelir/Gider', 'Ekleme', `${data.aciklama} - ${data.tutar} TL`);
    return h;
  });
}

export async function deleteHareket(tenantId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.hareket.findFirst({ where: { id, tenantId } });
    if (!old) return { ok: true };
    if (old.kasaBankaId) {
      const delta = old.tip === 'gelir' ? old.tutar : -old.tutar;
      await tx.kasaBanka.updateMany({ where: { id: old.kasaBankaId, tenantId }, data: { bakiye: { increment: -delta } } });
    }
    await tx.hareket.delete({ where: { id } });
    return { ok: true };
  });
}

// ───────── Kredi Kartı özel işlemler ─────────
export async function krediKartiOdeme(tenantId: string, kartId: string, kaynakId: string, tutar: number) {
  if (tutar <= 0) throw Object.assign(new Error('Geçersiz tutar'), { status: 400 });
  return prisma.$transaction(async (tx) => {
    const kart = await tx.krediKarti.findFirst({ where: { id: kartId, tenantId } });
    const kaynak = await tx.kasaBanka.findFirst({ where: { id: kaynakId, tenantId } });
    if (!kart || !kaynak) throw Object.assign(new Error('Kart veya kaynak bulunamadı'), { status: 404 });
    const yeniBorc = Math.max(0, kart.borc - tutar);
    await tx.krediKarti.update({ where: { id: kartId }, data: { borc: yeniBorc } });
    await tx.kasaBanka.update({ where: { id: kaynakId }, data: { bakiye: { increment: -tutar } } });
    const { tarih, saat } = todayParts();
    await tx.hareket.create({ data: { tenantId, tarih, saat, aciklama: `Kredi Karti Odemesi - ${kart.ad} (${kaynak.ad})`, tutar, tip: 'gider', kategori: 'Kredi Karti Odemesi', kasaBankaId: kaynakId } });
    return { ok: true };
  });
}

export async function krediKartindanHarcama(tenantId: string, kartId: string, tutar: number, aciklama: string, kategori: string) {
  if (tutar <= 0) throw Object.assign(new Error('Geçersiz tutar'), { status: 400 });
  return prisma.$transaction(async (tx) => {
    const kart = await tx.krediKarti.findFirst({ where: { id: kartId, tenantId } });
    if (!kart) throw Object.assign(new Error('Kart bulunamadı'), { status: 404 });
    await tx.krediKarti.update({ where: { id: kartId }, data: { borc: { increment: tutar } } });
    const { tarih, saat } = todayParts();
    await tx.hareket.create({ data: { tenantId, tarih, saat, aciklama: `${aciklama} (${kart.ad})`, tutar, tip: 'gider', kategori } });
    return { ok: true };
  });
}
