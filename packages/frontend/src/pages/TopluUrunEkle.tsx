import { useState, useRef, DragEvent } from 'react';
import { PackagePlus, Save, Trash2, X, ChevronLeft, ChevronRight, Star, Upload, Sparkles, ImagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useStore } from '../context/StoreContext';

const CINSIYET = ['kadin', 'erkek', 'unisex', 'cocuk'];
const MAX_IMG = 6;

// Dosyayi canvas ile kucultup JPEG dataURL'e cevirir
function fileToDataUrl(file: File, maxSize = 900, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = Math.round((height * maxSize) / width); width = maxSize; }
          else { width = Math.round((width * maxSize) / height); height = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject();
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const uid = () => 'p' + Math.random().toString(36).slice(2, 9);
const cleanName = (n: string) => n.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());

interface Item { id: string; ad: string; images: string[]; cinsiyet: string; lokasyon: string; alisFiyat: string; satisFiyat: string; stokAdeti: string }

export default function TopluUrunEkle() {
  const { categories, reload } = useStore();
  const [items, setItems] = useState<Item[]>([]);
  const [kategoriId, setKategoriId] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; idx: number } | null>(null);
  const [autoApply, setAutoApply] = useState(true);
  const mainInput = useRef<HTMLInputElement>(null);

  // Ortak panel (Tümüne Uygula)
  const [common, setCommon] = useState({ cinsiyet: 'unisex', lokasyon: '', alisFiyat: '', satisFiyat: '', stokAdeti: '' });
  const setC = (k: string, v: string) => setCommon((c) => ({ ...c, [k]: v }));

  const baseFromCommon = () => autoApply
    ? { cinsiyet: common.cinsiyet, lokasyon: common.lokasyon, alisFiyat: common.alisFiyat, satisFiyat: common.satisFiyat, stokAdeti: common.stokAdeti }
    : { cinsiyet: 'unisex', lokasyon: '', alisFiyat: '', satisFiyat: '', stokAdeti: '' };

  // Ana alana bırakılan her görsel -> yeni ürün widget'ı
  const addAsProducts = async (files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    const loaded = await Promise.all(imgs.map(async (f) => ({ url: await fileToDataUrl(f), name: cleanName(f.name) })));
    setItems((prev) => [...prev, ...loaded.map(({ url, name }) => ({ id: uid(), ad: name, images: [url], ...baseFromCommon() }))]);
  };

  // Bir widget görseline bırakılan görseller -> o ürünün galerisi
  const addToGallery = async (id: string, files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    const urls = await Promise.all(imgs.map((f) => fileToDataUrl(f)));
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, images: [...it.images, ...urls].slice(0, MAX_IMG) } : it));
  };

  const setItem = (id: string, patch: Partial<Item>) => setItems((prev) => prev.map((it) => it.id === id ? { ...it, ...patch } : it));
  const delItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const removeImg = (id: string, idx: number) => setItems((prev) => prev.map((it) => it.id === id ? { ...it, images: it.images.filter((_, i) => i !== idx) } : it));
  const makeCover = (id: string, idx: number) => setItems((prev) => prev.map((it) => { if (it.id !== id) return it; const a = [...it.images]; const [c] = a.splice(idx, 1); a.unshift(c); return { ...it, images: a }; }));

  const applyAll = () => {
    if (items.length === 0) { toast('Önce görsel ekleyin'); return; }
    setItems((prev) => prev.map((it) => ({ ...it, cinsiyet: common.cinsiyet, lokasyon: common.lokasyon || it.lokasyon, alisFiyat: common.alisFiyat || it.alisFiyat, satisFiyat: common.satisFiyat || it.satisFiyat, stokAdeti: common.stokAdeti || it.stokAdeti })));
    toast.success(`${items.length} ürüne uygulandı`);
  };

  const submit = async () => {
    const valid = items.filter((r) => r.ad && r.lokasyon && r.images.length > 0);
    if (valid.length === 0) { toast.error('Geçerli ürün yok (ad, lokasyon ve en az 1 görsel gerekli)'); return; }
    setBusy(true);
    let ok = 0;
    for (const r of valid) {
      try {
        await api.post('/store/products', { ad: r.ad, cinsiyet: r.cinsiyet, lokasyon: r.lokasyon, kategoriId: kategoriId || null, alisFiyat: Number(r.alisFiyat) || 0, satisFiyat: Number(r.satisFiyat) || 0, stokAdeti: Number(r.stokAdeti) || 0, images: r.images });
        ok++;
      } catch { /* devam */ }
    }
    setBusy(false);
    toast.success(`${ok} ürün eklendi`);
    setItems([]); reload();
  };

  const onMainDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addAsProducts(e.dataTransfer.files); };
  const onCardDrop = (e: DragEvent, id: string) => { e.preventDefault(); e.stopPropagation(); setDropTarget(null); if (e.dataTransfer.files?.length) addToGallery(id, e.dataTransfer.files); };

  const inp = 'px-3 py-2 text-sm border border-slate-200 rounded-lg w-full bg-white';

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><PackagePlus className="text-indigo-600" size={22} /></div>
        <div className="flex-1 min-w-[180px]"><h1 className="text-xl font-bold text-slate-800">Toplu Ürün Ekle</h1><p className="text-sm text-slate-400">Görselleri sürükle-bırak — her görsel bir ürün olur</p></div>
        <select value={kategoriId} onChange={(e) => setKategoriId(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
          <option value="">Ortak Kategori (ops.)</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}
        </select>
        <button onClick={submit} disabled={busy || items.length === 0} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"><Save size={16} /> {busy ? 'Kaydediliyor…' : `Tümünü Kaydet${items.length ? ` (${items.length})` : ''}`}</button>
      </div>

      {/* Tümüne Uygula paneli */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3"><Sparkles size={16} className="text-indigo-600" /><h3 className="font-semibold text-slate-700">Tümüne Uygula</h3><span className="text-xs text-slate-400">— ortak değerleri tek panelden doldur</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
          <div><label className="text-[11px] font-semibold text-slate-500">Cinsiyet</label><select value={common.cinsiyet} onChange={(e) => setC('cinsiyet', e.target.value)} className={`${inp} mt-1`}>{CINSIYET.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="text-[11px] font-semibold text-slate-500">Lokasyon</label><input value={common.lokasyon} onChange={(e) => setC('lokasyon', e.target.value)} placeholder="Depo/raf" className={`${inp} mt-1`} /></div>
          <div><label className="text-[11px] font-semibold text-slate-500">Alış ₺</label><input type="number" value={common.alisFiyat} onChange={(e) => setC('alisFiyat', e.target.value)} className={`${inp} mt-1`} /></div>
          <div><label className="text-[11px] font-semibold text-slate-500">Satış ₺</label><input type="number" value={common.satisFiyat} onChange={(e) => setC('satisFiyat', e.target.value)} className={`${inp} mt-1`} /></div>
          <div><label className="text-[11px] font-semibold text-slate-500">Stok</label><input type="number" value={common.stokAdeti} onChange={(e) => setC('stokAdeti', e.target.value)} className={`${inp} mt-1`} /></div>
          <button onClick={applyAll} className="inline-flex items-center justify-center gap-2 bg-slate-800 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-900 h-[38px]"><Sparkles size={15} /> Tümüne Uygula</button>
        </div>
        <label className="inline-flex items-center gap-2 mt-3 text-xs text-slate-500 cursor-pointer"><input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} className="rounded" /> Yeni eklenen görsellere bu değerleri otomatik uygula</label>
      </div>

      {/* Büyük sürükle-bırak alanı */}
      <div
        onClick={() => mainInput.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onMainDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors mb-4 ${drag ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-300 bg-white'}`}
      >
        <Upload size={28} className="mx-auto text-indigo-400 mb-2" />
        <p className="text-sm font-medium text-slate-600">Tüm ürün görsellerini buraya sürükleyip bırakın</p>
        <p className="text-xs text-slate-400 mt-0.5">Her görsel ayrı bir ürün kartı oluşturur · adı dosya adından gelir</p>
        <input ref={mainInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && addAsProducts(e.target.files)} />
      </div>

      {/* Ürün widget'ları */}
      {items.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((it) => (
            <div key={it.id} className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="flex gap-3">
                {/* Kapak görseli — tıkla büyüt, üstüne görsel bırak */}
                <div
                  onClick={() => setLightbox({ images: it.images, idx: 0 })}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(it.id); }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => onCardDrop(e, it.id)}
                  title="Tıkla büyüt · üstüne görsel bırak (galeri)"
                  className={`relative w-24 h-24 rounded-xl overflow-hidden border-2 shrink-0 cursor-zoom-in ${dropTarget === it.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200'}`}
                >
                  {it.images[0] ? <img src={it.images[0]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300"><ImagePlus size={20} /></div>}
                  {it.images.length > 1 && <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-full">+{it.images.length - 1}</span>}
                  {dropTarget === it.id && <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center"><ImagePlus className="text-indigo-600" size={20} /></div>}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input value={it.ad} onChange={(e) => setItem(it.id, { ad: e.target.value })} placeholder="Ürün adı *" className="w-full px-2.5 py-1.5 text-sm font-medium border border-slate-200 rounded-lg" />
                  <div className="grid grid-cols-2 gap-1.5">
                    <select value={it.cinsiyet} onChange={(e) => setItem(it.id, { cinsiyet: e.target.value })} className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg">{CINSIYET.map((c) => <option key={c}>{c}</option>)}</select>
                    <input value={it.lokasyon} onChange={(e) => setItem(it.id, { lokasyon: e.target.value })} placeholder="Lokasyon *" className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input type="number" value={it.alisFiyat} onChange={(e) => setItem(it.id, { alisFiyat: e.target.value })} placeholder="Alış" className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                    <input type="number" value={it.satisFiyat} onChange={(e) => setItem(it.id, { satisFiyat: e.target.value })} placeholder="Satış" className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                    <input type="number" value={it.stokAdeti} onChange={(e) => setItem(it.id, { stokAdeti: e.target.value })} placeholder="Stok" className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                  </div>
                </div>
              </div>
              {/* Galeri küçük görseller */}
              {it.images.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {it.images.map((src, idx) => (
                    <div key={idx} className="relative w-11 h-11 rounded-lg overflow-hidden border border-slate-200 group">
                      <img src={src} alt="" onClick={() => setLightbox({ images: it.images, idx })} className="w-full h-full object-cover cursor-zoom-in" />
                      {idx === 0 && <span className="absolute top-0 left-0 bg-indigo-600 text-white text-[7px] px-1 rounded-br">Kapak</span>}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition">
                        {idx !== 0 && <button onClick={() => makeCover(it.id, idx)} title="Kapak yap" className="text-white"><Star size={12} /></button>}
                        <button onClick={() => removeImg(it.id, idx)} title="Sil" className="text-white"><X size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">{it.images.length}/{MAX_IMG} görsel</span>
                <button onClick={() => delItem(it.id)} className="text-red-500 text-xs inline-flex items-center gap-1 hover:underline"><Trash2 size={13} /> Kaldır</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && <p className="text-center text-sm text-slate-400 py-6">Henüz ürün yok. Yukarıdaki alana görselleri bırakın.</p>}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/90 bg-white/10 rounded-full p-2"><X size={20} /></button>
          {lightbox.images.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setLightbox((l) => l && ({ ...l, idx: (l.idx - 1 + l.images.length) % l.images.length })); }} className="absolute left-4 text-white/90 bg-white/10 rounded-full p-2"><ChevronLeft size={24} /></button>
              <button onClick={(e) => { e.stopPropagation(); setLightbox((l) => l && ({ ...l, idx: (l.idx + 1) % l.images.length })); }} className="absolute right-4 text-white/90 bg-white/10 rounded-full p-2"><ChevronRight size={24} /></button>
            </>
          )}
          <img src={lightbox.images[lightbox.idx]} alt="" onClick={(e) => e.stopPropagation()} className="max-h-[88vh] max-w-[92vw] object-contain rounded-lg" />
          {lightbox.images.length > 1 && <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-white/10 px-3 py-1 rounded-full">{lightbox.idx + 1} / {lightbox.images.length}</span>}
        </div>
      )}
    </div>
  );
}
