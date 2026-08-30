import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Users, Clock, Activity, Smartphone, Monitor, Globe, Trash2, AlertCircle, ChevronDown, ChevronRight,
    TrendingUp, MousePointerClick, ShoppingBag, RefreshCw
} from 'lucide-react';
import { collection, query, orderBy, limit, getDocs, where, Timestamp } from 'firebase/firestore';
import { db, functions } from '../../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { getMillis } from '../../utils/time';
import {
    ANALYTICS_TIME_FILTERS,
    MAX_ANALYTICS_SESSIONS,
    buildVisitorDayGroups,
    buildAnalyticsStats,
    getAnalyticsWindow,
    getReliableVisitorKey
} from './analyticsReliability';

let cachedAnalyticsSessions = null;
let cachedAnalyticsSessionsLoadedAt = null;
let cachedAffiliateClicks = null;
let cachedAffiliateClicksLoadedAt = null;

const ADMIN_ANALYTICS_CACHE_DB = 'tat-admin-analytics-cache-v1';
const ADMIN_ANALYTICS_CACHE_STORE = 'snapshots';
const ADMIN_ANALYTICS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ADMIN_SESSIONS_CACHE_KEY = 'traffic-sessions';
const ADMIN_AFFILIATE_CACHE_KEY = 'affiliate-clicks';
const OMIT_CACHE_FIELDS = new Set(['email', 'syncTokenHash', 'userAgent']);

const openAdminAnalyticsCache = () => new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
    }

    const request = window.indexedDB.open(ADMIN_ANALYTICS_CACHE_DB, 1);
    request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ADMIN_ANALYTICS_CACHE_STORE)) {
            database.createObjectStore(ADMIN_ANALYTICS_CACHE_STORE, { keyPath: 'key' });
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
});

const serializeAnalyticsCacheValue = (value) => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
    if (value instanceof Date) return { __tatType: 'timestamp', seconds: Math.floor(value.getTime() / 1000), nanoseconds: (value.getTime() % 1000) * 1000000 };
    if (typeof value.toMillis === 'function') {
        const ms = value.toMillis();
        return { __tatType: 'timestamp', seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1000000 };
    }
    if (Array.isArray(value)) return value.map(serializeAnalyticsCacheValue);
    if (typeof value === 'object') {
        return Object.entries(value).reduce((acc, [key, item]) => {
            if (!OMIT_CACHE_FIELDS.has(key) && typeof item !== 'function') {
                acc[key] = serializeAnalyticsCacheValue(item);
            }
            return acc;
        }, {});
    }
    return null;
};

const deserializeAnalyticsCacheValue = (value) => {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(deserializeAnalyticsCacheValue);
    if (typeof value === 'object') {
        if (value.__tatType === 'timestamp' && typeof value.seconds === 'number') {
            return Timestamp.fromMillis((value.seconds * 1000) + Math.round((value.nanoseconds || 0) / 1000000));
        }
        return Object.entries(value).reduce((acc, [key, item]) => {
            acc[key] = deserializeAnalyticsCacheValue(item);
            return acc;
        }, {});
    }
    return value;
};

const readAdminAnalyticsCache = async (key) => {
    try {
        const database = await openAdminAnalyticsCache();
        return await new Promise((resolve, reject) => {
            const tx = database.transaction(ADMIN_ANALYTICS_CACHE_STORE, 'readwrite');
            const store = tx.objectStore(ADMIN_ANALYTICS_CACHE_STORE);
            const request = store.get(key);
            request.onsuccess = () => {
                const snapshot = request.result;
                if (!snapshot || snapshot.version !== 1 || snapshot.expiresAt < Date.now()) {
                    if (snapshot) store.delete(key);
                    resolve(null);
                    return;
                }
                resolve({
                    loadedAt: snapshot.loadedAt,
                    data: deserializeAnalyticsCacheValue(snapshot.data)
                });
            };
            request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
        });
    } catch {
        return null;
    }
};

const writeAdminAnalyticsCache = async (key, data, loadedAt) => {
    try {
        const database = await openAdminAnalyticsCache();
        await new Promise((resolve, reject) => {
            const tx = database.transaction(ADMIN_ANALYTICS_CACHE_STORE, 'readwrite');
            tx.objectStore(ADMIN_ANALYTICS_CACHE_STORE).put({
                key,
                version: 1,
                loadedAt,
                expiresAt: loadedAt + ADMIN_ANALYTICS_CACHE_TTL_MS,
                data: serializeAnalyticsCacheValue(data)
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
        });
    } catch {
        // Le cache local ne doit jamais bloquer l'analytics admin.
    }
};

const clearAdminAnalyticsCache = async (key) => {
    try {
        const database = await openAdminAnalyticsCache();
        await new Promise((resolve, reject) => {
            const tx = database.transaction(ADMIN_ANALYTICS_CACHE_STORE, 'readwrite');
            tx.objectStore(ADMIN_ANALYTICS_CACHE_STORE).delete(key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
        });
    } catch {
        // Ignorer si le cache navigateur n'est pas disponible.
    }
};

// ─── Custom SVG Bar Chart — Premium responsive (remplace Recharts) ──
const TrafficChart = ({ data, darkMode, valueLabel = 'visite', animationKey = 0 }) => {
    const containerRef = useRef(null);
    const [dims, setDims] = useState({ w: 600, h: 280 });
    const [activeIdx, setActiveIdx] = useState(null);
    const isMobile = dims.w < 500;

    // Marges adaptatives (plus serrées sur mobile)
    const margin = useMemo(() => ({
        top: 20,
        right: isMobile ? 8 : 16,
        bottom: isMobile ? 28 : 36,
        left: isMobile ? 28 : 40
    }), [isMobile]);

    const chartW = dims.w - margin.left - margin.right;
    const chartH = dims.h - margin.top - margin.bottom;

    // ── ResizeObserver ──
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0) setDims({ w: width, h: height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── Calculs du graphique ──
    const maxVal = useMemo(() => Math.max(1, ...data.map(d => d.visites)), [data]);

    // Y ticks intelligents (moins de ticks sur mobile)
    const yTicks = useMemo(() => {
        const count = isMobile ? 3 : 5;
        const ticks = [];
        const step = Math.max(1, Math.ceil(maxVal / count));
        for (let i = 0; i <= maxVal; i += step) ticks.push(i);
        if (ticks[ticks.length - 1] < maxVal) ticks.push(maxVal);
        return ticks;
    }, [maxVal, isMobile]);

    // Dimensions des barres — minimum garanti pour tactile
    const barMetrics = useMemo(() => {
        const n = data.length;
        if (n === 0) return { barW: 0, gap: 0, total: 0 };

        // Desktop : gap proportionnel, Mobile : gap minimal pour maximiser barW
        const gapRatio = isMobile ? 0.15 : 0.25;
        const totalGaps = n > 1 ? (n - 1) : 0;
        
        // Calcul avec un minimum de 4px par barre (visible) et 1px de gap
        let gap = Math.max(1, Math.round((chartW * gapRatio) / Math.max(1, totalGaps)));
        let barW = n > 0 ? (chartW - gap * totalGaps) / n : 0;
        
        // Si les barres sont trop fines, on réduit le gap
        if (barW < 4 && n > 1) {
            gap = 1;
            barW = (chartW - gap * totalGaps) / n;
        }

        // Minimum absolu de largeur de barre
        barW = Math.max(isMobile ? 3 : 4, barW);

        // Cap la largeur max — plafond serré pour une cohérence visuelle quel que soit le nb de barres
        barW = Math.min(barW, isMobile ? 18 : 28);

        return { barW, gap, total: n };
    }, [data.length, chartW, isMobile]);

    // Labels X — espacement intelligent selon la taille
    const xLabelInterval = useMemo(() => {
        const maxLabels = isMobile ? 5 : 10;
        return Math.max(1, Math.ceil(data.length / maxLabels));
    }, [data.length, isMobile]);

    // ── Handlers d'interaction (Scrubbing global) ──
    const handlePointerAction = useCallback((e) => {
        // Support pour Event de Souris et Touch natif dans React
        const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
        if (clientX === undefined) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const localX = clientX - rect.left;
        
        const slotW = barMetrics.barW + barMetrics.gap;
        let idx = Math.floor(localX / slotW);
        // Empêcher le débordement des index
        idx = Math.max(0, Math.min(barMetrics.total - 1, idx));
        
        setActiveIdx(idx);
    }, [barMetrics]);

    const handlePointerLeave = useCallback(() => {
        setActiveIdx(null);
    }, []);

    // ── Calcul position tooltip (ancré au-dessus de la barre) ──
    const tooltipInfo = useMemo(() => {
        if (activeIdx === null || !data[activeIdx]) return null;
        const d = data[activeIdx];
        const barX = margin.left + activeIdx * (barMetrics.barW + barMetrics.gap) + barMetrics.barW / 2;
        const barH = d.visites > 0 ? Math.max(2, (d.visites / maxVal) * chartH) : 0;
        const barTopY = margin.top + chartH - barH;

        // Tooltip au-dessus de la barre, centré horizontalement
        let tooltipX = barX;
        let tooltipY = barTopY - 12;

        // Clamper pour ne pas déborder
        const tooltipW = 100;
        tooltipX = Math.max(tooltipW / 2 + 4, Math.min(dims.w - tooltipW / 2 - 4, tooltipX));
        tooltipY = Math.max(4, tooltipY);

        return { x: tooltipX, y: tooltipY, d };
    }, [activeIdx, data, barMetrics, maxVal, chartH, margin, dims.w]);

    return (
        <div ref={containerRef} className="w-full h-full relative select-none"
            style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'pan-y' }}
            onMouseLeave={() => setActiveIdx(null)}
        >
            <svg width={dims.w} height={dims.h} style={{ display: 'block' }}>
                <defs>
                    <linearGradient id="svgBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="svgBarGradActive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={1} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.85} />
                    </linearGradient>
                    <filter id="glowFilter" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3.5" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                <g transform={`translate(${margin.left},${margin.top})`}>
                    {/* Grille horizontale */}
                    {yTicks.map(tick => {
                        const y = chartH - (tick / maxVal) * chartH;
                        return (
                            <line key={`grid-${tick}`} x1={0} y1={y} x2={chartW} y2={y}
                                stroke={darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}
                                strokeDasharray="4 4"
                            />
                        );
                    })}

                    {/* Labels Y */}
                    {yTicks.map(tick => {
                        const y = chartH - (tick / maxVal) * chartH;
                        return (
                            <text key={`y-${tick}`} x={-8} y={y + 3.5}
                                textAnchor="end" fontSize={isMobile ? 9 : 10}
                                fill={darkMode ? '#57534e' : '#a8a29e'}
                                fontWeight={500}
                            >{tick}</text>
                        );
                    })}

                    {/* Ligne de base */}
                    <line x1={0} y1={chartH} x2={chartW} y2={chartH}
                        stroke={darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}
                        strokeWidth={1}
                    />

                    {/* Barres */}
                    {data.map((d, i) => {
                        const x = i * (barMetrics.barW + barMetrics.gap);
                        const h = d.visites > 0 ? Math.max(3, (d.visites / maxVal) * chartH) : 0;
                        const y = chartH - h;
                        const isActive = activeIdx === i;
                        const bw = barMetrics.barW;
                        const radius = Math.min(3, bw / 2);

                        return (
                            <g key={`${animationKey}-${i}`}>
                                {/* Barre active : glow + agrandissement */}
                                {isActive && d.visites > 0 && (
                                    <rect
                                        x={x - Math.min(3, bw * 0.3)}
                                        y={Math.max(0, y - 5)}
                                        width={bw + Math.min(6, bw * 0.6)}
                                        height={h + 5}
                                        rx={radius + 1} ry={radius + 1}
                                        fill="url(#svgBarGradActive)"
                                        filter="url(#glowFilter)"
                                    />
                                )}
                                
                                {/* Barre au repos */}
                                {!isActive && d.visites > 0 && (
                                    <rect
                                        x={x} y={y}
                                        width={bw} height={h}
                                        rx={radius} ry={radius}
                                        fill="url(#svgBarGrad)"
                                    >
                                        <animate attributeName="height" from="0" to={h} dur="520ms" begin={`${Math.min(i * 18, 260)}ms`} fill="freeze" />
                                        <animate attributeName="y" from={chartH} to={y} dur="520ms" begin={`${Math.min(i * 18, 260)}ms`} fill="freeze" />
                                    </rect>
                                )}

                                {/* Indicateur slot vide (dot subtil) */}
                                {d.visites === 0 && !isActive && (
                                    <circle
                                        cx={x + bw / 2} cy={chartH - 1}
                                        r={isMobile ? 1 : 1.5}
                                        fill={darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
                                    />
                                )}
                            </g>
                        );
                    })}

                    {/* Labels X */}
                    {data.map((d, i) => {
                        if (i % xLabelInterval !== 0) return null;
                        const x = i * (barMetrics.barW + barMetrics.gap) + barMetrics.barW / 2;
                        return (
                            <text key={`x-${i}`} x={x} y={chartH + (isMobile ? 16 : 22)}
                                textAnchor="middle" fontSize={isMobile ? 8 : 10}
                                fill={darkMode ? '#57534e' : '#a8a29e'}
                                fontWeight={500}
                            >{d.name}</text>
                        );
                    })}

                    {/* OVERLAY GLOBAL POUR LE SCRUBBING (TACTILE ET SOURIS) */}
                    <rect
                        x={0} y={0} width={chartW} height={chartH}
                        fill="rgba(0,0,0,0)"
                        onPointerDown={handlePointerAction}
                        onPointerMove={handlePointerAction}
                        onPointerLeave={handlePointerLeave}
                        onTouchStart={handlePointerAction}
                        onTouchMove={handlePointerAction}
                        onTouchEnd={handlePointerLeave}
                        style={{ cursor: 'crosshair', pointerEvents: 'all', touchAction: 'pan-y' }}
                    />
                </g>
            </svg>

            {/* ── Tooltip flottant (ancré au-dessus de la barre) ── */}
            {tooltipInfo && tooltipInfo.d.visites > 0 && (
                <div style={{
                    position: 'absolute',
                    left: tooltipInfo.x,
                    top: tooltipInfo.y,
                    transform: 'translate(-50%, -100%)',
                    background: darkMode ? 'rgba(28, 25, 23, 0.95)' : 'rgba(255, 255, 255, 0.97)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: isMobile ? '10px' : '14px',
                    padding: isMobile ? '6px 10px' : '8px 14px',
                    boxShadow: darkMode 
                        ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)' 
                        : '0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
                    pointerEvents: 'none',
                    zIndex: 50,
                    whiteSpace: 'nowrap',
                    transition: 'left 0.12s cubic-bezier(0.4,0,0.2,1), top 0.12s cubic-bezier(0.4,0,0.2,1), opacity 0.15s',
                    opacity: 1,
                }}>
                    {/* Petite flèche vers le bas */}
                    <div style={{
                        position: 'absolute',
                        bottom: -5,
                        left: '50%',
                        transform: 'translateX(-50%) rotate(45deg)',
                        width: 10, height: 10,
                        background: darkMode ? 'rgba(28, 25, 23, 0.95)' : 'rgba(255, 255, 255, 0.97)',
                        boxShadow: darkMode ? '2px 2px 4px rgba(0,0,0,0.3)' : '2px 2px 4px rgba(0,0,0,0.08)',
                    }} />
                    <div style={{
                        position: 'relative', zIndex: 1,
                        fontSize: isMobile ? '9px' : '10px',
                        color: '#78716c', fontWeight: 700, marginBottom: '1px'
                    }}>
                        {tooltipInfo.d.name}
                    </div>
                    <div style={{
                        position: 'relative', zIndex: 1,
                        fontSize: isMobile ? '12px' : '14px',
                        fontWeight: 900, color: '#10b981', textTransform: 'uppercase',
                        letterSpacing: '0.02em'
                    }}>
                        {tooltipInfo.d.visites} {valueLabel}{tooltipInfo.d.visites > 1 ? 's' : ''}
                    </div>
                    {tooltipInfo.d.sessions !== undefined && tooltipInfo.d.sessions !== tooltipInfo.d.visites && (
                        <div style={{
                            position: 'relative', zIndex: 1,
                            fontSize: isMobile ? '9px' : '10px',
                            fontWeight: 800, color: darkMode ? '#a8a29e' : '#78716c',
                            textTransform: 'uppercase'
                        }}>
                            {tooltipInfo.d.sessions} session{tooltipInfo.d.sessions > 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Boutique Affiliation Analytics ───────────────────────────────────────────
const PROG_LABELS_B = { amazon: 'Amazon', manomano: 'ManoMano', leroymerlin: 'Leroy Merlin', rakuten: 'Rakuten', castorama: 'Castorama', direct: 'Direct' };
const PROG_COLORS_B = { amazon: '#FF9900', manomano: '#2ECC71', leroymerlin: '#006600', rakuten: '#BF0000', castorama: '#FF6600', direct: '#6B7280' };
const TIER_LABELS_B = { essentiel: 'Essentiel', premium: 'Premium', expert: 'Expert' };
const TIER_COLORS_B = { essentiel: '#78716c', premium: '#f59e0b', expert: '#e2e8f0' };
const SOURCE_LABELS_B = { shop_grid: 'Comptoir (Grille)', shop_detail: 'Comptoir (Fiche)', shop_tutorial: 'Comptoir (Tuto)', gallery_detail: 'Galerie (Meuble)', inconnu: 'Inconnu' };
const SOURCE_COLORS_B = { shop_grid: '#3B82F6', shop_detail: '#14B8A6', shop_tutorial: '#F59E0B', gallery_detail: '#8B5CF6', inconnu: '#6B7280' };
const BOUTIQUE_TIME_FILTERS = [
    { id: '1h', label: '1H', duration: 60 * 60 * 1000, step: 5 * 60 * 1000 },
    { id: '5h', label: '5H', duration: 5 * 60 * 60 * 1000, step: 15 * 60 * 1000 },
    { id: '1j', label: '1J', duration: 24 * 60 * 60 * 1000, step: 60 * 60 * 1000 },
    { id: '2sem', label: '2 Sem.', duration: 14 * 24 * 60 * 60 * 1000, step: 24 * 60 * 60 * 1000 },
    { id: '1mois', label: '1 Mois', duration: 30 * 24 * 60 * 60 * 1000, step: 24 * 60 * 60 * 1000 },
    { id: '3mois', label: '3 Mois', duration: 90 * 24 * 60 * 60 * 1000, step: 7 * 24 * 60 * 60 * 1000 },
    { id: '6mois', label: '6 Mois', duration: 180 * 24 * 60 * 60 * 1000, step: 14 * 24 * 60 * 60 * 1000 },
    { id: '1ans', label: '1 An', duration: 365 * 24 * 60 * 60 * 1000, step: 30 * 24 * 60 * 60 * 1000 },
];

const PAGE_LABELS = {
    home: 'Accueil SEO',
    about: 'A propos',
    gallery: 'Galerie mobilier',
    detail: 'Fiche produit',
    shop: 'Le Comptoir',
    'shop-detail': 'Fiche Comptoir',
    delivery: 'Livraison',
    checkout: 'Checkout',
    'my-orders': 'Mes commandes',
    login: 'Connexion',
};

const AFFILIATE_JOURNEY_LABELS = {
    affiliate_shop_grid: 'Clic Comptoir',
    affiliate_shop_detail: 'Achat depuis fiche Comptoir',
    affiliate_shop_tutorial: 'Clic Tutoriel Comptoir',
    affiliate_gallery_detail: 'Clic depuis fiche meuble',
    comptoir: 'Clic Comptoir',
};

const getBoutiqueFilterConfig = (filterId) => BOUTIQUE_TIME_FILTERS.find(f => f.id === filterId) || BOUTIQUE_TIME_FILTERS[2];

const formatBoutiqueSlot = (time, step) => {
    const d = new Date(time);
    if (step < 60 * 60 * 1000) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (step < 24 * 60 * 60 * 1000) return `${d.getHours()}h`;
    if (step < 30 * 24 * 60 * 60 * 1000) return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    return d.toLocaleDateString('fr-FR', { month: '2-digit', year: 'numeric' });
};

const alignBoutiqueSlotStart = (time, step) => {
    const d = new Date(time);
    if (step < 60 * 60 * 1000) {
        const minutes = Math.floor(d.getMinutes() / Math.max(1, step / 60000)) * Math.max(1, step / 60000);
        d.setMinutes(minutes, 0, 0);
        return d.getTime();
    }
    if (step < 24 * 60 * 60 * 1000) {
        const hours = Math.floor(d.getHours() / Math.max(1, step / 3600000)) * Math.max(1, step / 3600000);
        d.setHours(hours, 0, 0, 0);
        return d.getTime();
    }
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

const buildBoutiqueTimeline = (now, duration, step, withVisitors = false) => {
    const cutoff = now - duration;
    const start = alignBoutiqueSlotStart(cutoff, step);
    const end = alignBoutiqueSlotStart(now, step);
    const timeline = [];
    const slotMap = new Map();
    for (let t = start; t <= end; t += step) {
        const slot = { timestamp: t, name: formatBoutiqueSlot(t, step), visites: 0 };
        if (withVisitors) slot.visitors = new Set();
        timeline.push(slot);
        slotMap.set(t, slot);
    }
    return { cutoff, timeline, slotMap };
};

const isComptoirPageView = (page) => page === 'shop' || page === 'shop-detail' || page === 'comptoir';
const isComptoirJourneyStep = (step) => {
    const page = step?.page;
    return isComptoirPageView(page) || String(page || '').startsWith('affiliate_');
};
const isAffiliateJourneyStep = (page) => page === 'comptoir' || String(page || '').startsWith('affiliate_');

const parseJourneyClockTime = (sessionStartedAt, timeLabel) => {
    const started = getMillis(sessionStartedAt);
    const match = String(timeLabel || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!started || !match) return 0;

    const date = new Date(started);
    date.setHours(Number(match[1]), Number(match[2]), Number(match[3] || 0), 0);
    let candidate = date.getTime();
    if (candidate < started - 12 * 60 * 60 * 1000) candidate += 24 * 60 * 60 * 1000;
    if (candidate > started + 12 * 60 * 60 * 1000) candidate -= 24 * 60 * 60 * 1000;
    return candidate;
};

const getJourneyStepMillis = (session, step) => {
    const exact = getMillis(step?.timestampMs || step?.clientAtMs || step?.at);
    if (exact) return exact;
    return parseJourneyClockTime(session?.startedAt, step?.time) || getMillis(session?.startedAt);
};

const getFirstComptoirStepMillis = (session) => {
    const step = (session?.journey || []).find(isComptoirJourneyStep);
    return step ? getJourneyStepMillis(session, step) : 0;
};

const formatJourneyStepTime = (session, step) => {
    const exact = getMillis(step?.timestampMs || step?.clientAtMs || step?.at);
    if (exact) return new Date(exact).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return step?.time || '--:--';
};

const getTrackingItemParts = (rawItemId) => {
    const raw = String(rawItemId || '').trim();
    if (!raw) return { id: null, label: null, context: null, source: null };

    const contextMatch = raw.match(/\[(depuis|source):\s*([^\]]+)\]/i);
    const clean = raw.replace(/\s*\[(depuis|source):\s*[^\]]+\]\s*$/i, '').trim();
    const [rawId, ...labelParts] = clean.split('|');
    const label = (labelParts.join('|') || rawId || '').trim();
    const id = labelParts.length > 0 ? rawId.trim() : null;

    return {
        id,
        label: label || null,
        context: contextMatch ? contextMatch[2].trim() : null,
        source: contextMatch && contextMatch[1].toLowerCase() === 'source' ? contextMatch[2].trim() : null
    };
};

const getComptoirEventMeta = (event) => {
    if (event.kind === 'click') return { label: 'Clic produit', accent: 'text-amber-400', dot: 'bg-amber-400', chip: 'bg-amber-500/10 border-amber-500/10 text-amber-300' };
    if (event.page === 'shop-detail') return { label: 'Fiche Comptoir', accent: 'text-teal-400', dot: 'bg-teal-400', chip: 'bg-teal-500/10 border-teal-500/10 text-teal-300' };
    return { label: 'Vue Comptoir', accent: 'text-blue-400', dot: 'bg-blue-400', chip: 'bg-blue-500/10 border-blue-500/10 text-blue-300' };
};

const getDayLabelFromMs = (ms, now) => {
    const dateObj = new Date(ms);
    const dateKey = dateObj.toLocaleDateString('fr-FR');
    const today = new Date(now).toLocaleDateString('fr-FR');
    const yesterday = new Date(now - 86400000).toLocaleDateString('fr-FR');
    if (dateKey === today) return "Aujourd'hui";
    if (dateKey === yesterday) return 'Hier';
    return dateKey;
};

const getJourneyLabel = (page) => AFFILIATE_JOURNEY_LABELS[page] || PAGE_LABELS[page] || page || 'Inconnu';
const getJourneyAccent = (page) => {
    if (page === 'shop') return { dot: 'bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.3)]', text: 'text-violet-400/60', label: 'text-violet-400', chip: 'bg-indigo-500/10 text-indigo-400/80 border-indigo-500/10' };
    if (isAffiliateJourneyStep(page)) return { dot: 'bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.4)]', text: 'text-teal-400/60', label: 'text-teal-400', chip: 'bg-teal-500/10 text-teal-400/80 border-teal-500/10' };
    if (page === 'delivery') return { dot: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]', text: 'text-emerald-500/60', label: 'text-emerald-500', chip: 'bg-emerald-500/10 text-emerald-400/80 border-emerald-500/10' };
    return { dot: 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]', text: 'text-blue-500/60', label: 'text-amber-500', chip: 'bg-indigo-500/10 text-indigo-400/80 border-indigo-500/10' };
};

const formatDurationLabel = (seconds) => {
    if (!seconds) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}m ${sec}s`;
};

const getJourneyStepPageDuration = (session, index) => {
    const journey = Array.isArray(session?.journey) ? session.journey : [];
    const nextDuration = Number(journey[index + 1]?.duration);
    if (Number.isFinite(nextDuration) && nextDuration > 0) return nextDuration;

    const elapsedBeforeLastStep = journey.reduce((sum, step, stepIndex) => {
        if (stepIndex === 0 || stepIndex > index) return sum;
        const value = Number(step?.duration);
        return sum + (Number.isFinite(value) && value > 0 ? value : 0);
    }, 0);
    const sessionDuration = Number(session?.duration);
    if (!Number.isFinite(sessionDuration) || sessionDuration <= elapsedBeforeLastStep) return 0;
    return Math.max(0, Math.round(sessionDuration - elapsedBeforeLastStep));
};

const SessionJourneyTrace = ({ session, darkMode, formatDuration }) => (
    <div className={`p-4 border-t ${darkMode ? 'border-white/5 bg-black/20' : 'border-stone-100 bg-white'} animate-in slide-in-from-top-2 duration-300`}>
        <div className="space-y-5">
            <div className="flex items-center justify-between px-1">
                <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-500">Parcours Utilisateur</h4>
                <span className="text-[8px] font-bold text-stone-600 opacity-60 uppercase tracking-tighter">{session.journey?.length || 0} Etapes</span>
            </div>

            <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-stone-800">
                {!session.journey || session.journey.length === 0 ? (
                    <p className="text-[10px] italic text-stone-500">Aucune activite enregistree</p>
                ) : (
                    session.journey.map((step, idx) => {
                        const accent = getJourneyAccent(step.page);
                        const stepLabel = getJourneyLabel(step.page);
                        const isAffiliateStep = isAffiliateJourneyStep(step.page);
                        const pageDuration = getJourneyStepPageDuration(session, idx);
                        return (
                            <div key={idx} className="relative group/step">
                                <div className={`absolute -left-[18.5px] top-1.5 w-[7px] h-[7px] rounded-full ring-4 ${darkMode ? 'ring-stone-900/50' : 'ring-white'} ${accent.dot} transition-all group-hover/step:scale-125`}></div>

                                <div className="flex flex-col gap-1 -translate-y-0.5">
                                    <span className={`text-[8px] font-black uppercase tracking-widest leading-none ${step.page === 'comptoir' ? 'text-teal-400/60' : step.page === 'shop' ? 'text-violet-400/60' : 'text-blue-500/60'}`}>{formatJourneyStepTime(session, step)} - {formatDuration(pageDuration)} sur cette page</span>
                                    <p className={`font-black text-[11px] leading-tight ${darkMode ? 'text-stone-300' : 'text-stone-900'}`}>
                                        {isAffiliateStep ? 'Clic' : 'Vue'} : <span className={`uppercase ${accent.label}`}>{stepLabel}</span>
                                    </p>
                                    {step.itemId && (
                                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded-md truncate max-w-full italic border ${accent.chip}`}>
                                                {!isAffiliateStep && 'ID: '}{step.itemId}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    </div>
);

const VisitorSessionGroup = ({
    darkMode,
    visitor,
    now,
    isOpen,
    onToggle,
    expandedSessionId,
    setExpandedSessionId,
    handleDeleteSession,
    formatDuration,
    canUseDangerousAdminActions = false
}) => {
    const lastTime = visitor.lastActivityAt
        ? new Date(visitor.lastActivityAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '--:--';

    return (
        <div className={`rounded-xl border overflow-hidden transition-all ${darkMode ? 'bg-stone-900 border-white/5 hover:border-white/10' : 'bg-stone-50 border-stone-100 shadow-sm'}`}>
            <button
                onClick={onToggle}
                className="w-full p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left transition-colors hover:bg-white/[0.03] active:scale-[0.995]"
            >
                <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${darkMode ? 'bg-white/5' : 'bg-white border border-stone-200'}`}>
                        {isOpen ? <ChevronDown size={14} className="text-stone-400" /> : <ChevronRight size={14} className="text-stone-400" />}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 overflow-hidden">
                            <Globe size={11} className="text-stone-500 shrink-0" />
                            <span className={`text-[10px] font-black truncate ${darkMode ? 'text-white/80' : 'text-stone-900'}`}>{visitor.locationLabel}</span>
                            {visitor.isActive ? (
                                <span className="text-[8px] font-black uppercase text-emerald-500 animate-pulse shrink-0">En ligne</span>
                            ) : (
                                <span className="text-[8px] font-black uppercase text-stone-600 shrink-0">Termine</span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-bold text-stone-500 uppercase">
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                                {visitor.device === 'Mobile' ? <Smartphone size={10} className="shrink-0" /> : <Monitor size={10} className="shrink-0" />}
                                <span className="truncate">{visitor.deviceLabel}</span>
                            </span>
                            <span className="font-mono normal-case">{visitor.ipLabel}</span>
                            <span>{visitor.identitySource}</span>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:min-w-[260px] text-right">
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-stone-500 leading-none">Sessions</p>
                        <p className={`mt-1 text-xs font-black tabular-nums ${darkMode ? 'text-white' : 'text-stone-900'}`}>{visitor.sessionCount}</p>
                    </div>
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-stone-500 leading-none">Duree</p>
                        <p className={`mt-1 text-xs font-black tabular-nums ${darkMode ? 'text-white' : 'text-stone-900'}`}>{formatDuration(visitor.totalDuration)}</p>
                    </div>
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-stone-500 leading-none">Dernier</p>
                        <p className={`mt-1 text-xs font-black tabular-nums ${darkMode ? 'text-white' : 'text-stone-900'}`}>{lastTime}</p>
                    </div>
                </div>
            </button>

            {isOpen && (
                <div className={`border-t ${darkMode ? 'border-white/5 bg-black/10' : 'border-stone-100 bg-white/70'}`}>
                    {visitor.sessions.map(session => {
                        const isExpanded = expandedSessionId === session.id;
                        const lastActiveMs = getMillis(session.lastActivityAt);
                        const isInactive = (now - lastActiveMs) > 30000;
                        const isFinished = session.sessionActive === false || isInactive;
                        const startedTime = session.startedAt ? new Date(getMillis(session.startedAt)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

                        return (
                            <div key={session.id} className={`border-t first:border-t-0 ${darkMode ? 'border-white/5' : 'border-stone-100'}`}>
                                <div className="p-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex flex-col min-w-[44px] shrink-0">
                                            <span className="text-[10px] font-black text-stone-500 tabular-nums">{startedTime}</span>
                                            <span className={`text-[8px] font-black uppercase ${isFinished ? 'text-stone-600' : 'text-emerald-500 animate-pulse'}`}>
                                                {isFinished ? 'Termine' : 'En ligne'}
                                            </span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-[10px] font-black truncate ${darkMode ? 'text-stone-300' : 'text-stone-900'}`}>
                                                Session {session.journey?.length || 0} etape{(session.journey?.length || 0) > 1 ? 's' : ''}
                                            </p>
                                            <p className="text-[9px] font-bold text-stone-500 truncate uppercase">
                                                {session.os || 'Inconnu'} - {session.browser || 'Inconnu'} - {formatDuration(session.duration)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                            className={`px-3 py-1.5 h-8 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 ${isExpanded ? 'bg-blue-500 text-white' : (darkMode ? 'bg-white/5 text-white/50 hover:bg-white/10' : 'bg-white border border-stone-200 text-stone-600')}`}
                                        >
                                            {isExpanded ? 'Masquer' : 'Tracer'}
                                        </button>
                                        {canUseDangerousAdminActions && <button
                                            onClick={() => handleDeleteSession(session.id)}
                                            className="p-1.5 text-stone-500 hover:text-red-500 transition-colors active:scale-90"
                                            aria-label="Supprimer la session"
                                        >
                                            <Trash2 size={12} />
                                        </button>}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <SessionJourneyTrace
                                        session={session}
                                        darkMode={darkMode}
                                        formatDuration={formatDuration}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const estimateComptoirDuration = (session) => {
    const journey = Array.isArray(session?.journey) ? session.journey : [];
    if (journey.length === 0) return { total: 0, segments: 0 };

    const durations = journey.map(step => Number(step?.duration) || 0);
    const trailingDuration = Math.max(0, (Number(session.duration) || 0) - durations.reduce((sum, value) => sum + value, 0));
    let total = 0;
    let segments = 0;
    let hasPageView = false;

    journey.forEach((step, index) => {
        if (!isComptoirPageView(step?.page)) return;
        hasPageView = true;
        const nextDuration = Number(journey[index + 1]?.duration);
        const segmentDuration = Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : (index === journey.length - 1 ? trailingDuration : 0);
        if (segmentDuration > 0) {
            total += segmentDuration;
            segments += 1;
        }
    });

    if (!hasPageView) {
        const clickDurations = journey
            .filter(step => isComptoirJourneyStep(step))
            .map(step => Number(step.duration) || 0)
            .filter(Boolean);
        if (clickDurations.length > 0) {
            total += Math.max(...clickDurations);
            segments += 1;
        }
    }

    return { total, segments };
};

const BoutiqueAnalytics = ({ darkMode, sessions = [], onRefreshSessions, sessionsRefreshKey = 0, loadingSessions = false, canUseDangerousAdminActions = false }) => {
    const [clicks, setClicks] = useState(() => cachedAffiliateClicks || []);
    const [loadingClicks, setLoadingClicks] = useState(false);
    const [restoringClicks, setRestoringClicks] = useState(() => !cachedAffiliateClicks);
    const [timeFilter, setTimeFilter] = useState('1j');
    const [openDays, setOpenDays] = useState({});
    const [openJourneyDays, setOpenJourneyDays] = useState({});
    const [clicksRefreshKey, setClicksRefreshKey] = useState(() => cachedAffiliateClicksLoadedAt || 0);
    const animationKey = `${sessionsRefreshKey}-${clicksRefreshKey}`;
    const refreshing = loadingClicks || loadingSessions || restoringClicks;
    const boutiqueNow = Math.max(clicksRefreshKey || 0, sessionsRefreshKey || 0) || Date.now();

    useEffect(() => {
        let cancelled = false;
        if (cachedAffiliateClicks) {
            setRestoringClicks(false);
            return () => { cancelled = true; };
        }

        readAdminAnalyticsCache(ADMIN_AFFILIATE_CACHE_KEY).then((snapshot) => {
            if (cancelled || !snapshot) return;
            cachedAffiliateClicks = snapshot.data || [];
            cachedAffiliateClicksLoadedAt = snapshot.loadedAt || 0;
            setClicks(cachedAffiliateClicks);
            setClicksRefreshKey(cachedAffiliateClicksLoadedAt);
        }).finally(() => {
            if (!cancelled) setRestoringClicks(false);
        });

        return () => { cancelled = true; };
    }, []);

    const sessionGeoMap = useMemo(() => {
        const m = new Map();
        sessions.forEach(s => { if (s.id && s.geo) m.set(s.id, s.geo); });
        return m;
    }, [sessions]);

    const formatSessionLocation = (sessionId) => {
        const geo = sessionGeoMap.get(sessionId);
        if (geo?.city && geo.city !== 'Unknown') {
            const region = geo.region && geo.region !== 'Unknown' ? `, ${geo.region}` : '';
            return `${geo.city}${region}`;
        }
        return null;
    };

    const loadClicks = useCallback(async () => {
        setLoadingClicks(true);
        const q = query(collection(db, 'affiliate_clicks'), orderBy('timestamp', 'desc'), limit(3000));
        try {
            const snap = await getDocs(q);
            const nextClicks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const loadedAt = Date.now();
            cachedAffiliateClicks = nextClicks;
            cachedAffiliateClicksLoadedAt = loadedAt;
            setClicks(nextClicks);
            setClicksRefreshKey(loadedAt);
            writeAdminAnalyticsCache(ADMIN_AFFILIATE_CACHE_KEY, nextClicks, loadedAt);
            setLoadingClicks(false);
        } catch (error) {
            console.error('Affiliate clicks load error:', error);
            setLoadingClicks(false);
        }
    }, []);

    useEffect(() => {
        if (restoringClicks || loadingClicks || clicks.length > 0 || clicksRefreshKey > 0) return;
        loadClicks();
    }, [restoringClicks, loadingClicks, clicks.length, clicksRefreshKey, loadClicks]);

    const handleRefreshBoutique = useCallback(async () => {
        await Promise.all([
            loadClicks(),
            onRefreshSessions ? onRefreshSessions() : Promise.resolve()
        ]);
    }, [loadClicks, onRefreshSessions]);

    const filteredClicks = useMemo(() => {
        const { duration } = getBoutiqueFilterConfig(timeFilter);
        const cutoff = boutiqueNow - duration;
        return clicks.filter(c => getMillis(c.timestamp) >= cutoff);
    }, [clicks, timeFilter, boutiqueNow]);

    const comptoirSessions = useMemo(() => {
        const { duration } = getBoutiqueFilterConfig(timeFilter);
        const cutoff = boutiqueNow - duration;
        return sessions.filter((session) => {
            const comptoirStarted = getFirstComptoirStepMillis(session);
            return comptoirStarted && comptoirStarted >= cutoff;
        });
    }, [sessions, timeFilter, boutiqueNow]);

    const clickChartData = useMemo(() => {
        const { duration, step } = getBoutiqueFilterConfig(timeFilter);
        const { timeline, slotMap } = buildBoutiqueTimeline(boutiqueNow, duration, step);
        filteredClicks.forEach(c => {
            const t = getMillis(c.timestamp);
            if (!t) return;
            const slot = slotMap.get(alignBoutiqueSlotStart(t, step));
            if (slot) slot.visites += 1;
        });
        return timeline;
    }, [filteredClicks, timeFilter, boutiqueNow]);

    const comptoirVisitChartData = useMemo(() => {
        const { duration, step } = getBoutiqueFilterConfig(timeFilter);
        const { timeline, slotMap } = buildBoutiqueTimeline(boutiqueNow, duration, step, true);

        comptoirSessions.forEach(session => {
            const t = getFirstComptoirStepMillis(session);
            if (!t) return;
            const slot = slotMap.get(alignBoutiqueSlotStart(t, step));
            if (!slot) return;
            slot.visitors.add(getReliableVisitorKey(session));
        });

        return timeline.map(slot => ({
            timestamp: slot.timestamp,
            name: slot.name,
            visites: slot.visitors.size
        }));
    }, [comptoirSessions, timeFilter, boutiqueNow]);

    const clicksBySession = useMemo(() => {
        const m = new Map();
        filteredClicks.forEach((click) => {
            if (!click.sessionId) return;
            if (!m.has(click.sessionId)) m.set(click.sessionId, []);
            m.get(click.sessionId).push(click);
        });
        return m;
    }, [filteredClicks]);

    const comptoirJourneyGroups = useMemo(() => {
        const groups = new Map();

        comptoirSessions.forEach((session) => {
            const journeyEvents = (session.journey || [])
                .map((step, index) => {
                    if (!isComptoirJourneyStep(step)) return null;
                    const item = getTrackingItemParts(step.itemId);
                    const at = getJourneyStepMillis(session, step);
                    return {
                        id: `${session.id}-journey-${index}`,
                        at,
                        page: step.page,
                        kind: isAffiliateJourneyStep(step.page) ? 'click' : 'visit',
                        label: getJourneyLabel(step.page),
                        product: item.label,
                        productId: item.id,
                        context: item.context,
                        source: item.source,
                        duration: getJourneyStepPageDuration(session, index),
                        from: 'journey'
                    };
                })
                .filter(Boolean);

            const journeyClickKeys = new Set(
                journeyEvents
                    .filter(event => event.kind === 'click')
                    .map(event => `${event.productId || event.product || ''}-${Math.floor(event.at / 60000)}`)
            );

            const serverClickEvents = (clicksBySession.get(session.id) || [])
                .map((click) => {
                    const at = getMillis(click.timestamp);
                    const key = `${click.productId || click.productName || ''}-${Math.floor(at / 60000)}`;
                    if (journeyClickKeys.has(key)) return null;
                    return {
                        id: `${session.id}-click-${click.id}`,
                        at,
                        page: `affiliate_${click.source || 'inconnu'}`,
                        kind: 'click',
                        label: SOURCE_LABELS_B[click.source] || 'Clic affilié',
                        product: click.productName || click.productId || 'Produit inconnu',
                        productId: click.productId || null,
                        context: click.parentFurnitureName || click.referrer || null,
                        source: click.source || null,
                        duration: 0,
                        from: 'affiliate_clicks'
                    };
                })
                .filter(Boolean);

            const events = [...journeyEvents, ...serverClickEvents]
                .filter(event => event.at)
                .sort((a, b) => a.at - b.at);
            if (events.length === 0) return;

            const firstAt = events[0].at;
            const dayKey = new Date(firstAt).toLocaleDateString('fr-FR');
            if (!groups.has(dayKey)) {
                groups.set(dayKey, {
                    key: dayKey,
                    label: getDayLabelFromMs(firstAt, boutiqueNow),
                    timestamp: new Date(firstAt).setHours(0, 0, 0, 0),
                    sessions: []
                });
            }

            const products = [...new Set(events.map(event => event.product).filter(Boolean))];
            groups.get(dayKey).sessions.push({
                id: session.id,
                shortId: session.id.slice(0, 8),
                location: formatSessionLocation(session.id),
                visitorKey: getReliableVisitorKey(session),
                device: [session.os, session.browser].filter(Boolean).join(' - ') || session.device || 'Device inconnu',
                firstAt,
                lastAt: events[events.length - 1].at,
                events,
                products,
                visits: events.filter(event => event.kind === 'visit').length,
                clicks: events.filter(event => event.kind === 'click').length
            });
        });

        return Array.from(groups.values())
            .map(group => ({
                ...group,
                sessions: group.sessions.sort((a, b) => b.firstAt - a.firstAt)
            }))
            .sort((a, b) => b.timestamp - a.timestamp);
    }, [comptoirSessions, clicksBySession, boutiqueNow]);

    const topProducts = useMemo(() => {
        const counts = {};
        filteredClicks.forEach(c => {
            if (!c.productId) return;
            if (!counts[c.productId]) counts[c.productId] = { id: c.productId, name: c.productName || '—', count: 0, program: c.affiliateProgram, tier: c.tier };
            counts[c.productId].count += 1;
        });
        return Object.values(counts).sort((a, b) => b.count - a.count);
    }, [filteredClicks]);

    const byProgram = useMemo(() => {
        const counts = {};
        filteredClicks.forEach(c => { const p = c.affiliateProgram || 'direct'; counts[p] = (counts[p] || 0) + 1; });
        return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    }, [filteredClicks]);

    const byTier = useMemo(() => {
        const counts = {};
        filteredClicks.forEach(c => { const t = c.tier || 'essentiel'; counts[t] = (counts[t] || 0) + 1; });
        return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    }, [filteredClicks]);

    const bySource = useMemo(() => {
        const counts = {};
        filteredClicks.forEach(c => { const s = c.source || 'inconnu'; counts[s] = (counts[s] || 0) + 1; });
        return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    }, [filteredClicks]);

    const byParent = useMemo(() => {
        const counts = {};
        filteredClicks.forEach(c => {
            if (c.parentFurnitureId) {
                const n = c.parentFurnitureName || c.parentFurnitureId;
                counts[n] = (counts[n] || 0) + 1;
            }
        });
        return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    }, [filteredClicks]);

    const sessionsByDay = useMemo(() => {
        const groups = {};
        const today = new Date(boutiqueNow).toLocaleDateString('fr-FR');
        const yesterday = new Date(boutiqueNow - 86400000).toLocaleDateString('fr-FR');

        filteredClicks.forEach(c => {
            const t = getMillis(c.timestamp);
            if (!t) return;
            const dateObj = new Date(t);
            const dateKey = dateObj.toLocaleDateString('fr-FR');
            
            let label = dateKey;
            if (dateKey === today) label = "Aujourd'hui";
            else if (dateKey === yesterday) label = "Hier";

            if (!groups[dateKey]) {
                groups[dateKey] = {
                    key: dateKey,
                    label,
                    timestamp: dateObj.getTime(),
                    sessions: {}
                };
            }
            const sid = c.sessionId || 'anonyme';
            if (!groups[dateKey].sessions[sid]) {
                groups[dateKey].sessions[sid] = [];
            }
            groups[dateKey].sessions[sid].push(c);
        });

        return Object.values(groups).map(g => ({
            ...g,
            sessionsList: Object.entries(g.sessions).map(([sid, clicksList]) => ({
                sessionId: sid,
                clicks: clicksList.sort((a, b) => getMillis(b.timestamp) - getMillis(a.timestamp))
            })).sort((a, b) => getMillis(b.clicks[0].timestamp) - getMillis(a.clicks[0].timestamp))
        })).sort((a, b) => b.timestamp - a.timestamp);
    }, [filteredClicks, boutiqueNow]);

    useEffect(() => {
        if (sessionsByDay.length > 0) {
            const firstKey = sessionsByDay[0].key;
            setOpenDays(prev => {
                if (Object.keys(prev).length === 0) return { [firstKey]: true };
                return prev;
            });
        }
    }, [sessionsByDay.length]);

    useEffect(() => {
        if (comptoirJourneyGroups.length > 0) {
            const firstKey = comptoirJourneyGroups[0].key;
            setOpenJourneyDays(prev => {
                if (Object.keys(prev).length === 0) return { [firstKey]: true };
                return prev;
            });
        }
    }, [comptoirJourneyGroups.length]);

    const kpis = useMemo(() => {
        const peak = clickChartData.length > 0 ? clickChartData.reduce((best, d) => d.visites > best.visites ? d : best, clickChartData[0]) : null;
        const uniqueComptoirVisitors = new Set(comptoirSessions.map(getReliableVisitorKey).filter(Boolean)).size;
        const durationEstimate = comptoirSessions.reduce((acc, session) => {
            const estimate = estimateComptoirDuration(session);
            return {
                total: acc.total + estimate.total,
                segments: acc.segments + estimate.segments
            };
        }, { total: 0, segments: 0 });
        const avgComptoirDuration = durationEstimate.segments > 0 ? Math.round(durationEstimate.total / durationEstimate.segments) : 0;
        const amazonClicks = filteredClicks.filter(c => c.affiliateProgram === 'amazon').length;

        return {
            total: filteredClicks.length,
            uniqueProducts: topProducts.length,
            topProg: byProgram[0] || null,
            peak,
            uniqueComptoirVisitors,
            avgComptoirDuration,
            amazonClicks
        };
    }, [filteredClicks, topProducts, byProgram, clickChartData, comptoirSessions]);

    const handleClearAllAffiliate = async () => {
        if (!window.confirm("☢️ ACTION CRITIQUE : Supprimer TOUS les clics affiliés (boutique) définitivement ?")) return;
        try {
            await httpsCallable(functions, 'clearAllAffiliateClicks')({});
            cachedAffiliateClicks = [];
            cachedAffiliateClicksLoadedAt = Date.now();
            setClicks([]);
            setClicksRefreshKey(cachedAffiliateClicksLoadedAt);
            clearAdminAnalyticsCache(ADMIN_AFFILIATE_CACHE_KEY);
        } catch (e) {
            console.error("Clear affiliate error:", e);
            alert("Erreur lors du nettoyage des clics affiliés");
        }
    };

    if (refreshing && clicks.length === 0) return <div className="p-12 text-center text-stone-400 font-bold animate-pulse">Chargement Boutique Data...</div>;

    const maxTop = topProducts[0]?.count || 1;
    const maxProg = byProgram[0]?.count || 1;
    const maxTier = byTier[0]?.count || 1;
    const maxSource = bySource[0]?.count || 1;
    const maxParent = byParent[0]?.count || 1;

    return (
        <div className="space-y-6">
            {/* HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className={`text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-stone-900'}`}>Le Comptoir</h3>
                    <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Analytics Affiliation</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={handleRefreshBoutique}
                        disabled={refreshing}
                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border ${darkMode ? 'border-white/10 text-stone-300 hover:bg-white/10' : 'border-stone-200 text-stone-600 hover:bg-stone-100'} disabled:opacity-50`}
                    >
                        <RefreshCw size={13} className={refreshing ? 'inline mr-2 animate-spin' : 'inline mr-2'} />
                        Actualiser
                    </button>
                    {clicksRefreshKey > 0 && (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-stone-500">
                            Maj {new Date(clicksRefreshKey).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    {canUseDangerousAdminActions && <button
                        onClick={handleClearAllAffiliate}
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-red-500/20 text-red-500/60 hover:bg-red-500 hover:text-white active:scale-95"
                    >
                        Purger Data
                    </button>}
                    <div className={`flex flex-wrap p-1 rounded-xl border ${darkMode ? 'bg-stone-900 border-white/5' : 'bg-stone-100 border-stone-200'}`}>
                        {BOUTIQUE_TIME_FILTERS.map(tf => (
                            <button key={tf.id} onClick={() => setTimeFilter(tf.id)}
                                className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${timeFilter === tf.id ? (darkMode ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'bg-white text-stone-900 shadow-sm border border-stone-200') : 'text-stone-500 hover:text-stone-300'}`}>
                                {tf.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* KPI GRID */}
            <div key={`boutique-kpis-${animationKey}`} className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {[
                    ...[
                        { label: 'Visiteurs Comptoir', value: kpis.uniqueComptoirVisitors, sub: 'IPs uniques', accent: 'text-blue-400', icon: Users },
                        { label: 'Temps Moyen', value: formatDurationLabel(kpis.avgComptoirDuration), sub: 'sur Le Comptoir', accent: 'text-emerald-400', icon: Clock },
                        { label: 'Clics Amazon', value: kpis.amazonClicks, sub: `${kpis.total} clics totaux`, accent: 'text-orange-400', icon: MousePointerClick },
                        { label: 'Produits Cliques', value: kpis.uniqueProducts, sub: 'produits distincts', accent: 'text-amber-400', icon: ShoppingBag },
                    ],
                    { label: 'Clics Totaux', value: kpis.total, sub: 'sur la période', accent: 'text-amber-400', icon: MousePointerClick },
                    { label: 'Produits Cliqués', value: kpis.uniqueProducts, sub: 'produits distincts', accent: 'text-blue-400', icon: ShoppingBag },
                    { label: 'Top Programme', value: kpis.topProg ? (PROG_LABELS_B[kpis.topProg.name] || kpis.topProg.name) : '—', sub: kpis.topProg ? `${kpis.topProg.count} clics` : 'aucun', accent: 'text-orange-400', icon: TrendingUp },
                    { label: 'Pic de Clics', value: kpis.peak?.visites || 0, sub: kpis.peak?.visites > 0 ? kpis.peak.name : '—', accent: 'text-emerald-400', icon: Activity },
                ].slice(0, 4).map((kpi, i) => (
                    <div key={i} className={`p-4 sm:p-5 rounded-2xl border ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] text-stone-500 truncate">{kpi.label}</p>
                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${darkMode ? 'bg-white/5' : 'bg-stone-50'}`}>
                                <kpi.icon size={13} className={kpi.accent} />
                            </div>
                        </div>
                        <h4 className={`text-xl sm:text-2xl md:text-3xl font-black tracking-tighter ${darkMode ? 'text-white' : 'text-stone-900'}`}>{kpi.value}</h4>
                        <p className={`text-[9px] mt-1 font-bold ${kpi.accent}`}>{kpi.sub}</p>
                    </div>
                ))}
            </div>

            {/* TRACKING COMPTOIR DETAILLE */}
            <div className={`rounded-[2rem] border overflow-hidden ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                <div className={`p-4 sm:p-5 border-b ${darkMode ? 'border-white/5' : 'border-stone-100'}`}>
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
                        <div>
                            <h3 className={`text-[10px] font-black uppercase tracking-[0.3em] ${darkMode ? 'text-white/50' : 'text-stone-400'}`}>Tracking Comptoir</h3>
                            <p className="mt-1 text-[10px] font-bold text-stone-500">Passages reels sur la boutique, fiches vues et clics produits par session.</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-right">
                            <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-stone-500">Sessions</p>
                                <p className={`text-sm font-black tabular-nums ${darkMode ? 'text-white' : 'text-stone-900'}`}>{comptoirJourneyGroups.reduce((sum, group) => sum + group.sessions.length, 0)}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-stone-500">Etapes</p>
                                <p className="text-sm font-black tabular-nums text-blue-400">{comptoirJourneyGroups.reduce((sum, group) => sum + group.sessions.reduce((acc, session) => acc + session.events.length, 0), 0)}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-stone-500">Clics</p>
                                <p className="text-sm font-black tabular-nums text-amber-400">{comptoirJourneyGroups.reduce((sum, group) => sum + group.sessions.reduce((acc, session) => acc + session.clicks, 0), 0)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {comptoirJourneyGroups.length > 0 ? (
                    <div className="divide-y divide-white/5">
                        {comptoirJourneyGroups.map((group) => {
                            const isOpen = openJourneyDays[group.key] ?? false;
                            return (
                                <div key={group.key}>
                                    <button
                                        onClick={() => setOpenJourneyDays(prev => ({ ...prev, [group.key]: !isOpen }))}
                                        className={`w-full p-3 sm:p-4 flex items-center justify-between gap-4 text-left transition-colors ${darkMode ? 'hover:bg-white/[0.02]' : 'hover:bg-stone-50'}`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-stone-800' : 'bg-stone-50'}`}>
                                                {isOpen ? <ChevronDown size={14} className="text-stone-400" /> : <ChevronRight size={14} className="text-stone-400" />}
                                            </div>
                                            <div className="min-w-0">
                                                <span className={`text-[11px] font-black uppercase tracking-widest ${darkMode ? 'text-white/80' : 'text-stone-900'}`}>{group.label}</span>
                                                <span className="ml-3 text-[10px] font-bold text-stone-500">{group.sessions.length} session{group.sessions.length > 1 ? 's' : ''}</span>
                                            </div>
                                        </div>
                                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-stone-500/10 to-transparent hidden sm:block"></div>
                                    </button>

                                    {isOpen && (
                                        <div className="px-2 sm:px-4 pb-4 space-y-3 animate-in slide-in-from-top-1 duration-200">
                                            {group.sessions.map((session) => (
                                                <div key={session.id} className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-stone-900 border-white/5' : 'bg-stone-50 border-stone-100'}`}>
                                                    <div className={`p-3 sm:p-4 border-b ${darkMode ? 'border-white/5' : 'border-stone-100'}`}>
                                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <Globe size={12} className="text-stone-500 shrink-0" />
                                                                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] truncate ${darkMode ? 'text-white/80' : 'text-stone-900'}`}>
                                                                        {session.location || 'Localisation inconnue'}
                                                                    </span>
                                                                    <span className="text-[8px] font-mono text-stone-600">#{session.shortId}</span>
                                                                </div>
                                                                <p className="mt-1 text-[9px] font-bold uppercase text-stone-500 truncate">{session.device}</p>
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-3 sm:min-w-[300px] text-left lg:text-right">
                                                                <div>
                                                                    <p className="text-[8px] font-black uppercase tracking-widest text-stone-500">Premier</p>
                                                                    <p className={`text-[11px] font-black tabular-nums ${darkMode ? 'text-white' : 'text-stone-900'}`}>{new Date(session.firstAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[8px] font-black uppercase tracking-widest text-stone-500">Vues</p>
                                                                    <p className="text-[11px] font-black tabular-nums text-blue-400">{session.visits}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[8px] font-black uppercase tracking-widest text-stone-500">Clics</p>
                                                                    <p className="text-[11px] font-black tabular-nums text-amber-400">{session.clicks}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {session.products.length > 0 && (
                                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                                {session.products.slice(0, 5).map((product) => (
                                                                    <span key={product} className={`max-w-full truncate rounded-lg border px-2 py-1 text-[8px] font-bold ${darkMode ? 'bg-white/5 border-white/5 text-stone-300' : 'bg-white border-stone-200 text-stone-600'}`}>
                                                                        {product}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="p-3 sm:p-4">
                                                        <div className="relative pl-6 space-y-4 before:absolute before:left-[10px] before:top-2 before:bottom-2 before:w-px before:bg-stone-700/50">
                                                            {session.events.map((event) => {
                                                                const meta = getComptoirEventMeta(event);
                                                                return (
                                                                    <div key={event.id} className="relative">
                                                                        <div className={`absolute -left-[18px] top-1.5 h-2 w-2 rounded-full ring-4 ${darkMode ? 'ring-stone-900' : 'ring-stone-50'} ${meta.dot}`} />
                                                                        <div className="min-w-0">
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <span className={`text-[8px] font-black uppercase tracking-widest ${meta.accent}`}>{new Date(event.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                                                                <span className={`rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ${meta.chip}`}>{meta.label}</span>
                                                                                {event.duration > 0 && <span className="text-[8px] font-bold text-stone-600">{formatDurationLabel(event.duration)}</span>}
                                                                            </div>
                                                                            <p className={`mt-1 text-[11px] font-black leading-snug ${darkMode ? 'text-stone-200' : 'text-stone-900'}`}>
                                                                                {event.label}{event.product ? <span className={meta.accent}> - {event.product}</span> : null}
                                                                            </p>
                                                                            {(event.context || event.source || event.productId) && (
                                                                                <div className="mt-1 flex flex-wrap gap-1.5">
                                                                                    {event.source && <span className="rounded-md border border-white/5 bg-white/5 px-2 py-0.5 text-[8px] font-bold text-stone-500">Source: {SOURCE_LABELS_B[event.source] || event.source}</span>}
                                                                                    {event.context && <span className="rounded-md border border-white/5 bg-white/5 px-2 py-0.5 text-[8px] font-bold text-stone-500">Origine: {event.context}</span>}
                                                                                    {event.productId && <span className="rounded-md border border-white/5 bg-white/5 px-2 py-0.5 text-[8px] font-mono text-stone-600">{event.productId}</span>}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="p-10 text-center text-stone-500 font-bold italic text-xs">Aucun parcours Comptoir detaille sur cette periode.</div>
                )}
            </div>

            {/* COMPTOIR VISITS CHART */}
            <div className={`p-6 md:p-8 rounded-[2rem] border ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                <div className="flex items-center justify-between mb-8">
                    <h3 className={`text-[10px] font-black uppercase tracking-[0.3em] ${darkMode ? 'text-white/40' : 'text-stone-400'}`}>Visiteurs sur Le Comptoir</h3>
                </div>
                <div className="h-[200px] md:h-[260px] w-full">
                    {comptoirVisitChartData.some(d => d.visites > 0) ? (
                        <TrafficChart data={comptoirVisitChartData} darkMode={darkMode} valueLabel="visiteur" animationKey={`comptoir-${animationKey}`} />
                    ) : (
                        <div className="flex items-center justify-center h-full text-stone-500 font-bold italic text-xs">Aucune visite Comptoir sur cette periode.</div>
                    )}
                </div>
            </div>

            {/* CHART */}
            <div className={`p-6 md:p-8 rounded-[2rem] border ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                <div className="flex items-center justify-between mb-8">
                    <h3 className={`text-[10px] font-black uppercase tracking-[0.3em] ${darkMode ? 'text-white/40' : 'text-stone-400'}`}>Évolution des Clics</h3>
                </div>
                <div className="h-[200px] md:h-[260px] w-full">
                    {clickChartData.some(d => d.visites > 0) ? (
                        <TrafficChart data={clickChartData} darkMode={darkMode} valueLabel="clic" animationKey={`clicks-${animationKey}`} />
                    ) : (
                        <div className="flex items-center justify-center h-full text-stone-500 font-bold italic text-xs">Aucun clic sur cette période.</div>
                    )}
                </div>
            </div>

            {/* BOTTOM GRID */}
            {filteredClicks.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Classement Produits */}
                    <div className={`lg:col-span-2 p-5 rounded-2xl border ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                        <p className={`text-[9px] font-black uppercase tracking-widest mb-4 ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>Classement Produits</p>
                        <div className="space-y-3">
                            {topProducts.slice(0, 8).map((p, i) => {
                                const rankStyle = i === 0 ? 'text-amber-400' : i === 1 ? 'text-stone-300' : 'text-stone-600';
                                const pct = Math.round((p.count / maxTop) * 100);
                                return (
                                    <div key={p.id} className="flex items-center gap-3">
                                        <span className={`text-[10px] font-black w-5 text-center shrink-0 ${rankStyle}`}>#{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`text-[11px] font-bold truncate ${darkMode ? 'text-stone-200' : 'text-stone-800'}`}>{p.name}</span>
                                                <span className={`text-[11px] font-black ml-2 shrink-0 tabular-nums ${darkMode ? 'text-white' : 'text-stone-900'}`}>{p.count}</span>
                                            </div>
                                            <div className={`h-1 rounded-full overflow-hidden ${darkMode ? 'bg-white/5' : 'bg-stone-100'}`}>
                                                <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {topProducts.length > 8 && <p className={`text-[9px] pt-1 ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>+ {topProducts.length - 8} autres produits avec des clics</p>}
                        </div>
                    </div>

                    {/* Stats secondaires */}
                    <div className="space-y-4">
                        {/* Par Programme */}
                        <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                            <p className={`text-[9px] font-black uppercase tracking-widest mb-4 ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>Par Programme</p>
                            <div className="space-y-2.5">
                                {byProgram.map(({ name, count }) => {
                                    const pct = Math.round((count / maxProg) * 100);
                                    const color = PROG_COLORS_B[name] || '#6B7280';
                                    return (
                                        <div key={name}>
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                    <span className={`text-[10px] font-bold ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>{PROG_LABELS_B[name] || name}</span>
                                                </div>
                                                <span className={`text-[10px] font-black tabular-nums ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>{count}</span>
                                            </div>
                                            <div className={`h-1 rounded-full overflow-hidden ${darkMode ? 'bg-white/5' : 'bg-stone-100'}`}>
                                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Par Gamme */}
                        <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                            <p className={`text-[9px] font-black uppercase tracking-widest mb-4 ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>Par Gamme</p>
                            <div className="space-y-2.5">
                                {byTier.map(({ name, count }) => {
                                    const pct = Math.round((count / maxTier) * 100);
                                    const color = TIER_COLORS_B[name] || '#6B7280';
                                    return (
                                        <div key={name}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`text-[10px] font-bold ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>{TIER_LABELS_B[name] || name}</span>
                                                <span className={`text-[10px] font-black tabular-nums ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>{count}</span>
                                            </div>
                                            <div className={`h-1 rounded-full overflow-hidden ${darkMode ? 'bg-white/5' : 'bg-stone-100'}`}>
                                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Par Source */}
                        <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                            <p className={`text-[9px] font-black uppercase tracking-widest mb-4 ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>Source d'Acquisition</p>
                            <div className="space-y-2.5">
                                {bySource.map(({ name, count }) => {
                                    const pct = Math.round((count / maxSource) * 100);
                                    const color = SOURCE_COLORS_B[name] || '#6B7280';
                                    return (
                                        <div key={name}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`text-[10px] font-bold ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>{SOURCE_LABELS_B[name] || name}</span>
                                                <span className={`text-[10px] font-black tabular-nums ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>{count}</span>
                                            </div>
                                            <div className={`h-1 rounded-full overflow-hidden ${darkMode ? 'bg-white/5' : 'bg-stone-100'}`}>
                                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Meubles Générateurs */}
                        {byParent.length > 0 && (
                            <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                                <p className={`text-[9px] font-black uppercase tracking-widest mb-4 ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>Meubles Générateurs</p>
                                <div className="space-y-3">
                                    {byParent.slice(0, 5).map(({ name, count }, i) => {
                                        const pct = Math.round((count / maxParent) * 100);
                                        return (
                                            <div key={name}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`text-[10px] font-bold truncate pr-2 ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>{name}</span>
                                                    <span className={`text-[10px] font-black tabular-nums ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>{count}</span>
                                                </div>
                                                <div className={`h-1 rounded-full overflow-hidden ${darkMode ? 'bg-white/5' : 'bg-stone-100'}`}>
                                                    <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}

            {/* FLUX DE CLICS CHRONOLOGIQUE */}
            {sessionsByDay.length > 0 ? (
                <div className="space-y-2 mt-8">
                    <h3 className={`text-[10px] font-black uppercase tracking-[0.3em] mb-4 ${darkMode ? 'text-white/40' : 'text-stone-400'}`}>Flux des Clics Affiliation</h3>
                    {sessionsByDay.map((group) => {
                        const isOpen = openDays[group.key];
                        return (
                            <div key={group.key} className={`rounded-2xl border overflow-hidden transition-all duration-300 ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100'}`}>
                                <button
                                    onClick={() => setOpenDays(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                                    className={`w-full p-3 sm:p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-stone-800' : 'bg-stone-50'}`}>
                                            {isOpen ? <ChevronDown size={14} className="text-stone-400" /> : <ChevronRight size={14} className="text-stone-400" />}
                                        </div>
                                        <div>
                                            <span className={`text-[11px] font-black uppercase tracking-widest ${darkMode ? 'text-white/70' : 'text-stone-900'}`}>{group.label}</span>
                                            <span className="ml-3 text-[10px] font-bold text-stone-500">{group.sessionsList.length} session{group.sessionsList.length > 1 ? 's' : ''}</span>
                                        </div>
                                    </div>
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-stone-500/10 to-transparent mx-6"></div>
                                </button>

                                {isOpen && (
                                    <div className="px-2 sm:px-4 pb-3 sm:pb-4 animate-in slide-in-from-top-1 duration-200">
                                        <div className="space-y-4">
                                            {group.sessionsList.map(sessionGroup => (
                                                <div key={sessionGroup.sessionId} className={`p-4 rounded-xl border ${darkMode ? 'bg-stone-900 border-white/5' : 'bg-stone-50 border-stone-100 shadow-sm'}`}>
                                                    <div className="flex items-center justify-between mb-4 px-1">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <Globe size={12} className="text-stone-500 shrink-0" />
                                                            {(() => {
                                                                const loc = formatSessionLocation(sessionGroup.sessionId);
                                                                if (loc) {
                                                                    return (
                                                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] truncate">
                                                                            <span className="text-stone-500">Session • </span>
                                                                            <span className={darkMode ? 'text-white/80' : 'text-stone-900'}>{loc}</span>
                                                                        </span>
                                                                    );
                                                                }
                                                                return (
                                                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 truncate">
                                                                        Session • Localisation inconnue
                                                                    </span>
                                                                );
                                                            })()}
                                                        </div>
                                                        <span className="text-[8px] font-bold text-stone-600 opacity-60 uppercase tracking-tighter shrink-0 ml-3">{sessionGroup.clicks.length} Clic{sessionGroup.clicks.length > 1 ? 's' : ''}</span>
                                                    </div>
                                                    
                                                    <div className="relative pl-6 space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-stone-800">
                                                        {sessionGroup.clicks.map((click, idx) => (
                                                            <div key={idx} className="relative group/step">
                                                                <div className={`absolute -left-[18.5px] top-1.5 w-[7px] h-[7px] rounded-full ring-4 ${darkMode ? 'ring-stone-900/50' : 'ring-white'} bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)] transition-all group-hover/step:scale-125`}></div>
                                                                <div className="flex flex-col gap-1 -translate-y-0.5">
                                                                    <span className="text-[8px] font-black uppercase tracking-widest leading-none text-amber-500/60">
                                                                        {new Date(getMillis(click.timestamp)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                    <p className={`font-black text-[11px] leading-tight ${darkMode ? 'text-stone-300' : 'text-stone-900'}`}>
                                                                        Clic : <span className="uppercase text-amber-500">{click.productName}</span>
                                                                    </p>
                                                                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-md truncate max-w-full italic border ${darkMode ? 'bg-white/5 border-white/5 text-stone-400' : 'bg-stone-200/50 border-stone-200 text-stone-600'}`}>
                                                                            Source : {SOURCE_LABELS_B[click.source] || click.source || 'Inconnue'}
                                                                        </span>
                                                                        {click.parentFurnitureName && (
                                                                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded-md truncate max-w-full italic border ${darkMode ? 'bg-indigo-500/10 border-indigo-500/10 text-indigo-400/80' : 'bg-indigo-50 border-indigo-100 text-indigo-600'}`}>
                                                                                Meuble : {click.parentFurnitureName}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-[#161616] border-white/5 text-stone-500' : 'bg-stone-50 border-stone-100 text-stone-400'} font-bold text-sm italic`}>
                    Aucun clic enregistré sur cette période.
                </div>
            )}
        </div>
    );
};

// ─── Analytics Principal ───────────────────────────────────────────────────────
const AdminAnalytics = ({ darkMode = false, canUseDangerousAdminActions = false }) => {
    const [sessions, setSessions] = useState(() => cachedAnalyticsSessions || []);
    const [loading, setLoading] = useState(false);
    const [restoringSessions, setRestoringSessions] = useState(() => !cachedAnalyticsSessions);
    const [timeFilter, setTimeFilter] = useState('1j'); // Default to 24h // '1h', '1j', '7j', '1mois', '1ans'
    const [expandedSessionId, setExpandedSessionId] = useState(null);
    const [now, setNow] = useState(Date.now());
    const [liveNow, setLiveNow] = useState(Date.now());
    const [currentPage, setCurrentPage] = useState(1);
    const DAYS_PER_PAGE = 10;
    const [view, setView] = useState('traffic');
    const [openVisitors, setOpenVisitors] = useState({});
    const [sessionsRefreshKey, setSessionsRefreshKey] = useState(() => cachedAnalyticsSessionsLoadedAt || 0);

    useEffect(() => {
        let cancelled = false;
        if (cachedAnalyticsSessions) {
            setRestoringSessions(false);
            return () => { cancelled = true; };
        }

        readAdminAnalyticsCache(ADMIN_SESSIONS_CACHE_KEY).then((snapshot) => {
            if (cancelled || !snapshot) return;
            cachedAnalyticsSessions = snapshot.data || [];
            cachedAnalyticsSessionsLoadedAt = snapshot.loadedAt || 0;
            setSessions(cachedAnalyticsSessions);
            setSessionsRefreshKey(cachedAnalyticsSessionsLoadedAt);
            if (cachedAnalyticsSessionsLoadedAt) setNow(cachedAnalyticsSessionsLoadedAt);
        }).finally(() => {
            if (!cancelled) setRestoringSessions(false);
        });

        return () => { cancelled = true; };
    }, []);

    // Refresh live status without moving the analytics window away from the last refresh.
    useEffect(() => {
        const i = setInterval(() => setLiveNow(Date.now()), 10000);
        return () => clearInterval(i);
    }, []);

    // Kpis
    const analyticsStats = useMemo(() => {
        const oldestStartedAt = sessions
            .map(session => getMillis(session.startedAt))
            .filter(Boolean)
            .reduce((oldest, value) => Math.min(oldest, value), Infinity);

        return buildAnalyticsStats(sessions, timeFilter, {
            now,
            coverageStartMs: Number.isFinite(oldestStartedAt) ? oldestStartedAt : null,
            fetchedCount: sessions.length,
            maxFetched: MAX_ANALYTICS_SESSIONS
        });
    }, [sessions, timeFilter, now]);

    const kpis = analyticsStats.kpis;
    const dataQuality = analyticsStats.dataQuality;
    const chartData = analyticsStats.chartData;

    // ─── Groupement des sessions par jour ───
    const filteredTrafficSessions = analyticsStats.realTraffic;

    const groupedByDay = useMemo(() => (
        buildVisitorDayGroups(filteredTrafficSessions, { now })
    ), [filteredTrafficSessions, now]);

    const totalPages = Math.ceil(groupedByDay.length / DAYS_PER_PAGE);
    const paginatedGroups = useMemo(() => {
        const start = (currentPage - 1) * DAYS_PER_PAGE;
        return groupedByDay.slice(start, start + DAYS_PER_PAGE);
    }, [groupedByDay, currentPage]);
    const ratioAccent = kpis.visitorConfidenceScore >= 85
        ? 'text-emerald-500'
        : kpis.visitorConfidenceScore >= 70
            ? 'text-amber-500'
            : 'text-red-500';
    const ratioBg = kpis.visitorConfidenceScore >= 85
        ? 'bg-emerald-500/10'
        : kpis.visitorConfidenceScore >= 70
            ? 'bg-amber-500/10'
            : 'bg-red-500/10';

    // Reset pagination when data changes significantly
    useEffect(() => {
        setCurrentPage(1);
        setExpandedSessionId(null);
    }, [timeFilter]);

    // ─── Sessions en ligne (Live) ───
    const liveSessions = useMemo(() => {
        return sessions.filter(s => {
            const lastActiveMs = getMillis(s.lastActivityAt);
            const isInactive = (liveNow - lastActiveMs) > 30000;
            return s.sessionActive !== false && !isInactive;
        });
    }, [sessions, liveNow]);

    const [openDays, setOpenDays] = useState({});
    
    // Ouvrir par défaut le premier jour (Aujourd'hui)
    useEffect(() => {
        if (groupedByDay.length > 0) {
            const firstKey = groupedByDay[0].key;
            setOpenDays(prev => {
                // Si on n'a encore rien d'ouvert, on ouvre le premier jour
                if (Object.keys(prev).length === 0) {
                    return { [firstKey]: true };
                }
                return prev;
            });
        }
    }, [groupedByDay.length]);

    const loadSessions = useCallback(async () => {
        setLoading(true);
        const refreshStartedAt = Date.now();
        const historyWindow = getAnalyticsWindow('1ans');
        const historyCutoff = Timestamp.fromMillis(refreshStartedAt - historyWindow.duration);
        const q = query(
            collection(db, 'analytics_sessions'),
            where('startedAt', '>=', historyCutoff),
            orderBy('startedAt', 'desc'),
            limit(MAX_ANALYTICS_SESSIONS)
        );

        try {
            const snap = await getDocs(q);
            const data = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // On filtre les admins pour ne pas polluer l'affichage et les stats
            const cleanData = data.filter(s => s.type !== 'admin');
            const loadedAt = Date.now();
            cachedAnalyticsSessions = cleanData;
            cachedAnalyticsSessionsLoadedAt = loadedAt;
            setNow(loadedAt);
            setSessions(cleanData);
            setSessionsRefreshKey(loadedAt);
            writeAdminAnalyticsCache(ADMIN_SESSIONS_CACHE_KEY, cleanData, loadedAt);
            setLoading(false);
        } catch (error) {
            console.error("Analytics load error:", error);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (restoringSessions || loading || sessions.length > 0 || sessionsRefreshKey > 0) return;
        loadSessions();
    }, [restoringSessions, loading, sessions.length, sessionsRefreshKey, loadSessions]);

    const formatDuration = (seconds) => {
        if (!seconds) return '0s';
        if (seconds < 60) return `${seconds}s`;
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min}m ${sec}s`;
    };

    const handleDeleteSession = async (id) => {
        if (!window.confirm("Supprimer cette session ? (Action irréversible)")) return;
        try {
            await httpsCallable(functions, 'deleteSession')({ sessionId: id });
            loadSessions();
        } catch (e) {
            console.error("Delete error:", e);
            alert("Erreur lors de la suppression");
        }
    };

    const handleClearAll = async () => {
        if (!window.confirm("☢️ ACTION CRITIQUE : Supprimer TOUTES les données d'analytics définitivement ?")) return;
        setLoading(true);
        try {
            await httpsCallable(functions, 'clearAllSessions')({});
            clearAdminAnalyticsCache(ADMIN_SESSIONS_CACHE_KEY);
            await loadSessions();
            setLoading(false);
        } catch (e) {
            console.error("Clear error:", e);
            setLoading(false);
            alert("Erreur lors du nettoyage");
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* VIEW SWITCHER */}
            <div className={`flex items-center gap-2 p-1 rounded-2xl border w-fit ${darkMode ? 'bg-stone-900 border-white/5' : 'bg-stone-100 border-stone-200'}`}>
                <button
                    onClick={() => setView('traffic')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === 'traffic' ? (darkMode ? 'bg-white text-stone-900' : 'bg-stone-900 text-white') : 'text-stone-500 hover:text-stone-300'}`}
                >
                    <Activity size={11} />
                    Traffic & Sessions
                </button>
                <button
                    onClick={() => setView('boutique')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === 'boutique' ? 'bg-amber-500 text-stone-900' : 'text-stone-500 hover:text-stone-300'}`}
                >
                    <ShoppingBag size={11} />
                    Boutique Affiliation
                </button>
            </div>

            {view === 'boutique' ? (
                <BoutiqueAnalytics
                    darkMode={darkMode}
                    sessions={sessions}
                    onRefreshSessions={loadSessions}
                    sessionsRefreshKey={sessionsRefreshKey}
                    loadingSessions={loading}
                    canUseDangerousAdminActions={canUseDangerousAdminActions}
                />
            ) : (loading || restoringSessions) && sessions.length === 0 ? (
                <div className="p-12 text-center text-stone-400 font-bold animate-pulse">Chargement Data...</div>
            ) : (<>

            {/* HEADER FILTERS */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                    <h3 className={`text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-stone-900'}`}>Analytics</h3>
                    <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Flux & Comportements</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={loadSessions}
                        disabled={loading}
                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border ${darkMode ? 'border-white/10 text-stone-300 hover:bg-white/10' : 'border-stone-200 text-stone-600 hover:bg-stone-100'} disabled:opacity-50`}
                    >
                        <RefreshCw size={13} className={loading ? 'inline mr-2 animate-spin' : 'inline mr-2'} />
                        Actualiser
                    </button>
                    {sessionsRefreshKey > 0 && (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-stone-500">
                            Maj {new Date(sessionsRefreshKey).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    {canUseDangerousAdminActions && <button
                        onClick={handleClearAll}
                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-red-500/20 text-red-500/60 hover:bg-red-500 hover:text-white active:scale-95`}
                    >
                        Purger Data
                    </button>}
                    <div className={`flex p-1 rounded-xl border ${darkMode ? 'bg-stone-900 border-white/5' : 'bg-stone-100 border-stone-200'}`}>
                        {ANALYTICS_TIME_FILTERS.map(tf => (
                            <button
                                key={tf.id}
                                onClick={() => setTimeFilter(tf.id)}
                                className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${timeFilter === tf.id ? (darkMode ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'bg-white text-stone-900 shadow-sm border border-stone-200') : 'text-stone-500 hover:text-stone-300'}`}
                            >
                                {tf.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* KPI PRINCIPAL */}
            <div key={`traffic-kpis-${sessionsRefreshKey}`} className={`p-5 sm:p-6 rounded-2xl border transition-all animate-in fade-in slide-in-from-bottom-2 duration-500 ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.24em] text-stone-500 mb-2">Utilisateurs uniques</p>
                        <h4 className={`text-4xl sm:text-5xl font-black tracking-tighter tabular-nums ${darkMode ? 'text-white' : 'text-stone-900'}`}>
                            {kpis.uniqueVisitors}
                        </h4>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${ratioBg} ${ratioAccent}`}>
                                Confiance {kpis.visitorConfidenceScore}%
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500">
                                {kpis.visitorConfidenceLabel}
                            </span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 sm:flex sm:items-center gap-3 sm:gap-5 text-left sm:text-right">
                        <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-stone-500">IPs uniques</p>
                            <p className="mt-1 text-sm font-black text-cyan-500 tabular-nums">{kpis.uniqueIps}</p>
                        </div>
                        <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-stone-500">Ratio UID/IP</p>
                            <p className={`mt-1 text-sm font-black tabular-nums ${ratioAccent}`}>{kpis.visitorIpRatioLabel}</p>
                        </div>
                        <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-stone-500">Sessions brutes</p>
                            <p className="mt-1 text-sm font-black text-stone-500 tabular-nums">{kpis.totalSessions}</p>
                        </div>
                    </div>
                </div>
                <p className="mt-4 text-[10px] font-bold text-stone-500 leading-relaxed">
                    Deduplication par UID Firebase, puis IP serveur. Le compteur utilisateurs uniques est {kpis.visitorIpRatio
                        ? `${Math.round((kpis.visitorIpRatio - 1) * 100)}% au-dessus`
                        : 'non comparable'} du compteur IPs uniques.
                </p>
            </div>

            <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center gap-3 ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${dataQuality.confidence === 'haute' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                    <AlertCircle size={16} />
                </div>
                <div className="min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-[0.22em] ${darkMode ? 'text-white/60' : 'text-stone-500'}`}>
                        Fiabilite {dataQuality.confidence}
                    </p>
                    <p className="text-[10px] font-bold text-stone-500 leading-relaxed">
                        {dataQuality.method} Fenetre {dataQuality.isWindowComplete ? 'complete' : `plafonnee a ${dataQuality.maxFetched} sessions`}.
                    </p>
                </div>
            </div>

            {/* CUSTOM SVG CHART BENTO */}
            <div className={`p-6 md:p-8 rounded-[2rem] border transition-all ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100 shadow-sm'}`}>
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className={`text-[10px] font-black uppercase tracking-[0.3em] ${darkMode ? 'text-white/40' : 'text-stone-400'}`}>Evolution des visiteurs</h3>
                        <p className="mt-1 text-[9px] font-bold text-stone-500">Chaque barre deduplique les visiteurs dans son creneau.</p>
                    </div>
                </div>
                <div className="h-[240px] md:h-[320px] w-full">
                    {chartData.length > 0 ? (
                        <TrafficChart data={chartData} darkMode={darkMode} valueLabel="visiteur" animationKey={`traffic-${sessionsRefreshKey}`} />
                    ) : (
                        <div className="flex items-center justify-center h-full text-stone-500 font-bold italic text-xs">Pas assez de données.</div>
                    )}
                </div>
            </div>

            {/* LIVE SESSIONS BAR (MODULE 3) */}
            {liveSessions.length > 0 && (
                <div className={`p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 animate-pulse-slow`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-2 text-emerald-500 shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></div>
                            <span className="text-[10px] font-black uppercase tracking-widest leading-none translate-y-[1px]">{liveSessions.length} Actif{liveSessions.length > 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[9px] font-bold text-emerald-500/60 transition-all">
                            {liveSessions.slice(0, 5).map(ls => (
                                <span key={ls.id} className="px-2 py-1 rounded-lg border border-emerald-500/10 bg-emerald-500/5 whitespace-nowrap">
                                    {ls.geo?.city && ls.geo.city !== 'Unknown' ? ls.geo.city : 'Inconnu'} • {ls.device || 'PC'}
                                </span>
                            ))}
                            {liveSessions.length > 5 && <span className="px-2 py-1 rounded-lg border border-emerald-500/5 bg-emerald-500/5 items-center inline-flex">+{liveSessions.length - 5}</span>}
                        </div>
                    </div>
                </div>
            )}

            {/* GROUPED SESSIONS LOG (MODULE 4) */}
            <div className="space-y-2">
                {groupedByDay.length === 0 ? (
                    <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-[#161616] border-white/5 text-stone-500' : 'bg-stone-50 border-stone-100 text-stone-400'} font-bold text-sm italic`}>
                        Aucune session enregistrée.
                    </div>
                ) : (
                    paginatedGroups.map((group) => {
                        const isOpen = openDays[group.key];
                        return (
                            <div key={group.key} className={`rounded-2xl border overflow-hidden transition-all duration-300 ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-100'}`}>
                                <button
                                    onClick={() => setOpenDays(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                                    className={`w-full p-3 sm:p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-stone-800' : 'bg-stone-50'}`}>
                                            {isOpen ? <ChevronDown size={14} className="text-stone-400" /> : <ChevronRight size={14} className="text-stone-400" />}
                                        </div>
                                        <div>
                                            <span className={`text-[11px] font-black uppercase tracking-widest ${darkMode ? 'text-white/70' : 'text-stone-900'}`}>{group.label}</span>
                                            <span className="ml-3 text-[10px] font-bold text-stone-500">
                                                {group.visitors.length} visiteur{group.visitors.length > 1 ? 's' : ''} / {group.sessionCount} session{group.sessionCount > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-stone-500/10 to-transparent mx-6"></div>
                                </button>

                                {isOpen && (
                                    <div className="px-2 sm:px-4 pb-3 sm:pb-4 animate-in slide-in-from-top-1 duration-200">
                                        <div className="space-y-1 sm:space-y-1.5">
                                            {group.visitors.map(visitor => {
                                                const visitorOpen = openVisitors[visitor.key] ?? group.visitors.length === 1;
                                                return (
                                                    <VisitorSessionGroup
                                                        key={visitor.key}
                                                        darkMode={darkMode}
                                                        visitor={visitor}
                                                        now={liveNow}
                                                        isOpen={visitorOpen}
                                                        onToggle={() => setOpenVisitors(prev => ({ ...prev, [visitor.key]: !visitorOpen }))}
                                                        expandedSessionId={expandedSessionId}
                                                        setExpandedSessionId={setExpandedSessionId}
                                                        handleDeleteSession={handleDeleteSession}
                                                        formatDuration={formatDuration}
                                                        canUseDangerousAdminActions={canUseDangerousAdminActions}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}

                {/* PAGINATION NUMBERS */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-1.5 pt-4">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className={`p-2.5 rounded-xl transition-all duration-300 border-2 ${
                                darkMode 
                                    ? (currentPage === 1 ? 'border-white/5 text-stone-700' : 'border-white/5 text-stone-400 hover:bg-white/5 hover:text-white') 
                                    : (currentPage === 1 ? 'border-stone-50 text-stone-200' : 'border-stone-100 text-stone-500 hover:bg-stone-50 hover:text-stone-900')
                            } active:scale-90`}
                        >
                            <ChevronRight className="rotate-180" size={16} />
                        </button>

                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-[1.25rem] border-2 border-white/5 bg-white/[0.02]">
                            {[...Array(totalPages)].map((_, i) => {
                                const page = i + 1;
                                if (totalPages > 7) {
                                    if (page > 1 && page < totalPages && Math.abs(page - currentPage) > 1) {
                                        if (page === 2 || page === totalPages - 1) return <span key={page} className="text-stone-700 px-1 select-none">···</span>;
                                        return null;
                                    }
                                }

                                return (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`w-9 h-9 rounded-xl text-[10px] font-black transition-all duration-500 ${currentPage === page
                                            ? (darkMode ? 'bg-white text-stone-900 shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-stone-900 text-white shadow-lg shadow-stone-900/20')
                                            : (darkMode ? 'text-stone-500 hover:text-white hover:bg-white/5' : 'text-stone-400 hover:text-stone-900 hover:bg-stone-100')
                                            }`}
                                    >
                                        {page}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            className={`p-2.5 rounded-xl transition-all duration-300 border-2 ${
                                darkMode 
                                    ? (currentPage === totalPages ? 'border-white/5 text-stone-700' : 'border-white/5 text-stone-400 hover:bg-white/5 hover:text-white') 
                                    : (currentPage === totalPages ? 'border-stone-50 text-stone-200' : 'border-stone-100 text-stone-500 hover:bg-stone-50 hover:text-stone-900')
                            } active:scale-90`}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* FOOTER INFO MODULE 5 */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 py-4 border-t border-white/5">
                {[
                    "Sessions admin auto-exclues",
                    "IPs admin exclues au login",
                    "Uniques: UID puis IP serveur",
                    "Sync protegee par jeton",
                    "Fenetre locale: 1 an"
                ].map((info, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-stone-700"></div>
                        <span className="text-[8px] font-black uppercase tracking-widest text-stone-600">{info}</span>
                    </div>
                ))}
            </div>
            </>)}
        </div>
    );
};

export default AdminAnalytics;
