import { useState, useEffect } from 'react';
import { Store, Save, Plus, Trash2, ArrowUp, ArrowDown, Tag, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import ImageDropzone from '../components/ImageDropzone';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default function OnlineMagaza() {
  const { products, storeSetting, discountCodes, reload } = useStore();
  const [s, setS] = useState<any>({ active: false, slug: '', logoText: '', heroTitle: '', heroSubtitle: '', heroImage: '', heroVideo: '', bankaAd: '', iban: '', hesapSahibi: '', slides: [] as any[], productOrder: [] as string[] });
  const [disc, setDisc] = useState({ code: '', tip: 'yuzde', deger: '' });

  useEffect(() => {
    if (storeSetting) setS({ active: storeSetting.active, slug: storeSetting.slug || '', logoText: storeSetting.logoText || '', heroTitle: storeSetting.heroTitle || '', heroSubtitle: storeSetting.heroSubtitle || '', heroImage: storeSetting.heroImage || '', heroVideo: storeSetting.heroVideo || '', bankaAd: storeSetting.bankaAd || '', iban: storeSetting.iban || '', hesapSahibi: storeSetting.hesapSahibi || '', slides: storeSetting.slides || [], productOrder: storeSetting.productOrder || [] });
  }, [storeSetting]);

  const addSlide = () => setS((x: any) => ({ ...x, slides: [...x.slides, { image: '', title: '', subtitle: '', cta: 'Alışverişe Başla' }] }));
  const setSlide = (i: number, patch: any) => setS((x: any) => ({ ...x, slides: x.slides.map((sl: any, idx: number) => idx === i ? { ...sl, ...patch } : sl) }));
  const delSlide = (i: number) => setS((x: any) => ({ ...x, slides: x.slides.filter((_: any, idx: number) => idx !== i) }));

  const onlineProducts = products.filter((p) => p.onlineMagaza);
  // siralama: productOrder'a gore, sonra kalanlar
  const ordered = [...onlineProducts].sort((a, b) => {
    const ia = s.productOrder.indexOf(a.id); const ib = s.productOrder.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  const move = (id: string, dir: -1 | 1) => {
    const ids = ordered.map((p) => p.id);
    const i = ids.indexOf(id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setS((x: any) => ({ ...x, productOrder: ids }));
  };

  const save = async () => {
    try { await api.put('/store/settings', { active: s.active, slug: s.slug || null, logoText: s.logoText || null, heroTitle: s.heroTitle || null, heroSubtitle: s.heroSubtitle || null, heroImage: s.heroImage || null, heroVideo: s.heroVideo || null, bankaAd: s.bankaAd || null, iban: s.iban || null, hesapSahibi: s.hesapSahibi || null, slides: s.slides, productOrder: s.productOrder }); toast.success('Mağaza ayarları kaydedildi'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const addDisc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disc.code.trim()) return;
    try { await api.post('/store/discounts', { code: disc.code.trim().toUpperCase(), tip: disc.tip, deger: Number(disc.deger) || 0, aktif: true }); setDisc({ code: '', tip: 'yuzde', deger: '' }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const delDisc = async (id: string) => { try { await api.delete(`/store/discounts/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const toggleDisc = async (d: any) => { try { await api.patch(`/store/discounts/${d.id}`, { aktif: !d.aktif }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Store className="text-indigo-600" size={22} /></div>
        <div className="flex-1"><h1 className="text-xl font-bold text-slate-800">Online Mağazam</h1><p className="text-sm text-slate-400">Mağaza görünümü, sıralama ve indirim kodları</p></div>
        <button onClick={save} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700"><Save size={18} /> Kaydet</button>
      </div>

      {/* Genel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={s.active} onChange={(e) => setS({ ...s, active: e.target.checked })} /> Mağaza aktif (yayında)
          </label>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mağaza Adresi (slug)</label>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-slate-400">/m/</span>
              <input value={s.slug} onChange={(e) => setS({ ...s, slug: e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase() })} placeholder="magaza-adi" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mağaza / Logo Adı</label>
            <input value={s.logoText} onChange={(e) => setS({ ...s, logoText: e.target.value })} placeholder="LACOS KENAN" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </div>
          <div><label className="block text-xs text-slate-500 mb-1">Hero Başlık</label><input value={s.heroTitle} onChange={(e) => setS({ ...s, heroTitle: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
          <div><label className="block text-xs text-slate-500 mb-1">Hero Alt Başlık</label><input value={s.heroSubtitle} onChange={(e) => setS({ ...s, heroSubtitle: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Hero Görseli</label>
          <ImageDropzone images={s.heroImage ? [s.heroImage] : []} onChange={(imgs) => setS({ ...s, heroImage: imgs[0] || '' })} max={1} />
        </div>
      </div>

      {/* Videolu satış + banka bilgileri */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h3 className="font-semibold text-slate-800 text-sm">Videolu Satış & Ödeme Bilgileri</h3>
        <div><label className="block text-xs text-slate-500 mb-1">Tanıtım / Canlı Video URL'i (mp4 veya yayın bağlantısı)</label><input value={s.heroVideo} onChange={(e) => setS({ ...s, heroVideo: e.target.value })} placeholder="https://.../video.mp4" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><p className="text-[11px] text-slate-400 mt-1">Doldurulunca ana sayfada video oynatıcı açılır; müşteri izlerken ürün ekleyebilir.</p></div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className="block text-xs text-slate-500 mb-1">Banka Adı</label><input value={s.bankaAd} onChange={(e) => setS({ ...s, bankaAd: e.target.value })} placeholder="ör. İş Bankası" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
          <div><label className="block text-xs text-slate-500 mb-1">IBAN</label><input value={s.iban} onChange={(e) => setS({ ...s, iban: e.target.value })} placeholder="TR.." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
          <div><label className="block text-xs text-slate-500 mb-1">Hesap Sahibi</label><input value={s.hesapSahibi} onChange={(e) => setS({ ...s, hesapSahibi: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
        </div>
        <p className="text-[11px] text-slate-400">Havale/EFT seçen müşteriye asistan bu banka bilgilerini iletir.</p>
      </div>

      {/* Hero Slaytlari */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700">Hero Slaytları <span className="text-xs text-slate-400 font-normal">(birden fazla banner)</span></h3>
          <button onClick={addSlide} className="inline-flex items-center gap-1 text-sm text-indigo-600"><Plus size={15} /> Slayt Ekle</button>
        </div>
        {s.slides.length === 0 ? <p className="text-sm text-slate-400">Slayt yoksa yukarıdaki tek hero kullanılır.</p> : (
          <div className="space-y-4">
            {s.slides.map((sl: any, i: number) => (
              <div key={i} className="grid md:grid-cols-[160px_1fr_auto] gap-3 items-start border border-slate-100 rounded-lg p-3">
                <ImageDropzone images={sl.image ? [sl.image] : []} onChange={(imgs) => setSlide(i, { image: imgs[0] || '' })} max={1} />
                <div className="space-y-2">
                  <input value={sl.title} onChange={(e) => setSlide(i, { title: e.target.value })} placeholder="Başlık (Yeni Sezon)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                  <input value={sl.subtitle} onChange={(e) => setSlide(i, { subtitle: e.target.value })} placeholder="Alt başlık" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                  <input value={sl.cta} onChange={(e) => setSlide(i, { cta: e.target.value })} placeholder="Buton metni" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                </div>
                <button onClick={() => delSlide(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Urun siralama */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-3">Ürün Sıralaması <span className="text-xs text-slate-400 font-normal">(online mağazada görünenler)</span></h3>
        {ordered.length === 0 ? <p className="text-sm text-slate-400">Online mağazada gösterilecek ürün yok. Ürünlerim'de "Online" seçeneğini açın.</p> : (
          <div className="space-y-2">
            {ordered.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 border border-slate-100 rounded-lg p-2">
                <img src={(p.images || [])[0] || ''} className="w-10 h-10 rounded object-cover bg-slate-100" />
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{p.ad}</p><p className="text-xs text-slate-400">{fmt(p.satisFiyat)}</p></div>
                <button onClick={() => move(p.id, -1)} disabled={i === 0} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowUp size={16} /></button>
                <button onClick={() => move(p.id, 1)} disabled={i === ordered.length - 1} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowDown size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Indirim kodlari */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2"><Tag size={16} /> İndirim Kodları</h3>
        <form onSubmit={addDisc} className="flex flex-wrap gap-2 mb-4">
          <input value={disc.code} onChange={(e) => setDisc({ ...disc, code: e.target.value })} placeholder="KOD" className="px-3 py-2 text-sm border border-slate-200 rounded-lg uppercase" />
          <select value={disc.tip} onChange={(e) => setDisc({ ...disc, tip: e.target.value })} className="px-3 py-2 text-sm border border-slate-200 rounded-lg"><option value="yuzde">% Yüzde</option><option value="tutar">₺ Tutar</option></select>
          <input type="number" value={disc.deger} onChange={(e) => setDisc({ ...disc, deger: e.target.value })} placeholder="Değer" className="w-24 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          <button className="inline-flex items-center gap-1 bg-indigo-600 text-white px-4 rounded-lg text-sm hover:bg-indigo-700"><Plus size={16} /> Ekle</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {discountCodes.map((d) => (
            <span key={d.id} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${d.aktif ? 'bg-white border-indigo-200 text-indigo-700' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
              <strong>{d.code}</strong> {d.tip === 'yuzde' ? `%${d.deger}` : fmt(d.deger)}
              <button onClick={() => toggleDisc(d)} className="text-[10px] underline">{d.aktif ? 'Pasifleştir' : 'Aktifleştir'}</button>
              <button onClick={() => delDisc(d.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
            </span>
          ))}
          {discountCodes.length === 0 && <p className="text-sm text-slate-400">Henüz indirim kodu yok.</p>}
        </div>
      </div>

      {s.active && s.slug && (
        <a href={`/m/${s.slug}`} target="_blank" className="inline-flex items-center gap-2 text-indigo-600 text-sm hover:underline"><ExternalLink size={14} /> Mağazamı görüntüle: /m/{s.slug}</a>
      )}
    </div>
  );
}
