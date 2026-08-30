import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { AlertTriangle, Bell, CalendarClock, Package, Truck, X } from 'lucide-react';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { getMillis } from '../../utils/time';
import { getOrderReference } from '../../utils/generateInvoice';

const REMINDER_STATUSES = ['paid', 'pending_payment', 'pending'];
const REMINDER_QUERY_LIMIT = 50;
const REMINDER_DELAY_MS = 2 * 24 * 60 * 60 * 1000;

const formatOrderDate = (timestamp) => {
    const millis = getMillis(timestamp);
    if (!millis) return 'date inconnue';

    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(millis));
};

const getOrderTitle = (order) => {
    const itemNames = (order.items || [])
        .map((item) => item?.name)
        .filter(Boolean);

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
            setError("Impossible de verifier les commandes a expedier.");
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

    const dueKey = useMemo(() => dueOrders.map((order) => order.id).join('|'), [dueOrders]);
    const isOpen = dueOrders.length > 0 && dueKey !== dismissedKey;
    const primaryOrder = dueOrders[0];

    const handleSnooze = useCallback(async () => {
        if (!user?.uid || dueOrders.length === 0) return;

        setIsSnoozing(true);
        setError('');

        const dueAt = Timestamp.fromMillis(Date.now() + REMINDER_DELAY_MS);
        try {
            await Promise.all(dueOrders.map((order) => updateDoc(
                doc(db, 'orders', order.id),
                new FieldPath('shippingReminderSnoozes', user.uid),
                {
                    dueAt,
                    snoozedAt: serverTimestamp(),
                }
            )));
            setDismissedKey(dueKey);
        } catch (snoozeError) {
            console.error('Shipping reminder snooze error:', snoozeError);
            setError("Le rappel n'a pas pu etre enregistre. Reessayez dans un instant.");
        } finally {
            setIsSnoozing(false);
        }
    }, [dueKey, dueOrders, user?.uid]);

    const handleMarkPrimaryAsShipped = useCallback(async () => {
        if (!primaryOrder) return;

        setIsMarkingShipped(true);
        setError('');

        try {
            await updateDoc(doc(db, 'orders', primaryOrder.id), { status: 'shipped' });
            setDismissedKey(dueKey);
        } catch (markError) {
            console.error('Shipping reminder mark shipped error:', markError);
            setError("La commande n'a pas pu etre marquee comme expediee. Ouvrez l'onglet Commandes et reessayez.");
        } finally {
            setIsMarkingShipped(false);
        }
    }, [dueKey, primaryOrder]);

    if (!user?.uid) return null;

    return (
        <>
            {dueOrders.length > 0 && (
                <button
                    type="button"
                    onClick={() => setDismissedKey('')}
                    className={`fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-full border px-4 py-3 text-[10px] font-black uppercase tracking-widest shadow-2xl transition-all hover:scale-[1.02] ${
                        darkMode
                            ? 'border-amber-400/20 bg-amber-500 text-stone-950 shadow-black/40'
                            : 'border-amber-200 bg-amber-500 text-white shadow-amber-900/20'
                    }`}
                    title="Rappel expedition"
                >
                    <Bell size={15} />
                    <span>{dueOrders.length}</span>
                </button>
            )}

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 md:p-6 bg-stone-950/60 backdrop-blur-md">
                        <motion.div
                            initial={{ opacity: 0, y: 18, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.98 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className={`relative w-full max-w-2xl overflow-hidden rounded-[2rem] border p-6 shadow-2xl md:p-8 ${
                                darkMode
                                    ? 'border-white/10 bg-stone-900 text-white shadow-black/50'
                                    : 'border-stone-200 bg-white text-stone-950 shadow-stone-900/20'
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => setDismissedKey(dueKey)}
                                className={`absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                                    darkMode
                                        ? 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                                        : 'bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-900'
                                }`}
                                aria-label="Fermer le rappel"
                            >
                                <X size={18} />
                            </button>

                            <div className="space-y-6 pr-2">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                                        <AlertTriangle size={28} />
                                    </div>
                                    <div className="min-w-0 space-y-2">
                                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-500">
                                            Rappel expedition
                                        </p>
                                        <h3 className="text-2xl font-black tracking-tighter md:text-4xl">
                                            {dueOrders.length > 1
                                                ? `${dueOrders.length} commandes a verifier`
                                                : 'Commande a verifier'}
                                        </h3>
                                    </div>
                                </div>

                                {primaryOrder && (
                                    <div className={`rounded-2xl border p-4 ${
                                        darkMode ? 'border-white/10 bg-white/5' : 'border-amber-100 bg-amber-50/70'
                                    }`}>
                                        <div className="flex items-start gap-3">
                                            <Package size={18} className="mt-0.5 shrink-0 text-amber-500" />
                                            <div className="min-w-0">
                                                <p className="font-black leading-snug">
                                                    Avez-vous expedie {getOrderTitle(primaryOrder)} ?
                                                </p>
                                                <p className={`mt-2 flex items-center gap-2 text-xs font-bold ${
                                                    darkMode ? 'text-stone-300' : 'text-stone-600'
                                                }`}>
                                                    <CalendarClock size={14} />
                                                    Commande du {formatOrderDate(primaryOrder.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {dueOrders.length > 1 && (
                                    <div className={`max-h-40 space-y-2 overflow-y-auto rounded-2xl border p-3 ${
                                        darkMode ? 'border-white/10 bg-stone-950/30' : 'border-stone-100 bg-stone-50'
                                    }`}>
                                        {dueOrders.slice(0, 5).map((order) => (
                                            <div key={order.id} className="flex items-center justify-between gap-3 text-xs">
                                                <span className="min-w-0 truncate font-bold">{getOrderTitle(order)}</span>
                                                <span className="shrink-0 text-stone-400">{formatOrderDate(order.createdAt)}</span>
                                            </div>
                                        ))}
                                        {dueOrders.length > 5 && (
                                            <p className="pt-1 text-[10px] font-black uppercase tracking-widest text-stone-400">
                                                + {dueOrders.length - 5} autre(s) commande(s)
                                            </p>
                                        )}
                                    </div>
                                )}

                                <p className={`text-sm font-medium leading-relaxed ${
                                    darkMode ? 'text-stone-300' : 'text-stone-600'
                                }`}>
                                    Tant qu'une commande reste non expediee, ce rappel revient pour chaque admin.
                                    Le bouton Expediee dans l'onglet Commandes declenche l'email client avec les informations transporteur et le lien d'avis.
                                </p>

                                {error && (
                                    <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-bold text-red-500">
                                        {error}
                                    </p>
                                )}

                                <div className="grid gap-3 lg:grid-cols-3">
                                    <button
                                        type="button"
                                        onClick={handleMarkPrimaryAsShipped}
                                        disabled={!primaryOrder || isMarkingShipped || isSnoozing}
                                        className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-[10px] font-black uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                                            darkMode
                                                ? 'bg-emerald-400 text-stone-950 hover:bg-emerald-300'
                                                : 'bg-emerald-600 text-white hover:bg-emerald-500'
                                        }`}
                                    >
                                        <Truck size={16} />
                                        {isMarkingShipped ? 'Validation...' : 'Marquer expediee'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onOpenOrders?.();
                                            setDismissedKey(dueKey);
                                        }}
                                        className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                                            darkMode
                                                ? 'bg-white text-stone-950 hover:bg-stone-200'
                                                : 'bg-stone-950 text-white hover:bg-stone-800'
                                        }`}
                                    >
                                        <Truck size={16} />
                                        Ouvrir commandes
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSnooze}
                                        disabled={isSnoozing}
                                        className={`rounded-2xl border px-5 py-4 text-[10px] font-black uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                                            darkMode
                                                ? 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                                                : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                                        }`}
                                    >
                                        {isSnoozing ? 'Enregistrement...' : 'Me le rappeler dans 2 jours'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

export default AdminShippingReminder;
