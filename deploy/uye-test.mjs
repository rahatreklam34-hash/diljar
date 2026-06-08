const BASE = 'https://diljar.com/api/v1/public/uye/kenanmezat';

async function tryRegister(label, instagram) {
  try {
    const r = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad: 'Test Kontrol', instagram, telefon: '05000000000' }),
    });
    const t = await r.text();
    console.log('==== ' + label + ' (' + instagram + ') ==== status ' + r.status);
    console.log(t.slice(0, 400));
    console.log('');
  } catch (e) { console.log('ERR', label, String(e)); }
}

// Sadece OLMAYAN kullanici adi ile test -> reddedilmeli (junk musteri olusmaz)
await tryRegister('OLMAYAN', 'zzqwertynonexistentuserabc123');
