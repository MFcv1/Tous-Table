import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { Package, Truck, XCircle, MessageCircle, ArrowLeft, CheckCircle, Download, CreditCard, Copy, Check, Loader2, Star, AlertTriangle } from 'lucide-react';
import SEO from '../components/shared/SEO';
import { generateInvoice } from '../utils/generateInvoice';
import { buildWhatsAppUrl, getWhatsAppPhoneFromContactInfo, normalizeWhatsAppPhone } from '../utils/whatsapp';

const formatPrice = (price) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(price);
};

const MyOrdersView = ({ user, onBack, darkMode, contactInfo }) => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(null);
    const [downloadingInvoice, setDownloadingInvoice] = useState(null);
    const [showCancelSuccess, setShowCancelSuccess] = useState(false);
    const [showContactPopup, setShowContactPopup] = useState(false);
    const [orderToCancelId, setOrderToCancelId] = useState(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const whatsappPhone = getWhatsAppPhoneFromContactInfo(contactInfo);
    const whatsappUrl = buildWhatsAppUrl(
        whatsappPhone,
        'Bonjour, je vous contacte depuis le site Tous a Table au sujet de ma commande.'
    );
    const whatsappTelHref = `tel:+${normalizeWhatsAppPhone(whatsappPhone)}`;

    const handleDownloadInvoice = async (order) => {
        setDownloadingInvoice(order.id);
        try {
            await generateInvoice(order);
        } catch (error) {
            console.error("Erreur génération facture:", error);
            alert("Une erreur est survenue lors de la génération de la facture.");
        } finally {
            setDownloadingInvoice(null);
        }
    };

    const handleCopy = (text, type) => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
    };

    useEffect(() => {
        if (!user) return;

        // Fetch user orders
        // Note: On enlève orderBy pour éviter l'erreur d'index manquant (requires composite index)
        // On triera côté client (JS), c'est performant pour < 100 commandes
        const q = query(
            collection(db, 'orders'),
            where('userEmail', '==', user.email)
        );

        const unsub = onSnapshot(q, (snap) => {
            const fetchedOrders = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(o => o.status !== 'cancelled_by_client' && o.status !== 'cancelled');

            // Tri décroissant (Plus récent en premier)
            fetchedOrders.sort((a, b) => {
                const dateA = a.createdAt?.seconds || 0;
                const dateB = b.createdAt?.seconds || 0;
                return dateB - dateA;
            });
            setOrders(fetchedOrders);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching orders:", err);
            setLoading(false);
        });

        return () => unsub();
    }, [user]);

    const handleConfirmCancel = async () => {
        const orderId = orderToCancelId;

        try {
            setIsCancelling(true);
            const cancelOrderClient = httpsCallable(functions, 'cancelOrderClient');
            await cancelOrderClient({ orderId: orderId });

            setShowCancelSuccess(true);
            setOrderToCancelId(null);
        } catch (e) {
            console.error("Erreur annulation:", e);
            alert("Une erreur est survenue lors de l'annulation. " + (e.message || ""));
            setOrderToCancelId(null);
        } finally {
            setIsCancelling(false);
            setLoading(false);
        }
    };

    const getStatusInfo = (status) => {
        switch (status) {
            case 'completed': // Livré
                return { label: 'Livré', color: 'text-emerald-500', bg: 'bg-emerald-500', icon: <CheckCircle size={16} /> };
            case 'shipped':
                return { label: 'Expédié / En livraison', color: 'text-blue-500', bg: 'bg-blue-500', icon: <Truck size={16} /> };
            case 'cancelled_by_client':
            case 'cancelled':
                return { label: 'Annulée', color: 'text-red-500', bg: 'bg-red-500', icon: <XCircle size={16} /> };
            default: // pending_payment, paid, pending
                return { label: 'En cours de préparation', color: 'text-amber-500', bg: 'bg-amber-500', icon: <Package size={16} /> };
        }
    };

    const canCancel = (order) => {
        if (order.status === 'shipped' || order.status === 'completed' || order.status.includes('cancelled')) return false;
        // Check 7 days
        const orderDate = new Date(order.createdAt?.seconds * 1000);
        const diffDays = (new Date() - orderDate) / (1000 * 60 * 60 * 24);
        return diffDays <= 7;
    };

    if (loading) return (
        <>
        <SEO
            title="Mes commandes"
            description="Espace client prive Tous a Table."
            url="/mes-commandes"
            robots="noindex,nofollow,noarchive"
        />
        <div className={`min-h-screen flex items-center justify-center bg-transparent`}>
            <div className="w-10 h-10 border-[3px] border-stone-200 border-t-stone-900 rounded-full animate-spin"></div>
        </div>
        </>
    );

    return (
        <div className={`min-h-screen animate-in fade-in transition-colors duration-700 bg-transparent`}>
            <SEO
                title="Mes commandes"
                description="Espace client prive Tous a Table."
                url="/mes-commandes"
                robots="noindex,nofollow,noarchive"
            />
            <div className="max-w-6xl mx-auto px-6 pt-10 pb-20 md:py-32 space-y-12">

                {/* HEAD */}
                <div className="flex items-center gap-6">
                    <button onClick={onBack} className={`p-3 rounded-full ring-1 ring-inset transition-all ${darkMode ? 'ring-stone-700 hover:bg-stone-800' : 'ring-stone-200 hover:bg-stone-100'}`}>
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-4xl font-black tracking-tighter">Mes Commandes</h1>
                </div>

                {/* LIST */}
                <div className="space-y-6">
                    {orders.length === 0 ? (
                        <div className={`p-12 rounded-3xl ring-1 ring-inset border-dashed text-center space-y-4 ${darkMode ? 'ring-stone-800' : 'ring-stone-200'}`}>
                            <Package size={48} className="mx-auto text-stone-300" />
                            <p className="text-stone-400 font-medium">Vous n'avez pas encore passé de commande.</p>
                        </div>
                    ) : orders.map(order => {
                        const status = getStatusInfo(order.status);
                        return (
                            <div key={order.id} className={`p-5 sm:p-6 md:p-10 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm ring-1 ring-inset transition-all hover:shadow-md transform-gpu ${darkMode ? 'bg-stone-800 ring-stone-700' : 'bg-white ring-stone-100'}`}>

                                {/* HEADER COMMANDE */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 mb-6 md:mb-10 border-b pb-5 md:pb-8 border-stone-100 dark:border-stone-700/50">
                                    <div className="space-y-1">
                                        <p className="text-xs font-black uppercase tracking-widest opacity-40">Commande #{order.id.slice(0, 8)}</p>
                                        <p className="text-sm font-bold opacity-60">
                                            Passée le {new Date(order.createdAt?.seconds * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </p>
                                    </div>
                                    <div className={`flex items-center gap-3 px-6 py-2.5 rounded-full ring-1 ring-inset ${darkMode ? 'bg-stone-900 ring-stone-700' : 'bg-stone-50 ring-stone-200'}`}>
                                        <div className={`w-2.5 h-2.5 rounded-full ${status.bg}`}></div>
                                        <span className={`text-xs font-black uppercase tracking-widest ${status.color}`}>{status.label}</span>
                                    </div>
                                </div>

                                {/* CONTENT */}
                                <div className="grid md:grid-cols-12 gap-4 md:gap-12">
                                    {/* ITEMS */}
                                    <div className="md:col-span-7 space-y-8">
                                        {order.items?.map((item, i) => {
                                            const imgUrl = Array.isArray(item.image) ? item.image[0] : (Array.isArray(item.images) ? item.images[0] : (item.image || item.imageUrl));
                                            return (
                                                <div key={i} className="flex gap-4 sm:gap-8 items-center sm:items-start">
                                                    <div className="w-20 h-20 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-2xl sm:rounded-3xl bg-stone-100 dark:bg-stone-800 overflow-hidden flex-shrink-0 border border-stone-100 dark:border-stone-700 shadow-sm flex items-center justify-center">
                                                        {imgUrl ? (
                                                            <img src={imgUrl} alt={item.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                                                        ) : (
                                                            <Package size={32} className="text-stone-300 dark:text-stone-600" />
                                                        )}
                                                    </div>
                                                    <div className="pt-1 sm:pt-2 flex-1 min-w-0">
                                                        <p className="font-black text-lg sm:text-2xl tracking-tight leading-tight line-clamp-2">{item.name}</p>
                                                        <p className="text-base sm:text-lg font-medium opacity-50 mt-1">{item.quantity || 1} × {formatPrice(item.price)}</p>
                                                        {item.collection && <span className="px-2 sm:px-3 py-1 rounded-md sm:rounded-lg bg-stone-100 dark:bg-stone-700 text-[8px] sm:text-[9px] font-black uppercase tracking-widest opacity-60 mt-2 sm:mt-4 inline-block truncate max-w-full">{item.collection}</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* ACTIONS GRID */}
                                        <div className="pt-6 sm:pt-8 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 max-w-md">
                                            
                                            {/* BOUTON MOBILE POUR VOIR LE RIB */}
                                            {(order.status === 'pending_payment' || order.status === 'pending') && (
                                                <button
                                                    onClick={() => {
                                                        const el = document.getElementById(`iban-box-${order.id}`);
                                                        if (el) {
                                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                            // Effet visuel temporaire pour attirer l'oeil
                                                            const originalClasses = el.className;
                                                            el.className = originalClasses + (darkMode ? ' ring-4 ring-amber-500 shadow-xl shadow-amber-500/20' : ' ring-4 ring-amber-400 shadow-xl shadow-amber-500/40');
                                                            setTimeout(() => {
                                                                el.className = originalClasses;
                                                            }, 1500);
                                                        }
                                                    }}
                                                    className="sm:col-span-2 md:hidden flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-4 bg-amber-500 text-white rounded-xl sm:rounded-2xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/30 active:scale-[0.98] transform-gpu will-change-transform group animate-pulse"
                                                >
                                                    <CreditCard size={14} className="sm:w-4 sm:h-4 group-hover:scale-110 transition-transform" />
                                                    Voir le RIB pour le virement ↓
                                                </button>
                                            )}

                                            <button
                                                onClick={() => setShowContactPopup(true)}
                                                className="sm:col-span-2 flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-4 bg-stone-900 text-white dark:bg-white dark:text-stone-900 rounded-xl sm:rounded-2xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest hover:bg-stone-800 dark:hover:bg-white/90 transition-all shadow-md active:scale-[0.98] transform-gpu will-change-transform group"
                                            >
                                                <MessageCircle size={14} className="sm:w-4 sm:h-4 group-hover:scale-110 transition-transform" />
                                                Contacter le vendeur
                                            </button>

                                            <div
                                                onClick={() => !downloadingInvoice && handleDownloadInvoice(order)}
                                                className={`relative group p-[1.5px] rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer transition-all w-full ${downloadingInvoice ? 'opacity-50 cursor-wait' : 'active:scale-[0.98]'}`}
                                            >
                                                {/* NEON BORDER */}
                                                <motion.div
                                                    initial={{ opacity: 0, rotate: 0 }}
                                                    animate={{ opacity: 1, rotate: -360 }}
                                                    transition={{ 
                                                        opacity: { duration: 0.3, delay: 0.1 }, 
                                                        rotate: { repeat: Infinity, duration: 6, ease: "linear" } 
                                                    }}
                                                    className="absolute top-1/2 left-1/2 w-[300%] aspect-square -translate-x-1/2 -translate-y-1/2 z-0"
                                                    style={{
                                                        background: darkMode 
                                                            ? "conic-gradient(from 0deg, transparent 30%, rgba(255,255,255,0) 35%, rgba(255,255,255,1) 50%, rgba(255,255,255,0) 65%, transparent 70%)"
                                                            : "conic-gradient(from 0deg, transparent 30%, rgba(0,0,0,0) 35%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 65%, transparent 70%)",
                                                    }}
                                                />

                                                {/* INNER CONTENT */}
                                                <div className={`relative z-10 w-full h-full p-3 sm:p-4 rounded-[11px] sm:rounded-[15px] flex items-center justify-center gap-2 transition-all backdrop-blur-md ${darkMode ? 'bg-stone-900 group-hover:bg-stone-800' : 'bg-white group-hover:bg-stone-50'}`}>
                                                    {downloadingInvoice === order.id ? (
                                                        <><Loader2 size={12} className="sm:w-3.5 sm:h-3.5 animate-spin text-stone-900 dark:text-white" /> <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-stone-900 dark:text-white">Création...</span></>
                                                    ) : (
                                                        <><Download size={12} className="sm:w-3.5 sm:h-3.5 text-stone-900 dark:text-white" /> <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-stone-900 dark:text-white">Télécharger la facture</span></>
                                                    )}
                                                </div>
                                            </div>

                                            {canCancel(order) && (
                                                <button
                                                    onClick={() => setOrderToCancelId(order.id)}
                                                    className="flex items-center justify-center py-3 sm:py-4 ring-1 ring-inset ring-stone-200 dark:ring-stone-700 rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 active:scale-[0.98] transform-gpu will-change-transform transition-all opacity-60 hover:opacity-100"
                                                >
                                                    Annuler la commande
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* ACTIONS / INFO */}
                                    <div className="md:col-span-5 flex flex-col justify-between md:border-l pt-1 mt-0 md:pt-0 md:mt-0 pl-0 md:pl-12 border-stone-100 dark:border-stone-700/50">
                                        <div className="space-y-2 mb-6 md:mb-8">
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Total de la commande</p>
                                            <p className="text-4xl sm:text-5xl font-serif italic tracking-tighter shrink-0 whitespace-nowrap">{formatPrice(order.total)}</p>
                                        </div>

                                        <div className="space-y-4">
                                            {(order.status === 'pending_payment' || order.status === 'pending') && (
                                                <div id={`iban-box-${order.id}`} className={`transition-all duration-700 p-5 sm:p-6 rounded-[2rem] sm:rounded-[2.5rem] border-2 border-dashed ${darkMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'} space-y-6 shadow-sm`}>
                                                    <div className="flex items-start gap-4">
                                                        <div className="h-11 w-11 min-h-11 min-w-11 sm:h-12 sm:w-12 sm:min-h-12 sm:min-w-12 aspect-square flex-none rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-200/50">
                                                            <CreditCard size={20} className="sm:w-[22px] sm:h-[22px]" strokeWidth={2.4} />
                                                        </div>
                                                        <div className="min-w-0 flex-1 pt-0.5">
                                                            <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.16em] leading-tight text-amber-600 break-words">IBAN vendeur et virement</p>
                                                            <p className="mt-2 text-[11px] sm:text-xs font-semibold leading-relaxed text-amber-700/80">Copiez les coordonnées bancaires du vendeur pour effectuer votre virement.</p>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4">
                                                        <div
                                                            onClick={() => handleCopy("FR76 3002 7160 8000 0506 2940 303", 'iban')}
                                                            className="group/iban cursor-pointer hover:opacity-80 transition-all relative"
                                                        >
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-40">IBAN vendeur</p>
                                                                {copied === 'iban' ? (
                                                                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter flex items-center gap-1 animate-in fade-in zoom-in duration-300">
                                                                        <Check size={10} /> Copié
                                                                    </span>
                                                                ) : (
                                                                    <Copy size={12} className="opacity-30 group-hover/iban:opacity-60 transition-opacity" />
                                                                )}
                                                            </div>
                                                            <p className="text-[12px] sm:text-[14px] font-mono font-bold tracking-tight leading-relaxed break-all text-stone-900 dark:text-white">FR76 3002 7160 8000 0506 2940 303</p>
                                                        </div>

                                                        <div
                                                            onClick={() => handleCopy("CMCIFRPP", 'bic')}
                                                            className="group/bic cursor-pointer hover:opacity-80 transition-all relative"
                                                        >
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Code BIC</p>
                                                                {copied === 'bic' ? (
                                                                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter flex items-center gap-1 animate-in fade-in zoom-in duration-300">
                                                                        <Check size={10} /> Copié
                                                                    </span>
                                                                ) : (
                                                                    <Copy size={12} className="opacity-30 group-hover/bic:opacity-60 transition-opacity" />
                                                                )}
                                                            </div>
                                                            <p className="text-[14px] font-mono font-bold text-stone-900 dark:text-white">CMCIFRPP</p>
                                                        </div>

                                                        <div className="border-t border-stone-200/60 dark:border-stone-700/50 pt-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1.5">Titulaire du compte</p>
                                                                <p className="text-[11px] font-bold leading-snug uppercase tracking-tight break-words">M O. PEGOIX / MME E. PEGOIX</p>
                                                            </div>
                                                            <div className="text-left xl:text-right min-w-0">
                                                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1.5">WERO / MOBILE</p>
                                                                <p className="text-sm font-black whitespace-nowrap tracking-tighter">07 77 32 41 78</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {order.status === 'shipped' && (
                                                <div className={`p-5 sm:p-6 md:p-8 rounded-[2rem] sm:rounded-[2.5rem] border-2 border-dashed ${darkMode ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-indigo-50/50 border-indigo-200'} space-y-6 shadow-sm`}>
                                                    <div className="flex items-start gap-4">
                                                        <div className="h-12 w-12 shrink-0 rounded-2xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-200/50">
                                                            <Truck size={22} strokeWidth={2.4} />
                                                        </div>
                                                        <div className="min-w-0 flex-1 pt-1">
                                                            <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.16em] leading-tight text-indigo-600 break-words">En cours de livraison</p>
                                                            <p className={`mt-2 text-[11px] sm:text-xs font-semibold leading-relaxed ${darkMode ? 'text-indigo-200/80' : 'text-indigo-700/70'}`}>Votre email d'expédition a été envoyé avec les informations transporteur.</p>
                                                        </div>
                                                    </div>

                                                    <div className={`p-4 rounded-xl ${darkMode ? 'bg-stone-900/40' : 'bg-white'} ring-1 ring-inset ${darkMode ? 'ring-stone-700' : 'ring-indigo-100'} shadow-sm`}>
                                                        <p className={`text-sm font-medium ${darkMode ? 'text-stone-300' : 'text-stone-600'} leading-relaxed`}>
                                                            Votre commande a quitté notre atelier. Livraison estimée sous <strong className={darkMode ? 'text-white font-black' : 'text-stone-900 font-black'}>7 à 14 jours</strong>.
                                                        </p>
                                                    </div>
                                                    <div className="pt-2">
                                                        <p className={`text-[11px] font-bold flex items-center gap-2 ${darkMode ? 'text-indigo-400' : 'text-indigo-600/80'}`}>
                                                            <span className="text-sm">💡</span> Vous avez reçu un email de confirmation d'expédition.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {order.status === 'completed' && (
                                                <div className={`p-6 md:p-8 rounded-[2.5rem] border-2 border-dashed ${darkMode ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50/50 border-emerald-200'} space-y-6 shadow-sm`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200/50">
                                                            <CheckCircle size={20} />
                                                        </div>
                                                        <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Commande Livrée</p>
                                                    </div>

                                                    <div className={`p-4 rounded-xl ${darkMode ? 'bg-stone-900/40' : 'bg-white'} ring-1 ring-inset ${darkMode ? 'ring-stone-700' : 'ring-emerald-100'} shadow-sm`}>
                                                        <p className={`text-sm font-medium ${darkMode ? 'text-stone-300' : 'text-stone-600'} leading-relaxed`}>
                                                            Nous espérons que cette pièce sublimera votre intérieur. N'hésitez pas à nous laisser un avis ou à nous identifier sur <strong className={darkMode ? 'text-white font-black' : 'text-stone-900 font-black'}>Instagram</strong> !
                                                        </p>
                                                    </div>
                                                    <div className="pt-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-t border-dashed border-emerald-500/20">
                                                        <p className={`text-[11px] font-bold flex items-center gap-2 ${darkMode ? 'text-emerald-400' : 'text-emerald-600/80'}`}>
                                                            <span className="text-sm">👋</span> À très vite ! - L'équipe Tous à Table
                                                        </p>
                                                        <a
                                                            href="https://g.page/r/CepCisGcSHS2EAE/review"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:-translate-y-0.5 active:translate-y-0 ${darkMode ? 'bg-emerald-500 text-stone-900 shadow-emerald-500/20 hover:bg-emerald-400' : 'bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-500'}`}
                                                        >
                                                            <Star size={14} className={darkMode ? 'fill-stone-900' : 'fill-white'} />
                                                            Laisser un avis
                                                        </a>
                                                    </div>
                                                </div>
                                            )}


                                        </div>
                                    </div>
                                </div>

                            </div>
                        );
                    })}
                </div>

                {/* MODAL ANNULATION RÉUSSIE */}
                {showCancelSuccess && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-stone-900/60 backdrop-blur-md animate-in fade-in duration-300">
                        <div className={`max-w-md w-full p-6 md:p-10 rounded-3xl md:rounded-[3rem] shadow-2xl text-center space-y-8 ${darkMode ? 'bg-stone-800' : 'bg-white'}`}>
                            <div className="w-16 h-16 md:w-20 md:h-20 bg-emerald-500 rounded-2xl md:rounded-3xl flex items-center justify-center text-white mx-auto shadow-lg shadow-emerald-500/20">
                                <CheckCircle size={32} className="md:w-10 md:h-10" />
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-2xl md:text-3xl font-black tracking-tighter">Annulation confirmée</h3>
                                <p className="text-sm md:text-base text-stone-500 leading-relaxed">
                                    Votre demande a bien été traitée. Les articles ont été remis en vente et la commande a été retirée de votre historique.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowCancelSuccess(false)}
                                className="w-full py-3.5 md:py-4 bg-stone-900 text-white dark:bg-white dark:text-stone-900 rounded-xl md:rounded-2xl text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all"
                            >
                                J'ai compris
                            </button>
                        </div>
                    </div>
                )}

                {/* MODAL CONFIRMATION ANNULATION */}
                {orderToCancelId && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-stone-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setOrderToCancelId(null)}>
                        <div className={`max-w-md w-full p-6 md:p-10 rounded-3xl md:rounded-[2.5rem] shadow-2xl text-center space-y-6 md:space-y-6 ${darkMode ? 'bg-stone-800 ring-1 ring-white/10' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
                            <div className="w-16 h-16 md:w-20 md:h-20 bg-amber-100 dark:bg-amber-900/30 rounded-2xl md:rounded-3xl flex items-center justify-center text-amber-500 mx-auto shadow-lg">
                                <AlertTriangle size={32} className="md:w-10 md:h-10" />
                            </div>

                            <div className="space-y-3 md:space-y-4">
                                <h3 className="text-xl md:text-2xl font-black tracking-tighter">Confirmer l'annulation</h3>
                                <p className={`text-sm font-medium leading-relaxed ${darkMode ? 'text-stone-300' : 'text-stone-500'}`}>
                                    En confirmant, votre commande sera annulée et les articles seront <strong>remis en vente</strong> sur la boutique.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 md:gap-4 pt-2 md:pt-4">
                                <button
                                    onClick={() => setOrderToCancelId(null)}
                                    disabled={isCancelling}
                                    className={`w-full py-3.5 md:py-4 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.98] transform-gpu will-change-transform disabled:opacity-50 disabled:cursor-not-allowed ${darkMode ? 'bg-stone-700 hover:bg-stone-600 text-white' : 'bg-stone-100 hover:bg-stone-200 text-stone-900'}`}
                                >
                                    Retour
                                </button>
                                <button
                                    onClick={handleConfirmCancel}
                                    disabled={isCancelling}
                                    className="w-full py-3.5 md:py-4 flex items-center justify-center gap-2 bg-red-500 text-white rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 active:scale-[0.98] transform-gpu will-change-transform disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isCancelling ? (
                                        <><Loader2 size={14} className="animate-spin" /> Traitement</>
                                    ) : (
                                        "Confirmer"
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL CONTACT TEMP */}
                {showContactPopup && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-stone-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowContactPopup(false)}>
                        <div className={`max-w-md w-full p-6 md:p-10 rounded-3xl md:rounded-[2.5rem] shadow-2xl text-center space-y-6 md:space-y-8 relative overflow-hidden ${darkMode ? 'bg-stone-800 ring-1 ring-white/10' : 'bg-white'}`} onClick={e => e.stopPropagation()}>

                            {/* CLOSE BUTTON */}
                            <button onClick={() => setShowContactPopup(false)} className={`absolute top-4 right-4 md:top-6 md:right-6 p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-white/10 text-white/50 hover:text-white' : 'hover:bg-stone-100 text-stone-400 hover:text-stone-900'}`}>
                                <XCircle size={20} className="md:w-6 md:h-6" />
                            </button>

                            <div className="w-16 h-16 md:w-20 md:h-20 bg-emerald-500 rounded-2xl md:rounded-3xl flex items-center justify-center text-white mx-auto shadow-lg shadow-emerald-500/20 rotate-3 mt-2 md:mt-0">
                                <MessageCircle size={32} className="md:w-10 md:h-10" />
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-xl md:text-3xl font-black tracking-tighter">Contact Vendeur</h3>
                                <div className={`p-4 md:p-6 rounded-2xl ${darkMode ? 'bg-stone-900/50' : 'bg-stone-50'}`}>
                                    <p className={`text-xs md:text-sm font-medium leading-relaxed ${darkMode ? 'text-stone-300' : 'text-stone-600'}`}>
                                        Vous pouvez ecrire directement a l'atelier sur WhatsApp pour une question de commande, livraison ou suivi.
                                    </p>
                                    <div className="w-10 h-1 bg-stone-200 dark:bg-stone-700 mx-auto my-4 md:my-6 rounded-full"></div>
                                    <p className={`text-xs md:text-sm font-medium ${darkMode ? 'text-stone-300' : 'text-stone-600'}`}>
                                        Pour toute question sur votre commande, contactez <strong className={darkMode ? 'text-white' : 'text-stone-900'}>Olivier</strong> directement :
                                    </p>
                                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="mt-4 md:mt-6 flex items-center justify-center gap-2 px-4 py-3 md:py-4 bg-emerald-600 text-white rounded-xl font-black text-xs md:text-sm uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-lg shadow-emerald-900/20">
                                        <MessageCircle size={18} />
                                        Ouvrir WhatsApp
                                    </a>
                                    <a href={whatsappTelHref} className={`mt-3 block px-4 py-3 rounded-xl font-black text-base md:text-lg tracking-wider hover:scale-[1.02] transition-transform ${darkMode ? 'bg-white text-stone-900' : 'bg-stone-900 text-white'}`}>
                                        {whatsappPhone}
                                    </a>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowContactPopup(false)}
                                className={`w-full py-3.5 md:py-4 rounded-xl md:rounded-2xl text-[11px] font-black uppercase tracking-widest transition-colors ${darkMode ? 'bg-stone-700 hover:bg-stone-600 text-white' : 'bg-stone-100 hover:bg-stone-200 text-stone-900'}`}
                            >
                                Fermer
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyOrdersView;
