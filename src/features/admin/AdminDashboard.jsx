import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    TrendingUp, ShoppingBag, AlertTriangle, RefreshCw, Mail,
    Gavel, Package, Clock, Archive, Users
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase/config';
import { getMillis } from '../../utils/time';
import { exportRowsToCsv } from '../../utils/csvExport';

// ─── CUSTOM SVG CHARTS ───

// Format Y-axis tick value
const fmtYTick = (v) => {
    if (v === 0) return '0 €';
    if (v >= 1000) return `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}k€`;
    return `${v} €`;
};

// Round max up to a clean, readable financial grid scale
const niceMax = (raw) => {
    if (!raw || raw <= 0) return 500;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    let nice;
    if (n <= 1) nice = 1;
    else if (n <= 1.25) nice = 1.25;
    else if (n <= 1.5) nice = 1.5;
    else if (n <= 2) nice = 2;
    else if (n <= 2.5) nice = 2.5;
    else if (n <= 5) nice = 5;
    else nice = 10;
    return nice * mag;
};

// ─── APPLE STOCK LINE CHART (Asset-Design Quality) ───
const straightLinePath = (pts) => {
    if (!pts.length) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
};

const RevenueChart = ({ 
    data, 
    darkMode, 
    timeFilter, 
    setTimeFilter, 
    filterLabel 
}) => {
    const containerRef = useRef(null);
    const [dims, setDims] = useState({ w: 600, h: 250 });
    const [activeIdx, setActiveIdx] = useState(null);
    const [animated, setAnimated] = useState(false);
    const [pathLen, setPathLen] = useState(3000);
    const pathRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => {
            if (e.contentRect.width > 0) {
                setDims({ w: e.contentRect.width, h: 250 });
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        setAnimated(false);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = requestAnimationFrame(() => setAnimated(true));
        });
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [data, timeFilter]);

    const YTICKS = 4;
    const mg = useMemo(() => {
        const isSmall = dims.w < 420;
        return {
            top: 16,
            right: isSmall ? 10 : 20,
            bottom: 36,
            left: isSmall ? 44 : 60
        };
    }, [dims.w]);
    const cW = Math.max(10, dims.w - mg.left - mg.right);
    const cH = Math.max(10, dims.h - mg.top - mg.bottom);

    const periodTotal = useMemo(() => data.reduce((acc, d) => acc + (d.value || 0), 0), [data]);
    const periodOrders = useMemo(() => data.reduce((acc, d) => acc + (d.orderCount || 0), 0), [data]);

    const rawMax = useMemo(() => Math.max(...data.map(d => d.value), 0), [data]);
    const maxV = useMemo(() => niceMax(rawMax), [rawMax]);

    const pts = useMemo(() => {
        if (!data.length) return [];
        const n = data.length;
        return data.map((d, i) => {
            const x = mg.left + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
            const y = mg.top + cH - ((d.value / maxV) * cH);
            return {
                ...d,
                x,
                y,
                idx: i
            };
        });
    }, [data, cW, cH, maxV, mg]);

    const linePath = useMemo(() => straightLinePath(pts), [pts]);

    const areaPath = useMemo(() => {
        if (!pts.length) return '';
        const by = mg.top + cH;
        return `${linePath} L ${pts[pts.length - 1].x.toFixed(1)},${by} L ${pts[0].x.toFixed(1)},${by} Z`;
    }, [linePath, pts, mg, cH]);

    const yTicks = useMemo(() => Array.from({ length: YTICKS + 1 }, (_, i) => ({
        val: (maxV / YTICKS) * i,
        y: mg.top + cH - (i / YTICKS) * cH,
    })), [maxV, cH, mg]);

    const xLabels = useMemo(() => {
        if (!pts.length) return [];
        const candidates = pts.filter(p => !!p.axisLabel);
        if (candidates.length <= 2) return candidates;

        const minSpacing = dims.w < 360 ? 64 : dims.w < 480 ? 52 : 44;
        const visible = [candidates[0]];
        
        for (let i = 1; i < candidates.length; i++) {
            const pt = candidates[i];
            const isLast = (i === candidates.length - 1);
            const prev = visible[visible.length - 1];

            if (isLast) {
                if (pt.x - prev.x < minSpacing && visible.length > 1) {
                    visible.pop();
                }
                visible.push(pt);
            } else if (pt.x - prev.x >= minSpacing) {
                visible.push(pt);
            }
        }
        return visible;
    }, [pts, dims.w]);

    const handlePointerMove = (e) => {
        if (!pts.length) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        
        let closestIdx = 0;
        let minDist = Infinity;
        pts.forEach((p, i) => {
            const d = Math.abs(p.x - clientX);
            if (d < minDist) {
                minDist = d;
                closestIdx = i;
            }
        });
        setActiveIdx(closestIdx);
    };

    useEffect(() => {
        if (pathRef.current) {
            const l = pathRef.current.getTotalLength();
            if (l > 0) setPathLen(l);
        }
    }, [linePath, dims]);

    const activePt = activeIdx !== null && pts[activeIdx] ? pts[activeIdx] : null;
    const displayAmount = activePt ? activePt.value : periodTotal;

    const baseStrokeColor = '#3B82F6';
    const gradId = `appleRevGrad_${darkMode ? 'dark' : 'light'}`;
    const glowFilterId = `appleRevGlow_${darkMode ? 'dark' : 'light'}`;

    return (
        <div className="w-full select-none">
            {/* TOP BAR / INTERACTIVE HEADER - RESPONSIVE CLEAN APPLE FINANCIAL LAYOUT */}
            <div className="mb-5">
                {/* Row 1: Title & Period Switcher on one clean horizontal line */}
                <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-black uppercase tracking-[0.18em] shrink-0 ${darkMode ? 'text-white/40' : 'text-stone-400'}`}>
                            Évolution du CA
                        </span>
                        {filterLabel && (
                            <span className={`hidden sm:inline-block text-[9px] font-bold uppercase tracking-wider ${
                                darkMode ? 'text-white/30' : 'text-stone-400'
                            }`}>
                                {filterLabel}
                            </span>
                        )}
                    </div>

                    {/* PERIOD BUTTONS (7J | 1M | 1A | MAX) - COMPACT & RESPONSIVE */}
                    {setTimeFilter && (
                        <div className={`flex gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-xl shrink-0 border ${
                            darkMode ? 'bg-white/[0.03] border-white/10' : 'bg-stone-100 border-stone-200'
                        }`}>
                            {[
                                { id: '7days', label: '7J' },
                                { id: '1month', label: '1M' },
                                { id: '1year', label: '1A' },
                                { id: 'alltime', label: 'MAX' }
                            ].map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setTimeFilter(f.id)}
                                    className={`px-2 sm:px-3 py-1 rounded-lg text-[9px] sm:text-[10px] font-black uppercase transition-all duration-200 ${
                                        timeFilter === f.id
                                            ? (darkMode ? 'bg-white text-stone-900 shadow-md font-bold' : 'bg-white text-stone-900 shadow-sm font-bold')
                                            : (darkMode ? 'text-white/40 hover:text-white' : 'text-stone-400 hover:text-stone-600')
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Row 2: Full-width Amount readout - NEVER WRAPS */}
                <div className="flex items-baseline gap-2">
                    <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight whitespace-nowrap ${darkMode ? 'text-white' : 'text-stone-900'}`}>
                        {displayAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xl sm:text-2xl lg:text-3xl text-stone-500 font-normal">€</span>
                    </h2>
                </div>

                {/* Row 3: Fixed-height subtitle row */}
                <div className="h-5 flex items-center mt-1">
                    {activePt ? (
                        <p className="text-xs font-semibold tracking-wide flex items-center gap-3">
                            <span className={darkMode ? 'text-sky-400' : 'text-blue-600'}>
                                {activePt.fullDate}
                            </span>
                            <span className={darkMode ? 'text-emerald-400' : 'text-emerald-600'}>
                                {activePt.orderCount} commande{activePt.orderCount > 1 ? 's' : ''}
                            </span>
                        </p>
                    ) : (
                        <p className={`text-xs font-semibold tracking-wide flex items-center gap-1.5 ${
                            darkMode ? 'text-emerald-400' : 'text-emerald-600'
                        }`}>
                            <TrendingUp size={13} className="shrink-0" />
                            <span>{periodOrders} commande{periodOrders > 1 ? 's' : ''} au total</span>
                        </p>
                    )}
                </div>
            </div>

            {/* CHART SVG CONTAINER */}
            <div 
                ref={containerRef} 
                className="w-full relative select-none cursor-crosshair group"
                style={{ height: dims.h }}
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setActiveIdx(null)}
            >
                <svg width={dims.w} height={dims.h} className="block overflow-visible">
                    <defs>
                        {/* Luminous Apple area fill gradient */}
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={baseStrokeColor} stopOpacity={darkMode ? 0.32 : 0.18} />
                            <stop offset="60%" stopColor={baseStrokeColor} stopOpacity={darkMode ? 0.08 : 0.03} />
                            <stop offset="100%" stopColor={baseStrokeColor} stopOpacity="0" />
                        </linearGradient>

                        {/* Drop shadow / subtle glow on curve */}
                        <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={baseStrokeColor} floodOpacity={darkMode ? 0.45 : 0.25} />
                        </filter>

                        <clipPath id="rcDataAreaClip">
                            <rect x={mg.left - 2} y={mg.top - 4} width={cW + 4} height={cH + 8} />
                        </clipPath>
                    </defs>

                    {/* Y-axis horizontal grid lines & labels */}
                    {yTicks.map((tk, i) => (
                        <g key={i}>
                            <line 
                                x1={mg.left} 
                                y1={tk.y} 
                                x2={mg.left + cW} 
                                y2={tk.y}
                                stroke={darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} 
                                strokeWidth={1} 
                                strokeDasharray={i === 0 ? '' : '3 4'} 
                            />
                            <text 
                                x={mg.left - 8} 
                                y={tk.y + 3.5} 
                                textAnchor="end"
                                fontSize={dims.w < 400 ? 9 : 10} 
                                fontFamily="ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,sans-serif"
                                fontWeight="600" 
                                fill={darkMode ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.38)'}
                            >
                                {fmtYTick(tk.val)}
                            </text>
                        </g>
                    ))}

                    {/* X-axis baseline */}
                    <line 
                        x1={mg.left} 
                        y1={mg.top + cH} 
                        x2={mg.left + cW} 
                        y2={mg.top + cH}
                        stroke={darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'} 
                        strokeWidth={1} 
                    />

                    {/* X-axis milestone labels (non-colliding) */}
                    {xLabels.map((pt, i) => (
                        <text 
                            key={i} 
                            x={pt.x} 
                            y={mg.top + cH + 20} 
                            textAnchor="middle"
                            fontSize={dims.w < 400 ? 9 : 10} 
                            fontFamily="ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,sans-serif"
                            fontWeight="600" 
                            fill={darkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'}
                            style={{ textTransform: 'uppercase', letterSpacing: dims.w < 400 ? '0.02em' : '0.04em' }}
                        >
                            {pt.axisLabel}
                        </text>
                    ))}

                    {/* Data Paths: Area + Animated Stroke */}
                    {pts.length > 0 && (
                        <g clipPath="url(#rcDataAreaClip)">
                            <path d={areaPath} fill={`url(#${gradId})`} />
                            <path 
                                ref={pathRef} 
                                d={linePath} 
                                fill="none"
                                stroke={baseStrokeColor} 
                                strokeWidth="2.5"
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                                filter={`url(#${glowFilterId})`}
                                style={{
                                    strokeDasharray: pathLen,
                                    strokeDashoffset: animated ? 0 : pathLen,
                                    transition: animated ? 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
                                }} 
                            />
                        </g>
                    )}

                    {/* Hover Crosshair & Clean Apple Dot */}
                    {activePt && (
                        <g>
                            {/* Vertical guideline */}
                            <line 
                                x1={activePt.x} 
                                y1={mg.top} 
                                x2={activePt.x} 
                                y2={mg.top + cH}
                                stroke={darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}
                                strokeWidth={1} 
                                strokeDasharray="3 3" 
                            />

                            {/* Clean point on vertex: no pulsing AI halos */}
                            <circle 
                                cx={activePt.x} 
                                cy={activePt.y} 
                                r={4.5}
                                fill={baseStrokeColor}
                                stroke="#ffffff" 
                                strokeWidth={2}
                            />
                        </g>
                    )}
                </svg>

                {/* FLOATING DARK GLASS TOOLTIP */}
                {activePt && (
                    <div 
                        className="absolute pointer-events-none z-20 transition-all duration-75"
                        style={{
                            left: Math.max(mg.left + 50, Math.min(dims.w - 60, activePt.x)),
                            top: Math.max(8, activePt.y - 12),
                            transform: 'translate(-50%, -100%)',
                        }}
                    >
                        <div className={`px-3 py-2 rounded-2xl border shadow-2xl backdrop-blur-xl whitespace-nowrap text-center ${
                            darkMode 
                                ? 'bg-[#1C1C1E]/95 border-white/10 text-white shadow-black/60' 
                                : 'bg-white/95 border-stone-200 text-stone-900 shadow-stone-300/50'
                        }`}>
                            <p className={`text-[9px] uppercase tracking-[0.14em] font-bold mb-0.5 ${
                                darkMode ? 'text-white/45' : 'text-stone-400'
                            }`}>
                                {activePt.fullDate || activePt.label}
                            </p>
                            <p className="text-sm font-black font-mono tracking-tight">
                                {activePt.value === 0 ? (
                                    <span className={darkMode ? 'text-white/30' : 'text-stone-300'}>0,00 €</span>
                                ) : (
                                    `${activePt.value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                                )}
                            </p>
                            {activePt.orderCount > 0 && (
                                <p className={`text-[10px] font-bold mt-0.5 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                    {activePt.orderCount} commande{activePt.orderCount > 1 ? 's' : ''}
                                </p>
                            )}
                        </div>
                        {/* Downward triangle arrow */}
                        <div className="flex justify-center -mt-px">
                            <div className={`w-2.5 h-2.5 rotate-45 border-r border-b ${
                                darkMode ? 'bg-[#1C1C1E]/95 border-white/10' : 'bg-white/95 border-stone-200'
                            }`} />
                        </div>
                    </div>
                )}

                {/* EMPTY STATE */}
                {!pts.length && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <p className={`text-xs font-bold uppercase tracking-wider ${
                            darkMode ? 'text-white/20' : 'text-stone-300'
                        }`}>
                            Aucune donnée sur cette période
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

const StatusArc = ({ counts, darkMode }) => {
    const total = counts.paid + counts.pending + counts.shipped;
    const radius = 46;
    const strokeWidth = 10;
    const circumference = 2 * Math.PI * radius;
    
    const highlightTotal = counts.paid + counts.shipped;
    const percentage = total === 0 ? 0 : highlightTotal / total;
    const offset = circumference - (percentage * circumference);

    return (
        <div className="flex flex-col items-center justify-center relative w-full h-full min-h-[180px]">
            <svg width="120" height="120" className="transform -rotate-90">
                <circle
                    cx="60" cy="60" r={radius}
                    fill="none"
                    stroke={darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}
                    strokeWidth={strokeWidth}
                />
                <circle
                    cx="60" cy="60" r={radius}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-4">
                <span className={`text-2xl font-black tracking-tighter ${darkMode ? 'text-white' : 'text-stone-900'}`}>
                    {total > 0 ? Math.round(percentage * 100) : 0}%
                </span>
                <span className="text-[8px] uppercase tracking-widest text-stone-400 font-bold -mt-1">Payées</span>
            </div>
            
            <div className="mt-2 flex gap-4 text-[10px] uppercase font-bold tracking-wider">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    <span className={darkMode ? 'text-white/60' : 'text-stone-500'}>Payé ({highlightTotal})</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${darkMode ? 'bg-white/10' : 'bg-black/10'}`}></div>
                    <span className={darkMode ? 'text-white/60' : 'text-stone-500'}>En attente ({counts.pending})</span>
                </div>
            </div>
        </div>
    );
};


// ─── ADMIN DASHBOARD ───

const AdminDashboard = ({ user, canUseDangerousAdminActions = false, darkMode = false, items = [], boardItems = [] }) => {
    const [stats, setStats] = useState({
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        totalStockValue: 0,
        activeAuctionsCount: 0,
        totalItemsForSale: 0,
        registeredUsers: 0
    });

    const [timeFilter, setTimeFilter] = useState('1month');
    const [allOrders, setAllOrders] = useState([]);
    const [recentOrders, setRecentOrders] = useState([]);
    const [statusCounts, setStatusCounts] = useState({ paid: 0, pending: 0, shipped: 0 });
    const [activeAuctions, setActiveAuctions] = useState([]); 
    const [loading, setLoading] = useState(true);

    // Modals
    const [isOrderResetModalOpen, setIsOrderResetModalOpen] = useState(false);
    const [isCleaningModalOpen, setIsCleaningModalOpen] = useState(false);
    const [isResetUsersModalOpen, setIsResetUsersModalOpen] = useState(false);
    const [exportingUsers, setExportingUsers] = useState(false);
    const [isPurgeAnonymousModalOpen, setIsPurgeAnonymousModalOpen] = useState(false);
    const [purgingAnonymous, setPurgingAnonymous] = useState(false);

    const chartData = useMemo(() => {
        if (!allOrders.length) return [];

        const activeOrders = allOrders.filter(o => o.status !== 'cancelled' && o.status !== 'cancelled_by_client');

        // Local timezone-safe formatters to prevent UTC off-by-one shifts
        const toLocalDateStr = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const toLocalMonthStr = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            return `${y}-${m}`;
        };

        if (timeFilter === '7days' || timeFilter === '1month') {
            const count = timeFilter === '7days' ? 7 : 30;
            const dates = Array.from({ length: count }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (count - 1 - i));
                const raw = toLocalDateStr(d);

                if (timeFilter === '7days') {
                    const dayName = d.toLocaleDateString('fr-FR', { weekday: 'short' });
                    const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1, 3);
                    const dayNum = String(d.getDate()).padStart(2, '0');
                    const label = `${dayNameCap} ${dayNum}`;
                    const fullDate = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                    return { raw, label, axisLabel: label, fullDate };
                } else {
                    // 30 days: display only 6 milestone ticks (indices: 0, 6, 12, 18, 24, 29) to avoid ANY collision
                    const dayNum = String(d.getDate()).padStart(2, '0');
                    const monthShort = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
                    const label = `${dayNum} ${monthShort}`;
                    const isMilestone = (i === 0 || i === 6 || i === 12 || i === 18 || i === 24 || i === 29);
                    const axisLabel = isMilestone ? `${dayNum} ${monthShort}` : '';
                    const fullDate = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                    return { raw, label, axisLabel, fullDate };
                }
            });

            const revMap = {};
            const countMap = {};
            dates.forEach(d => {
                revMap[d.raw] = 0;
                countMap[d.raw] = 0;
            });

            activeOrders.forEach(data => {
                const ts = getMillis(data.createdAt);
                if (ts) {
                    const d = new Date(ts);
                    const key = toLocalDateStr(d);
                    if (revMap[key] !== undefined) {
                        revMap[key] += (Number(data.total) || 0);
                        countMap[key] += 1;
                    }
                }
            });

            return dates.map(d => ({
                label: d.label,
                axisLabel: d.axisLabel,
                fullDate: d.fullDate,
                value: Math.round(revMap[d.raw] * 100) / 100,
                orderCount: countMap[d.raw] || 0
            }));
        } else {
            // 1 Year or All Time: Group by Month
            const monthNamesShort = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
            const monthNamesLong = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
            let monthsArray = [];

            if (timeFilter === '1year') {
                monthsArray = Array.from({ length: 12 }, (_, i) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - (11 - i));
                    const raw = toLocalMonthStr(d);
                    const mIdx = d.getMonth();
                    const shortLabel = monthNamesShort[mIdx];
                    const fullDate = `${monthNamesLong[mIdx]} ${d.getFullYear()}`;
                    return { raw, label: shortLabel, axisLabel: shortLabel, fullDate };
                });
            } else {
                // All Time: find oldest order
                const oldestTs = Math.min(...activeOrders.map(o => getMillis(o.createdAt) || Date.now()));
                const start = new Date(oldestTs);
                const end = new Date();
                let current = new Date(start.getFullYear(), start.getMonth(), 1);

                while (current <= end) {
                    const raw = toLocalMonthStr(current);
                    const mIdx = current.getMonth();
                    const yr = String(current.getFullYear()).slice(-2);
                    const shortLabel = `${monthNamesShort[mIdx]} ${yr}`;
                    const fullDate = `${monthNamesLong[mIdx]} ${current.getFullYear()}`;
                    monthsArray.push({ raw, label: shortLabel, axisLabel: shortLabel, fullDate });
                    current.setMonth(current.getMonth() + 1);
                }

                if (monthsArray.length > 24) {
                    monthsArray = monthsArray.slice(-24);
                }

                // If many months, display ticks evenly spaced to avoid crowding
                const step = monthsArray.length > 12 ? Math.ceil(monthsArray.length / 7) : 1;
                monthsArray = monthsArray.map((m, idx) => ({
                    ...m,
                    axisLabel: (idx % step === 0 || idx === monthsArray.length - 1) ? m.label : ''
                }));
            }

            const revMap = {};
            const countMap = {};
            monthsArray.forEach(m => {
                revMap[m.raw] = 0;
                countMap[m.raw] = 0;
            });

            activeOrders.forEach(data => {
                const ts = getMillis(data.createdAt);
                if (ts) {
                    const d = new Date(ts);
                    const key = toLocalMonthStr(d);
                    if (revMap[key] !== undefined) {
                        revMap[key] += (Number(data.total) || 0);
                        countMap[key] += 1;
                    }
                }
            });

            return monthsArray.map(m => ({
                label: m.label,
                axisLabel: m.axisLabel,
                fullDate: m.fullDate,
                value: Math.round(revMap[m.raw] * 100) / 100,
                orderCount: countMap[m.raw] || 0
            }));
        }
    }, [allOrders, timeFilter]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Fetch Orders
                const ordersSnapshot = await getDocs(collection(db, 'orders'));
                let revenue = 0;
                let orderCount = 0;
                const orders = [];
                let p = 0, w = 0, s = 0;

                ordersSnapshot.forEach(doc => {
                    const data = doc.data();
                    const isCancelled = data.status === 'cancelled' || data.status === 'cancelled_by_client';

                    if (!isCancelled) {
                        revenue += (data.total || 0);
                        orderCount++;
                        if (data.status === 'completed' || data.status === 'paid') p++;
                        else if (data.status === 'shipped') s++;
                        else w++; // pending
                    }
                    orders.push({ id: doc.id, ...data });
                });

                setStatusCounts({ paid: p, pending: w, shipped: s });
                setAllOrders(orders); 

                const activeOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'cancelled_by_client');
                const sortedOrders = activeOrders.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 5);
                setRecentOrders(sortedOrders);

                setStats(prev => ({
                    ...prev,
                    totalRevenue: revenue,
                    totalOrders: orderCount,
                    averageOrderValue: orderCount > 0 ? Math.round(revenue / orderCount) : 0,
                    registeredUsers: 0 
                }));

                // 3. Fetch User Stats
                httpsCallable(functions, 'getUserStats')().then(res => {
                    setStats(prev => ({ ...prev, registeredUsers: res.data.count }));
                }).catch(err => console.error("Failed to fetch user stats", err));

                setLoading(false);
            } catch (error) {
                console.error("Error fetching dashboard data:", error);
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    useEffect(() => {
        let stockValue = 0;
        const auctions = [];

        const processItem = (item, type) => {
            const price = item.currentPrice || item.startingPrice || 0;
            const stock = item.stock !== undefined ? Number(item.stock) : 1;

            if (!item.sold && stock > 0) {
                stockValue += (price * stock);
            }
            if (item.auctionActive && !item.sold && stock > 0) {
                const endTime = item.auctionEnd ? getMillis(item.auctionEnd) : 0;
                const timeLeft = Math.max(0, endTime - Date.now());
                auctions.push({ ...item, type, timeLeft, bidCount: item.bidCount || 0 });
            }
        };

        items.forEach(item => processItem(item, 'Mobilier'));
        boardItems.forEach(item => processItem(item, 'Planche'));
        auctions.sort((a, b) => a.timeLeft - b.timeLeft);

        setActiveAuctions(auctions);
        setStats(prev => ({
            ...prev,
            totalStockValue: stockValue,
            activeAuctionsCount: auctions.length
        }));
    }, [items, boardItems]);

    // ─── ACTIONS ───
    const handleResetOrdersClick = () => setIsOrderResetModalOpen(true);

    const exportToCsv = (orders) => {
        const data = orders.map(order => ({
            'ID Commande': order.id,
            'Date': new Date(getMillis(order.createdAt)).toLocaleString(),
            'Client': order.shipping?.fullName || 'N/A',
            'Total': `${order.total} €`,
            'Statut': order.status || 'N/A'
        }));
        exportRowsToCsv(data, `Commandes_${new Date().toISOString().split('T')[0]}.csv`);
    };

    const confirmResetOrders = async () => {
        try {
            exportToCsv(allOrders);
            const resetOrdersFn = httpsCallable(functions, 'resetAllOrders');
            const result = await resetOrdersFn();
            const count = result.data.count;
            setStats(prev => ({ ...prev, totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 }));
            setRecentOrders([]);
            setAllOrders([]);
            setIsOrderResetModalOpen(false);
            alert(`Succès ! ${count} commandes archivées et supprimées.`);
        } catch (error) {
            console.error(error);
            alert("Erreur purge commandes: " + error.message);
        }
    };

    const confirmCleaning = async () => {
        try {
            const garbageCollectorFn = httpsCallable(functions, 'runGarbageCollector');
            const result = await garbageCollectorFn();
            const s = result.data.stats;
            const freedMb = (s.storageSpaceFreedBytes / (1024 * 1024)).toFixed(2);
            setIsCleaningModalOpen(false);
            alert(`✅ Nettoyage terminé.\nEspace libéré : ${freedMb} Mo\nImages supprimées : ${s.orphanedImagesDeleted}`);
        } catch (error) { console.error(error); alert("Erreur nettoyage: " + error.message); }
    };

    const confirmResetUsers = async () => {
        try {
            const resetUsersFn = httpsCallable(functions, 'resetAllUsers');
            const result = await resetUsersFn();
            setIsResetUsersModalOpen(false);
            alert(`✅ Succès !\n${result.data.message}`);
        } catch (error) { console.error(error); alert("Erreur purge utilisateurs: " + error.message); }
    };

    const confirmPurgeAnonymous = async () => {
        setPurgingAnonymous(true);
        try {
            const purgeAnonymousFn = httpsCallable(functions, 'purgeAnonymousUsers');
            const result = await purgeAnonymousFn();
            setIsPurgeAnonymousModalOpen(false);
            alert(`✅ Succès !\n${result.data.message}`);
        } catch (error) { console.error(error); alert("Erreur purge anonymes: " + error.message); } 
        finally { setPurgingAnonymous(false); }
    };

    const handleExportUsers = async () => {
        setExportingUsers(true);
        try {
            const getUserStatsFn = httpsCallable(functions, 'getUserStats');
            const result = await getUserStatsFn();
            const users = result.data.users;

            const data = users.map(u => ({
                'ID': u.uid, 'Email': u.email, 'Nom': u.displayName,
                'Inscription': new Date(u.creationTime).toLocaleDateString(),
                'Connexion': new Date(u.lastSignInTime).toLocaleDateString()
            }));

            exportRowsToCsv(data, `Clients_${new Date().toISOString().split('T')[0]}.csv`);

            alert(`✅ Export réussi : ${users.length} clients exportés.`);
        } catch (error) { console.error(error); alert("Erreur export utilisateurs: " + error.message); } 
        finally { setExportingUsers(false); }
    };

    if (loading) return <div className="p-12 text-center text-stone-400 font-bold animate-pulse">Chargement...</div>;

    const baseCard = darkMode ? 'bg-[#161616] border border-white/5 shadow-2xl' : 'bg-white border border-stone-100 shadow-sm';
    const textBase = darkMode ? 'text-white' : 'text-stone-900';
    const textMuted = darkMode ? 'text-white/40' : 'text-stone-400';

    const getFilterLabel = () => {
        if (timeFilter === '7days') return "les 7 derniers jours";
        if (timeFilter === '1month') return "les 30 derniers jours";
        if (timeFilter === '1year') return "les 12 derniers mois";
        return "tout l'historique";
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 pb-20">

            {/* MODULE 1: KPI ROW (3 Cards) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                {/* CA */}
                <div className={`p-5 sm:p-8 rounded-[28px] sm:rounded-[32px] ${baseCard}`}>
                    <p className={`text-[10px] uppercase font-black tracking-[0.2em] mb-4 ${textMuted}`}>Chiffre d'Affaires</p>
                    <h2 className={`text-4xl lg:text-5xl font-black font-mono tracking-tight mb-2 ${textBase}`}>
                        {stats.totalRevenue.toLocaleString('fr-FR')} <span className="text-2xl text-stone-500 font-normal">€</span>
                    </h2>
                    <p className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                        <TrendingUp size={14} /> Panier moyen : <span className="font-mono">{stats.averageOrderValue} €</span>
                    </p>
                </div>

                {/* COMMANDES */}
                <div className={`p-5 sm:p-8 rounded-[28px] sm:rounded-[32px] ${baseCard}`}>
                    <p className={`text-[10px] uppercase font-black tracking-[0.2em] mb-4 ${textMuted}`}>Commandes</p>
                    <h2 className={`text-4xl lg:text-5xl font-black font-mono tracking-tight mb-2 ${textBase}`}>
                        {stats.totalOrders}
                    </h2>
                    <p className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                        <ShoppingBag size={14} /> Global cumulé
                    </p>
                </div>

                {/* CLIENTS */}
                <div className={`p-5 sm:p-8 rounded-[28px] sm:rounded-[32px] ${baseCard} relative`}>
                    <p className={`text-[10px] uppercase font-black tracking-[0.2em] mb-4 ${textMuted}`}>Clients Inscrits</p>
                    <h2 className={`text-4xl lg:text-5xl font-black font-mono tracking-tight mb-2 ${textBase}`}>
                        {stats.registeredUsers}
                    </h2>
                    <button
                        onClick={handleExportUsers}
                        disabled={exportingUsers}
                        className={`mt-4 w-full md:w-auto flex items-center justify-center gap-2.5 text-[10px] uppercase font-black tracking-widest px-5 py-3 rounded-xl border-2 transition-all duration-300 ${
                            darkMode 
                                ? 'border-white/5 bg-white/5 hover:bg-white hover:text-stone-900 text-white/70' 
                                : 'border-stone-100 bg-stone-50 hover:bg-stone-900 hover:text-white text-stone-500'
                        }`}
                    >
                        {exportingUsers ? <RefreshCw size={14} className="animate-spin" /> : <Archive size={14} />} 
                        <span>Exporter CSV</span>
                    </button>
                    {/* Catalog value strictly positioned on top right of clients card as a tiny metric */}
                    <div className="absolute top-5 right-5 sm:top-8 sm:right-8 text-right">
                        <p className={`text-[8px] uppercase font-black tracking-widest ${textMuted}`}>Valeur Catalogue</p>
                        <p className={`text-xs font-black font-mono ${darkMode ? 'text-stone-300' : 'text-stone-600'}`}>{stats.totalStockValue} €</p>
                    </div>
                </div>
            </div>

            {/* MODULE 2: GRAPHICS (CA + STATUS) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className={`lg:col-span-2 p-4 sm:p-8 rounded-[28px] sm:rounded-[32px] ${baseCard}`}>
                    <RevenueChart 
                        data={chartData} 
                        darkMode={darkMode} 
                        timeFilter={timeFilter} 
                        setTimeFilter={setTimeFilter} 
                        filterLabel={getFilterLabel()} 
                    />
                </div>
                
                <div className={`p-8 rounded-[32px] flex flex-col items-center justify-center ${baseCard}`}>
                    <div className="w-full text-left mb-4">
                        <h3 className={`text-sm font-black uppercase tracking-widest ${textBase}`}>Répartition</h3>
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${textMuted} mt-1`}>Statuts Commandes</p>
                    </div>
                    <div className="flex-1 flex items-center justify-center w-full">
                        <StatusArc counts={statusCounts} darkMode={darkMode} />
                    </div>
                </div>
            </div>

            {/* MODULE 3: TABLEAU COMMANDES & MODULE 4: SALLES DES VENTES */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* RECENT ORDERS TABLE (Style Celoci Top Products) */}
                <div className={`lg:col-span-2 p-8 rounded-[32px] ${baseCard}`}>
                    <div className="flex items-center justify-between mb-8">
                        <h3 className={`text-sm font-black uppercase tracking-widest ${textBase}`}>Dernières Ventes</h3>
                        <span className={`text-[9px] uppercase tracking-widest ${textMuted}`}>Top 5 Live</span>
                    </div>

                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className={`text-[9px] uppercase tracking-[0.2em] font-black ${textMuted}`}>
                                    <th className="pb-4 font-normal">Client</th>
                                    <th className="pb-4 font-normal">Date</th>
                                    <th className="pb-4 font-normal text-right">Statut</th>
                                    <th className="pb-4 font-normal text-right">Montant</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentOrders.length === 0 ? (
                                    <tr><td colSpan="4" className={`py-8 text-center text-xs italic ${textMuted}`}>Aucune transaction récente.</td></tr>
                                ) : (
                                    recentOrders.map(order => (
                                        <tr key={order.id} className={`group transition-colors ${darkMode ? 'hover:bg-white/[0.02]' : 'hover:bg-stone-50'}`}>
                                            <td className={`py-4 text-sm font-bold ${textBase}`}>
                                                {order.shipping?.fullName || 'Anonyme'}
                                            </td>
                                            <td className={`py-4 text-xs font-mono opacity-60 ${textBase}`}>
                                                {new Date(getMillis(order.createdAt)).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                                            </td>
                                            <td className="py-4 text-right">
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                                                    order.status === 'shipped' ? 'text-indigo-400 border-indigo-400/20' : 
                                                    (order.status === 'completed' || order.status === 'paid') ? 'text-emerald-500 border-emerald-500/20' : 
                                                    'text-amber-500 border-amber-500/20'
                                                }`}>
                                                    {order.status === 'shipped' ? 'Expédié' : (order.status === 'completed' || order.status === 'paid') ? 'Payé' : 'Attente'}
                                                </span>
                                            </td>
                                            <td className={`py-4 text-right font-black font-mono tracking-tight ${textBase}`}>
                                                {order.total} €
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* SALLE DES VENTES COMPACTE */}
                <div className={`p-8 rounded-[32px] ${baseCard} flex flex-col`}>
                    <div className="flex items-center justify-between mb-8">
                        <h3 className={`text-sm font-black uppercase tracking-widest ${textBase}`}>Salle des Ventes</h3>
                        <Gavel size={16} className={darkMode ? 'text-stone-600' : 'text-stone-300'} />
                    </div>

                    <div className="flex-1 flex flex-col gap-4">
                        {activeAuctions.length === 0 ? (
                            <div className={`p-6 rounded-2xl border border-dashed flex items-center justify-center flex-1 ${darkMode ? 'border-white/5 bg-white/[0.01]' : 'border-stone-200 bg-stone-50'}`}>
                                <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${textMuted}`}>Aucune offre active</p>
                            </div>
                        ) : (
                            activeAuctions.map(item => (
                                <div key={item.id} className={`flex items-center gap-4 p-3 rounded-2xl border ${darkMode ? 'border-white/5 bg-white/[0.02]' : 'border-stone-100 bg-white'}`}>
                                    <div className="w-10 h-10 rounded-xl bg-stone-800 overflow-hidden relative shrink-0">
                                        <img src={item.images?.[0] || item.imageUrl} className="w-full h-full object-cover" alt="" />
                                        <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-xl"></div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className={`text-xs font-black truncate ${textBase}`}>{item.name}</p>
                                        <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">{item.currentPrice || item.startingPrice} €</p>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-[10px] font-black px-2 py-1 rounded border ${darkMode ? 'border-white/10 text-white/50' : 'border-stone-200 text-stone-500'}`}>
                                            {item.bidCount} <span className="text-[8px] uppercase tracking-widest font-normal">bids</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <hr className={`my-4 border-t ${darkMode ? 'border-white/5' : 'border-stone-200'}`} />

            {/* MODULE 5: ADMIN CONTROLS (Dashed Red Zone style) */}
            {canUseDangerousAdminActions && (
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Diagnostic */}
                    <div className={`p-6 rounded-[24px] border border-solid w-full lg:w-1/3 flex flex-col justify-center ${darkMode ? 'bg-[#161616] border-white/5' : 'bg-white border-stone-200 shadow-sm'}`}>
                        <div className="flex items-center gap-2 mb-4">
                            <RefreshCw size={14} className={textMuted} />
                            <h3 className={`text-[10px] font-black uppercase tracking-[0.1em] ${textMuted}`}>Contrôles Système</h3>
                        </div>
                        <button onClick={async () => {
                            if (!window.confirm("Tester flux email ?")) return;
                            try {
                                const res = await httpsCallable(functions, 'sendTestEmail')();
                                alert(res.data.success ? "✅ Mail Flux OK" : "❌ Erreur Mail");
                            } catch (e) { alert(e.message); }
                        }} className={`group flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all duration-300 ${
                            darkMode 
                                ? 'bg-white/5 hover:bg-white border-white/5 hover:text-stone-900 text-white/70' 
                                : 'bg-stone-50 hover:bg-stone-900 border-stone-100 hover:text-white text-stone-600'
                        }`}>
                            <Mail size={16} className="group-hover:scale-110 transition-transform" /> 
                            Diagnostic Mail
                        </button>
                    </div>

                    {/* Danger Zone */}
                    <div className={`p-6 rounded-[24px] border border-dashed w-full lg:w-2/3 ${darkMode ? 'bg-[#161616] border-red-900/40 relative' : 'bg-red-50/30 border-red-200'}`}>
                        {darkMode && <div className="absolute inset-0 bg-red-500/[0.02] rounded-[24px] pointer-events-none"></div>}
                        <div className={`flex items-center gap-2 mb-4 relative z-10 ${darkMode ? 'text-red-500/80' : 'text-red-600'}`}>
                            <AlertTriangle size={14} />
                            <h3 className="text-[10px] font-black uppercase tracking-[0.1em]">Commandes Critiques</h3>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
                            <DangerButton onClick={handleResetOrdersClick} text="Reset Ventes" darkMode={darkMode} />
                            <DangerButton onClick={() => setIsCleaningModalOpen(true)} text="Clean Cloud" darkMode={darkMode} />
                            <DangerButton onClick={() => setIsPurgeAnonymousModalOpen(true)} text="Purge Anonymes" darkMode={darkMode} />
                            <DangerButton onClick={() => setIsResetUsersModalOpen(true)} text="Purge Clients" darkMode={darkMode} />
                        </div>
                    </div>
                </div>
            )}

            {/* MODALS UNCHANGED VISUALLY FOR NOW (can be adapted easily to completely dark if wanted) */}
            {canUseDangerousAdminActions && isOrderResetModalOpen && (
                <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md ${darkMode ? 'bg-black/80' : 'bg-stone-900/50'}`}>
                    <div className={`rounded-[32px] p-8 max-w-sm w-full shadow-2xl border text-center space-y-4 ${darkMode ? 'bg-[#161616] border-white/10' : 'bg-white border-stone-100'}`}>
                        <h3 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-stone-900'}`}>Purger Commandes ?</h3>
                        <p className={`text-xs ${textMuted}`}>Export CSV + Suppression définitive.</p>
                        <div className="flex gap-2">
                            <button onClick={confirmResetOrders} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-xs">Confirmer</button>
                            <button onClick={() => setIsOrderResetModalOpen(false)} className={`flex-1 py-3 rounded-xl font-bold text-xs ${darkMode ? 'bg-white/5 text-white/70' : 'bg-stone-200 text-stone-600'}`}>Annuler</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Same for other modals... */}
            {canUseDangerousAdminActions && isCleaningModalOpen && (
                <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md ${darkMode ? 'bg-black/80' : 'bg-stone-900/50'}`}>
                    <div className={`rounded-[32px] p-8 max-w-sm w-full shadow-2xl border text-center space-y-4 ${darkMode ? 'bg-[#161616] border-white/10' : 'bg-white border-stone-100'}`}>
                        <h3 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-stone-900'}`}>Nettoyage Système ?</h3>
                        <p className={`text-xs ${textMuted}`}>Supprime les images orphelines du stockage.</p>
                        <div className="flex gap-2">
                            <button onClick={confirmCleaning} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-xs">Lancer</button>
                            <button onClick={() => setIsCleaningModalOpen(false)} className={`flex-1 py-3 rounded-xl font-bold text-xs ${darkMode ? 'bg-white/5 text-white/70' : 'bg-stone-200 text-stone-600'}`}>Annuler</button>
                        </div>
                    </div>
                </div>
            )}
            {canUseDangerousAdminActions && isResetUsersModalOpen && (
                <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md ${darkMode ? 'bg-black/80' : 'bg-stone-900/50'}`}>
                    <div className={`rounded-[32px] p-8 max-w-sm w-full shadow-2xl border text-center space-y-4 ${darkMode ? 'bg-[#161616] border-red-500/30' : 'bg-white border-stone-100'}`}>
                        <h3 className={`text-lg font-black text-red-500`}>Purge Totale ?</h3>
                        <p className={`text-[11px] ${textMuted}`}>
                            Suppression de TOUS les comptes utilisateurs. Seuls les Super Admins seront épargnés.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={confirmResetUsers} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-xs">Confirmer</button>
                            <button onClick={() => setIsResetUsersModalOpen(false)} className={`flex-1 py-3 rounded-xl font-bold text-xs ${darkMode ? 'bg-white/5 text-white/70' : 'bg-stone-200 text-stone-600'}`}>Annuler</button>
                        </div>
                    </div>
                </div>
            )}
            {canUseDangerousAdminActions && isPurgeAnonymousModalOpen && (
                <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md ${darkMode ? 'bg-black/80' : 'bg-stone-900/50'}`}>
                    <div className={`rounded-[32px] p-8 max-w-sm w-full shadow-2xl border text-center space-y-4 ${darkMode ? 'bg-[#161616] border-amber-500/30' : 'bg-white border-stone-100'}`}>
                        <h3 className={`text-lg font-black text-amber-500`}>Purge Anonymes ?</h3>
                        <p className={`text-[11px] ${textMuted}`}>
                            Supprime uniquement les comptes anonymes. Les vrais clients sont conservés.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={confirmPurgeAnonymous} disabled={purgingAnonymous} className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold text-xs flex justify-center items-center">
                                {purgingAnonymous ? <RefreshCw size={14} className="animate-spin" /> : 'Confirmer'}
                            </button>
                            <button onClick={() => setIsPurgeAnonymousModalOpen(false)} disabled={purgingAnonymous} className={`flex-1 py-3 rounded-xl font-bold text-xs ${darkMode ? 'bg-white/5 text-white/70' : 'bg-stone-200 text-stone-600'}`}>Annuler</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const DangerButton = ({ onClick, text, darkMode }) => (
    <button 
        onClick={onClick} 
        className={`group relative py-3.5 px-4 rounded-2xl text-[9px] font-black uppercase tracking-widest border-2 transition-all duration-300 shadow-lg shadow-transparent hover:shadow-red-500/10 ${
            darkMode 
                ? 'border-red-900/20 hover:border-red-500/40 text-red-500/60 hover:text-red-400 bg-red-500/[0.03] hover:bg-red-500/10' 
                : 'border-red-100 hover:border-red-500/30 text-red-600 bg-red-50/50 hover:bg-red-500 hover:text-white'
        }`}
    >
        <span className="relative z-10 flex items-center justify-center gap-2">
            <AlertTriangle size={12} className="group-hover:scale-110 transition-transform" />
            {text}
        </span>
    </button>
);

export default AdminDashboard;
