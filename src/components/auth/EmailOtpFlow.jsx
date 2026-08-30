import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Mail, RotateCcw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const EMPTY_CODE = ['', '', '', '', '', ''];
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

function isOtpRateLimitError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('resource-exhausted')
    || code.includes('too-many-requests')
    || code.includes('http-429')
    || message.includes('too many requests');
}

function getOtpError(error, fallback) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (
    code.includes('appcheck')
    || code.includes('app-check')
    || message.includes('appcheck')
    || message.includes('app-check')
    || message.includes('initial-throttle')
  ) {
    return 'La vérification de sécurité a besoin de quelques secondes. Patientez, puis réessayez.';
  }
  if (isOtpRateLimitError(error)) {
    return 'Trop de demandes. Patientez avant de réessayer.';
  }
  if (code.includes('deadline-exceeded')) return 'Ce code a expiré. Demandez-en un nouveau.';
  if (code.includes('permission-denied') || code.includes('failed-precondition')) {
    return 'Ce code est incorrect ou a déjà été utilisé.';
  }
  if (code.includes('network') || code.includes('unavailable')) {
    return 'La connexion a été interrompue. Réessayez dans quelques instants.';
  }
  return fallback;
}

const EmailOtpFlow = ({
  email: controlledEmail,
  onEmailChange,
  initialEmail = '',
  onAuthenticated,
  compact = false,
  showEmailInput = true,
  darkMode = true,
  title = 'Connexion par email',
  description = 'Recevez un code à 6 chiffres. Aucun mot de passe à retenir.',
  highlightSpamNotice = false,
}) => {
  const { requestEmailCode, loginWithEmailCode } = useAuth();
  const [internalEmail, setInternalEmail] = useState(initialEmail);
  const email = controlledEmail === undefined ? internalEmail : controlledEmail;
  const setEmail = onEmailChange || setInternalEmail;
  const [step, setStep] = useState('email');
  const [digits, setDigits] = useState(EMPTY_CODE);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [resendAfter, setResendAfter] = useState(0);
  const inputRefs = useRef([]);
  const sendInFlight = useRef(false);
  const verifyInFlight = useRef(false);
  const sentEmailRef = useRef('');

  const busy = ['sending', 'verifying', 'signing-in'].includes(status);
  const normalizedEmail = normalizeEmail(email);

  useEffect(() => {
    if (resendAfter <= 0) return undefined;
    const timer = window.setInterval(() => setResendAfter((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendAfter]);

  useEffect(() => {
    if (step === 'code' && sentEmailRef.current && normalizedEmail !== sentEmailRef.current) {
      setStep('email');
      setDigits(EMPTY_CODE);
      setStatus('idle');
      setMessage('Adresse modifiée : demandez un nouveau code.');
    }
  }, [normalizedEmail, step]);

  const sendCode = async (event) => {
    event?.preventDefault?.();
    if (sendInFlight.current || busy || resendAfter > 0) return;
    if (!isValidEmail(normalizedEmail)) {
      setStatus('error');
      setMessage('Saisissez une adresse email valide.');
      return;
    }
    sendInFlight.current = true;
    setStatus('sending');
    setMessage('Envoi du code en cours…');
    setDigits(EMPTY_CODE);
    sentEmailRef.current = normalizedEmail;
    setStep('code');
    try {
      const result = await requestEmailCode(normalizedEmail);
      setResendAfter(Number(result?.data?.resendAfterSeconds || 60));
      setStatus('sent');
      setMessage(`Code envoyé à ${normalizedEmail}.`);
      window.setTimeout(() => inputRefs.current[0]?.focus(), 80);
    } catch (error) {
      if (isOtpRateLimitError(error)) {
        // A previous request may already have delivered the code. Keep the user
        // on the code screen instead of replacing that success with a false error.
        setResendAfter((value) => Math.max(value, 60));
        setStatus('sent');
        setMessage(`Un code vient déjà d'être envoyé à ${normalizedEmail}.`);
        window.setTimeout(() => inputRefs.current[0]?.focus(), 80);
      } else {
        setStatus('error');
        setMessage(getOtpError(error, "Impossible d'envoyer le code."));
      }
    } finally {
      sendInFlight.current = false;
    }
  };

  const verifyCode = async (event, override = '') => {
    event?.preventDefault?.();
    if (verifyInFlight.current) return;
    const code = override || digits.join('');
    if (!/^\d{6}$/.test(code)) {
      setStatus('error');
      setMessage('Saisissez les 6 chiffres du code.');
      return;
    }
    verifyInFlight.current = true;
    setStatus('verifying');
    setMessage('Vérification du code…');
    try {
      setStatus('signing-in');
      const result = await loginWithEmailCode(sentEmailRef.current || normalizedEmail, code);
      setStatus('success');
      setMessage('Email vérifié. Vous êtes connecté.');
      onAuthenticated?.(result?.user || null);
    } catch (error) {
      setStatus('error');
      setMessage(getOtpError(error, 'Code incorrect ou expiré.'));
    } finally {
      verifyInFlight.current = false;
    }
  };

  const changeDigit = (index, value) => {
    const numeric = String(value || '').replace(/\D/g, '');
    if (numeric.length > 1) {
      const pasted = numeric.slice(0, 6);
      const next = Array.from({ length: 6 }, (_, digitIndex) => pasted[digitIndex] || '');
      setDigits(next);
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
      if (pasted.length === 6) window.setTimeout(() => verifyCode(null, pasted), 0);
      return;
    }
    const next = digits.map((digit, digitIndex) => digitIndex === index ? numeric : digit);
    setDigits(next);
    setMessage('');
    if (numeric) inputRefs.current[index + 1]?.focus();
    if (next.every(Boolean)) window.setTimeout(() => verifyCode(null, next.join('')), 0);
  };

  const pasteCode = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length < 2) return;
    event.preventDefault();
    changeDigit(0, pasted);
  };

  const fieldClass = darkMode
    ? 'border-white/10 bg-white/[0.055] text-white placeholder:text-stone-500 focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20'
    : 'border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:ring-2 focus:ring-stone-200';
  const messageClass = status === 'error'
    ? 'text-red-400'
    : status === 'success' ? 'text-emerald-400' : (darkMode ? 'text-stone-400' : 'text-stone-500');

  if (status === 'success') {
    return (
      <div className={`flex items-start gap-3 rounded-2xl border p-4 ${darkMode ? 'border-emerald-400/25 bg-emerald-400/10' : 'border-emerald-200 bg-emerald-50'}`} role="status">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-500" />
        <div>
          <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-stone-900'}`}>Adresse email confirmée</p>
          <p className="mt-1 text-xs text-stone-500">{sentEmailRef.current || normalizedEmail}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex items-start gap-3">
        <Mail size={18} className={`mt-0.5 shrink-0 ${darkMode ? 'text-amber-200' : 'text-amber-600'}`} />
        <div>
          <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-stone-900'}`}>{title}</p>
          <p className={`mt-1 text-xs leading-relaxed ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>{description}</p>
        </div>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-3">
          {showEmailInput ? <input
            type="email"
            value={email}
            onChange={(event) => { setEmail(event.target.value); setMessage(''); }}
            placeholder="Adresse email"
            aria-label="Adresse email"
            autoComplete="email"
            required
            className={`w-full rounded-2xl border px-4 py-3.5 text-sm font-bold outline-none transition-all ${fieldClass}`}
          /> : null}
          <button type="submit" disabled={busy || !isValidEmail(email)} className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[11px] font-black uppercase tracking-[0.18em] transition-all disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? 'bg-white text-stone-950 hover:bg-amber-100' : 'bg-stone-900 text-white hover:bg-stone-800'}`}>
            {status === 'sending' ? <Loader2 size={15} className="animate-spin" /> : null}
            {status === 'sending' ? 'Envoi…' : 'Recevoir mon code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-3">
          <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => { inputRefs.current[index] = element; }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                value={digit}
                onChange={(event) => changeDigit(index, event.target.value)}
                onPaste={pasteCode}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
                }}
                disabled={busy}
                aria-label={`Chiffre ${index + 1} du code`}
                className={`h-12 min-w-0 rounded-xl border text-center text-lg font-black outline-none transition-all sm:h-14 ${fieldClass}`}
              />
            ))}
          </div>
          <button type="submit" disabled={busy || !digits.every(Boolean)} className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[11px] font-black uppercase tracking-[0.18em] transition-all disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? 'bg-white text-stone-950 hover:bg-amber-100' : 'bg-stone-900 text-white hover:bg-stone-800'}`}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {status === 'signing-in' ? 'Connexion…' : status === 'verifying' ? 'Vérification…' : 'Valider le code'}
          </button>
          <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-stone-500">
            <button type="button" onClick={() => { setStep('email'); setDigits(EMPTY_CODE); setStatus('idle'); setMessage(''); }} className="transition-colors hover:text-amber-500">Modifier l&apos;email</button>
            <button type="button" onClick={sendCode} disabled={busy || resendAfter > 0} className="inline-flex items-center gap-1.5 transition-colors hover:text-amber-500 disabled:opacity-50">
              <RotateCcw size={13} /> {resendAfter > 0 ? `Renvoyer dans ${resendAfter}s` : 'Renvoyer le code'}
            </button>
          </div>
        </form>
      )}

      {message ? (
        <p className={`text-center text-xs font-semibold ${messageClass}`} role={status === 'error' ? 'alert' : 'status'} aria-live="polite">
          {message}
          {status === 'sent' && highlightSpamNotice ? (
            <strong className="ml-1 inline-block font-black text-red-400 [text-shadow:0_0_6px_rgba(248,113,113,0.95),0_0_16px_rgba(239,68,68,0.65)]">
              Pensez à vérifier vos spams.
            </strong>
          ) : status === 'sent' ? ' Pensez à vérifier vos spams.' : null}
        </p>
      ) : null}
    </div>
  );
};

export default EmailOtpFlow;
