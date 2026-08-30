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

const RevenueChart = ({ data, darkMode }) => {
    const containerRef = useRef(null);
    const [dims, setDims] = useState({ w: 600, h: 180 });
    const [activeIdx, setActiveIdx] = useState(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            if (entry.contentRect.width > 0) {
                setDims({ w: entry.contentRect.width, h: 180 });
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const values = useMemo(() => data.map(d => d.value), [data]);
    const maxVal = Math.max(...values, 100);
    const margin = { top: 20, right: 10, bottom: 20, left: 10 };
    const chartW = dims.w - margin.left - margin.right;
    const chartH = dims.h - margin.top - margin.bottom;

    const points = useMemo(() => {
        if (data.length === 0) return '';
        const step = chartW / Math.max(1, data.length - 1);
        return data.map((d, i) => {
            const x = margin.left + i * step;
            const y = margin.top + chartH - ((d.value / maxVal) * chartH);
            return `${x},${y}`;
        }).join(' L ');
    }, [data, chartW, chartH, maxVal, margin]);

    const polygonPoints = useMemo(() => {
        if (!points) return '';
        const firstX = margin.left;
        const lastX = margin.left + chartW;
        const baseY = margin.top + chartH;
        return `M ${firstX},${baseY} L ${points} L ${lastX},${baseY} Z`;
    }, [points, chartW, chartH, margin]);

    const handlePointerMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left - margin.left;
        const step = chartW / Math.max(1, data.length - 1);
        let idx = Math.round(x / step);
        idx = Math.max(0, Math.min(data.length - 1, idx));
        setActiveIdx(idx);
    };

    return (
        <div ref={containerRef} className="w-full h-[180px] relative select-none group"
             onPointerMove={handlePointerMove}
             onPointerLeave={() => setActiveIdx(null)}>
            <svg width={dims.w} height={dims.h} className="block overflow-visible">
                <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                    </linearGradient>
                    <pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="4" height="4">
                        <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" 
                              style={{ stroke: darkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.05)', strokeWidth: 1 }} />
                    </pattern>
                </defs>
                
                <line x1={margin.left} y1={margin.top + chartH} x2={margin.left + chartW} y2={margin.top + chartH} 
                      stroke={darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} strokeWidth="1" />
                      
                <line x1={margin.left} y1={margin.top} x2={margin.left + chartW} y2={margin.top} 
                      stroke={darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'} strokeWidth="1" strokeDasharray="4 4" />
                
                {data.length > 0 && (
                    <>
                        <path d={`M ${points.split(' L ')[0]} L ${points}`} 
                              fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        
                        <path d={polygonPoints} fill="url(#areaGradient)" />
                        <path d={polygonPoints} fill="url(#diagonalHatch)" />

                        {activeIdx !== null && (
                            <g>
                                <line 
                                    x1={margin.left + activeIdx * (chartW / Math.max(1, data.length - 1))}
                                    y1={margin.top}
                                    x2={margin.left + activeIdx * (chartW / Math.max(1, data.length - 1))}
                                    y2={margin.top + chartH}
                                    stroke={darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}
                                    strokeDasharray="4 4"
                                />
                                <circle 
                                    cx={margin.left + activeIdx * (chartW / Math.max(1, data.length - 1))}
                                    cy={margin.top + chartH - ((data[activeIdx].value / maxVal) * chartH)}
                                    r="4"
                                    fill={darkMode ? '#0a0a0a' : '#ffffff'}
                                    stroke="#3B82F6"
                                    strokeWidth="2"
                                />
                            </g>
                        )}
                    </>
                )}
            </svg>
            
            {activeIdx !== null && data[activeIdx] && (
                <div 
                    className={`absolute top-0 transform -translate-x-1/2 -translate-y-[110%] pointer-events-none transition-all duration-75 px-3 py-1.5 rounded-lg border shadow-xl ${darkMode ? 'bg-[#1e1e1e] border-white/10 text-white' : 'bg-white border-stone-200 text-stone-900'}`}
                    style={{ left: margin.left + activeIdx * (chartW / Math.max(1, data.length - 1)) }}
                >
                    <p className="text-[9px] uppercase tracking-wider opacity-50 mb-0.5">{data[activeIdx].label}</p>
                    <p className="text-xs font-black">{data[activeIdx].value} €</p>
                </div>
            )}
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
        
        if (timeFilter === '7days' || timeFilter === '1month') {
            const count = timeFilter === '7days' ? 7 : 30;
            const dates = Array.from({length: count}, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (count - 1 - i));
                return { 
                    raw: d.toISOString().split('T')[0], 
                    label: timeFilter === '7days' 
                        ? d.toLocaleDateString('fr-FR', { weekday: 'short' }) 
                        : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'narrow' }) 
                };
            });

            const revMap = {};
            dates.forEach(d => revMap[d.raw] = 0);

            activeOrders.forEach(data => {
                const ts = getMillis(data.createdAt);
                if (ts) {
                    const dateStr = new Date(ts).toISOString().split('T')[0];
                    if (revMap[dateStr] !== undefined) {
                        revMap[dateStr] += (data.total || 0);
                    }
                }
            });

            return dates.map(d => ({ label: d.label, value: revMap[d.raw] }));
        } else {
            // 1 Year or All Time: Group by Month
            const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
            let monthsArray = [];
            
            if (timeFilter === '1year') {
                monthsArray = Array.from({length: 12}, (_, i) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - (11 - i));
                    return { 
                        raw: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 
                        label: monthNames[d.getMonth()] 
                    };
                });
            } else {
                // All Time: find oldest order
                const oldestTs = Math.min(...activeOrders.map(o => getMillis(o.createdAt) || Date.now()));
                const start = new Date(oldestTs);
                const end = new Date();
                let current = new Date(start.getFullYear(), start.getMonth(), 1);
                
                while (current <= end) {
                    monthsArray.push({
                        raw: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
                        label: `${monthNames[current.getMonth()]} ${String(current.getFullYear()).slice(-2)}`
                    });
                    current.setMonth(current.setMonth() + 1);
                }
                // Cap to reasonable amount for display if too long
                if (monthsArray.length > 24) monthsArray = monthsArray.slice(-24);
            }

            const revMap = {};
            monthsArray.forEach(m => revMap[m.raw] = 0);

            activeOrders.forEach(data => {
                const ts = getMillis(data.createdAt);
                if (ts) {
                    const d = new Date(ts);
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    if (revMap[key] !== undefined) {
                        revMap[key] += (data.total || 0);
                    }
                }
            });

            return monthsArray.map(m => ({ label: m.label, value: revMap[m.raw] }));
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* CA */}
                <div className={`p-8 rounded-[32px] ${baseCard}`}>
                    <p className={`text-[10px] uppercase font-black tracking-[0.2em] mb-4 ${textMuted}`}>Chiffre d'Affaires</p>
                    <h2 className={`text-4xl lg:text-5xl font-black tracking-tighter mb-2 ${textBase}`}>
                        {stats.totalRevenue.toLocaleString('fr-FR')} <span className="text-2xl text-stone-500">€</span>
                    </h2>
                    <p className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                        <TrendingUp size={14} /> Panier moyen : {stats.averageOrderValue} €
                    </p>
                </div>

                {/* COMMANDES */}
                <div className={`p-8 rounded-[32px] ${baseCard}`}>
                    <p className={`text-[10px] uppercase font-black tracking-[0.2em] mb-4 ${textMuted}`}>Commandes</p>
                    <h2 className={`text-4xl lg:text-5xl font-black tracking-tighter mb-2 ${textBase}`}>
                        {stats.totalOrders}
                    </h2>
                    <p className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                        <ShoppingBag size={14} /> Global cumulé
                    </p>
                </div>

                {/* CLIENTS */}
                <div className={`p-8 rounded-[32px] ${baseCard} relative`}>
                    <p className={`text-[10px] uppercase font-black tracking-[0.2em] mb-4 ${textMuted}`}>Clients Inscrits</p>
                    <h2 className={`text-4xl lg:text-5xl font-black tracking-tighter mb-2 ${textBase}`}>
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
                    <div className="absolute top-8 right-8 text-right">
                        <p className={`text-[8px] uppercase font-black tracking-widest ${textMuted}`}>Valeur Catalogue</p>
                        <p className={`text-xs font-black ${darkMode ? 'text-stone-300' : 'text-stone-600'}`}>{stats.totalStockValue} €</p>
                    </div>
                </div>
            </div>

            {/* MODULE 2: GRAPHICS (CA + STATUS) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className={`lg:col-span-2 p-8 rounded-[32px] ${baseCard}`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                        <div>
                            <h3 className={`text-sm font-black uppercase tracking-widest ${textBase}`}>Évolution du CA</h3>
                            <p className={`text-[10px] font-bold uppercase tracking-wider ${textMuted} mt-1`}>Sur {getFilterLabel()}</p>
                        </div>
                        
                        <div className={`flex gap-1 p-1 rounded-xl shrink-0 ${darkMode ? 'bg-white/5' : 'bg-stone-100'}`}>
                            {[
                                { id: '7days', label: '7j' },
                                { id: '1month', label: '1m' },
                                { id: '1year', label: '1a' },
                                { id: 'alltime', label: 'Max' }
                            ].map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setTimeFilter(f.id)}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all duration-300 ${
                                        timeFilter === f.id
                                            ? (darkMode ? 'bg-white text-stone-900 shadow-xl' : 'bg-white text-stone-900 shadow-md')
                                            : (darkMode ? 'text-white/40 hover:text-white' : 'text-stone-400 hover:text-stone-600')
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <RevenueChart data={chartData} darkMode={darkMode} />
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
                                            <td className={`py-4 text-right font-black tracking-tight ${textBase}`}>
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
