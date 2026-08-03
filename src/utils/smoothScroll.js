const DEFAULT_EASING = (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t));

const prefersReducedMotion = () => (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

const supportsNativeSmoothScroll = () => (
    typeof document !== 'undefined' &&
    'scrollBehavior' in document.documentElement.style
);

const getTargetTop = (target, offset = 0) => {
    if (typeof target === 'number') return target + offset;

    const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;

    if (!element) return null;
    return element.getBoundingClientRect().top + window.scrollY + offset;
};

const animateScrollFallback = (top, { duration = 0.75, easing = DEFAULT_EASING } = {}) => {
    const start = window.scrollY;
    const distance = top - start;
    if (Math.abs(distance) < 1) return;

    const startTime = performance.now();
    const durationMs = Math.max(0.1, duration) * 1000;

    const tick = (now) => {
        const progress = Math.min(1, (now - startTime) / durationMs);
        window.scrollTo(0, start + distance * easing(progress));
        if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
};

const performScroll = (top, { immediate = false, duration = 0.75, easing = DEFAULT_EASING } = {}) => {
    if (immediate || prefersReducedMotion()) {
        const previousHtmlScrollBehavior = document.documentElement.style.scrollBehavior;
        const previousBodyScrollBehavior = document.body.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        document.body.style.scrollBehavior = 'auto';
        window.scrollTo({ top, left: 0, behavior: 'auto' });
        
        requestAnimationFrame(() => {
            document.documentElement.style.scrollBehavior = previousHtmlScrollBehavior;
            document.body.style.scrollBehavior = previousBodyScrollBehavior;
        });
        return;
    }

    if (supportsNativeSmoothScroll()) {
        window.scrollTo({ top, behavior: 'smooth' });
        return;
    }

    animateScrollFallback(top, { duration, easing });
};

export const scrollToTarget = (target, options = {}) => {
    if (typeof window === 'undefined') return;

    const {
        offset = 0,
        duration = 0.75,
        immediate = false,
        easing = DEFAULT_EASING,
    } = options;

    const top = getTargetTop(target, offset);
    if (top === null) return;

    if (window.__tatScrollLockCount > 0) {
        window.__tatPendingScrollAfterUnlock = { top, immediate, duration, easing };
        return;
    }

    performScroll(top, { immediate, duration, easing });
};

export const scrollToTop = (options = {}) => {
    scrollToTarget(0, { immediate: true, duration: 0, ...options });
};

export const lockPageScroll = () => {
    if (typeof window === 'undefined') return () => {};

    window.__tatScrollLockCount = (window.__tatScrollLockCount || 0) + 1;

    if (window.__tatScrollLockCount === 1) {
        window.__tatScrollLockState = {
            scrollY: window.scrollY,
            bodyTop: document.body.style.top,
        };
        document.body.classList.add('modal-open');
        document.body.style.top = `-${window.__tatScrollLockState.scrollY}px`;
    }

    let released = false;
    return () => {
        if (released) return;
        released = true;
        window.__tatScrollLockCount = Math.max((window.__tatScrollLockCount || 1) - 1, 0);

        if (window.__tatScrollLockCount === 0) {
            const state = window.__tatScrollLockState || { scrollY: window.scrollY, bodyTop: '' };
            const pendingScroll = window.__tatPendingScrollAfterUnlock;
            document.body.classList.remove('modal-open');
            document.body.style.top = state.bodyTop || '';
            if (pendingScroll) {
                performScroll(pendingScroll.top, pendingScroll);
            } else {
                window.scrollTo({ top: state.scrollY, behavior: 'auto' });
            }
            delete window.__tatScrollLockState;
            delete window.__tatPendingScrollAfterUnlock;
        }
    };
};
