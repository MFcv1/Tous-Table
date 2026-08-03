import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowLeft, ArrowUpRight, Check, ShieldCheck } from 'lucide-react';
import SEO from '../components/shared/SEO';
import { useAuth } from '../contexts/AuthContext';
import { trackAffiliateClick } from '../utils/tracking';
import { getShopProductPath } from '../utils/seoRoutes';

gsap.registerPlugin(ScrollTrigger);

const CATEGORY_LABELS = {
    huiles: 'Huiles et finitions',
    cires: 'Cires et patines',
    savons: 'Savons et nettoyants',
    accessoires: 'Accessoires atelier',
    renovation: 'Renovation',
    outils: 'Outils'
};

const TIER_LABELS = {
    essentiel: 'Essentiel',
    premium: 'Premium',
    expert: 'Expert'
};

const PROGRAM_LABELS = {
    amazon: 'Amazon',
    manomano: 'ManoMano',
    leroymerlin: 'Leroy Merlin',
    rakuten: 'Rakuten',
    castorama: 'Castorama',
    direct: 'Lien partenaire'
};

const fallbackDraft = (product) => ({
    shortTitle: product?.name || 'Produit du Comptoir',
    correctedBrand: product?.brand || 'Atelier',
    productType: product?.category || 'selection-atelier',
    detailStatus: 'needs-source-check',
    confidence: 'medium',
    detailIntro: product?.description || product?.whyWeRecommend || 'Produit selectionne pour le soin et la restauration du bois.',
    customerDescription: product?.description || product?.whyWeRecommend || 'Ce produit fait partie de la selection du Comptoir. La fiche detail complete sera enrichie avec les sources fabricant, les usages d atelier et les precautions utiles avant achat.',
    useCases: product?.category ? [`Usage ${CATEGORY_LABELS[product.category] || product.category}`] : ['Entretien du bois'],
    strengths: [product?.whyWeRecommend || 'Selection utile pour l atelier'],
    atelierTips: [product?.proTips || product?.proTip || 'Faire un essai discret avant application sur une zone visible.'],
    safetyTitle: "Verifier avant d'appliquer.",
    safetyNotes: ['Lire les consignes du fabricant avant utilisation.'],
    avoidIf: ['Ne pas utiliser sur un support incompatible sans essai prealable.'],
    sourceUrls: []
});

const hostLabel = (value) => {
    try {
        return new URL(value).hostname.replace(/^www\./, '');
    } catch {
        return value;
    }
};

const formatPrice = (price) => {
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0) return 'Prix indicatif';
    return `${value.toFixed(2).replace('.', ',')} EUR`;
};

const formatProductType = (value) => {
    if (!value) return 'Selection atelier';
    return String(value).replace(/[-_]/g, ' ');
};

const safeItems = (items = []) => (
    Array.isArray(items) ? items.filter(Boolean).map(String) : []
);

const buildSchema = (product, draft, path) => {
    const price = Number(product?.price);
    return {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: draft.shortTitle || product?.name,
        description: draft.customerDescription || draft.detailIntro || product?.description,
        image: product?.imageUrl ? [product.imageUrl] : undefined,
        brand: draft.correctedBrand ? { '@type': 'Brand', name: draft.correctedBrand } : undefined,
        offers: {
            '@type': 'Offer',
            priceCurrency: 'EUR',
            ...(Number.isFinite(price) && price > 0 ? { price } : {}),
            availability: 'https://schema.org/InStock',
            url: `https://tousatable-madeinnormandie.fr${path}`
        }
    };
};

const ProductSkeleton = ({ darkMode }) => (
    <main className={`min-h-[100dvh] px-4 pt-28 pb-16 ${darkMode ? 'bg-[#090806]' : 'bg-[#f8f2e8]'}`}>
        <div className="mx-auto grid max-w-[1480px] grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 space-y-5">
                <div className={`h-10 w-40 rounded-full ${darkMode ? 'bg-white/8' : 'bg-stone-900/10'} animate-pulse`} />
                <div className={`h-20 max-w-3xl rounded-3xl ${darkMode ? 'bg-white/8' : 'bg-stone-900/10'} animate-pulse`} />
                <div className={`h-28 max-w-2xl rounded-3xl ${darkMode ? 'bg-white/6' : 'bg-stone-900/8'} animate-pulse`} />
            </div>
            <div className={`lg:col-span-5 aspect-[4/5] rounded-[2rem] ${darkMode ? 'bg-white/8' : 'bg-white/70'} animate-pulse`} />
        </div>
    </main>
);

const AmazonButton = ({ product, onClick, darkMode, className = '' }) => (
    <a
        href={product.affiliateUrl}
        onClick={onClick}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={`group inline-flex w-full items-center justify-between gap-4 rounded-full px-5 py-3.5 text-sm font-black transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] sm:w-auto sm:px-6 sm:py-4 ${darkMode ? 'bg-amber-300 text-stone-950 hover:bg-amber-200' : 'bg-stone-950 text-white hover:bg-stone-800'} ${className}`}
    >
        <span>Acheter</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px] ${darkMode ? 'bg-stone-950 text-amber-200' : 'bg-white/12 text-white'}`}>
            <ArrowUpRight size={16} strokeWidth={1.6} />
        </span>
    </a>
);

const AdviceCard = ({ title, items = [], darkMode, className = '', tone = 'default' }) => {
    const cleanItems = safeItems(items);
    if (cleanItems.length === 0) return null;

    const toneClass = tone === 'warm'
        ? darkMode ? 'bg-amber-300/8 border-amber-300/15' : 'bg-[#fbf0dc] border-[#d4ae75]/45'
        : darkMode ? 'bg-white/[0.035] border-white/10' : 'bg-white/80 border-[#d8c2a2]/60 shadow-[0_20px_70px_rgba(91,64,38,0.07)]';

    return (
        <div className={`shop-detail-reveal rounded-[1.5rem] border p-5 md:p-7 ${toneClass} ${className}`}>
            <p className={`mb-4 text-[10px] font-black uppercase tracking-[0.22em] ${darkMode ? 'text-amber-200/80' : 'text-amber-900/70'}`}>
                {title}
            </p>
            <div className="space-y-3">
                {cleanItems.map((item) => (
                    <div key={item} className="flex gap-3">
                        <Check size={14} strokeWidth={1.7} className={`mt-1 shrink-0 ${darkMode ? 'text-amber-200' : 'text-amber-800'}`} />
                        <p className={`text-sm leading-relaxed md:text-[15px] ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>
                            {item}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};

const Passport = ({ rows, darkMode }) => (
    <div className={`shop-detail-reveal rounded-[1.5rem] border p-4 md:p-5 ${darkMode ? 'bg-white/[0.035] border-white/10' : 'bg-white/70 border-[#d8c2a2]/60'}`}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {rows.map(({ label, value }) => (
                <div key={label} className="min-w-0">
                    <p className={`text-[8px] font-black uppercase tracking-[0.2em] ${darkMode ? 'text-stone-500' : 'text-stone-500'}`}>
                        {label}
                    </p>
                    <p className={`mt-1 truncate text-[12px] font-black capitalize ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>
                        {value}
                    </p>
                </div>
            ))}
        </div>
    </div>
);

const SmoothProductMedia = ({ src, alt }) => {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        setIsLoaded(false);
    }, [src]);

    return (
        <img
            src={src}
            alt={alt}
            className={`relative z-10 h-full w-full object-contain p-7 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.025] md:p-12 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onLoad={() => setIsLoaded(true)}
            onError={() => setIsLoaded(true)}
        />
    );
};

const PurchasePanel = ({ product, draft, brand, sourceLabels, darkMode, onBuy }) => {
    const program = PROGRAM_LABELS[product.affiliateProgram] || product.affiliateProgram || 'Lien partenaire';
    const imageSrc = product.imageUrl || 'https://picsum.photos/seed/atelier-wood-finish/1200/1500';

    return (
        <aside className="shop-detail-media lg:sticky lg:top-28">
            <div className={`rounded-[2rem] p-1.5 ${darkMode ? 'bg-white/7 ring-1 ring-white/10' : 'bg-white/75 ring-1 ring-[#d8c2a2]/70 shadow-[0_30px_100px_rgba(91,64,38,0.14)]'}`}>
                <div className={`overflow-hidden rounded-[calc(2rem-0.375rem)] ${darkMode ? 'bg-[#14110d]' : 'bg-[#eadcc8]'}`}>
                    <div className="relative aspect-[4/5]">
                        <div className={`absolute inset-x-8 bottom-8 top-10 rounded-[999px] ${darkMode ? 'bg-white/5' : 'bg-white/38'}`} />
                        <SmoothProductMedia src={imageSrc} alt={product.name} />
                        <div className={`absolute left-4 top-4 z-20 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] ${darkMode ? 'bg-black/55 text-amber-100' : 'bg-white/85 text-stone-800'}`}>
                            Selection atelier
                        </div>
                    </div>
                    <div className={`border-t p-5 md:p-6 ${darkMode ? 'border-white/10 bg-black/18' : 'border-[#d8c2a2]/55 bg-white/72'}`}>
                        <div className="flex items-start justify-between gap-5">
                            <div>
                                <p className={`text-[9px] font-black uppercase tracking-[0.22em] ${darkMode ? 'text-stone-500' : 'text-stone-500'}`}>Prix indicatif</p>
                                <p className={`mt-1 font-serif text-2xl leading-none ${darkMode ? 'text-white' : 'text-stone-950'}`}>
                                    {formatPrice(product.price)}
                                </p>
                            </div>
                            <div className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] ${darkMode ? 'bg-white/7 text-stone-300' : 'bg-stone-950/6 text-stone-700'}`}>
                                {program}
                            </div>
                        </div>

                        <div className="mt-5">
                            <AmazonButton product={product} onClick={onBuy} darkMode={darkMode} />
                        </div>

                        <div className={`mt-5 rounded-[1.1rem] border p-4 ${darkMode ? 'border-white/10 bg-white/[0.025]' : 'border-[#d8c2a2]/55 bg-[#fbf5ea]'}`}>
                            <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${darkMode ? 'text-stone-500' : 'text-stone-500'}`}>Repere produit</p>
                            <p className={`mt-2 text-sm font-bold leading-relaxed ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>
                                {brand} - {formatProductType(draft.productType)}
                            </p>
                            {sourceLabels.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {sourceLabels.slice(0, 3).map((item) => (
                                        <span key={item} className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${darkMode ? 'bg-white/7 text-stone-400' : 'bg-white text-stone-500'}`}>
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
};

const ShopProductDetail = ({ product, isLoading = false, darkMode = false, onBack, affiliateContext = null }) => {
    const rootRef = useRef(null);
    const { isAdmin } = useAuth();
    const draft = useMemo(() => product?.detailDraft || fallbackDraft(product), [product]);
    const pagePath = useMemo(() => product ? getShopProductPath(product) : '/comptoir', [product]);
    const sourceLabels = useMemo(() => safeItems(draft.sourceUrls).map(hostLabel), [draft.sourceUrls]);

    // WAKE UP & RESET SCROLL
    useEffect(() => {
        const resetScroll = () => {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            if (window.scrollY > 0) window.scrollTo(0, 0);
        };
        resetScroll();
        const t1 = setTimeout(resetScroll, 10);
        const t2 = setTimeout(resetScroll, 50);
        const t3 = setTimeout(resetScroll, 150);
        const t4 = setTimeout(resetScroll, 300);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    }, [product?.id]);

    useGSAP(() => {
        const root = rootRef.current;
        if (!root) return undefined;

        const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced) return undefined;

        const ctx = gsap.context(() => {
            gsap.fromTo('.shop-detail-reveal',
                { y: 34, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 0.85,
                    stagger: 0.06,
                    ease: 'power3.out',
                    scrollTrigger: {
                        trigger: root,
                        start: 'top 82%',
                        once: true
                    }
                }
            );

            const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
            if (!isTouch) {
                gsap.utils.toArray('.shop-detail-media').forEach((el) => {
                    gsap.fromTo(el,
                        { scale: 0.96, opacity: 0.86 },
                        {
                            scale: 1,
                            opacity: 1,
                            duration: 0.95,
                            ease: 'power3.out',
                            scrollTrigger: {
                                trigger: el,
                                start: 'top 86%',
                                once: true
                            }
                        }
                    );
                });
            }
        }, root);

        return () => ctx.revert();
    }, { dependencies: [product?.id], scope: rootRef });

    const handleBuy = (event) => {
        event.preventDefault();
        trackAffiliateClick({
            product,
            source: 'shop_detail',
            isAdmin,
            parentFurnitureId: affiliateContext?.parentFurnitureId || null,
            parentFurnitureName: affiliateContext?.parentFurnitureName || null
        });
    };

    if (isLoading) {
        return <ProductSkeleton darkMode={darkMode} />;
    }

    if (!product) {
        return (
            <main className={`min-h-[100dvh] px-6 pt-32 pb-20 ${darkMode ? 'bg-[#090806] text-white' : 'bg-[#f8f2e8] text-stone-950'}`}>
                <SEO
                    title="Produit Comptoir introuvable"
                    description="Ce produit du Comptoir n'est pas disponible."
                    url="/comptoir"
                    robots="noindex,follow,noarchive"
                />
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-[10px] uppercase tracking-[0.28em] font-black text-amber-700">Le Comptoir</p>
                    <h1 className="mt-5 font-serif text-4xl leading-tight md:text-6xl">Produit introuvable</h1>
                    <p className={`mx-auto mt-5 max-w-xl text-sm leading-relaxed ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>
                        La fiche demandee n'est plus disponible ou n'a pas encore ete chargee.
                    </p>
                    <button
                        type="button"
                        onClick={onBack}
                        className={`mt-8 inline-flex items-center gap-3 rounded-full px-6 py-3.5 text-sm font-black transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] ${darkMode ? 'bg-white text-stone-950' : 'bg-stone-950 text-white'}`}
                    >
                        <ArrowLeft size={15} strokeWidth={1.7} />
                        Retour au Comptoir
                    </button>
                </div>
            </main>
        );
    }

    const schema = buildSchema(product, draft, pagePath);
    const title = draft.shortTitle || product.name;
    const brand = draft.correctedBrand || product.brand || 'Atelier';
    const family = CATEGORY_LABELS[product.category] || product.category || 'Comptoir';
    const tier = TIER_LABELS[product.tier] || product.tier || 'Essentiel';
    const intro = draft.detailIntro || draft.customerDescription;
    const passportRows = [
        { label: 'Marque', value: brand },
        { label: 'Famille', value: family },
        { label: 'Geste', value: formatProductType(draft.productType) },
        { label: 'Niveau', value: tier }
    ];

    return (
        <main ref={rootRef} className={`shop-detail-root overflow-x-hidden w-full max-w-full ${darkMode ? 'bg-[#090806] text-stone-100' : 'bg-[linear-gradient(180deg,#f7efe4_0%,#fffaf2_46%,#eadcc8_100%)] text-stone-950'}`}>
            <SEO
                title={`${title} - Le Comptoir`}
                description={draft.customerDescription || draft.detailIntro}
                image={product.imageUrl}
                url={pagePath}
                type="product"
                schema={schema}
                robots="noindex,follow,max-image-preview:large"
            />

            <section className="relative overflow-hidden px-4 pb-8 pt-24 md:px-10 md:pb-24 md:pt-36 xl:px-14">
                <div className={`absolute inset-x-0 top-0 h-[34rem] pointer-events-none ${darkMode ? 'bg-[radial-gradient(circle_at_78%_16%,rgba(217,151,63,0.18),transparent_33%),radial-gradient(circle_at_18%_10%,rgba(255,255,255,0.07),transparent_24%)]' : 'bg-[radial-gradient(circle_at_78%_16%,rgba(177,111,45,0.16),transparent_33%),radial-gradient(circle_at_18%_10%,rgba(255,255,255,0.82),transparent_24%)]'}`} />

                <div className="relative mx-auto grid max-w-[1480px] grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-12 lg:items-start">
                    <div className="shop-detail-reveal lg:col-span-7">
                        <button
                            type="button"
                            onClick={onBack}
                            className={`mb-6 inline-flex items-center gap-3 rounded-full px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] md:mb-8 ${darkMode ? 'bg-white/8 text-stone-300 hover:bg-white/12' : 'bg-white/78 text-stone-700 hover:bg-white'}`}
                        >
                            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${darkMode ? 'bg-white/10' : 'bg-stone-950 text-white'}`}>
                                <ArrowLeft size={14} strokeWidth={1.7} />
                            </span>
                            Comptoir
                        </button>

                        <div className="mb-4 flex flex-wrap items-center gap-2.5 md:mb-5">
                            <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${darkMode ? 'bg-amber-300/10 text-amber-100' : 'bg-white/80 text-amber-900/80'}`}>
                                {brand}
                            </span>
                            <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${darkMode ? 'bg-white/7 text-stone-300' : 'bg-stone-950/6 text-stone-700'}`}>
                                {family}
                            </span>
                        </div>

                        <h1 className={`max-w-5xl font-serif text-[clamp(2.65rem,5.9vw,6.9rem)] leading-[0.92] tracking-tight ${darkMode ? 'text-white' : 'text-stone-950'}`}>
                            {title}
                        </h1>

                        <p className={`mt-6 max-w-3xl text-base leading-relaxed md:text-xl md:leading-relaxed ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>
                            {draft.customerDescription || draft.detailIntro}
                        </p>

                        <div className="mt-6 md:mt-8">
                            <Passport rows={passportRows} darkMode={darkMode} />
                        </div>

                    </div>

                    <div className="lg:col-span-5">
                        <PurchasePanel
                            product={product}
                            draft={draft}
                            brand={brand}
                            sourceLabels={sourceLabels}
                            darkMode={darkMode}
                            onBuy={handleBuy}
                        />
                    </div>
                </div>
            </section>

            <section className="px-4 pt-6 pb-10 md:px-10 md:py-28 xl:px-14">
                <div className="mx-auto grid max-w-[1480px] grid-flow-dense grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
                    <div className={`shop-detail-reveal rounded-[1.75rem] border p-6 md:p-10 lg:col-span-7 ${darkMode ? 'bg-white/[0.035] border-white/10' : 'bg-white/82 border-[#d8c2a2]/60 shadow-[0_22px_80px_rgba(91,64,38,0.08)]'}`}>
                        <p className={`mb-4 text-[10px] font-black uppercase tracking-[0.24em] ${darkMode ? 'text-amber-200/80' : 'text-amber-900/75'}`}>Le bon usage</p>
                        <p className={`font-serif text-3xl leading-tight md:text-5xl ${darkMode ? 'text-white' : 'text-stone-950'}`}>
                            {intro}
                        </p>
                    </div>

                    <AdviceCard className="lg:col-span-5" title="Quand l'utiliser" items={draft.useCases} darkMode={darkMode} tone="warm" />
                    <AdviceCard className="lg:col-span-4" title="Pourquoi ce choix" items={draft.strengths} darkMode={darkMode} />
                    <AdviceCard className="lg:col-span-4" title="Geste d'atelier" items={draft.atelierTips} darkMode={darkMode} />
                    <AdviceCard className="lg:col-span-4" title="A eviter si" items={draft.avoidIf} darkMode={darkMode} />
                </div>
            </section>

            <section className="px-4 pt-2 pb-10 md:px-10 md:pb-28 xl:px-14">
                <div className={`shop-detail-reveal mx-auto grid max-w-[1480px] gap-6 rounded-[2rem] p-6 md:grid-cols-[0.85fr_1.15fr] md:gap-10 md:p-12 ${darkMode ? 'bg-[#120f0a] border border-amber-300/10' : 'bg-[#24170d] text-white shadow-[0_30px_110px_rgba(67,39,18,0.22)]'}`}>
                    <div>
                        <div className="flex items-center gap-3 text-amber-200/75">
                            <ShieldCheck size={18} strokeWidth={1.5} />
                            <p className="text-[10px] font-black uppercase tracking-[0.26em]">Avant utilisation</p>
                        </div>
                        <h2 className="mt-4 font-serif text-4xl leading-[0.98] md:text-6xl">{draft.safetyTitle || "Verifier avant d'appliquer."}</h2>
                    </div>
                    <div className="space-y-4">
                        {safeItems(draft.safetyNotes).map((item) => (
                            <div key={item} className="flex gap-4">
                                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-amber-200" />
                                <p className="text-sm leading-relaxed text-stone-200 md:text-base">{item}</p>
                            </div>
                        ))}
                        {sourceLabels.length > 0 && (
                            <div className="pt-4">
                                <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-stone-400">Sources consultees</p>
                                <div className="flex flex-wrap gap-2">
                                    {sourceLabels.map((item) => (
                                        <span key={item} className="rounded-full bg-white/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-stone-300">
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section className="px-4 pb-16 md:px-10 md:pb-36 xl:px-14">
                <div className={`shop-detail-reveal mx-auto max-w-[980px] rounded-[2rem] border p-6 text-center md:p-10 ${darkMode ? 'bg-white/[0.035] border-white/10' : 'bg-white/82 border-[#d8c2a2]/60 shadow-[0_22px_80px_rgba(91,64,38,0.08)]'}`}>
                    <p className={`mx-auto max-w-2xl text-base leading-relaxed md:text-xl ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>
                        La fiche reste ici pour garder les conseils, les precautions et le contexte d'usage sous la main. Le bouton ouvre Amazon dans un nouvel onglet.
                    </p>
                    <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row md:mt-8">
                        <AmazonButton product={product} onClick={handleBuy} darkMode={darkMode} />
                        <button
                            type="button"
                            onClick={onBack}
                            className={`inline-flex w-full items-center justify-center gap-3 rounded-full px-5 py-3.5 text-sm font-black transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] sm:w-auto ${darkMode ? 'bg-white/7 text-stone-200 hover:bg-white/12' : 'bg-stone-950/6 text-stone-700 hover:bg-stone-950/10'}`}
                        >
                            <ArrowLeft size={15} strokeWidth={1.7} />
                            Retour au Comptoir
                        </button>
                    </div>
                </div>
            </section>
        </main>
    );
};

export default ShopProductDetail;
