// Diljar Tarayıcı Ağı Ajanı — MV3 service worker
// Panelden gelen görevleri 3-5 sn'de bir poll ile çeker ve aynı oturum sekmesinde yürütür.

const DEFAULT_SERVER = 'https://diljar.com';
const POLL_MS = 4000;

// ── Ayarlara erişim ──
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
function agentUrl(serverUrl, path) {
  return `${serverUrl}/api/v1/cihaz-agent${path}`;
}

// ── Oturum sekmesi: yoksa oluştur, varsa güncelle (yenilemeden aynı sekmede çalış) ──
async function ensureTab(url) {
  const c = await cfg();
  let tabId = c.oturumTabId;
  if (tabId != null) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab) {
        if (url) { await chrome.tabs.update(tabId, { url, active: true }); await waitComplete(tabId); }
        return tabId;
      }
    } catch (_) { tabId = null; }
  }
  // yeni sekme
  const tab = await chrome.tabs.create({ url: url || 'about:blank', active: true });
  await chrome.storage.local.set({ oturumTabId: tab.id });
  if (url) await waitComplete(tab.id);
  return tab.id;
}

// Sayfa yüklenmesini bekle
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

async function execInTab(tabId, func, args) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res?.result || { ok: false, msg: 'Enjeksiyon sonucu yok' };
}

// ── Tek görevi yürüt ──
async function runGorev(gorev) {
  const c = await cfg();
  let tabId = c.oturumTabId;
  let sonUrl = null;
  try {
    for (const adim of (gorev.adimlar || [])) {
      if (adim.tip === 'ac') {
        tabId = await ensureTab(adim.url);
        sonUrl = adim.url;
      } else if (adim.tip === 'yaz') {
        if (tabId == null) tabId = await ensureTab(null);
        const r = await execInTab(tabId, _domYaz, [adim.selector, String(adim.deger ?? '')]);
        if (!r.ok) throw new Error(r.msg);
      } else if (adim.tip === 'tikla') {
        if (tabId == null) tabId = await ensureTab(null);
        const r = await execInTab(tabId, _domTikla, [adim.selector]);
        if (!r.ok) throw new Error(r.msg);
      }
      await new Promise((r) => setTimeout(r, 600)); // adımlar arası kısa bekleme
    }
    await bildir(gorev.gorevSonucId, 'basarili', 'Tamamlandı', sonUrl);
  } catch (e) {
    await bildir(gorev.gorevSonucId, 'basarisiz', String(e?.message || e), sonUrl);
  }
}

async function bildir(gorevSonucId, durum, mesaj, aktifSekmeUrl) {
  const c = await cfg();
  if (!c.token) return;
  try {
    await fetch(agentUrl(c.serverUrl, '/sonuc'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.token}` },
      body: JSON.stringify({ gorevSonucId, durum, mesaj, aktifSekmeUrl }),
    });
  } catch (_) {}
}

// ── Poll döngüsü ──
let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const c = await cfg();
    if (!c.token) return;
    const resp = await fetch(agentUrl(c.serverUrl, '/poll'), {
      method: 'GET',
      headers: { Authorization: `Bearer ${c.token}` },
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const gorevler = data?.gorevler || [];
    for (const g of gorevler) {
      await runGorev(g);
    }
  } catch (_) {
    // sessiz geç; sonraki poll'de tekrar dener
  } finally {
    polling = false;
  }
}

// setInterval ana döngü
setInterval(poll, POLL_MS);
// Keep-alive: MV3 service worker idle timer'ını sıfırlar (API dokunuşu)
setInterval(() => { chrome.storage.local.get('token', () => {}); }, 20000);
// Yedek uyandırma: alarm ile SW ölse bile tekrar tetiklenir
chrome.alarms.create('diljar-poll', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'diljar-poll') poll(); });

chrome.runtime.onStartup?.addListener(() => poll());
chrome.runtime.onInstalled?.addListener(() => poll());
// Popup "Bağlan" sonrası anında tetikleme
chrome.runtime.onMessage?.addListener((msg) => { if (msg?.tip === 'poll') poll(); });
poll();
