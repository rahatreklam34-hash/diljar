import { useRef, useState, DragEvent } from 'react';
import { Upload, X, Star } from 'lucide-react';

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

export default function ImageDropzone({ images, onChange, max = 5 }: { images: string[]; onChange: (imgs: string[]) => void; max?: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const remaining = max - images.length;
    const toAdd = arr.slice(0, remaining);
    const urls = await Promise.all(toAdd.map((f) => fileToDataUrl(f)));
    onChange([...images, ...urls]);
  };

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); };
  const removeAt = (i: number) => onChange(images.filter((_, idx) => idx !== i));
  const makeCover = (i: number) => { const copy = [...images]; const [it] = copy.splice(i, 1); copy.unshift(it); onChange(copy); };

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${drag ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
      >
        <Upload size={20} className="mx-auto text-slate-400 mb-1" />
        <p className="text-xs text-slate-500">Görselleri sürükleyip bırakın veya tıklayın</p>
        <p className="text-[10px] text-slate-400">İlk görsel kapak olur · max {max} adet</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {images.map((src, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 group">
              <img src={src} alt="" className="w-full h-full object-cover" />
              {i === 0 && <span className="absolute top-0 left-0 bg-indigo-600 text-white text-[8px] px-1 rounded-br">Kapak</span>}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
                {i !== 0 && <button type="button" onClick={() => makeCover(i)} title="Kapak yap" className="text-white"><Star size={14} /></button>}
                <button type="button" onClick={() => removeAt(i)} title="Sil" className="text-white"><X size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
