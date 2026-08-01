import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, limit } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { Package, Clock, CheckCircle, Mail, ChevronDown, ChevronUp, Download, Loader2, Truck, XCircle } from 'lucide-react';
import { exportRowsToCsv } from '../../utils/csvExport';

const AdminOrders = ({ darkMode = false }) => {
    const [orders, setOrders] = useState([]);
    const [expandedOrder, setExpandedOrder] = useState(null);
    const [orderLimit, setOrderLimit] = useState(10);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(orderLimit));

        const unsub = onSnapshot(q, (snap) => {
            console.log(`🔥 FIRESTORE READ: Chargement de ${snap.docs.length} commandes`);
            setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsLoading(false);
        });
        return () => unsub();
    }, [orderLimit]);

    const updateOrderStatus = async (order, newStatus) => {
        await updateDoc(doc(db, 'orders', order.id), { status: newStatus });
    };

    // Helper to get collection name (handles inconsistencies/legacy data)
    const getCollectionFromItem = (item) => {
        if (item.collection) return item.collection; // New Stripe Format
        if (item.collectionName) return item.collectionName; // Old Cart Format
        // Fallback guess based on usage? Or default to furniture. Safe to verify?
        // Most items have it.
        return 'furniture';
    };

    const handleCancelAndRestore = async (order) => {
        if (!window.confirm("⚠️ ATTENTION : \n\nVous allez ANNULER cette commande.\n\nACTIONS AUTOMATIQUES :\n1. Le stock des produits sera REMIS à jour (+1).\n2. Les produits seront marqués comme 'Non Vendu'.\n3. La commande sera SUPPRIMÉE définitivement (invisible client/admin).\n\nConfirmer ?")) return;

        try {
            setIsLoading(true);

            // 1. Restaurer le Stock pour chaque article
            if (order.items && order.items.length > 0) {
                // Import increment dynamically
                const { increment, updateDoc, getDoc } = await import('firebase/firestore');

                for (const item of order.items) {
                    // Determine ID and Collection
                    const itemId = item.originalId || item.id;
                    const col = getCollectionFromItem(item); // Need helper or simple check

                    if (!itemId) continue;

                    // Check both collections if unsure, but usually we have data
                    // Let's assume 'furniture' or 'cutting_boards'
                    const finalCol = col === 'cutting_boards' ? 'cutting_boards' : 'furniture';

                    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', finalCol, itemId);
                    const itemSnap = await getDoc(itemRef);

                    if (itemSnap.exists()) {
                        await updateDoc(itemRef, {
                            stock: finalCol === 'furniture' ? 1 : increment(item.quantity || 1),
                            sold: false, // Mark as available again
                            soldAt: null,
                            buyerId: null
                        });
                        console.log(`Restored stock for ${item.name}`);
                    }
                }
            }

            // 2. Supprimer la commande
            await deleteDoc(doc(db, 'orders', order.id));

            // UI Update handled by snapshot
            alert("Commande annulée et stocks restaurés avec succès !");

        } catch (error) {
            console.error("Error cancelling order:", error);
            alert("Erreur lors de l'annulation : " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const formatPrice = (price) => `${price} €`;
    const formatDate = (timestamp) => {
        if (!timestamp) return '-';
        return new Date(timestamp.seconds * 1000).toLocaleString('fr-FR');
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'shipped': return { color: 'text-indigo-500', bg: 'bg-indigo-500', bgLight: 'bg-indigo-50', bgDark: 'bg-indigo-900/40', label: 'Expédiée' };
            case 'completed': return { color: 'text-emerald-600', bg: 'bg-emerald-500', bgLight: 'bg-emerald-50', bgDark: 'bg-emerald-900/40', label: 'Terminée' };
            case 'cancelled':
            case 'cancelled_by_client': return { color: 'text-red-600', bg: 'bg-red-500', bgLight: 'bg-red-50', bgDark: 'bg-red-900/40', label: 'Annulée' };
            default: return { color: 'text-amber-600', bg: 'bg-amber-500', bgLight: 'bg-amber-50', bgDark: 'bg-amber-900/40', label: 'En attente' };
        }
    };

    const exportToCsv = () => {
        const data = orders.map(order => ({
            'ID Commande': order.id,
            'Date': order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('fr-FR') : 'N/A',
            'Heure': order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleTimeString('fr-FR') : 'N/A',
            'Client': order.shipping?.fullName || 'N/A',
            'Email': order.shipping?.email || 'N/A',
            'Téléphone': order.shipping?.phone || 'N/A',
            'Adresse': `${order.shipping?.address || ''}, ${order.shipping?.zip || order.shipping?.postalCode || ''} ${order.shipping?.city || ''}`,
            'Méthode Paiement': order.paymentMethod === 'deferred' ? 'Différé' : 'Carte (Stripe)',
            'Statut': order.status,
            'Total (€)': order.total,
            'Articles': order.items?.map(i => `${i.quantity || 1}x ${i.name}`).join(', ') || ''
        }));

        exportRowsToCsv(data, `Commandes_Atelier_Normand_${new Date().toISOString().split('T')[0]}.csv`);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <h2 className={`text-2xl font-black tracking-tighter ${darkMode ? 'text-white' : 'text-stone-900'}`}>Commandes ({orders.length})</h2>
                    <button
                        onClick={exportToCsv}
                        className={`group flex items-center gap-2.5 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 border-2 shadow-xl ${
                            darkMode 
                                ? 'bg-white/5 border-white/5 text-white/70 hover:bg-white hover:text-stone-900 shadow-black/20' 
                                : 'bg-stone-50 border-stone-100 text-stone-500 hover:bg-stone-900 hover:text-white shadow-stone-200/40'
                        }`}
                    >
                        <Download size={15} className="group-hover:-translate-y-0.5 transition-transform" /> 
                        Export CSV
                    </button>
                </div>
                <div className="flex gap-2 text-xs font-bold uppercase tracking-widest text-stone-400">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div> En cours</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Expédiées</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Terminées</span>
                </div>
            </div>

            <div className={`grid gap-4 pr-2 overflow-y-auto scrollbar-thin ${darkMode ? 'scrollbar-thumb-stone-700 scrollbar-track-stone-900/20' : 'scrollbar-thumb-stone-200 scrollbar-track-stone-50'} max-h-[750px] custom-scrollbar`}>
                {orders.map(order => {
                    const badge = getStatusBadge(order.status);

                    return (
                        <div key={order.id} className={`ring-1 rounded-3xl shadow-sm overflow-hidden hover:shadow-md transition-shadow will-change-transform ${darkMode ? 'bg-stone-800 ring-stone-700/50' : 'bg-white ring-stone-100'}`}>
                            {/* Header de la commande */}
                            <div
                                onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                                className="p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white ${badge.bg}`}>
                                        {order.status === 'shipped' ? <Truck size={18} /> : (order.status === 'completed' ? <CheckCircle size={18} /> : (order.status?.includes('cancelled') ? <XCircle size={18} /> : <Clock size={18} />))}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className={`font-bold truncate text-sm md:text-base ${darkMode ? 'text-white' : 'text-stone-900'}`}>{order.shipping?.fullName || 'Client Inconnu'}</h3>
                                        <p className="text-[10px] md:text-xs text-stone-400 font-medium uppercase tracking-widest leading-relaxed">
                                            {formatDate(order.createdAt)} <span className="hidden sm:inline">•</span> <br className="sm:hidden" /> {formatPrice(order.total)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-none pt-4 sm:pt-0">
                                    <span className={`px-3 py-1 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest ${darkMode ? badge.bgDark + ' ' + badge.color : badge.bgLight + ' ' + badge.color}`}>
                                        {badge.label}
                                    </span>
                                    {expandedOrder === order.id ? <ChevronUp size={16} className="text-stone-300" /> : <ChevronDown size={16} className="text-stone-300" />}
                                </div>
                            </div>

                            {/* Détails déroulants */}
                            {expandedOrder === order.id && (
                                <div className={`px-6 pb-6 pt-0 border-t ${darkMode ? 'border-stone-700 bg-stone-900/20' : 'border-stone-50 bg-stone-50/50'}`}>
                                    <div className="grid md:grid-cols-2 gap-6 mt-6">

                                        {/* Panier */}
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-stone-400 flex items-center gap-2"><Package size={12} /> Contenu du panier</h4>
                                            <div className={`p-4 rounded-2xl ring-1 ring-inset space-y-2 ${darkMode ? 'bg-stone-900/40 ring-stone-700' : 'bg-white ring-stone-100'}`}>
                                                {order.items?.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between items-center text-sm">
                                                        <span className={`font-medium ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>{item.name}</span>
                                                        <span className={`font-bold ${darkMode ? 'text-white' : 'text-stone-900'}`}>{formatPrice(item.price)}</span>
                                                    </div>
                                                ))}
                                                <div className={`border-t pt-2 mt-2 flex justify-between font-black ${darkMode ? 'border-stone-700 text-white' : 'border-stone-100 text-stone-900'}`}>
                                                    <span>Total</span>
                                                    <span>{formatPrice(order.total)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Info Client & Actions */}
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-stone-400 flex items-center gap-2"><Mail size={12} /> Contact & Livraison</h4>
                                            <div className={`p-4 rounded-2xl ring-1 ring-inset text-sm space-y-1 ${darkMode ? 'bg-stone-900/40 ring-stone-700 text-stone-400' : 'bg-white ring-stone-100 text-stone-600'}`}>
                                                <p><strong className={darkMode ? 'text-stone-200' : 'text-stone-900'}>Compte:</strong> {order.userEmail}</p>
                                                <p><strong className={darkMode ? 'text-stone-200' : 'text-stone-900'}>Livraison:</strong> {order.shipping?.email}</p>
                                                <p><strong className={darkMode ? 'text-stone-200' : 'text-stone-900'}>Tél:</strong> {order.shipping?.phone}</p>
                                                <p><strong className={darkMode ? 'text-stone-200' : 'text-stone-900'}>Adresse:</strong> {order.shipping?.address}, {order.shipping?.zip} {order.shipping?.city}</p>
                                                <p><strong className={darkMode ? 'text-stone-200' : 'text-stone-900'}>Paiement:</strong> {order.paymentMethod === 'deferred' ? 'Différé (Virement/Chèque)' : 'Stripe'}</p>
                                                <p className="text-[10px] opacity-50 mt-2 font-mono">UID: {order.userId}</p>
                                            <div className="flex flex-col gap-3 pt-6">
                                                <div className="flex flex-col xl:flex-row gap-3">
                                                    {/* Status Actions */}
                                                    {(order.status === 'pending_payment' || order.status === 'pending' || order.status === 'paid' || !order.status) ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); updateOrderStatus(order, 'shipped'); }}
                                                            className={`group flex-1 py-4 xl:py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all duration-300 shadow-xl flex items-center justify-center gap-2 ${
                                                                darkMode 
                                                                    ? 'bg-white text-stone-900 hover:bg-stone-200' 
                                                                    : 'bg-stone-900 text-white hover:bg-black'
                                                            }`}
                                                        >
                                                            <Truck size={16} className="group-hover:translate-x-1 transition-transform" />
                                                            Expédiée
                                                        </button>
                                                    ) : order.status === 'shipped' ? (
                                                        <div className={`flex-1 py-4 xl:py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2 flex items-center justify-center gap-2 ${
                                                            darkMode 
                                                                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' 
                                                                : 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                                        }`}>
                                                            <Truck size={16} />
                                                            En cours de livraison
                                                        </div>
                                                    ) : order.status === 'completed' ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); updateOrderStatus(order, 'pending_payment'); }}
                                                            className={`group flex-1 py-4 xl:py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all duration-300 border-2 flex items-center justify-center gap-2 ${
                                                                darkMode 
                                                                    ? 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white' 
                                                                    : 'bg-stone-100 border-stone-200 text-stone-500 hover:bg-stone-200 hover:text-stone-900'
                                                            }`}
                                                        >
                                                            <Clock size={16} />
                                                            Réouvrir
                                                        </button>
                                                    ) : null}
                                                </div>

                                                {/* Smart Cancel Button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCancelAndRestore(order);
                                                    }}
                                                    className={`group w-full py-4 xl:py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all duration-300 border-2 flex items-center justify-center gap-2 ${
                                                        darkMode 
                                                            ? 'bg-red-500/5 border-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' 
                                                            : 'bg-red-50 border-red-100 text-red-600 hover:bg-red-600 hover:text-white'
                                                    }`}
                                                    title="Annuler : Remet le stock et supprime la commande"
                                                >
                                                    <XCircle size={16} className="group-hover:rotate-90 transition-transform" />
                                                    Annuler & Restaurer
                                                </button>
                                            </div>                                     </div>
                                        </div>

                                    </div>
                                </div>
                            )}

                        </div>
                    );
                })}

                {orders.length === 0 && !isLoading && (
                    <div className={`text-center py-20 rounded-3xl border border-dashed ${darkMode ? 'bg-stone-800/50 border-stone-700' : 'bg-white border-stone-100'}`}>
                        <p className="text-stone-400 font-medium">Aucune commande pour le moment.</p>
                    </div>
                )}

                {/* Load More Button */}
                {orders.length >= orderLimit && (
                    <button
                        onClick={() => setOrderLimit(prev => prev + 50)}
                        className={`group w-full py-6 rounded-3xl border-2 border-dashed transition-all duration-300 flex items-center justify-center gap-3 ${
                            darkMode 
                                ? 'border-white/5 text-white/30 hover:border-white/20 hover:text-white hover:bg-white/5 shadow-2xl shadow-black/20' 
                                : 'border-stone-100 text-stone-400 hover:border-stone-300 hover:text-stone-900 hover:bg-stone-50'
                        }`}
                    >
                        {isLoading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <>
                                <ChevronDown size={18} className="group-hover:translate-y-1 transition-transform" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Charger les commandes antérieures</span>
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};

export default AdminOrders;
