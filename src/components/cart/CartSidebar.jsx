import { useEffect, useState } from 'react';
import { X, Trash2, ShoppingBag, ArrowRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { lockPageScroll } from '../../utils/smoothScroll';
import { useAuth } from '../../contexts/AuthContext';
import AuthPanel from '../auth/AuthPanel';

const CartSidebar = ({ isOpen, onClose, cartItems, onRemoveItem, totalPrice, onCheckout, interacted, darkMode, activeDesignId }) => {
    // We only want transitions AFTER the first interaction to avoid the "closing on mount" bug
    const transitionEnabled = interacted || isOpen;
    const baseTransition = transitionEnabled ? 'duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]' : 'duration-0';

    const { user } = useAuth();
    const [isAuthMode, setIsAuthMode] = useState(false);

    // ARCHITECTURAL THEME LOGIC
    const isArch = activeDesignId === 'architectural';
    const bgClass = isAuthMode 
        ? 'bg-[#0b0d0f] border-l border-stone-800 text-stone-100' // Force dark for AuthPanel
        : isArch
            ? (darkMode ? 'bg-[#0A0A0A] border-l border-stone-800 text-stone-200' : 'bg-[#FAFAF9] border-l border-stone-200 text-stone-900')
            : (darkMode ? 'bg-[#0A0A0A] border-l border-stone-800 text-white' : 'bg-[#FAFAF9] text-stone-900');

    useEffect(() => {
        if (!isOpen) {
            // Reset auth mode when closed (with slight delay for animation)
            setTimeout(() => setIsAuthMode(false), 500);
        }
        return lockPageScroll();
    }, [isOpen]);

    const handleCheckoutClick = () => {
        if (!user || user.isAnonymous) {
            setIsAuthMode(true);
        } else {
            onCheckout();
        }
    };

    return (
        <div className={`fixed inset-0 z-[2500] ${isOpen ? 'visible' : 'invisible delay-700'}`}>
            {/* Backdrop */}
            <div
                className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0'} ${darkMode ? 'bg-stone-900/60 backdrop-blur-md' : 'bg-stone-900/40 backdrop-blur-md'}`}
                onClick={onClose}
            ></div>

            {/* Sidebar Panel */}
            <div
                className={`absolute right-0 top-0 bottom-0 w-full md:w-[500px] shadow-2xl transition-all ${baseTransition} transform-gpu 
                pt-[max(1.5rem,calc(env(safe-area-inset-top,0px)+0.5rem))] px-6 pb-6 md:p-8 md:pt-6
                flex flex-col safe-area-bottom ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'} ${bgClass}`}
            >

                {/* Header */}
                <div className={`flex justify-between items-center mb-10 border-b pb-6 ${isAuthMode || darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                    <div className="flex items-center gap-3">
                        <ShoppingBag size={24} className={isAuthMode ? 'text-stone-200' : (isArch ? (darkMode ? 'text-stone-200' : 'text-stone-900') : (darkMode ? 'text-white' : 'text-stone-900'))} />
                        <h2 className={`text-2xl font-black tracking-tight ${isArch ? 'font-serif italic font-normal tracking-wide' : ''} ${isAuthMode ? 'text-white' : ''}`}>
                            {isAuthMode ? 'Identifiez-vous' : (isArch ? 'Votre Sélection' : 'Votre Panier')}
                        </h2>
                    </div>
                    
                    <div className="relative w-12 h-12 flex items-center justify-center">
                        <motion.button 
                            onClick={(e) => {
                                if (isAuthMode) {
                                    setIsAuthMode(false);
                                } else {
                                    const btn = e.currentTarget;
                                    btn.style.transition = 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)';
                                    btn.style.transform = 'rotate(45deg)'; 
                                    
                                    setTimeout(() => {
                                        onClose();
                                    }, 400);
                                }
                            }} 
                            initial={{ rotate: 0, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            transition={{ 
                                rotate: { type: "spring", stiffness: 450, damping: 25 },
                                opacity: { duration: 0.3 }
                            }}
                            className={`flex items-center justify-center will-change-transform ${isAuthMode || darkMode ? 'text-stone-400 hover:text-white' : 'text-stone-400 hover:text-stone-900'}`}
                        >
                            {isAuthMode ? <ArrowLeft size={26} strokeWidth={1} /> : <X size={26} strokeWidth={1} />}
                        </motion.button>
                    </div>
                </div>

                {isAuthMode ? (
                    <div className="flex-1 overflow-y-auto ios-modal-scroll -mx-6 md:-mx-8 px-6 md:px-8">
                        <AuthPanel 
                            onSuccess={() => {
                                setIsAuthMode(false);
                                onCheckout(); // Proceed to checkout automatically after login
                            }}
                            darkMode={darkMode}
                            // Don't show close button in AuthPanel since we have back button in Sidebar header
                        />
                    </div>
                ) : (
                    <>
                        {/* Cart Items List */}
                        <div data-scroll-region className="flex-1 overflow-y-auto ios-modal-scroll space-y-6 pr-2 scrollbar-thin scrollbar-thumb-stone-200">
                            {cartItems.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-stone-400 gap-4 opacity-60">
                            <ShoppingBag size={48} strokeWidth={1} />
                            <p className="font-serif italic text-lg">{isArch ? 'Aucune pièce sélectionnée.' : 'Votre panier est vide.'}</p>
                        </div>
                    ) : (
                        cartItems.map((item) => (
                            <div key={item.id} className={`flex gap-4 p-4 rounded-2xl border shadow-sm relative group animate-in slide-in-from-right-8 duration-500 
                                ${isArch
                                    ? 'rounded-none border-stone-200 dark:border-stone-800 bg-transparent' // Arch styling
                                    : (darkMode ? 'bg-stone-800/50 border-stone-700' : 'bg-white border-stone-100') // Standard styling
                                }`}>
                                <img
                                    src={item.image}
                                    alt={item.name}
                                    className={`w-20 h-20 object-cover bg-stone-100 ${isArch ? 'rounded-none' : 'rounded-xl'}`}
                                />
                                <div className="flex-1 min-w-0 pr-10 flex flex-col justify-center">
                                    <h3 className={`font-bold leading-tight line-clamp-2 break-title ${darkMode ? 'text-white' : 'text-stone-900'} ${isArch ? 'font-serif text-lg tracking-wide' : ''}`}>{item.name}</h3>
                                    <p className={`text-xs uppercase tracking-wider mt-1 truncate ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>{item.material}</p>
                                    <p className="text-sm font-black text-amber-600 mt-2">{item.price} €</p>
                                </div>
                                <button
                                    onClick={() => onRemoveItem(item.id)}
                                    className={`absolute top-4 right-4 shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${darkMode ? 'bg-stone-900/50 text-stone-500 hover:bg-red-500/20 hover:text-red-400' : 'bg-stone-50 text-stone-400 hover:bg-red-50 hover:text-red-500'}`}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer / Checkout */}
                {cartItems.length > 0 && (
                    <div className={`pt-8 mt-4 pb-6 md:pb-8 border-t space-y-6 ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                        <div className="flex justify-between items-end">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>Total Estimé</span>
                            <span className={`text-4xl font-black tracking-tighter ${darkMode ? 'text-white' : 'text-stone-900'} ${isArch ? 'font-serif' : ''}`}>{totalPrice} €</span>
                        </div>
                        <button
                            onClick={handleCheckoutClick}
                            className={`w-full py-5 font-black uppercase text-xs tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl group 
                                ${isArch
                                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-black rounded-none hover:bg-stone-700 dark:hover:bg-stone-300'
                                    : (darkMode ? 'bg-white text-stone-900 rounded-xl hover:bg-amber-500 hover:text-white' : 'bg-stone-900 text-white rounded-xl hover:bg-amber-600')
                                }`}
                        >
                            {isArch ? 'Valider mon panier' : 'Commander'} <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                        <p className="text-[9px] text-center text-stone-400 uppercase tracking-widest">Paiement sécurisé & Livraison soignée</p>
                    </div>
                )}
                </>
                )}

            </div>
        </div>
    );
};

export default CartSidebar;
