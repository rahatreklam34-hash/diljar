import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Clock, Bell, MessageSquare, Info, Save } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';

interface TimerSettings {
  rezervSureDk: number;
  otomatikIptal: boolean;
  bildirimAktif: boolean;
  hatirlatmaDk: string;
  dekontHatirlatmaDk: string;
  siparisOnayMesaji: string;
  dekontIsteMesaji: string;
  kartOdemeMesaji: string;
  dekontAlindiMesaji: string;
  iptalMesaji: string;
  odemeOnayMesaji: string;
}

const DEFAULTS: TimerSettings = {
  rezervSureDk: 30,
  otomatikIptal: true,
  bildirimAktif: true,
  hatirlatmaDk: '10,20',
  dekontHatirlatmaDk: '5',
  siparisOnayMesaji: '',
  dekontIsteMesaji: '',
  kartOdemeMesaji: '',
  dekontAlindiMesaji: '',
  iptalMesaji: '',
  odemeOnayMesaji: '',
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
    </label>
  );
}

export default function ZamanlayiciBildirim() {
  const [form, setForm] = useState<TimerSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TimerSettings>(key: K, value: TimerSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/store/catalog-settings');
        const s = r.data?.settings;
        if (s) {
          setForm({
            rezervSureDk: s.rezervSureDk ?? 30,
            otomatikIptal: s.otomatikIptal ?? true,
            bildirimAktif: s.bildirimAktif ?? true,
            hatirlatmaDk: s.hatirlatmaDk || '10,20',
            dekontHatirlatmaDk: s.dekontHatirlatmaDk || '5',
            siparisOnayMesaji: s.siparisOnayMesaji || '',
            dekontIsteMesaji: s.dekontIsteMesaji || '',
            kartOdemeMesaji: s.kartOdemeMesaji || '',
            dekontAlindiMesaji: s.dekontAlindiMesaji || '',
            iptalMesaji: s.iptalMesaji || '',
            odemeOnayMesaji: s.odemeOnayMesaji || '',
          });
        }
      } catch (e: any) {
        toast.error(apiErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/store/catalog-settings', {
        ...form,
        rezervSureDk: Number(form.rezervSureDk) || 30,
      });
      toast.success('Ayarlar kaydedildi');
    } catch (e: any) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-7 h-7 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const inputCls = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400';

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-24">
      {/* Başlık */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Clock size={22} className="text-emerald-600" /> Zamanlayıcı & Bildirim Ayarları
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Rezerv süresi, otomatik iptal, ödeme hatırlatma ve WhatsApp bildirim şablonlarını buradan yönetin.
        </p>
      </div>

      {/* Kapsam bilgisi */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 text-blue-800">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p className="text-xs leading-relaxed">
          Bu ayarlar hem <b>katalog</b> hem de <b>online mağaza</b> talepleri için geçerlidir. Rezerv süresi her iki
          kanalda da aynı değeri kullanır.
        </p>
      </div>

      {/* Zamanlayıcı */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Clock size={16} className="text-emerald-600" /> Zamanlayıcı
        </h2>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Rezerv / Ödeme Süresi (dakika)</label>
          <input
            type="number"
            min={1}
            value={form.rezervSureDk}
            onChange={(e) => set('rezervSureDk', Number(e.target.value))}
            className={inputCls}
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Sipariş oluşturulduktan sonra ürünler bu süre boyunca müşteri için rezerve edilir. Süre dolunca ödeme
            yapılmamışsa (otomatik iptal açıksa) sipariş iptal edilir.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Otomatik İptal</p>
            <p className="text-[10px] text-slate-400">Rezerv süresi dolunca ödeme yapılmamış talepleri otomatik iptal et.</p>
          </div>
          <Toggle checked={form.otomatikIptal} onChange={(v) => set('otomatikIptal', v)} />
        </div>
      </div>

      {/* Ödeme Hatırlatma */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Bell size={16} className="text-emerald-600" /> Ödeme Hatırlatma
        </h2>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Ödeme Hatırlatma Zamanları (dakika, virgülle ayırın)</label>
          <input
            value={form.hatirlatmaDk}
            onChange={(e) => set('hatirlatmaDk', e.target.value)}
            placeholder="10,20"
            className={inputCls}
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Örn: "10,20" → Sipariş sonrası 10. ve 20. dakikada hatırlatma gönderilir.
          </p>
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Dekont Hatırlatma Zamanları (dakika, virgülle ayırın)</label>
          <input
            value={form.dekontHatirlatmaDk}
            onChange={(e) => set('dekontHatirlatmaDk', e.target.value)}
            placeholder="5"
            className={inputCls}
          />
          <p className="text-[10px] text-slate-400 mt-1">
            WhatsApp ile iletildikten sonra dekont gelmezse bu zamanlarda hatırlatma gönderilir.
          </p>
        </div>

        <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Not: Hatırlatma mesajlarının gönderilebilmesi için aşağıdaki <b>WhatsApp Bildirimleri</b> ayarının açık
          olması gerekir.
        </p>
      </div>

      {/* Bildirim */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <MessageSquare size={16} className="text-emerald-600" /> WhatsApp Bildirim
        </h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">WhatsApp Bildirimleri</p>
            <p className="text-[10px] text-slate-400">Sipariş, hatırlatma, iptal ve ödeme onay bildirimlerini gönder.</p>
          </div>
          <Toggle checked={form.bildirimAktif} onChange={(v) => set('bildirimAktif', v)} />
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            <b>Kullanılabilir değişkenler:</b>{' '}
            <code className="text-emerald-700">{'{talepNo}'}</code>{' '}
            <code className="text-emerald-700">{'{sipNo}'}</code>{' '}
            <code className="text-emerald-700">{'{musteri}'}</code>{' '}
            <code className="text-emerald-700">{'{araToplam}'}</code>{' '}
            <code className="text-emerald-700">{'{indirim}'}</code>{' '}
            <code className="text-emerald-700">{'{toplam}'}</code>{' '}
            <code className="text-emerald-700">{'{urunler}'}</code>{' '}
            <code className="text-emerald-700">{'{kalanDk}'}</code>{' '}
            <code className="text-emerald-700">{'{sepetLink}'}</code>
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Şablon boş bırakılırsa varsayılan mesaj kullanılır.</p>
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Sipariş Onay / Talep Mesajı</label>
          <textarea
            rows={4}
            value={form.siparisOnayMesaji}
            onChange={(e) => set('siparisOnayMesaji', e.target.value)}
            placeholder="Boş bırakılırsa varsayılan mesaj kullanılır"
            className={inputCls}
          />
          <p className="text-[10px] text-slate-400 mt-0.5">Sipariş talebi alındığında müşteriye gönderilir.</p>
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Ödeme Bekleniyor / Hatırlatma Mesajı</label>
          <textarea
            rows={3}
            value={form.dekontIsteMesaji}
            onChange={(e) => set('dekontIsteMesaji', e.target.value)}
            placeholder="Boş bırakılırsa varsayılan mesaj kullanılır"
            className={inputCls}
          />
          <p className="text-[10px] text-slate-400 mt-0.5">Ödeme/dekont bekleyen taleplere hatırlatma olarak gönderilir.</p>
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Kredi Kartı Yanıt Mesajı</label>
          <textarea
            rows={3}
            value={form.kartOdemeMesaji}
            onChange={(e) => set('kartOdemeMesaji', e.target.value)}
            placeholder="Boş bırakılırsa varsayılan mesaj kullanılır"
            className={inputCls}
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Dekont Alındı Mesajı</label>
          <textarea
            rows={3}
            value={form.dekontAlindiMesaji}
            onChange={(e) => set('dekontAlindiMesaji', e.target.value)}
            placeholder="Boş bırakılırsa varsayılan mesaj kullanılır"
            className={inputCls}
          />
          <p className="text-[10px] text-slate-400 mt-0.5">Müşteri dekont/medya gönderdiğinde otomatik giden yanıt.</p>
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Sipariş İptal Mesajı</label>
          <textarea
            rows={3}
            value={form.iptalMesaji}
            onChange={(e) => set('iptalMesaji', e.target.value)}
            placeholder="Boş bırakılırsa varsayılan mesaj kullanılır"
            className={inputCls}
          />
          <p className="text-[10px] text-slate-400 mt-0.5">Süre dolup otomatik iptal edildiğinde gönderilir.</p>
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Ödeme Onay Mesajı</label>
          <textarea
            rows={3}
            value={form.odemeOnayMesaji}
            onChange={(e) => set('odemeOnayMesaji', e.target.value)}
            placeholder="Boş bırakılırsa varsayılan mesaj kullanılır"
            className={inputCls}
          />
          <p className="text-[10px] text-slate-400 mt-0.5">Ödeme onaylandığında müşteriye gönderilir.</p>
        </div>
      </div>

      {/* Kaydet */}
      <div className="sticky bottom-4">
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700 disabled:opacity-50 shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
        >
          <Save size={16} /> {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
        </button>
      </div>
    </div>
  );
}
