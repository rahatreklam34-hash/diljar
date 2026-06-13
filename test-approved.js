const { prisma } = require('./dist/lib/prisma');
const { notifyOrderSms } = require('./dist/modules/sms/netgsm.service');
(async () => {
  try {
    const c = await prisma.customer.findFirst({ where: { ad: { contains: 'diljar', mode: 'insensitive' } }, select: { id: true, ad: true, instagram: true, telefon: true, tenantId: true } });
    if (!c) { console.log('NO_CUSTOMER'); process.exit(0); }
    console.log('CUSTOMER:', c.ad, '| ig:', c.instagram, '| tel:', c.telefon);
    const tnt = await prisma.tenant.findUnique({ where: { id: c.tenantId }, select: { name: true } });
    await notifyOrderSms(c.tenantId, 'approved', {
      phone: c.telefon, ad: c.ad, no: 'TEST-APV', tutar: 3885, firma: (tnt && tnt.name) || '',
      kullaniciadi: c.instagram || '', instagram: c.instagram || '', durum: 'Onaylandi',
      urun: 'Alexander McQeen', beden: '44', sepetLink: (process.env.APP_DOMAIN || '') + '/sepet/test'
    });
    console.log('notifyOrderSms(approved) CALLED - 2 sn bekleniyor...');
    await new Promise(r => setTimeout(r, 2500));
    console.log('DONE');
  } catch (e) { console.log('ERR', String(e.message || e)); }
  process.exit(0);
})();
