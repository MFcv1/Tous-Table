import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    collection,
    doc,
    FieldPath,
    limit,
    onSnapshot,
    query,
    serverTimestamp,
    Timestamp,
    updateDoc,
    where,
} from 'firebase/firestore';
import { ArrowRight, Package, X } from 'lucide-react';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { getMillis } from '../../utils/time';
import { getOrderReference } from '../../utils/orderReference';

const REMINDER_STATUSES = ['paid', 'pending_payment', 'pending'];
const REMINDER_QUERY_LIMIT = 50;
const REMINDER_DELAY_MS = 2 * 24 * 60 * 60 * 1000;

const formatOrderDate = (timestamp) => {
    const millis = getMillis(timestamp);
    if (!millis) return 'date inconnue';
    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(millis));
};

const getOrderTitle = (order) => {
    const itemNames = (order.items || []).map((item) => item?.name).filter(Boolean);
    if (itemNames.length > 0) return itemNames.join(', ');
    return `Commande #${getOrderReference(order.id)}`;
};

const getAdminSnoozeDueAt = (order, adminUid) => (
    getMillis(order.shippingReminderSnoozes?.[adminUid]?.dueAt)
);

const AdminShippingReminder = ({ darkMode = false, onOpenOrders }) => {
    const { user } = useAuth();
    const [orders, setOrders] = useState([]);
    const [dismissedKey, setDismissedKey] = useState('');
    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [isSnoozing, setIsSnoozing] = useState(false);
    const [isMarkingShipped, setIsMarkingShipped] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user?.uid) return undefined;
        const q = query(
            collection(db, 'orders'),
            where('status', 'in', REMINDER_STATUSES),
            limit(REMINDER_QUERY_LIMIT)
        );
        const unsub = onSnapshot(q, (snap) => {
            const fetchedOrders = snap.docs
                .map((orderDoc) => ({ id: orderDoc.id, ...orderDoc.data() }))
                .sort((a, b) => getMillis(a.createdAt) - getMillis(b.createdAt));
            setOrders(fetchedOrders);
            setError('');
        }, (snapshotError) => {
            console.error('Shipping reminder orders load error:', snapshotError);
            setError('Impossible de vérifier les commandes à expédier.');
        });
        return () => unsub();
    }, [user?.uid]);

    const dueOrders = useMemo(() => {
        if (!user?.uid) return [];
        const now = Date.now();
        return orders.filter((order) => {
            const dueAt = getAdminSnoozeDueAt(order, user.uid);
            return !dueAt || dueAt <= now;
        });
    }, [orders, user?.uid]);

    const dueKey = useMemo(() => dueOrders.map((o) => o.id).join('|'), [dueOrders]);
    const isOpen = dueOrders.length > 0 && dueKey !== dismissedKey;

    // Commande active : la commande sélectionnée par l'utilisateur ou par défaut la première de la liste
    const activeOrder = useMemo(() => {
        if (selectedOrderId) {
            const found = dueOrders.find((o) => o.id === selectedOrderId);
            if (found) return found;
        }
        return dueOrders[0] || null;
    }, [dueOrders, selectedOrderId]);

    // Empêcher le scroll de la page arrière-plan quand le modal est ouvert
    useEffect(() => {
        if (!isOpen || typeof document === 'undefined') return undefined;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [isOpen]);

    const handleSnooze = useCallback(async () => {
        if (!user?.uid || dueOrders.length === 0) return;
        setIsSnoozing(true);
        setError('');
        const dueAt = Timestamp.fromMillis(Date.now() + REMINDER_DELAY_MS);
        try {
            await Promise.all(dueOrders.map((order) => updateDoc(
                doc(db, 'orders', order.id),
                new FieldPath('shippingReminderSnoozes', user.uid),
                { dueAt, snoozedAt: serverTimestamp() }
            )));
            setDismissedKey(dueKey);
        } catch (snoozeError) {
            console.error('Shipping reminder snooze error:', snoozeError);
            setError("Le rappel n'a pas pu être enregistré.");
        } finally {
            setIsSnoozing(false);
        }
    }, [dueKey, dueOrders, user?.uid]);

    const handleMarkActiveAsShipped = useCallback(async () => {
        if (!activeOrder) return;
        setIsMarkingShipped(true);
        setError('');
        try {
            await updateDoc(doc(db, 'orders', activeOrder.id), { status: 'shipped' });
            // On ne ferme pas le modal : Firestore retire la commande expédiée de dueOrders,
            // et la commande suivante passe automatiquement en bleu et devient active !
            // Si c'était la dernière commande à expédier, dueOrders devient vide et le modal se ferme de lui-même.
            setSelectedOrderId(null);
        } catch (markError) {
            console.error('Shipping reminder mark shipped error:', markError);
            setError("Impossible de marquer comme expédiée. Réessayez dans l'onglet Commandes.");
        } finally {
            setIsMarkingShipped(false);
        }
    }, [activeOrder]);

    if (!user?.uid || typeof document === 'undefined') return null;

    /* Palette Apple OS */
    const dk = darkMode;
    const card = dk ? 'bg-[#1c1c1e]/95 border border-white/[0.08]' : 'bg-white/95 border border-black/[0.06]';
    const textPrimary = dk ? 'text-white' : 'text-[#1d1d1f]';
    const textSub = dk ? 'text-white/40' : 'text-black/35';
    const divider = dk ? 'bg-white/[0.08]' : 'bg-black/[0.06]';
    const rowBg = dk ? 'bg-white/[0.05] border border-white/[0.06]' : 'bg-[#f5f5f7] border border-black/[0.04]';
    const rowHL = dk ? 'bg-[#0071e3]/[0.15] border border-[#0071e3]/30 text-white' : 'bg-[#0071e3]/[0.08] border border-[#0071e3]/20';
    const badgeCls = dk ? 'bg-[#0071e3]/20 text-[#60aeff]' : 'bg-[#0071e3]/10 text-[#0071e3]';
    const closeCls = dk ? 'text-white/25 hover:text-white/60 hover:bg-white/[0.08]' : 'text-black/25 hover:text-black/60 hover:bg-black/[0.05]';
    const primaryBtn = 'bg-[#0071e3] hover:bg-[#0077ed] active:bg-[#006cd6] text-white';
    const secondaryBtn = dk ? 'bg-white/[0.08] hover:bg-white/[0.12] text-white border border-white/10' : 'bg-black/[0.05] hover:bg-black/[0.08] text-[#1d1d1f] border border-black/[0.06]';
    const ghostBtn = dk ? 'text-white/35 hover:text-white/60' : 'text-black/30 hover:text-black/55';
    const errCls = dk ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-500';
    const pillCls = 'bg-[#1c1c1e] border border-white/[0.1] text-white shadow-2xl shadow-black/50';

    const content = (
        <>
            {dueOrders.length > 0 && !isOpen && (
                <button
                    type="button"
                    onClick={() => setDismissedKey('')}
                    className={`fixed bottom-6 right-6 z-[9990] flex items-center gap-2 rounded-full px-4 py-2.5 text-[11px] font-medium transition-all duration-200 hover:scale-[1.04] active:scale-[0.97] ${pillCls}`}
                    title="Commandes à expédier"
                >
                    <Package size={13} strokeWidth={2} />
                    <span>{dueOrders.length} à expédier</span>
                </button>
            )}

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        onClick={(e) => {
                            if (e.target === e.currentTarget) {
                                setDismissedKey(dueKey);
                            }
                        }}
                        className={`fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-6 w-full h-full min-h-[100dvh] overflow-hidden ${dk ? 'bg-black/80' : 'bg-black/40'} backdrop-blur-xl`}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 28 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
                            className={`relative w-full sm:max-w-[400px] rounded-t-[28px] sm:rounded-[24px] overflow-hidden shadow-[0_28px_72px_rgba(0,0,0,0.35)] ${card}`}
                        >
                            <div className="flex items-center justify-between px-5 pt-5 pb-4">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[11px] font-semibold ${badgeCls}`}>
                                    <Package size={11} strokeWidth={2.2} />
                                    {dueOrders.length === 1 ? '1 commande' : `${dueOrders.length} commandes`}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setDismissedKey(dueKey)}
                                    className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150 ${closeCls}`}
                                    aria-label="Fermer"
                                >
                                    <X size={14} strokeWidth={2} />
                                </button>
                            </div>

                            <div className="px-5 pb-4">
                                <h2 className={`text-[20px] font-semibold tracking-tight ${textPrimary}`}>
                                    À expédier
                                </h2>
                                <p className={`mt-0.5 text-[13px] leading-snug ${textSub}`}>
                                    {dueOrders.length === 1
                                        ? 'Cette commande attend votre traitement.'
                                        : `${dueOrders.length} commandes attendent votre traitement.`}
                                </p>
                            </div>

                            <div className={`h-px mx-5 ${divider}`} />

                            <div className="px-5 py-4 space-y-2 max-h-[200px] overflow-y-auto">
                                {dueOrders.slice(0, 6).map((order) => {
                                    const isSelected = order.id === activeOrder?.id;
                                    return (
                                        <button
                                            key={order.id}
                                            type="button"
                                            onClick={() => setSelectedOrderId(order.id)}
                                            className={`w-full text-left flex items-center justify-between gap-3 rounded-[13px] px-3.5 py-2.5 transition-all duration-150 cursor-pointer ${
                                                isSelected ? rowHL : `${rowBg} hover:opacity-90`
                                            }`}
                                        >
                                            <span className={`text-[13px] font-medium truncate min-w-0 ${isSelected ? (dk ? 'text-white font-semibold' : 'text-[#0071e3] font-semibold') : textPrimary}`}>
                                                {getOrderTitle(order)}
                                            </span>
                                            <span className={`text-[11px] shrink-0 tabular-nums ${isSelected ? (dk ? 'text-white/60' : 'text-[#0071e3]/70') : textSub}`}>
                                                {formatOrderDate(order.createdAt)}
                                            </span>
                                        </button>
                                    );
                                })}
                                {dueOrders.length > 6 && (
                                    <p className={`text-center text-[11px] py-0.5 ${textSub}`}>
                                        +{dueOrders.length - 6} autre{dueOrders.length - 6 > 1 ? 's' : ''}
                                    </p>
                                )}
                            </div>

                            {error && (
                                <div className={`mx-5 mb-3 rounded-[12px] px-4 py-2.5 text-[12px] font-medium ${errCls}`}>
                                    {error}
                                </div>
                            )}

                            <div className={`h-px mx-5 ${divider}`} />

                            <div className="px-5 py-4 space-y-2">
                                <button
                                    type="button"
                                    onClick={handleMarkActiveAsShipped}
                                    disabled={!activeOrder || isMarkingShipped || isSnoozing}
                                    className={`w-full flex items-center justify-center rounded-[13px] px-5 py-3 text-[14px] font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${primaryBtn}`}
                                >
                                    {isMarkingShipped ? 'Validation...' : 'Marquer comme expédiée'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onOpenOrders?.();
                                        setDismissedKey(dueKey);
                                    }}
                                    className={`w-full flex items-center justify-center gap-1.5 rounded-[13px] px-5 py-3 text-[14px] font-semibold transition-all duration-150 ${secondaryBtn}`}
                                >
                                    Ouvrir les commandes
                                    <ArrowRight size={14} strokeWidth={2} />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSnooze}
                                    disabled={isSnoozing}
                                    className={`w-full py-2.5 text-[13px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${ghostBtn}`}
                                >
                                    {isSnoozing ? 'Enregistrement...' : 'Rappeler dans 2 jours'}
                                </button>
                            </div>

                            <div className="sm:hidden" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );

    return createPortal(content, document.body);
};

export default AdminShippingReminder;
