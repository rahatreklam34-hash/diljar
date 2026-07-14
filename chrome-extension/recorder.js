// Diljar Recorder — element-tabanlı makro kaydedici (koordinat DEĞİL)
// executeScript ile aktif sekmeye enjekte edilir. Tıkla / yaz / tuş adımlarını
// robust CSS selector üreterek kaydeder ve background'a gönderir.
(function () {
  if (window.__diljarRecActive) return; // çift enjeksiyon koruması
  window.__diljarRecActive = true;

  // ── Robust, sayfa boyutundan bağımsız selector üretimi ──
  function uniq(sel) {
    try { return document.querySelectorAll(sel).length === 1; } catch (_) { return false; }
  }
  function esc(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id && uniq('#' + esc(el.id))) return '#' + esc(el.id);
    const name = el.getAttribute && el.getAttribute('name');
    if (name) { const s = el.tagName.toLowerCase() + '[name="' + name + '"]'; if (uniq(s)) return s; }
    const testid = el.getAttribute && (el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy'));
    if (testid) { const s = '[data-testid="' + testid + '"]'; if (uniq(s)) return s; }
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria) { const s = el.tagName.toLowerCase() + '[aria-label="' + aria + '"]'; if (uniq(s)) return s; }
    // yol (path) — nth-of-type ile
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node.id && uniq('#' + esc(node.id))) { parts.unshift('#' + esc(node.id)); break; }
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = node.parentElement;
      if (parts.length > 6) break;
    }
    return parts.join(' > ');
  }
  function etiket(el) {
    const t = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim();
    return t.slice(0, 40);
  }
  function isEditable(el) {
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function send(step) {
    try { chrome.runtime.sendMessage({ tip: 'recStep', step }); } catch (_) {}
  }

  // ── Olay dinleyiciler ──
  const onClick = (e) => {
    const el = e.target;
    if (!el || el.closest('#__diljar_rec_bar')) return; // kendi barımıza tıklama sayma
    // Düzenlenebilir alana tıklama: yazma zaten 'yaz' olarak kaydedilecek, ama focus için tikla da kaydet
    send({ tip: 'tikla', selector: selectorFor(el), aciklama: etiket(el) });
  };
  const onChange = (e) => {
    const el = e.target;
    if (!el || !isEditable(el)) return;
    if (el.tagName === 'SELECT') {
      send({ tip: 'yaz', selector: selectorFor(el), deger: el.value, aciklama: 'seç: ' + etiket(el) });
    } else {
      send({ tip: 'yaz', selector: selectorFor(el), deger: el.value != null ? el.value : el.innerText, aciklama: etiket(el) });
    }
  };
  const onKeydown = (e) => {
    const k = e.key;
    if (['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown'].includes(k)) {
      const el = e.target;
      send({ tip: 'tus', selector: el && isEditable(el) ? selectorFor(el) : null, key: k, aciklama: 'tuş: ' + k });
    }
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('keydown', onKeydown, true);

  // ── Kayıt göstergesi (floating bar) ──
  const bar = document.createElement('div');
  bar.id = '__diljar_rec_bar';
  bar.style.cssText = 'position:fixed;z-index:2147483647;bottom:16px;right:16px;background:#0f172a;color:#fff;font:600 13px system-ui,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;align-items:center;gap:10px;';
  const dot = document.createElement('span');
  dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#ef4444;display:inline-block;animation:__djblink 1s infinite;';
  const label = document.createElement('span');
  label.textContent = 'Kaydediliyor…';
  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'Durdur';
  stopBtn.style.cssText = 'background:#ef4444;color:#fff;border:0;border-radius:6px;padding:5px 10px;font:600 12px system-ui;cursor:pointer;';
  stopBtn.onclick = () => { try { chrome.runtime.sendMessage({ tip: 'recStopFromPage' }); } catch (_) {} cleanup(); };
  const style = document.createElement('style');
  style.textContent = '@keyframes __djblink{0%,100%{opacity:1}50%{opacity:.3}}';
  bar.appendChild(dot); bar.appendChild(label); bar.appendChild(stopBtn);
  document.documentElement.appendChild(style);
  document.documentElement.appendChild(bar);

  function cleanup() {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('keydown', onKeydown, true);
    try { bar.remove(); style.remove(); } catch (_) {}
    window.__diljarRecActive = false;
    chrome.runtime.onMessage.removeListener(msgListener);
  }
  function msgListener(msg) { if (msg && msg.tip === 'diljar-rec-stop') cleanup(); }
  chrome.runtime.onMessage.addListener(msgListener);
})();
