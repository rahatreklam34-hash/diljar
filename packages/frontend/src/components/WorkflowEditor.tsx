// Görsel sürükle-bırak workflow editörü (@xyflow/react).
// Sol: blok paleti (aktif bloklar sürüklenir, "Yakında" bloklar kilitli).
// Orta: node canvas (ekle/sil/kopyala/bağla, Koşul düğümlerinde Evet/Hayır çıkışı).
// Sağ: seçili düğümün ayar paneli.
import { useCallback, useRef, useState, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState,
  Handle, Position, MarkerType, type Node, type Edge, type Connection, type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import toast from 'react-hot-toast';
import {
  X, Trash2, Copy, Save, Zap, Clock, GitBranch, MessageSquare, FileText, Image as ImageIcon,
  CreditCard, Truck, RefreshCw, Ban, CheckCircle, StickyNote, Lock, ShoppingBag,
} from 'lucide-react';

export const TEMPLATE_GALLERY = [
  { key: 'siparis_odeme_tamamla', ad: 'Sipariş → Ödeme → Tamamlama', desc: 'Sipariş gelince ödeme linki gönderir, ödenmezse hatırlatır, hâlâ ödenmezse iptal eder.', aktif: true },
  { key: 'sepet_terk', ad: 'Sepet / Ödeme Hatırlatma', desc: '1 saat içinde ödeme gelmezse müşteriye hatırlatma mesajı gönderir.', aktif: true },
  { key: 'ilk_siparis', ad: 'İlk Sipariş Karşılama', desc: 'Müşterinin ilk siparişinde özel karşılama mesajı gönderir.', aktif: true },
  { key: 'tekrar_satin_alma', ad: 'Tekrar Satın Alma', desc: 'Daha önce sipariş vermiş müşteriye teşekkür mesajı gönderir.', aktif: true },
  { key: 'kargo_bilgilendirme', ad: 'Kargo Bilgilendirme', desc: 'Sipariş kargoya verildiğinde takip linki gönderir. (kargo olayı yakında)', aktif: false },
  { key: 'vip_musteri', ad: 'VIP Müşteri', desc: 'Yüksek tutarlı siparişlerde özel mesaj. (VIP alanı yakında)', aktif: false },
  { key: 'iade_sonrasi', ad: 'İade Sonrası Takip', desc: 'İptal sonrası 24 saatte geri bildirim mesajı. (iade olayı yakında)', aktif: false },
];

// ── Blok kataloğu ────────────────────────────────────────────────────────────
type BlockDef = { type: 'condition' | 'delay' | 'action'; subtype: string; label: string; icon: any; active: boolean; defaultConfig?: any };

const CONDITIONS: BlockDef[] = [
  { type: 'condition', subtype: 'payment_received', label: 'Ödeme Geldi Mi?', icon: CreditCard, active: true },
  { type: 'condition', subtype: 'amount_gt', label: 'Tutar > X', icon: GitBranch, active: true, defaultConfig: { value: 1000 } },
  { type: 'condition', subtype: 'amount_lt', label: 'Tutar < X', icon: GitBranch, active: true, defaultConfig: { value: 1000 } },
  { type: 'condition', subtype: 'first_order', label: 'İlk Sipariş Mi?', icon: GitBranch, active: true },
  { type: 'condition', subtype: 'has_product', label: 'Belirli Ürün Var Mı?', icon: ShoppingBag, active: true, defaultConfig: { kod: '' } },
  { type: 'condition', subtype: 'campaign_used', label: 'Kampanya Kullanıldı Mı?', icon: GitBranch, active: true, defaultConfig: { kod: '' } },
  { type: 'condition', subtype: 'city_istanbul', label: 'Şehir İstanbul Mu?', icon: GitBranch, active: true, defaultConfig: { city: 'istanbul' } },
  { type: 'condition', subtype: 'cod_payment', label: 'Kapıda Ödeme Mi?', icon: GitBranch, active: true },
  { type: 'condition', subtype: 'is_vip', label: 'VIP Müşteri Mi?', icon: GitBranch, active: false },
];

const DELAYS: BlockDef[] = [
  { type: 'delay', subtype: 'preset', label: 'Bekle', icon: Clock, active: true, defaultConfig: { preset: '20m' } },
];

const ACTIONS: BlockDef[] = [
  { type: 'action', subtype: 'send_message', label: 'Mesaj Gönder', icon: MessageSquare, active: true, defaultConfig: { mesaj: 'Merhaba {ad}, ' } },
  { type: 'action', subtype: 'send_template', label: 'Şablon Gönder', icon: FileText, active: true, defaultConfig: { sablonId: '', sablonVars: [] } },
  { type: 'action', subtype: 'send_media', label: 'Medya Gönder', icon: ImageIcon, active: true, defaultConfig: { mediaType: 'image', mediaUrl: '', mesaj: '' } },
  { type: 'action', subtype: 'send_payment_link', label: 'Ödeme Linki Gönder', icon: CreditCard, active: true, defaultConfig: { mesaj: 'Merhaba {ad}, ödeme: {link}' } },
  { type: 'action', subtype: 'send_cargo_link', label: 'Kargo Takip Linki', icon: Truck, active: true, defaultConfig: { mesaj: 'Merhaba {ad}, kargo takip: ' } },
  { type: 'action', subtype: 'update_status', label: 'Sipariş Durumu Güncelle', icon: RefreshCw, active: true, defaultConfig: { durum: 'hazirlaniyor' } },
  { type: 'action', subtype: 'cancel_order', label: 'Sipariş İptal Et', icon: Ban, active: true },
  { type: 'action', subtype: 'complete_order', label: 'Siparişi Tamamla', icon: CheckCircle, active: true },
  { type: 'action', subtype: 'add_note', label: 'Not Ekle', icon: StickyNote, active: true, defaultConfig: { not: '' } },
  { type: 'action', subtype: 'send_audio', label: 'Ses Gönder', icon: MessageSquare, active: false },
  { type: 'action', subtype: 'send_pdf', label: 'PDF Gönder', icon: FileText, active: false },
  { type: 'action', subtype: 'add_tag', label: 'Etiket Ekle', icon: StickyNote, active: false },
  { type: 'action', subtype: 'make_vip', label: 'VIP Yap', icon: CheckCircle, active: false },
  { type: 'action', subtype: 'give_points', label: 'Puan Ver', icon: CheckCircle, active: false },
  { type: 'action', subtype: 'notify_admin', label: 'Yönetici Bildirimi', icon: MessageSquare, active: false },
  { type: 'action', subtype: 'create_task', label: 'Görev Oluştur', icon: StickyNote, active: false },
];

const TRIGGER_OPTIONS = [
  { kind: 'order', label: 'Sipariş Alındı', active: true },
  { kind: 'status', label: 'Sipariş Durumu Değişti', active: true },
  { kind: 'payment_received', label: 'Ödeme Alındı', active: true },
  { kind: 'cart_abandon', label: 'Sepet Terk (yakında)', active: false },
  { kind: 'membership', label: 'Yeni Üyelik (yakında)', active: false },
  { kind: 'vip', label: 'VIP Oldu (yakında)', active: false },
];

const STATUS_OPTIONS = ['yeni', 'hazirlaniyor', 'kargoda', 'tamamlandi', 'iptal'];

const ALL_BLOCKS = [...CONDITIONS, ...DELAYS, ...ACTIONS];
function findDef(subtype: string): BlockDef | undefined { return ALL_BLOCKS.find((b) => b.subtype === subtype); }

const TYPE_COLOR: Record<string, { bg: string; bd: string; ic: string }> = {
  trigger: { bg: 'bg-indigo-50', bd: 'border-indigo-300', ic: 'text-indigo-600' },
  condition: { bg: 'bg-amber-50', bd: 'border-amber-300', ic: 'text-amber-600' },
  decision: { bg: 'bg-amber-50', bd: 'border-amber-300', ic: 'text-amber-600' },
  delay: { bg: 'bg-sky-50', bd: 'border-sky-300', ic: 'text-sky-600' },
  action: { bg: 'bg-emerald-50', bd: 'border-emerald-300', ic: 'text-emerald-600' },
};

const DELAY_PRESETS = [
  { v: '5m', l: '5 dk' }, { v: '10m', l: '10 dk' }, { v: '20m', l: '20 dk' }, { v: '30m', l: '30 dk' },
  { v: '1h', l: '1 saat' }, { v: '3h', l: '3 saat' }, { v: '24h', l: '24 saat' }, { v: 'custom', l: 'Özel süre' },
];

function nodeSummary(data: any): string {
  const c = data.config || {};
  switch (data.subtype) {
    case 'order': return 'Sipariş oluştuğunda';
    case 'status': return 'Sipariş durumu değiştiğinde';
    case 'payment_received': return data.type === 'trigger' ? 'Ödeme alındığında' : 'Ödeme tamamlandı mı?';
    case 'amount_gt': return `Tutar > ${c.value ?? 0}`;
    case 'amount_lt': return `Tutar < ${c.value ?? 0}`;
    case 'has_product': return c.kod ? `Ürün: ${c.kod}` : 'Herhangi bir ürün';
    case 'campaign_used': return c.kod ? `Kod: ${c.kod}` : 'Kampanya kullanıldı mı?';
    case 'city_istanbul': return `Şehir: ${c.city || 'istanbul'}`;
    case 'preset': return c.preset === 'custom' ? `${c.customMin || 0} dk bekle` : `${(DELAY_PRESETS.find((p) => p.v === c.preset)?.l) || c.preset} bekle`;
    case 'send_message': case 'send_payment_link': case 'send_cargo_link': return (c.mesaj || '').slice(0, 40) || 'Mesaj';
    case 'send_template': return c.sablonId ? 'Şablon seçili' : 'Şablon seçilmedi';
    case 'send_media': return c.mediaUrl ? 'Medya' : 'Medya URL gerekli';
    case 'update_status': return `Durum → ${c.durum || '?'}`;
    case 'add_note': return (c.not || '').slice(0, 40) || 'Not';
    default: return '';
  }
}

// ── Özel düğüm bileşeni ──────────────────────────────────────────────────────
function WfNode({ id, data, selected }: { id: string; data: any; selected: boolean }) {
  const col = TYPE_COLOR[data.type] || TYPE_COLOR.action;
  const Icon = data.icon || Zap;
  const isCond = data.type === 'condition' || data.type === 'decision';
  return (
    <div className={`rounded-xl border-2 ${col.bd} ${col.bg} shadow-sm min-w-[180px] max-w-[230px] ${selected ? 'ring-2 ring-slate-800/40' : ''}`}>
      {data.type !== 'trigger' && <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-slate-400" />}
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Icon size={14} className={col.ic} />
          <span className="text-[12px] font-semibold text-slate-700 truncate">{data.label}</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight line-clamp-2">{nodeSummary(data)}</p>
      </div>
      {isCond ? (
        <div className="relative h-5">
          <span className="absolute left-3 -bottom-0.5 text-[9px] font-bold text-emerald-600">EVET</span>
          <span className="absolute right-3 -bottom-0.5 text-[9px] font-bold text-rose-500">HAYIR</span>
          <Handle id="yes" type="source" position={Position.Bottom} style={{ left: '28%' }} className="!w-3 !h-3 !bg-emerald-500" />
          <Handle id="no" type="source" position={Position.Bottom} style={{ left: '72%' }} className="!w-3 !h-3 !bg-rose-500" />
        </div>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-slate-400" />
      )}
    </div>
  );
}

const nodeTypes = { wf: WfNode };

// stored graph → flow
function toFlow(graph: any, triggerKind: string): { nodes: Node[]; edges: Edge[] } {
  const g = graph && Array.isArray(graph.nodes) ? graph : { nodes: [], edges: [] };
  let nodes: Node[] = (g.nodes || []).map((n: any) => {
    const def = findDef(n.subtype);
    const label = n.type === 'trigger' ? (TRIGGER_OPTIONS.find((t) => t.kind === n.subtype)?.label || 'Tetikleyici') : (def?.label || n.subtype);
    return { id: n.id, type: 'wf', position: { x: n.x || 0, y: n.y || 0 }, deletable: n.type !== 'trigger', data: { type: n.type, subtype: n.subtype, label, icon: n.type === 'trigger' ? Zap : def?.icon, config: n.config || {} } };
  });
  if (!nodes.some((n) => (n.data as any).type === 'trigger')) {
    nodes = [{ id: 't', type: 'wf', position: { x: 120, y: 30 }, deletable: false, data: { type: 'trigger', subtype: triggerKind, label: TRIGGER_OPTIONS.find((t) => t.kind === triggerKind)?.label || 'Tetikleyici', icon: Zap, config: {} } }, ...nodes];
  }
  const edges: Edge[] = (g.edges || []).map((e: any) => ({
    id: e.id || `${e.from}-${e.to}-${e.branch || ''}`, source: e.from, target: e.to,
    sourceHandle: e.branch || undefined, label: e.branch === 'yes' ? 'Evet' : e.branch === 'no' ? 'Hayır' : undefined,
    markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: e.branch === 'no' ? '#f43f5e' : e.branch === 'yes' ? '#10b981' : '#94a3b8' },
  }));
  return { nodes, edges };
}

// flow → stored graph
function toGraph(nodes: Node[], edges: Edge[]): any {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: (n.data as any).type, subtype: (n.data as any).subtype, config: (n.data as any).config || {}, x: Math.round(n.position.x), y: Math.round(n.position.y) })),
    edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target, branch: e.sourceHandle === 'yes' ? 'yes' : e.sourceHandle === 'no' ? 'no' : null })),
  };
}

function tplVarCount(t: any): number { let m = 0; for (const x of String(t?.bodyText || '').matchAll(/\{\{(\d+)\}\}/g)) m = Math.max(m, parseInt(x[1], 10)); return m; }

type Props = { initial: any | null; templates: any[]; onClose: () => void; onSave: (data: any) => Promise<boolean> };

export default function WorkflowEditor({ initial, templates, onClose, onSave }: Props) {
  const [ad, setAd] = useState(initial?.ad || 'Yeni Akış');
  const [triggerKind, setTriggerKind] = useState(initial?.triggerKind || 'order');
  const [statusFilter, setStatusFilter] = useState(initial?.triggerFilter?.durum || '');
  const init = useMemo(() => toFlow(initial?.graph, initial?.triggerKind || 'order'), []); // eslint-disable-line
  const [nodes, setNodes, onNodesChange] = useNodesState(init.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(init.edges);
  const [selId, setSelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rf = useRef<ReactFlowInstance | null>(null);
  const wrapper = useRef<HTMLDivElement | null>(null);

  const selected = nodes.find((n) => n.id === selId) || null;

  const onConnect = useCallback((c: Connection) => {
    const branch = c.sourceHandle === 'yes' ? 'yes' : c.sourceHandle === 'no' ? 'no' : null;
    setEdges((eds) => addEdge({ ...c, label: branch === 'yes' ? 'Evet' : branch === 'no' ? 'Hayır' : undefined, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: branch === 'no' ? '#f43f5e' : branch === 'yes' ? '#10b981' : '#94a3b8' } }, eds));
  }, [setEdges]);

  const onDragStart = (e: React.DragEvent, def: BlockDef) => {
    if (!def.active) { e.preventDefault(); toast('Bu blok henüz backend tarafından desteklenmiyor (yakında).', { icon: '🔒' }); return; }
    e.dataTransfer.setData('application/wf', JSON.stringify({ type: def.type, subtype: def.subtype }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/wf');
    if (!raw || !rf.current) return;
    const { subtype } = JSON.parse(raw);
    const def = findDef(subtype);
    if (!def) return;
    const position = rf.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = `n${Date.now()}${Math.floor(Math.random() * 100)}`;
    setNodes((ns) => ns.concat({ id, type: 'wf', position, deletable: true, data: { type: def.type, subtype: def.subtype, label: def.label, icon: def.icon, config: { ...(def.defaultConfig || {}) } } } as Node));
  };

  const updateConfig = (patch: any) => setNodes((ns) => ns.map((n) => (n.id === selId ? { ...n, data: { ...n.data, config: { ...(n.data as any).config, ...patch } } } : n)));
  const updateTrigger = (kind: string) => { setTriggerKind(kind); setNodes((ns) => ns.map((n) => ((n.data as any).type === 'trigger' ? { ...n, data: { ...n.data, subtype: kind, label: TRIGGER_OPTIONS.find((t) => t.kind === kind)?.label || 'Tetikleyici' } } : n))); };
  const delNode = () => { if (!selId) return; const n = nodes.find((x) => x.id === selId); if ((n?.data as any)?.type === 'trigger') { toast.error('Tetikleyici silinemez'); return; } setNodes((ns) => ns.filter((x) => x.id !== selId)); setEdges((es) => es.filter((e) => e.source !== selId && e.target !== selId)); setSelId(null); };
  const copyNode = () => { const n = nodes.find((x) => x.id === selId); if (!n || (n.data as any).type === 'trigger') return; const id = `n${Date.now()}${Math.floor(Math.random() * 100)}`; setNodes((ns) => ns.concat({ ...n, id, position: { x: n.position.x + 40, y: n.position.y + 60 }, selected: false } as Node)); };

  const handleSave = async () => {
    if (!ad.trim()) { toast.error('Akış adı zorunlu'); return; }
    setSaving(true);
    const graph = toGraph(nodes, edges);
    const triggerFilter = triggerKind === 'status' && statusFilter ? { durum: statusFilter } : null;
    const ok = await onSave({ ad: ad.trim(), triggerKind, triggerFilter, graph, aktif: initial?.aktif !== false });
    setSaving(false);
    if (ok) toast.success('Kaydedildi');
  };

  const Palette = ({ title, items }: { title: string; items: BlockDef[] }) => (
    <div className="mb-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{title}</p>
      <div className="space-y-1.5">
        {items.map((b) => {
          const col = TYPE_COLOR[b.type];
          const Icon = b.icon;
          return (
            <div key={b.subtype} draggable={b.active} onDragStart={(e) => onDragStart(e, b)}
              title={b.active ? '' : 'Yakında — bu blok için backend desteği henüz yok'}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[12px] ${b.active ? `${col.bg} ${col.bd} text-slate-700 cursor-grab hover:shadow-sm` : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'}`}>
              <Icon size={14} className={b.active ? col.ic : 'text-slate-300'} />
              <span className="flex-1 truncate">{b.label}</span>
              {!b.active && <span className="text-[8px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-100 rounded px-1 py-0.5">Yakında</span>}
              {!b.active && <Lock size={11} className="text-slate-300" />}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Üst bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white">
        <input value={ad} onChange={(e) => setAd(e.target.value)} className="font-semibold text-slate-800 px-2 py-1.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-100 w-56" placeholder="Akış adı" />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Tetikleyici:</span>
          <select value={triggerKind} onChange={(e) => updateTrigger(e.target.value)} className="text-sm px-2 py-1.5 rounded-lg border border-slate-200 bg-white outline-none">
            {TRIGGER_OPTIONS.map((t) => <option key={t.kind} value={t.kind} disabled={!t.active}>{t.label}</option>)}
          </select>
          {triggerKind === 'status' && (
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm px-2 py-1.5 rounded-lg border border-slate-200 bg-white outline-none">
              <option value="">Her durum</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-60 flex items-center gap-1.5"><Save size={15} /> {saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
          <button onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"><X size={15} /> Kapat</button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Sol palet */}
        <div className="w-56 border-r border-slate-200 overflow-y-auto p-3 bg-slate-50/60">
          <Palette title="Koşul / Karar" items={CONDITIONS} />
          <Palette title="Bekleme" items={DELAYS} />
          <Palette title="Aksiyon" items={ACTIONS} />
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0" ref={wrapper} onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onInit={(inst) => (rf.current = inst)}
            onNodeClick={(_, n) => setSelId(n.id)} onPaneClick={() => setSelId(null)}
            fitView proOptions={{ hideAttribution: true }} deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background color="#e2e8f0" gap={16} />
            <Controls />
            <MiniMap pannable zoomable className="!bg-white" />
          </ReactFlow>
        </div>

        {/* Sağ ayar paneli */}
        <div className="w-72 border-l border-slate-200 overflow-y-auto p-4 bg-white">
          {!selected ? (
            <div className="text-center text-slate-400 text-sm mt-8">
              <Zap size={24} className="mx-auto text-slate-300" />
              <p className="mt-2">Bir blok seçin veya soldan sürükleyin.</p>
              <p className="text-[11px] mt-2 text-slate-300">Koşul bloklarında yeşil = Evet, kırmızı = Hayır çıkışıdır.</p>
            </div>
          ) : (
            <NodeConfig node={selected} templates={templates} onChange={updateConfig} onDelete={delNode} onCopy={copyNode} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ayar paneli ──────────────────────────────────────────────────────────────
function NodeConfig({ node, templates, onChange, onDelete, onCopy }: { node: Node; templates: any[]; onChange: (p: any) => void; onDelete: () => void; onCopy: () => void }) {
  const data: any = node.data;
  const c = data.config || {};
  const isTrigger = data.type === 'trigger';
  const tpl = templates.find((t) => t.id === c.sablonId);
  const varN = tpl ? tplVarCount(tpl) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-bold text-slate-800 text-sm">{data.label}</h4>
        {!isTrigger && (
          <div className="flex items-center gap-1">
            <button onClick={onCopy} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center"><Copy size={13} /></button>
            <button onClick={onDelete} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 flex items-center justify-center"><Trash2 size={13} /></button>
          </div>
        )}
      </div>

      {isTrigger && <p className="text-xs text-slate-400">Tetikleyici türünü üstteki menüden değiştirebilirsiniz.</p>}

      {/* Koşullar */}
      {(data.subtype === 'amount_gt' || data.subtype === 'amount_lt') && (
        <Field label="Tutar (₺)"><input type="number" value={c.value ?? 0} onChange={(e) => onChange({ value: Number(e.target.value) })} className={inp} /></Field>
      )}
      {data.subtype === 'has_product' && (
        <Field label="Ürün kodu / adı (boş = herhangi)"><input value={c.kod || ''} onChange={(e) => onChange({ kod: e.target.value })} className={inp} placeholder="örn. ELB-001" /></Field>
      )}
      {data.subtype === 'campaign_used' && (
        <Field label="Kampanya kodu (boş = herhangi)"><input value={c.kod || ''} onChange={(e) => onChange({ kod: e.target.value })} className={inp} placeholder="örn. YAZ20" /></Field>
      )}
      {data.subtype === 'city_istanbul' && (
        <Field label="Şehir"><input value={c.city || 'istanbul'} onChange={(e) => onChange({ city: e.target.value })} className={inp} /></Field>
      )}

      {/* Bekleme */}
      {data.subtype === 'preset' && (
        <>
          <Field label="Süre"><select value={c.preset || '20m'} onChange={(e) => onChange({ preset: e.target.value })} className={inp}>{DELAY_PRESETS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</select></Field>
          {c.preset === 'custom' && <Field label="Dakika"><input type="number" min={0} max={10080} value={c.customMin ?? 0} onChange={(e) => onChange({ customMin: Number(e.target.value) })} className={inp} /></Field>}
        </>
      )}

      {/* Aksiyonlar */}
      {(data.subtype === 'send_message' || data.subtype === 'send_payment_link' || data.subtype === 'send_cargo_link') && (
        <Field label="Mesaj metni"><textarea value={c.mesaj || ''} onChange={(e) => onChange({ mesaj: e.target.value })} rows={4} className={inp + ' resize-none'} /><p className={hint}>Değişkenler: {'{ad} {no} {tutar} {link} {urun}'}</p></Field>
      )}
      {data.subtype === 'send_media' && (
        <>
          <Field label="Medya türü"><select value={c.mediaType || 'image'} onChange={(e) => onChange({ mediaType: e.target.value })} className={inp}><option value="image">Görsel</option><option value="video">Video</option><option value="document">Doküman</option></select></Field>
          <Field label="Medya URL"><input value={c.mediaUrl || ''} onChange={(e) => onChange({ mediaUrl: e.target.value })} className={inp} placeholder="https://…" /></Field>
          <Field label="Açıklama (ops.)"><input value={c.mesaj || ''} onChange={(e) => onChange({ mesaj: e.target.value })} className={inp} /></Field>
        </>
      )}
      {data.subtype === 'send_template' && (
        <>
          <Field label="Onaylı şablon">
            <select value={c.sablonId || ''} onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); const n = t ? tplVarCount(t) : 0; onChange({ sablonId: e.target.value, sablonVars: Array.from({ length: n }, (_, i) => c.sablonVars?.[i] ?? ['{ad}', '{no}', '{tutar}', '{link}', '{urun}'][i] ?? '') }); }} className={inp}>
              <option value="">— Seçin —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
            </select>
          </Field>
          {tpl?.bodyText && <div className="bg-slate-50 rounded-lg p-2 text-[11px] text-slate-500 mb-2">{tpl.bodyText}</div>}
          {Array.from({ length: varN }, (_, i) => (
            <Field key={i} label={`Değişken {{${i + 1}}}`}><input value={c.sablonVars?.[i] ?? ''} onChange={(e) => { const a = [...(c.sablonVars || [])]; a[i] = e.target.value; onChange({ sablonVars: a }); }} className={inp} /></Field>
          ))}
          {templates.length === 0 && <p className="text-[11px] text-amber-600">Onaylı şablon yok.</p>}
        </>
      )}
      {data.subtype === 'update_status' && (
        <Field label="Yeni durum"><select value={c.durum || 'hazirlaniyor'} onChange={(e) => onChange({ durum: e.target.value })} className={inp}>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
      )}
      {data.subtype === 'add_note' && (
        <Field label="Not"><textarea value={c.not || ''} onChange={(e) => onChange({ not: e.target.value })} rows={3} className={inp + ' resize-none'} /></Field>
      )}
      {(data.subtype === 'cancel_order' || data.subtype === 'complete_order' || data.subtype === 'payment_received' || data.subtype === 'first_order' || data.subtype === 'cod_payment') && !isTrigger && (
        <p className="text-xs text-slate-400 mt-1">Bu blok ek ayar gerektirmez.</p>
      )}
    </div>
  );
}

const inp = 'w-full px-2.5 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 text-sm';
const hint = 'text-[10px] text-slate-400 mt-1';
function Field({ label, children }: { label: string; children: any }) {
  return (<div className="mb-3"><label className="text-[12px] font-medium text-slate-600 block mb-1">{label}</label>{children}</div>);
}
