const DEFAULT_SERVER = 'https://diljar.com';

const $ = (id) => document.getElementById(id);

async function render() {
  const d = await chrome.storage.local.get(['serverUrl', 'token', 'ad']);
  $('serverUrl').value = d.serverUrl || DEFAULT_SERVER;
  if (d.token) {
    $('baglidegil').style.display = 'none';
    $('bagli').style.display = 'block';
    $('cihazAd').textContent = d.ad || 'Bağlı cihaz';
  } else {
    $('baglidegil').style.display = 'block';
    $('bagli').style.display = 'none';
  }
}

function showMsg(text) {
  const m = $('msg');
  m.textContent = text;
  m.style.display = 'block';
  setTimeout(() => { m.style.display = 'none'; }, 4000);
}

$('baglan').addEventListener('click', async () => {
  const serverUrl = ($('serverUrl').value || DEFAULT_SERVER).trim().replace(/\/+$/, '');
  const kod = ($('kod').value || '').trim().toUpperCase();
  if (!kod) return showMsg('Aktivasyon kodu girin');
  $('baglan').textContent = 'Bağlanıyor...';
  try {
    const resp = await fetch(`${serverUrl}/api/v1/cihaz-agent/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktivasyonKodu: kod, tarayiciBilgi: navigator.userAgent }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || data?.message || 'Bağlantı başarısız');
    await chrome.storage.local.set({ serverUrl, token: data.token, cihazId: data.cihazId, ad: data.ad });
    // arka planı hemen tetikle
    chrome.runtime.sendMessage?.({ tip: 'poll' });
    render();
  } catch (e) {
    showMsg(String(e?.message || e));
  } finally {
    $('baglan').textContent = 'Bağlan';
  }
});

$('kes').addEventListener('click', async () => {
  await chrome.storage.local.remove(['token', 'cihazId', 'ad', 'oturumTabId']);
  render();
});

render();
