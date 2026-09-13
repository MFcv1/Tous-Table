import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import ProductCard, { RATIO_CACHE, getStoredImageHeightRatio } from './components/ProductCard';
import { ArrowDown, ArrowRight, ChevronDown, Hammer, ShieldCheck, Tag, Truck } from 'lucide-react';
import { FurnitureHeaderIcon, BreadBoardHeaderIcon, CounterHeaderIcon } from './components/ArchitecturalHeader';
import TextType from '../../components/ui/TextType';
import { scrollToTarget } from '../../utils/smoothScroll';
import { warmImage } from '../../utils/startupWarmup';
import { isLowPowerMobileDevice, isTouchDevice, shouldLimitNetworkWarmup } from '../../utils/devicePerformance';
import { LEGACY_FURNITURE_CATEGORY_BY_ID } from '../../data/legacyFurnitureCategories';
import { BOARD_SEO_CONTENT, CATEGORY_SEO_CONTENT } from '../../data/categorySeoContent';

// Nombre de colonnes responsive — aligné sur les breakpoints Tailwind utilisés dans
// l'ancien `columns-2 md:columns-3 lg:columns-4`.
const useResponsiveCols = () => {
    const compute = () => {
        if (typeof window === 'undefined') return 4;
        const w = window.innerWidth;
        if (w < 768) return 2;
        if (w < 1024) return 3;
        return 4;
    };
    const [cols, setCols] = useState(compute);
    useEffect(() => {
        let raf = 0;
        const onResize = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => setCols(compute()));
        };
        window.addEventListener('resize', onResize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', onResize);
        };
    }, []);
    return cols;
};

// Ratio hauteur/largeur prédit pour une carte (en multiples de la largeur de colonne).
// On lit le `RATIO_CACHE` partagé avec `ProductCard` ; à défaut, fallback portrait 4:5
// (= 1.25), qui est le ratio par défaut posé sur le `<a>` quand l'image n'est pas chargée.
const FALLBACK_HEIGHT_RATIO = 5 / 4;
const LOAD_MORE_BATCH_SIZE = 12;
const FRESH_CARD_ANIMATION_MS = 1150;
const FRESH_CARD_TOUCH_ANIMATION_MS = 850;
const FRESH_CARD_CONSTRAINED_ANIMATION_MS = 680;
const FRESH_CARD_CLEAR_BUFFER_MS = 150;
const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
const getCardImage = (item) => item?.images?.[0] || item?.imageUrl || item?.thumbnailUrl || '';

const cacheImageRatio = (src, img) => {
    if (!src || !img?.naturalWidth || !img?.naturalHeight || RATIO_CACHE.has(src)) return;
    RATIO_CACHE.set(src, {
        aspectRatio: `${img.naturalWidth} / ${img.naturalHeight}`,
        objectPos: 'center',
    });
};

const isLoadMoreConstrainedDevice = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    if (shouldLimitNetworkWarmup()) return true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;

    const memory = Number(navigator.deviceMemory || 0);
    const cores = Number(navigator.hardwareConcurrency || 0);

    if (memory > 0 && memory <= 4) return true;
    if (cores > 0 && cores <= 4) return true;

    // Galaxy S/Ultra, iPhone Pro récents, etc. : largeur mobile, mais budget CPU/RAM solide.
    // On évite de les envoyer dans le profil prudent prévu pour Android entrée de gamme.
    if (memory >= 6 || cores >= 6) return false;

    return isLowPowerMobileDevice();
};

const getLoadMoreRevealProfile = () => {
    if (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
        return {
            revealSize: LOAD_MORE_BATCH_SIZE,
            revealInterval: 0,
            intraBatchDelay: 0,
            priorityCount: 2,
            animationMs: 0,
        };
    }

    const touch = isTouchDevice();
    const constrained = touch && isLoadMoreConstrainedDevice();

    if (constrained) {
        return {
            revealSize: 1,
            revealInterval: 75,
            intraBatchDelay: 0,
            priorityCount: 1,
            animationMs: FRESH_CARD_CONSTRAINED_ANIMATION_MS,
        };
    }

    if (touch) {
        return {
            revealSize: 2,
            revealInterval: 95,
            intraBatchDelay: 45,
            priorityCount: 2,
            animationMs: FRESH_CARD_TOUCH_ANIMATION_MS,
        };
    }

    return {
        revealSize: 3,
        revealInterval: 135,
        intraBatchDelay: 45,
        priorityCount: 4,
        animationMs: FRESH_CARD_ANIMATION_MS,
    };
};

const getPredictedHeightRatio = (item) => {
    const storedRatio = getStoredImageHeightRatio(item);
    if (storedRatio) return storedRatio;

    const img = getCardImage(item);
    if (!img) return FALLBACK_HEIGHT_RATIO;
    const cached = RATIO_CACHE.get(img);
    if (!cached?.aspectRatio) return FALLBACK_HEIGHT_RATIO;
    const parts = String(cached.aspectRatio).split('/');
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!w || !h) return FALLBACK_HEIGHT_RATIO;
    return h / w;
};

// Taxonomie mobilier — slugs alignés avec AdminForm.FURNITURE_CATEGORIES.
// L'identifiant `all` est la pill par défaut ; les autres correspondent au champ Firestore `category`.
const FURNITURE_CATEGORIES = [
    // `mobileLabel` (optionnel) : libellé court affiché sur mobile (< 640px) pour
    // que les 7 pills tiennent sur 2 lignes maximum sans scroll horizontal.
    { id: 'all', label: 'Tous les produits', mobileLabel: 'Tous' },
    { id: 'buffet', label: 'Buffets' },
    { id: 'table', label: 'Tables' },
    { id: 'chaise', label: 'Chaises & bancs', mobileLabel: 'Chaises' },
    { id: 'armoire', label: 'Armoires' },
    { id: 'commode', label: 'Commodes & chevets', mobileLabel: 'Commodes' },
    { id: 'autre', label: 'Autres' }, // Pill publique uniquement (pas dans le select admin)
];

// Tranches de prix fixes — filtre public Galerie.
const PRICE_RANGES = [
    { id: 'lt500', label: 'Moins de 500 €', min: 0, max: 500 },
    { id: '500-1000', label: '500 – 1 000 €', min: 500, max: 1000 },
    { id: '1000-2000', label: '1 000 – 2 000 €', min: 1000, max: 2000 },
    { id: 'gt2000', label: '2 000 € et +', min: 2000, max: Infinity },
];

// Normalisation NFD pour ignorer les accents lors du fallback regex.
const normalizeText = (value = '') =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Retourne UNE seule catégorie par meuble.
// Priorité absolue au champ Firestore `category` (saisi en admin).
// Fallback : analyse du NOM uniquement (signal très fiable pour le mobilier ancien).
// On évite la description car elle contient souvent des mots parasites
// (ex. "table à langer" dans la fiche d'une commode → faisait matcher 'table' à tort).
const getFurnitureCategory = (item) => {
    if (item?.category) return item.category;
    if (item?.id && LEGACY_FURNITURE_CATEGORY_BY_ID[item.id]) {
        return LEGACY_FURNITURE_CATEGORY_BY_ID[item.id];
    }

    const name = normalizeText(item?.name || '');

    // 1. Cas spéciaux à traiter en priorité (mots qui pourraient matcher plusieurs catégories).
    if (/vestiaire|porte[\s-]?manteaux|penderie/.test(name)) return 'armoire';
    if (/desserte/.test(name)) return 'buffet'; // une desserte est un buffet bas
    if (/meuble[\s-]?de[\s-]?metier/.test(name)) return 'buffet'; // décision client : rangé dans Buffets

    // 2. Catégories principales fortes — testées AVANT "autre" pour éviter les faux positifs
    //    (ex. "Bahut coffre" : bahut > coffre, donc reste un buffet).
    if (/buffet|bahut/.test(name)) return 'buffet';
    if (/commode|chevet|secretaire|semainier/.test(name)) return 'commode';
    if (/armoire/.test(name)) return 'armoire';
    if (/chaise|fauteuil|banc|tabouret/.test(name)) return 'chaise';

    // 3. Mots-clés "Autres" (meubles spéciaux peu fréquents : crédence, vitrine, console, etc.).
    if (/credence|vitrine|miroir|console|coffre|etagere|horloge|paravent|servante|meuble[\s-]?a[\s-]?colonne/.test(name)) return 'autre';

    // 4. Catégorie générique en dernier (table est très générique car peut apparaître partout).
    if (/table|bureau|comptoir/.test(name)) return 'table';

    // 5. Fallback : nom non explicite → "Autres" plutôt que d'imposer une catégorie hasardeuse.
    return 'autre';
};

const FURNITURE_SUBTYPE_RULES = [
    ['tabouret', /tabouret/],
    ['banc', /banc/],
    ['chaise', /chaise/],
    ['fauteuil', /fauteuil/],
    ['table', /table/],
    ['bureau', /bureau/],
    ['console', /console/],
    ['buffet', /buffet|bahut|desserte/],
    ['bibliotheque', /bibliotheque|etagere/],
    ['armoire', /armoire|vestiaire|penderie|porte[\s-]?manteaux/],
    ['commode', /commode|chevet|secretaire|semainier/],
    ['vitrine', /vitrine/],
    ['coffre', /coffre/],
    ['miroir', /miroir/],
    ['tapis', /tapis/],
];

const BOARD_SUBTYPE_RULES = [
    ['xxl', /\bxxl\b|tres grande|grande planche/],
    ['xl', /\bxl\b/],
    ['l', /\bl\b|large/],
    ['ronde', /ronde|rond/],
    ['rectangulaire', /rectangulaire|rectangle/],
    ['speciale', /special|gaucher|ancienne|debut/],
];

const getFurnitureSubtype = (item) => {
    const name = normalizeText(item?.name || '');
    const rule = FURNITURE_SUBTYPE_RULES.find(([, pattern]) => pattern.test(name));
    if (rule) return rule[0];

    const material = normalizeText(item?.material || '');
    return `${getFurnitureCategory(item)}:${material || 'sans-matiere'}`;
};

const getBoardSubtype = (item) => {
    const name = normalizeText(item?.name || '');
    const rule = BOARD_SUBTYPE_RULES.find(([, pattern]) => pattern.test(name));
    if (rule) return rule[0];

    const material = normalizeText(item?.material || '');
    if (material) return `matiere:${material}`;

    const price = getPrice(item);
    if (price >= 150) return 'prix-haut';
    if (price >= 70) return 'prix-moyen';
    return 'prix-bas';
};

const BENEFITS = [
    {
        title: 'Pièces uniques',
        body: 'Chaque meuble est unique et sélectionné avec exigence.',
        icon: Tag,
    },
    {
        title: 'Restauration artisanale',
        body: 'Restauration à la main dans notre atelier en Normandie.',
        icon: Hammer,
    },
    {
        title: 'Matières durables',
        body: 'Bois massif et matériaux nobles pour des meubles faits pour durer.',
        icon: ShieldCheck,
    },
    {
        title: 'Livraison soignée',
        body: 'Livraison partout en France avec emballage sur mesure.',
        icon: Truck,
    },
];

const getPrice = (item) => Number(item?.currentPrice || item?.startingPrice || item?.price || 0);
const HERO_BY_COLLECTION = {
    furniture: {
        image: '/images/gallery/hero-buffet-parisien-2026-2020.webp',
        srcSet: [
            '/images/gallery/hero-buffet-parisien-2026-960.webp 960w',
            '/images/gallery/hero-buffet-parisien-2026-1440.webp 1440w',
            '/images/gallery/hero-buffet-parisien-2026-2020.webp 2020w',
        ].join(', '),
        mobileSrcSet: [
            '/images/gallery/hero-buffet-parisien-2026-mobile-640.webp 640w',
            '/images/gallery/hero-buffet-parisien-2026-mobile-840.webp 840w',
            '/images/gallery/hero-buffet-parisien-2026-mobile-1122.webp 1122w',
        ].join(', '),
        alt: 'Mobilier ancien restaure',
        mobileObjectPosition: 'center center',
        objectPosition: 'center center',
    },
    cutting_boards: {
        image: '/images/gallery/hero-planches-2026-1672.webp',
        srcSet: [
            '/images/gallery/hero-planches-2026-960.webp 960w',
            '/images/gallery/hero-planches-2026-1440.webp 1440w',
            '/images/gallery/hero-planches-2026-1672.webp 1672w',
        ].join(', '),
        mobileSrcSet: [
            '/images/gallery/hero-planches-2026-mobile-outpaint-640.webp 640w',
            '/images/gallery/hero-planches-2026-mobile-outpaint-840.webp 840w',
            '/images/gallery/hero-planches-2026-mobile-outpaint-1122.webp 1122w',
        ].join(', '),
        alt: 'Planches en bois Tous a Table, made in Normandie',
        mobileObjectPosition: 'center center',
        objectPosition: '68% center',
    },
};
const getMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (value.seconds) return value.seconds * 1000;
    return new Date(value).getTime() || 0;
};

const compareRecent = (a, b) => {
    const dateDiff = getMillis(b.createdAt || b.updatedAt) - getMillis(a.createdAt || a.updatedAt);
    if (dateDiff !== 0) return dateDiff;
    return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), 'fr');
};

const getDiversityGroup = (item, { activeCollection, activeCategory }) => {
    if (activeCollection === 'cutting_boards') return getBoardSubtype(item);
    if (activeCategory === 'all') return getFurnitureCategory(item);
    return getFurnitureSubtype(item);
};

const ALL_FURNITURE_DIVERSITY_ORDER = ['table', 'autre', 'buffet', 'commode', 'chaise', 'armoire'];
const FURNITURE_SUBTYPE_DIVERSITY_ORDER = [
    'table',
    'console',
    'buffet',
    'bibliotheque',
    'commode',
    'armoire',
    'fauteuil',
    'chaise',
    'banc',
    'tabouret',
    'bureau',
    'coffre',
    'vitrine',
    'miroir',
    'tapis',
];
const BOARD_DIVERSITY_ORDER = ['ronde', 'rectangulaire', 'speciale', 'xxl', 'xl', 'l'];

const getDiversityGroupRank = (key, { activeCollection, activeCategory }) => {
    const order = activeCollection === 'cutting_boards'
        ? BOARD_DIVERSITY_ORDER
        : activeCategory === 'all'
            ? ALL_FURNITURE_DIVERSITY_ORDER
            : FURNITURE_SUBTYPE_DIVERSITY_ORDER;
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
};

const diversifyRecentItems = (items, context) => {
    if (items.length < 3) return [...items].sort(compareRecent);

    const buckets = new Map();
    for (const item of items) {
        const key = getDiversityGroup(item, context);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(item);
    }

    if (buckets.size < 2) return [...items].sort(compareRecent);

    const bucketList = [...buckets.entries()].map(([key, bucketItems]) => ({
        key,
        cursor: 0,
        items: bucketItems.sort(compareRecent),
    })).sort((a, b) => {
        const rankDiff = getDiversityGroupRank(a.key, context) - getDiversityGroupRank(b.key, context);
        if (rankDiff !== 0) return rankDiff;
        return a.key.localeCompare(b.key, 'fr');
    });

    const diversified = [];
    let remaining = items.length;

    while (remaining > 0) {
        let addedThisPass = 0;
        for (const bucket of bucketList) {
            const next = bucket.items[bucket.cursor];
            if (!next) continue;
            diversified.push(next);
            bucket.cursor += 1;
            remaining -= 1;
            addedThisPass += 1;
        }

        if (addedThisPass === 0) break;
    }

    return diversified;
};

const AtelierBadge = () => (
    <svg
        viewBox="0 0 220 220"
        role="img"
        aria-label="Atelier Normand, pieces uniques"
        className="h-36 w-36 lg:h-44 lg:w-44 drop-shadow-[0_18px_45px_rgba(0,0,0,0.65)]"
    >
        <defs>
            <radialGradient id="atelierBadgeFill" cx="42%" cy="36%" r="72%">
                <stop offset="0%" stopColor="#2a2115" stopOpacity="0.78" />
                <stop offset="54%" stopColor="#050505" stopOpacity="0.88" />
                <stop offset="100%" stopColor="#020202" stopOpacity="0.96" />
            </radialGradient>
            <linearGradient id="atelierGold" x1="48" y1="26" x2="176" y2="196" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#f4d08c" />
                <stop offset="45%" stopColor="#c99643" />
                <stop offset="100%" stopColor="#f1c879" />
            </linearGradient>
            <path id="atelierTopPath" d="M 42 110 A 68 68 0 0 1 178 110" />
            <path id="atelierBottomPath" d="M 42 110 A 68 68 0 0 0 178 110" />
            <filter id="atelierSoftGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="2.4" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>

        {/* Fond transparent (le cercle avec atelierBadgeFill a été retiré) */}
        <circle cx="110" cy="110" r="87" fill="none" stroke="url(#atelierGold)" strokeWidth="1.35" />
        
        <g>
            <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 110 110"
                to="360 110 110"
                dur="18s"
                repeatCount="indefinite"
            />

            {/* Points décoratifs de séparation */}
            <circle cx="42" cy="110" r="2.2" fill="#f1e6d0" opacity="0.85" />
            <circle cx="178" cy="110" r="2.2" fill="#f1e6d0" opacity="0.85" />

            <text
                fill="#f1e6d0"
                fontSize="9.5"
                fontWeight="500"
                letterSpacing="6.5"
                fontFamily="'Plus Jakarta Sans', sans-serif"
                textAnchor="middle"
                dominantBaseline="central"
                className="uppercase"
            >
                <textPath href="#atelierTopPath" startOffset="51.5%">ATELIER NORMAND</textPath>
            </text>
            <text
                fill="#f1e6d0"
                fontSize="9.5"
                fontWeight="500"
                letterSpacing="6.5"
                fontFamily="'Plus Jakarta Sans', sans-serif"
                textAnchor="middle"
                dominantBaseline="central"
                className="uppercase"
            >
                <textPath href="#atelierBottomPath" startOffset="51.5%">PIÈCES UNIQUES</textPath>
            </text>
        </g>

        <g fill="url(#atelierGold)" fontFamily="'Cormorant Garamond', 'Playfair Display', serif" fontSize="62" fontWeight="300" textAnchor="middle">
            <text x="109" y="119">A</text>
            <text x="116" y="142">N</text>
        </g>
    </svg>
);

// === NEON COLLECTION SWITCHER ===
// Trois boutons (Mobilier / Planches / Le Comptoir) à border néon rotative,
// affichés au-dessus du label "Collection 2026" dans le hero.
// Réutilise les mêmes icônes que la nav header pour une identité visuelle cohérente.
const NeonCollectionSwitcher = ({ activeCollection, setActiveCollection, setFilter, onOpenShop, onCollectionIntent, onShopIntent, darkMode = false }) => {
    const items = [
        {
            id: 'furniture',
            label: 'Mobilier',
            Icon: FurnitureHeaderIcon,
            isActive: activeCollection === 'furniture',
            onIntent: () => onCollectionIntent?.('furniture'),
            onClick: () => {
                onCollectionIntent?.('furniture');
                if (typeof setActiveCollection === 'function') setActiveCollection('furniture');
                if (typeof setFilter === 'function') setFilter('fixed');
            },
        },
        {
            id: 'cutting_boards',
            label: 'Planches',
            Icon: BreadBoardHeaderIcon,
            isActive: activeCollection === 'cutting_boards',
            onIntent: () => onCollectionIntent?.('cutting_boards'),
            onClick: () => {
                onCollectionIntent?.('cutting_boards');
                if (typeof setActiveCollection === 'function') setActiveCollection('cutting_boards');
            },
        },
        {
            id: 'shop',
            label: 'Le Comptoir',
            Icon: CounterHeaderIcon,
            isActive: false, // Le Comptoir = page séparée → jamais actif sur MarketplaceLayout
            isShop: true,
            onIntent: () => onShopIntent?.(),
            onClick: () => {
                onShopIntent?.();
                if (typeof onOpenShop === 'function') onOpenShop();
            },
        },
    ];

    return (
        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
            {items.map(({ id, label, Icon, isActive, isShop, onClick, onIntent }) => (
                <div key={id} className="relative">
                    {isShop ? (
                        /* LE COMPTOIR — border néon rotative (comme en prod) */
                        <>
                            <div className="relative p-[1.5px] rounded-full overflow-hidden">
                                <motion.div
                                    animate={{ rotate: -360 }}
                                    transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
                                    className="absolute inset-[-200%]"
                                    style={{
                                        background: 'conic-gradient(from 0deg, transparent 30%, rgba(245,158,11,0) 35%, rgba(245,158,11,1) 50%, rgba(245,158,11,0) 65%, transparent 70%)',
                                    }}
                                />
                                <motion.button
                                    type="button"
                                    onMouseEnter={onIntent}
                                    onFocus={onIntent}
                                    onPointerDown={onIntent}
                                    onClick={onClick}
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.97 }}
                                    className={`relative z-10 inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-[0.18em] whitespace-nowrap ${
                                        darkMode ? 'bg-stone-900/90 text-amber-400' : 'bg-[#fff8ed]/95 text-[#8f5b20] shadow-[0_8px_24px_rgba(128,82,28,0.16)]'
                                    }`}
                                >
                                    <Icon size={16} strokeWidth={1.8} className="shrink-0" />
                                    <span>{label}</span>
                                </motion.button>
                            </div>
                            <motion.div
                                className="absolute -top-2.5 -right-2 z-20 transform-gpu rotate-[6deg]"
                                animate={{ y: [0, -2, 0] }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                style={{ willChange: 'transform' }}
                            >
                                <div className="inline-flex items-center justify-center min-w-[30px] h-[16px] text-[8.5px] leading-none font-medium uppercase tracking-[0.07em] px-1.5 rounded-full bg-amber-500 text-amber-50 border border-amber-300/45 shadow-[0_2px_6px_rgba(0,0,0,0.3)]">
                                    NEW
                                </div>
                            </motion.div>
                        </>
                    ) : isActive ? (
                        /* MOBILIER actif — pill blanche pleine, pas de neon */
                        <motion.button
                            type="button"
                            onMouseEnter={onIntent}
                            onFocus={onIntent}
                            onPointerDown={onIntent}
                            onClick={onClick}
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.97 }}
                            className={`inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-[0.18em] whitespace-nowrap ${
                                darkMode ? 'bg-stone-100 text-stone-900' : 'bg-stone-950 text-[#fff7eb] shadow-[0_10px_24px_rgba(61,41,18,0.2)]'
                            }`}
                        >
                            <Icon size={14} strokeWidth={1.8} className="shrink-0" />
                            <span>{label}</span>
                        </motion.button>
                    ) : (
                        /* MOBILIER inactif & PLANCHES — neon rotatif blanc */
                        <div className="relative p-[1.5px] rounded-full overflow-hidden">
                            <motion.div
                                animate={{ rotate: -360 }}
                                transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
                                className="absolute inset-[-200%]"
                                style={{
                                    background: 'conic-gradient(from 0deg, transparent 30%, rgba(255,255,255,0) 35%, rgba(255,255,255,1) 50%, rgba(255,255,255,0) 65%, transparent 70%)',
                                }}
                            />
                            <motion.button
                                type="button"
                                onMouseEnter={onIntent}
                                onFocus={onIntent}
                                onPointerDown={onIntent}
                                onClick={onClick}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.97 }}
                                className={`relative z-10 inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-[0.18em] whitespace-nowrap ${
                                    darkMode ? 'bg-stone-900/90 text-stone-100' : 'bg-[#fff8ed]/95 text-stone-800 shadow-[0_8px_24px_rgba(128,82,28,0.14)]'
                                }`}
                            >
                                <Icon size={14} strokeWidth={1.8} className="shrink-0" />
                                <span>{label}</span>
                            </motion.button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const CategorySeoIntro = ({ content, darkMode }) => {
    if (!content) return null;

    return (
        <section className={`mt-1 mb-6 md:mb-8 border-y py-5 md:py-6 ${darkMode ? 'border-[#8a5b2a]/20' : 'border-[#c79b5d]/28'}`}>
            <div className="grid gap-4 md:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] md:gap-10">
                <div>
                    <p className={`text-[9px] md:text-[10px] font-black uppercase tracking-[0.28em] ${darkMode ? 'text-[#f0b969]/80' : 'text-[#8a531c]'}`}>
                        {content.eyebrow}
                    </p>
                    <h2 className={`mt-2 font-serif text-2xl md:text-3xl leading-tight ${darkMode ? 'text-stone-100' : 'text-stone-950'}`}>
                        {content.title}
                    </h2>
                </div>
                <div className="space-y-3">
                    <p className={`max-w-[72ch] text-sm md:text-[15px] leading-relaxed ${darkMode ? 'text-stone-300/82' : 'text-stone-700'}`}>
                        {content.body}
                    </p>
                    {content.links?.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                            {content.links.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] underline-offset-4 hover:underline ${darkMode ? 'text-[#f0b969]' : 'text-[#8a531c]'}`}
                                >
                                    {link.label}
                                    <ArrowRight size={12} strokeWidth={1.7} />
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

const MarketplaceLayout = ({
    items,
    onSelectItem,
    onProductIntent,
    headerProps,
    darkMode,
    setHeaderProps,
    initialCategory = 'all',
    onCategoryChange,
    seoUrl = '/meubles-anciens',
}) => {
    const { activeCollection, setActiveCollection, setFilter, onOpenShop, onCollectionIntent, onShopIntent } = headerProps || {};
    const [activeCategory, setActiveCategory] = useState(initialCategory || 'all');
    const [activeMaterial, setActiveMaterial] = useState('');
    const [activePriceRange, setActivePriceRange] = useState('');
    const [sortMode, setSortMode] = useState('curated');


    // === ARCHITECTURE MASONRY JS-DRIVEN ===
    // On rend N colonnes flex-col indépendantes (cf. NUM_COLS responsive). Chaque carte est
    // assignée à UNE colonne au moment où elle est traitée par l'algo "shortest-column-first" ;
    // cette assignation est implicitement stable car :
    //   - L'ordre des items dans `sortedItems` ne change pas tant que les filtres ne changent pas
    //   - Les hauteurs prédites par item sont gelées à la première rencontre (`heightsRef`),
    //     donc une mise à jour ultérieure du `RATIO_CACHE` (letterbox détecté) ne décale pas
    //     les anciennes cartes
    //   - Quand on clique "Voir plus", les 24 premiers items sont re-traités à l'identique
    //     (mêmes hauteurs gelées) → ils retombent dans les mêmes colonnes ; les 12 nouveaux
    //     items s'insèrent dans la colonne actuellement la plus courte.
    // Conséquence : zéro reflow des cartes existantes, vrai masonry continu (pas de "trous"
    // sous les colonnes courtes comme avec l'ancien chunking par batch).
    const NUM_COLS = useResponsiveCols();
    const [visibleCount, setVisibleCount] = useState(24);
    const [isPreparingMore, setIsPreparingMore] = useState(false);
    // Map<itemId, delayMs> — uniquement pour les nouveaux items à animer.
    // Vide à l'état initial et après reset des filtres → aucune animation parasite.
    const [freshOrder, setFreshOrder] = useState(() => new Map());
    const [freshPriorityIds, setFreshPriorityIds] = useState(() => new Set());
    // Map<itemId, ratio h/w> — gelé à la première rencontre pour figer les placements.
    const heightsRef = useRef(new Map());
    // Timer pour clear `freshOrder` après la fin de l'animation (libère le will-change
    // GPU des cartes fraîches).
    const freshClearTimerRef = useRef(null);
    const revealTimersRef = useRef([]);
    const loadMoreRunRef = useRef(0);

    const clearLoadMoreTimers = useCallback(() => {
        if (freshClearTimerRef.current) {
            clearTimeout(freshClearTimerRef.current);
            freshClearTimerRef.current = null;
        }
        revealTimersRef.current.forEach((timer) => clearTimeout(timer));
        revealTimersRef.current = [];
    }, []);

    useEffect(() => {
        if (setHeaderProps && headerProps) setHeaderProps(headerProps);
        return () => {
            if (setHeaderProps) setHeaderProps(null);
        };
    }, [activeCollection, setHeaderProps]);

    // Options matière déduites dynamiquement des meubles réellement présents.
    const materialOptions = useMemo(() => {
        return [...new Set(items.map((item) => item.material).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    }, [items]);

    // Tranche de prix active (objet complet ou null).
    const priceRange = PRICE_RANGES.find((r) => r.id === activePriceRange) || null;

    const sortedItems = useMemo(() => {
        const filtered = items.filter((item) => {
            // 1. Catégorie (priorité au champ Firestore, fallback regex sur nom/description).
            if (activeCollection === 'furniture' && activeCategory !== 'all' && getFurnitureCategory(item) !== activeCategory) return false;
            // 2. Matière exacte.
            if (activeMaterial && item.material !== activeMaterial) return false;
            // 3. Tranche de prix.
            if (priceRange) {
                if (item.priceOnRequest) return false; // "Prix sur demande" exclu des tranches.
                const price = getPrice(item);
                if (price < priceRange.min || price >= priceRange.max) return false;
            }
            return true;
        });
        if (sortMode === 'curated') {
            return diversifyRecentItems(filtered, { activeCollection, activeCategory });
        }

        return [...filtered].sort((a, b) => {
            if (sortMode === 'priceAsc') return getPrice(a) - getPrice(b);
            if (sortMode === 'priceDesc') return getPrice(b) - getPrice(a);
            return compareRecent(a, b);
        });
    }, [items, activeCategory, activeCollection, activeMaterial, priceRange, sortMode]);

    const isBoardsCollection = activeCollection === 'cutting_boards';
    const showFurnitureCategories = activeCollection === 'furniture';
    const hasActiveFilters = (showFurnitureCategories && activeCategory !== 'all') || activeMaterial !== '' || activePriceRange !== '';

    // Reset à l'état initial : 24 items visibles, aucun item frais à animer, hauteurs effacées.
    // Appelé sur tout changement de filtre / catégorie / matière / tri (l'ordre des items change
    // → les placements précédents n'ont plus de sens, on repart à zéro).
    const resetView = useCallback(() => {
        loadMoreRunRef.current += 1;
        clearLoadMoreTimers();
        heightsRef.current = new Map();
        setIsPreparingMore(false);
        setVisibleCount(24);
        setFreshOrder(new Map());
        setFreshPriorityIds(new Set());
    }, [clearLoadMoreTimers]);

    const resetAllFilters = useCallback(() => {
        setActiveCategory('all');
        setActiveMaterial('');
        setActivePriceRange('');
        if (activeCollection === 'furniture') {
            onCategoryChange?.('all');
        }
        resetView();
    }, [activeCollection, onCategoryChange, resetView]);

    useEffect(() => {
        setActiveCategory(activeCollection === 'cutting_boards' ? 'all' : (initialCategory || 'all'));
        resetView();
        setActiveMaterial('');
        setActivePriceRange('');
    }, [activeCollection, initialCategory, resetView]);


    const heroConfig = HERO_BY_COLLECTION[activeCollection] || HERO_BY_COLLECTION.furniture;

    // "Voir plus" prépare d'abord les images du prochain lot, puis étend la fenêtre visible.
    // Les cartes gardent l'animation d'apparition existante, mais elle démarre après le warmup.
    const warmLoadMoreBatchImages = useCallback((batch, { background = false } = {}) => {
        const touch = isTouchDevice();
        const constrained = touch && isLoadMoreConstrainedDevice();
        const candidates = batch
            .map((item) => getCardImage(item))
            .filter(Boolean);

        if (!candidates.length) return Promise.resolve();

        const runWarmers = (urls, {
            concurrency,
            decodeCount,
            imageTimeout,
            pause = 0,
        }) => {
            let cursor = 0;
            const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
                while (cursor < urls.length) {
                    const index = cursor;
                    cursor += 1;
                    const src = urls[index];
                    const shouldDecode = index < decodeCount;
                    const img = await warmImage(src, {
                        priority: shouldDecode ? 'high' : 'low',
                        decode: shouldDecode,
                        timeout: imageTimeout,
                    });
                    cacheImageRatio(src, img);

                    if (pause > 0) await wait(pause);
                }
            });

            return Promise.allSettled(workers);
        };

        if (background) {
            const backgroundLimit = touch ? (constrained ? 4 : 6) : 8;
            return runWarmers(candidates.slice(0, backgroundLimit), {
                concurrency: touch ? 1 : 2,
                decodeCount: touch ? 1 : 2,
                imageTimeout: touch ? 900 : 700,
                pause: touch ? 45 : 0,
            });
        }

        const blockingCount = touch ? 2 : 5;
        const blockingCandidates = candidates.slice(0, blockingCount);
        const backgroundCandidates = candidates.slice(blockingCount, touch ? (constrained ? 6 : 9) : candidates.length);
        const blockingTask = runWarmers(blockingCandidates, {
            concurrency: touch ? (constrained ? 1 : 2) : 4,
            decodeCount: touch ? Math.min(2, blockingCandidates.length) : blockingCandidates.length,
            imageTimeout: touch ? (constrained ? 850 : 520) : 700,
            pause: touch ? (constrained ? 55 : 10) : 0,
        });

        if (backgroundCandidates.length > 0) {
            runWarmers(backgroundCandidates, {
                concurrency: touch ? (constrained ? 1 : 2) : 3,
                decodeCount: touch ? 1 : 2,
                imageTimeout: touch ? 1200 : 900,
                pause: touch ? 70 : 0,
            });
        }

        const totalBudget = touch ? (constrained ? 820 : 300) : 520;
        return Promise.race([blockingTask, wait(totalBudget)]);
    }, []);
    const getNextBatch = useCallback(() => {
        const newCount = Math.min(visibleCount + LOAD_MORE_BATCH_SIZE, sortedItems.length);
        return {
            newSlice: sortedItems.slice(visibleCount, newCount),
        };
    }, [visibleCount, sortedItems]);

    const warmNextBatchIntent = useCallback(() => {
        if (isPreparingMore) return;
        const { newSlice } = getNextBatch();
        if (!newSlice.length) return;
        warmLoadMoreBatchImages(newSlice, { background: true });
    }, [getNextBatch, isPreparingMore, warmLoadMoreBatchImages]);

    const scheduleLoadMoreReveal = useCallback(({ newSlice, startCount, runId, profile }) => {
        clearLoadMoreTimers();
        let revealedCount = 0;

        const finishReveal = (lastChunkSize) => {
            const lastDelay = Math.max(0, (lastChunkSize - 1) * profile.intraBatchDelay);
            const clearDelay = profile.animationMs + FRESH_CARD_CLEAR_BUFFER_MS + lastDelay;
            setIsPreparingMore(false);
            freshClearTimerRef.current = setTimeout(() => {
                if (loadMoreRunRef.current !== runId) return;
                setFreshOrder(new Map());
                setFreshPriorityIds(new Set());
                freshClearTimerRef.current = null;
            }, clearDelay);
        };

        const revealNextChunk = () => {
            if (loadMoreRunRef.current !== runId) return;

            const nextRevealedCount = Math.min(revealedCount + profile.revealSize, newSlice.length);
            const chunk = newSlice.slice(revealedCount, nextRevealedCount);
            revealedCount = nextRevealedCount;

            setFreshOrder((prev) => {
                const next = new Map(prev);
                chunk.forEach((item, slot) => {
                    next.set(item.id, slot * profile.intraBatchDelay);
                });
                return next;
            });
            setVisibleCount(startCount + revealedCount);

            if (revealedCount < newSlice.length) {
                const timer = setTimeout(revealNextChunk, profile.revealInterval);
                revealTimersRef.current.push(timer);
                return;
            }

            revealTimersRef.current = [];
            finishReveal(chunk.length);
        };

        const firstTimer = setTimeout(revealNextChunk, 0);
        revealTimersRef.current.push(firstTimer);
    }, [clearLoadMoreTimers]);

    const loadMore = useCallback(async () => {
        if (isPreparingMore) return;
        const { newSlice } = getNextBatch();
        if (!newSlice.length) return;

        const runId = loadMoreRunRef.current + 1;
        loadMoreRunRef.current = runId;
        setIsPreparingMore(true);
        clearLoadMoreTimers();

        await warmLoadMoreBatchImages(newSlice).catch(() => undefined);
        if (loadMoreRunRef.current !== runId) return;
        const profile = getLoadMoreRevealProfile();
        setFreshPriorityIds(new Set(newSlice.slice(0, profile.priorityCount).map((item) => item.id)));
        scheduleLoadMoreReveal({
            newSlice,
            startCount: visibleCount,
            runId,
            profile,
        });
    }, [clearLoadMoreTimers, getNextBatch, isPreparingMore, scheduleLoadMoreReveal, visibleCount, warmLoadMoreBatchImages]);

    // Cleanup global du timer au unmount du composant.
    useEffect(() => () => {
        loadMoreRunRef.current += 1;
        clearLoadMoreTimers();
    }, [clearLoadMoreTimers]);

    // Quand le nombre de colonnes change (resize fenêtre), les anciens placements ne sont plus
    // pertinents (l'algo va répartir différemment sur N colonnes vs N±1). On efface les
    // hauteurs gelées pour permettre un re-placement propre. Pas de reset de visibleCount —
    // l'utilisateur garde son progrès "Voir plus".
    useEffect(() => {
        loadMoreRunRef.current += 1;
        clearLoadMoreTimers();
        heightsRef.current = new Map();
        setFreshOrder(new Map()); // pas d'animation parasite après resize
        setFreshPriorityIds(new Set());
        setIsPreparingMore(false);
    }, [NUM_COLS, clearLoadMoreTimers]);

    // Algo masonry "shortest-column-first" — déterministe pour un même `sortedItems` + heightsRef.
    // Retourne un tableau de colonnes, chacune contenant la liste des items qui lui sont assignés.
    const columnsLayout = useMemo(() => {
        const cols = Array.from({ length: NUM_COLS }, () => ({ items: [], h: 0 }));
        const visible = sortedItems.slice(0, visibleCount);
        for (const item of visible) {
            // Hauteur prédite gelée à la première rencontre (cf. heightsRef).
            let height = heightsRef.current.get(item.id);
            if (height === undefined) {
                height = getPredictedHeightRatio(item);
                heightsRef.current.set(item.id, height);
            }
            // Colonne la plus courte (en cas d'égalité, première colonne gagne → stable).
            let minIdx = 0;
            for (let i = 1; i < cols.length; i++) {
                if (cols[i].h < cols[minIdx].h) minIdx = i;
            }
            cols[minIdx].items.push(item);
            cols[minIdx].h += height;
        }
        return cols;
    }, [sortedItems, visibleCount, NUM_COLS]);

    const totalVisible = Math.min(visibleCount, sortedItems.length);
    const hasMore = totalVisible < sortedItems.length;
    const categorySeoContent = useMemo(() => {
        if (activeMaterial || activePriceRange) return null;
        if (activeCollection === 'cutting_boards') return BOARD_SEO_CONTENT;
        if (activeCategory === 'all') {
            return seoUrl === '/meubles-anciens' ? CATEGORY_SEO_CONTENT.all : null;
        }
        return CATEGORY_SEO_CONTENT[activeCategory] || null;
    }, [activeCategory, activeCollection, activeMaterial, activePriceRange, seoUrl]);

    // Préchauffe le cache HTTP pour la catégorie survolée (desktop) → ratios déjà calculables
    // au moment où l'utilisateur clique sur la pill. Limité à 8 images pour ne pas saturer.
    const preloadedRef = useRef(new Set());
    const preloadCategory = useCallback((categoryId) => {
        if (activeCollection !== 'furniture') return;
        const key = `${categoryId}-${activeMaterial}-${activePriceRange}-${sortMode}`;
        if (preloadedRef.current.has(key)) return;
        preloadedRef.current.add(key);
        const pool = items.filter((item) => {
            if (categoryId !== 'all' && getFurnitureCategory(item) !== categoryId) return false;
            if (activeMaterial && item.material !== activeMaterial) return false;
            if (priceRange) {
                if (item.priceOnRequest) return false;
                const p = getPrice(item);
                if (p < priceRange.min || p >= priceRange.max) return false;
            }
            return true;
        }).slice(0, 8);
        pool.forEach((item) => {
            const url = item?.images?.[0] || item?.imageUrl || item?.thumbnailUrl;
            if (url) {
                const img = new Image();
                img.decoding = 'async';
                img.src = url;
            }
        });
    }, [activeCollection, items, activeMaterial, activePriceRange, priceRange, sortMode]);

    const scrollToCollection = () => {
        const target = document.getElementById('collection-grid');
        if (!target) return;
        scrollToTarget(target, { offset: -80, duration: 1.05 });
    };

    const pageClass = darkMode
        ? 'bg-[#050605] text-stone-100 selection:bg-[#dba45f] selection:text-black'
        : 'bg-[#f7f0e6] text-stone-950 selection:bg-[#c68a3d] selection:text-white';
    const collectionShellClass = darkMode
        ? 'bg-[#050605]'
        : 'bg-[linear-gradient(180deg,#f7f0e6_0%,#fffaf2_38%,#f2e4d0_100%)]';
    const subtleBorderClass = darkMode ? 'border-[#8a5b2a]/20' : 'border-[#c79b5d]/28';
    const labelClass = darkMode ? 'text-stone-400' : 'text-stone-500';
    const sideCopyClass = darkMode ? 'text-stone-100/85' : 'text-stone-800/85';
    const selectIdleClass = darkMode
        ? 'border-[#8a5b2a]/50 text-stone-200 hover:border-[#dba45f] hover:text-white'
        : 'border-[#c79b5d]/55 bg-white/55 text-stone-700 hover:border-[#b8792f] hover:text-stone-950';
    const selectActiveClass = darkMode
        ? 'border-[#dba45f] text-[#f0b969]'
        : 'border-[#b8792f] bg-[#fff7eb] text-[#8b541b]';
    const optionClass = darkMode ? 'bg-[#0a0a09] text-white' : 'bg-[#fff7eb] text-stone-950';

    return (
        <div className={`w-full min-h-screen overflow-x-hidden ${pageClass}`}>
            <main className="relative overflow-hidden">
                <section className="marketplace-hero relative min-h-[calc(100svh-4rem)] md:min-h-[560px] lg:min-h-[620px] overflow-hidden">
                    {heroConfig.image && (
                        <picture>
                            <source
                                media="(max-width: 767px)"
                                srcSet={heroConfig.mobileSrcSet}
                                sizes="100vw"
                            />
                            <img
                                src={heroConfig.image}
                                srcSet={heroConfig.srcSet}
                                sizes="100vw"
                                alt={heroConfig.alt}
                                className="absolute inset-0 h-full w-full object-cover object-[var(--hero-mobile-position)] md:object-[var(--hero-desktop-position)]"
                                style={{
                                    '--hero-mobile-position': heroConfig.mobileObjectPosition || heroConfig.objectPosition,
                                    '--hero-desktop-position': heroConfig.objectPosition,
                                }}
                                loading="eager"
                                decoding="async"
                                fetchpriority="high"
                            />
                        </picture>
                    )}
                    <div className={`absolute inset-0 ${darkMode ? 'bg-[radial-gradient(circle_at_72%_42%,rgba(0,0,0,0),rgba(0,0,0,0.28)_46%,rgba(0,0,0,0.72)_100%)]' : 'bg-transparent'}`} />
                    <div className={`absolute inset-0 ${darkMode ? 'bg-gradient-to-r from-black/85 via-black/28 to-black/5' : 'bg-[linear-gradient(90deg,rgba(0,0,0,0.50)_0%,rgba(0,0,0,0.28)_22%,rgba(0,0,0,0.08)_40%,rgba(0,0,0,0)_56%)]'}`} />
                    <div className={`absolute inset-x-0 top-0 h-32 ${darkMode ? 'bg-gradient-to-b from-black/70 to-transparent' : 'bg-gradient-to-b from-[#f8f2e8]/16 to-transparent'}`} />

                    <div className="relative z-10 max-w-[1920px] mx-auto px-6 md:px-16 pt-10 md:pt-14 pb-14 md:pb-20 min-h-[calc(100svh-4rem)] md:min-h-[560px] lg:min-h-[620px] flex flex-col justify-start">

                        {/* HAUT — Collection 2026 + switcher centré (mobile/tablette uniquement, sur desktop la nav est dans le header) */}
                        <div className="flex flex-col items-center text-center lg:hidden">
                            <p className="relative top-4 text-[#dba45f] text-[11px] md:text-xs font-black uppercase tracking-[0.42em] mb-10 md:mb-12">
                                Collection 2026
                            </p>
                            <div className="mt-8 md:mt-10">
                                <NeonCollectionSwitcher
                                    activeCollection={activeCollection}
                                    setActiveCollection={setActiveCollection}
                                    setFilter={setFilter}
                                    onOpenShop={onOpenShop}
                                    onCollectionIntent={onCollectionIntent}
                                    onShopIntent={onShopIntent}
                                    darkMode={darkMode}
                                />
                            </div>
                        </div>

                        {/* BAS — Titre + description + CTA */}
                        <div className="marketplace-hero-copy-row mt-14 flex w-full min-w-0 items-end justify-between md:mt-16 lg:mt-auto">
                            <div className="w-full min-w-0 max-w-[calc(100vw-3rem)] md:max-w-2xl">
                                <p className="hidden lg:block text-[#dba45f] text-[11px] md:text-xs font-black uppercase tracking-[0.42em] mb-5 md:mb-7">
                                    Collection 2026
                                </p>
                                <h1 className={`max-w-full font-serif text-[4rem] leading-[0.82] tracking-tight sm:text-[4.6rem] md:text-[7.8rem] lg:text-[8.6rem] ${darkMode ? 'text-white drop-shadow-[0_10px_35px_rgba(0,0,0,0.65)]' : 'text-[#fff4df] drop-shadow-[0_12px_34px_rgba(0,0,0,0.72)]'}`}>
                                    <span className="block h-[1.64em] overflow-hidden">
                                        <TextType
                                            as="span"
                                            text={[
                                                'Made in\nNormandie',
                                                'Tous à\nTable',
                                                'Savoir-\nFaire',
                                                'Pièces\nUniques'
                                            ]}
                                            typingSpeed={115}
                                            deletingSpeed={34}
                                            pauseDuration={1400}
                                            cursorCharacter="_"
                                            cursorClassName="ml-0"
                                            className="inline-block"
                                        />
                                    </span>
                                </h1>
                                <p className={`mt-9 max-w-[20rem] font-serif text-[1.14rem] leading-[1.3] md:mt-11 md:max-w-xl md:text-[1.7rem] md:leading-[1.25] ${darkMode ? 'text-[#efc489]' : 'text-[#f2c27e] drop-shadow-[0_8px_22px_rgba(0,0,0,0.72)]'}`}>
                                    Mobilier ancien restauré et pièces artisanales en bois massif. Chaque meuble raconte une histoire, chaque pièce est unique.
                                </p>
                                <button
                                    onClick={scrollToCollection}
                                    className={`mt-12 inline-flex h-14 w-full max-w-[330px] items-center justify-center gap-4 border border-[#dba45f] px-6 text-[10px] font-black uppercase tracking-[0.22em] transition-all hover:bg-[#dba45f] hover:text-black md:mt-10 md:h-16 md:w-auto md:max-w-none md:gap-6 md:px-10 md:text-xs md:tracking-[0.28em] ${darkMode ? 'text-[#f0b969]' : 'bg-black/22 text-[#fff0cf] shadow-[0_16px_36px_rgba(0,0,0,0.24)] backdrop-blur-[2px]'}`}
                                >
                                    Découvrir la collection
                                    <ArrowRight size={20} strokeWidth={1.5} />
                                </button>
                            </div>
                            <div className="hidden md:flex shrink-0">
                                <AtelierBadge />
                            </div>
                        </div>
                    </div>
                </section>

                <section id="collection-grid" className={`max-w-[1920px] mx-auto px-5 md:px-12 pt-[1.875rem] pb-8 md:py-12 ${collectionShellClass}`}>
                    {/* === HEADER ROW : sidebar label + pills + filters === */}
                    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-10">
                        <aside className="hidden lg:block pt-1">
                            <p className={`${labelClass} text-[10px] font-black uppercase tracking-[0.32em] mb-3`}>
                                {isBoardsCollection ? 'Nos planches' : 'Notre mobilier'}
                            </p>
                            <p className={`font-serif text-[1.05rem] leading-snug ${sideCopyClass}`}>
                                Des pièces uniques,<br />sélectionnées avec exigence.
                            </p>
                        </aside>

                        <div className="min-w-0">
                            {/* Categories pills (top).
                                  Mobile (< md / 768px) : flex-wrap → toutes visibles sur 2 lignes max.
                                  md+ : flex-nowrap + scroll horizontal de secours si jamais ça déborde. */}
                            {showFurnitureCategories && (
                                <div className={`flex flex-wrap md:flex-nowrap items-center gap-1 sm:gap-2 md:gap-3 md:overflow-x-auto no-scrollbar pb-3 md:pb-4 border-b ${subtleBorderClass}`}>
                                {FURNITURE_CATEGORIES.map((category) => {
                                    const active = activeCategory === category.id;
                                    const shortLabel = category.mobileLabel || category.label;
                                    return (
                                        <button
                                            key={category.id}
                                            onMouseEnter={() => preloadCategory(category.id)}
                                            onFocus={() => preloadCategory(category.id)}
                                            onClick={() => {
                                                setActiveCategory(category.id);
                                                onCategoryChange?.(category.id);
                                                resetView();
                                            }}
                                            className={`shrink-0 rounded-full border px-2.5 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.12em] sm:tracking-[0.20em] md:tracking-[0.22em] transition-all ${
                                                active
                                                    ? (darkMode ? 'border-white/80 bg-stone-100 text-stone-900' : 'border-stone-950 bg-stone-950 text-[#fff7eb] shadow-[0_10px_22px_rgba(69,46,21,0.16)]')
                                                    : (darkMode ? 'border-transparent text-stone-300/80 hover:text-white hover:border-[#dba45f]/30' : 'border-transparent text-stone-600 hover:text-stone-950 hover:border-[#b8792f]/45')
                                            }`}
                                        >
                                            {/* Mobile : libellé court (mobileLabel ou label si déjà court) */}
                                            <span className="sm:hidden">{shortLabel}</span>
                                            {/* sm+ : libellé complet */}
                                            <span className="hidden sm:inline">{category.label}</span>
                                        </button>
                                    );
                                })}
                                </div>
                            )}

                            {/* Filter bar — Matière + Prix + Tri + Reset (si au moins un filtre actif).
                                  Tailles & paddings calibrés par breakpoint pour garantir 1 seule ligne
                                  dès 412 px de viewport (cf. audit FrontSymmetry). */}
                            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 md:gap-4 py-3 sm:py-4 md:py-5">
                                <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-wrap">
                                    <span className={`hidden md:inline ${labelClass} text-[10px] font-black uppercase tracking-[0.26em] mr-1`}>Filtrer :</span>

                                    {/* Filtre Matière — masqué si aucune matière renseignée en BDD */}
                                    {materialOptions.length > 0 && (
                                        <span className="relative">
                                            <select
                                                value={activeMaterial}
                                                onChange={(event) => {
                                                    setActiveMaterial(event.target.value);
                                                    resetView();
                                                }}
                                                className={`h-8 sm:h-9 md:h-10 appearance-none rounded-full border bg-transparent pl-3 pr-8 sm:pl-3.5 sm:pr-9 md:pl-4 md:pr-10 text-[9px] md:text-[10px] font-black uppercase tracking-[0.18em] sm:tracking-[0.20em] md:tracking-[0.22em] outline-none transition-colors cursor-pointer ${
                                                    activeMaterial
                                                        ? selectActiveClass
                                                        : selectIdleClass
                                                }`}
                                            >
                                                <option value="" className={optionClass}>Toutes les matières</option>
                                                {materialOptions.map((mat) => (
                                                    <option key={mat} value={mat} className={optionClass}>{mat}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={12} strokeWidth={1.8} className={`pointer-events-none absolute right-2 sm:right-2.5 md:right-3 top-1/2 -translate-y-1/2 md:w-3.5 md:h-3.5 ${activeMaterial ? 'text-[#dba45f]' : 'text-stone-400'}`} />
                                        </span>
                                    )}

                                    {/* Filtre Prix — tranches fixes, exclut les "prix sur demande" */}
                                    <span className="relative">
                                        <select
                                            value={activePriceRange}
                                            onChange={(event) => {
                                                setActivePriceRange(event.target.value);
                                                resetView();
                                            }}
                                            className={`h-8 sm:h-9 md:h-10 appearance-none rounded-full border bg-transparent pl-3 pr-8 sm:pl-3.5 sm:pr-9 md:pl-4 md:pr-10 text-[9px] md:text-[10px] font-black uppercase tracking-[0.18em] sm:tracking-[0.20em] md:tracking-[0.22em] outline-none transition-colors cursor-pointer ${
                                                activePriceRange
                                                    ? selectActiveClass
                                                    : selectIdleClass
                                            }`}
                                        >
                                            <option value="" className={optionClass}>Tous les prix</option>
                                            {PRICE_RANGES.map((range) => (
                                                <option key={range.id} value={range.id} className={optionClass}>{range.label}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={12} strokeWidth={1.8} className={`pointer-events-none absolute right-2 sm:right-2.5 md:right-3 top-1/2 -translate-y-1/2 md:w-3.5 md:h-3.5 ${activePriceRange ? 'text-[#dba45f]' : 'text-stone-400'}`} />
                                    </span>

                                    {/* Réinitialiser — visible uniquement quand au moins un filtre est actif */}
                                    {hasActiveFilters && (
                                        <button
                                            type="button"
                                            onClick={resetAllFilters}
                                            className={`inline-flex h-8 sm:h-9 md:h-10 items-center gap-2 rounded-full px-3 md:px-4 text-[9px] md:text-[10px] font-black uppercase tracking-[0.18em] sm:tracking-[0.20em] md:tracking-[0.22em] transition-colors ${darkMode ? 'text-[#f0b969] hover:text-white' : 'text-[#8a531c] hover:text-stone-950'}`}
                                        >
                                            Réinitialiser
                                        </button>
                                    )}
                                </div>

                                <label className="flex items-center gap-2 md:gap-3">
                                    <span className={`hidden md:inline ${labelClass} text-[10px] font-black uppercase tracking-[0.26em]`}>Trier par :</span>
                                    <span className="relative">
                                        <select
                                            value={sortMode}
                                            onChange={(event) => {
                                                setSortMode(event.target.value);
                                                resetView();
                                            }}
                                            className={`h-8 sm:h-9 md:h-10 appearance-none rounded-full border bg-transparent pl-3 pr-8 sm:pl-3.5 sm:pr-9 md:pl-4 md:pr-10 text-[9px] md:text-[10px] font-black uppercase tracking-[0.18em] sm:tracking-[0.20em] md:tracking-[0.22em] outline-none transition-colors focus:border-[#dba45f] cursor-pointer ${selectIdleClass}`}
                                        >
                                            <option value="curated" className={optionClass}>Sélection variée</option>
                                            <option value="recent" className={optionClass}>Plus récents</option>
                                            <option value="priceAsc" className={optionClass}>Prix croissant</option>
                                            <option value="priceDesc" className={optionClass}>Prix décroissant</option>
                                        </select>
                                        <ChevronDown size={12} strokeWidth={1.8} className="pointer-events-none absolute right-2 sm:right-2.5 md:right-3 top-1/2 -translate-y-1/2 md:w-3.5 md:h-3.5 text-stone-400" />
                                    </span>
                                </label>
                            </div>

                            <CategorySeoIntro content={categorySeoContent} darkMode={darkMode} />
                        </div>
                    </div>

                    {/* === MASONRY JS-DRIVEN ===
                          N colonnes flex-col indépendantes (cf. `useResponsiveCols`). Chaque carte est
                          assignée à une colonne par l'algo "shortest-column-first" et y reste figée
                          (placements gelés via `heightsRef`). Quand on clique "Voir plus", les nouvelles
                          cartes s'insèrent dans la colonne la plus courte AU MOMENT du clic — vrai
                          masonry continu, sans trous sous les colonnes courtes, sans déplacement
                          d'aucune carte existante (les colonnes étant des conteneurs flex séparés,
                          le navigateur ne fait JAMAIS de re-balance). */}
                    {/* Keyframes — apparition cinématographique inspirée du skill `high-end-visual-design` :
                        montée prononcée + blur progressif (effet mise au point objectif) + easing Apple.
                        Le blur se résout à 55% de la durée (focus avant la position finale = sensation de
                        respiration). Animation jouée uniquement sur les items frais (Voir plus). */}
                    <style>{`
                        @keyframes tatCardEnter {
                            0% {
                                opacity: 0;
                                transform: translate3d(0, var(--tat-card-enter-distance, 56px), 0);
                                filter: blur(var(--tat-card-enter-blur, 14px));
                            }
                            55% {
                                filter: blur(0);
                            }
                            100% {
                                opacity: 1;
                                transform: translate3d(0, 0, 0);
                                filter: blur(0);
                            }
                        }
                        .tat-fresh-card {
                            --tat-card-enter-distance: 56px;
                            --tat-card-enter-blur: 14px;
                            --tat-card-enter-duration: ${FRESH_CARD_ANIMATION_MS}ms;
                            animation: tatCardEnter var(--tat-card-enter-duration) cubic-bezier(0.32, 0.72, 0, 1) both;
                            will-change: transform, opacity, filter;
                            backface-visibility: hidden;
                        }
                        .tat-fresh-card > * {
                            transform: translateZ(0);
                        }
                        @media (prefers-reduced-motion: reduce) {
                            .tat-fresh-card {
                                animation: none;
                            }
                        }
                        @media (pointer: coarse) {
                            .tat-fresh-card {
                                --tat-card-enter-distance: 34px;
                                --tat-card-enter-blur: 8px;
                                --tat-card-enter-duration: ${FRESH_CARD_TOUCH_ANIMATION_MS}ms;
                            }
                            .tat-fresh-card > * {
                                transform: none;
                            }
                        }
                        html.tat-low-power-mobile .tat-fresh-card {
                            --tat-card-enter-distance: 24px;
                            --tat-card-enter-blur: 5px;
                            --tat-card-enter-duration: ${FRESH_CARD_CONSTRAINED_ANIMATION_MS}ms;
                            will-change: transform, opacity;
                        }
                        .tat-load-more-button {
                            -webkit-tap-highlight-color: transparent;
                            background: var(--tat-load-more-bg);
                            color: var(--tat-load-more-color);
                        }
                        @media (hover: hover) and (pointer: fine) {
                            .tat-load-more-button:hover:not(:disabled) {
                                background: #dba45f;
                                color: #000;
                            }
                        }
                        @media (pointer: coarse) {
                            .tat-load-more-button:hover,
                            .tat-load-more-button:active {
                                background: var(--tat-load-more-bg);
                                color: var(--tat-load-more-color);
                            }
                        }
                        /* Skip le paint des cartes hors viewport pendant le scroll.
                           Le browser maintient un placeholder de hauteur via contain-intrinsic-size,
                           puis active layout/paint dès que la carte approche du viewport.
                           Gain mesuré : ~5× sur le frame-time scroll d'une grille de 100 cartes.
                           Les cartes hors viewport restent hors paint jusqu'à approche du viewport. */
                        .tat-card-shell {
                            content-visibility: auto;
                            contain-intrinsic-size: auto 480px;
                        }
                        @media (pointer: coarse) {
                            .tat-card-shell {
                                content-visibility: visible;
                                contain-intrinsic-size: auto;
                            }
                        }
                    `}</style>
                    {totalVisible === 0 ? (
                        <div className="min-h-80 border border-[#8a5b2a]/40 flex items-center justify-center text-center">
                            <p className="font-serif text-2xl text-stone-400">Aucune pièce disponible.</p>
                        </div>
                    ) : (
                        // N colonnes flex indépendantes, chacune avec ses items en stack vertical.
                        // Aucune carte ne change de colonne au clic "Voir plus" — les nouveaux items
                        // s'insèrent dans la colonne la plus courte alors que les anciennes restent
                        // exactement où elles sont (DOM stable, pas de re-balance navigateur).
                        <div className="flex gap-3 mt-2 md:mt-4 items-start">
                            {columnsLayout.map((col, colIdx) => (
                                <div key={colIdx} className="flex-1 min-w-0 flex flex-col gap-3">
                                    {col.items.map((item) => {
                                        const delay = freshOrder.get(item.id);
                                        const isFresh = delay !== undefined;
                                        return (
                                            <div
                                                key={item.id}
                                                className={`tat-card-shell ${isFresh ? 'tat-fresh-card' : ''}`}
                                                style={isFresh ? { animationDelay: `${delay}ms` } : undefined}
                                            >
                                                <ProductCard
                                                    item={item}
                                                    onIntent={() => onProductIntent?.(item)}
                                                    onClick={() => onSelectItem(item.id)}
                                                    hideStock={activeCollection === 'furniture'}
                                                    darkMode={darkMode}
                                                    imagePriority={freshPriorityIds.has(item.id)}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    )}

                    {hasMore && (
                        <div className="flex justify-center pt-10">
                            <button
                                type="button"
                                disabled={isPreparingMore}
                                aria-busy={isPreparingMore}
                                onMouseEnter={warmNextBatchIntent}
                                onFocus={warmNextBatchIntent}
                                onPointerDown={warmNextBatchIntent}
                                onClick={loadMore}
                                style={{
                                    '--tat-load-more-bg': darkMode ? 'transparent' : 'rgba(255,255,255,0.45)',
                                    '--tat-load-more-color': darkMode ? '#f0b969' : '#8a531c',
                                }}
                                className={`tat-load-more-button inline-flex h-14 min-w-[280px] items-center justify-center gap-6 border border-[#dba45f] px-8 text-[11px] font-black uppercase tracking-[0.26em] transition-colors disabled:pointer-events-none disabled:opacity-70 ${darkMode ? '' : 'shadow-[0_14px_32px_rgba(92,57,20,0.1)]'}`}
                            >
                                Voir plus de produits
                                <ArrowDown size={18} strokeWidth={1.5} className={isPreparingMore ? 'animate-pulse' : ''} />
                            </button>
                        </div>
                    )}

                    <div className={`mt-10 md:mt-14 grid gap-0 overflow-hidden border md:grid-cols-4 ${darkMode ? 'border-[#8a5b2a]/25 bg-[#15120e]/80' : 'border-[#c79b5d]/30 bg-[#fff8ed]/72 shadow-[0_24px_70px_rgba(102,74,36,0.12)]'}`}>
                        {BENEFITS.map(({ title, body, icon: Icon }, index) => (
                            <div key={title} className={`flex gap-5 p-6 md:p-7 ${index > 0 ? 'border-t md:border-t-0 md:border-l' : ''} ${darkMode ? 'border-[#8a5b2a]/25' : 'border-[#c79b5d]/24'}`}>
                                <Icon size={28} strokeWidth={1.35} className="shrink-0 text-[#dba45f] mt-0.5" />
                                <div>
                                    <h2 className="text-[#dba45f] text-[10px] md:text-[11px] font-black uppercase tracking-[0.24em]">{title}</h2>
                                    <p className={`mt-2 font-serif text-[0.98rem] md:text-[1.05rem] leading-snug ${darkMode ? 'text-stone-200/90' : 'text-stone-700'}`}>{body}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default MarketplaceLayout;
