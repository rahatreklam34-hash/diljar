import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Save, FileText, Info, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import ImageDropzone from '../components/ImageDropzone';

const RENK_PRESET: { ad: string; hex: string }[] = [
  { ad: 'Siyah', hex: '#111827' }, { ad: 'Beyaz', hex: '#f8fafc' }, { ad: 'Lacivert', hex: '#1e3a5f' },
  { ad: 'Gri', hex: '#9ca3af' }, { ad: 'Kırmızı', hex: '#dc2626' }, { ad: 'Mavi', hex: '#2563eb' },
  { ad: 'Yeşil', hex: '#16a34a' }, { ad: 'Pembe', hex: '#ec4899' }, { ad: 'Bej', hex: '#e7d3b3' }, { ad: 'Kahve', hex: '#78350f' },
];
const hexOf = (ad: string) => RENK_PRESET.find((r) => r.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))?.hex || '#cbd5e1';

export default function UrunEkle() {
  const { products, categories, brands, reload } = useStore();
  const nav = useNavigate();

  const markalar = useMemo(() => (Array.from(new Set((brands || []).filter((b: any) => b.aktif !== false).map((b: any) => b.ad).filter(Boolean))) as string[]).sort((a, b) => a.localeCompare(b, 'tr')), [brands]);
  const lokasyonlar = useMemo(() => Array.from(new Set(products.map((p: any) => p.lokasyon).filter(Boolean))).sort() as string[], [products]);
  const tedarikciler = useMemo(() => Array.from(new Set(products.map((p: any) => p.tedarikciAd).filter(Boolean))).sort() as string[], [products]);

  const [f, setF] = useState({
    ad: '', sku: '', kategoriId: '', marka: '', barkod: '', salesCode: '', aciklama: '',
    cinsiyet: 'unisex',
    satisFiyat: '', eskiFiyat: '', alisFiyat: '', stokAdeti: '', minStok: '', birim: 'Adet',
    lokasyon: '', tedarikciAd: '', etiketler: '', not: '', aktif: true,
  });
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  const [images, setImages] = useState<string[]>([]);

  const [varTip, setVarTip] = useState<'beden' | 'beden_renk' | 'renk'>('beden');
  const [renkler, setRenkler] = useState<string[]>(['Siyah', 'Beyaz', 'Lacivert', 'Gri']);
  const [bedenler, setBedenler] = useState<string[]>(['S', 'M', 'L', 'XL']);
  const [yeniRenk, setYeniRenk] = useState('');
  const [yeniBeden, setYeniBeden] = useState('');
  // matris[beden][renk] = stok
  const [matris, setMatris] = useState<Record<string, Record<string, string>>>({});
  const mv = (b: string, r: string) => matris[b]?.[r] ?? '';
  const setMv = (b: string, r: string, v: string) => setMatris((m) => ({ ...m, [b]: { ...(m[b] || {}), [r]: v } }));
  // tek boyut (sadece beden veya sadece renk) stokları
  const [tekStok, setTekStok] = useState<Record<string, string>>({});

  const addRenk = () => { const v = yeniRenk.trim(); if (v && !renkler.includes(v)) setRenkler([...renkler, v]); setYeniRenk(''); };
  const addBeden = () => { const v = yeniBeden.trim(); if (v && !bedenler.includes(v)) setBedenler([...bedenler, v]); setYeniBeden(''); };

  const buildVariations = () => {
    const out: { ad: string; deger: string; stok: number }[] = [];
    if (varTip === 'beden_renk') {
      for (const b of bedenler) for (const r of renkler) {
        const stok = Number(mv(b, r)) || 0;
        if (stok > 0) out.push({ ad: 'Beden + Renk', deger: `${b} / ${r}`, stok });
      }
    } else if (varTip === 'beden') {
      for (const b of bedenler) { const stok = Number(tekStok[b]) || 0; if (stok > 0 || bedenler.length) out.push({ ad: 'Beden', deger: b, stok }); }
    } else {
      for (const r of renkler) { const stok = Number(tekStok[r]) || 0; if (stok > 0 || renkler.length) out.push({ ad: 'Renk', deger: r, stok }); }
    }
    return out.filter((v) => v.deger);
  };

  const doSave = async (taslak: boolean) => {
    if (!f.ad.trim()) { toast.error('Ürün adı zorunlu'); return; }
    if (!f.kategoriId) { toast.error('Kategori seçiniz'); return; }
    if (images.length === 0) { toast.error('En az 1 görsel ekleyin'); return; }
    const variations = buildVariations();
    const stokAdeti = variations.length ? variations.reduce((s, v) => s + v.stok, 0) : (Number(f.stokAdeti) || 0);
    const body: any = {
      ad: f.ad.trim(), sku: f.sku || null, salesCode: f.salesCode || null, barkod: f.barkod || null,
      marka: f.marka || null, cinsiyet: f.cinsiyet || 'unisex', kategoriId: f.kategoriId || null,
      alisFiyat: Number(f.alisFiyat) || 0, satisFiyat: Number(f.satisFiyat) || 0,
      eskiFiyat: f.eskiFiyat ? Number(f.eskiFiyat) : null, kdv: 10,
      stokAdeti, aciklama: f.aciklama || null, tedarikciAd: f.tedarikciAd || null,
      lokasyon: f.lokasyon || 'Depo', images, variations,
      aktif: taslak ? false : !!f.aktif, onlineMagaza: false,
    };
    try {
      await api.post('/store/products', body);
      toast.success(taslak ? 'Taslak olarak kaydedildi' : 'Ürün kaydedildi ve yayınlandı');
      reload();
      nav('/depo/urunlerim');
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400';
  const label = (t: string, req = false) => <label className="block text-xs text-slate-500 mb-1.5">{t}{req && <span className="text-rose-500"> *</span>}</label>;
  const Card = ({ no, title, sub, right, children }: any) => (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div><h3 className="font-semibold text-slate-800"><span className="text-emerald-600 mr-1.5">{no}.</span>{title}</h3>{sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </div>
  );

  const renkAktif = varTip === 'renk' || varTip === 'beden_renk';
  const bedenAktif = varTip === 'beden' || varTip === 'beden_renk';

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Yeni Ürün Ekle</h1>
          <p className="text-sm text-slate-500">Ürününüzü sisteme ekleyin.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => doSave(true)} className="px-4 py-2.5 text-sm font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"><FileText size={16} /> Taslak Olarak Kaydet</button>
          <button onClick={() => doSave(false)} className="px-4 py-2.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1.5"><Save size={16} /> Kaydet ve Yayınla</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        {/* 1. Temel Bilgiler */}
        <Card no={1} title="Temel Bilgiler">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>{label('Ürün Adı', true)}<input value={f.ad} onChange={(e) => set('ad', e.target.value)} placeholder="Ürün adını giriniz" className={inputCls} /></div>
            <div>{label('SKU (Stok Kodu)')}<input value={f.sku} onChange={(e) => set('sku', e.target.value)} placeholder="Stok kodunu giriniz" className={inputCls} /></div>
            <div>{label('Kategori', true)}
              <select value={f.kategoriId} onChange={(e) => set('kategoriId', e.target.value)} className={inputCls}>
                <option value="">Kategori seçiniz</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.ad}</option>)}
              </select>
            </div>
            <div>{label('Marka')}<select value={f.marka} onChange={(e) => set('marka', e.target.value)} className={inputCls}><option value="">Marka seçiniz</option>{markalar.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
            <div>{label('Cinsiyet')}<select value={f.cinsiyet} onChange={(e) => set('cinsiyet', e.target.value)} className={inputCls}>{[['kadin', 'Kadın'], ['erkek', 'Erkek'], ['unisex', 'Unisex'], ['cocuk', 'Çocuk']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
            <div>{label('Barkod (EAN)')}<input value={f.barkod} onChange={(e) => set('barkod', e.target.value)} placeholder="Barkod numarası (opsiyonel)" className={inputCls} /></div>
            <div>{label('Satış Kodu')}<input value={f.salesCode} onChange={(e) => set('salesCode', e.target.value)} placeholder="Satış kodu (opsiyonel)" className={inputCls} /></div>
          </div>
          <div className="mt-4">{label('Ürün Açıklaması')}<textarea value={f.aciklama} maxLength={1000} onChange={(e) => set('aciklama', e.target.value)} rows={4} placeholder="Ürün açıklamasını giriniz..." className={inputCls} /><p className="text-[11px] text-slate-400 text-right mt-1">{f.aciklama.length}/1000</p></div>
        </Card>

        {/* 2. Görseller */}
        <Card no={2} title="Ürün Görselleri" sub="En az 1 görsel ekleyin.">
          <ImageDropzone images={images} onChange={setImages} max={5} onEnhance={async (src: string) => { const r = await api.post('/store/enhance-image', { image: src }); return r.data.image as string; }} />
        </Card>

        {/* 3. Fiyat ve Stok */}
        <Card no={3} title="Fiyat ve Stok Bilgileri">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>{label('Satış Fiyatı', true)}<div className="relative"><span className="absolute left-3 top-2.5 text-slate-400 text-sm">₺</span><input value={f.satisFiyat} onChange={(e) => set('satisFiyat', e.target.value)} placeholder="0,00" className={inputCls + ' pl-7'} /></div></div>
            <div>{label('İndirimli / Eski Fiyat')}<div className="relative"><span className="absolute left-3 top-2.5 text-slate-400 text-sm">₺</span><input value={f.eskiFiyat} onChange={(e) => set('eskiFiyat', e.target.value)} placeholder="0,00" className={inputCls + ' pl-7'} /></div></div>
            <div>{label('Maliyet Fiyatı')}<div className="relative"><span className="absolute left-3 top-2.5 text-slate-400 text-sm">₺</span><input value={f.alisFiyat} onChange={(e) => set('alisFiyat', e.target.value)} placeholder="0,00" className={inputCls + ' pl-7'} /></div></div>
            <div>{label('Stok Miktarı')}<input value={f.stokAdeti} onChange={(e) => set('stokAdeti', e.target.value)} placeholder="0" className={inputCls} disabled={varTip !== 'beden' ? false : false} /><p className="text-[11px] text-slate-400 mt-1">Varyasyon girilirse stok otomatik toplanır.</p></div>
            <div>{label('Min. Stok Seviyesi')}<input value={f.minStok} onChange={(e) => set('minStok', e.target.value)} placeholder="0" className={inputCls} /></div>
            <div>{label('Birim')}<select value={f.birim} onChange={(e) => set('birim', e.target.value)} className={inputCls}>{['Adet', 'Çift', 'Kutu', 'Paket', 'Kg', 'Metre'].map((b) => <option key={b}>{b}</option>)}</select></div>
          </div>
          <label className="mt-4 inline-flex items-center gap-2.5 cursor-pointer">
            <button type="button" onClick={() => set('aktif', !f.aktif)} className={`relative w-10 h-5 rounded-full transition-colors ${f.aktif ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${f.aktif ? 'translate-x-5' : 'translate-x-0.5'}`} /></button>
            <span className="text-sm text-slate-700 font-medium">Ürün Aktif</span><span className="text-xs text-slate-400">Evet, bu ürünü aktif olarak satışa aç.</span>
          </label>
        </Card>

        {/* 4. Renk ve Varyasyon */}
        <Card no={4} title="Renk ve Varyasyon Bilgileri">
          <label className="block text-xs text-slate-500 mb-2">Renk Seçenekleri</label>
          <div className="flex flex-wrap gap-2 mb-4">
            {renkler.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 border border-slate-200 rounded-full pl-1.5 pr-2 py-1 text-sm">
                <span className="w-4 h-4 rounded-full border border-slate-200" style={{ background: hexOf(r) }} />{r}
                <button onClick={() => setRenkler(renkler.filter((x) => x !== r))} className="text-slate-400 hover:text-rose-500"><X size={13} /></button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <input value={yeniRenk} onChange={(e) => setYeniRenk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addRenk()} list="renkpreset" placeholder="Renk" className="w-24 border border-slate-200 rounded-full px-3 py-1 text-sm" />
              <datalist id="renkpreset">{RENK_PRESET.map((r) => <option key={r.ad} value={r.ad} />)}</datalist>
              <button onClick={addRenk} className="w-7 h-7 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-emerald-400 hover:text-emerald-600 inline-flex items-center justify-center"><Plus size={14} /></button>
            </span>
          </div>
          <label className="block text-xs text-slate-500 mb-2">Varyasyon Tipi</label>
          <div className="flex flex-wrap gap-4">
            {([['beden', 'Beden'], ['beden_renk', 'Beden + Renk'], ['renk', 'Renk']] as const).map(([v, t]) => (
              <label key={v} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="vartip" checked={varTip === v} onChange={() => setVarTip(v)} className="accent-emerald-600" />{t}
              </label>
            ))}
          </div>
        </Card>

        {/* 5. Varyasyon stok */}
        <Card no={5} title={varTip === 'renk' ? 'Renk Varyasyonları ve Stok' : varTip === 'beden' ? 'Beden Varyasyonları ve Stok' : 'Beden & Renk Stokları'}
          right={bedenAktif ? (
            <div className="flex items-center gap-1">
              <input value={yeniBeden} onChange={(e) => setYeniBeden(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addBeden()} placeholder="Beden" className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm" />
              <button onClick={addBeden} className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1"><Plus size={13} /> Beden Ekle</button>
            </div>
          ) : null}>
          {varTip === 'beden_renk' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th className="px-2 py-2">Beden</th>{renkler.map((r) => <th key={r} className="px-2 py-2"><span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-slate-200" style={{ background: hexOf(r) }} />{r}</span></th>)}<th /></tr></thead>
                <tbody>
                  {bedenler.map((b) => (
                    <tr key={b} className="border-t border-slate-50">
                      <td className="px-2 py-2 font-medium text-slate-700">{b}</td>
                      {renkler.map((r) => <td key={r} className="px-2 py-2"><input value={mv(b, r)} onChange={(e) => setMv(b, r, e.target.value)} placeholder="0" className="w-16 border border-slate-200 rounded px-2 py-1 text-sm" /></td>)}
                      <td className="px-2 py-2"><button onClick={() => setBedenler(bedenler.filter((x) => x !== b))} className="text-rose-400 hover:text-rose-600"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-2">
              {(varTip === 'beden' ? bedenler : renkler).map((d) => (
                <div key={d} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-slate-700 inline-flex items-center gap-1.5">{varTip === 'renk' && <span className="w-3 h-3 rounded-full border border-slate-200" style={{ background: hexOf(d) }} />}{d}</span>
                  <input value={tekStok[d] || ''} onChange={(e) => setTekStok((s) => ({ ...s, [d]: e.target.value }))} placeholder="0" className="w-24 border border-slate-200 rounded px-2 py-1 text-sm" />
                  <button onClick={() => (varTip === 'beden' ? setBedenler(bedenler.filter((x) => x !== d)) : setRenkler(renkler.filter((x) => x !== d)))} className="text-rose-400 hover:text-rose-600"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 6. Ek Bilgiler */}
        <Card no={6} title="Ek Bilgiler" sub="(Opsiyonel)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>{label('Lokasyon')}<input list="lokasyonlar" value={f.lokasyon} onChange={(e) => set('lokasyon', e.target.value)} placeholder="Lokasyon seçiniz" className={inputCls} /><datalist id="lokasyonlar">{lokasyonlar.map((l) => <option key={l} value={l} />)}</datalist></div>
            <div>{label('Tedarikçi')}<input list="tedarikciler" value={f.tedarikciAd} onChange={(e) => set('tedarikciAd', e.target.value)} placeholder="Tedarikçi seçiniz" className={inputCls} /><datalist id="tedarikciler">{tedarikciler.map((t) => <option key={t} value={t} />)}</datalist></div>
          </div>
          <div className="mt-4">{label('Etiketler')}<input value={f.etiketler} onChange={(e) => set('etiketler', e.target.value)} placeholder="Etiket ekleyin (virgülle ayırın)" className={inputCls} /></div>
          <div className="mt-4">{label('Not')}<textarea value={f.not} onChange={(e) => set('not', e.target.value)} rows={2} placeholder="Not ekleyin..." className={inputCls} /></div>
        </Card>
      </div>

      <div className="mt-5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700 inline-flex items-center gap-2"><Info size={16} /> Zorunlu alanlar <span className="text-rose-500">*</span> ile gösterilmiştir.</div>
    </div>
  );
}
