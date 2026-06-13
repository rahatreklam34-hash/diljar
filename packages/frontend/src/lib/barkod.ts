// Gerçek, taranabilir Code128 barkodu SVG olarak üretir.
// Önemli: SVG <rect fill> kullanır (arka plan rengi DEĞİL) ve print-color-adjust:exact
// uygulanır; böylece PDF'e/yazdırmaya barkod sorunsuz yansır.
const PATTERNS = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];

export function code128Svg(input: string): string {
  const text = String(input || '').replace(/[^\x20-\x7E]/g, '');
  if (!text) return '';
  const codes: number[] = [104]; // Start B
  for (const ch of text) codes.push(ch.charCodeAt(0) - 32);
  let sum = 104;
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103); // checksum
  codes.push(106); // stop
  const seq = codes.map((c) => PATTERNS[c]).join('');
  const h = 40; let x = 0, rects = '';
  for (let i = 0; i < seq.length; i++) {
    const w = parseInt(seq[i], 10);
    if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${h}" fill="#000"/>`;
    x += w;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${h}" preserveAspectRatio="none" style="width:100%;height:44px;display:block">${rects}</svg>`;
}

export interface BarkodUrun {
  ad?: string;
  salesCode?: string | null;
  sku?: string | null;
  barkod?: string | null;
  id?: string;
  satisFiyat?: number;
}

// arr: yazdırılacak ürünler. showPrice=false ise fiyat satırı gizlenir (tedarikçi portalı).
export function printBarkodLabels(arr: BarkodUrun[], opts?: { showPrice?: boolean }): boolean {
  if (!arr.length) return false;
  const showPrice = opts?.showPrice !== false;
  const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const labels = arr.map((p) => {
    const code = p.barkod || p.sku || p.salesCode || p.id || '';
    return `<div style="border:1px solid #ddd;border-radius:6px;padding:8px;text-align:center;width:200px;display:inline-block;margin:4px;vertical-align:top">
      <div style="font-size:12px;font-weight:600;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(p.ad || '').replace(/</g, '')}</div>
      <div style="font-size:10px;color:#888;margin-bottom:4px">${p.sku || p.salesCode || ''}</div>
      <div style="line-height:0;margin:2px 0">${code128Svg(String(code))}</div>
      <div style="font-family:monospace;font-size:11px;letter-spacing:2px;margin-top:2px">${code || '-'}</div>
      ${showPrice ? `<div style="font-size:11px;font-weight:700;margin-top:2px">${fmt(p.satisFiyat || 0)}</div>` : ''}
    </div>`;
  }).join('');
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barkod</title><style>*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body style="font-family:Arial">${labels}<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close();
  return true;
}
