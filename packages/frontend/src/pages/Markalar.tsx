import { useState } from 'react';
import { Bookmark, Plus, Trash2, Pencil, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';

export default function Markalar() {
  const { brands, products, reload } = useStore();
  const [ad, setAd] = useState('');
  const [edit, setEdit] = useState<any | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ad.trim()) return;
    try { await api.post('/store/brands', { ad: ad.trim() }); setAd(''); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const save = async () => { try { await api.patch(`/store/brands/${edit.id}`, { ad: edit.ad }); setEdit(null); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const toggle = async (b: any) => { try { await api.patch(`/store/brands/${b.id}`, { aktif: !b.aktif }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const del = async (id: string) => { if (!confirm('Marka silinsin mi?')) return; try { await api.delete(`/store/brands/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const count = (b: any) => products.filter((p) => (p.marka || '') === b.ad).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Bookmark className="text-emerald-600" size={22} /></div>
        <div><h1 className="text-xl font-bold text-slate-800">Markalar</h1><p className="text-sm text-slate-400">{brands.length} marka</p></div>
      </div>
      <form onSubmit={add} className="flex gap-2 mb-5 max-w-md">
        <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Yeni marka adı" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
        <button className="inline-flex items-center gap-1 bg-emerald-600 text-white px-4 rounded-lg text-sm hover:bg-emerald-700"><Plus size={16} /> Ekle</button>
      </form>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {brands.map((b) => (
          <div key={b.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
            {edit?.id === b.id ? (
              <input value={edit.ad} onChange={(e) => setEdit({ ...edit, ad: e.target.value })} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded" />
            ) : (
              <div>
                <p className="font-medium text-slate-800">{b.ad}</p>
                <p className="text-xs text-slate-400">{count(b)} ürün</p>
              </div>
            )}
            <div className="flex items-center gap-1">
              <button onClick={() => toggle(b)} title={b.aktif ? 'Aktif (tıkla: pasifleştir)' : 'Pasif (tıkla: aktifleştir)'} className={`px-2 py-1 rounded-lg text-xs font-medium ${b.aktif ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                {b.aktif ? <span className="inline-flex items-center gap-1"><Check size={12} /> Aktif</span> : 'Pasif'}
              </button>
              <button onClick={() => setEdit({ id: b.id, ad: b.ad })} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil size={14} /></button>
              <button onClick={() => del(b.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {brands.length === 0 && <p className="text-slate-400 text-sm">Henüz marka yok.</p>}
      </div>
    </div>
  );
}
