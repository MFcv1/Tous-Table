import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, ArrowUp, MapPin, Hammer, Menu, X, ShoppingBag, Truck, ChevronRight, ChevronLeft, Star, MessageSquareHeart } from 'lucide-react';
import SEO from '../components/shared/SEO';
import { SITE_URL, getProductPath } from '../utils/seoRoutes';
import { applyHomeSEODefaultSelections } from '../utils/homeSEOSettings';

gsap.registerPlugin(ScrollTrigger);

const localCities = [
    { name: 'Ifs', x: 49, y: 62, primary: true },
    { name: 'Caen', x: 51, y: 48, primary: true },
    { name: 'Mondeville', x: 58, y: 50 },
    { name: 'Hérouville-Saint-Clair', shortName: 'Hérouville', x: 56, y: 39 },
    { name: 'Ouistreham', x: 58, y: 20 },
    { name: 'Bayeux', x: 26, y: 42 },
    { name: 'Courseulles-sur-Mer', x: 36, y: 24 },
    { name: 'Cabourg', x: 74, y: 29 },
    { name: 'Deauville', x: 86, y: 31 },
    { name: 'Lisieux', x: 82, y: 62 },
    { name: 'Falaise', x: 55, y: 83 },
    { name: 'Vire Normandie', x: 20, y: 86 },
];

const localFocusCards = [
    {
        title: 'Tables de ferme',
        text: 'Plateaux anciens, bois massif et grandes tablées familiales.',
        search: '12 pièces disponibles',
        image: '/images/gallery/cat_table_ferme.png',
    },
    {
        title: 'Buffets & enfilades',
        text: 'Rangement ancien, belle patine et présence discrète dans la pièce.',
        search: '8 pièces disponibles',
        image: '/images/gallery/cat_buffet.png',
    },
    {
        title: 'Armoires & commodes',
        text: 'Pièces verticales et meubles de caractère restaurés à l\'atelier.',
        search: '7 pièces disponibles',
        image: '/images/gallery/cat_armoire.png',
    },
    {
        title: 'Bois massif & entretien',
        text: 'Planches, finitions et conseils pour conserver la matière vivante.',
        search: 'Guides & accessoires',
        image: '/images/gallery/hero-planches-2026-960.webp',
    },
];

const CalvadosEditorialMap = () => (
    <svg viewBox="0 0 720 480" role="img" aria-labelledby="calvados-map-title calvados-map-desc" className="h-full w-full">
        <title id="calvados-map-title">Carte stylisee du Calvados autour d Ifs et Caen</title>
        <desc id="calvados-map-desc">Carte lisible du Calvados avec la cote, Caen, Ifs, Bayeux, Lisieux, Falaise, Vire, Deauville et les axes routiers principaux.</desc>
        <defs>
            <linearGradient id="tatMapLand" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#f8e5bd" />
                <stop offset="0.58" stopColor="#d7a866" />
                <stop offset="1" stopColor="#7b4b25" />
            </linearGradient>
            <linearGradient id="tatMapSea" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#173246" />
                <stop offset="1" stopColor="#0a151b" />
            </linearGradient>
            <filter id="tatMapGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0.95 0 1 0 0 0.70 0 0 1 0 0.38 0 0 0 0.35 0" />
                <feMerge>
                    <feMergeNode />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>
        <rect width="720" height="480" rx="36" fill="#160f09" />
        <path d="M0 0H720V138C660 118 623 128 578 108C532 87 476 47 407 55C340 63 297 94 232 96C170 98 118 68 70 87C43 98 20 118 0 142V0Z" fill="url(#tatMapSea)" opacity="0.9" />
        <path d="M58 126C112 92 178 126 232 121C294 115 329 82 397 76C465 70 520 111 574 131C625 150 669 132 696 153C711 165 704 197 685 221C661 251 642 276 637 317C632 359 589 376 538 371C492 366 465 407 416 418C355 431 313 393 262 402C212 411 180 382 158 345C134 304 89 306 62 275C35 244 26 199 43 163C47 153 51 139 58 126Z" fill="url(#tatMapLand)" opacity="0.82" />
        <path d="M58 126C112 92 178 126 232 121C294 115 329 82 397 76C465 70 520 111 574 131C625 150 669 132 696 153C711 165 704 197 685 221C661 251 642 276 637 317C632 359 589 376 538 371C492 366 465 407 416 418C355 431 313 393 262 402C212 411 180 382 158 345C134 304 89 306 62 275C35 244 26 199 43 163C47 153 51 139 58 126Z" fill="none" stroke="#f6d697" strokeWidth="4" strokeLinejoin="round" opacity="0.82" />
        <path d="M87 147C134 131 165 143 209 141C256 138 288 113 342 103C401 91 442 105 489 128C535 151 596 164 666 157" fill="none" stroke="#f6d697" strokeWidth="2" strokeDasharray="9 12" opacity="0.44" />
        <path d="M338 185C384 189 425 204 471 226C509 244 552 248 611 242" fill="none" stroke="#f4c36f" strokeWidth="5" strokeLinecap="round" opacity="0.55" />
        <path d="M335 185C307 216 282 254 252 302C228 341 194 365 148 374" fill="none" stroke="#f4c36f" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
        <path d="M337 185C331 227 333 263 352 302C370 338 396 369 427 402" fill="none" stroke="#f4c36f" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
        <path d="M337 185C311 169 284 163 248 165C205 167 170 181 128 205" fill="none" stroke="#f4c36f" strokeWidth="3" strokeLinecap="round" opacity="0.42" />
        <path d="M320 197C315 221 313 238 307 260" fill="none" stroke="#fff3d1" strokeWidth="3" strokeDasharray="8 8" strokeLinecap="round" />
        {[
            ['Bayeux', 142, 204, 'end'],
            ['Courseulles-sur-Mer', 210, 143, 'middle'],
            ['Ouistreham', 364, 112, 'middle'],
            ['Cabourg', 515, 146, 'middle'],
            ['Deauville', 612, 161, 'middle'],
            ['Caen', 336, 184, 'start'],
            ['Ifs', 305, 263, 'middle'],
            ['Mondeville', 386, 205, 'start'],
            ['Lisieux', 594, 290, 'middle'],
            ['Falaise', 394, 380, 'middle'],
            ['Vire Normandie', 123, 386, 'middle'],
        ].map(([label, x, y, anchor]) => {
            const isPrimary = label === 'Caen' || label === 'Ifs';
            return (
                <g key={label} filter={isPrimary ? 'url(#tatMapGlow)' : undefined}>
                    <circle cx={x} cy={y} r={isPrimary ? 8 : 4.5} fill={isPrimary ? '#fff0bf' : '#f2c779'} stroke="#2b190b" strokeWidth="2" />
                    <text x={x} y={isPrimary ? y - 14 : y - 10} textAnchor={anchor} fill={isPrimary ? '#fff8e7' : '#f7dab0'} fontSize={isPrimary ? 17 : 12} fontWeight="800" letterSpacing="1.3">
                        {label}
                    </text>
                </g>
            );
        })}
        <text x="42" y="442" fill="#f5d08c" fontSize="13" fontWeight="800" letterSpacing="2.4">CALVADOS / CAEN / IFS / NORMANDIE</text>
    </svg>
);

const faqItems = [
    {
        q: 'Où voir les meubles anciens près de Caen ?',
        a: 'L atelier Tous à Table est situé à Ifs, au sud de Caen. Les meubles anciens disponibles sont présentés en ligne et peuvent être découverts sur rendez-vous selon les pièces visibles au showroom.',
    },
    {
        q: 'Proposez-vous des tables de ferme anciennes en Normandie ?',
        a: 'Oui, la collection peut inclure des tables de ferme anciennes, tables en chêne, buffets, armoires, commodes, chaises, bancs et pièces singulières restaurées ou préparées près de Caen.',
    },
    {
        q: 'La livraison est-elle possible hors Calvados ?',
        a: 'La livraison peut être étudiée autour de Caen, en Normandie, dans toute la France et vers les pays frontaliers selon le meuble, l accès et le transporteur retenu.',
    },
    {
        q: 'Les meubles sont-ils tous identiques ?',
        a: 'Non. Chaque meuble ancien est une pièce unique avec ses dimensions, son bois, sa patine, son histoire et son niveau de restauration. La disponibilité évolue au rythme des arrivages.',
    },
    {
        q: 'Le Comptoir sert à quoi ?',
        a: 'Le Comptoir rassemble des produits et accessoires utiles pour entretenir le bois massif, protéger une table, nourrir une finition ou prolonger la vie d un meuble ancien au quotidien.',
    },
];

const getItemImage = (item) => item?.images?.[0] || item?.imageUrl || item?.thumbnailUrl || '';
const getShopImage = (product) => product?.imageUrl || product?.thumbnailUrl || product?.images?.[0] || product?.gallery?.[0] || '';

const formatPrice = (value) => {
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) return '';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price);
};

const splitWords = (text) => text.split(' ').map((word, index) => (
    <span key={`${word}-${index}`} className="tat-root-word inline-block opacity-25">
        {word}&nbsp;
    </span>
));

const useScrollDirection = () => {
    const [scrollDirection, setScrollDirection] = useState("up");
    const [prevOffset, setPrevOffset] = useState(0);

    useEffect(() => {
        const toggleScrollDirection = () => {
            let scrollY = window.pageYOffset;
            if (scrollY === 0) {
                setScrollDirection("up");
            }
            if (scrollY > prevOffset && scrollY > 50) {
                setScrollDirection("down");
            } else if (scrollY < prevOffset) {
                setScrollDirection("up");
            }
            setPrevOffset(scrollY);
        };
        window.addEventListener("scroll", toggleScrollDirection);
        return () => {
            window.removeEventListener("scroll", toggleScrollDirection);
        };
    }, [prevOffset]);

    return scrollDirection === "up";
};

const RootLandingView = ({
    items = [],
    affiliateProducts = [],
    homeSEOSettings = {},
    darkMode = true,
    onOpenGallery,
    onOpenShop,
    onOpenAbout,
    onOpenDelivery,
    onSelectItem,
}) => {
    const rootRef = useRef(null);
    const showHeader = useScrollDirection();
    const [showBackToTop, setShowBackToTop] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showReviewOverlay, setShowReviewOverlay] = useState(false);
    const mapRef = useRef(null);
    const hasAutoFlippedRef = useRef(false);
    
    useEffect(() => {
        if (!mapRef.current) return;
        
        let timeout;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !hasAutoFlippedRef.current) {
                timeout = setTimeout(() => {
                    if (!hasAutoFlippedRef.current) {
                        setShowReviewOverlay(true);
                        hasAutoFlippedRef.current = true;
                    }
                }, 5000);
            } else {
                clearTimeout(timeout);
            }
        }, { threshold: 0.6 });
        
        observer.observe(mapRef.current);
        
        return () => {
            observer.disconnect();
            clearTimeout(timeout);
        };
    }, []);

    const handleToggleReview = (show) => {
        setShowReviewOverlay(show);
        hasAutoFlippedRef.current = true;
    };

    const comptoirScrollRef = useRef(null);
    const handleComptoirScroll = (direction) => {
        if (comptoirScrollRef.current) {
            const { scrollLeft, clientWidth } = comptoirScrollRef.current;
            const scrollAmount = clientWidth * 0.75;
            const scrollTo = direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount;
            comptoirScrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

    const getFamilyLabel = (family) => {
        switch (family) {
            case 'huiles': return 'Protection Profonde';
            case 'cires': return 'Patine & Finition';
            case 'savons': return 'Le Geste Quotidien';
            case 'accessoires': return "L'Essentiel du Quotidien";
            default: return 'Sélection Atelier';
        }
    };

    const homeSEO = useMemo(
        () => applyHomeSEODefaultSelections(homeSEOSettings, items, affiliateProducts),
        [homeSEOSettings, items, affiliateProducts]
    );

    const carouselProducts = useMemo(() => {
        const categories = [
            { family: 'huiles', count: 2, defaultName: ['Rubio Monocoat Oil Plus 2C', 'Osmo Polyx-Oil 3032 MAT'], defaultBrand: ['Rubio Monocoat', 'Osmo'], defaultPrice: [38, 29], defaultImg: ['https://images.unsplash.com/photo-1617897903246-719242758050?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1541532713592-79a0317b6b77?auto=format&fit=crop&w=600&q=80'] },
            { family: 'cires', count: 2, defaultName: ['Cire Black Bison Liberon', 'Rust-Oleum Chalky Finish'], defaultBrand: ['Liberon', 'Rust-Oleum'], defaultPrice: [18, 22], defaultImg: ['https://images.unsplash.com/photo-1601612628452-9e99ced43524?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=600&q=80'] },
            { family: 'savons', count: 2, defaultName: ['Osmo Wash & Care 8016', 'Savon Doux pour Bois Liberon'], defaultBrand: ['Osmo', 'Liberon'], defaultPrice: [19, 15], defaultImg: ['https://images.unsplash.com/photo-1558403135-c144da5373ab?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1607006342411-1a90d7968b31?auto=format&fit=crop&w=600&q=80'] },
            { family: 'accessoires', count: 2, defaultName: ['Pinceau Plat "Le Spalter"', 'Bahco 474 Racloir d\'%bǸniste'], defaultBrand: ['Liberon', 'Bahco'], defaultPrice: [12, 14], defaultImg: ['https://images.unsplash.com/photo-1520408222757-6f9f95d87d5d?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=600&q=80'] }
        ];

        let result = [];
        categories.forEach((cat) => {
            const dbProducts = affiliateProducts
                .filter(p => p.category === cat.family && p.status === 'published')
                .slice(0, cat.count)
                .map(p => ({
                    ...p,
                    family: p.category,
                    currentPrice: p.price
                }));
            result.push(...dbProducts);
            
            // Fill with fallbacks if database lacks items
            const remaining = cat.count - dbProducts.length;
            for (let i = 0; i < remaining; i++) {
                const index = dbProducts.length + i;
                result.push({
                    id: `fallback-${cat.family}-${index}`,
                    name: cat.defaultName[index],
                    brand: cat.defaultBrand[index],
                    family: cat.family,
                    imageUrl: cat.defaultImg[index],
                    currentPrice: cat.defaultPrice[index],
                    detailDraft: { shortTitle: cat.defaultName[index].split(' (')[0] }
                });
            }
        });
        const selectedProducts = homeSEO.comptoirProductIds
            .map((id) => affiliateProducts.find((product) => product.id === id && product.status === 'published'))
            .filter(Boolean);

        if (selectedProducts.length === 0) return result;

        const selectedIds = new Set(selectedProducts.map((product) => product.id));
        return [
            ...selectedProducts,
            ...result.filter((product) => !selectedIds.has(product.id)),
        ];
    }, [affiliateProducts, homeSEO.comptoirProductIds]);

    const shopHighlights = useMemo(() => affiliateProducts
        .filter((product) => product.status === 'published')
        .slice(0, 3), [affiliateProducts]);

    const fallbackFurniture = [
        { id: 'fallback-table', name: 'Tables de ferme anciennes', material: 'Chêne et bois massif', imageUrl: '/images/gallery/hero-buffet-parisien-2026-960.webp' },
        { id: 'fallback-buffet', name: 'Buffets anciens restaurés', material: 'Rangement de caractère', imageUrl: '/images/gallery/hero-buffet-parisien-2026-1440.webp' },
        { id: 'fallback-armoire', name: 'Armoires et commodes anciennes', material: 'Pièces uniques', imageUrl: '/images/gallery/hero-buffet-parisien-2026-2020.webp' },
        { id: 'fallback-planche', name: 'Planches anciennes en bois massif', material: 'Cuisine et table', imageUrl: '/images/gallery/hero-planches-2026-960.webp' },
    ];

    const featuredItems = useMemo(() => {
        const selectedItems = homeSEO.featuredFurnitureIds
            .map((id) => items.find((item) => item.id === id && item.status === 'published' && item.auctionActive !== true && !item.sold))
            .filter(Boolean);
        const selectedIds = new Set(selectedItems.map((item) => item.id));
        const fallbackItems = items
            .filter((item) => item.status === 'published' && item.auctionActive !== true && !item.sold && !selectedIds.has(item.id));
        return [...selectedItems, ...fallbackItems].slice(0, 4);
    }, [homeSEO.featuredFurnitureIds, items]);

    const visibleFurniture = featuredItems.length > 0 ? featuredItems : fallbackFurniture;
    const featuredList = featuredItems.slice(0, 4).map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}${getProductPath(item)}`,
        name: item.name,
    }));

    const rootSchema = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebPage',
                '@id': `${SITE_URL}/#webpage`,
                url: `${SITE_URL}/`,
                name: homeSEO.heroTitle,
                description: homeSEO.heroDescription,
                isPartOf: { '@id': `${SITE_URL}/#website` },
                about: { '@id': `${SITE_URL}/#atelier` },
            },
            {
                '@type': 'WebSite',
                '@id': `${SITE_URL}/#website`,
                url: SITE_URL,
                name: 'Tous à Table Made in Normandie',
                publisher: { '@id': `${SITE_URL}/#atelier` },
            },
            {
                '@type': ['FurnitureStore', 'LocalBusiness'],
                '@id': `${SITE_URL}/#atelier`,
                name: 'Tous à Table Made in Normandie',
                url: SITE_URL,
                telephone: '+33 7 77 32 41 78',
                priceRange: 'EUR 100 - EUR 3000',
                address: {
                    '@type': 'PostalAddress',
                    streetAddress: '346 Chemin de Fleury',
                    addressLocality: 'Ifs',
                    addressRegion: 'Normandie',
                    postalCode: '14123',
                    addressCountry: 'FR',
                },
                geo: {
                    '@type': 'GeoCoordinates',
                    latitude: 49.1417,
                    longitude: -0.3472,
                },
                areaServed: localCities.map((city) => ({ '@type': 'City', name: city.name })),
                knowsAbout: [
                    'meubles anciens à Caen',
                    'table de ferme ancienne',
                    'buffet ancien en bois massif',
                    'armoire ancienne restaurée',
                    'restauration de meubles anciens',
                    'livraison de meubles anciens en Normandie',
                ],
                hasOfferCatalog: {
                    '@type': 'OfferCatalog',
                    name: 'Meubles anciens restaurés et entretien du bois',
                    itemListElement: [
                        { '@type': 'OfferCatalog', name: 'Tables de ferme anciennes' },
                        { '@type': 'OfferCatalog', name: 'Buffets anciens et bahuts' },
                        { '@type': 'OfferCatalog', name: 'Armoires, commodes et chevets anciens' },
                        { '@type': 'OfferCatalog', name: 'Produits d entretien pour bois massif' },
                    ],
                },
            },
            ...(featuredList.length > 0 ? [{
                '@type': 'ItemList',
                '@id': `${SITE_URL}/#featured-furniture`,
                name: 'Meubles anciens en vedette',
                itemListElement: featuredList,
            }] : []),
            {
                '@type': 'FAQPage',
                '@id': `${SITE_URL}/#faq`,
                mainEntity: faqItems.map((item) => ({
                    '@type': 'Question',
                    name: item.q,
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: item.a,
                    },
                })),
            },
        ],
    };

    useGSAP(() => {
        const mm = gsap.matchMedia();

        mm.add('(prefers-reduced-motion: reduce)', () => {
            gsap.set('.tat-root-nav, .tat-root-hero-copy > *, .tat-root-reveal, .tat-root-media, .tat-root-word', {
                clearProps: 'transform',
                opacity: 1,
            });
        });

        mm.add('(prefers-reduced-motion: no-preference)', () => {
            gsap.from('.tat-root-nav', { y: -24, opacity: 0, duration: 0.8, ease: 'power3.out' });
            gsap.from('.tat-root-hero-copy > *', { y: 42, opacity: 0, duration: 1, stagger: 0.08, ease: 'power3.out', delay: 0.15 });
            gsap.from('.tat-root-hero-carousel', { scale: 1.04, opacity: 0, duration: 1.1, ease: 'power3.out', delay: 0.2 });
            gsap.utils.toArray('.tat-root-reveal:not(.tat-root-map-card):not(.tat-root-focus-card):not(.tat-root-delivery-card)').forEach((element) => {
                gsap.from(element, {
                    y: 34,
                    opacity: 0,
                    duration: 0.78,
                    ease: 'power3.out',
                    scrollTrigger: { trigger: element, start: 'top 96%' },
                });
            });
            gsap.fromTo('.tat-root-map-card',
                { x: -26, y: 18, opacity: 0, scale: 0.985 },
                {
                    x: 0,
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    duration: 0.75,
                    ease: 'power3.out',
                    scrollTrigger: { trigger: '.tat-root-local-grid', start: 'top 88%' },
                });
            gsap.fromTo('.tat-root-local-grid .tat-root-focus-card',
                { y: 32, opacity: 0, scale: 0.95 },
                {
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    duration: 0.85,
                    stagger: 0.1,
                    ease: 'back.out(1.2)',
                    scrollTrigger: { trigger: '.tat-root-local-grid', start: 'top 86%' },
                });
            gsap.fromTo('.tat-root-delivery-card',
                { y: 26, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 0.62,
                    ease: 'power3.out',
                    scrollTrigger: { trigger: '.tat-root-delivery-card', start: 'top 90%' },
                });
            gsap.utils.toArray('.tat-root-product-card').forEach((element, index) => {
                gsap.fromTo(element, 
                    { y: 38, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.78,
                        ease: 'power3.out',
                        scrollTrigger: { trigger: element, start: 'top 90%' },
                    });
            });
            gsap.to('.tat-root-word', {
                opacity: 1,
                stagger: 0.025,
                ease: 'none',
                scrollTrigger: { trigger: '.tat-root-story', start: 'top 78%', end: 'bottom 46%', scrub: 0.8 },
            });
            gsap.fromTo('.tat-root-cta-shell', { scale: 0.94, opacity: 0.76 }, {
                scale: 1,
                opacity: 1,
                ease: 'none',
                scrollTrigger: { trigger: '.tat-root-cta-shell', start: 'top 88%', end: 'bottom 60%', scrub: 0.7 },
            });
        });

        return () => mm.revert();
    }, { scope: rootRef });

    const handleInternalNav = (event, callback) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        callback?.();
    };

    useEffect(() => {
        let rafId = 0;
        const updateBackToTop = () => {
            rafId = 0;
            setShowBackToTop(window.scrollY > 520);
        };
        const onScroll = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(updateBackToTop);
        };
        updateBackToTop();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, []);

    const handleBackToTop = () => {
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    };

    return (
        <main ref={rootRef} className="w-full max-w-full overflow-x-hidden bg-[#090806] text-[#fff8ec] selection:bg-[#dba45f] selection:text-black">
            <SEO
                title={homeSEO.heroTitle}
                description={homeSEO.heroDescription}
                url="/"
                schema={rootSchema}
                appendSiteTitle={false}
            />

                        <div className="fixed left-4 right-4 top-4 z-[120] md:left-1/2 md:right-auto md:top-6 md:w-[calc(100%-2rem)] md:max-w-6xl md:-translate-x-1/2" style={{ pointerEvents: 'none' }}>
                {/* Premium Double Bezel Floating Navigation Bar */}
                <div className={`relative w-full p-1.5 bg-white/[0.02] border border-white/5 rounded-[2rem] shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:rounded-full ${showHeader ? 'translate-y-0 opacity-100' : '-translate-y-28 opacity-0'}`} style={{ pointerEvents: 'auto' }}>
                    <nav className="tat-root-nav flex w-full items-center justify-between gap-2 rounded-[1.6rem] border border-white/10 bg-black/75 px-2 py-2 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] md:rounded-full md:gap-5 md:px-4">
                        <a href="/" onClick={() => setIsMobileMenuOpen(false)} className="group flex min-w-0 shrink-0 items-center gap-2 rounded-full border border-[#f0c987]/12 bg-[#120d08]/72 py-1 pl-1 pr-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_34px_rgba(0,0,0,0.22)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[#f0c987]/28 hover:bg-[#171007]/88 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_42px_rgba(0,0,0,0.28)] md:gap-3 md:py-1.5 md:pl-1.5 md:pr-3.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#f4d29a]/26 bg-[linear-gradient(145deg,rgba(244,210,154,0.2),rgba(219,164,95,0.06)_48%,rgba(10,8,5,0.86))] p-[3px] text-[#f6d8a3] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_8px_22px_rgba(219,164,95,0.13)] md:h-11 md:w-11">
                                <span className="flex h-full w-full items-center justify-center rounded-full border border-black/40 bg-[#080604] shadow-[inset_0_1px_0_rgba(255,255,255,0.11)]">
                                    <Hammer size={15} strokeWidth={1.55} className="md:h-[17px] md:w-[17px]" />
                                </span>
                            </span>
                            <span className="min-w-0 pr-0.5">
                                <span className="block truncate font-serif text-[0.98rem] leading-none tracking-[0.03em] text-[#fff8ec] md:text-[1.12rem]">Tous à Table</span>
                                <span className="mt-1 block truncate text-[7.5px] font-black uppercase tracking-[0.24em] text-[#f0c987]/86 md:mt-1.5 md:text-[8.5px] md:tracking-[0.28em]">Atelier à Ifs</span>
                            </span>
                        </a>
                        <div className="hidden items-center gap-5 text-[10px] font-black uppercase tracking-[0.18em] text-white/66 md:flex lg:gap-7 lg:tracking-[0.22em]">
                            <a href="/meubles-anciens" onClick={(event) => handleInternalNav(event, onOpenGallery)} className="transition-colors hover:text-[#f0c987]">Galerie</a>
                            <a href="/comptoir" onClick={(event) => handleInternalNav(event, onOpenShop)} className="transition-colors hover:text-[#f0c987]">Comptoir</a>
                            <a href="/a-propos" onClick={(event) => handleInternalNav(event, onOpenAbout)} className="transition-colors hover:text-[#f0c987]">Atelier</a>
                            <a href="/livraison-meubles-anciens-france" onClick={(event) => handleInternalNav(event, onOpenDelivery)} className="transition-colors hover:text-[#f0c987]">Livraison</a>
                        </div>
                        <a href="/meubles-anciens" onClick={(event) => handleInternalNav(event, onOpenGallery)} className="group hidden h-10 shrink-0 items-center justify-between gap-3 rounded-full bg-[#f0c987] pl-5 pr-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-stone-950 transition-all duration-300 hover:bg-[#f6d8a3] hover:shadow-[0_0_20px_rgba(240,201,135,0.22)] active:scale-[0.98] md:inline-flex">
                            Découvrir
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-950/10 text-stone-950 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:scale-105">
                                <ArrowRight size={13} strokeWidth={2.5} />
                            </span>
                        </a>
                        <button
                            type="button"
                            aria-label={isMobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                            aria-expanded={isMobileMenuOpen}
                            onClick={() => setIsMobileMenuOpen((value) => !value)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#f0c987]/18 bg-white/[0.055] text-[#f6d8a3] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-all duration-300 md:hidden"
                        >
                            {isMobileMenuOpen ? <X size={17} strokeWidth={1.9} /> : <Menu size={18} strokeWidth={1.9} />}
                        </button>
                    </nav>
                    <div className={`overflow-hidden transition-all duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden ${isMobileMenuOpen ? 'mt-2 max-h-80 opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="rounded-[1.55rem] border border-white/10 bg-black/82 p-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_22px_54px_rgba(0,0,0,0.36)] backdrop-blur-2xl">
                            <div className="grid grid-cols-2 gap-2">
                                <a href="/meubles-anciens" onClick={(event) => { setIsMobileMenuOpen(false); handleInternalNav(event, onOpenGallery); }} className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.18em] text-white/82 transition-colors">Galerie</a>
                                <a href="/comptoir" onClick={(event) => { setIsMobileMenuOpen(false); handleInternalNav(event, onOpenShop); }} className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.18em] text-white/82 transition-colors">Comptoir</a>
                                <a href="/a-propos" onClick={(event) => { setIsMobileMenuOpen(false); handleInternalNav(event, onOpenAbout); }} className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.18em] text-white/82 transition-colors">Atelier</a>
                                <a href="/livraison-meubles-anciens-france" onClick={(event) => { setIsMobileMenuOpen(false); handleInternalNav(event, onOpenDelivery); }} className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.18em] text-white/82 transition-colors">Livraison</a>
                            </div>
                            <a href="/meubles-anciens" onClick={(event) => { setIsMobileMenuOpen(false); handleInternalNav(event, onOpenGallery); }} className="mt-2 flex h-11 items-center justify-between rounded-full bg-[#f0c987] pl-5 pr-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-stone-950">
                                Découvrir
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-950/10">
                                    <ArrowRight size={14} strokeWidth={2.4} />
                                </span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <section className="relative min-h-[80svh] overflow-hidden px-5 pb-2 pt-36 md:px-10 md:pb-12 md:pt-44 xl:pt-48 xl:px-16">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_18%,rgba(219,164,95,0.28),transparent_32%),radial-gradient(circle_at_14%_18%,rgba(255,255,255,0.08),transparent_24%),linear-gradient(180deg,#090806_0%,#17100a_54%,#090806_100%)]" />
                <div className="relative mx-auto grid w-full max-w-[1560px] min-w-0 items-center gap-10 md:gap-12 lg:grid-cols-12">
                    <div className="tat-root-hero-copy w-full max-w-[calc(100vw-2.5rem)] min-w-0 lg:col-span-7 lg:max-w-none">
                        <p className="mb-7 max-w-2xl text-[10px] font-black uppercase tracking-[0.34em] text-[#dba45f]">{homeSEO.heroEyebrow}</p>
                        <h1 className="max-w-full font-serif text-[clamp(3.4rem,8.4vw,9.4rem)] leading-[0.84] tracking-[-0.055em] text-white md:max-w-6xl">
                            {homeSEO.heroTitle}
                        </h1>
                        <p className="mt-8 max-w-full text-lg leading-relaxed text-stone-300 md:max-w-2xl md:text-2xl md:leading-relaxed">
                            {homeSEO.heroDescription}
                        </p>
                        <div className="mt-8 grid w-full grid-cols-2 gap-2.5 sm:mt-10 sm:flex sm:flex-row sm:gap-3">
                            <a href="/meubles-anciens" onClick={(event) => handleInternalNav(event, onOpenGallery)} className="group inline-flex h-12 min-w-0 items-center justify-between gap-2 rounded-full bg-[#f0c987] pl-4 pr-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-stone-950 transition-all duration-300 md:hover:bg-[#f6d8a3] md:hover:shadow-[0_0_30px_rgba(240,201,135,0.22)] md:active:scale-[0.98] sm:h-14 sm:w-auto sm:justify-start sm:gap-4 sm:pl-7 sm:pr-3 sm:text-[11px] sm:tracking-[0.22em]">
                                <span className="sm:hidden">Galerie</span>
                                <span className="hidden sm:inline">Découvrir la galerie</span>
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-950/10 text-stone-950 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] md:group-hover:translate-x-1 md:group-hover:scale-105 sm:h-10 sm:w-10">
                                    <ArrowRight size={14} strokeWidth={2.2} />
                                </span>
                            </a>
                            <a href="/livraison-meubles-anciens-france" onClick={(event) => handleInternalNav(event, onOpenDelivery)} className="group inline-flex h-12 min-w-0 items-center justify-between gap-2 rounded-full border border-white/12 bg-white/5 pl-4 pr-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-white transition-all duration-300 md:hover:border-white/20 md:hover:bg-white/10 md:active:scale-[0.98] sm:h-14 sm:w-auto sm:justify-start sm:gap-4 sm:pl-7 sm:pr-3 sm:text-[11px] sm:tracking-[0.22em]">
                                <span className="sm:hidden">Livraison</span>
                                <span className="hidden sm:inline">Livraison France</span>
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] md:group-hover:translate-x-1 md:group-hover:scale-105 sm:h-10 sm:w-10">
                                    <Truck size={14} strokeWidth={1.8} />
                                </span>
                            </a>
                        </div>
                    </div>
                    <div className="tat-root-media relative w-full max-w-[calc(100vw-2.5rem)] min-w-0 pb-8 md:pb-0 lg:col-span-5 lg:max-w-none">
                        {/* High-End Double Bezel Hero Carousel Outer Wrapper */}
                        <div className="tat-root-hero-carousel relative p-2 bg-white/[0.02] border border-white/5 rounded-[2.6rem] shadow-[0_50px_160px_rgba(0,0,0,0.5)] md:rounded-[3.4rem] lg:h-[min(56svh,580px)] lg:aspect-auto xl:h-[min(58svh,620px)]">
                            
                            {/* SYNERGISTIC ARCHITECTURAL FRAME */}
                            {/* Top Line */}
                            <div className="absolute -top-16 left-[-100vw] right-[-100vw] h-px bg-white/[0.06] [mask-image:linear-gradient(to_right,transparent_34%,black_45%,black_55%,transparent_70%)] hidden lg:block pointer-events-none" />
                            {/* Bottom Line (slightly longer on the left) */}
                            <div className="absolute -bottom-16 left-[-100vw] right-[-100vw] h-px bg-white/[0.06] [mask-image:linear-gradient(to_right,transparent_31%,black_45%,black_55%,transparent_70%)] hidden lg:block pointer-events-none" />
                            <div className="absolute -left-16 -right-16 top-[-100vh] bottom-[-100vh] border-x border-white/[0.06] [mask-image:linear-gradient(to_bottom,transparent_30%,black_45%,black_55%,transparent_70%)] hidden lg:block pointer-events-none" />

                            {/* Inner Core */}
                            <div className="relative w-full h-full aspect-[4/5] lg:aspect-auto overflow-hidden rounded-[2.1rem] bg-stone-900 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] border border-white/10 md:rounded-[2.9rem]">
                            {homeSEO.heroSlides.map((slide, index) => (
                                <picture key={slide.key || index} className={`tat-root-hero-slide tat-root-hero-slide-${index + 1} absolute inset-0 block h-full w-full`}>
                                    <source media="(max-width: 767px)" srcSet={slide.mobile} />
                                    <img
                                        src={slide.image || slide.desktop}
                                        alt={slide.alt}
                                        className="h-full w-full object-cover object-center opacity-95 contrast-110 saturate-[1.02]"
                                        loading={index === 0 ? 'eager' : 'lazy'}
                                        decoding="async"
                                        fetchpriority={index === 0 ? 'high' : 'auto'}
                                        sizes="(max-width: 767px) 350px, (max-width: 1279px) 45vw, 620px"
                                    />
                                </picture>
                            ))}
                            </div>
                        </div>
                        {/* High-End Double Bezel Location Card Wrapper */}
                        <div className="absolute bottom-1 left-8 right-6 rounded-[1.45rem] border border-white/5 bg-white/[0.02] p-1 backdrop-blur-2xl shadow-[0_18px_58px_rgba(0,0,0,0.34)] md:-bottom-8 md:-left-8 md:right-[14rem] md:rounded-[1.85rem] md:p-1.5 xl:right-[16rem]">
                            <div className="rounded-[1.05rem] border border-white/10 bg-black/75 p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] md:rounded-[1.4rem] md:p-4">
                                <div className="flex items-start gap-3 md:gap-4">
                                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 text-[#dba45f] md:h-8 md:w-8">
                                        <MapPin size={14} strokeWidth={2} className="md:h-4 md:w-4" />
                                    </div>
                                                                <p className="text-[11px] leading-snug text-stone-300 md:text-[13px] md:leading-relaxed">{homeSEO.heroLocationText}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <button
                type="button"
                onClick={handleBackToTop}
                aria-label="Remonter en haut de page"
                className={`group fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[90] rounded-full bg-transparent p-0 shadow-none transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:right-7 md:border md:border-white/8 md:bg-white/[0.035] md:p-1.5 md:shadow-[0_24px_70px_rgba(0,0,0,0.38)] md:backdrop-blur-2xl ${showBackToTop ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-5 opacity-0'}`}
            >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[#f0c987]/30 bg-[#0b0805] text-[#f6d8a3] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_30px_rgba(0,0,0,0.22)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:border-[#f0c987]/18 md:bg-[linear-gradient(145deg,rgba(244,210,154,0.16),rgba(8,6,4,0.94)_52%,rgba(18,13,8,0.98))] md:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_0_1px_rgba(219,164,95,0.05),0_12px_34px_rgba(219,164,95,0.1)] md:group-hover:border-[#f0c987]/45 md:group-hover:bg-[#120d08] md:group-hover:text-[#fff1cf] md:group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_34px_rgba(240,201,135,0.18)] md:group-active:scale-[0.97]">
                    <ArrowUp size={18} strokeWidth={1.7} />
                </span>
            </button>

            <section id="showroom" className="tat-root-story px-5 pb-10 pt-12 md:px-10 md:py-40 xl:px-16">
                <div className="mx-auto grid max-w-[1480px] gap-12 lg:grid-cols-12 lg:gap-16">
                    <div className="lg:col-span-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#dba45f]">Mobilier ancien, ancrage local</p>
                    </div>
                    <div className="lg:col-span-8">
                        <h2 className="max-w-5xl font-serif text-[clamp(2.7rem,5.8vw,7rem)] leading-[0.92] tracking-[-0.045em] text-white">
                            {splitWords('Un showroom à Ifs pour relier le Calvados, Caen, la Normandie et les maisons qui cherchent une pièce avec une âme.')}
                        </h2>
                    </div>
                </div>
            </section>

            <section className="px-3 pb-12 md:px-10 md:pb-44 xl:px-16">
                <div className="tat-root-local-grid mx-auto grid max-w-[1320px] gap-4 lg:grid-cols-12 lg:items-stretch">
                    <div className="tat-root-reveal tat-root-map-card flex flex-col rounded-[1.6rem] border border-white/5 bg-white/[0.02] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.3)] md:rounded-[2rem] lg:col-span-6">
                        <div className="flex h-full flex-col rounded-[1.2rem] border border-white/5 bg-[#13100d]/90 p-4 md:rounded-[1.6rem] md:p-5 lg:px-7 lg:py-5">
                            <div className="mb-4 shrink-0 flex items-start justify-between gap-4 md:mb-5 md:gap-5">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#dba45f]">Ancrage Calvados</p>
                                    <h2 className="mt-2 max-w-xl font-serif text-[clamp(1.8rem,2.5vw,2.2rem)] leading-none tracking-[-0.03em] text-white">Carte locale autour d'Ifs et Caen</h2>
                                </div>
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-[#dba45f]">
                                    <MapPin size={18} strokeWidth={1.5} />
                                </div>
                            </div>
                            <div ref={mapRef} className="tat-root-map-frame relative flex-1 w-full min-h-[350px] [perspective:1200px]">
                            {/* 3D FLIP CONTAINER */}
                            <div className={`relative h-full w-full transition-transform duration-[1.1s] ease-[cubic-bezier(0.23,1,0.32,1)] [transform-style:preserve-3d] ${showReviewOverlay ? '[transform:rotateY(180deg)]' : ''}`}>
                                
                                {/* FRONT FACE : MAP */}
                                <div className={`absolute inset-0 h-full w-full overflow-hidden rounded-[1rem] bg-[#160f09] text-white md:rounded-[1.2rem] [backface-visibility:hidden] [-webkit-backface-visibility:hidden] ${showReviewOverlay ? 'pointer-events-none' : ''}`}>
                                    <iframe 
                                        src="https://maps.google.com/maps?q=Tous%20%C3%A0%20Table%20made%20in%20Normandie,%20Chemin%20de%20Fleury,%20Ifs,%20France&t=&z=9&ie=UTF8&iwloc=&output=embed"
                                        className="absolute left-[-250px] top-[-250px] h-[calc(100%+620px)] w-[calc(100%+500px)] max-w-none border-0 transition-all duration-700 hover:[filter:none] [filter:sepia(0.3)_contrast(0.95)_brightness(0.95)_hue-rotate(-10deg)]"
                                        allowFullScreen=""
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                        title="Carte interactive Tous à Table made in Normandie"
                                    />
                                    {/* Action Button */}
                                    <button
                                        onClick={() => handleToggleReview(true)}
                                        className="absolute bottom-1.5 right-1.5 flex items-center justify-center gap-2 rounded-full border border-white/20 bg-[#160f09]/80 px-4 py-2.5 text-xs font-black uppercase tracking-[0.1em] text-white shadow-xl backdrop-blur-md transition-all hover:bg-[#8a531c] md:bottom-2.5 md:right-2.5 md:left-auto md:px-5 md:py-3.5"
                                    >
                                        <MessageSquareHeart size={16} />
                                        Laisser un avis
                                    </button>
                                </div>
                                
                                {/* CUSTOM PLACECARD COVER (PREMIUM FLOATING DOUBLE-BEZEL) */}
                                <div className={`pointer-events-auto absolute left-1.5 top-1.5 z-10 rounded-[1.2rem] border border-white/10 bg-white/[0.02] p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md transition-opacity duration-700 md:left-2.5 md:top-2.5 md:rounded-[1.4rem] md:p-2 [backface-visibility:hidden] [-webkit-backface-visibility:hidden] ${showReviewOverlay ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
                                    <div className="flex w-[260px] flex-col rounded-[0.825rem] border border-white/5 bg-[#160f09] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:w-[280px] md:rounded-[0.9rem] md:p-4">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h3 className="font-serif text-[17px] leading-tight text-[#f3dfbd] md:text-[19px]">Tous à Table</h3>
                                                <p className="mt-0.5 text-[10px] leading-snug text-[#f3dfbd]/70 md:text-[11px]">Showroom d'ameublement ancien<br />346 Chem. de Fleury, 14123 Ifs</p>
                                            </div>
                                            <a 
                                                href="https://www.google.com/maps/dir/?api=1&destination=Tous+à+Table+made+in+Normandie,+Chemin+de+Fleury,+Ifs,+France"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="Créer un itinéraire vers l'atelier"
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-[#dba45f] transition-all hover:scale-110 hover:bg-[#dba45f] hover:text-[#160f09] active:scale-95"
                                            >
                                                <MapPin size={16} />
                                            </a>
                                        </div>
                                        <div className="mt-2.5 flex items-center gap-2 border-t border-white/5 pt-2.5">
                                            <span className="text-[11px] font-bold text-white">5,0</span>
                                            <div className="flex gap-0.5 text-[#dba45f]">
                                                <Star size={10} fill="currentColor" />
                                                <Star size={10} fill="currentColor" />
                                                <Star size={10} fill="currentColor" />
                                                <Star size={10} fill="currentColor" />
                                                <Star size={10} fill="currentColor" />
                                            </div>
                                            <span className="text-[9.5px] text-stone-500">(10 avis Google)</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* BACK FACE : REVIEW CTA */}
                                <div className={`absolute inset-0 flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[1rem] border border-[#8a531c]/10 bg-[#fff9ea] px-6 text-center shadow-[inset_0_4px_24px_rgba(0,0,0,0.04)] md:rounded-[1.2rem] [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(180deg)] ${showReviewOverlay ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                                    <button
                                        onClick={() => handleToggleReview(false)}
                                        className="absolute right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[#f3dfbd] text-[#8a531c] transition-colors hover:bg-[#8a531c] hover:text-white"
                                    >
                                        <X size={18} />
                                    </button>
                                    
                                    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm border border-stone-200/60 md:h-16 md:w-16 md:mb-6">
                                        <svg viewBox="0 0 24 24" width="26" height="26" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                        </svg>
                                    </div>
                                    
                                    <h3 className="mb-3 font-serif text-[clamp(1.6rem,2vw,2.2rem)] leading-tight text-stone-900">Soutenez l'atelier</h3>
                                    <p className="mb-8 max-w-[280px] text-xs leading-relaxed text-stone-600 md:max-w-sm md:text-sm">
                                        Les avis sur Google nous aident à faire découvrir nos meubles anciens restaurés à de nouvelles maisons. Merci pour votre soutien !
                                    </p>
                                    
                                    <a
                                        href="https://g.page/r/CepClsGcSHS2EBM/review"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-3 rounded-full bg-[#160f09] px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-[#f3dfbd] transition-transform hover:scale-105 active:scale-95 md:px-8 md:py-4 md:text-xs"
                                    >
                                        Écrire un avis Google
                                    </a>
                                </div>
                                
                            </div>
                        </div>
                    </div>
                </div>
                    <div className="flex flex-col rounded-[1.6rem] border border-white/5 bg-white/[0.02] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.3)] md:rounded-[2rem] lg:col-span-6">
                        <div className="flex h-full flex-col rounded-[1.2rem] border border-white/5 bg-[#13100d]/90 p-4 md:rounded-[1.6rem] md:p-5 lg:px-7 lg:py-5">
                            <div className="mb-4 md:mb-5">
                                <h3 className="font-serif text-[clamp(1.8rem,2.5vw,2.2rem)] leading-none tracking-[-0.03em] text-white">Explorer la collection</h3>
                                <p className="mt-2 text-[11px] leading-relaxed text-stone-300 md:text-[13px]">Des meubles anciens choisis, restaurés et prêts à vivre dans la maison.</p>
                            </div>
                            <div className="flex flex-1 flex-col gap-[3px] md:gap-1.5">
                                {localFocusCards.map((card, index) => (
                                    <React.Fragment key={card.title}>
                                        <a href="/meubles-anciens" onClick={(event) => handleInternalNav(event, onOpenGallery)} className="tat-root-reveal tat-root-focus-card group relative flex items-center gap-3 rounded-[1rem] p-1.5 transition-all duration-300 md:gap-4 md:p-2 md:hover:bg-white/[0.04]">
                                            {/* HIGH-END DOUBLE BEZEL FRAME */}
                                            <div className="relative shrink-0 p-[2px] md:p-1 rounded-[10px] md:rounded-[14px] bg-white/[0.02] border border-white/5 shadow-md">
                                                <div className="relative h-[60px] w-[88px] md:h-[76px] md:w-[124px] overflow-hidden rounded-[8px] md:rounded-[11px] bg-stone-900 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] ring-1 ring-inset ring-white/10">
                                                    <img src={card.image} alt={card.title} className="h-full w-full object-cover opacity-90" loading="lazy" decoding="async" />
                                                </div>
                                            </div>
                                            <div className="flex flex-1 flex-col justify-center min-w-0 pr-6">
                                                <h4 className="truncate font-serif text-[1.1rem] leading-none tracking-[-0.02em] text-white md:text-[1.3rem]">{card.title}</h4>
                                                <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-stone-400 md:mt-1.5 md:text-[11.5px]">{card.text}</p>
                                                <p className="mt-1.5 truncate text-[9px] font-black uppercase tracking-[0.16em] text-[#dba45f] md:mt-2 md:text-[10px]">{card.search}</p>
                                            </div>
                                            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center text-white/40 transition-colors group-hover:text-[#dba45f] md:right-4">
                                                <ArrowRight size={16} strokeWidth={2} />
                                            </div>
                                        </a>
                                        {index < localFocusCards.length - 1 && (
                                            <div className="h-px w-full bg-white/5" />
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    </div>
                    <a href="/livraison-meubles-anciens-france" onClick={(event) => handleInternalNav(event, onOpenDelivery)} className="tat-root-reveal tat-root-delivery-card group rounded-[1.6rem] border border-[#f0c987]/35 bg-[#f0c987] p-6 text-stone-950 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] md:hover:-translate-y-1 md:rounded-[2rem] md:p-8 lg:p-10 xl:p-12 lg:col-span-12">
                        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#8a531c]">Transport étudié pièce par pièce</p>
                                <h3 className="mt-3 max-w-2xl font-serif text-3xl leading-none tracking-[-0.04em] md:text-4xl">Livraison en Normandie, France et pays frontaliers.</h3>
                            </div>
                            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white transition-transform md:group-hover:-translate-y-1 md:group-hover:translate-x-1">
                                <Truck size={18} strokeWidth={1.7} />
                            </span>
                        </div>
                    </a>
                </div>
            </section>

            <section id="galerie" className="bg-[#f8f2e8] px-3 pb-12 pt-14 text-stone-950 md:px-10 md:py-44 xl:px-16">
                <div className="mx-auto max-w-[1480px]">
                    <div className="tat-root-reveal mb-12 flex flex-col justify-between gap-8 md:flex-row md:items-end">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#8a531c]">{homeSEO.featuredEyebrow}</p>
                            <h2 className="mt-5 max-w-4xl font-serif text-[clamp(2.8rem,6vw,7rem)] leading-[0.9] tracking-[-0.05em]">{homeSEO.featuredTitle}</h2>
                        </div>
                        <a href="/meubles-anciens" onClick={(event) => handleInternalNav(event, onOpenGallery)} className="inline-flex h-12 items-center justify-center gap-3 rounded-full bg-stone-950 px-6 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-transform md:hover:scale-[1.02]">
                            Voir plus
                            <ArrowRight size={15} />
                        </a>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:gap-5 lg:gap-6 xl:grid-cols-4">
                        {visibleFurniture.map((item, index) => {
                            const image = getItemImage(item);
                            const price = formatPrice(item.currentPrice ?? item.startingPrice ?? item.price);
                            const isRealProduct = featuredItems.some((featured) => featured.id === item.id);
                            const href = isRealProduct ? getProductPath(item) : '/meubles-anciens';
                            const handleCardClick = (event) => {
                                if (!isRealProduct || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                                event.preventDefault();
                                onSelectItem?.(item.id);
                            };
                            return (
                                <a key={item.id || item.name} href={href} onClick={handleCardClick} className="tat-root-reveal tat-root-product-card group block rounded-[1.8rem] border border-[#e8dac1]/50 bg-[#fdfbf7] p-1.5 shadow-[0_16px_40px_rgba(43,28,14,0.04),0_1px_2px_rgba(43,28,14,0.01)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] md:rounded-[2.2rem] md:p-2 md:hover:-translate-y-1.5 md:hover:border-[#8a531c]/32 md:hover:shadow-[0_30px_70px_rgba(43,28,14,0.12)]">
                                    <div className="relative aspect-[1/1.08] overflow-hidden rounded-[1.35rem] bg-stone-200 ring-1 ring-inset ring-black/5 md:m-0.5 md:aspect-[4/5] md:rounded-[1.6rem]">
                                        {image && <img src={image} alt={item.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />}
                                    </div>
                                    <div className="flex flex-col justify-between px-3 pb-3 pt-3 md:p-5 lg:p-6">
                                        <div>
                                            <p className="truncate text-[7.5px] font-black uppercase tracking-[0.22em] text-[#8a531c] md:text-[9px] md:tracking-[0.28em]">{item.material || 'Bois massif'}</p>
                                            <h3 className="mt-2 line-clamp-2 min-h-[2.35rem] font-serif text-[1.05rem] leading-tight tracking-[-0.02em] text-stone-950 md:mt-2.5 md:min-h-[2.8rem] md:text-[clamp(1.2rem,1.55vw,1.6rem)]">{item.name}</h3>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-stone-100/60 pt-2.5 md:mt-6 md:gap-3 md:pt-4">
                                            <span className="font-serif text-sm font-semibold text-stone-950 md:text-base">{price || 'Pièce unique'}</span>
                                            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200/50 bg-stone-50 text-stone-600 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] md:h-9 md:w-9 md:group-hover:border-transparent md:group-hover:bg-[#8a531c] md:group-hover:text-white">
                                                <ChevronRight className="transition-transform md:group-hover:-translate-y-0.5 md:group-hover:translate-x-0.5" size={15} />
                                            </span>
                                        </div>
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section id="comptoir" className="relative overflow-hidden px-5 pb-12 pt-14 md:px-10 md:py-22 xl:px-16 xl:py-24">
                <div className="mx-auto max-w-[1480px]">
                    {/* Header Row */}
                    <div className="tat-root-reveal mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                        <div className="max-w-4xl">
                            <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#dba45f]">{homeSEO.comptoirEyebrow}</p>
                            <h2 className="mt-4 font-serif text-[clamp(2.4rem,4.5vw,5rem)] leading-[0.92] tracking-[-0.05em] text-white">
                                {homeSEO.comptoirTitle}
                            </h2>
                            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone-300 md:text-base">
                                {homeSEO.comptoirDescription}
                            </p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                            <a href="/comptoir" onClick={(event) => handleInternalNav(event, onOpenShop)} className="inline-flex h-11 items-center justify-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-6 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-transform md:hover:scale-[1.02] md:active:scale-[0.98]">
                                Tout voir
                                <ShoppingBag size={14} />
                            </a>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => handleComptoirScroll('left')}
                                    className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white transition-all md:hover:bg-white/10 md:active:scale-95"
                                    aria-label="Précédent"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button 
                                    onClick={() => handleComptoirScroll('right')}
                                    className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white transition-all md:hover:bg-white/10 md:active:scale-95"
                                    aria-label="Suivant"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Carousel Container */}
                    <div 
                        ref={comptoirScrollRef}
                        className="flex gap-5 md:gap-6 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-4 w-full cursor-grab active:cursor-grabbing"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {carouselProducts.map((product, index) => {
                            const image = getShopImage(product);
                            return (
                                <a 
                                    key={product.id || product.name} 
                                    href="/comptoir" 
                                    onClick={(event) => handleInternalNav(event, onOpenShop)} 
                                    className="tat-root-reveal tat-root-product-card group flex flex-col p-1.5 bg-white/[0.02] rounded-[1.8rem] border border-white/5 shadow-[0_16px_40px_rgba(0,0,0,0.3)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] shrink-0 w-[210px] sm:w-[240px] md:w-[270px] snap-start md:hover:-translate-y-1.5 md:hover:border-[#dba45f]/25"
                                >
                                    <div className="flex flex-1 flex-col bg-[#13100d]/90 rounded-[1.5rem] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-white/[0.03]">
                                        <div className="aspect-[1.1] overflow-hidden rounded-[1.2rem] m-0.5 relative ring-1 ring-inset ring-white/5 bg-[#e8d9c6] flex items-center justify-center p-2.5">
                                            {image && (
                                                <img 
                                                    src={image} 
                                                    alt={product.name} 
                                                    className="w-full h-full object-contain mix-blend-multiply opacity-95 transition-opacity" 
                                                    loading="lazy" 
                                                    decoding="async" 
                                                />
                                            )}
                                            {/* Category Tag overlay on image top-right */}
                                            <span className="absolute top-3 right-3 rounded-full bg-black/60 border border-white/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-[#dba45f] backdrop-blur-md">
                                                {getFamilyLabel(product.family)}
                                            </span>
                                        </div>
                                        <div className="p-3 md:p-3.5 flex flex-1 flex-col justify-between">
                                            <div>
                                                <p className="truncate text-[8px] font-black uppercase tracking-[0.2em] text-[#dba45f]/80 md:text-[9px] md:tracking-[0.24em]">
                                                    {product.brand || 'Sélection atelier'}
                                                </p>
                                                <h3 className="mt-1.5 font-serif text-[clamp(0.96rem,1.1vw,1.14rem)] leading-tight tracking-[-0.02em] text-white min-h-[2rem] line-clamp-2">
                                                    {product.detailDraft?.shortTitle || product.name}
                                                </h3>
                                            </div>
                                            <div className="mt-3.5 pt-2 border-t border-white/5 flex items-center justify-between gap-2.5">
                                                <span className="text-sm md:text-[15px] font-serif font-bold text-stone-200">
                                                    {product.currentPrice ? (typeof product.currentPrice === 'number' || !isNaN(product.currentPrice) ? `${Number(product.currentPrice).toFixed(2).replace('.', ',')} €` : `${product.currentPrice} €`) : 'Voir prix'}
                                                </span>
                                                <span className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] md:group-hover:bg-[#dba45f] md:group-hover:text-black md:group-hover:border-transparent">
                                                    <ChevronRight className="transition-transform md:group-hover:-translate-y-0.5 md:group-hover:translate-x-0.5" size={16} />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="bg-[#f8f2e8] px-5 pb-12 pt-14 text-stone-950 md:px-10 md:py-44 xl:px-16">
                <div className="mx-auto max-w-5xl">
                    <div className="tat-root-reveal text-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#8a531c]">Questions fréquentes</p>
                        <h2 className="mt-5 font-serif text-[clamp(2.8rem,6vw,6.8rem)] leading-[0.9] tracking-[-0.05em]">Avant de venir au showroom.</h2>
                    </div>
                    <div className="mt-14 divide-y divide-stone-950/12 border-y border-stone-950/12">
                        {faqItems.map((item) => (
                            <details key={item.q} className="tat-root-reveal group py-6 open:pb-7 md:py-7 md:open:pb-8">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-serif text-[1.28rem] leading-snug tracking-[-0.02em] md:gap-6 md:text-3xl md:leading-tight md:tracking-[-0.025em]">
                                    {item.q}
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white transition-transform group-open:rotate-90"><ArrowRight size={14} /></span>
                                </summary>
                                <p className="mt-5 max-w-3xl text-base leading-relaxed text-stone-600 md:text-lg">{item.a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            <section id="cta-galerie" className="px-5 pb-12 pt-10 md:px-10 md:py-44 xl:px-16">
                <div className="tat-root-reveal tat-root-cta-shell relative mx-auto max-w-[1480px] overflow-hidden rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_80%_20%,rgba(219,164,95,0.22),transparent_30%),#120d09] p-8 shadow-[0_40px_140px_rgba(0,0,0,0.42)] md:rounded-[3.5rem] md:p-14 lg:p-20">
                    <div className="pointer-events-none absolute inset-x-8 top-8 hidden h-px overflow-hidden bg-white/10 md:block">
                        <span className="tat-root-shimmer-line block h-full w-1/3 bg-gradient-to-r from-transparent via-[#f0c987] to-transparent" />
                    </div>
                    <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
                        <div className="lg:col-span-8">
                            <h2 className="font-serif text-[clamp(3.2rem,7vw,8.8rem)] leading-[0.84] tracking-[-0.055em] text-white">Voir les meubles anciens disponibles.</h2>
                            <p className="mt-6 max-w-2xl text-[0.94rem] leading-[1.58] text-stone-300 md:mt-7 md:text-base md:leading-relaxed">La galerie reste l espace principal pour filtrer les buffets, tables, chaises, armoires, commodes, planches et pièces uniques actuellement publiées.</p>
                        </div>
                        <div className="flex flex-col gap-3 lg:col-span-4 lg:items-end">
                            <a href="/meubles-anciens" onClick={(event) => handleInternalNav(event, onOpenGallery)} className="group inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[#f0c987] px-5 text-[10px] font-black uppercase tracking-[0.18em] text-stone-950 transition-[background-color,box-shadow,color,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:h-14 md:gap-3 md:px-7 md:text-[11px] md:tracking-[0.22em] md:hover:bg-[#f6d89c] md:hover:shadow-[0_14px_40px_rgba(240,201,135,0.16)] lg:w-auto">
                                Entrer dans la galerie
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-950/10 transition-[background-color,color,box-shadow] duration-500 md:group-hover:bg-stone-950/14">
                                    <ArrowRight size={15} />
                                </span>
                            </a>
                            <a href="/a-propos" onClick={(event) => handleInternalNav(event, onOpenAbout)} className="group inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-white/16 px-5 text-[10px] font-black uppercase tracking-[0.18em] text-white transition-[background-color,box-shadow,color,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:h-14 md:gap-3 md:px-7 md:text-[11px] md:tracking-[0.22em] md:hover:border-white/26 md:hover:bg-white/[0.08] md:hover:shadow-[0_14px_40px_rgba(255,255,255,0.08)] lg:w-auto">
                                Découvrir l atelier
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition-[background-color,color,box-shadow] duration-500 md:group-hover:bg-white/16">
                                    <ArrowRight size={15} />
                                </span>
                            </a>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
};

export default RootLandingView;
