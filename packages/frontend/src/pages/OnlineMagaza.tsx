import { useState, useEffect } from 'react';
import { Store, Save, Plus, Trash2, ArrowUp, ArrowDown, Tag, ExternalLink, GripVertical, Star, Percent, X, Menu, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import ImageDropzone from '../components/ImageDropzone';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default function OnlineMagaza() {
  const { products, categories, storeSetting, discountCodes, reload } = useStore();
  const [s, setS] = useState<any>({ active: false, slug: '', logoText: '', heroTitle: '', heroSubtitle: '', heroImage: '', heroVideo: '', bankaAd: '', iban: '', hesapSahibi: '', slides: [] as any[], productOrder: [] as string[], topMenu: [] as any[], freeShipThreshold: 0, puanOrani: 0 });
  const [disc, setDisc] = useState({ code: '', tip: 'yuzde', deger: '' });
  const [dragId, setDragId] = useState<string | null>(null);
  const [indModal, setIndModal] = useState<any | null>(null);
  const [indForm, setIndForm] = useState({ eskiFiyat: '', satisFiyat: '' });

  useEffect(() => {
    if (storeSetting) setS({ active: storeSetting.active, slug: storeSetting.slug || '', logoText: storeSetting.logoText || '', heroTitle: storeSetting.heroTitle || '', heroSubtitle: storeSetting.heroSubtitle || '', heroImage: storeSetting.heroImage || '', heroVideo: storeSetting.heroVideo || '', bankaAd: storeSetting.bankaAd || '', iban: storeSetting.iban || '', hesapSahibi: storeSetting.hesapSahibi || '', slides: storeSetting.slides || [], productOrder: storeSetting.productOrder || [], topMenu: storeSetting.topMenu || [], freeShipThreshold: storeSetting.freeShipThreshold || 0, puanOrani: storeSetting.puanOrani || 0 });
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
  // Sürükle-bırak sıralama
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const ids = ordered.map((p) => p.id);
    const from = ids.indexOf(dragId); const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setS((x: any) => ({ ...x, productOrder: ids }));
    setDragId(null);
  };
  // Öne çıkar / mağazadan kaldır (anlık)
  const toggleOne = async (p: any) => { try { await api.patch(`/store/products/${p.id}`, { oneCikan: !p.oneCikan }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const removeFromStore = async (p: any) => { try { await api.patch(`/store/products/${p.id}`, { onlineMagaza: false }); toast.success('Mağazadan kaldırıldı'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  // İndirime al
  const openInd = (p: any) => { setIndForm({ eskiFiyat: String(p.eskiFiyat || p.satisFiyat || ''), satisFiyat: String(p.satisFiyat || '') }); setIndModal(p); };
  const saveInd = async () => {
    if (!indModal) return;
    const eski = Number(indForm.eskiFiyat) || 0; const yeni = Number(indForm.satisFiyat) || 0;
    if (yeni <= 0) { toast.error('Geçerli satış fiyatı girin'); return; }
    try { await api.patch(`/store/products/${indModal.id}`, { eskiFiyat: eski > yeni ? eski : null, satisFiyat: yeni }); toast.success('İndirim uygulandı'); setIndModal(null); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const clearInd = async (p: any) => { try { await api.patch(`/store/products/${p.id}`, { eskiFiyat: null }); toast.success('İndirim kaldırıldı'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  // Üst menü oluşturucu
  const addMenu = () => setS((x: any) => ({ ...x, topMenu: [...(x.topMenu || []), { id: 'm' + Date.now(), label: 'Yeni Menü', type: 'ozel', value: 'tumu', children: [] }] }));
  const setMenu = (id: string, patch: any) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === id ? { ...m, ...patch } : m) }));
  const delMenu = (id: string) => setS((x: any) => ({ ...x, topMenu: x.topMenu.filter((m: any) => m.id !== id) }));
  const moveMenu = (id: string, dir: -1 | 1) => setS((x: any) => { const arr = [...x.topMenu]; const i = arr.findIndex((m: any) => m.id === id); const j = i + dir; if (j < 0 || j >= arr.length) return x; [arr[i], arr[j]] = [arr[j], arr[i]]; return { ...x, topMenu: arr }; });
  const addChild = (mid: string) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === mid ? { ...m, children: [...(m.children || []), { label: 'Alt Menü', type: 'kategori', value: categories[0]?.id || '' }] } : m) }));
  const setChild = (mid: string, ci: number, patch: any) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === mid ? { ...m, children: m.children.map((c: any, idx: number) => idx === ci ? { ...c, ...patch } : c) } : m) }));
  const delChild = (mid: string, ci: number) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === mid ? { ...m, children: m.children.filter((_: any, idx: number) => idx !== ci) } : m) }));

  const save = async () => {
    try { await api.put('/store/settings', { active: s.active, slug: s.slug || null, logoText: s.logoText || null, heroTitle: s.heroTitle || null, heroSubtitle: s.heroSubtitle || null, heroImage: s.heroImage || null, heroVideo: s.heroVideo || null, bankaAd: s.bankaAd || null, iban: s.iban || null, hesapSahibi: s.hesapSahibi || null, slides: s.slides, productOrder: s.productOrder, topMenu: s.topMenu, freeShipThreshold: Number(s.freeShipThreshold) || 0, puanOrani: Number(s.puanOrani) || 0 }); toast.success('Mağaza ayarları kaydedildi'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
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
        <div className="grid sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Ücretsiz Kargo Eşiği (TL)</label>
            <input type="number" min={0} value={s.freeShipThreshold} onChange={(e) => setS({ ...s, freeShipThreshold: e.target.value })} placeholder="0 = kapalı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <p className="text-[10px] text-slate-400 mt-1">Bu tutar üzeri sepetlerde "ücretsiz kargo" rozeti gösterilir. 0 = kapalı.</p>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">VIP Puan Oranı (%)</label>
            <input type="number" min={0} max={100} step="0.5" value={s.puanOrani} onChange={(e) => setS({ ...s, puanOrani: e.target.value })} placeholder="0 = kapalı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <p className="text-[10px] text-slate-400 mt-1">Sepet tutarının %'i kadar puan müşteriye gösterilir. 0 = kapalı.</p>
          </div>
        </div>
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

      {/* Üst Menü Oluşturucu */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2"><Menu size={16} className="text-indigo-600" /> Üst Menü</h3>
          <button onClick={addMenu} className="inline-flex items-center gap-1 text-sm text-indigo-600"><Plus size={15} /> Menü Ekle</button>
        </div>
        <p className="text-xs text-slate-400 mb-3">Mağazanın üst menüsünde görünecek başlıkları oluşturun. Her başlığa kategori veya cinsiyet bazlı alt menüler ekleyebilirsiniz.</p>
        {(s.topMenu || []).length === 0 ? <p className="text-sm text-slate-400">Menü öğesi yok. Boş bırakılırsa varsayılan menü (Tümü, İndirimdekiler, Çok Satanlar…) gösterilir.</p> : (
          <div className="space-y-3">
            {s.topMenu.map((m: any, mi: number) => (
              <div key={m.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                <div className="flex items-center gap-2 flex-wrap">
                  <input value={m.label} onChange={(e) => setMenu(m.id, { label: e.target.value })} placeholder="Menü başlığı" className="px-3 py-2 text-sm border border-slate-200 rounded-lg flex-1 min-w-[140px] font-medium" />
                  <select value={m.type} onChange={(e) => { const t = e.target.value; setMenu(m.id, { type: t, value: t === 'kategori' ? (categories[0]?.id || '') : t === 'cinsiyet' ? 'kadin' : 'tumu' }); }} className="px-2 py-2 text-sm border border-slate-200 rounded-lg">
                    <option value="ozel">Özel Filtre</option>
                    <option value="kategori">Kategori</option>
                    <option value="cinsiyet">Cinsiyet</option>
                  </select>
                  {m.type === 'kategori' && <select value={m.value} onChange={(e) => setMenu(m.id, { value: e.target.value })} className="px-2 py-2 text-sm border border-slate-200 rounded-lg">{categories.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select>}
                  {m.type === 'cinsiyet' && <select value={m.value} onChange={(e) => setMenu(m.id, { value: e.target.value })} className="px-2 py-2 text-sm border border-slate-200 rounded-lg">{[['kadin', 'Kadın'], ['erkek', 'Erkek'], ['cocuk', 'Çocuk'], ['unisex', 'Unisex']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
                  {m.type === 'ozel' && <select value={m.value} onChange={(e) => setMenu(m.id, { value: e.target.value })} className="px-2 py-2 text-sm border border-slate-200 rounded-lg">{[['tumu', 'Tümü'], ['indirim', 'İndirimdekiler'], ['coksatan', 'Çok Satanlar'], ['yeni', 'Yeni Fırsatlar'], ['sonsans', 'Son Şans']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
                  <button onClick={() => moveMenu(m.id, -1)} disabled={mi === 0} className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowUp size={15} /></button>
                  <button onClick={() => moveMenu(m.id, 1)} disabled={mi === s.topMenu.length - 1} className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowDown size={15} /></button>
                  <button onClick={() => delMenu(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                </div>
                {/* Alt menüler */}
                <div className="mt-2 pl-4 border-l-2 border-slate-200 space-y-2">
                  {(m.children || []).map((c: any, ci: number) => (
                    <div key={ci} className="flex items-center gap-2 flex-wrap">
                      <ChevronRight size={13} className="text-slate-300 shrink-0" />
                      <input value={c.label} onChange={(e) => setChild(m.id, ci, { label: e.target.value })} placeholder="Alt menü adı" className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg flex-1 min-w-[120px]" />
                      <select value={c.type} onChange={(e) => { const t = e.target.value; setChild(m.id, ci, { type: t, value: t === 'kategori' ? (categories[0]?.id || '') : t === 'cinsiyet' ? 'kadin' : 'tumu' }); }} className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg">
                        <option value="kategori">Kategori</option>
                        <option value="cinsiyet">Cinsiyet</option>
                        <option value="ozel">Özel</option>
                      </select>
                      {c.type === 'kategori' && <select value={c.value} onChange={(e) => setChild(m.id, ci, { value: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg">{categories.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}</select>}
                      {c.type === 'cinsiyet' && <select value={c.value} onChange={(e) => setChild(m.id, ci, { value: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg">{[['kadin', 'Kadın'], ['erkek', 'Erkek'], ['cocuk', 'Çocuk'], ['unisex', 'Unisex']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
                      {c.type === 'ozel' && <select value={c.value} onChange={(e) => setChild(m.id, ci, { value: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg">{[['tumu', 'Tümü'], ['indirim', 'İndirimdekiler'], ['coksatan', 'Çok Satanlar'], ['yeni', 'Yeni'], ['sonsans', 'Son Şans']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
                      <button onClick={() => delChild(m.id, ci)} className="p-1 text-slate-400 hover:text-red-500"><X size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => addChild(m.id)} className="inline-flex items-center gap-1 text-xs text-indigo-600"><Plus size={13} /> Alt Menü Ekle</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Urun siralama + öne çıkar + indirim (sürükle-bırak) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-1">Vitrin Düzeni & Ürün Sıralaması</h3>
        <p className="text-xs text-slate-400 mb-3">Kartı sürükleyip bırakarak sırayı belirleyin. <Star size={11} className="inline text-amber-500" /> öne çıkar, <Percent size={11} className="inline text-rose-500" /> indirime al.</p>
        {ordered.length === 0 ? <p className="text-sm text-slate-400">Online mağazada gösterilecek ürün yok. Ürünlerim'de bir ürünün "Mağaza" rozetini açın.</p> : (
          <div className="space-y-2">
            {ordered.map((p, i) => {
              const ind = (p.eskiFiyat && p.eskiFiyat > p.satisFiyat) ? Math.round(((p.eskiFiyat - p.satisFiyat) / p.eskiFiyat) * 100) : 0;
              return (
              <div
                key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(p.id)}
                className={`flex items-center gap-3 border rounded-xl p-2 bg-white transition-shadow ${dragId === p.id ? 'border-indigo-400 shadow-md opacity-60' : 'border-slate-100 hover:border-slate-300'}`}
              >
                <GripVertical size={16} className="text-slate-300 cursor-grab shrink-0" />
                <span className="text-xs font-bold text-slate-400 w-5 text-center shrink-0">{i + 1}</span>
                <div className="relative shrink-0">
                  <img src={(p.images || [])[0] || ''} className="w-11 h-11 rounded-lg object-cover bg-slate-100" />
                  {ind > 0 && <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold px-1 rounded-full">%{ind}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{p.ad}</p>
                  <p className="text-xs text-slate-400">{ind > 0 ? <><span className="line-through text-slate-300 mr-1">{fmt(p.eskiFiyat)}</span><span className="text-rose-600 font-semibold">{fmt(p.satisFiyat)}</span></> : fmt(p.satisFiyat)}</p>
                </div>
                <button onClick={() => toggleOne(p)} title="Öne çıkar" className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${p.oneCikan ? 'bg-amber-50 border-amber-300 text-amber-500' : 'border-slate-200 text-slate-300 hover:text-amber-500'}`}><Star size={15} className={p.oneCikan ? 'fill-amber-400' : ''} /></button>
                <button onClick={() => openInd(p)} title="İndirime al" className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 flex items-center justify-center shrink-0"><Percent size={15} /></button>
                {ind > 0 && <button onClick={() => clearInd(p)} title="İndirimi kaldır" className="text-[10px] text-rose-500 underline shrink-0">kaldır</button>}
                <button onClick={() => removeFromStore(p)} title="Mağazadan kaldır" className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 flex items-center justify-center shrink-0"><Trash2 size={15} /></button>
                <div className="hidden sm:flex flex-col">
                  <button onClick={() => move(p.id, -1)} disabled={i === 0} className="p-0.5 text-slate-300 hover:text-indigo-600 disabled:opacity-30"><ArrowUp size={13} /></button>
                  <button onClick={() => move(p.id, 1)} disabled={i === ordered.length - 1} className="p-0.5 text-slate-300 hover:text-indigo-600 disabled:opacity-30"><ArrowDown size={13} /></button>
                </div>
              </div>
            ); })}
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

      {/* İndirime al modal */}
      {indModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setIndModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-800 flex items-center gap-2"><Percent size={16} className="text-rose-500" /> İndirime Al</h3><button onClick={() => setIndModal(null)}><X size={18} className="text-slate-400" /></button></div>
            <div className="flex items-center gap-3"><img src={(indModal.images || [])[0] || ''} className="w-12 h-12 rounded-lg object-cover bg-slate-100" /><p className="text-sm font-medium text-slate-700">{indModal.ad}</p></div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Liste / Eski Fiyat (üstü çizili gösterilir)</label>
              <input type="number" value={indForm.eskiFiyat} onChange={(e) => setIndForm({ ...indForm, eskiFiyat: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">İndirimli Satış Fiyatı</label>
              <input type="number" value={indForm.satisFiyat} onChange={(e) => setIndForm({ ...indForm, satisFiyat: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            {Number(indForm.eskiFiyat) > Number(indForm.satisFiyat) && Number(indForm.satisFiyat) > 0 && (
              <p className="text-xs text-rose-600 font-medium">İndirim: %{Math.round(((Number(indForm.eskiFiyat) - Number(indForm.satisFiyat)) / Number(indForm.eskiFiyat)) * 100)}</p>
            )}
            <button onClick={saveInd} className="w-full bg-rose-600 text-white py-2.5 rounded-lg font-medium hover:bg-rose-700">İndirimi Uygula</button>
            <p className="text-[11px] text-slate-400">Bu fiyat hem online mağazada hem ürün kartında geçerli olur.</p>
          </div>
        </div>
      )}
    </div>
  );
}
