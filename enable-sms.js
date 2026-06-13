const { prisma } = require('./dist/lib/prisma');
const { saveNetgsmPrefs, getNetgsmSettings } = require('./dist/modules/sms/netgsm.service');
(async () => {
  try {
    const setting = await prisma.integrationSetting.findFirst({ where: { provider: 'netgsm' }, select: { tenantId: true } });
    if (!setting) { console.log('NO_NETGSM_SETTING'); process.exit(0); }
    const tid = setting.tenantId;
    const before = await getNetgsmSettings(tid);
    console.log('BEFORE notify_approved/cancel/lowstock:', before.notify_approved, before.notify_cancel, before.notify_lowstock);
    await saveNetgsmPrefs(tid, { notify_approved: true, notify_cancel: true, notify_lowstock: true });
    const after = await getNetgsmSettings(tid);
    console.log('AFTER notify_approved/cancel/lowstock:', after.notify_approved, after.notify_cancel, after.notify_lowstock);
  } catch (e) { console.log('ERR', String(e.message || e)); }
  process.exit(0);
})();
