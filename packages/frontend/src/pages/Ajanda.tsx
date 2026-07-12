import MoneyInput from '../components/MoneyInput';
import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Clock, Gift, BookOpen, Bell, Plus, Trash2, CheckCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';

const DAYS = ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];

type EventType = 'odeme' | 'gelir' | 'toplanti' | 'hatirlatma';
interface AjandaEvent {
  id: string;
  date: string;
  title: string;
  type: EventType;
  tutar?: number;
}
interface Not {
  id: string;
  text: string;
  createdAt: string;
}
interface Hatirlatici {
  id: string;
  text: string;
  date: string;
  done: boolean;
}

const eventColors: Record<EventType, string> = {
  odeme: 'bg-red-500',
  gelir: 'bg-green-500',
  toplanti: 'bg-blue-500',
  hatirlatma: 'bg-orange-500',
};

const eventBadge: Record<EventType, string> = {
  odeme: 'bg-red-100 text-red-700',
  gelir: 'bg-green-100 text-green-700',
  toplanti: 'bg-blue-100 text-blue-700',
  hatirlatma: 'bg-orange-100 text-orange-700',
};

const eventLabel: Record<EventType, string> = {
  odeme: 'Odeme', gelir: 'Gelir', toplanti: 'Toplanti', hatirlatma: 'Hatirlatma',
};

function loadLS<T>(key: string, def: T): T {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
}
function saveLS(key: string, val: unknown) { localStorage.setItem(key, JSON.stringify(val)); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fmt(n: number) { return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0 }).format(n); }

export default function Ajanda() {
  const { cekler, personeller } = useApp();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [events, setEvents] = useState<AjandaEvent[]>(() => loadLS('ajandaEvents', []));
  const [notlar, setNotlar] = useState<Not[]>(() => loadLS('ajandaNotlar', []));
  const [hatirlaticilar, setHatirlaticilar] = useState<Hatirlatici[]>(() => loadLS('ajandaHatirlatici', []));

  const [addEventModal, setAddEventModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [eventForm, setEventForm] = useState({ title: '', type: 'hatirlatma' as EventType, tutar: '' });

  const [notText, setNotText] = useState('');
  const [hatText, setHatText] = useState('');
  const [hatDate, setHatDate] = useState('');

  const [haftalikPlan, setHaftalikPlan] = useState<string[]>(() => loadLS('ajandaHaftalik', ['', '', '', '', '', '', '']));

  useEffect(() => { saveLS('ajandaEvents', events); }, [events]);
  useEffect(() => { saveLS('ajandaNotlar', notlar); }, [notlar]);
  useEffect(() => { saveLS('ajandaHatirlatici', hatirlaticilar); }, [hatirlaticilar]);
  useEffect(() => { saveLS('ajandaHaftalik', haftalikPlan); }, [haftalikPlan]);

  const autoEvents = useMemo((): AjandaEvent[] => {
    const evts: AjandaEvent[] = [];
    cekler.forEach(c => {
      evts.push({ id: `cek-${c.id}`, date: c.vadeTarihi, title: `${c.tip === 'borc' ? 'Odeme' : 'Tahsilat'}: ${c.kisiAd}`, type: c.tip === 'borc' ? 'odeme' : 'gelir', tutar: c.tutar });
    });
    personeller.forEach(p => {
      const d = new Date(viewYear, viewMonth, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      evts.push({ id: `maas-${p.id}-${key}`, date: key, title: `${p.ad} Maas Odemesi`, type: 'odeme', tutar: p.maas });
    });
    return evts;
  }, [cekler, personeller, viewYear, viewMonth]);

  const allEvents = useMemo(() => [...autoEvents, ...events], [autoEvents, events]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, AjandaEvent[]> = {};
    allEvents.forEach(e => { if (!map[e.date]) map[e.date] = []; map[e.date].push(e); });
    return map;
  }, [allEvents]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function openAddEvent(day: number) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setEventForm({ title: '', type: 'hatirlatma', tutar: '' });
    setAddEventModal(true);
  }

  function saveEvent() {
    if (!eventForm.title) return;
    setEvents(prev => [...prev, { id: genId(), date: selectedDate, title: eventForm.title, type: eventForm.type, tutar: eventForm.tutar ? Number(eventForm.tutar) : undefined }]);
    setAddEventModal(false);
  }

  function deleteEvent(id: string) { setEvents(prev => prev.filter(e => e.id !== id)); }

  function addNot() {
    if (!notText.trim()) return;
    setNotlar(prev => [{ id: genId(), text: notText.trim(), createdAt: new Date().toISOString() }, ...prev]);
    setNotText('');
  }

  function deleteNot(id: string) { setNotlar(prev => prev.filter(n => n.id !== id)); }

  function addHatirlatici() {
    if (!hatText.trim() || !hatDate) return;
    setHatirlaticilar(prev => [...prev, { id: genId(), text: hatText.trim(), date: hatDate, done: false }]);
    setHatText(''); setHatDate('');
  }

  function toggleHatirlatici(id: string) {
    setHatirlaticilar(prev => prev.map(h => h.id === id ? { ...h, done: !h.done } : h));
  }

  function deleteHatirlatici(id: string) { setHatirlaticilar(prev => prev.filter(h => h.id !== id)); }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const yaklasakTarihler = useMemo(() => {
    return allEvents.filter(e => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  }, [allEvents, todayStr]);

  const ozet = {
    toplam: allEvents.length,
    odeme: allEvents.filter(e => e.type === 'odeme').length,
    gelir: allEvents.filter(e => e.type === 'gelir').length,
    toplanti: allEvents.filter(e => e.type === 'toplanti').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Ajanda</h1>
        <p className="text-gray-500 text-sm">Etkinlikler, odemeler ve hatirlaticilar</p>
      </div>

      {/* Ozet Kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Toplam Etkinlik', val: ozet.toplam, color: 'from-emerald-500 to-emerald-600' },
          { label: 'Odeme', val: ozet.odeme, color: 'from-red-500 to-red-600' },
          { label: 'Gelir', val: ozet.gelir, color: 'from-green-500 to-green-600' },
          { label: 'Toplanti', val: ozet.toplanti, color: 'from-blue-500 to-blue-600' },
        ].map(c => (
          <div key={c.label} className={`bg-gradient-to-br ${c.color} text-white rounded-2xl p-4`}>
            <div className="text-3xl font-bold">{c.val}</div>
            <div className="text-sm opacity-80 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><ChevronLeft size={18} /></button>
            <h3 className="font-semibold text-gray-800 text-lg">{MONTHS[viewMonth]} {viewYear}</h3>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map(d => <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              if (!day) return <div key={i} />;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvts = eventsByDate[dateStr] || [];
              const isToday = dateStr === todayStr;
              return (
                <div
                  key={i}
                  onClick={() => openAddEvent(day)}
                  className={`min-h-[52px] p-1 rounded-xl cursor-pointer border transition-all ${isToday ? 'border-blue-400 bg-blue-50' : 'border-transparent hover:border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className={`text-xs font-medium mb-0.5 text-center ${isToday ? 'text-blue-600 font-bold' : 'text-gray-700'}`}>{day}</div>
                  <div className="flex flex-wrap gap-0.5 justify-center">
                    {dayEvts.slice(0, 3).map(e => (
                      <span key={e.id} className={`w-2 h-2 rounded-full ${eventColors[e.type]}`} title={e.title} />
                    ))}
                    {dayEvts.length > 3 && <span className="text-xs text-gray-400">+{dayEvts.length - 3}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100">
            {(Object.keys(eventColors) as EventType[]).map(t => (
              <div key={t} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`w-2.5 h-2.5 rounded-full ${eventColors[t]}`} />
                {eventLabel[t]}
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Clock size={16} className="text-orange-500" />Yaklasan 5 Etkinlik</h3>
            {yaklasakTarihler.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">Etkinlik yok</div>
            ) : (
              <div className="space-y-2">
                {yaklasakTarihler.map(e => (
                  <div key={e.id} className="flex items-start gap-2">
                    <span className={`mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${eventBadge[e.type]}`}>{eventLabel[e.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-800 truncate">{e.title}</div>
                      <div className="text-xs text-gray-400">{e.date}{e.tutar ? ` · ${fmt(e.tutar)} ₺` : ''}</div>
                    </div>
                    {!e.id.startsWith('cek-') && !e.id.startsWith('maas-') && (
                      <button onClick={() => deleteEvent(e.id)} className="p-1 text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 size={12} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Gift size={16} className="text-pink-500" />Dogum Gunleri</h3>
            <div className="text-center text-gray-400 text-sm py-4">Kayitli dogum gunu yok</div>
          </div>
        </div>
      </div>

      {/* Haftalik Plan + Not Defteri + Hatirlaticilar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><Calendar size={16} className="text-purple-500" />Haftalik Plan</h3>
          <div className="space-y-2">
            {DAYS.map((d, i) => (
              <div key={d} className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-400 w-8">{d}</span>
                <input
                  value={haftalikPlan[i] || ''}
                  onChange={e => setHaftalikPlan(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"
                  placeholder="Plan ekle..."
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><BookOpen size={16} className="text-green-500" />Not Defteri</h3>
          <div className="flex gap-2 mb-3">
            <input value={notText} onChange={e => setNotText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNot()} className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-200" placeholder="Not ekle..." />
            <button onClick={addNot} className="p-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors"><Plus size={16} /></button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {notlar.length === 0 && <div className="text-center text-gray-400 text-sm py-4">Not yok</div>}
            {notlar.map(n => (
              <div key={n.id} className="flex items-start gap-2 p-2 bg-yellow-50 rounded-xl">
                <div className="flex-1 text-sm text-gray-700">{n.text}</div>
                <button onClick={() => deleteNot(n.id)} className="text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><Bell size={16} className="text-orange-500" />Hatirlaticilarim</h3>
          <div className="space-y-2 mb-3">
            <input value={hatText} onChange={e => setHatText(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="Hatirlatici..." />
            <div className="flex gap-2">
              <input type="date" value={hatDate} onChange={e => setHatDate(e.target.value)} className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" />
              <button onClick={addHatirlatici} className="p-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors"><Plus size={16} /></button>
            </div>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {hatirlaticilar.length === 0 && <div className="text-center text-gray-400 text-sm py-4">Hatirlatici yok</div>}
            {[...hatirlaticilar].sort((a, b) => a.date.localeCompare(b.date)).map(h => (
              <div key={h.id} className={`flex items-center gap-2 p-2 rounded-xl ${h.done ? 'bg-gray-50 opacity-60' : 'bg-orange-50'}`}>
                <button onClick={() => toggleHatirlatici(h.id)} className={h.done ? 'text-green-500' : 'text-gray-300'}><CheckCircle size={16} /></button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${h.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{h.text}</div>
                  <div className="text-xs text-gray-400">{h.date}</div>
                </div>
                <button onClick={() => deleteHatirlatici(h.id)} className="text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      {addEventModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">{selectedDate} - Etkinlik Ekle</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tip</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(eventLabel) as EventType[]).map(t => (
                    <button key={t} onClick={() => setEventForm(f => ({ ...f, type: t }))} className={`py-1.5 rounded-xl text-xs font-medium transition-colors ${eventForm.type === t ? `${eventBadge[t]}` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{eventLabel[t]}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Baslik</label>
                <input value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" placeholder="Etkinlik basligini girin..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tutar (opsiyonel)</label>
                <input type="text" inputMode="decimal" value={eventForm.tutar} onChange={e => setEventForm(f => ({ ...f, tutar: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" placeholder="0" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setAddEventModal(false)} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm">Iptal</button>
              <button onClick={saveEvent} className="flex-1 py-2 text-white bg-blue-500 hover:bg-blue-600 rounded-xl text-sm font-medium">Ekle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
