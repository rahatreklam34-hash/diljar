const DEFAULT_SERVER = 'https://diljar.com';
const $ = (id) => document.getElementById(id);

// ── Bağlantı durumu ──
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
  const m = $('msg'); m.textContent = text; m.style.display = 'block';
  setTimeout(() => { m.style.display = 'none'; }, 4000);
}

$('baglan').addEventListener('click', async () => {
  const serverUrl = ($('serverUrl').value || DEFAULT_SERVER).trim().replace(/\/+$/, '');
  const kod = ($('kod').value || '').trim().toUpperCase();
  if (!kod) return showMsg('Aktivasyon kodu girin');
  $('baglan').textContent = 'Bağlanıyor...';
  try {
    const resp = await fetch(`${serverUrl}/api/v1/cihaz-agent/activate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktivasyonKodu: kod, tarayiciBilgi: navigator.userAgent }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || data?.message || 'Bağlantı başarısız');
    await chrome.storage.local.set({ serverUrl, token: data.token, cihazId: data.cihazId, ad: data.ad });
    chrome.runtime.sendMessage?.({ tip: 'poll' });
    render();
  } catch (e) { showMsg(String(e?.message || e)); }
  finally { $('baglan').textContent = 'Bağlan'; }
});

$('kes').addEventListener('click', async () => {
  await chrome.storage.local.remove(['token', 'cihazId', 'ad']);
  render();
});

// ── Makro kaydet-oynat ──
let recording = false;
let sonAdimlar = [];
let sonUrl = '';

async function makroDurum() {
  const d = await chrome.storage.local.get('recording');
  recording = !!d.recording;
  $('recBtn').textContent = recording ? '■ Kaydı Durdur' : '● Kayıt Başlat';
  $('recBtn').className = recording ? 'go' : 'rec';
}

$('recBtn').addEventListener('click', async () => {
  if (!recording) {
    const r = await chrome.runtime.sendMessage({ tip: 'kayitBaslat' });
    if (!r?.ok) return showMsg(r?.msg || 'Kayıt başlatılamadı');
    sonUrl = r.url || '';
    recording = true;
    await makroDurum();
    showMsg('Kayıt başladı — sayfada işlemleri yap, sonra Durdur.');
  } else {
    const r = await chrome.runtime.sendMessage({ tip: 'kayitDurdur' });
    recording = false;
    await makroDurum();
    sonAdimlar = r?.adimlar || [];
    if (!sonAdimlar.length) return showMsg('Adım kaydedilmedi.');
    $('kaydetBox').style.display = 'block';
    $('makroUrl').value = sonUrl;
    $('makroAd').value = '';
    $('adimSay').textContent = `${sonAdimlar.length} adım kaydedildi.`;
  }
});

$('makroIptal').addEventListener('click', () => { $('kaydetBox').style.display = 'none'; sonAdimlar = []; });

$('makroKaydet').addEventListener('click', async () => {
  const ad = ($('makroAd').value || '').trim();
  if (!ad) return showMsg('Otomasyon adı girin');
  const url = ($('makroUrl').value || '').trim();
  const d = await chrome.storage.local.get('makrolar');
  const makrolar = d.makrolar || [];
  makrolar.push({ id: 'm' + Date.now(), ad, url, adimlar: sonAdimlar });
  await chrome.storage.local.set({ makrolar });
  $('kaydetBox').style.display = 'none';
  sonAdimlar = [];
  showMsg('Otomasyon kaydedildi ✓');
  listele();
});

async function listele() {
  const d = await chrome.storage.local.get('makrolar');
  const makrolar = d.makrolar || [];
  const box = $('makroListe');
  if (!makrolar.length) { box.innerHTML = '<div class="sub">Henüz kayıtlı otomasyon yok.</div>'; return; }
  box.innerHTML = '';
  makrolar.forEach((m) => {
    const div = document.createElement('div');
    div.className = 'macro';
    div.innerHTML = `<b>${escapeHtml(m.ad)}</b> <span class="sub">(${m.adimlar.length} adım)</span>` +
      (m.url ? `<div class="u">${escapeHtml(m.url)}</div>` : '') +
      `<div class="btns"><button class="go" data-run="${m.id}">▶ Başlat</button><button class="del" data-del="${m.id}">Sil</button></div>`;
    box.appendChild(div);
  });
  box.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ tip: 'makroCalistir', id: b.getAttribute('data-run') });
    showMsg('Otomasyon başlatıldı ▶');
  }));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.getAttribute('data-del');
    const dd = await chrome.storage.local.get('makrolar');
    await chrome.storage.local.set({ makrolar: (dd.makrolar || []).filter((x) => x.id !== id) });
    listele();
  }));
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

render();
makroDurum();
listele();
