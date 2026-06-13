const { prisma } = require('./dist/lib/prisma');
const { sendSms, getNetgsmSettings } = require('./dist/modules/sms/netgsm.service');
(async () => {
  try {
    const c = await prisma.customer.findFirst({ where: { ad: { contains: 'diljar', mode: 'insensitive' } } });
    if (!c) { console.log('NO_CUSTOMER_diljar'); process.exit(0); }
    console.log('CUSTOMER:', c.ad, '| tel:', c.telefon, '| tenant:', c.tenantId);
    const cfg = await getNetgsmSettings(c.tenantId).catch((e) => ({ err: String(e.message || e) }));
    console.log('CFG notify_approved=', cfg.notify_approved, '| header=', cfg.msgheader);
    console.log('TPL approved=', cfg.tpl_approved);
    if (!c.telefon) { console.log('NO_PHONE'); process.exit(0); }
    const tnt = await prisma.tenant.findUnique({ where: { id: c.tenantId }, select: { name: true } });
    const link = (process.env.APP_DOMAIN || '') + '/sepet/test';
    const msg = 'Sayin ' + (c.ad || '') + ', TEST-001 numarali siparisiniz onaylandi. Tutar: 100 TL. ' + (tnt && tnt.name ? tnt.name : '') + '\nSepetiniz: ' + link;
    const r = await sendSms(c.tenantId, [c.telefon], msg).catch((e) => ({ error: String(e.message || e) }));
    console.log('SEND_RESULT:', JSON.stringify(r));
  } catch (e) { console.log('ERR', String(e.message || e)); }
  process.exit(0);
})();
