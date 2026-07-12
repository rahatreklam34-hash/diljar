import { useState, useEffect, useMemo } from 'react';
import {
  Bot, MessageCircle, Plus, Trash2, Pencil, Power, Wifi, WifiOff,
  Clock, Sparkles, Copy, RefreshCw, Save, MessageSquare, ListOrdered, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import Modal from '../components/Modal';

// Instagram Messaging otomatik yanit / karsilama (sanal asistan) paneli.
// YALNIZCA resmi Meta Graph API (webhook + Send API). Chrome/DOM otomasyonu YOK.

const WEBHOOK_URL = 'https://diljar.com/api/v1/instagram/webhook';

interface KuralForm {
  id?: string;
  tip: string; // dm | yorum
  anahtarKelimeler: string;
  yanitMetni: string;
  aktif: boolean;
  oncelik: number;
}
const EMPTY_KURAL: KuralForm = { tip: 'dm', anahtarKelimeler: '', yanitMetni: '', aktif: true, oncelik: 0 };

export default function IgOtoYanit() {
  const { igRules, igOtoAyar, igMesajLog, reload } = useStore();

  // Ayar durumu (bootstrap'tan gelir; kaydedince reload)
  const [ayar, setAyar] = useState<any>(igOtoAyar || {});
  const [baglanti, setBaglanti] = useState<{ hasToken: boolean; hasUserId: boolean; igUserId: string | null }>({ hasToken: false, hasUserId: false, igUserId: null });
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [savingAyar, setSavingAyar] = useState(false);

  // Kural modal
  const [kuralForm, setKuralForm] = useState<KuralForm | null>(null);

  useEffect(() => { setAyar(igOtoAyar || {}); }, [igOtoAyar]);

  // Baglanti durumu + verify token ayrica cek (bootstrap sadece kurallari/ayari getirir)
  const loadSettings = async () => {
    try {
      const r = await api.get('/store/ig-oto-settings');
      setAyar(r.data?.ayar || {});
      setBaglanti(r.data?.baglanti || { hasToken: false, hasUserId: false, igUserId: null });
      setVerifyToken(r.data?.webhookVerifyToken || null);
    } catch { /* */ }
  };
  useEffect(() => { loadSettings(); /* eslint-disable-next-line */ }, []);

  const dmKurallar = useMemo(() => (igRules || []).filter((k: any) => k.tip === 'dm'), [igRules]);
  const yorumKurallar = useMemo(() => (igRules || []).filter((k: any) => k.tip === 'yorum'), [igRules]);

  // ── Ayar kaydet ──
  const patchAyar = async (patch: any) => {
    const next = { ...ayar, ...patch };
    setAyar(next);
    setSavingAyar(true);
    try {
      await api.put('/store/ig-oto-settings', patch);
      reload();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setSavingAyar(false); }
  };

  // ── Verify token uret ──
  const genVerifyToken = async () => {
    try {
      const r = await api.post('/store/ig-oto-settings/verify-token', {});
      setVerifyToken(r.data?.webhookVerifyToken || null);
      toast.success('Dogrulama token uretildi');
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const copy = (txt: string) => { navigator.clipboard?.writeText(txt); toast.success('Kopyalandi'); };

  // ── Kural CRUD ──
  const saveKural = async () => {
    if (!kuralForm) return;
    if (!kuralForm.yanitMetni.trim()) { toast.error('Yanit metni gerekli'); return; }
    const payload = {
      tip: kuralForm.tip,
      anahtarKelimeler: kuralForm.anahtarKelimeler.trim() || null,
      yanitMetni: kuralForm.yanitMetni,
      aktif: kuralForm.aktif,
      oncelik: Number(kuralForm.oncelik) || 0,
    };
    try {
      if (kuralForm.id) await api.patch(`/store/ig-rules/${kuralForm.id}`, payload);
      else await api.post('/store/ig-rules', payload);
      setKuralForm(null); reload(); toast.success('Kaydedildi');
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const delKural = async (id: string) => {
    if (!confirm('Kural silinsin mi?')) return;
    try { await api.delete(`/store/ig-rules/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const toggleKural = async (k: any) => {
    try { await api.patch(`/store/ig-rules/${k.id}`, { aktif: !k.aktif }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const modulAktif = !!ayar?.aktif;
  const connected = baglanti.hasToken && baglanti.hasUserId;

  const KuralTablosu = ({ liste, baslik }: { liste: any[]; baslik: string }) => (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          {baslik === 'DM Kurallari' ? <MessageSquare size={16} className="text-emerald-500" /> : <MessageCircle size={16} className="text-emerald-500" />}
          {baslik} <span className="text-xs font-normal text-slate-400">({liste.length})</span>
        </h3>
        <button
          onClick={() => setKuralForm({ ...EMPTY_KURAL, tip: baslik === 'DM Kurallari' ? 'dm' : 'yorum' })}
          className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          <Plus size={15} /> Kural Ekle
        </button>
      </div>
      {liste.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">Henuz kural yok. Anahtar kelime bos birakilirsa tum mesajlara yanit verilir.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {liste.map((k: any) => (
            <div key={k.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50">
              <button onClick={() => toggleKural(k)} title={k.aktif ? 'Aktif' : 'Pasif'} className={`mt-0.5 shrink-0 ${k.aktif ? 'text-emerald-500' : 'text-slate-300'}`}>
                <Power size={18} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {k.anahtarKelimeler
                    ? String(k.anahtarKelimeler).split(',').map((kw: string, i: number) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">{kw.trim()}</span>
                      ))
                    : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Tum mesajlar / karsilama</span>}
                  <span className="text-[11px] text-slate-400">oncelik: {k.oncelik ?? 0}</span>
                </div>
                <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap break-words">{k.yanitMetni}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setKuralForm({ id: k.id, tip: k.tip, anahtarKelimeler: k.anahtarKelimeler || '', yanitMetni: k.yanitMetni || '', aktif: !!k.aktif, oncelik: k.oncelik ?? 0 })} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"><Pencil size={15} /></button>
                <button onClick={() => delKural(k.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Baslik + modul toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
            <Bot size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Instagram Oto-Yanit</h1>
            <p className="text-sm text-slate-500">DM ve yorumlara otomatik karsilama & yanit (resmi Meta Graph API)</p>
          </div>
        </div>
        <button
          onClick={() => patchAyar({ aktif: !modulAktif })}
          disabled={savingAyar}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${modulAktif ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
        >
          <Power size={18} /> {modulAktif ? 'Modul Aktif' : 'Modul Pasif'}
        </button>
      </div>

      {/* Baglanti durumu */}
      <div className={`rounded-2xl border p-4 flex items-center gap-3 ${connected ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        {connected ? <Wifi size={22} className="text-emerald-600" /> : <WifiOff size={22} className="text-amber-600" />}
        <div className="flex-1">
          <p className={`text-sm font-medium ${connected ? 'text-emerald-700' : 'text-amber-700'}`}>
            {connected ? 'Instagram hesabi bagli' : 'Instagram hesabi henuz bagli degil'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {connected
              ? `Baglı hesap ID: ${baglanti.igUserId}`
              : 'Canli Yayin Satis ekraninda Instagram hesabinizi baglayin (token & hesap ID kaydedilir). Oto-yanit ayni token ile calisir.'}
          </p>
        </div>
      </div>

      {/* Karsilama + Calisma saati disi ayarlari */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Karsilama */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2"><Sparkles size={16} className="text-emerald-500" /> Karsilama Mesaji</h3>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={!!ayar?.karsilamaAktif} onChange={(e) => patchAyar({ karsilamaAktif: e.target.checked })} className="rounded text-emerald-600 focus:ring-emerald-500" />
              <span className="text-slate-500">Aktif</span>
            </label>
          </div>
          <p className="text-xs text-slate-400">Kural eslesmeyen ilk DM'lere gonderilir.</p>
          <textarea
            value={ayar?.karsilamaMetni || ''}
            onChange={(e) => setAyar({ ...ayar, karsilamaMetni: e.target.value })}
            onBlur={(e) => patchAyar({ karsilamaMetni: e.target.value })}
            rows={3}
            placeholder="Merhaba! Mesajiniz icin tesekkurler, en kisa surede donus yapacagiz."
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
          />
        </div>

        {/* Calisma saati disi */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2"><Clock size={16} className="text-emerald-500" /> Calisma Saati Disi</h3>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={!!ayar?.calismaSaatDisiAktif} onChange={(e) => patchAyar({ calismaSaatDisiAktif: e.target.checked })} className="rounded text-emerald-600 focus:ring-emerald-500" />
              <span className="text-slate-500">Aktif</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input type="time" value={ayar?.calismaBasSaat || ''} onChange={(e) => patchAyar({ calismaBasSaat: e.target.value })} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-emerald-500" />
            <span className="text-slate-400 text-sm">-</span>
            <input type="time" value={ayar?.calismaBitSaat || ''} onChange={(e) => patchAyar({ calismaBitSaat: e.target.value })} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-emerald-500" />
            <span className="text-xs text-slate-400">calisma araligi</span>
          </div>
          <textarea
            value={ayar?.calismaSaatDisiMetni || ''}
            onChange={(e) => setAyar({ ...ayar, calismaSaatDisiMetni: e.target.value })}
            onBlur={(e) => patchAyar({ calismaSaatDisiMetni: e.target.value })}
            rows={2}
            placeholder="Su an mesai saatleri disindayiz. Mesai saatlerinde size donus yapacagiz."
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
          />
        </div>
      </div>

      {/* Kural listeleri */}
      <KuralTablosu liste={dmKurallar} baslik="DM Kurallari" />
      <KuralTablosu liste={yorumKurallar} baslik="Yorum Kurallari" />

      {/* Webhook kurulum bilgisi */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2"><Info size={16} className="text-emerald-500" /> Meta Webhook Kurulum Bilgisi</h3>
        <p className="text-xs text-slate-500">
          Meta for Developers uygulamanizda (App Dashboard &rarr; Webhooks &rarr; Instagram) asagidaki bilgileri girin.
          Ardindan <code className="px-1 bg-slate-200 rounded">messages</code> ve <code className="px-1 bg-slate-200 rounded">comments</code> alanlarina abone olun.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Callback URL</label>
            <div className="flex items-center gap-2 mt-1">
              <input readOnly value={WEBHOOK_URL} className="flex-1 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-600" />
              <button onClick={() => copy(WEBHOOK_URL)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"><Copy size={16} /></button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Verify Token</label>
            <div className="flex items-center gap-2 mt-1">
              <input readOnly value={verifyToken || '(henuz uretilmedi)'} className="flex-1 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-600" />
              {verifyToken && <button onClick={() => copy(verifyToken)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"><Copy size={16} /></button>}
              <button onClick={genVerifyToken} className="inline-flex items-center gap-1 text-sm px-3 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-800">
                <RefreshCw size={15} /> {verifyToken ? 'Yenile' : 'Uret'}
              </button>
            </div>
          </div>
        </div>
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <strong>Gerekli Meta izinleri:</strong> DM yaniti icin <code>instagram_manage_messages</code>, yorum yaniti icin <code>instagram_manage_comments</code> (+ <code>pages_manage_metadata</code>).
          Hesabin Instagram Business/Creator olmasi ve bir Facebook Sayfasina bagli olmasi gerekir. Yalnizca kendi bagli hesabiniza gelen mesajlara yanit verilir.
        </div>
      </div>

      {/* Son mesaj loglari */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2"><ListOrdered size={16} className="text-emerald-500" /> Son Mesaj Loglari</h3>
        </div>
        {(!igMesajLog || igMesajLog.length === 0) ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Henuz log yok.</p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {igMesajLog.map((l: any) => (
              <div key={l.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${l.yon === 'out' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{l.yon === 'out' ? 'GIDEN' : 'GELEN'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 shrink-0">{l.kanal}</span>
                <span className="text-slate-500 shrink-0 max-w-[120px] truncate">{l.gonderen || '-'}</span>
                <span className="text-slate-700 flex-1 truncate">{l.metin || ''}</span>
                <span className="text-[10px] text-slate-300 shrink-0">{l.createdAt ? new Date(l.createdAt).toLocaleString('tr-TR') : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kural ekle/duzenle modal */}
      <Modal isOpen={!!kuralForm} onClose={() => setKuralForm(null)} title={kuralForm?.id ? 'Kural Duzenle' : 'Kural Ekle'} size="md">
        {kuralForm && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-600">Kanal</label>
              <select value={kuralForm.tip} onChange={(e) => setKuralForm({ ...kuralForm, tip: e.target.value })} className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500">
                <option value="dm">DM (Direkt Mesaj)</option>
                <option value="yorum">Yorum</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Anahtar Kelimeler</label>
              <input value={kuralForm.anahtarKelimeler} onChange={(e) => setKuralForm({ ...kuralForm, anahtarKelimeler: e.target.value })} placeholder="fiyat, stok, beden (virgul ile ayirin — bos = tum mesajlar)" className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500" />
              <p className="text-xs text-slate-400 mt-1">Mesajda bu kelimelerden biri gecerse yanit gonderilir. Bos birakilirsa tum mesajlara yanit verilir.</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Yanit Metni</label>
              <textarea value={kuralForm.yanitMetni} onChange={(e) => setKuralForm({ ...kuralForm, yanitMetni: e.target.value })} rows={4} placeholder="Otomatik gonderilecek yanit..." className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 resize-none" />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-slate-600">Oncelik</label>
                <input type="number" value={kuralForm.oncelik} onChange={(e) => setKuralForm({ ...kuralForm, oncelik: Number(e.target.value) })} className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500" />
                <p className="text-xs text-slate-400 mt-1">Yuksek oncelik once denenir.</p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm mt-5">
                <input type="checkbox" checked={kuralForm.aktif} onChange={(e) => setKuralForm({ ...kuralForm, aktif: e.target.checked })} className="rounded text-emerald-600 focus:ring-emerald-500" />
                <span className="text-slate-600">Aktif</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setKuralForm(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Vazgec</button>
              <button onClick={saveKural} className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"><Save size={15} /> Kaydet</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
