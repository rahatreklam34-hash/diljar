// Diljar Tarayıcı Ağı Ajanı — MV3 service worker
// 1) Panel görevlerini (uzaktan) poll ile çeker ve oturum sekmesinde yürütür.
// 2) Yerel MAKRO KAYDET-OYNAT: sayfada yaptığın tıkla/yaz/tuş adımlarını element-tabanlı
//    (koordinat DEĞİL) selector'larla kaydeder; URL + Başlat ile aynı akışta oynatır.

const DEFAULT_SERVER = 'https://diljar.com';
const POLL_MS = 4000;

// ── Ayarlar ──
async function cfg() {
  const d = await chrome.storage.local.get(['serverUrl', 'token', 'cihazId', 'ad', 'oturumTabId']);
  return {
    serverUrl: (d.serverUrl || DEFAULT_SERVER).replace(/\/+$/, ''),
    token: d.token || '',
    cihazId: d.cihazId || '',
    ad: d.ad || '',
    oturumTabId: d.oturumTabId || null,
  };
}
function agentUrl(serverUrl, path) { return `${serverUrl}/api/v1/cihaz-agent${path}`; }

// ── Oturum sekmesi: yoksa oluştur, varsa aynı sekmeyi kullan (yenilemeden) ──
async function ensureTab(url) {
  const c = await cfg();
  let tabId = c.oturumTabId;
  if (tabId != null) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab) { if (url) { await chrome.tabs.update(tabId, { url, active: true }); await waitComplete(tabId); } return tabId; }
    } catch (_) { tabId = null; }
  }
  const tab = await chrome.tabs.create({ url: url || 'about:blank', active: true });
  await chrome.storage.local.set({ oturumTabId: tab.id });
  if (url) await waitComplete(tab.id);
  return tab.id;
}
function waitComplete(tabId, timeout = 30000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) return resolve();
        if (tab.status === 'complete') return resolve();
        if (Date.now() - started > timeout) return resolve();
        setTimeout(check, 400);
      });
    };
    setTimeout(check, 500);
  });
}

// ── DOM eylemleri (hedef sekmede enjekte edilir) ──
function _domYaz(selector, deger) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, msg: 'Alan bulunamadı: ' + selector };
  el.focus();
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, deger); else el.value = deger;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
}
function _domTikla(selector) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, msg: 'Öğe bulunamadı: ' + selector };
  el.scrollIntoView({ block: 'center' });
  el.click();
  return { ok: true };
}
function _domTus(selector, key) {
  const el = selector ? document.querySelector(selector) : document.activeElement;
  const opts = { key, code: key, bubbles: true, cancelable: true };
  const t = el || document.body;
  t.dispatchEvent(new KeyboardEvent('keydown', opts));
  t.dispatchEvent(new KeyboardEvent('keyup', opts));
  if (key === 'Enter' && el && el.form) {
    try { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); } catch (_) {}
  }
  return { ok: true };
}

async function execInTab(tabId, func, args) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res?.result || { ok: false, msg: 'Enjeksiyon sonucu yok' };
}

// ── Adım listesini yürüt (hem uzak görev hem yerel makro kullanır) ──
async function runSteps(adimlar) {
  let tabId = (await cfg()).oturumTabId;
  for (const adim of (adimlar || [])) {
    if (adim.tip === 'ac') {
      tabId = await ensureTab(adim.url);
    } else if (adim.tip === 'yaz') {
      if (tabId == null) tabId = await ensureTab(null);
      const r = await execInTab(tabId, _domYaz, [adim.selector, String(adim.deger ?? '')]);
      if (!r.ok) throw new Error(r.msg);
    } else if (adim.tip === 'tikla') {
      if (tabId == null) tabId = await ensureTab(null);
      const r = await execInTab(tabId, _domTikla, [adim.selector]);
      if (!r.ok) throw new Error(r.msg);
    } else if (adim.tip === 'tus') {
      if (tabId == null) tabId = await ensureTab(null);
      await execInTab(tabId, _domTus, [adim.selector || null, adim.key || 'Enter']);
    }
    await new Promise((r) => setTimeout(r, adim.bekle || 600));
  }
}

// ══════════ UZAK GÖREV (panel) ══════════
async function runGorev(gorev) {
  try {
    await runSteps(gorev.adimlar);
    await bildir(gorev.gorevSonucId, 'basarili', 'Tamamlandı');
  } catch (e) {
    await bildir(gorev.gorevSonucId, 'basarisiz', String(e?.message || e));
  }
}
async function bildir(gorevSonucId, durum, mesaj) {
  const c = await cfg();
  if (!c.token) return;
  try {
    await fetch(agentUrl(c.serverUrl, '/sonuc'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.token}` },
      body: JSON.stringify({ gorevSonucId, durum, mesaj }),
    });
  } catch (_) {}
}
let polling = false;
async function poll() {
  if (polling) return; polling = true;
  try {
    const c = await cfg();
    if (!c.token) return;
    const resp = await fetch(agentUrl(c.serverUrl, '/poll'), { method: 'GET', headers: { Authorization: `Bearer ${c.token}` } });
    if (!resp.ok) return;
    const data = await resp.json();
    for (const g of (data?.gorevler || [])) await runGorev(g);
  } catch (_) { } finally { polling = false; }
}

// ══════════ YEREL MAKRO KAYDET-OYNAT ══════════
let recBuffer = [];   // kayıt sırasında biriken adımlar
let recTabId = null;  // kaydın yapıldığı sekme

async function kayitBaslat() {
  const tab = await chrome.tabs.query({ active: true, currentWindow: true }).then((t) => t[0]);
  if (!tab) return { ok: false, msg: 'Aktif sekme yok' };
  recBuffer = [];
  recTabId = tab.id;
  await chrome.storage.local.set({ oturumTabId: tab.id, recording: true });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['recorder.js'] });
  } catch (e) {
    return { ok: false, msg: 'Bu sayfaya kayıt enjekte edilemedi (chrome:// veya mağaza sayfası olabilir)' };
  }
  return { ok: true, url: tab.url };
}
async function kayitDurdur() {
  await chrome.storage.local.set({ recording: false });
  if (recTabId != null) {
    try { await chrome.tabs.sendMessage(recTabId, { tip: 'diljar-rec-stop' }); } catch (_) {}
  }
  const adimlar = recBuffer.slice();
  recBuffer = [];
  return { ok: true, adimlar };
}
async function makroCalistir(id) {
  const d = await chrome.storage.local.get('makrolar');
  const makro = (d.makrolar || []).find((m) => m.id === id);
  if (!makro) return { ok: false, msg: 'Makro bulunamadı' };
  const adimlar = makro.url ? [{ tip: 'ac', url: makro.url }, ...makro.adimlar] : makro.adimlar;
  runSteps(adimlar).catch((e) => console.warn('makro hata', e));
  return { ok: true };
}

// ── Mesaj yönlendirme ──
chrome.runtime.onMessage?.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.tip) return;
  if (msg.tip === 'poll') { poll(); return; }
  if (msg.tip === 'recStep') { if (msg.step) recBuffer.push(msg.step); return; }
  if (msg.tip === 'recStopFromPage') { kayitDurdur(); return; }
  if (msg.tip === 'kayitBaslat') { kayitBaslat().then(sendResponse); return true; }
  if (msg.tip === 'kayitDurdur') { kayitDurdur().then(sendResponse); return true; }
  if (msg.tip === 'makroCalistir') { makroCalistir(msg.id).then(sendResponse); return true; }
});

// ── Poll döngüsü + keep-alive ──
setInterval(poll, POLL_MS);
setInterval(() => { chrome.storage.local.get('token', () => {}); }, 20000);
chrome.alarms.create('diljar-poll', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'diljar-poll') poll(); });
chrome.runtime.onStartup?.addListener(() => poll());
chrome.runtime.onInstalled?.addListener(() => poll());
poll();
