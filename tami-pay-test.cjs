const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const store = await p.storeSetting.findFirst({ where: { active: true }, select: { slug: true, tenantId: true } });
    const order = await p.storeOrder.findFirst({ where: { tenantId: store.tenantId }, orderBy: { createdAt: 'desc' }, select: { id: true, toplam: true, gelirKaydedilen: true, items: true, customerId: true } });
    console.log('slug=', store.slug, 'orderId=', order?.id, 'toplam=', order?.toplam, 'paid=', order?.gelirKaydedilen, 'itemCount=', (order?.items || []).length);
    if (!order) { console.log('siparis yok'); process.exit(0); }
    const body = { orderId: order.id, card: { number: '4824910501747014', cvv: '000', expireMonth: 12, expireYear: 2030, holderName: 'Test Kullanici' } };
    const r = await fetch(`http://localhost:3000/api/v1/public/store/${store.slug}/tami/pay`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = null; }
    if (j && j.html) j.html = '[' + j.html.length + ' chars HTML]';
    console.log('HTTP', r.status, j ? JSON.stringify(j) : t.slice(0, 600));
  } catch (e) { console.log('ERR', e.message); } finally { process.exit(0); }
})();
