import { useState } from 'react';
import { X, UserCircle, Mail, KeyRound, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../lib/api';

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [busy, setBusy] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== (user?.email || '').toLowerCase();
  const wantsPw = !!newPassword;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wantsPw && newPassword !== newPassword2) { toast.error('Yeni şifreler eşleşmiyor'); return; }
    if (wantsPw && newPassword.length < 6) { toast.error('Yeni şifre en az 6 karakter olmalı'); return; }
    if ((emailChanged || wantsPw) && !currentPassword) { toast.error('Mevcut şifrenizi girin'); return; }
    setBusy(true);
    try {
      const payload: any = {};
      if (fullName.trim() && fullName.trim() !== user?.fullName) payload.fullName = fullName.trim();
      if (emailChanged) payload.email = email.trim();
      if (wantsPw) payload.newPassword = newPassword;
      if (emailChanged || wantsPw) payload.currentPassword = currentPassword;
      if (!Object.keys(payload).length) { toast('Değişiklik yok'); onClose(); return; }
      await updateProfile(payload);
      toast.success('Profil güncellendi');
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><UserCircle size={20} className="text-emerald-600" /> Profilim</h3>
          <button type="button" onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500">Ad Soyad</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="Ad Soyad" />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5"><Mail size={13} /> E-posta</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="ornek@firma.com" />
        </div>

        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5"><KeyRound size={13} /> Şifre Değiştir (opsiyonel)</p>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="Yeni şifre" autoComplete="new-password" />
          <input type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="Yeni şifre (tekrar)" autoComplete="new-password" />
        </div>

        {(emailChanged || wantsPw) && (
          <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <label className="text-xs font-medium text-amber-700">Güvenlik için mevcut şifrenizi girin</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg" placeholder="Mevcut şifre" autoComplete="current-password" />
          </div>
        )}

        <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-60">
          <Save size={16} /> {busy ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </form>
    </div>
  );
}
