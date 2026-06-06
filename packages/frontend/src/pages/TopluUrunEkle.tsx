import { useState } from 'react';
import { PackagePlus, Plus, Trash2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import ImageDropzone from '../components/ImageDropzone';

const CINSIYET = ['kadin', 'erkek', 'unisex', 'cocuk'];
const emptyRow = () => ({ ad: '', cinsiyet: 'unisex', lokasyon: '', alisFiyat: '', satisFiyat: '', stokAdeti: '', images: [] as string[] });

export default function TopluUrunEkle() {
  const { categories, reload } = useStore();
  const [rows, setRows] = useState<any[]>([emptyRow()]);
  const [kategoriId, setKategoriId] = useState('');
  const [busy, setBusy] = useState(false);

  const setRow = (i: number, k: string, v: any) => setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const delRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const submit = async () => {
    const valid = rows.filter((r) => r.ad && r.lokasyon && r.images.length > 0);
    if (valid.length === 0) { toast.error('Geçerli ürün yok (ad, lokasyon ve en az 1 görsel gerekli)'); return; }
    setBusy(true);
    let ok = 0;
    for (const r of valid) {
      try {
        await api.post('/store/products', { ad: r.ad, cinsiyet: r.cinsiyet, lokasyon: r.lokasyon, kategoriId: kategoriId || null, alisFiyat: Number(r.alisFiyat) || 0, satisFiyat: Number(r.satisFiyat) || 0, stokAdeti: Number(r.stokAdeti) || 0, images: r.images });
        ok++;
      } catch (e) { /* devam */ }
    }
    setBusy(false);
    toast.success(`${ok} ürün eklendi`);
    setRows([emptyRow()]); reload();
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><PackagePlus className="text-indigo-600" size={22} /></div>
        <div className="flex-1"><h1 className="text-xl font-bold text-slate-800">Toplu Ürün Ekle</h1><p className="text-sm text-slate-400">Görselleri sürükle-bırak ile ekleyin</p></div>
        <select value={kategoriId} onChange={(e) => setKategoriId(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg">
          <option value="">Ortak Kategori (ops.)</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 grid lg:grid-cols-[180px_1fr] gap-4">
            <ImageDropzone images={r.images} onChange={(imgs) => setRow(i, 'images', imgs)} max={5} />
            <div className="grid sm:grid-cols-3 gap-2">
              <input value={r.ad} onChange={(e) => setRow(i, 'ad', e.target.value)} placeholder="Ürün adı *" className="sm:col-span-2 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <select value={r.cinsiyet} onChange={(e) => setRow(i, 'cinsiyet', e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg">{CINSIYET.map((c) => <option key={c}>{c}</option>)}</select>
              <input value={r.lokasyon} onChange={(e) => setRow(i, 'lokasyon', e.target.value)} placeholder="Lokasyon *" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <input type="number" value={r.alisFiyat} onChange={(e) => setRow(i, 'alisFiyat', e.target.value)} placeholder="Alış" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <input type="number" value={r.satisFiyat} onChange={(e) => setRow(i, 'satisFiyat', e.target.value)} placeholder="Satış" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <input type="number" value={r.stokAdeti} onChange={(e) => setRow(i, 'stokAdeti', e.target.value)} placeholder="Stok" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <div className="sm:col-span-2 flex justify-end">
                {rows.length > 1 && <button onClick={() => delRow(i)} className="text-red-500 text-sm inline-flex items-center gap-1"><Trash2 size={14} /> Satırı sil</button>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button onClick={addRow} className="inline-flex items-center gap-2 border border-slate-200 px-4 py-2 rounded-lg text-sm hover:bg-slate-50"><Plus size={16} /> Satır Ekle</button>
        <button onClick={submit} disabled={busy} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"><Save size={16} /> Tümünü Kaydet</button>
      </div>
    </div>
  );
}
