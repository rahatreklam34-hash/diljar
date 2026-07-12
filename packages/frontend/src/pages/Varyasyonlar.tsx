import { useState } from 'react';
import { Layers, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';

export default function Varyasyonlar() {
  const { variationTemplates, reload } = useStore();
  const [ad, setAd] = useState('Beden');
  const [valuesText, setValuesText] = useState('');

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const values = valuesText.split(',').map((v) => v.trim()).filter(Boolean);
    if (!ad.trim() || values.length === 0) { toast.error('Şablon adı ve en az 1 değer girin'); return; }
    try { await api.post('/store/variation-templates', { ad: ad.trim(), values }); setValuesText(''); toast.success('Şablon eklendi'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (id: string) => { if (!confirm('Şablon silinsin mi?')) return; try { await api.delete(`/store/variation-templates/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Layers className="text-emerald-600" size={22} /></div>
        <div><h1 className="text-xl font-bold text-slate-800">Varyasyonlarım</h1><p className="text-sm text-slate-400">Varyasyon şablonları oluşturun (Beden, Renk vb.) — ürün eklerken kullanılır</p></div>
      </div>

      <form onSubmit={add} className="bg-white rounded-xl border border-slate-200 p-4 mb-6 grid sm:grid-cols-[180px_1fr_auto] gap-2 items-end">
        <div><label className="block text-xs text-slate-500 mb-1">Şablon Adı</label><input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Beden / Renk" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">Değerler (virgülle)</label><input value={valuesText} onChange={(e) => setValuesText(e.target.value)} placeholder="S, M, L, XL" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
        <button className="inline-flex items-center gap-1 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700"><Plus size={16} /> Şablon Ekle</button>
      </form>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {variationTemplates.map((t: any) => (
          <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800">{t.ad}</h3>
              <button onClick={() => del(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(t.values || []).map((v: string, i: number) => <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{v}</span>)}
            </div>
          </div>
        ))}
        {(!variationTemplates || variationTemplates.length === 0) && <p className="text-slate-400 text-sm">Henüz şablon yok. Örn: "Beden → S, M, L, XL".</p>}
      </div>
    </div>
  );
}
