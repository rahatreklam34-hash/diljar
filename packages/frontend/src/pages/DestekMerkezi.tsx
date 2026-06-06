import { useEffect, useState } from 'react';
import { LifeBuoy, Plus, Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';

interface Msg { id: string; content: string; isAdmin: boolean; createdAt: string; }
interface Ticket { id: string; subject: string; category: string; priority: string; status: string; createdAt: string; updatedAt: string; messages?: Msg[]; }

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  ANSWERED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-slate-100 text-slate-500',
};
const STATUS_TR: Record<string, string> = { OPEN: 'Açık', ANSWERED: 'Yanıtlandı', CLOSED: 'Kapalı' };

export default function DestekMerkezi() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [active, setActive] = useState<Ticket | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [form, setForm] = useState({ subject: '', category: 'genel', priority: 'MEDIUM', message: '' });

  const load = () => api.get('/support/tickets').then((r) => setTickets(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const openTicket = async (id: string) => {
    const r = await api.get(`/support/tickets/${id}`);
    setActive(r.data);
  };

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/support/tickets', form);
      toast.success('Talebiniz oluşturuldu');
      setNewOpen(false);
      setForm({ subject: '', category: 'genel', priority: 'MEDIUM', message: '' });
      load();
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const sendReply = async () => {
    if (!active || !reply.trim()) return;
    try {
      await api.post(`/support/tickets/${active.id}/messages`, { content: reply });
      setReply('');
      openTicket(active.id);
      load();
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><LifeBuoy className="text-indigo-600" size={22} /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Destek Merkezi</h1>
            <p className="text-sm text-slate-400">Sorularınız ve talepleriniz için bizimle iletişime geçin</p>
          </div>
        </div>
        <button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700">
          <Plus size={18} /> Yeni Talep
        </button>
      </div>

      <div className="grid gap-3">
        {tickets.length === 0 && <div className="text-center text-slate-400 py-16 bg-white rounded-xl border border-slate-200">Henüz destek talebiniz yok.</div>}
        {tickets.map((t) => (
          <button key={t.id} onClick={() => openTicket(t.id)} className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">{t.subject}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[t.status]}`}>{STATUS_TR[t.status]}</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">{t.category} • {new Date(t.updatedAt).toLocaleString('tr-TR')}</div>
          </button>
        ))}
      </div>

      {/* Yeni talep modal */}
      {newOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setNewOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={createTicket} className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Yeni Destek Talebi</h3><button type="button" onClick={() => setNewOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            <input required placeholder="Konu" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg" />
            <div className="grid grid-cols-2 gap-3">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="px-4 py-2.5 border border-slate-200 rounded-lg">
                <option value="genel">Genel</option><option value="teknik">Teknik</option><option value="fatura">Fatura/Ödeme</option>
              </select>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="px-4 py-2.5 border border-slate-200 rounded-lg">
                <option value="LOW">Düşük</option><option value="MEDIUM">Orta</option><option value="HIGH">Yüksek</option><option value="URGENT">Acil</option>
              </select>
            </div>
            <textarea required placeholder="Mesajınız" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg" />
            <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700">Gönder</button>
          </form>
        </div>
      )}

      {/* Talep detay modal */}
      {active && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setActive(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-6 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between mb-3">
              <div><h3 className="text-lg font-semibold">{active.subject}</h3><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[active.status]}`}>{STATUS_TR[active.status]}</span></div>
              <button onClick={() => setActive(null)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 py-2">
              {active.messages?.map((m) => (
                <div key={m.id} className={`flex ${m.isAdmin ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.isAdmin ? 'bg-slate-100 text-slate-700' : 'bg-indigo-600 text-white'}`}>
                    <p>{m.content}</p>
                    <p className={`text-[10px] mt-1 ${m.isAdmin ? 'text-slate-400' : 'text-indigo-200'}`}>{m.isAdmin ? 'Destek' : 'Siz'} • {new Date(m.createdAt).toLocaleString('tr-TR')}</p>
                  </div>
                </div>
              ))}
            </div>
            {active.status !== 'CLOSED' && (
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendReply()} placeholder="Yanıt yazın..." className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg" />
                <button onClick={sendReply} className="bg-indigo-600 text-white px-4 rounded-lg hover:bg-indigo-700"><Send size={18} /></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
