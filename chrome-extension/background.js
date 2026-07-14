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
function _domYaz(selector, deger, enter) {
  // selector boşsa odaktaki (aktif) alana yaz — "yorum ekle" alanı gibi
  let el = selector ? document.querySelector(selector) : (document.activeElement || null);
  if (!el || el === document.body) return { ok: false, msg: 'Yazılacak alan bulunamadı (önce alana tıklayın)' };
  el.focus();
  if (el.isContentEditable) {
    el.textContent = deger;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: deger, inputType: 'insertText' }));
  } else {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, deger); else el.value = deger;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (enter) {
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
    try { if (el.form) (el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit()); } catch (_) {}
  }
  return { ok: true };
}
function _domTikla(selector) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, msg: 'Öğe bulunamadı: ' + selector };
  el.scrollIntoView({ block: 'center' });
  el.click();
  return { ok: true };
}
function _domTiklaMerkez() {
  // Ekranın ortasındaki öğeye bir kez tıkla (selector gerekmez)
  const x = Math.floor(window.innerWidth / 2);
  const y = Math.floor(window.innerHeight / 2);
  const el = document.elementFromPoint(x, y) || document.body;
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
  try { el.focus && el.focus(); } catch (_) {}
  return { ok: true };
}
function _domTus(selector, key) {
  const el = selector ? document.querySelector(selector) : document.activeElement;
  const opts = { key, code: key, keyCode: key === 'Enter' ? 13 : 0, which: key === 'Enter' ? 13 : 0, bubbles: true, cancelable: true };
  const t = el || document.body;
  t.dispatchEvent(new KeyboardEvent('keydown', opts));
  t.dispatchEvent(new KeyboardEvent('keypress', opts));
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

// ── CDP (chrome.debugger) ile GERÇEK (trusted) tıklama/yazma ──
// Sentetik (isTrusted:false) olaylar bazı sitelerde (canlı yayın/video/overlay)
// yok sayılır. Bu yüzden gerçek fare/klavye olaylarını CDP üzerinden gönderiyoruz.
function dbgCmd(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (res) => {
      const e = chrome.runtime.lastError;
      if (e) reject(new Error(e.message)); else resolve(res);
    });
  });
}
function dbgAttach(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      const e = chrome.runtime.lastError;
      if (e && !/already attached/i.test(e.message)) reject(new Error(e.message)); else resolve();
    });
  });
}
function dbgDetach(tabId) { return new Promise((resolve) => { chrome.debugger.detach({ tabId }, () => { void chrome.runtime.lastError; resolve(); }); }); }

async function cdpClickXY(tabId, x, y) {
  await dbgCmd(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
  await dbgCmd(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await dbgCmd(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}
// Sayfa merkezini (CSS px) hesapla
function _center() { return { x: Math.floor(window.innerWidth / 2), y: Math.floor(window.innerHeight / 2) }; }
// Selector merkezini hesapla (scroll into view sonrası)
function _rectCenter(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  return { x: Math.floor(r.left + r.width / 2), y: Math.floor(r.top + r.height / 2) };
}
async function cdpType(tabId, text) {
  await dbgCmd(tabId, 'Input.insertText', { text });
}
async function cdpEnter(tabId) {
  const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await dbgCmd(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: '\r' });
  await dbgCmd(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

// ── Adım listesini yürüt (CDP gerçek olaylar; başarısızsa sentetik fallback) ──
async function runSteps(adimlar) {
  let tabId = (await cfg()).oturumTabId;
  if (tabId == null) tabId = await ensureTab(null);
  let cdpOk = false;
  try { await dbgAttach(tabId); cdpOk = true; } catch (_) { cdpOk = false; }
  try {
    for (const adim of (adimlar || [])) {
      if (adim.tip === 'ac') {
        // navigasyon: debugger'ı bırak, aç, tekrar bağlan
        if (cdpOk) { await dbgDetach(tabId); cdpOk = false; }
        tabId = await ensureTab(adim.url);
        try { await dbgAttach(tabId); cdpOk = true; } catch (_) { cdpOk = false; }
        await new Promise((r) => setTimeout(r, 1200));
      } else if (adim.tip === 'tiklaMerkez') {
        if (cdpOk) {
          const c = (await execInTab(tabId, _center, [])) || { x: 400, y: 300 };
          await cdpClickXY(tabId, c.x, c.y);
        } else { await execInTab(tabId, _domTiklaMerkez, []); }
      } else if (adim.tip === 'tikla') {
        if (cdpOk) {
          const c = await execInTab(tabId, _rectCenter, [adim.selector]);
          if (!c) throw new Error('Öğe bulunamadı: ' + adim.selector);
          await cdpClickXY(tabId, c.x, c.y);
        } else {
          const r = await execInTab(tabId, _domTikla, [adim.selector]);
          if (!r.ok) throw new Error(r.msg);
        }
      } else if (adim.tip === 'yaz') {
        if (cdpOk) {
          if (adim.selector) {
            const c = await execInTab(tabId, _rectCenter, [adim.selector]);
            if (c) await cdpClickXY(tabId, c.x, c.y);
          }
          await new Promise((r) => setTimeout(r, 200));
          await cdpType(tabId, String(adim.deger ?? ''));
          if (adim.enter) { await new Promise((r) => setTimeout(r, 200)); await cdpEnter(tabId); }
        } else {
          const r = await execInTab(tabId, _domYaz, [adim.selector || null, String(adim.deger ?? ''), !!adim.enter]);
          if (!r.ok) throw new Error(r.msg);
        }
      } else if (adim.tip === 'tus') {
        if (cdpOk && (adim.key || 'Enter') === 'Enter') await cdpEnter(tabId);
        else await execInTab(tabId, _domTus, [adim.selector || null, adim.key || 'Enter']);
      }
      await new Promise((r) => setTimeout(r, adim.bekle || 600));
    }
  } finally {
    if (cdpOk) { try { await dbgDetach(tabId); } catch (_) {} }
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
