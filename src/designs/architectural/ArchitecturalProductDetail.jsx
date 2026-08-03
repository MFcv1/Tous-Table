import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Box, ArrowRight, Trophy, Clock, X, Maximize2, ShoppingBag, ShoppingCart, TreePine, Sparkles, ShieldCheck, Heart, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { db, appId, functions } from '../../firebase/config';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getMillis } from '../../utils/time';
import SEO from '../../components/shared/SEO';
import { getProductPath, getShopProductPath, SITE_URL } from '../../utils/seoRoutes';


import { useLiveTheme } from '../../hooks/useLiveTheme';
import AnimatedPrice from '../../components/ui/AnimatedPrice';
import ShopProductCard from '../../components/shop/ShopProductCard';
import LazyYouTubeEmbed from '../../components/ui/LazyYouTubeEmbed';
import { lockPageScroll } from '../../utils/smoothScroll';

const RECOMMENDED_TUTORIALS = [
    { videoId: "ictKhF92-pY", label: "Comment appliquer Rubio Monocoat Oil Plus 2C sur un meuble", productMatch: "Rubio Monocoat" },
    { videoId: "EZ2w0DBLkTI", label: "Comment appliquer Osmo PolyX-Oil sur un meuble", productMatch: "Osmo Polyx" },
    { videoId: "KfHoHFA7Av8", label: "John Boos Mystery Oil & Board Cream — entretien planche", productMatch: "John Boos" }
];

const CARE_FEATURES = [
    { icon: TreePine, title: "Bois Massif Patiné", description: "Chaque pièce est sélectionnée avec soin et travaillée à la main dans notre atelier en Normandie." },
    { icon: Sparkles, title: "Pièce Unique", description: "Aucune pièce n'est reproduite. Vous investissez dans un meuble qui a une âme." },
    { icon: ShieldCheck, title: "Finition Naturelle", description: "Nos finitions respectent le bois et votre intérieur. Huiles et cires naturelles écoresponsables." },
    { icon: Heart, title: "Livraison Soignée", description: "Emballage sécurisé et livraison partout en France et pays frontaliers." }
];

const SHOW_AD_PLACEHOLDERS = import.meta.env.DEV || import.meta.env.VITE_SHOW_AD_PLACEHOLDERS === 'true';

const ProductDetailAdSlot = ({ className = "", orientation = "horizontal", darkMode = false }) => {
    if (!SHOW_AD_PLACEHOLDERS) return null;

    return (
        <div
            className={`flex shrink-0 items-center justify-center border border-dashed ${darkMode ? 'border-white/15 bg-white/[0.015] text-stone-500' : 'border-stone-300/70 bg-white/30 text-stone-500'} ${className}`}
            data-google-ad-slot={`product-detail-${orientation}`}
        >
            <div className="text-center">
                <p className="text-[7px] font-black uppercase tracking-[0.3em] opacity-45 lg:text-[8px]">Annonce</p>
                <p className="mt-1 font-serif text-xs italic opacity-80 lg:text-[13px]">Google Ads</p>
            </div>
        </div>
    );
};

const ProductImagePager = ({ count, activeIndex, className = "", darkMode = false, variant = "image" }) => {
    if (count <= 1) return null;
    const progress = `${((activeIndex + 1) / count) * 100}%`;
    const isSurface = variant === "surface";
    const compactShellClass = isSurface
        ? (darkMode ? "bg-black/45 text-white border-white/10" : "bg-white/80 text-stone-900 border-stone-200")
        : "bg-black/35 text-white border-white/10";
    const compactTrackClass = isSurface ? (darkMode ? "bg-white/20" : "bg-stone-900/15") : "bg-white/25";
    const compactFillClass = isSurface ? (darkMode ? "bg-white" : "bg-stone-900") : "bg-white";

    return (
        <div
            className={`flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-[10px] font-black tabular-nums leading-none shadow-xl backdrop-blur-md ${compactShellClass} ${className}`}
            onClick={(e) => e.stopPropagation()}
        >
            <span className="whitespace-nowrap">{activeIndex + 1}/{count}</span>
            <div className={`h-1 w-20 overflow-hidden rounded-full ${compactTrackClass}`}>
                <div className={`h-full rounded-full transition-all duration-300 ${compactFillClass}`} style={{ width: progress }} />
            </div>
        </div>
    );
};

const placeBidFunction = httpsCallable(functions, 'placeBid');
const wakeUpFunction = httpsCallable(functions, 'wakeUp');

const getStructuredDataPrice = (item) => {
    if (!item || item.priceOnRequest) return null;
    const rawPrice = item.currentPrice ?? item.startingPrice ?? item.price;
    const price = Number(rawPrice);
    return Number.isFinite(price) && price > 0 ? price : null;
};

const ArchitecturalProductDetail = ({ item, itemId, isCatalogResolving = false, user, onBack, onAddToCart, onOpenCart, onShowLogin, darkMode, setHeaderProps, cartItems = [], affiliateProducts = [], onOpenProductDetail }) => {
    const { palette } = useLiveTheme();
    const [activeImg, setActiveImg] = useState(0);
    const [imageSizes, setImageSizes] = useState({});
    const [bidLoading, setBidLoading] = useState(false);

    const [, setMsg] = useState(null);
    const [bidsHistory, setBidsHistory] = useState([]);
    const [activeBidInc, setActiveBidInc] = useState(null);
    const [bidProgress, setBidProgress] = useState(0);
    const [tutorialIndex, setTutorialIndex] = useState(0);

    // LIGHTBOX STATE
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);

    useEffect(() => {
        if (!isLightboxOpen) return undefined;
        return lockPageScroll();
    }, [isLightboxOpen]);

    // TOUCH SWIPE STATE (Mobile)
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const minSwipeDistance = 50;

    const onTouchStart = (e) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            setActiveImg(prev => prev === images.length - 1 ? 0 : prev + 1);
        }
        if (isRightSwipe) {
            setActiveImg(prev => prev === 0 ? images.length - 1 : prev - 1);
        }
    };

    // WAKE UP CLOUD FUNCTIONS (Anti-Cold Start)
    useEffect(() => {
        if (item?.auctionActive) {
            wakeUpFunction().catch(() => { }); // Silent ping
        }
    }, [item?.id]);

    // SYNC WITH GLOBAL HEADER (Clear tabs on detail view)
    useEffect(() => {
        if (setHeaderProps) {
            setHeaderProps(null);
        }
    }, [setHeaderProps]);

    // Hooks
    const images = useMemo(() => {
        if (!item) return [];
        const imgs = item.images || (item.imageUrl ? [item.imageUrl] : []);
        return Array.isArray(imgs) ? imgs : [item.imageUrl || ""];
    }, [item]);
    const activeImageSrc = images[activeImg] || images[0] || "";
    const [displayedImageSrc, setDisplayedImageSrc] = useState(activeImageSrc);
    const [isImageDecoding, setIsImageDecoding] = useState(false);
    const displayedImageRef = useRef(null);
    const imagePointerStartRef = useRef(null);
    const rememberImageSize = (src, naturalWidth, naturalHeight, aliasSrc = src) => {
        if (!src || !naturalWidth || !naturalHeight) return;
        setImageSizes(prev => {
            const nextSize = { width: naturalWidth, height: naturalHeight };
            if (
                prev[src]?.width === naturalWidth &&
                prev[src]?.height === naturalHeight &&
                prev[aliasSrc]?.width === naturalWidth &&
                prev[aliasSrc]?.height === naturalHeight
            ) {
                return prev;
            }
            return { ...prev, [src]: nextSize, [aliasSrc]: nextSize };
        });
    };
    const activeImageSize = imageSizes[activeImageSrc];
    const displayedImageSize = imageSizes[displayedImageSrc];
    const renderedImageSrc = displayedImageSrc || (activeImageSize ? activeImageSrc : "");
    const frameImageSize = isImageDecoding
        ? (displayedImageSize || activeImageSize)
        : (activeImageSize || displayedImageSize);
    const isImageFrameReady = Boolean(frameImageSize);
    const activeImageNaturalRatio = frameImageSize ? frameImageSize.width / frameImageSize.height : 4 / 3;
    const isActivePortrait = frameImageSize ? frameImageSize.height > frameImageSize.width * 1.08 : false;
    const isActiveUltraPortrait = isActivePortrait && activeImageNaturalRatio < 0.68;
    const activeImageFrameRatio = isActiveUltraPortrait ? 0.68 : activeImageNaturalRatio;
    const activeImageAspectRatio = frameImageSize ? `${activeImageFrameRatio} / 1` : (isActivePortrait ? "4 / 5" : "4 / 3");
    const activeImageRatio = frameImageSize ? activeImageFrameRatio : (isActivePortrait ? 3 / 4 : 4 / 3);
    const imageFrameClassName = isActivePortrait
        ? `tat-product-image-frame tat-product-image-frame--portrait ${isActiveUltraPortrait ? 'tat-product-image-frame--ultra-portrait ' : ''}relative w-full mx-auto rounded-[0.875rem] md:rounded-[1.125rem] overflow-hidden shadow-2xl shadow-black/20 group bg-transparent aspect-[3/4] sm:max-w-[560px] md:max-w-[680px] lg:h-full lg:max-h-[min(590px,calc(100vh-158px))] lg:w-auto lg:max-w-full lg:aspect-auto xl:max-h-[min(620px,calc(100vh-158px))]`
        : "tat-product-image-frame tat-product-image-frame--landscape relative w-full mx-auto rounded-[0.875rem] md:rounded-[1.125rem] overflow-hidden shadow-2xl shadow-black/20 group bg-transparent aspect-[3/4] sm:max-w-[640px] md:max-w-[760px] lg:h-auto lg:max-h-[min(590px,calc(100vh-158px))] lg:max-w-[min(640px,100%)] lg:aspect-auto xl:max-h-[min(620px,calc(100vh-158px))] xl:max-w-[min(700px,100%)]";
    const imageObjectClassName = isActivePortrait
        ? "w-full h-full object-cover transition-[opacity,transform] duration-700 ease-in-out"
        : "w-full h-full object-cover transition-[opacity,transform] duration-700 ease-in-out";
    const handleMainImageLoad = (event) => {
        const { naturalWidth, naturalHeight, currentSrc, src } = event.currentTarget;
        const loadedSrc = currentSrc || src;
        rememberImageSize(loadedSrc, naturalWidth, naturalHeight, displayedImageSrc || activeImageSrc);
    };
    const handleImagePointerDown = (event) => {
        if (event.pointerType === 'touch') return;
        imagePointerStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            scrollY: window.scrollY
        };
    };

    const shouldIgnoreImageClick = (event) => {
        const start = imagePointerStartRef.current;
        imagePointerStartRef.current = null;
        if (!start) return false;

        const pointerMoved = Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8;
        const pageScrolled = Math.abs(window.scrollY - start.scrollY) > 2;
        return pointerMoved || pageScrolled;
    };

    useEffect(() => {
        if (!activeImageSrc) {
            setDisplayedImageSrc("");
            setIsImageDecoding(false);
            return undefined;
        }

        if (activeImageSrc === displayedImageSrc && activeImageSize) {
            setIsImageDecoding(false);
            return undefined;
        }

        if (activeImageSrc !== displayedImageSrc && activeImageSize) {
            setDisplayedImageSrc(activeImageSrc);
            setIsImageDecoding(false);
            return undefined;
        }

        let cancelled = false;
        const nextImage = new Image();
        nextImage.decoding = 'async';

        const shouldSwapDisplayedImage = activeImageSrc !== displayedImageSrc;
        const reveal = () => {
            if (cancelled) return;
            rememberImageSize(
                nextImage.currentSrc || activeImageSrc,
                nextImage.naturalWidth,
                nextImage.naturalHeight,
                activeImageSrc
            );
            requestAnimationFrame(() => {
                if (cancelled) return;
                if (shouldSwapDisplayedImage) {
                    setDisplayedImageSrc(activeImageSrc);
                }
                setIsImageDecoding(false);
            });
        };

        setIsImageDecoding(true);
        nextImage.src = activeImageSrc;

        if (nextImage.decode) {
            nextImage.decode().then(reveal).catch(() => {
                if (nextImage.complete) reveal();
            });
        } else {
            nextImage.onload = reveal;
            nextImage.onerror = reveal;
        }

        if (nextImage.complete && nextImage.naturalWidth > 0) {
            reveal();
        }

        return () => {
            cancelled = true;
        };
    }, [activeImageSrc, displayedImageSrc, activeImageSize]);

    const collectionName = useMemo(() => {
        if (!item) return 'furniture';
        return item.collectionName || ((item.id && item.id.includes('board')) ? 'cutting_boards' : 'furniture');
    }, [item]);
    const isCuttingBoard = collectionName === 'cutting_boards';
    const deliveryEstimateMessage = isCuttingBoard
        ? 'Frais de livraison estimés entre 0,99 et 5 euros par Mondial Relay, à prévoir en plus du prix catalogue.'
        : 'Frais de livraison indicatifs selon le meuble et le trajet : à partir de 20 euros pour un très petit meuble, petite commode ou meuble de taille moyenne entre 60 et 80 euros, table Ifs-Paris autour de 150 euros, table Ifs-Marseille à partir de 250 euros.';
    const priceDeliveryNote = isCuttingBoard
        ? 'Frais de port à prévoir : 0,99 à 5 € par Mondial Relay.'
        : (
            <>
                Frais de port : dès 20 € très petit meuble, 60-80 € meuble moyen, 150 € table Ifs-Paris,
                <br className="hidden sm:block" />
                <span className="sm:hidden"> </span>
                250 € table Ifs-Marseille.
            </>
        );

    // Preload
    useEffect(() => {
        if (!images || images.length === 0) return;
        let cancelled = false;
        images.forEach((src) => {
            if (!src) return;
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => {
                if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
                const loadedSrc = img.currentSrc || src;
                setImageSizes(prev => {
                    const nextSize = { width: img.naturalWidth, height: img.naturalHeight };
                    if (
                        prev[src]?.width === nextSize.width &&
                        prev[src]?.height === nextSize.height &&
                        prev[loadedSrc]?.width === nextSize.width &&
                        prev[loadedSrc]?.height === nextSize.height
                    ) {
                        return prev;
                    }
                    return { ...prev, [src]: nextSize, [loadedSrc]: nextSize };
                });
            };
            img.src = src;
        });
        return () => {
            cancelled = true;
        };
    }, [images]);

    // Auction Logic
    useEffect(() => {
        if (!item?.auctionActive) return;
        try {
            const q = query(
                collection(db, 'artifacts', appId, 'public', 'data', collectionName, item.id, 'bids'),
                orderBy('timestamp', 'desc'),
                limit(10)
            );
            return onSnapshot(q, (snap) => setBidsHistory(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        } catch (err) {
            console.error("Error subscribing to bids:", err);
        }
    }, [item?.id, collectionName, item?.auctionActive]);

    const isAuctionOver = item?.auctionActive && getMillis(item.auctionEnd) < Date.now();
    const isWinner = isAuctionOver && user && item?.lastBidderId === user.uid;

    const isInCart = cartItems.some(cartItem => cartItem.originalId === item?.id);

    // ── Fly-to-Cart Animation ──
    const [flyToCartAnim, setFlyToCartAnim] = useState(null); // { src, startRect, endRect }
    const [flyPhase, setFlyPhase] = useState('idle'); // 'idle' | 'flying' | 'done'
    const flyTimeoutRef = useRef(null);

    const handleFlyToCart = async (e) => {
        // 1) Sauvegarder la position de départ (image produit, ou bouton sur mobile)
        const isMobile = window.innerWidth < 1024;
        const imgEl = displayedImageRef.current;
        const cartEl = document.querySelector('[data-cart-target]');
        const buttonEl = e?.currentTarget;

        if (!imgEl || !cartEl) {
            // Fallback : ajouter normalement
            const ok = await onAddToCart(item);
            if (ok) onOpenCart();
            return;
        }

        const startRect = (isMobile && buttonEl) ? buttonEl.getBoundingClientRect() : imgEl.getBoundingClientRect();
        const endRect = cartEl.getBoundingClientRect();
        const imgSrc = imgEl.src;

        // 2) Ajouter au panier (Firestore)
        const ok = await onAddToCart(item);
        if (!ok) return;

        // 3) Lancer l'animation
        setFlyToCartAnim({ src: imgSrc, startRect, endRect });
        // Force reflow before starting transition
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setFlyPhase('flying');
            });
        });

        // 4) Cleanup après l'animation
        clearTimeout(flyTimeoutRef.current);
        flyTimeoutRef.current = setTimeout(() => {
            setFlyPhase('done');
            // Petit pulse sur l'icône panier
            cartEl.classList.add('scale-125');
            setTimeout(() => {
                cartEl.classList.remove('scale-125');
                setFlyToCartAnim(null);
                setFlyPhase('idle');
            }, 300);
        }, 850); // Durée de l'animation
    };

    useEffect(() => {
        return () => clearTimeout(flyTimeoutRef.current);
    }, []);

    // Recommended care products: 4 best oils (huiles), expert tier first
    const recommendedProducts = useMemo(() => {
        if (!affiliateProducts || affiliateProducts.length === 0) return [];
        const oils = affiliateProducts.filter(p => p.category === 'huiles');
        const sorted = [...oils].sort((a, b) => {
            const tierOrder = { expert: 3, premium: 2, essentiel: 1 };
            const aTier = tierOrder[a.tier] || 0;
            const bTier = tierOrder[b.tier] || 0;
            if (bTier !== aTier) return bTier - aTier;
            return (Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
        });
        return sorted.slice(0, 4);
    }, [affiliateProducts]);

    const currentTutorial = RECOMMENDED_TUTORIALS[tutorialIndex];

    const productSchema = useMemo(() => {
        if (!item) return null;
        const productUrl = `${SITE_URL}${getProductPath(item)}`;
        const price = getStructuredDataPrice(item);
        const isAvailable = !item.sold && Number(item.stock ?? 1) > 0;
        const categoryName = collectionName === 'cutting_boards' ? 'Planches a decouper anciennes' : 'Meubles anciens';
        const categoryUrl = collectionName === 'cutting_boards' ? '/planches-a-decouper-anciennes' : '/meubles-anciens';
        const graph = [{
                "@type": "BreadcrumbList",
                "@id": `${productUrl}#breadcrumb`,
                "itemListElement": [
                    { "@type": "ListItem", "position": 1, "name": "Accueil", "item": `${SITE_URL}/` },
                    { "@type": "ListItem", "position": 2, "name": categoryName, "item": `${SITE_URL}${categoryUrl}` },
                    { "@type": "ListItem", "position": 3, "name": item.name, "item": productUrl }
                ]
            }];

        if (price) {
            graph.unshift({
            "@type": "Product",
            "@id": `${productUrl}#product`,
            "name": item.name,
            "image": images,
            "description": item.description || `${item.name} selectionne par Tous a Table Made in Normandie.`,
            "sku": item.reference || item.id,
            "category": categoryName,
            "material": item.material || undefined,
            "brand": { "@type": "Brand", "name": "Tous à Table Made in Normandie" },
            "offers": {
                "@type": "Offer",
                "@id": `${productUrl}#offer`,
                "url": productUrl,
                "priceCurrency": "EUR",
                "price": price,
                "availability": isAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                "itemCondition": "https://schema.org/UsedCondition",
                "seller": { "@type": "FurnitureStore", "name": "Tous a Table Made in Normandie", "url": SITE_URL },
            }
            });
        }

        return {
            "@context": "https://schema.org",
            "@graph": graph
        };
    }, [item, images, collectionName]);

    const handleQuickBid = async (inc) => {
        if (bidLoading) return;
        if (!user) {
            onShowLogin();
            return;
        }
        setBidLoading(true);
        setActiveBidInc(inc);
        setBidProgress(0);

        // Simulation de progression (0 -> 90% en 1s)
        const startTime = Date.now();
        const duration = 1200; // Un peu plus long pour laisser le temps au serveur
        const timer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(90, Math.floor((elapsed / duration) * 90));
            setBidProgress(progress);
            if (progress >= 90) clearInterval(timer);
        }, 50);

        // Clé d'idempotence (Unique par clic pour éviter les doublons techniques)
        const idempotencyKey = `bid_${user.uid}_${item.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            const result = await placeBidFunction({
                itemId: item.id,
                collectionName: collectionName,
                increment: inc,
                idempotencyKey
            });
            if (result.data.success) {
                clearInterval(timer);
                setBidProgress(100);
                setMsg({ type: 'success', text: `Offre validée !` });
            }
        } catch (e) {
            clearInterval(timer);
            setBidProgress(0);
            setMsg({ type: 'error', text: e.message || 'Erreur lors de l\'enchère.' });
        } finally {
            // On laisse la barre à 100% un court instant pour la satisfaction visuelle
            setTimeout(() => {
                setBidLoading(false);
                setActiveBidInc(null);
                setBidProgress(0);
            }, 500);
            setTimeout(() => setMsg(null), 3000);
        }
    };


    if (!item && isCatalogResolving) {
        const requestedPath = typeof window !== 'undefined'
            ? window.location.pathname
            : (itemId ? `/produit/${itemId}` : '/meubles-anciens');

        return (
            <>
            <SEO
                title="Meuble ancien"
                description="Chargement de la fiche meuble ancien Tous a Table."
                url={requestedPath}
            />
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 pt-32 text-center animate-in fade-in duration-500">
                <div className="p-6 rounded-full bg-stone-100 mb-4 animate-pulse">
                    <Box size={40} className="text-stone-400" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest">Chargement</h2>
                </div>
            </div>
            </>
        );
    }

    if (!item) return (
        <>
        <SEO
            title="Produit introuvable"
            description="Cette fiche produit n'est plus disponible."
            url="/meubles-anciens"
            robots="noindex,follow,noarchive"
        />
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 pt-32 text-center animate-in fade-in duration-500">
            <div className="p-6 rounded-full bg-stone-100 mb-4 animate-pulse">
                <Box size={40} className="text-stone-400" />
            </div>
            <div className="space-y-2">
                <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest">Produit Introuvable</h2>
            </div>
            <button onClick={onBack} className="px-8 py-3 bg-stone-900 text-white uppercase tracking-widest text-xs font-bold">Retour</button>
        </div>
        </>
    );

    // --- RENDER ARCHITECTURAL ---
    const mainContent = (
        <div className={`min-h-screen transition-colors duration-700 ${darkMode ? 'bg-[#050605] text-stone-100' : 'bg-[linear-gradient(180deg,#f8f2e8_0%,#fffaf2_48%,#f1e3cf_100%)] text-stone-950'}`}>
            <SEO
                title={item.name}
                description={item.description}
                image={images[0]}
                url={getProductPath(item)}
                type="product"
                schema={productSchema}
            />
            {/* ArchitecturalHeader removed here, handled globally in App.jsx */}

            <div className="tat-product-hero-shell w-full min-h-screen lg:min-h-0 lg:h-[calc(100vh-78px)] flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,31vw)] xl:grid-cols-[minmax(0,1fr)_minmax(400px,29vw)] 2xl:grid-cols-[minmax(0,1fr)_minmax(440px,28vw)] relative pt-4 lg:pt-0 lg:overflow-hidden">
                {/* LEFT COLUMN: IMAGE GALLERY (Natural Scroll) */}
                <div className="w-full flex flex-col p-6 sm:px-8 sm:pt-16 sm:pb-8 md:pt-20 lg:px-8 lg:pt-2 lg:pb-6 h-auto lg:h-full lg:min-w-0 lg:gap-2 xl:px-10">
                    {/* BACK BUTTON (Desktop & Mobile - Above Image) */}
                    <div className="relative lg:flex lg:h-[92px] lg:items-center lg:justify-center xl:h-[98px]">
                        <button onClick={onBack} className={`flex w-max items-center gap-2 whitespace-nowrap font-black text-[9px] uppercase tracking-[0.16em] transition-all hover:opacity-100 mb-6 lg:absolute lg:left-0 lg:top-1/2 lg:mb-0 lg:-translate-y-1/2 lg:text-[8px] xl:text-[9px] group ${darkMode ? 'text-white/75' : 'text-stone-900/75'}`}>
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all lg:h-7 lg:w-7 ${darkMode ? 'border-white/10 group-hover:bg-white/10' : 'border-stone-200 group-hover:bg-stone-100'}`}>
                                <ChevronLeft size={14} />
                            </div>
                            <span>Retour</span>
                        </button>
                        <ProductDetailAdSlot className="hidden w-full lg:flex lg:h-[76px] lg:w-[min(728px,calc(100%-170px))] lg:max-w-[728px] xl:h-[84px] xl:w-[min(900px,calc(100%-190px))] xl:max-w-[900px]" orientation="top" darkMode={darkMode} />
                    </div>

                    {/* ROUNDED IMAGE CONTAINER (Gallery Style - Full Bleed) */}
                    <div className="tat-product-media-row lg:flex lg:min-h-0 lg:flex-1 lg:max-h-[min(620px,calc(100vh-166px))] lg:items-stretch lg:justify-center lg:gap-3 xl:gap-4">
                    <ProductDetailAdSlot className="hidden h-full w-[72px] lg:flex xl:w-[88px] 2xl:w-[96px]" orientation="left" darkMode={darkMode} />
                    <div className="tat-product-gallery-stage group relative flex min-w-0 flex-1 items-center justify-center">
                        {images.length > 1 && (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setActiveImg(prev => prev === 0 ? images.length - 1 : prev - 1); }}
                                    className="tat-product-gallery-nav tat-product-gallery-nav--prev hidden md:flex absolute top-1/2 left-3 xl:left-5 -translate-y-1/2 w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer drop-shadow-md bg-black/20 backdrop-blur-md rounded-full hover:bg-black/50 items-center justify-center outline-none ring-0 focus:outline-none focus:ring-0 z-30"
                                >
                                    <ChevronLeft size={24} strokeWidth={2} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setActiveImg(prev => prev === images.length - 1 ? 0 : prev + 1); }}
                                    className="tat-product-gallery-nav tat-product-gallery-nav--next hidden md:flex absolute top-1/2 right-3 xl:right-5 -translate-y-1/2 w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer drop-shadow-md bg-black/20 backdrop-blur-md rounded-full hover:bg-black/50 items-center justify-center outline-none ring-0 focus:outline-none focus:ring-0 z-30"
                                >
                                    <ChevronRight size={24} strokeWidth={2} />
                                </button>
                            </>
                        )}
                    <div
                        className={imageFrameClassName}
                        style={{
                            aspectRatio: activeImageAspectRatio,
                            '--tat-active-image-ratio': activeImageRatio,
                            opacity: isImageFrameReady ? 1 : 0,
                            pointerEvents: isImageFrameReady ? undefined : 'none'
                        }}
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                        onPointerDown={handleImagePointerDown}
                        onClick={(e) => {
                            if (shouldIgnoreImageClick(e)) return;
                            // Standard Navigation on Click (Left/Right zones)
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            if (x < rect.width / 2) {
                                setActiveImg(prev => prev === 0 ? images.length - 1 : prev - 1);
                            } else {
                                setActiveImg(prev => prev === images.length - 1 ? 0 : prev + 1);
                            }
                        }}
                    >

                        {/* Main Picture (Object Cover - No Margins) */}
                        {renderedImageSrc && (
                            <img
                                ref={displayedImageRef}
                                key={renderedImageSrc}
                                src={renderedImageSrc}
                                className={`${imageObjectClassName} ${isImageFrameReady ? 'opacity-100' : 'opacity-0'} select-none`}
                                alt={item.name}
                                onLoad={handleMainImageLoad}
                                draggable={false}
                            />
                        )}

                        <ProductImagePager
                            count={images.length}
                            activeIndex={activeImg}
                            onSelect={setActiveImg}
                            className="absolute bottom-8 left-1/2 z-20 -translate-x-1/2"
                        />

                        {/* HINT: Click to Expand (With Luminous Ripple) */}
                        <div className="absolute top-4 right-4 md:top-6 md:right-6 z-30 transition-all duration-500">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsLightboxOpen(true);
                                }}
                                className="relative flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-black/20 backdrop-blur-md border border-white/10 hover:bg-black/40 transition-all active:scale-95 text-white shadow-xl"
                            >
                                {/* Ripple Effect (Liseret Lumineux) */}
                                <span className="absolute inset-0 rounded-full border border-white/60 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite] opacity-50"></span>
                                <Maximize2 className="relative z-10 w-4 h-4 md:w-5 md:h-5" />
                            </button>
                        </div>
                    </div>
                    </div>
                    <ProductDetailAdSlot className="hidden h-full w-[72px] lg:flex xl:w-[88px] 2xl:w-[96px]" orientation="right" darkMode={darkMode} />
                    </div>
                </div>

                {/* --- LIGHTBOX FULLSCREEN (PREMIUM ZOOM) --- */}
                {isLightboxOpen && (
                    <div className={`fixed inset-0 z-[3000] flex items-center justify-center animate-in fade-in duration-300 ${darkMode ? 'bg-[#0A0A0A]' : 'bg-[#FAFAF9]'}`}>

                        {/* CONTROLS */}
                        <button
                            onClick={() => setIsLightboxOpen(false)}
                            className={`absolute top-6 right-6 z-[3100] w-12 h-12 flex items-center justify-center rounded-full transition-all shadow-xl border ${darkMode ? 'text-white border-white/20 bg-white/10 hover:bg-white/20' : 'text-stone-900 border-stone-200 bg-white hover:bg-stone-50'}`}
                        >
                            <X size={24} strokeWidth={2} />
                        </button>
                        <div className={`absolute top-10 left-8 z-[3100] text-[10px] font-black uppercase tracking-[0.4em] flex items-center gap-4 ${darkMode ? 'text-white/40' : 'text-stone-950/40'}`}>
                            <span>{activeImg + 1} / {images.length}</span>
                        </div>

                        {/* NAVIGATION (Arrows - Refined & Clearer) */}
                        {images.length > 1 && (
                            <>
                                <button className={`absolute left-0 md:left-6 top-1/2 -translate-y-1/2 p-8 transition-all z-[3100] group active:scale-95 hidden md:block`}
                                    onClick={(e) => { e.stopPropagation(); setActiveImg(prev => prev === 0 ? images.length - 1 : prev - 1); }}>
                                    <ChevronLeft size={40} strokeWidth={1} className={`transition-all duration-500 group-hover:scale-110 ${darkMode ? 'text-white/50 group-hover:text-white' : 'text-stone-900/50 group-hover:text-stone-900'}`} />
                                </button>
                                <button className={`absolute right-0 md:right-6 top-1/2 -translate-y-1/2 p-8 transition-all z-[3100] group active:scale-95 hidden md:block`}
                                    onClick={(e) => { e.stopPropagation(); setActiveImg(prev => prev === images.length - 1 ? 0 : prev + 1); }}>
                                    <ChevronRight size={40} strokeWidth={1} className={`transition-all duration-500 group-hover:scale-110 ${darkMode ? 'text-white/50 group-hover:text-white' : 'text-stone-900/50 group-hover:text-stone-900'}`} />
                                </button>
                            </>
                        )}

                        <ProductImagePager
                            count={images.length}
                            activeIndex={activeImg}
                            onSelect={setActiveImg}
                            className="absolute bottom-12 left-1/2 z-[3100] -translate-x-1/2 md:bottom-20"
                            darkMode={darkMode}
                            variant="surface"
                        />


                        {/* MAIN IMAGE CONTAINER */}
                        <div
                            className="w-full h-full flex items-center justify-center overflow-hidden touch-none"
                            onTouchStart={onTouchStart}
                            onTouchMove={onTouchMove}
                            onTouchEnd={onTouchEnd}
                        >
                            <img
                                key={displayedImageSrc}
                                src={displayedImageSrc}
                                alt="Detail"
                                className="max-w-[95%] max-h-[92vh] object-contain transition-transform duration-300 animate-in zoom-in-95 pointer-events-none opacity-100 select-none"
                                draggable={false}
                            />
                        </div>
                    </div>
                )}

                {/* RIGHT COLUMN: NATURAL SCROLL (Fix Overflow) */}
                <div className="w-full px-6 py-12 sm:px-8 sm:py-10 md:px-10 lg:pl-6 lg:pr-8 xl:pl-8 xl:pr-10 lg:py-5 flex flex-col justify-center min-h-[50vh] lg:h-full lg:min-w-0 lg:overflow-hidden">
                    <div className="max-w-[560px] ml-auto mr-0 w-full h-full flex flex-col justify-center sm:mx-auto sm:max-w-[560px] md:max-w-[640px] lg:ml-auto lg:mr-0 lg:max-w-[420px] lg:min-h-0 xl:max-w-[460px]">

                        {/* Header */}
                        <div className="space-y-4 mb-5 lg:space-y-4 lg:mb-5">
                            <div className="flex gap-2">
                                <span className="px-3 py-1 text-[9px] font-black uppercase tracking-widest border border-stone-200 dark:border-stone-800 bg-transparent text-stone-500">Lot n°{item.id.substring(0, 4)}</span>
                            </div>
                            <h1 className="text-4xl md:text-[42px] lg:text-[38px] xl:text-[44px] font-black tracking-tighter leading-none font-serif font-normal italic">{item.name}</h1>

                        </div>


                        {/* Description (Matched to Red Brace ~260px) */}
                        <div className="p-0 border-l pl-6 border-stone-200 dark:border-stone-800 max-h-[clamp(120px,20vh,190px)] overflow-y-auto custom-scrollbar pr-4 mb-0 md:max-h-none md:overflow-visible lg:max-h-[clamp(150px,24vh,238px)] lg:overflow-y-auto lg:pl-5">
                            <p className="whitespace-pre-wrap font-serif text-base lg:text-sm xl:text-base font-medium leading-relaxed xl:leading-relaxed" style={{ color: darkMode ? '#d6d3d1' : '#000000', opacity: 1 }}>
                                {item.description}
                            </p>
                        </div>

                        {/* Price & Actions */}
                        <div className="px-0 pb-0 pt-0 bg-transparent">
                            {/* NEW COMPACT LAYOUT: PRICE (Left) + SPECS HORIZONTAL (Right) */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-5 md:mb-6 pt-5 gap-5 sm:gap-6 lg:mb-4 lg:pt-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Prix Actuel</p>
                                    <p className={`${item.priceOnRequest ? 'text-3xl md:text-4xl lg:text-3xl xl:text-4xl' : 'text-5xl md:text-6xl lg:text-[44px] xl:text-[50px]'} font-black tracking-tighter font-serif italic font-normal leading-none`}>
                                        {item.priceOnRequest ? (
                                            "Prix sur demande"
                                        ) : (
                                            <><AnimatedPrice amount={item.currentPrice || item.startingPrice || 0} /> €</>
                                        )}
                                    </p>
                                    <p className={`mt-3 max-w-[300px] text-[10px] sm:text-[11px] font-medium leading-snug opacity-55 ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>
                                        {priceDeliveryNote}
                                    </p>
                                </div>
                                <div className={`grid w-full grid-cols-2 gap-4 border-t pt-4 text-left opacity-60 sm:w-auto sm:flex sm:items-end sm:gap-6 sm:border-0 sm:pt-0 sm:text-right md:gap-8 sm:pb-1 lg:gap-5 ${darkMode ? 'border-white/10' : 'border-stone-200'}`}>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-50">Matières</p>
                                        <p className="text-xs font-bold">{item.material || "Non spécifié"}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-50">Dimensions</p>
                                        <p className="font-mono text-xs">{item.width ? `${item.width} x ${item.depth} x ${item.height} cm` : item.dimensions}</p>
                                    </div>
                                </div>
                            </div>

                            <ProductDetailAdSlot
                                className="mx-auto mb-6 mt-1 h-[88px] w-full max-w-[300px] rounded-sm sm:h-[92px] sm:max-w-[560px] md:max-w-[640px] lg:hidden"
                                orientation="mobile"
                                darkMode={darkMode}
                            />

                            {item.auctionActive && !isAuctionOver ? (
                                <div className="space-y-8">
                                    {/* Action Buttons */}
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-black uppercase opacity-40">Placer une enchère rapide</p>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[10, 50, 100].map(inc => {
                                                const isActive = activeBidInc === inc;
                                                return (
                                                    <button
                                                        key={inc}
                                                        onClick={() => handleQuickBid(inc)}
                                                        disabled={bidLoading}
                                                        className={`relative py-4 border font-black text-xs transition-all duration-300 flex items-center justify-center overflow-hidden
                                                            ${isActive ? 'bg-black text-white border-black' : 'hover:bg-black hover:text-white border-stone-200 dark:border-stone-700 bg-transparent'}
                                                            ${bidLoading && !isActive ? 'opacity-30 grayscale cursor-not-allowed' : 'opacity-100'}
                                                        `}
                                                    >
                                                        {isActive ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                                                <span>OFFRE...</span>
                                                            </div>
                                                        ) : (
                                                            <span>+{inc}€</span>
                                                        )}

                                                        {/* Subtle progress bar effect */}
                                                        {isActive && (
                                                            <div
                                                                className="absolute bottom-0 left-0 h-[2px] w-full bg-white/40 origin-left transition-transform duration-300 ease-out"
                                                                style={{ transform: `scaleX(${bidProgress / 100})` }}
                                                            ></div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* LIVE AUCTION HISTORY (NEW) */}
                                    <div className="border-t border-stone-200 dark:border-stone-800 pt-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                                En direct
                                            </p>
                                            <span className="text-[9px] opacity-30">{bidsHistory.length} offres</span>
                                        </div>

                                        <div className="max-h-[120px] overflow-y-auto custom-scrollbar space-y-3">
                                            {bidsHistory.length === 0 ? (
                                                <p className="text-xs italic opacity-30 text-center py-2">Aucune offre pour le moment. Soyez le premier !</p>
                                            ) : (
                                                bidsHistory.map((bid, i) => (
                                                    <div key={bid.id || i} className="flex justify-between items-center text-xs group">
                                                        <div className="flex items-center gap-3">
                                                            <span className="font-mono opacity-30 text-[10px]">
                                                                {bid.timestamp ? new Date(bid.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                            </span>
                                                            <span className={`font-bold ${i === 0 ? 'text-amber-600 dark:text-amber-500' : 'opacity-60'}`}>
                                                                {bid.bidderName || 'Anonyme'}
                                                            </span>
                                                        </div>
                                                        <span className={`font-mono font-bold ${i === 0 ? 'text-amber-600 dark:text-amber-500' : 'opacity-60'}`}>
                                                            {bid.amount} €
                                                        </span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : !item.auctionActive ? (
                                isInCart ? (
                                    <button onClick={onOpenCart} className="w-full py-5 text-white font-black text-[11px] uppercase tracking-[0.18em] transition-all flex items-center justify-center gap-4 bg-emerald-600 hover:bg-emerald-700 shadow-lg lg:py-4 lg:text-[10px]" style={{ borderRadius: palette.borderRadius }}>
                                        <Check size={16} strokeWidth={2.5} />
                                        <span>Voir ma sélection</span>
                                        <ShoppingBag size={16} />
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleFlyToCart}
                                        disabled={flyPhase !== 'idle'}
                                        className={`w-full py-5 text-white font-black text-[11px] uppercase tracking-[0.18em] transition-all flex items-center justify-center gap-4 rounded-none shadow-lg lg:py-4 lg:text-[10px] ${
                                            flyPhase !== 'idle'
                                                ? 'bg-emerald-600 cursor-wait'
                                                : 'bg-black dark:bg-white dark:text-black hover:bg-stone-800 dark:hover:bg-stone-100'
                                        }`}
                                    >
                                        <ShoppingCart size={16} />
                                        <span>{flyPhase !== 'idle' ? 'Ajouté !' : 'Ajouter au panier'}</span>
                                    </button>
                                )
                            ) : !isWinner ? (
                                <div className="text-center py-12 px-6 space-y-4 border border-stone-200 dark:border-stone-800"
                                    style={{ borderRadius: palette.borderRadius }}>
                                    <div className="flex justify-center mb-2 opacity-20">
                                        <Clock size={40} />
                                    </div>
                                    <p className="font-serif italic text-xl text-stone-400">Cette vente est terminée</p>
                                    <p className="text-[10px] uppercase font-black tracking-widest opacity-30">Clôture des enchères</p>
                                </div>
                            ) : (
                                <div className="relative overflow-hidden p-10 text-center space-y-6 animate-in zoom-in-95 duration-1000 shadow-2xl shadow-emerald-500/10"
                                    style={{
                                        backgroundColor: palette.isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.03)',
                                        border: `1px solid ${palette.statusValid}40`,
                                        borderRadius: palette.borderRadius
                                    }}>
                                    <div className="flex justify-center">
                                        <div className="p-5 rounded-full animate-bounce shadow-xl"
                                            style={{ backgroundColor: palette.statusValid, color: '#fff' }}>
                                            <Trophy size={32} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-3xl font-black tracking-tighter font-serif italic" style={{ color: palette.statusValid }}>
                                            Félicitations !
                                        </h3>
                                        <p className="text-sm font-medium opacity-80 leading-relaxed max-w-[300px] mx-auto">
                                            Vous avez remporté cette enchère.<br />
                                            <span className="text-[10px] uppercase font-black tracking-widest mt-4 block opacity-60">Notre équipe va vous contacter pour finaliser l'acquisition.</span>
                                        </p>
                                    </div>

                                    {/* Sub-bg effect */}
                                    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 blur-3xl opacity-20 rounded-full" style={{ backgroundColor: palette.statusValid }}></div>
                                    <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 blur-3xl opacity-10 rounded-full" style={{ backgroundColor: palette.statusValid }}></div>
                                </div>
                            )}
                            <div className={`mt-5 border-t pt-4 ${darkMode ? 'border-white/10' : 'border-stone-200'}`}>
                                <a
                                    href="/livraison-meubles-anciens-france"
                                    className={`flex items-center justify-between gap-4 text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-300 ${darkMode ? 'text-stone-500 hover:text-amber-400' : 'text-stone-500 hover:text-amber-700'}`}
                                >
                                    <span>Livraison France et pays frontaliers</span>
                                    <ArrowRight size={14} className="shrink-0" />
                                </a>
                                <p className={`mt-3 max-w-[560px] text-[11px] sm:text-xs leading-relaxed ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>
                                    {deliveryEstimateMessage}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* === MODULE : VOUS AIMEREZ AUSSI + TUTO ATELIER === */}
            {recommendedProducts.length > 0 && (
                <section className="tat-heavy-section w-full px-6 sm:px-8 md:px-10 lg:px-12 pb-8">
                    <div className={`relative max-w-[1920px] sm:max-w-[560px] md:max-w-[640px] lg:max-w-[1920px] mx-auto p-5 lg:p-8 rounded-[28px] md:backdrop-blur-xl border ${darkMode ? 'bg-[#141414]/90 border-white/5' : 'bg-white/80 border-stone-200/60'}`}>
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

                            {/* LEFT — Recommended products */}
                            <div className="lg:col-span-7">
                                <p className={`text-[10px] font-black uppercase tracking-[0.28em] mb-5 ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                                    Vous aimerez aussi
                                </p>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    {recommendedProducts.map((product, index) => (
                                        <ShopProductCard 
                                            key={product.id} 
                                            product={product} 
                                            darkMode={darkMode} 
                                            compact 
                                            mobileLightweight
                                            deferImageOnMobile
                                            imageDelayMs={index * 110}
                                            source="gallery_detail"
                                            parentFurnitureId={item.id}
                                            parentFurnitureName={item.name}
                                            detailHref={getShopProductPath(product)}
                                            onOpenProductDetail={onOpenProductDetail}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* RIGHT — Tuto Atelier */}
                            <div className="lg:col-span-5 flex flex-col">
                                <p className={`text-[10px] font-black uppercase tracking-[0.28em] mb-4 ${darkMode ? 'text-amber-500' : 'text-amber-700'}`}>
                                    Tuto Atelier
                                </p>
                                <h3 className={`font-serif text-xl lg:text-2xl leading-tight mb-5 ${darkMode ? 'text-stone-50' : 'text-stone-900'}`}>
                                    {currentTutorial?.label}
                                </h3>
                                <div className="relative">
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={currentTutorial?.videoId}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            transition={{ duration: 0.35 }}
                                            className="relative aspect-video rounded-xl overflow-hidden shadow-2xl"
                                        >
                                            <LazyYouTubeEmbed
                                                videoId={currentTutorial?.videoId}
                                                title={currentTutorial?.label}
                                                className="absolute inset-0 h-full w-full"
                                            />
                                        </motion.div>
                                    </AnimatePresence>

                                    {/* Arrows anchored to video edges */}
                                    {RECOMMENDED_TUTORIALS.length > 1 && (
                                        <>
                                            <button
                                                onClick={() => setTutorialIndex(prev => (prev - 1 + RECOMMENDED_TUTORIALS.length) % RECOMMENDED_TUTORIALS.length)}
                                                aria-label="Tutoriel précédent"
                                                className={`absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-lg border transition-all duration-200 ${darkMode ? 'bg-[#1a1a1a] border-white/10 text-stone-300 hover:bg-amber-500/20 hover:border-amber-500/30' : 'bg-white border-stone-200 text-stone-600 hover:bg-amber-50 hover:border-amber-300'}`}
                                            >
                                                <ChevronLeft size={14} />
                                            </button>
                                            <button
                                                onClick={() => setTutorialIndex(prev => (prev + 1) % RECOMMENDED_TUTORIALS.length)}
                                                aria-label="Tutoriel suivant"
                                                className={`absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-lg border transition-all duration-200 ${darkMode ? 'bg-[#1a1a1a] border-white/10 text-stone-300 hover:bg-amber-500/20 hover:border-amber-500/30' : 'bg-white border-stone-200 text-stone-600 hover:bg-amber-50 hover:border-amber-300'}`}
                                            >
                                                <ChevronRight size={14} />
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* Mobile arrows + YouTube link + dots */}
                                <div className="mt-4 flex items-center justify-between gap-3">
                                    <a
                                        href={`https://www.youtube.com/watch?v=${currentTutorial?.videoId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`inline-flex items-center gap-2 text-[11px] font-medium transition-colors ${darkMode ? 'text-stone-400 hover:text-amber-400' : 'text-stone-500 hover:text-amber-700'}`}
                                    >
                                        <span className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                                            <span className="w-0 h-0 border-l-[5px] border-l-white border-y-[3px] border-y-transparent ml-[1px]" />
                                        </span>
                                        Regarder sur YouTube
                                        <span>→</span>
                                    </a>
                                    {RECOMMENDED_TUTORIALS.length > 1 && (
                                        <div className="flex items-center gap-1.5">
                                            {RECOMMENDED_TUTORIALS.map((_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setTutorialIndex(i)}
                                                    aria-label={`Tutoriel ${i + 1}`}
                                                    className={`rounded-full transition-all duration-300 ${
                                                        i === tutorialIndex
                                                            ? `w-4 h-1.5 ${darkMode ? 'bg-amber-500' : 'bg-amber-600'}`
                                                            : `w-1.5 h-1.5 ${darkMode ? 'bg-white/20 hover:bg-white/40' : 'bg-stone-300 hover:bg-stone-400'}`
                                                    }`}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {SHOW_AD_PLACEHOLDERS && (
                <section className="tat-heavy-section w-full px-6 sm:px-8 md:px-10 lg:px-12 pb-8">
                    <ProductDetailAdSlot
                        className="mx-auto h-[88px] w-full max-w-[300px] rounded-[14px] sm:h-[92px] sm:max-w-[560px] md:max-w-[640px] lg:h-[76px] lg:max-w-[820px] xl:h-[84px] xl:max-w-[900px]"
                        orientation="between-sections"
                        darkMode={darkMode}
                    />
                </section>
            )}

            {/* === MODULE : QUATRE PILIERS DE LA MAISON === */}
            <section className="tat-heavy-section w-full px-6 sm:px-8 md:px-10 lg:px-12 pb-16">
                <div className={`max-w-[1920px] sm:max-w-[560px] md:max-w-[640px] lg:max-w-[1920px] mx-auto p-8 lg:p-12 rounded-[28px] backdrop-blur-xl border ${darkMode ? 'bg-[#141414]/90 border-white/5' : 'bg-white/80 border-stone-200/60'}`}>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
                        {CARE_FEATURES.map(({ icon: Icon, title, description }) => (
                            <div key={title} className="flex flex-col items-center text-center">
                                <div className={`w-14 h-14 lg:w-16 lg:h-16 rounded-full flex items-center justify-center mb-4 border ${darkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-600/10 border-amber-600/20 text-amber-700'}`}>
                                    <Icon size={24} strokeWidth={1.5} />
                                </div>
                                <h4 className={`text-[11px] lg:text-xs font-black uppercase tracking-[0.2em] mb-3 ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>
                                    {title}
                                </h4>
                                <p className={`text-[11px] lg:text-xs leading-relaxed max-w-[220px] ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                                    {description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );

    // ── Fly-to-Cart Animated Clone (Portal) ──
    const flyClone = flyToCartAnim && (() => {
        const { src, startRect, endRect } = flyToCartAnim;
        const isFlying = flyPhase === 'flying' || flyPhase === 'done';

        // Position cible : centre de l'icône panier
        const targetX = endRect.left + endRect.width / 2 - 24;
        const targetY = endRect.top + endRect.height / 2 - 24;

        // Taille initiale : proportionnelle à l'image, max 200px
        const startSize = Math.min(startRect.width, startRect.height, 200);
        const startX = startRect.left + startRect.width / 2 - startSize / 2;
        const startY = startRect.top + startRect.height / 2 - startSize / 2;

        return (
            <div
                key="fly-to-cart-clone"
                style={{
                    position: 'fixed',
                    zIndex: 99999,
                    pointerEvents: 'none',
                    left: isFlying ? targetX : startX,
                    top: isFlying ? targetY : startY,
                    width: isFlying ? 48 : startSize,
                    height: isFlying ? 48 : startSize,
                    borderRadius: isFlying ? '50%' : '12px',
                    overflow: 'hidden',
                    opacity: flyPhase === 'done' ? 0 : 1,
                    boxShadow: isFlying
                        ? '0 0 20px rgba(219, 164, 95, 0.6), 0 0 40px rgba(219, 164, 95, 0.3)'
                        : '0 25px 60px rgba(0,0,0,0.5)',
                    transition: [
                        'left 0.85s cubic-bezier(0.22, 0.68, 0.35, 1)',
                        'top 0.85s cubic-bezier(0.55, 0, 0.15, 1)',
                        'width 0.85s cubic-bezier(0.22, 0.68, 0.35, 1)',
                        'height 0.85s cubic-bezier(0.22, 0.68, 0.35, 1)',
                        'border-radius 0.85s cubic-bezier(0.22, 0.68, 0.35, 1)',
                        'box-shadow 0.85s ease',
                        'opacity 0.3s ease 0.7s',
                    ].join(', '),
                    willChange: 'left, top, width, height, border-radius, opacity',
                }}
            >
                <img
                    src={src}
                    alt=""
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: isFlying ? 'scale(1.3)' : 'scale(1)',
                        transition: 'transform 0.85s cubic-bezier(0.22, 0.68, 0.35, 1)',
                    }}
                />
            </div>
        );
    })();

    return (
        <>
            {mainContent}
            {flyClone}
        </>
    );
};

export default ArchitecturalProductDetail;
