import { useEffect, useState, useRef } from 'react';
import { Users, Send } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function EkipSohbet() {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = () => api.get('/staff/team/messages').then((r) => setMsgs(r.data || [])).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async () => {
    const v = text.trim(); if (!v || busy) return; setText(''); setBusy(true);
    try { await api.post('/staff/team/messages', { content: v }); load(); } catch (e) { alert(apiErrorMessage(e)); } finally { setBusy(false); }
  };
  const dt = (d: string) => new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Users className="text-indigo-600" size={22} /></div>
        <div><h1 className="text-2xl font-bold text-slate-800">Ekip Sohbeti</h1><p className="text-sm text-slate-400">Ekibinizle anlık mesajlaşın, notlar bırakın.</p></div>
      </div>
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {msgs.length === 0 && <p className="text-center text-slate-400 text-sm py-10">Henüz mesaj yok. İlk mesajı sen yaz.</p>}
          {msgs.map((m) => {
            const benim = m.userId === user?.id;
            return (
              <div key={m.id} className={`flex ${benim ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${benim ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-100 text-slate-700'}`}>
                  {!benim && <p className="text-[11px] font-semibold text-indigo-600 mb-0.5">{m.ad}</p>}
                  <p className="text-sm whitespace-pre-line break-words">{m.content}</p>
                  <p className={`text-[10px] mt-0.5 ${benim ? 'text-white/60' : 'text-slate-400'}`}>{dt(m.createdAt)}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <div className="p-3 border-t border-slate-100 flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Mesaj yaz..." className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-base" />
          <button onClick={send} disabled={busy} className="bg-indigo-600 text-white px-4 rounded-xl hover:bg-indigo-700 disabled:opacity-50"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
}
