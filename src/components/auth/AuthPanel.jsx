import React, { useState } from 'react';
import { Hammer, ShieldCheck, X, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { googleProvider } from '../../firebase/config';

const AuthPanel = ({ onClose, onSuccess, darkMode }) => {
  const { loginWithGoogle, loginWithEmail, signupWithEmail, verifyEmail } = useAuth();
  const toast = useToast();
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showAuthSuccess, setShowAuthSuccess] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSocialLogin = async (provider) => {
    try {
      await loginWithGoogle();
      if (onSuccess) onSuccess();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        toast("Erreur de connexion sociale.", { type: 'error' });
      }
    }
  };

  if (showAuthSuccess) {
    return (
      <div className="relative p-5 md:p-8 space-y-5 md:space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 h-full flex flex-col justify-center text-stone-100">
        <div className="mx-auto inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-300/10 text-amber-200 ring-1 ring-amber-200/20">
            <Hammer size={15} />
          </span>
          <span className="text-left">
            <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-white">Tous à Table</span>
            <span className="block font-serif text-[11px] italic text-stone-400">Atelier Normand</span>
          </span>
        </div>
        <div className="w-16 h-16 bg-emerald-400/10 rounded-2xl flex items-center justify-center mx-auto text-emerald-300 border border-emerald-300/20 shadow-[0_0_35px_rgba(52,211,153,0.14)]">
          <ShieldCheck size={34} />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-black tracking-tight text-white">Vérifiez vos emails</h3>
          <p className="text-sm text-stone-300 font-medium px-2 leading-relaxed">
            Un lien de confirmation vient d'être envoyé. <br />
            <span className="text-amber-200 font-bold">Pensez à regarder dans vos spams.</span>
          </p>
        </div>
        <button onClick={() => { setShowAuthSuccess(false); if (onClose) onClose(); }} className="w-full py-4 rounded-2xl bg-white text-stone-950 font-black uppercase text-[10px] tracking-[0.2em] transition-all hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 mt-auto md:mt-0">
          C'est compris
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col w-full text-stone-100 animate-in fade-in duration-500">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-stone-400 transition-all hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 md:h-10 md:w-10"
          aria-label="Fermer la connexion"
        >
          <X size={18} />
        </button>
      )}

      {/* HEADER */}
      <div className="px-5 pb-4 pt-5 border-b border-white/10 md:px-8 md:pb-5 md:pt-8">
        <div className="mb-4 flex items-center justify-between gap-4 pr-10 md:mb-7 md:pr-11">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-amber-200/20 bg-amber-300/10 text-amber-200 shadow-[0_0_30px_rgba(245,174,80,0.10)] md:h-10 md:w-10">
              <Hammer size={17} />
            </div>
            <div className="text-left leading-none">
              <p className="text-[13px] font-black uppercase tracking-[0.18em] text-white">Tous à Table</p>
              <p className="mt-1 font-serif text-xs italic text-stone-400">Atelier Normand</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200 md:inline-flex">Sécurisé</span>
        </div>

        <div className="space-y-2 text-left md:space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-200 md:py-1.5">
            <ShieldCheck size={12} />
            Accès vente
          </div>
          <h3 className="text-[1.7rem] font-black leading-none tracking-tight text-white md:text-[2rem]">Connexion</h3>
          <p className="max-w-[31ch] text-[13px] font-medium leading-snug text-stone-400 md:text-sm md:leading-relaxed">Identifiez-vous pour accéder à la vente et retrouver vos pièces sélectionnées.</p>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4 md:space-y-5 md:px-8 md:py-7 flex-1 overflow-y-auto ios-modal-scroll">
        {/* FORMULAIRE EMAIL */}
        <form onSubmit={async (e) => {
          e.preventDefault();
          const email = e.target.email.value;
          const pass = e.target.password.value;
          const confirmPass = e.target.confirmPassword?.value;

          try {
            if (isSignUp) {
              if (pass !== confirmPass) throw new Error("Les mots de passe ne correspondent pas.");
              const userCredential = await signupWithEmail(email, pass);
              await verifyEmail(userCredential.user);
              setShowAuthSuccess(true);
            } else {
              await loginWithEmail(email, pass);
              if (onSuccess) onSuccess();
            }
          } catch (err) {
            let msg = "Une erreur est survenue.";
            if (err.message === "Les mots de passe ne correspondent pas.") msg = err.message;
            else if (err.code === 'auth/email-already-in-use') msg = "Cet email est déjà associé à un compte. Connectez-vous.";
            else if (err.code === 'auth/weak-password') msg = "Le mot de passe doit contenir au moins 6 caractères.";
            else if (err.code === 'auth/invalid-email') msg = "L'adresse email n'est pas valide.";
            else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') msg = "Email ou mot de passe incorrect.";

            toast(msg, { type: 'error' });
          }
        }} className="space-y-2.5 md:space-y-3">

          <input name="email" type="email" placeholder="Adresse email" className="w-full rounded-2xl bg-white/[0.055] border border-white/10 px-4 py-3.5 font-bold text-sm outline-none transition-all text-white placeholder:text-stone-500 hover:bg-white/[0.075] focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20 md:p-4 md:text-base" required autoComplete="email" />

          <div className="relative">
            <input name="password" type={showPassword ? "text" : "password"} placeholder="Mot de passe" className="w-full rounded-2xl bg-white/[0.055] border border-white/10 px-4 py-3.5 pr-12 font-bold text-sm outline-none transition-all text-white placeholder:text-stone-500 hover:bg-white/[0.075] focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20 md:p-4 md:pr-12 md:text-base" required autoComplete="current-password" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-500 transition-colors hover:text-amber-100 focus-visible:outline-none focus-visible:text-amber-100">
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className={`transition-all duration-300 overflow-hidden ${isSignUp ? 'max-h-[100px] mb-2.5 md:mb-3' : 'max-h-0'}`}>
            <div className="relative">
              <input name="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Confirmer mot de passe" className="w-full rounded-2xl bg-white/[0.055] border border-white/10 px-4 py-3.5 pr-12 font-bold text-sm outline-none transition-all text-white placeholder:text-stone-500 hover:bg-white/[0.075] focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20 md:p-4 md:pr-12 md:text-base" required={isSignUp} autoComplete="new-password" />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-500 transition-colors hover:text-amber-100 focus-visible:outline-none focus-visible:text-amber-100">
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button type="submit" className="w-full rounded-2xl bg-white py-3.5 text-stone-950 font-black uppercase text-[10px] tracking-[0.22em] transition-all hover:bg-amber-100 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 md:py-4">
            <span>{isSignUp ? "S'inscrire" : "Continuer"}</span>
          </button>
        </form>

        {/* DIVIDER */}
        <div className="flex items-center gap-4 mt-2">
          <div className="h-px bg-white/10 flex-1"></div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-600">OU</span>
          <div className="h-px bg-white/10 flex-1"></div>
        </div>

        {/* GOOGLE */}
        <button onClick={() => handleSocialLogin(googleProvider)} className="mt-2 group w-full flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3.5 font-bold text-white transition-all hover:border-white/20 hover:bg-white/[0.11] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 md:p-4">
          <div className="bg-white rounded-full p-1 shadow-sm"><img src="https://www.google.com/favicon.ico" className="w-3 h-3" alt="G" /></div>
          <span>Continuer avec Google</span>
        </button>

        {/* FOOTER ACTIONS */}
        <div className="flex justify-between items-center px-1 pt-4 mt-auto mb-4">
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-[10px] font-bold text-stone-500 transition-colors hover:text-amber-100 focus-visible:outline-none focus-visible:text-amber-100">
            {isSignUp ? "J'ai déjà un compte" : "Pas de compte ?"}
          </button>
          
          {onClose && (
            <button onClick={onClose} className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-500 transition-colors hover:text-red-300 focus-visible:outline-none focus-visible:text-red-300">
              Annuler
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPanel;
