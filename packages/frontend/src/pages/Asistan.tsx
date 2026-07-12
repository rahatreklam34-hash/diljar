import { useEffect, useState, useRef } from 'react';
import { Bot, Save, Plus, Trash2, Send, GraduationCap, MessagesSquare, Link2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';

type Tab = 'egitim' | 'sohbet' | 'eksikler' | 'sohbetler';

export default function Asistan() {
  const { storeSetting } = useStore();
  const [tab, setTab] = useState<Tab>('egitim');
  const slug = storeSetting?.slug;
  const chatLink = slug ? `${window.location.origin}/sohbet/${slug}` : null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Bot className="text-emerald-600" size={22} /></div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">Yapay Zeka Asistanı</h1>
          <p className="text-sm text-slate-400">Müşteri sorularını yanıtlar, gerektiğinde destek kaydı oluşturur</p>
        </div>
      </div>

      {chatLink ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3 flex-wrap">
          <Link2 size={18} className="text-emerald-600" />
          <span className="text-sm text-slate-600">Müşteri sohbet linki:</span>
          <a href={chatLink} target="_blank" className="text-sm font-medium text-emerald-700 underline break-all">{chatLink}</a>
          <button onClick={() => { navigator.clipboard.writeText(chatLink); toast.success('Kopyalandı'); }} className="ml-auto text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg">Kopyala</button>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-700">Sohbet linki için önce <strong>Online Mağazam</strong>'da bir mağaza adresi (slug) belirleyin.</div>
      )}

      <div className="flex gap-2 mb-5 flex-wrap">
        {([['egitim', 'Eğitim & Profil', GraduationCap], ['sohbet', 'Sohbetle Eğit', Bot], ['eksikler', 'Eksiklerim', MessagesSquare], ['sohbetler', 'Müşteri Sohbetleri', MessagesSquare]] as [Tab, string, any][]).map(([t, l, Ic]) => (
          <button key={t} onClick={() => setTab(t)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}><Ic size={16} /> {l}</button>
        ))}
      </div>

      {tab === 'egitim' && <Egitim />}
      {tab === 'sohbet' && <SohbetleEgit />}
      {tab === 'eksikler' && <Eksikler />}
      {tab === 'sohbetler' && <Sohbetler />}
    </div>
  );
}

function Egitim() {
  const [cfg, setCfg] = useState<any>(null);
  const [kb, setKb] = useState<any[]>([]);
  const [form, setForm] = useState({ soru: '', cevap: '' });
  const load = () => { api.get('/assistant/config').then((r) => setCfg(r.data)).catch(() => {}); api.get('/assistant/knowledge').then((r) => setKb(r.data)).catch(() => {}); };
  useEffect(() => { load(); }, []);
  const saveCfg = async () => { try { await api.put('/assistant/config', cfg); toast.success('Kaydedildi'); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const addKb = async (e: React.FormEvent) => { e.preventDefault(); if (!form.soru || !form.cevap) return; try { await api.post('/assistant/knowledge', form); setForm({ soru: '', cevap: '' }); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const delKb = async (id: string) => { try { await api.delete(`/assistant/knowledge/${id}`); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const genProfil = async () => { try { const r = await api.post('/assistant/profile/generate', {}); setCfg((c: any) => ({ ...c, profil: r.data.profil })); toast.success('Profil (CV) oluşturuldu'); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const seedKb = async () => { try { const r = await api.post('/assistant/knowledge/seed', {}); toast.success(`${r.data.eklenen} hazır bilgi eklendi`); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  if (!cfg) return <div className="flex justify-center p-6"><span className="w-7 h-7 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <h3 className="font-semibold text-slate-800">Kişilik & Görev</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.active} onChange={(e) => setCfg({ ...cfg, active: e.target.checked })} /> Asistan aktif (müşteri sohbeti açık)</label>
        <div><label className="block text-xs text-slate-500 mb-1">Asistan Adı</label><input value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">Karşılama Mesajı</label><input value={cfg.greeting} onChange={(e) => setCfg({ ...cfg, greeting: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
        <div><label className="block text-xs text-slate-500 mb-1">Kişilik / Görev Tanımı</label><textarea rows={3} value={cfg.persona} onChange={(e) => setCfg({ ...cfg, persona: e.target.value })} placeholder="Örn: Kibar, samimi bir satış danışmanısın..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
        <button onClick={saveCfg} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"><Save size={16} /> Kaydet</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-slate-800">Profil / CV (asistanın özgeçmişi)</h3>
          <button onClick={genProfil} className="text-xs bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200">Otomatik Oluştur</button>
        </div>
        <p className="text-[11px] text-slate-400 mb-2">Asistan öğrendiklerini buraya CV gibi döker. Hatalı gördüğün yerleri düzenleyip kaydet.</p>
        <textarea rows={12} value={cfg.profil || ''} onChange={(e) => setCfg({ ...cfg, profil: e.target.value })} placeholder="Sohbetle Eğit'ten öğrendikçe burası dolar. Otomatik Oluştur ile de üretebilirsiniz." className="flex-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono" />
        <button onClick={saveCfg} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 mt-2 w-fit"><Save size={16} /> Profili Kaydet</button>
      </div>
    </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">Bilgi Tabanı (Soru → Cevap)</h3>
          <button onClick={seedKb} className="text-xs bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200">Hazır Bilgileri Yükle</button>
        </div>
        <form onSubmit={addKb} className="grid sm:grid-cols-2 gap-2 mb-4">
          <input value={form.soru} onChange={(e) => setForm({ ...form, soru: e.target.value })} placeholder="Müşteri sorusu" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          <input value={form.cevap} onChange={(e) => setForm({ ...form, cevap: e.target.value })} placeholder="Cevap" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          <button className="inline-flex items-center gap-1 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 w-fit"><Plus size={16} /> Bilgi Ekle</button>
        </form>
        <div className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
          {kb.map((k) => (
            <div key={k.id} className="border border-slate-100 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-slate-700">S: {k.soru}</p><button onClick={() => delKb(k.id)} className="text-red-500 shrink-0"><Trash2 size={14} /></button></div>
              <p className="text-sm text-slate-500 mt-1">C: {k.cevap}</p>
            </div>
          ))}
          {kb.length === 0 && <p className="text-slate-400 text-sm">Henüz bilgi eklenmedi.</p>}
        </div>
      </div>
    </div>
  );
}

function SohbetleEgit() {
  const [msgs, setMsgs] = useState<{ role: string; content: string }[]>([{ role: 'bot', content: 'Merhaba! Benimle sohbet ederek beni eğitebilirsin. Ürünlerini, kargo/iade politikanı, üslubunu anlat; her anlattığını öğrenir ve profilime eklerim. Cevap veremediğim soruları da sana sorarım.' }]);
  const [text, setText] = useState('');
  const [pendingGap, setPendingGap] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async () => {
    const q = text.trim(); if (!q) return;
    setMsgs((m) => [...m, { role: 'user', content: q }]); setText('');
    try {
      const r = await api.post('/assistant/train/chat', { message: q, answerGapId: pendingGap || undefined });
      setMsgs((m) => [...m, { role: 'bot', content: r.data.reply }]);
      setPendingGap(r.data.gapId || null);
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 max-w-2xl">
      <p className="text-xs text-slate-400 mb-3">Sohbet ettikçe öğrenir. Öğrendiklerini <strong>Eğitim & Profil</strong> sekmesindeki CV metninde görüp düzenleyebilirsin.</p>
      <div className="h-96 overflow-y-auto space-y-3 mb-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-line ${m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{m.content}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {pendingGap && <p className="text-[11px] text-amber-600 mb-1">Asistan bir eksiğini sordu — yazacağın cevap o soruya öğretilecek.</p>}
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Anlat ya da sorduğu soruyu yanıtla..." className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg" />
        <button onClick={send} className="bg-emerald-600 text-white px-4 rounded-lg hover:bg-emerald-700"><Send size={18} /></button>
      </div>
    </div>
  );
}

function Eksikler() {
  const [gaps, setGaps] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const load = () => api.get('/assistant/gaps').then((r) => setGaps(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const resolve = async (id: string) => {
    const cevap = (answers[id] || '').trim();
    if (!cevap) { toast.error('Cevap yazın'); return; }
    try { await api.post(`/assistant/gaps/${id}/resolve`, { cevap }); toast.success('Öğretildi'); load(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (id: string) => { try { await api.delete(`/assistant/gaps/${id}`); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-slate-500 mb-4">Asistanın cevap veremediği sorular. Yanıtladığında öğrenir ve bir daha aynı soruyu boş geçmez.</p>
      <div className="space-y-3">
        {gaps.map((g) => (
          <div key={g.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">"{g.ornek}"</p>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">{g.adet} kez soruldu</span>
            </div>
            <div className="flex gap-2 mt-2">
              <input value={answers[g.id] || ''} onChange={(e) => setAnswers({ ...answers, [g.id]: e.target.value })} placeholder="Doğru cevabı yaz" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <button onClick={() => resolve(g.id)} className="bg-emerald-600 text-white px-4 rounded-lg text-sm hover:bg-emerald-700">Öğret</button>
              <button onClick={() => del(g.id)} className="text-slate-400 hover:text-red-500 px-2"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        {gaps.length === 0 && <p className="text-slate-400 text-sm">Şu an bilinen bir eksik yok. 🎉</p>}
      </div>
    </div>
  );
}

function Sohbetler() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [reply, setReply] = useState('');
  const load = () => api.get('/assistant/sessions').then((r) => setSessions(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const open = async (id: string) => { const r = await api.get(`/assistant/sessions/${id}`); setActive(r.data); };
  const send = async () => { if (!active || !reply.trim()) return; try { await api.post(`/assistant/sessions/${active.id}/reply`, { content: reply }); setReply(''); open(active.id); } catch (e) { toast.error(apiErrorMessage(e)); } };

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className="space-y-2">
        {sessions.map((s) => (
          <button key={s.id} onClick={() => open(s.id)} className={`w-full text-left bg-white rounded-xl border p-3 ${active?.id === s.id ? 'border-emerald-400' : 'border-slate-200'}`}>
            <div className="flex justify-between"><span className="font-medium text-slate-800 text-sm">{s.musteriAd || 'Müşteri'}</span><span className="text-xs text-slate-400">{new Date(s.updatedAt).toLocaleString('tr-TR')}</span></div>
            <p className="text-xs text-slate-400 truncate mt-1">{s.messages?.[0]?.content || ''}</p>
          </button>
        ))}
        {sessions.length === 0 && <p className="text-slate-400 text-sm">Henüz müşteri sohbeti yok.</p>}
      </div>
      {active && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col max-h-[70vh]">
          <h3 className="font-semibold text-slate-800 mb-1">{active.musteriAd || 'Müşteri'}</h3>
          <p className="text-[11px] text-slate-400 mb-2">{active.musteriTipi === 'mevcut' ? 'Mevcut alışveriş' : active.musteriTipi === 'yeni' ? 'Yeni müşteri' : '-'}{active.instagram ? ' · @' + active.instagram : ''}{active.telefon ? ' · ' + active.telefon : ''}</p>
          <div className="flex-1 overflow-y-auto space-y-2">
            {active.messages?.map((m: any) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${m.role === 'user' ? 'bg-slate-100 text-slate-700' : m.role === 'agent' ? 'bg-green-600 text-white' : 'bg-emerald-600 text-white'}`}>
                  {String(m.content).startsWith('data:image') ? <img src={m.content} className="rounded-lg max-h-40" /> : <p>{m.content}</p>}
                  <p className="text-[9px] opacity-70 mt-0.5">{m.role === 'user' ? 'Müşteri' : m.role === 'agent' ? 'Siz' : 'Bot'}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-slate-100 mt-2">
            <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Müşteriye yanıt yaz..." className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <button onClick={send} className="bg-green-600 text-white px-4 rounded-lg hover:bg-green-700"><Send size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
