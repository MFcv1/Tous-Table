import React, { useEffect, useState } from 'react';
import { useLiveTheme } from '../../../hooks/useLiveTheme';
import { useAuth } from '../../../contexts/AuthContext';
import { LogIn, LogOut, Menu, ShoppingBag, X } from 'lucide-react';
import AnimatedThemeToggler from '../../../components/ui/AnimatedThemeToggler';

export const FurnitureHeaderIcon = ({ size = 26, className = '', strokeWidth = 1.65 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
    >
        <path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" />
        <path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z" />
        <path d="M5 18v2" />
        <path d="M19 18v2" />
    </svg>
);

export const BreadBoardHeaderIcon = ({ size = 26, className = '', strokeWidth = 1.65 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
    >
        <path d="M12 2.25a1.7 1.7 0 0 1 .52 3.32v.92c0 .66.38 1.26.98 1.54l2.1.98a3 3 0 0 1 1.75 2.72v7.57a2.45 2.45 0 0 1-2.45 2.45H9.1a2.45 2.45 0 0 1-2.45-2.45v-7.57A3 3 0 0 1 8.4 9.01l2.1-.98c.6-.28.98-.88.98-1.54v-.92A1.7 1.7 0 0 1 12 2.25Z" />
        <circle cx="12" cy="13.65" r=".72" />
    </svg>
);

export const CounterHeaderIcon = ({ size = 26, className = '', strokeWidth = 1.65 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
    >
        <path d="M4.8 4.25h14.4l1.55 4.5H3.25l1.55-4.5Z" />
        <path d="M3.25 8.75h17.5" />
        <path d="M5.25 8.75v1.75A2.25 2.25 0 0 0 7.5 12.75a2.25 2.25 0 0 0 2.25-2.25V8.75" />
        <path d="M9.75 8.75v1.75A2.25 2.25 0 0 0 12 12.75a2.25 2.25 0 0 0 2.25-2.25V8.75" />
        <path d="M14.25 8.75v1.75a2.25 2.25 0 0 0 4.5 0V8.75" />
        <path d="M5.25 12.45v7.3h13.5v-7.3" />
        <path d="M9 19.75v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
    </svg>
);

const ArchitecturalHeader = ({
    headerProps,
    user,
    onShowLogin,
    onOpenMenu,
    isMenuOpen,
    onOpenCart,
    cartCount = 0,
    toggleTheme,
    darkMode
}) => {
    const { activeCollection, setActiveCollection, setFilter, onOpenShop, onCollectionIntent, onShopIntent, title } = headerProps || {};
    const isShopView = title === "Le Comptoir";
    const isGalleryHeader = Boolean(setActiveCollection) || isShopView;
    useLiveTheme();
    const { logout, isAdmin } = useAuth();

    const [isVisible, setIsVisible] = useState(true);
    const lastScrollY = React.useRef(0);
    const visibleRef = React.useRef(true);
    const rafRef = React.useRef(0);

    const galleryHeaderSurface = darkMode
        ? 'bg-black/92 text-white backdrop-blur-xl'
        : 'bg-[#f8f2e8]/92 text-stone-950 backdrop-blur-xl border-b border-[#d8b47a]/25 shadow-[0_18px_45px_rgba(92,64,31,0.08)]';
    const galleryHeaderText = darkMode ? 'text-stone-100' : 'text-stone-950';
    const galleryHeaderMuted = darkMode ? 'text-stone-300' : 'text-stone-700';

    const navButtonClass = (isActive = false) => `group relative inline-flex h-16 md:h-[78px] items-center gap-2 border-b text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
        isActive
            ? `border-[#dba45f] ${darkMode ? 'text-white' : 'text-stone-950'}`
            : `border-transparent ${darkMode ? 'text-stone-300 hover:text-white' : 'text-stone-600 hover:text-stone-950'} hover:border-[#dba45f]/70`
    }`;
    const navIconClass = 'shrink-0 text-current opacity-90 transition-colors';

    const goToGallery = () => {
        if (typeof window !== 'undefined') {
            window.history.pushState({}, document.title, '/meubles-anciens');
            window.dispatchEvent(new Event('popstate'));
        }
    };

    useEffect(() => {
        // === Audit 29 avr. 2026 : ce listener était LE plus gros tueur de fluidité mobile. ===
        // Avant : setIsVisible appelé sur chaque event scroll (60–120×/sec) → React re-render
        //         du header complet (avec backdrop-blur-xl !) à chaque pixel scrollé.
        // Maintenant :
        //  1) RAF throttle : un seul calcul par frame.
        //  2) Seuil DELTA (8 px) pour éviter le flip-flop near-zero sur le micro-jitter
        //     du momentum scroll iOS.
        //  3) Diff via ref → setState UNIQUEMENT quand la valeur change vraiment
        //     → React ne reconcilie le header que ~2× par session de scroll au lieu de
        //     plusieurs centaines de fois.
        const SCROLL_DELTA = 8;

        const compute = () => {
            rafRef.current = 0;
            const currentScrollY = window.scrollY;
            const last = lastScrollY.current;
            const delta = currentScrollY - last;

            let nextVisible = visibleRef.current;
            if (currentScrollY <= 0) {
                nextVisible = true;
            } else if (Math.abs(delta) >= SCROLL_DELTA) {
                nextVisible = delta < 0; // scroll up → visible, scroll down → hidden
            }

            if (Math.abs(delta) >= SCROLL_DELTA) {
                lastScrollY.current = currentScrollY;
            }

            if (nextVisible !== visibleRef.current) {
                visibleRef.current = nextVisible;
                setIsVisible(nextVisible);
            }
        };

        const handleScroll = () => {
            if (rafRef.current) return;
            rafRef.current = requestAnimationFrame(compute);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    return (
        <header
            className={`sticky top-0 z-50 overflow-x-clip transition-transform duration-300 ease-in-out ${isVisible ? 'translate-y-0' : '-translate-y-full'} ${
                isGalleryHeader
                    ? galleryHeaderSurface
                    : 'bg-transparent'
            }`}
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
            <div className={`max-w-[1920px] mx-auto h-16 md:h-[78px] flex items-center justify-between relative ${
                isGalleryHeader ? 'px-4 md:px-8 lg:px-12' : 'px-4 md:px-12'
            }`} style={isGalleryHeader ? { maxWidth: 'min(1920px, 100vw)' } : undefined}>
                <div className="flex items-center z-10">
                    <button
                        type="button"
                        className="flex flex-col leading-none text-left cursor-pointer group"
                        onClick={() => { window.location.href = '/'; }}
                    >
                        <span className={`${isGalleryHeader ? 'font-serif normal-case text-[1.3rem] md:text-2xl lg:text-3xl tracking-[0.03em]' : 'font-black uppercase text-sm tracking-widest'} transition-colors ${
                            isGalleryHeader ? `${galleryHeaderText} group-hover:text-[#b8792f]` : darkMode ? 'text-stone-100 group-hover:text-[#f0b969]' : 'text-stone-900 group-hover:text-stone-600'
                        }`}>
                            Tous à Table
                        </span>
                        <span className={`font-serif italic ${isGalleryHeader ? `text-[12px] md:text-sm lg:text-base ${darkMode ? 'text-[#dba45f]' : 'text-[#9b6428]'} mt-0.5` : `text-xs mt-1 ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}`}>
                            Atelier Normand
                        </span>
                    </button>
                </div>

                {isGalleryHeader && (
                    <nav className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-8 xl:gap-10 z-0 w-max">
                        <button
                            type="button"
                            onMouseEnter={() => onCollectionIntent?.('furniture')}
                            onFocus={() => onCollectionIntent?.('furniture')}
                            onPointerDown={() => onCollectionIntent?.('furniture')}
                            onClick={() => {
                                onCollectionIntent?.('furniture');
                                if (isShopView) {
                                    goToGallery();
                                } else {
                                    setActiveCollection?.('furniture');
                                    setFilter?.('fixed');
                                }
                            }}
                            className={navButtonClass(activeCollection === 'furniture' && !isShopView)}
                        >
                            <FurnitureHeaderIcon size={18} className={navIconClass} />
                            Mobilier
                        </button>
                        <button
                            type="button"
                            onMouseEnter={() => onCollectionIntent?.('cutting_boards')}
                            onFocus={() => onCollectionIntent?.('cutting_boards')}
                            onPointerDown={() => onCollectionIntent?.('cutting_boards')}
                            onClick={() => {
                                onCollectionIntent?.('cutting_boards');
                                if (isShopView) {
                                    goToGallery();
                                } else {
                                    setActiveCollection?.('cutting_boards');
                                }
                            }}
                            className={navButtonClass(activeCollection === 'cutting_boards' && !isShopView)}
                        >
                            <BreadBoardHeaderIcon size={18} className={navIconClass} />
                            Planches
                        </button>
                        {(onOpenShop || isShopView) && (
                            <button
                                type="button"
                                onMouseEnter={() => onShopIntent?.()}
                                onFocus={() => onShopIntent?.()}
                                onPointerDown={() => onShopIntent?.()}
                                onClick={() => {
                                    onShopIntent?.();
                                    onOpenShop?.();
                                }}
                                className={`${navButtonClass(isShopView)} relative`}
                            >
                                <CounterHeaderIcon size={18} className={navIconClass} />
                                Le Comptoir
                                <span className="absolute top-2 -right-3 pointer-events-none">
                                    <span className="relative inline-flex items-center justify-center rounded-full bg-[#f0c987] px-2 py-[3px] text-[8px] font-black uppercase tracking-[0.18em] text-stone-900 shadow-[0_2px_8px_rgba(240,201,135,0.25)]">
                                        New
                                        <svg className="absolute -top-2 -right-2" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#f0c987" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                                            <line x1="8" y1="3" x2="11" y2="0.5" />
                                            <line x1="11" y1="6" x2="13.5" y2="5" />
                                            <line x1="11" y1="9" x2="13.5" y2="10.5" />
                                        </svg>
                                    </span>
                                </span>
                            </button>
                        )}
                    </nav>
                )}

                <div className={`${isGalleryHeader ? 'absolute right-2 top-1/2 z-20 -translate-y-1/2 gap-0.5 md:static md:ml-auto md:translate-y-0 md:gap-3' : 'z-10 gap-2 md:gap-4'} flex items-center`}>
                    {(!user || user.isAnonymous) ? (
                        <button
                            onClick={onShowLogin}
                            className={`${isGalleryHeader ? `flex w-8 h-8 md:w-10 md:h-10 items-center justify-center ${galleryHeaderMuted} hover:text-[#b8792f] transition-colors` : darkMode ? 'flex items-center gap-2 border border-stone-800 text-stone-500 hover:bg-stone-800 px-3 py-2 rounded' : 'flex items-center gap-2 border border-stone-200 text-stone-500 hover:bg-stone-200 px-3 py-2 rounded'}`}
                            title="Connexion"
                        >
                            <LogIn size={isGalleryHeader ? 22 : 19} strokeWidth={1.5} />
                            {!isGalleryHeader && <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">Connexion</span>}
                        </button>
                    ) : (
                        <>
                            {isAdmin && (
                                <span className={`hidden md:inline text-[10px] font-black uppercase tracking-[0.2em] ${isGalleryHeader ? 'text-stone-200' : 'text-emerald-500'}`}>
                                    Admin
                                </span>
                            )}
                            <button
                                onClick={() => logout()}
                                className={`${isGalleryHeader ? `flex w-8 h-8 md:w-10 md:h-10 items-center justify-center ${galleryHeaderMuted} hover:text-red-500 transition-colors` : darkMode ? 'flex items-center gap-2 sm:border sm:border-stone-600 text-stone-200 hover:border-red-500 hover:text-red-400 hover:bg-red-500/10 w-10 h-10 sm:w-auto sm:px-4 sm:py-2 rounded justify-center' : 'flex items-center gap-2 sm:border sm:border-stone-300 text-stone-600 hover:border-red-400 hover:text-red-600 hover:bg-red-50 w-10 h-10 sm:w-auto sm:px-4 sm:py-2 rounded justify-center'}`}
                                title="Se deconnecter"
                            >
                                <LogOut size={isGalleryHeader ? 22 : 19} strokeWidth={1.5} />
                                {!isGalleryHeader && <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">Quitter</span>}
                            </button>
                        </>
                    )}

                    {toggleTheme && (
                        <div className={isGalleryHeader ? 'flex h-8 w-8 items-center justify-center md:h-10 md:w-10 [&_button]:h-8 [&_button]:w-8 md:[&_button]:h-10 md:[&_button]:w-10' : undefined}>
                            <AnimatedThemeToggler isDark={darkMode} toggleTheme={toggleTheme} />
                        </div>
                    )}

                    <button onClick={onOpenCart} data-cart-target className={`relative group ${isGalleryHeader ? 'w-8 h-8 md:w-10 md:h-10' : 'w-9 h-9 md:w-10 md:h-10'} flex items-center justify-center rounded-full border-0 bg-transparent shadow-none transition-all duration-300`} title="Panier">
                        <ShoppingBag size={22} strokeWidth={1.5} className={`transition-colors duration-300 ${isGalleryHeader ? `${galleryHeaderText} group-hover:text-[#b8792f]` : darkMode ? 'text-stone-100 group-hover:text-[#dba45f]' : 'text-stone-900 group-hover:text-amber-600'}`} />
                        {cartCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#dba45f] px-1 text-[10px] font-black text-black border border-black/50">
                                {cartCount}
                            </span>
                        )}
                    </button>

                    <button onClick={onOpenMenu} className={`relative flex items-center justify-center group ${isGalleryHeader ? 'w-8 h-8 md:w-10 md:h-10' : 'w-9 h-9 md:w-10 md:h-10'} rounded-full border-0 bg-transparent shadow-none cursor-pointer transition-colors`} title="Menu">
                        <Menu size={24} strokeWidth={1.5} className={`absolute transition-all duration-500 ease-in-out ${isGalleryHeader ? `${galleryHeaderText} group-hover:text-[#b8792f]` : darkMode ? 'text-stone-100 group-hover:text-[#dba45f]' : 'text-stone-900 group-hover:text-amber-600'} ${isMenuOpen ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`} />
                        <X size={24} strokeWidth={1.5} className={`absolute transition-all duration-500 ease-in-out ${isGalleryHeader ? `${galleryHeaderText} group-hover:text-[#b8792f]` : darkMode ? 'text-stone-100 group-hover:text-[#dba45f]' : 'text-stone-900 group-hover:text-amber-600'} ${isMenuOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`} />
                    </button>
                </div>
            </div>
        </header>
    );
};

export default ArchitecturalHeader;
