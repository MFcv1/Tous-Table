import React, { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import EmailOtpFlow from '../components/auth/EmailOtpFlow';
import SEO from '../components/shared/SEO';

function LoginView({ onSuccess }) {
  const { loginWithGoogle } = useAuth();
  const [googlePending, setGooglePending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  return (
    <>
      <SEO title="Administration" description="Acces restreint a l'administration Tous a Table." url="/admin" robots="noindex,nofollow,noarchive" />
      <div className="mx-auto max-w-md px-5 py-28 text-center text-stone-900 animate-in zoom-in-95">
        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-2xl md:p-9">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 text-white shadow-xl"><Lock size={28} /></div>
          <div className="mb-7 mt-5 space-y-2">
            <h2 className="text-3xl font-black tracking-tighter">Portail Maître</h2>
            <p className="font-serif text-xs italic text-stone-400">Accès restreint à l’administration</p>
          </div>

          <button type="button" disabled={googlePending} onClick={async () => {
            setGooglePending(true);
            setErrorMsg('');
            try {
              const result = await loginWithGoogle();
              if (result) onSuccess?.(result.user);
            } catch {
              setErrorMsg('La connexion Google a échoué.');
            } finally {
              setGooglePending(false);
            }
          }} className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-stone-200 bg-white py-4 text-xs font-black uppercase tracking-widest shadow-sm transition-all hover:bg-stone-50 disabled:opacity-50">
            {googlePending ? <Loader2 size={16} className="animate-spin" /> : <img src="https://www.google.com/favicon.ico" className="h-4 w-4" alt="" />}
            Google
          </button>

          <div className="my-6 flex items-center gap-4"><div className="h-px flex-1 bg-stone-200" /><span className="text-[10px] font-black uppercase tracking-widest text-stone-300">ou</span><div className="h-px flex-1 bg-stone-200" /></div>
          <EmailOtpFlow onAuthenticated={onSuccess} darkMode={false} title="Code de connexion" description="Saisissez votre email administrateur puis le code reçu." />
          {errorMsg ? <p className="mt-4 rounded-xl bg-red-50 py-2 text-[11px] font-bold text-red-600">{errorMsg}</p> : null}
        </div>
      </div>
    </>
  );
}

export default LoginView;
