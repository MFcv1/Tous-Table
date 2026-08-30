import React from 'react';
import { gsap } from 'gsap';
import { Hammer } from 'lucide-react';
import { isLowPowerMobileDevice } from '../../utils/devicePerformance';

const BRAND_CHARS = 'TOUS \u00c0 TABLE'.split('');

const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
const shouldUseLeanPreloaderMotion = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;

  const ua = navigator.userAgent || '';
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  const mobileViewport = window.innerWidth <= 767 || window.matchMedia?.('(max-width: 767px)').matches;
  if (/Android/i.test(ua) && coarsePointer && mobileViewport) return true;

  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);

  if (memory > 0 && memory <= 4) return true;
  if (cores > 0 && cores <= 4) return true;

  // Recent Galaxy S/Ultra, iPhone Pro, etc. keep the full text blur animation.
  if (memory >= 6 || cores >= 6) return false;

  return isLowPowerMobileDevice();
};

const shouldUseMobileTitleMaskMotion = () => {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  const mobileViewport = window.innerWidth <= 767 || window.matchMedia?.('(max-width: 767px)').matches;
  return Boolean(coarsePointer && mobileViewport);
};

const waitForPaint = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(resolve, 0);
    return;
  }

  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

const StartupPreloader = ({
  warmup,
  onComplete,
  minDuration = 0,
  maxDuration = 3200,
}) => {
  const rootRef = React.useRef(null);
  const completeRef = React.useRef(false);
  const onCompleteRef = React.useRef(onComplete);
  const leanMobileMotion = React.useMemo(() => shouldUseLeanPreloaderMotion(), []);
  const mobileTitleMaskMotion = React.useMemo(() => shouldUseMobileTitleMaskMotion(), []);

  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  React.useLayoutEffect(() => {
    let cancelled = false;
    let introTimeline = null;
    let exitTimeline = null;
    let resolveIntro = null;
    let failSafeTimer = null;
    const root = rootRef.current;

    if (!root) return undefined;

    const secondary = root.querySelector('.tat-startup-preloader-secondary');
    const panel = root.querySelector('.tat-startup-preloader-panel');
    const content = root.querySelector('.tat-startup-preloader-content');
    const icon = root.querySelector('.tat-startup-preloader-icon');
    const title = root.querySelector('.tat-startup-preloader-title');
    const chars = root.querySelectorAll('.tat-startup-preloader-char');
    const footer = root.querySelector('.tat-startup-preloader-footer');
    const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const useLeanMotion = leanMobileMotion;
    const useTitleMaskMotion = mobileTitleMaskMotion;
    const initialCharBlur = useLeanMotion ? 'none' : (isCoarsePointer ? 'blur(3px)' : 'blur(10px)');
    const initialIconBlur = useLeanMotion ? 'none' : (isCoarsePointer ? 'blur(3px)' : 'blur(5px)');
    const initialCharY = useLeanMotion ? 26 : (isCoarsePointer ? 32 : 40);
    const iconIntroVars = {
      scale: 1,
      opacity: 1,
      duration: useLeanMotion ? 0.82 : 1.0,
      ease: useLeanMotion ? 'power3.out' : 'expo.out',
      force3D: true,
    };
    const charIntroVars = {
      y: 0,
      opacity: 1,
      duration: useLeanMotion ? 0.82 : 1.0,
      stagger: useLeanMotion ? 0.05 : 0.06,
      ease: useLeanMotion ? 'power3.out' : 'expo.out',
      force3D: true,
    };

    if (!useLeanMotion) {
      iconIntroVars.filter = 'blur(0px)';
      charIntroVars.filter = 'blur(0px)';
    }

    completeRef.current = false;
    document.body.classList.add('tat-startup-preloading');
    if (typeof window !== 'undefined') {
      window.hasShownPreloader = true;
      window.__tatStartupPreloaderIntroComplete = false;
    }

    const finish = () => {
      if (completeRef.current) return;
      completeRef.current = true;
      if (failSafeTimer) clearTimeout(failSafeTimer);
      root.style.pointerEvents = 'none';
      root.style.opacity = '0';
      document.body.classList.remove('tat-startup-preloading');
      onCompleteRef.current?.();
    };

    // requestAnimationFrame/GSAP can be heavily throttled in a background tab.
    // The preloader must never remain a permanent interaction barrier.
    failSafeTimer = setTimeout(finish, Math.max(4500, maxDuration + 1500));

    gsap.set(content, { opacity: 0 });
    gsap.set(icon, { scale: 0.8, opacity: 0, filter: initialIconBlur, force3D: true });
    if (useTitleMaskMotion) {
      gsap.set(title, { yPercent: 112, opacity: 1, color: '#9C8268', filter: 'none', force3D: true });
      gsap.set(chars, { y: 0, opacity: 1, filter: 'none', force3D: false });
    } else {
      gsap.set(chars, { y: initialCharY, opacity: 0, filter: initialCharBlur, force3D: true });
    }
    gsap.set(footer, { y: 8, opacity: 0, force3D: true });
    gsap.set([secondary, panel], { yPercent: 0, force3D: true });

    const introTask = new Promise((resolve) => {
      resolveIntro = resolve;
      introTimeline = gsap.timeline({
        onComplete: () => {
          if (typeof window !== 'undefined') {
            window.__tatStartupPreloaderIntroComplete = true;
            window.dispatchEvent(new CustomEvent('tat-startup-preloader-intro-complete'));
          }
          resolve();
        },
      });

      introTimeline
        .to(content, { opacity: 1, duration: 0.1 })
        .to(icon, iconIntroVars);

      if (useTitleMaskMotion) {
        introTimeline.to(title, {
          yPercent: 0,
          opacity: 1,
          color: '#FAF9F6',
          duration: 0.78,
          ease: 'power3.out',
          force3D: true,
        }, '-=0.44');
      } else {
        introTimeline.to(chars, charIntroVars, '-=0.5');
      }

      introTimeline
        .to(footer, {
          y: 0,
          opacity: 1,
          duration: 0.78,
          ease: 'sine.out',
          force3D: true,
        }, useTitleMaskMotion ? '-=0.14' : '-=0.48');
    });

    const run = async () => {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

      await Promise.allSettled([
        introTask,
        wait(minDuration),
      ]);

      if (cancelled) return;
      await waitForPaint();

      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
      const remainingBudget = Math.max(450, maxDuration - elapsed);
      const warmupBudget = Math.min(isCoarsePointer ? (useLeanMotion ? 260 : 420) : 1100, remainingBudget);
      const warmupTask = Promise.resolve()
        .then(() => warmup?.())
        .catch(() => undefined);

      await Promise.race([warmupTask, wait(warmupBudget)]);

      if (cancelled) return;
      await waitForPaint();

      exitTimeline = gsap.timeline({ onComplete: finish });
      exitTimeline
        .to(secondary, {
          yPercent: -100,
          duration: 0.8,
          ease: 'expo.inOut',
          force3D: true,
        }, 'exit')
        .to(panel, {
          yPercent: -100,
          duration: 0.8,
          ease: 'expo.inOut',
          force3D: true,
        }, 'exit+=0.05');
    };

    run();

    return () => {
      cancelled = true;
      introTimeline?.kill();
      exitTimeline?.kill();
      resolveIntro?.();
      if (failSafeTimer) clearTimeout(failSafeTimer);
      document.body.classList.remove('tat-startup-preloading');
    };
  }, [warmup, minDuration, maxDuration, mobileTitleMaskMotion, leanMobileMotion]);

  return (
    <div
      ref={rootRef}
      className={`tat-startup-preloader${leanMobileMotion ? ' tat-startup-preloader--lean' : ''}${mobileTitleMaskMotion ? ' tat-startup-preloader--mobile-mask' : ''}`}
      role="status"
      aria-label="Chargement de Tous a Table"
    >
      <div className="tat-startup-preloader-secondary" />
      <div className="tat-startup-preloader-panel">
        <div className="tat-startup-preloader-content">
          <div className="tat-startup-preloader-icon" aria-hidden="true">
            <Hammer size={56} strokeWidth={1} />
          </div>

          <div className="tat-startup-preloader-brand">
            <div className="tat-startup-preloader-title-mask">
              <div className="tat-startup-preloader-title" aria-hidden="true">
                {BRAND_CHARS.map((char, index) => (
                  <span
                    key={`${char}-${index}`}
                    className="tat-startup-preloader-char"
                    style={{ '--tat-char-index': index }}
                  >
                    {char === ' ' ? '\u00a0' : char}
                  </span>
                ))}
              </div>
            </div>
            <span className="sr-only">Chargement de Tous a Table</span>

            <div className="tat-startup-preloader-footer" aria-hidden="true">
              <span />
              <span>Atelier Normand</span>
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StartupPreloader;
