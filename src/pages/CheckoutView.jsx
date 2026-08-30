import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CreditCard, Truck, AlertCircle, Landmark, Wallet, ReceiptText, CheckCircle2, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { functions, db, appId } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { Elements } from '@stripe/react-stripe-js';
import { stripePromise } from '../main';
import CheckoutPaymentStep from '../components/cart/CheckoutPaymentStep';
import SEO from '../components/shared/SEO';
import { useToast } from '../components/ui/Toast';
import { lockPageScroll, scrollToTarget } from '../utils/smoothScroll';
import { buildCheckoutCustomerPayload, formatCheckoutAddress, getCheckoutValidation } from '../utils/checkoutCustomerDetails';
import { getCartLineTotal, normalizeCartQuantity } from '../utils/cartState';
import EmailOtpFlow from '../components/auth/EmailOtpFlow';

/**
 * PremiumActionBtn — Bouton Ultra-Premium (Mouse Tracking + Morphing Loading)
 * Design inspiré par Apple / Linear. Zéro scale on hover, effets de lumière dynamiques.
 */
const PremiumActionBtn = ({ children, isLoading, disabled, onClick, darkMode }) => {
    const buttonRef = React.useRef(null);
    const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
    const [isHovered, setIsHovered] = React.useState(false);

    const handleMouseMove = (e) => {
        if (!buttonRef.current || disabled) return;
        const rect = buttonRef.current.getBoundingClientRect();
        setMousePosition({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    };

    // Couleurs globales partagées avec la carte de résumé (CheckoutView)
    const bgColor = darkMode ? 'bg-stone-900' : 'bg-white';
    const disabledBg = darkMode ? 'bg-stone-900/50' : 'bg-stone-100';

    return (
        <motion.button
            ref={buttonRef}
            layout
            onClick={onClick}
            disabled={disabled || isLoading}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            whileHover={{}} // ABSOLUMENT AUCUN SCALE AU HOVER (Premium Static Layout)
            whileTap={!disabled && !isLoading ? { scale: 0.985 } : {}}
            transition={{ layout: { type: "spring", stiffness: 450, damping: 35 } }}
            className={`relative overflow-hidden font-black uppercase text-sm tracking-widest flex items-center justify-center mx-auto transition-colors duration-700 outline-none w-full h-[64px] py-0 px-4 rounded-[1.25rem]
                ${isLoading ? 'cursor-wait' : 'cursor-pointer'}
                ${disabled 
                    ? `${disabledBg} ${darkMode ? 'text-stone-600 border border-stone-800/50' : 'text-stone-400 border border-stone-200'} opacity-60`
                    : `${bgColor} ${darkMode ? 'text-white' : 'text-stone-900'} shadow-[0_8px_30px_rgba(0,0,0,0.15)]`
                }
            `}
        >
            {/* 1. MAGNETIC SPOTLIGHT BORDER GLOW (Épaissi à 2px, Suit la souris) */}
            {!disabled && !isLoading && (
                <motion.div
                    className="absolute inset-0 pointer-events-none z-0 p-[2px] rounded-[1.25rem]"
                    animate={{ opacity: isHovered ? 1 : 0 }}
                    transition={{ duration: isHovered ? 0.3 : 0.6, ease: "easeOut" }}
                    style={{
                        background: `radial-gradient(160px circle at ${mousePosition.x}px ${mousePosition.y}px, ${darkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)'}, transparent 60%)`,
                    }}
                >
                    {/* Le masque interne opaque garantit que seule la bordure est éclairée */}
                    <div className={`w-full h-full rounded-[calc(1.25rem-2px)] ${bgColor}`} />
                </motion.div>
            )}

            {/* 2. INNER MAGNETIC GLOW (Reflet interne délicat suivant la souris) */}
            {!disabled && !isLoading && (
                <motion.div
                    className="absolute inset-0 pointer-events-none z-10 rounded-[1.25rem]"
                    animate={{ opacity: isHovered ? 1 : 0 }}
                    transition={{ duration: isHovered ? 0.3 : 0.6, ease: "easeOut" }}
                    style={{
                        background: `radial-gradient(100px circle at ${mousePosition.x}px ${mousePosition.y}px, ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}, transparent 50%)`,
                    }}
                />
            )}

            {/* 3. NEON BORDER LOADING TRANSITION (Faisceau lumineux balayant le grand rectangle) */}
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        key="neon-spinner"
                        className="absolute inset-0 pointer-events-none z-0 p-[2px] rounded-[1.25rem] overflow-hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }} // Fade in très fluide
                    >
                        {/* Le conteneur à -300% assure que le centre du dégradé (la source lumineuse) est très loin pour lécher les bords horizontaux */}
                        <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
                            className="absolute top-1/2 left-1/2 w-[300%] aspect-square -translate-x-1/2 -translate-y-1/2 z-0"
                            style={{
                                background: darkMode 
                                    ? "conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0) 25%, rgba(255,255,255,1) 50%, rgba(255,255,255,0) 75%, transparent 100%)"
                                    : "conic-gradient(from 0deg, transparent 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 75%, transparent 100%)",
                            }}
                        />
                        <div className={`relative z-10 w-full h-full rounded-[calc(1.25rem-2px)] ${bgColor}`} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 4. APPLE-STYLE 3D TOP HIGHLIGHT (Bord supérieur légèrement lumineux au repos) */}
            {!disabled && !isLoading && (
                <div className={`absolute inset-0 pointer-events-none z-10 rounded-[1.25rem] bg-gradient-to-b ${darkMode ? 'from-white/10' : 'from-black/5'} to-transparent opacity-60`} style={{ maskImage: 'linear-gradient(to bottom, black 5%, transparent 30%)', WebkitMaskImage: 'linear-gradient(to bottom, black 5%, transparent 30%)' }} />
            )}

            {/* CONTENT TRANSITION (Texte -> Loader pur minimaliste) */}
            <AnimatePresence mode="wait">
                {isLoading ? (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                        className="flex items-center justify-center absolute inset-0 z-20 gap-3"
                    >
                        <svg className={`animate-spin h-5 w-5 ${darkMode ? 'opacity-70' : 'text-stone-900 opacity-70'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-100" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className={darkMode ? "text-white/80" : "text-stone-900/80"}>Sécurisation...</span>
                    </motion.div>
                ) : (
                    <motion.div
                        key="text"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                        className="relative z-20 flex items-center justify-center w-full whitespace-nowrap gap-3"
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.button>
    );
};


/**
 * CheckoutView — Flow Single Page Premium (Mars 2026)
 * Tout sur la même page : formulaire au-dessus, choix du paiement, et Stripe injecté en dessous.
 */
const CheckoutView = ({ cartItems, total, user, darkMode = false, onBack, onPlaceOrder }) => {
    const toast = useToast();
    const cardPaymentsEnabledByBuild = import.meta.env.VITE_STRIPE_CARD_PAYMENTS_ENABLED !== 'false';
    // --- STATE ---
    const [clientType, setClientType] = useState('particulier'); // 'particulier' | 'entreprise'
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [isInfoValidated, setIsInfoValidated] = useState(false);
    const [showValidationErrors, setShowValidationErrors] = useState(false);
    const reviewRef = useRef(null);
    const orderAttemptIdRef = useRef(null);
    const orderSubmissionInFlightRef = useRef(false);
    
    const [formData, setFormData] = useState({
        // Champs Particulier
        firstName: user?.displayName ? user.displayName.split(' ')[0] : '',
        lastName: user?.displayName ? user.displayName.split(' ').slice(1).join(' ') : '',
        phone: '',
        email: user?.email || '',
        address: '',
        addressComplement: '',
        zip: '',
        city: '',
        country: 'France',
        createAccount: false,
        // Champs Entreprise
        companyName: '',
        contactFirstName: '',
        contactLastName: '',
        companyPhone: '',
        companyEmail: '',
        siret: '',
        tva: '',
        companyAddress: '',
        companyAddressComplement: '',
        companyZip: '',
        companyCity: '',
        companyCountry: 'France',
        billingSameAsShipping: true,
        billingName: '',
        billingAddress: '',
        billingAddressComplement: '',
        billingZip: '',
        billingCity: '',
        billingCountry: 'France',
    });
    
    const [stripeEnabled, setStripeEnabled] = useState(() => {
        if (!cardPaymentsEnabledByBuild) return false;
        try { const c = localStorage.getItem('paymentSettings'); if (c) return JSON.parse(c).stripeEnabled !== false; } catch { /* ignore error */ }
        return true;
    });
    const [paymentMethod, setPaymentMethod] = useState(cardPaymentsEnabledByBuild ? 'stripe_elements' : 'deferred'); // 'stripe_elements' | 'deferred'

    // Écoute en temps réel du flag admin pour carte/wallets
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'sys_metadata', 'payment_settings'), (snap) => {
            if (snap.exists()) {
                const enabled = cardPaymentsEnabledByBuild && snap.data().stripeEnabled !== false;
                localStorage.setItem('paymentSettings', JSON.stringify({ stripeEnabled: enabled }));
                setStripeEnabled(enabled);
                if (!enabled) setPaymentMethod('deferred');
            }
        });
        return () => unsub();
    }, [cardPaymentsEnabledByBuild]);

    // Status global : 'editing' -> 'fetching_stripe' -> 'ready_to_pay' -> 'processing_deferred'
    const [checkoutState, setCheckoutState] = useState('editing'); 
    
    const [clientSecret, setClientSecret] = useState(null);
    const [createdOrderId, setCreatedOrderId] = useState(null);
    const [unavailableItems, setUnavailableItems] = useState([]);
    const [isCleaningUp, setIsCleaningUp] = useState(false);
    const scrollYRef = useRef(0);
    const unlockPageScrollRef = useRef(null);
    const wasPaymentModalOpenRef = useRef(false);

    // iOS Safari scroll lock — empêche le body de scroller derrière la modale Stripe
    useEffect(() => {
        if (checkoutState === 'ready_to_pay') {
            if (!wasPaymentModalOpenRef.current) {
                scrollYRef.current = window.scrollY;
                unlockPageScrollRef.current = lockPageScroll();
            }
            wasPaymentModalOpenRef.current = true;
            document.body.classList.add('modal-open');
            document.body.style.top = `-${scrollYRef.current}px`;
        } else {
            document.body.classList.remove('modal-open');
            document.body.style.top = '';
            if (wasPaymentModalOpenRef.current) {
                unlockPageScrollRef.current?.();
                unlockPageScrollRef.current = null;
                scrollToTarget(scrollYRef.current, { immediate: true, duration: 0 });
            }
            wasPaymentModalOpenRef.current = false;
        }
        return () => {
            document.body.classList.remove('modal-open');
            document.body.style.top = '';
            unlockPageScrollRef.current?.();
            unlockPageScrollRef.current = null;
            wasPaymentModalOpenRef.current = false;
        };
    }, [checkoutState]);

    // Annule la commande pending_payment et restaure le stock quand l'utilisateur
    // ferme le modal Stripe sans payer — évite les commandes orphelines et le stock bloqué
    const handleClosePaymentModal = async () => {
        if (createdOrderId && !isCleaningUp) {
            setIsCleaningUp(true);
            try {
                const cancelOrder = httpsCallable(functions, 'cancelOrderClient');
                await cancelOrder({ orderId: createdOrderId });
                
                // FORCE le nettoyage côté Frontend pour ignorer la latence de Firestore.
                // Sinon, le onSnapshot n'aura pas encore reçu "sold: false" et affichera "Victime de son succès".
                setUnavailableItems([]);
                
            } catch (e) {
                // Non-bloquant : si l'annulation échoue, l'admin peut gérer manuellement
                console.error("Cleanup pending order failed:", e);
            } finally {
                // Un court délai de sécurité avant de débloquer l'état "isCleaningUp"
                setTimeout(() => {
                    setIsCleaningUp(false);
                }, 500);
            }
            setCreatedOrderId(null);
            setClientSecret(null);
        }
        setCheckoutState('editing');
    };
    
    // --- ADDRESS AUTOCOMPLETE ---
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionRef = useRef(null);   // container div des inputs adresse
    const addressInputRef = useRef(null); // input adresse uniquement (pour position dropdown)
    const dropdownRef = useRef(null);     // portal dropdown (pour handleClickOutside)
    const searchTimeout = useRef(null);
    const [dropdownPos, setDropdownPos] = useState({ mobile: false, top: 0, left: 0, width: 0 });

    const updateDropdownPosition = () => {
        if (window.innerWidth < 768) {
            // Mobile : bottom sheet ancré au bas du visual viewport, au-dessus du clavier
            setDropdownPos({ mobile: true });
            return;
        }
        // Desktop : dropdown positionné sous l'input
        const el = addressInputRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const vvTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
        const vvLeft = window.visualViewport ? window.visualViewport.offsetLeft : 0;
        setDropdownPos({
            mobile: false,
            top: rect.bottom + 4 - vvTop,
            left: rect.left - vvLeft,
            width: rect.width,
        });
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            const insideInput = suggestionRef.current && suggestionRef.current.contains(event.target);
            const insideDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
            if (!insideInput && !insideDropdown) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('pointerdown', handleClickOutside);
        return () => {
            document.removeEventListener('pointerdown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (!showSuggestions) return;
        let raf = 0;
        const update = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                updateDropdownPosition();
            });
        };
        window.addEventListener('scroll', update, { capture: true, passive: true });
        window.addEventListener('resize', update, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', update, { passive: true });
            window.visualViewport.addEventListener('scroll', update, { passive: true });
        }
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', update);
                window.visualViewport.removeEventListener('scroll', update);
            }
            if (raf) cancelAnimationFrame(raf);
        };
    }, [showSuggestions]);

    const fetchAddresses = async (query) => {
        if (!query || query.length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        try {
            const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
            const data = await res.json();
            setSuggestions(data.features || []);
            updateDropdownPosition();
            setShowSuggestions(true);
        } catch (e) {
            console.error("API Adresse error:", e);
        }
    };

    const handleAddressRelatedChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setIsInfoValidated(false);
        setIsReviewOpen(false);
        if (checkoutState === 'ready_to_pay') setCheckoutState('editing');

        // Build query using the latest value for the changed field
        const newForm = { ...formData, [name]: value };
        const isComp = clientType === 'entreprise';
        const query = isComp 
            ? [newForm.companyAddress, newForm.companyZip, newForm.companyCity].filter(Boolean).join(' ')
            : [newForm.address, newForm.zip, newForm.city].filter(Boolean).join(' ');

        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            fetchAddresses(query);
        }, 400);
    };

    const handleSelectSuggestion = (suggestion) => {
        const zipValue = suggestion.properties.postcode || '';
        const cityValue = suggestion.properties.city || '';
        const addressValue = suggestion.properties.name || '';

        const isComp = clientType === 'entreprise';

        setFormData(prev => ({
            ...prev,
            ...(isComp ? {
                companyAddress: addressValue,
                companyZip: zipValue,
                companyCity: cityValue
            } : {
                address: addressValue,
                zip: zipValue,
                city: cityValue
            })
        }));
        setIsInfoValidated(false);
        setIsReviewOpen(false);
        if (checkoutState === 'ready_to_pay') setCheckoutState('editing');
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const renderAddressSuggestions = ({ mobile = false } = {}) => (
        <div
            ref={mobile ? null : dropdownRef}
            className={mobile
                ? `rounded-2xl border shadow-xl overflow-hidden ${darkMode ? 'bg-stone-950 border-stone-800' : 'bg-white border-stone-100'}`
                : `p-2 rounded-2xl border shadow-2xl max-h-64 overflow-y-auto ${darkMode ? 'bg-stone-800 border-stone-700' : 'bg-white border-stone-100'}`
            }
        >
            <div className={mobile ? 'max-h-[min(34svh,260px)] overflow-y-auto ios-modal-scroll' : ''}>
                {suggestions.map((s, i) => (
                    <div
                        key={i}
                        onPointerDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                        className={mobile
                            ? `px-4 py-3.5 flex flex-col gap-0.5 ${i < suggestions.length - 1 ? (darkMode ? 'border-b border-stone-800' : 'border-b border-stone-100') : ''} ${darkMode ? 'active:bg-stone-800' : 'active:bg-stone-50'}`
                            : `p-3 rounded-xl cursor-pointer transition-colors flex flex-col gap-0.5 ${darkMode ? 'hover:bg-stone-700 active:bg-stone-600' : 'hover:bg-stone-50 active:bg-stone-100'}`
                        }
                    >
                        <span className={`font-bold leading-tight ${mobile ? 'text-sm' : 'text-sm'} ${darkMode ? 'text-white' : 'text-stone-900'}`}>{s.properties.name}</span>
                        <span className={`text-[11px] font-medium uppercase tracking-wider ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>{s.properties.postcode} {s.properties.city}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    // --- TEMPS RÉEL : SURVEILLANCE STOCK ---
    useEffect(() => {
        if (cartItems.length === 0) return;

        const unsubscribes = cartItems.map(item => {
            const collectionName = item.collectionName || 'furniture';
            return onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', collectionName, item.originalId || item.id), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const requestedQuantity = Math.max(1, Number(item.quantity) || 1);
                    const availableStock = data.stock === undefined ? 1 : Math.max(0, Number(data.stock) || 0);
                    const isUnavailable = Boolean(data.sold) || availableStock < requestedQuantity;
                    setUnavailableItems(prev => {
                        const withoutItem = prev.filter(entry => entry.id !== item.id);
                        return isUnavailable
                            ? [...withoutItem, { id: item.id, name: item.name, reason: data.sold ? 'sold' : 'stock' }]
                            : withoutItem;
                    });
                } else {
                    setUnavailableItems(prev => [
                        ...prev.filter(entry => entry.id !== item.id),
                        { id: item.id, name: item.name, reason: 'deleted' }
                    ]);
                }
            });
        });

        return () => unsubscribes.forEach(unsub => unsub());
    }, [cartItems]);

    // --- ON CHANGE FORM ---
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        setIsInfoValidated(false);
        setIsReviewOpen(false);
        if (checkoutState === 'ready_to_pay') {
            setCheckoutState('editing');
        }
    };

    const validation = useMemo(() => getCheckoutValidation(formData, clientType), [formData, clientType]);
    const isFormValid = validation.isValid;
    const customerPayload = useMemo(
        () => buildCheckoutCustomerPayload(formData, clientType),
        [formData, clientType]
    );
    const normalizedCheckoutEmail = String(customerPayload.email || '').trim().toLowerCase();
    const hasVerifiedCheckoutEmail = Boolean(
        user
        && !user.isAnonymous
        && user.emailVerified
        && String(user.email || '').trim().toLowerCase() === normalizedCheckoutEmail
    );
    const requiresEmailVerification = !hasVerifiedCheckoutEmail;

    const openInformationReview = () => {
        setShowValidationErrors(true);
        if (!validation.isValid) {
            const target = document.querySelector(`[name="${validation.firstInvalidField}"]`);
            target?.focus({ preventScroll: true });
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            toast('Quelques informations sont à corriger avant la vérification.', { type: 'warning' });
            return;
        }
        setIsReviewOpen(true);
        requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    };

    const confirmInformationReview = () => {
        if (!validation.isValid) {
            openInformationReview();
            return;
        }
        setIsInfoValidated(true);
        setIsReviewOpen(false);
        setShowValidationErrors(false);
        toast('Informations confirmées. Choisissez maintenant votre moyen de paiement.', { type: 'success' });
    };

    // --- SUBMIT ACTION : FETCH STRIPE OU CONFIRM DEFERRED ---
    const handleActionClick = async () => {
        if (orderSubmissionInFlightRef.current) return;
        if (!user || user.isAnonymous) {
            toast('Validez le code reçu par email avant de passer commande.', { type: 'warning' });
            return;
        }
        if (cartItems.length === 0) {
            toast('Votre panier est vide.', { type: 'warning' });
            return;
        }
        if (!isFormValid || !isInfoValidated) {
            openInformationReview();
            return;
        }
        if (requiresEmailVerification) {
            toast("Validez d'abord le code reçu à l'adresse indiquée.", { type: 'warning' });
            return;
        }
        if (unavailableItems.length > 0) {
            toast("Attention : Un article de votre panier n'est plus disponible.", { type: 'warning' });
            return;
        }

        orderSubmissionInFlightRef.current = true;

        if (paymentMethod === 'stripe_elements') {
            setCheckoutState('fetching_stripe');
        } else {
            setCheckoutState('processing_deferred');
        }

        try {
            const createOrder = httpsCallable(functions, 'createOrder');
            const itemsWithCol = cartItems.map(i => ({
                ...i,
                collectionName: i.collectionName || 'furniture'
            }));

            if (!orderAttemptIdRef.current) {
                orderAttemptIdRef.current = typeof globalThis.crypto?.randomUUID === 'function'
                    ? globalThis.crypto.randomUUID()
                    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            }
            const attemptId = orderAttemptIdRef.current;

            const result = await createOrder({
                attemptId,
                orderData: {
                    shipping: customerPayload,
                    paymentMethod,
                    items: itemsWithCol,
                    total
                }
            });

            if (result.data.success) {
                if (paymentMethod === 'stripe_elements') {
                    if (result.data.clientSecret) {
                        setClientSecret(result.data.clientSecret);
                        setCreatedOrderId(result.data.orderId);
                        setCheckoutState('ready_to_pay');
                    } else {
                        throw new Error("Client secret manquant.");
                    }
                } else {
                    // Deferred: succès direct
                    await onPlaceOrder({
                        id: result.data.orderId,
                        shipping: customerPayload,
                        paymentMethod,
                        total
                    });
                    orderAttemptIdRef.current = null;
                }
            } else {
                throw new Error("Erreur de création de commande.");
            }
        } catch (error) {
            console.error('Order creation failed:', error?.code || error?.message);
            setCheckoutState('editing');
            let msg = "Une erreur est survenue lors de la commande.";
            if (error?.code?.includes('failed-precondition') && error?.message?.toLowerCase().includes('email')) {
                toast('Votre session email doit être actualisée. Demandez un nouveau code.', { type: 'warning' });
                msg = 'Votre adresse email doit être validée avec un nouveau code.';
            } else if (error.message?.includes('vendu')) {
                msg = "Désolé, cet article vient d'être vendu à l'instant.";
            } else if (error.message?.toLowerCase().includes('stock')) {
                msg = "Stock insuffisant pour cet article.";
            } else if (error.message) {
                msg = error.message;
            }
            toast(msg, { type: 'error' });
        } finally {
            orderSubmissionInFlightRef.current = false;
        }
    };

    // --- STRIPE APPEARANCE ---
    const stripeElementsOptions = useMemo(() => {
        if (!clientSecret) return null;
        return {
            clientSecret,
            appearance: {
                theme: darkMode ? 'night' : 'stripe',
                variables: {
                    colorPrimary: darkMode ? '#ffffff' : '#1c1917',
                    colorBackground: darkMode ? '#1c1917' : '#ffffff',
                    colorText: darkMode ? '#fafaf9' : '#1c1917',
                    colorDanger: '#ef4444',
                    fontFamily: 'Outfit, system-ui, sans-serif',
                    borderRadius: '12px',
                    spacingUnit: '4px',
                },
                rules: {
                    '.Input': {
                        backgroundColor: darkMode ? '#0c0a09' : '#ffffff',
                        border: darkMode ? '1px solid #292524' : '1px solid #e5e7eb',
                        boxShadow: 'none',
                    },
                    '.Input:focus': {
                        borderColor: darkMode ? '#ffffff' : '#1c1917',
                        boxShadow: darkMode ? '0 0 0 1px #ffffff' : '0 0 0 1px #1c1917',
                    },
                    '.Label': {
                        fontWeight: '600',
                    }
                }
            },
            locale: 'fr',
        };
    }, [clientSecret, darkMode]);


    // --- RENDU OUT OF STOCK ---
    // On ne bloque pas si on est en train de processer une commande (fetching_stripe, processing_deferred)
    // OU si on vient de générer le PaymentIntent (ready_to_pay), car dans ce cas, c'est NOUS qui avons 
    // mis le stock à sold=true pour le réserver !
    // On ne bloque pas non plus si on est en cours de nettoyage (isCleaningUp) après avoir fermé la modale Stripe, 
    // pour laisser le temps au serveur de remettre sold=false sans déclencher l'alerte !
    if (unavailableItems.length > 0 && checkoutState !== 'processing_deferred' && checkoutState !== 'fetching_stripe' && checkoutState !== 'ready_to_pay' && !isCleaningUp) {
        return (
            <>
            <SEO
                title="Paiement securise"
                description="Page de paiement privee Tous a Table."
                url="/checkout"
                robots="noindex,nofollow,noarchive"
            />
            <div className={`min-h-screen pt-12 px-6 flex items-center justify-center bg-transparent`}>
                <div className={`p-8 rounded-3xl shadow-xl max-w-md text-center space-y-6 border ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-100'}`}>
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle size={32} />
                    </div>
                    <h2 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-stone-900'}`}>Victime de son succès</h2>
                    <p className={darkMode ? 'text-stone-400' : 'text-stone-500'}>
                        {unavailableItems.length === 1
                            ? `L'article "${unavailableItems[0].name}" vient d'être réservé par un autre passionné.`
                            : "Certains articles viennent d'être réservés."}
                    </p>
                    <button onClick={onBack} className={`w-full py-4 rounded-xl font-bold uppercase text-xs tracking-widest transition-all text-stone-900 bg-amber-500 hover:bg-amber-400`}>
                        Retourner à la boutique
                    </button>
                </div>
            </div>
            </>
        );
    }

    const inputClasses = `w-full p-3.5 md:p-4 rounded-xl ring-1 ring-inset outline-none focus:ring-2 font-bold text-base transition-all transform-gpu ${
        darkMode 
            ? 'bg-stone-900 ring-stone-800 focus:ring-white text-white placeholder:text-stone-600 autofill-dark' 
            : 'bg-stone-50 ring-stone-200 focus:ring-stone-900 text-stone-900 placeholder:text-stone-400 autofill-light'
    }`;
    const getInputClasses = (name) => `${inputClasses} ${showValidationErrors && validation.errors[name]
        ? 'ring-red-500 focus:ring-red-500'
        : ''}`;
    const renderFieldError = (name) => showValidationErrors && validation.errors[name]
        ? <p className="mt-1.5 px-1 text-xs font-semibold text-red-500" role="alert">{validation.errors[name]}</p>
        : null;
    const cardClasses = `p-5 md:p-6 rounded-3xl border shadow-sm space-y-4 ${darkMode ? 'bg-stone-900/50 border-stone-800/50' : 'bg-white border-stone-100'}`;

    return (
        <>
        <SEO
            title="Paiement securise"
            description="Page de paiement privee Tous a Table."
            url="/checkout"
            robots="noindex,nofollow,noarchive"
        />
        <div
            className={`min-h-screen pt-10 px-4 md:px-6 animate-in fade-in transition-colors duration-700 bg-transparent`}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)' }}
        >
            <div className="max-w-[1240px] mx-auto w-full">
                {/* HEADER RETOUR */}
                <div className="mb-8 md:mb-12">
                    <button onClick={onBack} aria-label="Retour au panier" className={`flex items-center gap-2 font-bold text-[10px] md:text-xs uppercase tracking-widest transition-colors mb-6 ${darkMode ? 'text-stone-500 hover:text-white' : 'text-stone-400 hover:text-stone-900'}`}>
                        <ArrowLeft size={14} /> Retour au panier
                    </button>
                    <h2 className={`text-3xl md:text-5xl font-black tracking-tighter ${darkMode ? 'text-white' : 'text-stone-900'}`}>
                        Finaliser la commande.
                    </h2>
                </div>

                <div className="grid lg:grid-cols-[1fr_460px] gap-8 lg:gap-16 items-start">
                    
                    {/* COLONNE GAUCHE : FORMULAIRES & PAIEMENT */}
                    <div className="space-y-6 w-full">
                        
                        {/* GROUPE 1 : INFOS & ADRESSE COMBINÉS */}
                        {/* GROUPE 1 : INFOS & ADRESSE COMBINÉS */}
                        <div className={cardClasses}>
                            <h3 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-stone-400 flex items-center gap-2 mb-4">
                                <Truck size={14} /> Informations de Livraison
                            </h3>

                            {showValidationErrors && !isFormValid && (
                                <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'}`} role="alert">
                                    <p className="text-sm font-black text-red-500">{Object.keys(validation.errors).length} information{Object.keys(validation.errors).length > 1 ? 's' : ''} à corriger</p>
                                    <p className={`mt-1 text-xs ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>Le premier champ concerné a été sélectionné pour vous.</p>
                                </div>
                            )}

                            {/* TOGGLE PARTICULIER / ENTREPRISE */}
                            <div className={`flex p-1 rounded-xl mb-6 ${darkMode ? 'bg-stone-950 border border-stone-800' : 'bg-stone-100'}`}>
                                <button
                                    type="button"
                                    onClick={() => { setClientType('particulier'); setIsInfoValidated(false); setIsReviewOpen(false); setShowValidationErrors(false); }}
                                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${clientType === 'particulier' ? (darkMode ? 'bg-stone-800 text-white shadow-sm' : 'bg-white text-stone-900 shadow-sm') : (darkMode ? 'text-stone-500 hover:text-stone-300' : 'text-stone-500 hover:text-stone-700')}`}
                                >
                                    Particulier
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setClientType('entreprise'); setIsInfoValidated(false); setIsReviewOpen(false); setShowValidationErrors(false); }}
                                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${clientType === 'entreprise' ? (darkMode ? 'bg-stone-800 text-white shadow-sm' : 'bg-white text-stone-900 shadow-sm') : (darkMode ? 'text-stone-500 hover:text-stone-300' : 'text-stone-500 hover:text-stone-700')}`}
                                >
                                    Entreprise
                                </button>
                            </div>

                            {clientType === 'particulier' ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                                        <div>
                                            <input name="firstName" value={formData.firstName} onChange={handleChange} placeholder="Prénom" className={getInputClasses('firstName')} aria-invalid={Boolean(showValidationErrors && validation.errors.firstName)} required />
                                            {renderFieldError('firstName')}
                                        </div>
                                        <div>
                                            <input name="lastName" value={formData.lastName} onChange={handleChange} placeholder="Nom" className={getInputClasses('lastName')} aria-invalid={Boolean(showValidationErrors && validation.errors.lastName)} required />
                                            {renderFieldError('lastName')}
                                        </div>
                                    </div>
                                    <div>
                                        <input name="phone" value={formData.phone} onChange={handleChange} placeholder="Téléphone" className={getInputClasses('phone')} aria-invalid={Boolean(showValidationErrors && validation.errors.phone)} inputMode="tel" autoComplete="tel" required />
                                        {renderFieldError('phone')}
                                    </div>
                                    <div>
                                        <input name="email" value={formData.email} onChange={handleChange} placeholder="E-mail" type="email" className={getInputClasses('email')} aria-invalid={Boolean(showValidationErrors && validation.errors.email)} autoComplete="email" required />
                                        {renderFieldError('email')}
                                    </div>
                                    
                                    <div className="flex flex-col gap-3 md:gap-4" ref={suggestionRef}>
                                        <input
                                            ref={addressInputRef}
                                            name="address"
                                            value={formData.address}
                                            onChange={handleAddressRelatedChange}
                                            onFocus={(e) => { e.target.select(); if (suggestions.length > 0) { updateDropdownPosition(); setShowSuggestions(true); } }}
                                            placeholder="Adresse (N°, Rue)"
                                            className={getInputClasses('address')}
                                            aria-invalid={Boolean(showValidationErrors && validation.errors.address)}
                                            required
                                            autoComplete="off"
                                        />
                                        {renderFieldError('address')}
                                        {showSuggestions && suggestions.length > 0 && dropdownPos.mobile && (
                                            <div ref={dropdownRef} className="-mt-1 mb-1 md:hidden">
                                                {renderAddressSuggestions({ mobile: true })}
                                            </div>
                                        )}
                                        <input name="addressComplement" value={formData.addressComplement} onChange={handleChange} placeholder="Complément d'adresse (optionnel)" className={inputClasses} />
                                        
                                        <div className="grid grid-cols-2 gap-3 md:gap-4">
                                            <div>
                                                <input name="zip" value={formData.zip} onChange={handleAddressRelatedChange} onFocus={(e) => { e.target.select(); if (suggestions.length > 0) { updateDropdownPosition(); setShowSuggestions(true); } }} placeholder="Code postal" className={getInputClasses('zip')} aria-invalid={Boolean(showValidationErrors && validation.errors.zip)} required inputMode="numeric" autoComplete="postal-code" />
                                                {renderFieldError('zip')}
                                            </div>
                                            <div>
                                                <input name="city" value={formData.city} onChange={handleAddressRelatedChange} onFocus={(e) => { e.target.select(); if (suggestions.length > 0) { updateDropdownPosition(); setShowSuggestions(true); } }} placeholder="Ville" className={getInputClasses('city')} aria-invalid={Boolean(showValidationErrors && validation.errors.city)} required autoComplete="address-level2" />
                                                {renderFieldError('city')}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <select name="country" value={formData.country} onChange={handleChange} className={`${inputClasses} pr-12 appearance-none`} style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: `right 1.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em` }}>
                                        <option value="France">France</option>
                                    </select>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <input name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Raison sociale" className={getInputClasses('companyName')} aria-invalid={Boolean(showValidationErrors && validation.errors.companyName)} autoComplete="organization" required />
                                        {renderFieldError('companyName')}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                                        <div>
                                            <input name="contactFirstName" value={formData.contactFirstName} onChange={handleChange} placeholder="Prénom du contact" className={getInputClasses('contactFirstName')} aria-invalid={Boolean(showValidationErrors && validation.errors.contactFirstName)} autoComplete="given-name" required />
                                            {renderFieldError('contactFirstName')}
                                        </div>
                                        <div>
                                            <input name="contactLastName" value={formData.contactLastName} onChange={handleChange} placeholder="Nom du contact" className={getInputClasses('contactLastName')} aria-invalid={Boolean(showValidationErrors && validation.errors.contactLastName)} autoComplete="family-name" required />
                                            {renderFieldError('contactLastName')}
                                        </div>
                                    </div>
                                    <div>
                                        <input name="companyPhone" value={formData.companyPhone} onChange={handleChange} placeholder="Téléphone professionnel" className={getInputClasses('companyPhone')} aria-invalid={Boolean(showValidationErrors && validation.errors.companyPhone)} inputMode="tel" autoComplete="tel" required />
                                        {renderFieldError('companyPhone')}
                                    </div>
                                    <div>
                                        <input name="companyEmail" value={formData.companyEmail} onChange={handleChange} placeholder="E-mail professionnel" type="email" className={getInputClasses('companyEmail')} aria-invalid={Boolean(showValidationErrors && validation.errors.companyEmail)} autoComplete="email" required />
                                        {renderFieldError('companyEmail')}
                                    </div>
                                    <div>
                                        <input name="siret" value={formData.siret} onChange={handleChange} placeholder="N° SIRET — 14 chiffres" className={getInputClasses('siret')} aria-invalid={Boolean(showValidationErrors && validation.errors.siret)} inputMode="numeric" required />
                                        {renderFieldError('siret')}
                                    </div>
                                    <div>
                                        <input name="tva" value={formData.tva} onChange={handleChange} placeholder="N° TVA intracommunautaire (optionnel)" className={getInputClasses('tva')} aria-invalid={Boolean(showValidationErrors && validation.errors.tva)} />
                                        {renderFieldError('tva')}
                                    </div>
                                    
                                    <div className="flex flex-col gap-3 md:gap-4" ref={suggestionRef}>
                                        <input
                                            ref={addressInputRef}
                                            name="companyAddress"
                                            value={formData.companyAddress}
                                            onChange={handleAddressRelatedChange}
                                            onFocus={(e) => { e.target.select(); if (suggestions.length > 0) { updateDropdownPosition(); setShowSuggestions(true); } }}
                                            placeholder="Adresse de l'entreprise"
                                            className={getInputClasses('companyAddress')}
                                            aria-invalid={Boolean(showValidationErrors && validation.errors.companyAddress)}
                                            required
                                            autoComplete="off"
                                        />
                                        {renderFieldError('companyAddress')}
                                        {showSuggestions && suggestions.length > 0 && dropdownPos.mobile && (
                                            <div ref={dropdownRef} className="-mt-1 mb-1 md:hidden">
                                                {renderAddressSuggestions({ mobile: true })}
                                            </div>
                                        )}
                                        <input name="companyAddressComplement" value={formData.companyAddressComplement} onChange={handleChange} placeholder="Complément d'adresse (optionnel)" className={inputClasses} />
                                        
                                        <div className="grid grid-cols-2 gap-3 md:gap-4">
                                            <div>
                                                <input name="companyZip" value={formData.companyZip} onChange={handleAddressRelatedChange} onFocus={(e) => { e.target.select(); if (suggestions.length > 0) { updateDropdownPosition(); setShowSuggestions(true); } }} placeholder="Code postal" className={getInputClasses('companyZip')} aria-invalid={Boolean(showValidationErrors && validation.errors.companyZip)} required inputMode="numeric" autoComplete="postal-code" />
                                                {renderFieldError('companyZip')}
                                            </div>
                                            <div>
                                                <input name="companyCity" value={formData.companyCity} onChange={handleAddressRelatedChange} onFocus={(e) => { e.target.select(); if (suggestions.length > 0) { updateDropdownPosition(); setShowSuggestions(true); } }} placeholder="Ville" className={getInputClasses('companyCity')} aria-invalid={Boolean(showValidationErrors && validation.errors.companyCity)} required autoComplete="address-level2" />
                                                {renderFieldError('companyCity')}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <select name="companyCountry" value={formData.companyCountry} onChange={handleChange} className={`${inputClasses} pr-12 appearance-none`} style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: `right 1.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em` }}>
                                        <option value="France">France</option>
                                    </select>
                                </div>
                            )}

                            <div className={`pt-5 mt-5 border-t ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input type="checkbox" name="billingSameAsShipping" checked={formData.billingSameAsShipping} onChange={handleChange} className="mt-0.5 w-5 h-5 accent-amber-500 rounded bg-stone-900 border-stone-800" />
                                    <span>
                                        <span className={`block text-sm font-bold ${darkMode ? 'text-stone-200' : 'text-stone-800'}`}>Même adresse pour la facture</span>
                                        <span className="mt-0.5 block text-xs text-stone-500">Décochez uniquement si la facture doit porter une autre adresse.</span>
                                    </span>
                                </label>

                                {!formData.billingSameAsShipping && (
                                    <div className={`mt-4 space-y-3 rounded-2xl border p-4 ${darkMode ? 'bg-stone-950/50 border-stone-800' : 'bg-stone-50 border-stone-200'}`}>
                                        <p className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>Adresse de facturation</p>
                                        <div>
                                            <input name="billingName" value={formData.billingName} onChange={handleChange} placeholder="Nom ou raison sociale sur la facture" className={getInputClasses('billingName')} aria-invalid={Boolean(showValidationErrors && validation.errors.billingName)} required />
                                            {renderFieldError('billingName')}
                                        </div>
                                        <div>
                                            <input name="billingAddress" value={formData.billingAddress} onChange={handleChange} placeholder="Adresse de facturation" className={getInputClasses('billingAddress')} aria-invalid={Boolean(showValidationErrors && validation.errors.billingAddress)} required />
                                            {renderFieldError('billingAddress')}
                                        </div>
                                        <input name="billingAddressComplement" value={formData.billingAddressComplement} onChange={handleChange} placeholder="Complément d'adresse (optionnel)" className={inputClasses} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <input name="billingZip" value={formData.billingZip} onChange={handleChange} placeholder="Code postal" className={getInputClasses('billingZip')} aria-invalid={Boolean(showValidationErrors && validation.errors.billingZip)} inputMode="numeric" required />
                                                {renderFieldError('billingZip')}
                                            </div>
                                            <div>
                                                <input name="billingCity" value={formData.billingCity} onChange={handleChange} placeholder="Ville" className={getInputClasses('billingCity')} aria-invalid={Boolean(showValidationErrors && validation.errors.billingCity)} required />
                                                {renderFieldError('billingCity')}
                                            </div>
                                        </div>
                                        <select name="billingCountry" value={formData.billingCountry} onChange={handleChange} className={`${inputClasses} pr-12 appearance-none`}>
                                            <option value="France">France</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className={`mt-5 rounded-2xl border p-4 ${hasVerifiedCheckoutEmail ? (darkMode ? 'border-emerald-400/25 bg-emerald-400/10' : 'border-emerald-200 bg-emerald-50') : (darkMode ? 'border-amber-300/20 bg-stone-950/45' : 'border-stone-200 bg-stone-50')}`}>
                                {hasVerifiedCheckoutEmail ? (
                                    <div className="flex items-start gap-3" role="status">
                                        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-500" />
                                        <div>
                                            <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-stone-900'}`}>Email confirmé pour cette commande</p>
                                            <p className="mt-1 text-xs text-stone-500">{normalizedCheckoutEmail}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <EmailOtpFlow
                                        email={clientType === 'entreprise' ? formData.companyEmail : formData.email}
                                        onEmailChange={(value) => setFormData((previous) => ({
                                            ...previous,
                                            [clientType === 'entreprise' ? 'companyEmail' : 'email']: value
                                        }))}
                                        showEmailInput={false}
                                        compact
                                        darkMode={darkMode}
                                        title="Confirmez l’email de la commande"
                                        description="Recevez un code à 6 chiffres. La validation vous connecte et conserve tout votre panier."
                                    />
                                )}
                            </div>

                            {isReviewOpen && !isInfoValidated && (
                                <div ref={reviewRef} className={`mt-5 rounded-2xl border p-5 ${darkMode ? 'bg-stone-950 border-stone-700' : 'bg-stone-50 border-stone-200'}`}>
                                    <div className="flex items-start gap-3">
                                        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-amber-500" />
                                        <div>
                                            <h4 className={`text-base font-black ${darkMode ? 'text-white' : 'text-stone-900'}`}>Relisez, puis confirmez</h4>
                                            <p className="mt-1 text-xs leading-relaxed text-stone-500">Ces informations seront utilisées pour la livraison et la facture.</p>
                                        </div>
                                    </div>

                                    <div className="mt-5 grid gap-3 text-sm">
                                        {clientType === 'entreprise' && (
                                            <div className={`rounded-xl border p-3 ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">Entreprise</p>
                                                <p className={`mt-1 font-bold ${darkMode ? 'text-white' : 'text-stone-900'}`}>{customerPayload.companyName}</p>
                                                <p className="mt-1 text-xs text-stone-500">SIRET {customerPayload.siret}{customerPayload.tva ? ` · TVA ${customerPayload.tva}` : ''}</p>
                                            </div>
                                        )}
                                        <div className={`rounded-xl border p-3 ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">Contact et livraison</p>
                                            <p className={`mt-1 font-bold ${darkMode ? 'text-white' : 'text-stone-900'}`}>{customerPayload.fullName}</p>
                                            <p className="mt-1 text-xs leading-relaxed text-stone-500">{customerPayload.email} · {customerPayload.phone}<br />{formatCheckoutAddress(customerPayload)}</p>
                                        </div>
                                        <div className={`rounded-xl border p-3 ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">Facturation</p>
                                            <p className={`mt-1 font-bold ${darkMode ? 'text-white' : 'text-stone-900'}`}>{customerPayload.billing.name}</p>
                                            <p className="mt-1 text-xs leading-relaxed text-stone-500">{formatCheckoutAddress(customerPayload.billing)}</p>
                                        </div>
                                    </div>

                                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <button type="button" onClick={() => { setIsReviewOpen(false); document.querySelector('[name="firstName"], [name="companyName"]')?.focus(); }} className={`py-3.5 rounded-xl border font-black uppercase text-[10px] tracking-widest ${darkMode ? 'border-stone-700 text-white' : 'border-stone-300 text-stone-800'}`}>
                                            Modifier
                                        </button>
                                        <button type="button" onClick={confirmInformationReview} className={`py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest ${darkMode ? 'bg-white text-stone-900' : 'bg-stone-900 text-white'}`}>
                                            Tout est correct
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isInfoValidated ? (
                                <div className={`mt-5 flex items-center justify-between gap-4 rounded-2xl border p-4 ${darkMode ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'}`}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />
                                        <div className="min-w-0">
                                            <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-stone-900'}`}>Informations confirmées</p>
                                            <p className="truncate text-xs text-stone-500">{customerPayload.fullName} · {customerPayload.city}</p>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => { setIsInfoValidated(false); setIsReviewOpen(true); }} className={`shrink-0 rounded-xl border p-2.5 ${darkMode ? 'border-stone-700 text-stone-300' : 'border-stone-300 text-stone-600'}`} aria-label="Modifier les informations">
                                        <Pencil size={16} />
                                    </button>
                                </div>
                            ) : !isReviewOpen && (
                                <div className={`pt-6 mt-4 border-t ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                                    <button
                                        type="button"
                                        onClick={openInformationReview}
                                        className={`w-full py-4 rounded-xl font-black uppercase text-[10px] md:text-xs tracking-widest transition-all ${darkMode ? 'bg-white text-stone-900 hover:bg-stone-200' : 'bg-stone-900 text-white hover:bg-stone-800'}`}
                                    >
                                        Vérifier mes informations
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* GROUPE 2 : CHOIX DU PAIEMENT */}
                        <div className="relative">
                            {!isInfoValidated && (
                                <div className="absolute inset-0 z-20 rounded-3xl bg-white/40 dark:bg-stone-900/40 backdrop-blur-[2px] flex items-center justify-center">
                                    <span className="bg-stone-900 dark:bg-white text-white dark:text-stone-900 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest shadow-xl pointer-events-auto cursor-help" title="Veuillez d'abord valider vos informations ci-dessus">
                                        Validation requise
                                    </span>
                                </div>
                            )}
                        <div className={`${cardClasses} ${!stripeEnabled ? 'w-full md:max-w-[400px]' : ''} ${!isInfoValidated ? 'opacity-60 pointer-events-none grayscale-[0.2]' : ''}`}>
                            <h3 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-stone-400 flex items-center gap-2 mb-4">
                                <CreditCard size={14} /> Moyen de Paiement
                            </h3>
                            
                            <div className={stripeEnabled ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4' : 'flex flex-col'}>
                                {/* PAIEMENT DIRECT */}
                                {stripeEnabled && <div
                                    onClick={() => {
                                        setPaymentMethod('stripe_elements');
                                        setCheckoutState('editing'); // Reset si on change d'avis
                                    }}
                                    className={`relative group p-[1.5px] rounded-[1.125rem] overflow-hidden cursor-pointer w-full transition-all`}
                                >
                                    {/* NEON LAYER - ONLY VISIBLE IF SELECTED */}
                                    {paymentMethod === 'stripe_elements' && (
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
                                    )}

                                    {/* DEFAULT BORDER FALLBACK */}
                                    {paymentMethod !== 'stripe_elements' && (
                                        <div className={`absolute inset-0 z-0 rounded-[1.125rem] border-2 transition-colors ${darkMode ? 'border-stone-800' : 'border-stone-200'}`} />
                                    )}

                                    {/* INNER CONTENT - OPAQUE MASKING (to hide the center of the wave) */}
                                    <div className={`relative z-10 w-full h-full p-4 rounded-2xl flex flex-col gap-6 transition-all ${paymentMethod === 'stripe_elements' ? (darkMode ? 'bg-stone-900' : 'bg-white') : (darkMode ? 'bg-transparent group-hover:bg-white/5' : 'bg-transparent group-hover:bg-black/5')} backdrop-blur-md`}>
                                        
                                        {/* EN-TÊTE : ICONE + TITRE */}
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition-colors ${paymentMethod === 'stripe_elements' ? (darkMode ? 'bg-stone-800 text-white' : 'bg-stone-900 text-white') : (darkMode ? 'bg-stone-800/50 text-stone-500' : 'bg-stone-100 text-stone-400')}`}>
                                                <Wallet size={22} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center">
                                                    <span className={`font-black text-base ${darkMode ? 'text-white' : 'text-stone-900'}`}>Carte / Wallets</span>
                                                </div>
                                                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-0.5">Rapide & Sécurisé</p>
                                            </div>
                                        </div>
                                        
                                        {/* LOGOS CARTE / WALLET (SUR LEUR PROPRE LIGNE) */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {/* VISA */}
                                            <div className={`h-7 px-2.5 flex items-center justify-center rounded-md border ${darkMode ? 'bg-white border-stone-700' : 'bg-white border-stone-200 shadow-sm'}`}>
                                                <span className="text-[11px] font-black italic text-[#1434CB] tracking-tighter">VISA</span>
                                            </div>
                                            {/* MASTERCARD */}
                                            <div className={`h-7 w-10 relative overflow-hidden flex items-center justify-center rounded-md border ${darkMode ? 'bg-white border-stone-700' : 'bg-white border-stone-200 shadow-sm'}`}>
                                                <div className="w-4 h-4 rounded-full bg-[#EB001B] mix-blend-multiply absolute -translate-x-1.5" />
                                                <div className="w-4 h-4 rounded-full bg-[#F79E1B] mix-blend-multiply absolute justify-center translate-x-1.5" />
                                            </div>
                                            {/* APPLE PAY */}
                                            <div className={`h-7 px-2.5 flex items-center justify-center rounded-md border ${darkMode ? 'bg-stone-800 border-stone-700 text-white' : 'bg-black border-black text-white'}`}>
                                                <span className="text-[10px] font-medium flex items-center gap-1.5"><svg viewBox="0 0 384 512" className="w-3 h-3 fill-current" xmlns="http://www.w3.org/2000/svg"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg> Pay</span>
                                            </div>
                                            {/* GOOGLE PAY */}
                                            <div className={`h-7 px-2.5 flex items-center justify-center rounded-md border ${darkMode ? 'bg-white border-stone-700' : 'bg-white border-stone-200 shadow-sm'}`}>
                                                <span className="text-[10px] font-medium text-stone-700 flex items-center gap-1.5"><svg viewBox="0 0 488 512" className="w-3 h-3 fill-current text-[#4285F4]" xmlns="http://www.w3.org/2000/svg"><path d="M488 261.8C488 240.8 486.1 221.1 482.6 202H248v118.9h135.2c-5.8 38.6-28.9 71.3-61.6 93.1v77.5h99.6c58.2-53.6 91.8-132.7 91.8-229.7z" fill="#4285F4" /><path d="M248 512c67.4 0 124.1-22.3 165.4-60.5l-99.6-77.5c-22.4 15-51 23.9-82.8 23.9-63.7 0-117.7-43.1-136.9-101.1H-5.4v79.4C44.7 475.2 138.8 512 248 512z" fill="#34A853"/><path d="M111.1 296.8c-4.9-14.6-7.7-30.2-7.7-46.3s2.8-31.7 7.7-46.3V124.8H-5.4C-18.7 151.3-26.1 181.7-26.1 213.5s7.4 62.2 20.7 88.7l116.5-5.4z" fill="#FBBC04"/><path d="M248 102.1c36.7 0 69.6 12.6 95.5 37.4l71.7-71.7C372 26.2 315.3 0 248 0 138.8 0 44.7 36.8-5.4 124.8L111.1 204c19.2-58 73.2-101.9 136.9-101.9z" fill="#EA4335"/></svg> Pay</span>
                                            </div>
                                            {/* PAYPAL */}
                                            <div className={`h-7 px-2.5 flex items-center justify-center rounded-md border ${darkMode ? 'bg-[#003087] border-[#003087]' : 'bg-[#003087] border-[#003087] shadow-sm'}`}>
                                                <span className="text-[11px] font-black italic text-white tracking-tighter">PayPal</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>}

                                {/* VIREMENT / WERO */}
                                <div 
                                    onClick={() => {
                                        setPaymentMethod('deferred');
                                        setCheckoutState('editing');
                                    }}
                                    className={`relative group p-[1.5px] rounded-[1.125rem] overflow-hidden cursor-pointer w-full transition-all`}
                                >
                                    {/* NEON LAYER - ONLY VISIBLE IF SELECTED */}
                                    {paymentMethod === 'deferred' && (
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
                                    )}

                                    {/* DEFAULT BORDER FALLBACK */}
                                    {paymentMethod !== 'deferred' && (
                                        <div className={`absolute inset-0 z-0 rounded-[1.125rem] border-2 transition-colors ${darkMode ? 'border-stone-800' : 'border-stone-200'}`} />
                                    )}

                                    {/* INNER CONTENT - OPAQUE MASKING (to hide the center of the wave) */}
                                    <div className={`relative z-10 w-full h-full p-4 rounded-2xl flex flex-col gap-6 transition-all ${paymentMethod === 'deferred' ? (darkMode ? 'bg-stone-900' : 'bg-white') : (darkMode ? 'bg-transparent group-hover:bg-white/5' : 'bg-transparent group-hover:bg-black/5')} backdrop-blur-md`}>
                                        
                                        {/* EN-TÊTE : ICONE + TITRE */}
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition-colors ${paymentMethod === 'deferred' ? (darkMode ? 'bg-stone-800 text-white' : 'bg-stone-900 text-white') : (darkMode ? 'bg-stone-800/50 text-stone-500' : 'bg-stone-100 text-stone-400')}`}>
                                                <Landmark size={22} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center">
                                                    <span className={`font-black text-base ${darkMode ? 'text-white' : 'text-stone-900'}`}>Virement</span>
                                                </div>
                                                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-0.5">Instructions via email</p>
                                            </div>
                                        </div>
                                        
                                        {/* LOGOS VIREMENT / WERO (SUR LEUR PROPRE LIGNE) */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {/* BANQUE TRADITIONNELLE */}
                                            <div className={`h-7 px-2.5 flex items-center gap-1.5 justify-center rounded-md border ${darkMode ? 'bg-stone-800 border-stone-700 text-stone-300' : 'bg-stone-100 border-stone-200 text-stone-600 shadow-sm'}`}>
                                                <Landmark size={12} />
                                                <span className="text-[10px] font-bold uppercase tracking-widest leading-none mt-[1px]">Virement</span>
                                            </div>
                                            <div className="h-7 px-1 flex items-center justify-center text-[9px] font-black uppercase tracking-[0.18em] text-stone-500">
                                                ou
                                            </div>
                                            {/* WERO */}
                                            <div className={`h-7 px-3 flex items-center justify-center rounded-md border overflow-hidden ${darkMode ? 'bg-[#002B5E] border-transparent text-white' : 'bg-gradient-to-tr from-[#002B5E] to-[#0A4795] border-transparent text-white shadow-sm'}`}>
                                                <span className="text-[12px] font-black lowercase tracking-tight leading-none">wero</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* BOUTON D'ACTION DÉPLACÉ DANS LA COLONNE DE DROITE */}
                        </div>

                        </div>

                    </div>

                    {/* COLONNE DROITE : RÉSUMÉ STICKY */}
                    <div className="relative w-full">
                        <div className="sticky top-24 space-y-6">
                            <div className={`p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden ${darkMode ? 'bg-stone-900' : 'bg-[#1a1a1a]'} text-white`}>
                                <div className="relative z-10">
                                    <h3 className="text-xl font-black mb-6 text-white">Résumé de la commande</h3>
                                    
                                    <div className="space-y-4 mb-8">
                                        {cartItems.map((item, index) => (
                                            <div key={item.id || index} className="flex justify-between items-start text-sm">
                                                <div className="flex flex-col max-w-[70%]">
                                                    <span className="text-stone-300 font-medium">{item.name}</span>
                                                    {normalizeCartQuantity(item.quantity) > 1 && (
                                                        <span className="text-xs text-stone-500 mt-0.5">
                                                            {normalizeCartQuantity(item.quantity)} × {item.price} €
                                                        </span>
                                                    )}
                                                    {(item.variant || item.woodType || item.size || Object.values(item.options || {}).join(', ')) && (
                                                        <span className="text-xs text-stone-500 mt-0.5">
                                                            {item.variant || item.woodType || item.size || Object.values(item.options || {}).join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="font-bold text-white tracking-tight">{getCartLineTotal(item)} €</span>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="border-t border-stone-800 pt-6 flex justify-between items-end">
                                        <span className="text-stone-400 text-[10px] font-black uppercase tracking-widest mb-[2px]">Total à payer</span>
                                        <span className="text-4xl lg:text-5xl font-black tracking-tighter text-white">{total} €</span>
                                    </div>
                                </div>
                                {/* Éclat décoratif en haut à droite */}
                                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                            </div>
                            
                            {/* BOUTON D'ACTION PREMIUM (Magnetic Spotlight & Layout Morph) */}
                            <div className="flex flex-col gap-4 items-center">
                                <PremiumActionBtn
                                    onClick={handleActionClick}
                                    disabled={!isFormValid || !isInfoValidated || requiresEmailVerification || !user || user.isAnonymous || cartItems.length === 0}
                                    isLoading={checkoutState === 'fetching_stripe' || checkoutState === 'processing_deferred'}
                                    darkMode={darkMode}
                                >
                                    {paymentMethod === 'stripe_elements' ? (
                                        <span>Procéder au paiement sécurisé</span>
                                    ) : (
                                        <span>Confirmer ma commande</span>
                                    )}
                                </PremiumActionBtn>

                                {paymentMethod === 'deferred' && (
                                    <div className={`w-full md:mt-8 md:min-h-[216px] rounded-[1.75rem] border p-4 md:p-5 flex flex-col justify-center ${darkMode ? 'bg-stone-900/35 border-stone-800/70' : 'bg-stone-50/90 border-stone-200/80'}`}>
                                        <p className={`text-center text-[10px] font-black uppercase tracking-[0.24em] ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>Après validation</p>
                                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className={`rounded-2xl p-4 border ${darkMode ? 'bg-stone-950/40 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
                                                <div className="min-h-[92px] flex flex-col justify-center">
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${darkMode ? 'bg-stone-800 text-stone-100' : 'bg-stone-900 text-white'}`}>
                                                        <Landmark size={17} />
                                                    </span>
                                                    <p className={`text-sm font-black uppercase leading-none ${darkMode ? 'text-white' : 'text-stone-900'}`}>IBAN</p>
                                                </div>
                                                <p className="mt-4 text-[11px] leading-snug font-semibold text-stone-500">Coordonnées bancaires du vendeur sur votre <span className="font-black text-white">page commande</span> du menu.</p>
                                                </div>
                                            </div>
                                            <div className={`rounded-2xl p-4 border ${darkMode ? 'bg-stone-950/40 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
                                                <div className="min-h-[92px] flex flex-col justify-center">
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${darkMode ? 'bg-stone-800 text-stone-100' : 'bg-stone-900 text-white'}`}>
                                                        <ReceiptText size={17} />
                                                    </span>
                                                    <p className={`text-sm font-black uppercase leading-none ${darkMode ? 'text-white' : 'text-stone-900'}`}>Facture</p>
                                                </div>
                                                <p className="mt-4 text-[11px] leading-snug font-semibold text-stone-500">Téléchargeable depuis votre <span className="font-black text-white">page commande</span> du menu.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>

        </div>

        {/* MODAL STRIPE (POP-UP) RENDU DANS UN PORTAL POUR ÉVITER LES BUGS Z-INDEX ET STACKING CONTEXT SUR IOS */}
        {checkoutState === 'ready_to_pay' && clientSecret && stripeElementsOptions && paymentMethod === 'stripe_elements' && createPortal(
            <div
                className="fixed inset-0 z-[99999] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300"
                style={{ background: 'rgba(0,0,0,0.82)' }}
                onClick={(e) => { if (e.target === e.currentTarget) handleClosePaymentModal(); }}
            >
                <div className={`w-full max-w-lg relative p-6 md:p-8 rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-300 max-h-[85vh] overflow-y-auto ios-modal-scroll custom-scrollbar ${darkMode ? 'bg-[#0a0a0a] ring-1 ring-white/5' : 'bg-white ring-1 ring-stone-200'}`} style={{ maxHeight: 'min(85dvh, 85vh)' }}>

                    {/* BOUTON FERMER (Hitbox élargie pour plus de précision) */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleClosePaymentModal();
                        }}
                        className={`absolute z-50 top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full transition-colors cursor-pointer ${darkMode ? 'hover:bg-white/10 text-stone-400 hover:text-white' : 'hover:bg-stone-100 text-stone-500 hover:text-stone-900'}`}
                        aria-label="Fermer le paiement"
                    >
                        <svg className="w-5 h-5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    
                    <div className="mb-6 pr-10">
                        <h3 className={`text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-stone-900'}`}>Paiement sécurisé.</h3>
                        <p className={`text-xs mt-1 font-medium ${darkMode ? 'text-stone-500' : 'text-stone-500'}`}>Finalisez votre transaction via Stripe.</p>
                    </div>

                    <Elements stripe={stripePromise} options={stripeElementsOptions}>
                        <CheckoutPaymentStep
                            total={total}
                            orderId={createdOrderId}
                            darkMode={darkMode}
                            shipping={customerPayload}
                            onPaymentSuccess={async (paymentIntent) => {
                                setCheckoutState('editing');
                                await onPlaceOrder({
                                    id: createdOrderId,
                                    shipping: customerPayload,
                                    paymentMethod: 'stripe_elements',
                                    total,
                                    paymentIntentId: paymentIntent.id
                                });
                            }}
                            onPaymentError={(err) => {
                                console.error("Payment error inline:", err);
                            }}
                        />
                    </Elements>
                </div>
            </div>,
            document.body
        )}

        {/* PORTAL — dropdown suggestions rendu à la racine du body */}
        {showSuggestions && suggestions.length > 0 && !dropdownPos.mobile && createPortal(
            /* ── DESKTOP : dropdown positionné sous l'input ── */
            <div
                style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
            >
                {renderAddressSuggestions()}
            </div>,
            document.body
        )}
        </>
    );
};

export default CheckoutView;
