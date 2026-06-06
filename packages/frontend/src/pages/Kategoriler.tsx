import { useState } from 'react';
import { Tag, Plus, Trash2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import ImageDropzone from '../components/ImageDropzone';

export default function Kategoriler() {
  const { categories, products, reload } = useStore();
  const [ad, setAd] = useState('');
  const [edit, setEdit] = useState<any | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ad.trim()) return;
    try { await api.post('/store/categories', { ad: ad.trim() }); setAd(''); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const save = async () => { try { await api.patch(`/store/categories/${edit.id}`, { ad: edit.ad }); setEdit(null); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const del = async (id: string) => { if (!confirm('Kategori silinsin mi?')) return; try { await api.delete(`/store/categories/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const setImage = async (id: string, img: string | null) => { try { await api.patch(`/store/categories/${id}`, { image: img }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const count = (id: string) => products.filter((p) => p.kategoriId === id).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Tag className="text-indigo-600" size={22} /></div>
        <div><h1 className="text-xl font-bold text-slate-800">Ürün Kategorileri</h1><p className="text-sm text-slate-400">{categories.length} kategori</p></div>
      </div>
      <form onSubmit={add} className="flex gap-2 mb-5 max-w-md">
        <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Yeni kategori adı" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
        <button className="inline-flex items-center gap-1 bg-indigo-600 text-white px-4 rounded-lg text-sm hover:bg-indigo-700"><Plus size={16} /> Ekle</button>
      </form>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              {edit?.id === c.id ? (
                <input value={edit.ad} onChange={(e) => setEdit({ ...edit, ad: e.target.value })} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded" />
              ) : (
                <div><p className="font-medium text-slate-800">{c.ad}</p><p className="text-xs text-slate-400">{count(c.id)} ürün</p></div>
              )}
              <div className="flex gap-1">
                <button onClick={() => setEdit({ id: c.id, ad: c.ad })} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil size={14} /></button>
                <button onClick={() => del(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
            <ImageDropzone images={c.image ? [c.image] : []} onChange={(imgs) => setImage(c.id, imgs[0] || null)} max={1} />
          </div>
        ))}
        {categories.length === 0 && <p className="text-slate-400 text-sm">Henüz kategori yok.</p>}
      </div>
    </div>
  );
}
