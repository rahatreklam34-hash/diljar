import { useState } from 'react';
import { Hash, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';

export default function SatisKodu() {
  const { salesCodes, reload } = useStore();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<'hepsi' | 'bos' | 'kullanilan'>('hepsi');

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try { const r = await api.post('/store/salescodes/bulk', { codes: text }); toast.success(`${r.data.added} kod eklendi`); setText(''); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (id: string) => { try { await api.delete(`/store/salescodes/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  const list = salesCodes.filter((c) => filter === 'hepsi' || (filter === 'bos' ? !c.used : c.used));
  const free = salesCodes.filter((c) => !c.used).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Hash className="text-indigo-600" size={22} /></div>
        <div><h1 className="text-xl font-bold text-slate-800">Satış Kodu Havuzu</h1><p className="text-sm text-slate-400">{salesCodes.length} kod · {free} boş</p></div>
      </div>

      <form onSubmit={add} className="mb-5">
        <label className="block text-xs text-slate-500 mb-1">Çoklu kod ekle (virgül ile ayırın)</label>
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ABC123, DEF456, GHI789" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          <button className="bg-indigo-600 text-white px-5 rounded-lg text-sm hover:bg-indigo-700">Ekle</button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Her kod yalnız 1 üründe kullanılabilir. Ürün eklerken havuzdan seçilir; havuz boşsa manuel yazılabilir.</p>
      </form>

      <div className="flex gap-2 mb-3">
        {([['hepsi', `Tümü ${salesCodes.length}`], ['bos', `Boş ${free}`], ['kullanilan', `Kullanılan ${salesCodes.length - free}`]] as const).map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm ${filter === f ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{l}</button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {list.map((c) => (
          <span key={c.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm border ${c.used ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-white border-indigo-200 text-indigo-700'}`}>
            {c.code}{c.used && <span className="text-[9px]">(kullanımda)</span>}
            {!c.used && <button onClick={() => del(c.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>}
          </span>
        ))}
        {list.length === 0 && <p className="text-slate-400 text-sm">Kod yok.</p>}
      </div>
    </div>
  );
}
