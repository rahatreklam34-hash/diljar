const { prisma } = require('./dist/lib/prisma');
const { getNetgsmSettings } = require('./dist/modules/sms/netgsm.service');
(async () => {
  try {
    const t = await prisma.tenant.findFirst({ where: { name: { contains: 'ahat', mode: 'insensitive' } }, select: { id: true, name: true } });
    const tid = t ? t.id : null;
    console.log('TENANT:', t);
    if (tid) {
      const cfg = await getNetgsmSettings(tid);
      console.log('NETGSM:', JSON.stringify(cfg));
    }
    const cs = await prisma.customer.findMany({ where: { OR: [ { ad: { contains: 'diljar', mode: 'insensitive' } }, { instagram: { contains: 'akyz', mode: 'insensitive' } }, { ad: { contains: 'akyz', mode: 'insensitive' } } ] }, select: { ad: true, instagram: true, telefon: true, tenantId: true } });
    console.log('CUSTOMERS:', JSON.stringify(cs));
    const los = await prisma.liveOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { user: true, durum: true, urun: true, beden: true, createdAt: true } });
    console.log('LAST_LIVEORDERS:', JSON.stringify(los));
  } catch (e) { console.log('ERR', String(e.message || e)); }
  process.exit(0);
})();
