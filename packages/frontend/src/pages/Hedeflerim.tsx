import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Hedef } from '../types';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import MoneyInput from '../components/MoneyInput';
import { Target, Plus, Pencil, Trash2, TrendingUp, Calendar, Award, Lightbulb, CheckCircle, DollarSign, ArrowRight } from 'lucide-react';

const KATEGORILER = ['Tasarruf', 'Yatirim', 'Borc Odeme', 'Arac', 'Ev', 'Tatil', 'Egitim', 'Diger'];
const KAT_COLORS: Record<string, string> = {
  Tasarruf: 'bg-green-50 text-green-600 border-green-200',
  Yatirim: 'bg-blue-50 text-blue-600 border-blue-200',
  'Borc Odeme': 'bg-red-50 text-red-600 border-red-200',
  Arac: 'bg-purple-50 text-purple-600 border-purple-200',
  Ev: 'bg-amber-50 text-amber-600 border-amber-200',
  Tatil: 'bg-pink-50 text-pink-600 border-pink-200',
  Egitim: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  Diger: 'bg-gray-100 text-gray-600 border-gray-200',
};
const KAT_BAR: Record<string, string> = {
  Tasarruf: 'bg-green-500', Yatirim: 'bg-blue-500', 'Borc Odeme': 'bg-red-500',
  Arac: 'bg-purple-500', Ev: 'bg-amber-500', Tatil: 'bg-pink-500', Egitim: 'bg-indigo-500', Diger: 'bg-gray-400',
};

const fmt = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const kalanGun = (bitisTarihi: string) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(bitisTarihi);
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / 86400000));
};

const emptyForm = { ad: '', hedefTutar: '', mevcutTutar: '', bitisTarihi: '', kategori: 'Tasarruf', durum: 'aktif' as Hedef['durum'] };

export default function Hedeflerim() {
  const { hedefler, addHedef, updateHedef, deleteHedef, hareketler, cekler } = useApp();

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Hedef | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [paraEkleItem, setParaEkleItem] = useState<Hedef | null>(null);
  const [paraEkleTutar, setParaEkleTutar] = useState('');
  const [form, setForm] = useState({ ...emptyForm });

  // KPIs
  const aktifSayisi = hedefler.filter(h => h.durum === 'aktif').length;
  const tamamlananSayisi = hedefler.filter(h => h.durum === 'tamamlandi').length;
  const toplamHedefTutar = hedefler.reduce((s, h) => s + h.hedefTutar, 0);
  const avgIlerleme = useMemo(() => {
    const aktif = hedefler.filter(h => h.durum === 'aktif');
    if (!aktif.length) return 0;
    return Math.round(aktif.reduce((s, h) => s + Math.min(100, (h.mevcutTutar / h.hedefTutar) * 100), 0) / aktif.length);
  }, [hedefler]);

  // AI Suggestions
  const suggestions = useMemo(() => {
    const tips: { icon: string; text: string; color: string }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Daily savings needed per active goal
    hedefler.filter(h => h.durum === 'aktif').forEach(h => {
      const gun = kalanGun(h.bitisTarihi);
      const kalan = h.hedefTutar - h.mevcutTutar;
      if (gun > 0 && kalan > 0) {
        tips.push({ icon: 'target', text: `"${h.ad}" hedefinize ulasmak icin gunluk ₺${fmt(Math.ceil(kalan / gun))} ayirmaniz gerekiyor (${gun} gun kaldi)`, color: 'text-blue-700 bg-blue-50 border-blue-200' });
      } else if (kalan <= 0) {
        tips.push({ icon: 'award', text: `"${h.ad}" hedefinize neredeyse ulastiniz! Harika gidiyorsunuz.`, color: 'text-green-700 bg-green-50 border-green-200' });
      }
    });

    // Upcoming checks (borc cekleri)
    const yaklasanCekler = cekler.filter(c => {
      if (c.durum !== 'bekleyen' || c.tip !== 'borc') return false;
      const diff = Math.round((new Date(c.vadeTarihi).getTime() - today.getTime()) / 86400000);
      return diff >= 0 && diff <= 30;
    });
    yaklasanCekler.forEach(c => {
      const diff = Math.round((new Date(c.vadeTarihi).getTime() - today.getTime()) / 86400000);
      if (diff > 0) tips.push({ icon: 'lightbulb', text: `Yaklasan cek odemesi (${c.kisiAd}, ₺${fmt(c.tutar)}) icin gunluk ₺${fmt(Math.ceil(c.tutar / diff))} ayirmaniz oneriliyor`, color: 'text-amber-700 bg-amber-50 border-amber-200' });
    });

    // Spending trend: compare last month vs month before
    const now2 = new Date();
    const thisMonth = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(now2.getFullYear(), now2.getMonth() - 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    const prevMonth = new Date(now2.getFullYear(), now2.getMonth() - 2);
    const prevMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    const giderBu = hareketler.filter(h => h.tip === 'gider' && h.tarih.startsWith(thisMonth)).reduce((s, h) => s + h.tutar, 0);
    const giderGecen = hareketler.filter(h => h.tip === 'gider' && h.tarih.startsWith(lastMonthStr)).reduce((s, h) => s + h.tutar, 0);
    const giderOnceki = hareketler.filter(h => h.tip === 'gider' && h.tarih.startsWith(prevMonthStr)).reduce((s, h) => s + h.tutar, 0);
    if (giderGecen > 0 && giderOnceki > 0) {
      const artis = Math.round(((giderGecen - giderOnceki) / giderOnceki) * 100);
      if (artis > 10) tips.push({ icon: 'trend', text: `Gecen aya gore giderleriniz %${artis} artti (${fmt(giderOnceki)} ₺ → ${fmt(giderGecen)} ₺). Tasarruf onerilir.`, color: 'text-red-700 bg-red-50 border-red-200' });
      else if (artis < -5) tips.push({ icon: 'trend', text: `Tebrikler! Giderlerinizi %${Math.abs(artis)} azalttiniz. Bu tasarrufu hedeflerinize yonlendirebilirsiniz.`, color: 'text-green-700 bg-green-50 border-green-200' });
    }
    if (giderBu > 0 && giderGecen > 0 && giderBu > giderGecen * 0.8) {
      tips.push({ icon: 'lightbulb', text: `Bu ay su ana kadar ₺${fmt(giderBu)} harcadiniz. Hedeflerinize odaklanmak icin harcamalarinizi gozden gecirin.`, color: 'text-purple-700 bg-purple-50 border-purple-200' });
    }

    // Motivational message
    if (tamamlananSayisi > 0) tips.push({ icon: 'award', text: `${tamamlananSayisi} hedef tamamlandi! Basarinizi kutluyoruz, yeni hedefler belirleyebilirsiniz.`, color: 'text-pink-700 bg-pink-50 border-pink-200' });
    if (aktifSayisi === 0 && tamamlananSayisi === 0) tips.push({ icon: 'target', text: 'Ilk finansal hedefinizi belirleyin ve tasarruf yolculugunuza baslayin!', color: 'text-blue-700 bg-blue-50 border-blue-200' });

    return tips.slice(0, 5);
  }, [hedefler, hareketler, cekler, aktifSayisi, tamamlananSayisi]);

  // Modal handlers
  const openCreate = () => { setForm({ ...emptyForm }); setEditItem(null); setModalOpen(true); };
  const openEdit = (h: Hedef) => {
    setEditItem(h);
    setForm({ ad: h.ad, hedefTutar: h.hedefTutar.toString(), mevcutTutar: h.mevcutTutar.toString(), bitisTarihi: h.bitisTarihi, kategori: h.kategori, durum: h.durum });
    setModalOpen(true);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ad: form.ad, hedefTutar: Number(form.hedefTutar), mevcutTutar: Number(form.mevcutTutar), bitisTarihi: form.bitisTarihi, kategori: form.kategori, durum: form.durum };
    if (editItem) updateHedef(editItem.id, payload); else addHedef(payload);
    setModalOpen(false);
  };
  const handleParaEkle = () => {
    if (!paraEkleItem || !paraEkleTutar) return;
    const yeniMevcut = paraEkleItem.mevcutTutar + Number(paraEkleTutar);
    const tamamlandi = yeniMevcut >= paraEkleItem.hedefTutar;
    updateHedef(paraEkleItem.id, { mevcutTutar: yeniMevcut, ...(tamamlandi ? { durum: 'tamamlandi' } : {}) });
    setParaEkleItem(null);
    setParaEkleTutar('');
  };

  const aktifHedefler = hedefler.filter(h => h.durum === 'aktif');
  const tamamlananlar = hedefler.filter(h => h.durum === 'tamamlandi');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Hedeflerim</h1>
          <p className="text-[11px] text-gray-400">Finansal hedeflerinizi belirleyin ve takip edin</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6c63ff] text-white rounded-lg text-xs font-medium hover:bg-[#5b54e6]">
          <Plus size={14} /> Yeni Hedef
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: <Target size={18} className="text-blue-500" />, bg: 'bg-blue-50', label: 'Aktif Hedef', value: aktifSayisi },
          { icon: <Award size={18} className="text-green-500" />, bg: 'bg-green-50', label: 'Tamamlanan', value: tamamlananSayisi },
          { icon: <DollarSign size={18} className="text-purple-500" />, bg: 'bg-purple-50', label: 'Toplam Hedef Tutar', value: `${fmt(toplamHedefTutar)} ₺` },
          { icon: <TrendingUp size={18} className="text-orange-500" />, bg: 'bg-orange-50', label: 'Ilerleme Orani', value: `%${avgIlerleme}` },
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>{c.icon}</div>
              <div><p className="text-[9px] text-gray-400">{c.label}</p><p className="text-lg font-bold text-gray-800">{c.value}</p></div>
            </div>
          </div>
        ))}
      </div>

      {/* Active Goals Grid */}
      {aktifHedefler.length > 0 && (
        <div>
          <h2 className="text-[12px] font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Target size={13} className="text-[#6c63ff]" /> Aktif Hedefler</h2>
          <div className="grid grid-cols-3 gap-4">
            {aktifHedefler.map(h => {
              const pct = Math.min(100, Math.round((h.mevcutTutar / h.hedefTutar) * 100));
              const kalan = h.hedefTutar - h.mevcutTutar;
              const gun = kalanGun(h.bitisTarihi);
              const barColor = KAT_BAR[h.kategori] || KAT_BAR.Diger;
              const katColor = KAT_COLORS[h.kategori] || KAT_COLORS.Diger;
              return (
                <div key={h.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 relative overflow-hidden">
                  {pct >= 100 && (
                    <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center z-10 rounded-xl">
                      <CheckCircle size={40} className="text-green-500 opacity-60" />
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-[12px] font-semibold text-gray-800 truncate">{h.ad}</p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${katColor} mt-0.5`}>{h.kategori}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setParaEkleItem(h); setParaEkleTutar(''); }} title="Para Ekle" className="p-1 text-green-500 hover:bg-green-50 rounded"><DollarSign size={13} /></button>
                      <button onClick={() => openEdit(h)} className="p-1 text-gray-400 hover:text-amber-500 rounded"><Pencil size={12} /></button>
                      <button onClick={() => setDeleteId(h.id)} className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 size={12} /></button>
                    </div>
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between text-[9px] text-gray-400 mb-1">
                      <span>{fmt(h.mevcutTutar)} ₺</span><span>{fmt(h.hedefTutar)} ₺</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] font-bold text-[#6c63ff] mt-1">{pct}% tamamlandi</p>
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-gray-500">
                    <span className="flex items-center gap-1"><ArrowRight size={9} />Kalan: <strong className="text-gray-700">₺{fmt(Math.max(0, kalan))}</strong></span>
                    <span className="flex items-center gap-1"><Calendar size={9} /><strong className={gun <= 7 ? 'text-red-500' : 'text-gray-700'}>{gun} gun</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed Goals */}
      {tamamlananlar.length > 0 && (
        <div>
          <h2 className="text-[12px] font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Award size={13} className="text-green-500" /> Tamamlanan Hedefler</h2>
          <div className="grid grid-cols-3 gap-3">
            {tamamlananlar.map(h => (
              <div key={h.id} className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
                <CheckCircle size={24} className="text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-gray-800 truncate">{h.ad}</p>
                  <p className="text-[9px] text-green-600">{fmt(h.hedefTutar)} ₺ — {h.kategori}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(h)} className="p-1 text-gray-400 hover:text-amber-500 rounded"><Pencil size={11} /></button>
                  <button onClick={() => setDeleteId(h.id)} className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hedefler.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 flex flex-col items-center gap-3 text-center">
          <Target size={40} className="text-gray-300" />
          <p className="text-gray-500 text-sm font-medium">Henuz hedef eklenmedi</p>
          <p className="text-gray-400 text-xs">Ilk finansal hedefinizi ekleyin ve ilerlemenizi takip edin.</p>
          <button onClick={openCreate} className="mt-2 flex items-center gap-1.5 px-4 py-2 bg-[#6c63ff] text-white rounded-lg text-xs font-medium hover:bg-[#5b54e6]"><Plus size={13} /> Hedef Ekle</button>
        </div>
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h2 className="text-[12px] font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Lightbulb size={14} className="text-amber-500" /> Oneriler ve Tavsiyeler</h2>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg border text-[11px] ${s.color}`}>
                {s.icon === 'target' && <Target size={13} className="shrink-0 mt-0.5" />}
                {s.icon === 'award' && <Award size={13} className="shrink-0 mt-0.5" />}
                {s.icon === 'lightbulb' && <Lightbulb size={13} className="shrink-0 mt-0.5" />}
                {s.icon === 'trend' && <TrendingUp size={13} className="shrink-0 mt-0.5" />}
                <span>{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Hedef Duzenle' : 'Yeni Hedef'} size="md">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-1">Hedef Adi</label>
            <input required value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} placeholder="orn. Acil Fon, Yeni Araba..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Hedef Tutar (₺)</label>
              <MoneyInput value={form.hedefTutar} onChange={v => setForm({ ...form, hedefTutar: v })} required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Mevcut Tutar (₺)</label>
              <MoneyInput value={form.mevcutTutar} onChange={v => setForm({ ...form, mevcutTutar: v })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Bitis Tarihi</label>
              <input required type="date" value={form.bitisTarihi} onChange={e => setForm({ ...form, bitisTarihi: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Kategori</label>
              <select value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
                {KATEGORILER.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
          {editItem && (
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Durum</label>
              <select value={form.durum} onChange={e => setForm({ ...form, durum: e.target.value as Hedef['durum'] })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
                <option value="aktif">Aktif</option>
                <option value="tamamlandi">Tamamlandi</option>
              </select>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Iptal</button>
            <button type="submit" className="px-5 py-2 text-sm bg-[#6c63ff] text-white rounded-lg hover:bg-[#5b54e6]">{editItem ? 'Guncelle' : 'Kaydet'}</button>
          </div>
        </form>
      </Modal>

      {/* Para Ekle Modal */}
      {paraEkleItem && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setParaEkleItem(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 mb-1">{paraEkleItem.ad}</h3>
            <p className="text-[10px] text-gray-400 mb-4">Mevcut: ₺{fmt(paraEkleItem.mevcutTutar)} / Hedef: ₺{fmt(paraEkleItem.hedefTutar)}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">Eklenecek Tutar (₺)</label>
                <MoneyInput value={paraEkleTutar} onChange={setParaEkleTutar} required autoFocus className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" />
              </div>
              {paraEkleTutar && Number(paraEkleTutar) > 0 && (
                <p className="text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded">
                  Yeni toplam: ₺{fmt(paraEkleItem.mevcutTutar + Number(paraEkleTutar))}
                  {paraEkleItem.mevcutTutar + Number(paraEkleTutar) >= paraEkleItem.hedefTutar && ' — Hedef tamamlandi!'}
                </p>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setParaEkleItem(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Iptal</button>
                <button onClick={handleParaEkle} disabled={!paraEkleTutar || Number(paraEkleTutar) <= 0} className="px-5 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">Ekle</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteHedef(deleteId); setDeleteId(null); }}
        title="Hedef Sil"
        message="Bu hedifi silmek istediginizden emin misiniz? Bu islem geri alinamaz."
      />
    </div>
  );
}
