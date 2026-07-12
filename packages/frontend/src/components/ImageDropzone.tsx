import { useRef, useState, useEffect, DragEvent } from 'react';
import { Upload, X, Star, Sparkles, Loader2 } from 'lucide-react';

// Dosyayi canvas ile kucultup JPEG dataURL'e cevirir
function fileToDataUrl(file: File, maxSize = 2200, quality = 0.95): Promise<string> {
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
        const webp = canvas.toDataURL('image/webp', quality);
        resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// dataURL'i (orn. AI'dan donen buyuk PNG) kucuk JPEG'e cevirir (depolama icin)
function dataUrlToJpeg(dataUrl: string, maxSize = 2200, quality = 0.95): Promise<string> {
  return new Promise((resolve, reject) => {
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
      const w = canvas.toDataURL('image/webp', quality);
      resolve(w.startsWith('data:image/webp') ? w : canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export default function ImageDropzone({ images, onChange, max = 5, onEnhance }: { images: string[]; onChange: (imgs: string[]) => void; max?: number; onEnhance?: (src: string) => Promise<string> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);

  const imagesRef = useRef(images); imagesRef.current = images;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const cur = imagesRef.current;
    const remaining = max - cur.length;
    if (remaining <= 0) return;
    const toAdd = arr.slice(0, remaining);
    const urls = await Promise.all(toAdd.map((f) => fileToDataUrl(f)));
    onChangeRef.current([...imagesRef.current, ...urls]);
  };

  // Pano (clipboard) ile gorsel yapistirma: Ctrl+V
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) files.push(f); }
      }
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max]);

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); };
  const removeAt = (i: number) => onChange(images.filter((_, idx) => idx !== i));
  const makeCover = (i: number) => { const copy = [...images]; const [it] = copy.splice(i, 1); copy.unshift(it); onChange(copy); };

  const enhanceAt = async (i: number) => {
    if (!onEnhance || busyIdx !== null) return;
    setBusyIdx(i);
    try {
      const raw = await onEnhance(images[i]);
      const small = await dataUrlToJpeg(raw);
      const copy = [...images];
      copy[i] = small;
      onChange(copy);
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Görsel iyileştirilemedi');
    } finally {
      setBusyIdx(null);
    }
  };

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${drag ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'}`}
      >
        <Upload size={20} className="mx-auto text-slate-400 mb-1" />
        <p className="text-xs text-slate-500">Görselleri sürükleyip bırakın, tıklayın veya <span className="font-medium text-emerald-600">Ctrl+V</span> ile yapıştırın</p>
        <p className="text-[10px] text-slate-400">İlk görsel kapak olur · max {max} adet{onEnhance ? ' · görsel üstündeki ✦ ile profesyonel çekime dönüştür' : ''}</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {images.map((src, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 group">
              <img src={src} alt="" className="w-full h-full object-cover" />
              {i === 0 && <span className="absolute top-0 left-0 bg-emerald-600 text-white text-[8px] px-1 rounded-br">Kapak</span>}
              {busyIdx === i && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 size={18} className="text-white animate-spin" />
                </div>
              )}
              {busyIdx !== i && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
                  {onEnhance && <button type="button" onClick={() => enhanceAt(i)} title="Profesyonel çekime dönüştür" className="text-white"><Sparkles size={14} /></button>}
                  {i !== 0 && <button type="button" onClick={() => makeCover(i)} title="Kapak yap" className="text-white"><Star size={14} /></button>}
                  <button type="button" onClick={() => removeAt(i)} title="Sil" className="text-white"><X size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
