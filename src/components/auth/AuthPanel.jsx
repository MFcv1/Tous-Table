import React, { useState } from 'react';
import { Hammer, Loader2, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import EmailOtpFlow from './EmailOtpFlow';

const AuthPanel = ({ onClose, onSuccess }) => {
  const { loginWithGoogle } = useAuth();
  const toast = useToast();
  const [googlePending, setGooglePending] = useState(false);

  const handleGoogle = async () => {
    if (googlePending) return;
    setGooglePending(true);
    try {
      const result = await loginWithGoogle();
      if (result) onSuccess?.(result.user);
    } catch (error) {
      if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        toast('La connexion Google a échoué. Réessayez.', { type: 'error' });
      }
    } finally {
      setGooglePending(false);
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col text-stone-100 animate-in fade-in duration-500">
      {onClose ? (
        <button type="button" onClick={onClose} className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-stone-400 transition-all hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200" aria-label="Fermer la connexion">
          <X size={18} />
        </button>
      ) : null}

      <div className="border-b border-white/10 px-5 pb-5 pt-5 md:px-8 md:pb-6 md:pt-8">
        <div className="mb-6 flex items-center justify-between gap-4 pr-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-200/20 bg-amber-300/10 text-amber-200 shadow-[0_0_30px_rgba(245,174,80,0.10)]">
              <Hammer size={17} />
            </div>
            <div className="text-left leading-none">
              <p className="text-[13px] font-black uppercase tracking-[0.18em] text-white">Tous à Table</p>
              <p className="mt-1 font-serif text-xs italic text-stone-400">Atelier Normand</p>
            </div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200 md:inline-flex"><ShieldCheck size={11} /> Sécurisé</span>
        </div>
        <h3 className="text-[1.8rem] font-black leading-none tracking-tight text-white md:text-[2rem]">Bienvenue</h3>
        <p className="mt-3 max-w-[35ch] text-sm font-medium leading-relaxed text-stone-400">Connectez-vous sans mot de passe pour retrouver vos commandes et vos documents.</p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 ios-modal-scroll md:px-8 md:py-7">
        <button type="button" onClick={handleGoogle} disabled={googlePending} className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3.5 font-bold text-white transition-all hover:border-white/20 hover:bg-white/[0.11] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70">
          {googlePending ? <Loader2 size={16} className="animate-spin" /> : <span className="rounded-full bg-white p-1 shadow-sm"><img src="https://www.google.com/favicon.ico" className="h-3 w-3" alt="" /></span>}
          <span>{googlePending ? 'Connexion avec Google…' : 'Continuer avec Google'}</span>
        </button>

        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-600">ou par email</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <EmailOtpFlow
          onAuthenticated={onSuccess}
          darkMode
          highlightSpamNotice
          title="Un email, un code, c’est tout"
          description="Nous vous envoyons un code à usage court. Il crée votre espace automatiquement si c’est votre première visite."
        />
        <p className="pt-2 text-center text-[11px] leading-relaxed text-stone-600">Le code expire après 10 minutes et ne doit jamais être partagé.</p>
      </div>
    </div>
  );
};

export default AuthPanel;
