import React, { useState, useEffect, useRef } from 'react';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  onSnapshot, collection, doc, deleteDoc, serverTimestamp, query, getDocs, getDoc, writeBatch, runTransaction
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions'; // Added for logUserConnection
// Auth imports removed (handled in Context)
import {
  Hammer, LogOut, ShieldCheck, Menu, Eye, EyeOff, ShoppingBag, Sun, Moon, AlertTriangle, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- IMPORTS CONFIG & UTILS ---
import { db, appId, functions } from './firebase/config';
import { getMillis } from './utils/time';
import {
  addCartQuantities,
  claimGuestCartsForUser,
  clearGuestCart,
  finalizeGuestCartMigration,
  getCartDocumentId,
  getCartItemCount,
  getCartProductKey,
  getCartTotal,
  loadGuestCart,
  MAX_CART_QUANTITY,
  mergeCartLinesByProduct,
  normalizeCartQuantity,
  saveGuestCart,
} from './utils/cartState';
import { lockPageScroll, scrollToTarget, scrollToTop } from './utils/smoothScroll';
import { useLiveTheme } from './hooks/useLiveTheme'; // Import hook for forcedMode check
import {
  getFurnitureCategoryPath,
  getProductPath,
  getShopProductIdFromPath,
  getShopProductPath,
  getRouteFromLocation,
  pushUrl,
  replaceUrl,
} from './utils/seoRoutes';

import AppRouter from './Router';
import ErrorBoundary from './components/shared/ErrorBoundary';
import CartSidebar from './components/cart/CartSidebar';
import Footer from './components/layout/Footer';
import WhatsAppFloatingButton from './components/layout/WhatsAppFloatingButton';
import AnalyticsProvider from './components/shared/AnalyticsProvider';
import { ToastProvider, useToast } from './components/ui/Toast';

import MarketplaceDiscovery from './components/home/MarketplaceDiscovery';
import ArchitecturalHeader from './designs/architectural/components/ArchitecturalHeader';
import GlobalMenu from './components/layout/GlobalMenu';
import StartupPreloader from './components/layout/StartupPreloader';
import AuthPanel from './components/auth/AuthPanel';
import {
  shouldShowStartupPreloader,
  warmupStartupForRoute,
  warmupStartupCatalogImagesForRoute,
} from './utils/startupWarmup';
import { applyDevicePerformanceClasses, isTouchDevice } from './utils/devicePerformance';
import {
  HOME_SEO_SETTINGS_CACHE_KEY,
  HOME_SEO_SETTINGS_DOC,
  HOME_SEO_SETTINGS_UPDATED_EVENT,
  mergeHomeSEOSettings,
} from './utils/homeSEOSettings';

const getInitialDarkMode = () => {
  if (typeof window === 'undefined') return true;

  try {
    const cachedThemeSettings = localStorage.getItem('themeSettings');
    if (cachedThemeSettings) {
      const forcedMode = JSON.parse(cachedThemeSettings)?.forcedMode;
      if (forcedMode === 'dark') return true;
      if (forcedMode === 'light') return false;
    }

    const storedDarkMode = localStorage.getItem('darkMode');
    if (storedDarkMode === 'true') return true;
    if (storedDarkMode === 'false') return false;
  } catch {
    // Keep the public site dark on first paint if storage is unavailable.
  }

  return true;
};

const scheduleIdleCallback = (callback, timeout = 1200) => {
  if (typeof window === 'undefined') return () => {};

  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback?.(id);
  }

  const id = window.setTimeout(callback, Math.min(timeout, 450));
  return () => window.clearTimeout(id);
};

const sortByCreatedAtDesc = (a, b) => getMillis(b.createdAt) - getMillis(a.createdAt);
const CONTACT_INFO_CACHE_KEY = 'tat_contact_info';

const isCatalogStartupRoute = (route = {}) => (
  route.view === 'gallery' &&
  ['furniture', 'cutting_boards'].includes(route.galleryState?.activeCollection || 'furniture')
);

const normalizePublicCatalogPayload = (collections = {}) => ({
  items: (collections.furniture || [])
    .map((item) => ({ ...item, collectionName: 'furniture' }))
    .sort(sortByCreatedAtDesc),
  boardItems: (collections.cutting_boards || [])
    .map((item) => ({ ...item, collectionName: 'cutting_boards' }))
    .sort(sortByCreatedAtDesc),
  affiliateProducts: (collections.affiliate_products || [])
    .filter((product) => product.status === 'published'),
});

const getCachedContactInfo = () => {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(CONTACT_INFO_CACHE_KEY) || '{}') || {};
  } catch {
    return {};
  }
};

const getCachedHomeSEOSettings = () => {
  if (typeof localStorage === 'undefined') return {};
  try {
    return mergeHomeSEOSettings(JSON.parse(localStorage.getItem(HOME_SEO_SETTINGS_CACHE_KEY) || '{}') || {});
  } catch {
    return {};
  }
};

const AppContent = () => {
  const toast = useToast();

  // Use Auth Context
  const { user, isAdmin, loading: authLoading, logout } = useAuth();

  const [items, setItems] = useState([]);
  const [boardItems, setBoardItems] = useState([]); // New: Planches
  const [affiliateProducts, setAffiliateProducts] = useState([]);
  const [resolvedPublicCollections, setResolvedPublicCollections] = useState({
    furniture: false,
    cutting_boards: false,
    affiliate_products: false,
  });
  const [contactInfo, setContactInfo] = useState(getCachedContactInfo);
  const [homeSEOSettings, setHomeSEOSettings] = useState(getCachedHomeSEOSettings);


  const [showMarketplacePopup, setShowMarketplacePopup] = useState(false);
  const footerRef = useRef(null);
  const publicCatalogFallbackRef = useRef(null);
  const deferredPublicCatalogRef = useRef(null);
  /** Collections déjà en live onSnapshot — l'HTTP ne doit pas les écraser (anti-stale). */
  const liveCollectionsRef = useRef(new Set());





  // --- iOS viewport height fix (--vh variable for reliable 100vh) ---
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    const setVh = () => {
      document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
    return () => {
      window.removeEventListener('resize', setVh);
      window.removeEventListener('orientationchange', setVh);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    const updateProfile = () => {
      raf = 0;
      applyDevicePerformanceClasses();
    };

    const scheduleUpdate = () => {
      if (raf) return;
      raf = requestAnimationFrame(updateProfile);
    };

    updateProfile();
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    window.addEventListener('orientationchange', scheduleUpdate);
    connection?.addEventListener?.('change', scheduleUpdate);

    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', scheduleUpdate);
      connection?.removeEventListener?.('change', scheduleUpdate);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Fetch Contact Info for Menu/Footer (single read, cached locally)
  useEffect(() => {
    let mounted = true;
    getDoc(doc(db, 'sys_metadata', 'contact_info')).then((snap) => {
      if (!mounted || !snap.exists()) return;
      const data = snap.data();
      setContactInfo(data);
      try {
        localStorage.setItem(CONTACT_INFO_CACHE_KEY, JSON.stringify(data));
      } catch {
        // Cache unavailable; keep in-memory value.
      }
    }).catch((error) => {
      console.error('Contact info load error:', error);
    });
    return () => { mounted = false; };
  }, []);

  // Cart State
  const [cartStateItems, setCartItems] = useState(() => loadGuestCart());
  const [cartOwnerKey, setCartOwnerKey] = useState('guest');
  const currentCartOwnerKey = user && !user.isAnonymous ? `user:${user.uid}` : 'guest';
  const currentCartOwnerKeyRef = useRef(currentCartOwnerKey);
  currentCartOwnerKeyRef.current = currentCartOwnerKey;
  const cartItems = cartOwnerKey === currentCartOwnerKey ? cartStateItems : [];
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartInteracted, setCartInteracted] = useState(false); // Prevents initial flash
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [orderSuccessMethod, setOrderSuccessMethod] = useState(''); // Tracks which payment method was used
  const [stockAlert, setStockAlert] = useState(null); // { currentStock: number }
  const initialRouteRef = useRef(typeof window !== 'undefined'
    ? getRouteFromLocation(window.location)
    : { view: 'gallery', galleryState: { activeCollection: 'furniture', filter: 'fixed', activeCategory: 'all' } });
  const startupWarmupPayloadRef = useRef({ items: [], boardItems: [], affiliateProducts: [] });
  const startupCatalogWarmupStartedRef = useRef(false);

  // Navigation
  const [view, setView] = useState(() => initialRouteRef.current.view); // 'about', 'gallery', 'detail', 'login', 'admin'
  const [selectedItemId, setSelectedItemId] = useState(initialRouteRef.current.productId || null);
  const [selectedAffiliateProductId, setSelectedAffiliateProductId] = useState(initialRouteRef.current.shopProductId || null);
  const [selectedAffiliateProductContext, setSelectedAffiliateProductContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSecretGateOpen, setIsSecretGateOpen] = useState(false);
  const [showFullLogin, setShowFullLogin] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showStartupPreloader, setShowStartupPreloader] = useState(() => shouldShowStartupPreloader(initialRouteRef.current));
  const [isFooterVisible, setIsFooterVisible] = useState(false);
  const [publicRealtimeReady, setPublicRealtimeReady] = useState(() => (
    !showStartupPreloader || isCatalogStartupRoute(initialRouteRef.current) || initialRouteRef.current.view === 'home'
  ));
  const scrollYRef = useRef(0);
  const modalUnlockRef = useRef(null);
  const wasModalOpenRef = useRef(false);

  // iOS-safe body scroll lock for modals
  useEffect(() => {
    const anyModalOpen = showFullLogin || showOrderSuccess || stockAlert;
    if (anyModalOpen) {
      if (!wasModalOpenRef.current) {
        scrollYRef.current = window.scrollY;
        modalUnlockRef.current = lockPageScroll();
      }
      wasModalOpenRef.current = true;
      document.body.classList.add('modal-open');
      document.body.style.top = `-${scrollYRef.current}px`;
    } else {
      document.body.classList.remove('modal-open');
      document.body.style.top = '';
      if (wasModalOpenRef.current) {
        modalUnlockRef.current?.();
        modalUnlockRef.current = null;
        scrollToTarget(scrollYRef.current, { immediate: true, duration: 0 });
      }
      wasModalOpenRef.current = false;
    }
    return () => {
      document.body.classList.remove('modal-open');
      document.body.style.top = '';
      modalUnlockRef.current?.();
      modalUnlockRef.current = null;
      wasModalOpenRef.current = false;
    };
  }, [showFullLogin, showOrderSuccess, stockAlert]);

  // Admin State
  const [adminCollection, setAdminCollection] = useState('dashboard'); // 'dashboard' | 'furniture' | 'cutting_boards' | 'orders'

  // Transition State
  const [isPreparingGallery, setIsPreparingGallery] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);



  const startGalleryTransition = () => {
    setIsPreparingGallery(true);
    setIsTransitioning(true);
  };

  const completeGalleryTransition = () => {
    // We swap the view while the curtain is opaque
    setView('gallery');
    setIsPreparingGallery(false);
    scrollToTop();

    // Lift the curtain after a short delay to ensure rendering
    setTimeout(() => {
      setIsTransitioning(false);
    }, 200);
  };

  // Deep Linking State
  const [pendingDeepLink, setPendingDeepLink] = useState(initialRouteRef.current.productId || null);

  // Header Props for Architectural Design
  const [headerProps, setHeaderProps] = useState(null);

  // [NEW] Persistent Gallery State (To restore collection after detail/checkout)
  const [persistentGalleryState, setPersistentGalleryState] = useState({
    activeCollection: 'furniture',
    filter: 'fixed',
    activeCategory: 'all',
    ...(initialRouteRef.current.galleryState || {}),
  });

  const saveGalleryState = React.useCallback((state) => {
    setPersistentGalleryState(prev => ({ ...prev, ...state }));
  }, []);

  const activePublicRealtimeCollectionsKey = React.useMemo(() => {
    if (view === 'admin') return 'furniture|cutting_boards|affiliate_products';
    if (view === 'home') return 'furniture|affiliate_products';
    if (view === 'shop' || view === 'shop-detail') return 'affiliate_products';
    if (view === 'gallery') {
      return persistentGalleryState.activeCollection === 'cutting_boards' ? 'cutting_boards' : 'furniture';
    }
    if (view === 'detail') {
      return persistentGalleryState.activeCollection === 'cutting_boards'
        ? 'cutting_boards|affiliate_products'
        : 'furniture|affiliate_products';
    }
    return '';
  }, [view, persistentGalleryState.activeCollection, selectedItemId, items, boardItems]);

  /**
   * Clé live stock public (furniture / cutting_boards) stable gallery ↔ detail
   * sur la même collection — évite un unsub/resub Firestore inutile.
   * Vide hors gallery|detail.
   */
  const publicLiveStockKey = React.useMemo(() => {
    if (view === 'detail' && pendingDeepLink) {
      // A public product URL does not encode its Firestore collection. Resolve both
      // live catalogues once, then keep only the collection selected below.
      return 'furniture|cutting_boards';
    }
    if (view === 'gallery') {
      return persistentGalleryState.activeCollection === 'cutting_boards'
        ? 'cutting_boards'
        : 'furniture';
    }
    if (view === 'detail') {
      return persistentGalleryState.activeCollection === 'cutting_boards'
        ? 'cutting_boards'
        : 'furniture';
    }
    return '';
  }, [view, pendingDeepLink, persistentGalleryState.activeCollection, selectedItemId, items, boardItems]);

  // --- SCROLL HEADER LOGIC ---
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const headerVisibleRef = useRef(true);
  const headerScrollRafRef = useRef(0);

  // Dark Mode State
  const [darkMode, setDarkMode] = useState(getInitialDarkMode);

  const { forcedMode, activeDesignId } = useLiveTheme(darkMode);

  // Effective Dark Mode Logic (Sync State)
  useEffect(() => {
    if (forcedMode === 'dark') {
      setDarkMode(true);
    } else if (forcedMode === 'light') {
      setDarkMode(false);
    }
  }, [forcedMode]);

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    document.documentElement.style.backgroundColor = darkMode ? '#0A0A0A' : '#FAFAF9';
    document.body.style.backgroundColor = darkMode ? '#0A0A0A' : '#FAFAF9';
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    startupWarmupPayloadRef.current = { items, boardItems, affiliateProducts };
  }, [items, boardItems, affiliateProducts]);

  const applyPublicCatalog = React.useCallback((collections = {}, { deferWhilePreloading = true } = {}) => {
    if (
      deferWhilePreloading &&
      typeof document !== 'undefined' &&
      document.body.classList.contains('tat-startup-preloading')
    ) {
      deferredPublicCatalogRef.current = collections;
      return;
    }

    const catalogPayload = normalizePublicCatalogPayload(collections);
    const live = liveCollectionsRef.current;
    // Ne pas écraser une collection déjà alimentée en live (réponse HTTP tardive = stale).
    if (!live.has('furniture')) {
      setItems(catalogPayload.items);
    }
    if (!live.has('cutting_boards')) {
      setBoardItems(catalogPayload.boardItems);
    }
    setAffiliateProducts(catalogPayload.affiliateProducts);
    setResolvedPublicCollections({
      furniture: true,
      cutting_boards: true,
      affiliate_products: true,
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    getDoc(doc(db, 'sys_metadata', HOME_SEO_SETTINGS_DOC)).then((snap) => {
      if (!mounted || !snap.exists()) return;
      const data = mergeHomeSEOSettings(snap.data());
      setHomeSEOSettings(data);
      try {
        localStorage.setItem(HOME_SEO_SETTINGS_CACHE_KEY, JSON.stringify(data));
      } catch {
        // Cache unavailable; keep in-memory value.
      }
    }).catch((error) => {
      console.error('HomeSEO settings load error:', error);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const handleHomeSEOSettingsUpdated = (event) => {
      setHomeSEOSettings(mergeHomeSEOSettings(event.detail || {}));
    };
    window.addEventListener(HOME_SEO_SETTINGS_UPDATED_EVENT, handleHomeSEOSettingsUpdated);
    return () => window.removeEventListener(HOME_SEO_SETTINGS_UPDATED_EVENT, handleHomeSEOSettingsUpdated);
  }, []);

  const runStartupWarmup = React.useCallback(() => (
    warmupStartupForRoute(initialRouteRef.current, startupWarmupPayloadRef.current)
  ), []);

  const handleStartupPreloaderComplete = React.useCallback(() => {
    if (typeof window !== 'undefined') {
      window.__tatStartupPreloaderShown = true;
      window.hasShownPreloader = true;
    }
    setShowStartupPreloader(false);
  }, []);

  useEffect(() => {
    if (showStartupPreloader || !deferredPublicCatalogRef.current) return undefined;

    if (isCatalogStartupRoute(initialRouteRef.current)) {
      const pendingCollections = deferredPublicCatalogRef.current;
      deferredPublicCatalogRef.current = null;
      applyPublicCatalog(pendingCollections, { deferWhilePreloading: false });
      return undefined;
    }

    let cleanupIdle = null;
    const timer = window.setTimeout(() => {
      const pendingCollections = deferredPublicCatalogRef.current;
      deferredPublicCatalogRef.current = null;
      cleanupIdle = scheduleIdleCallback(() => {
        applyPublicCatalog(pendingCollections, { deferWhilePreloading: false });
      }, isTouchDevice() ? 1200 : 600);
    }, isTouchDevice() ? 380 : 80);

    return () => {
      window.clearTimeout(timer);
      cleanupIdle?.();
    };
  }, [showStartupPreloader, applyPublicCatalog]);

  useEffect(() => {
    if (publicRealtimeReady || showStartupPreloader) return undefined;

    return scheduleIdleCallback(() => {
      setPublicRealtimeReady(true);
    }, 1600);
  }, [publicRealtimeReady, showStartupPreloader]);

  useEffect(() => {
    if (showStartupPreloader) return undefined;
    if (initialRouteRef.current.view === 'about') return;
    if (!items.length && !boardItems.length && !affiliateProducts.length) return;
    if (startupCatalogWarmupStartedRef.current) return;

    let cleanupIdle = null;
    const delay = isCatalogStartupRoute(initialRouteRef.current) ? 0 : (isTouchDevice() ? 1400 : 420);
    const timer = window.setTimeout(() => {
      startupCatalogWarmupStartedRef.current = true;
      const warmup = () => {
        warmupStartupCatalogImagesForRoute(initialRouteRef.current, startupWarmupPayloadRef.current);
      };

      if (isCatalogStartupRoute(initialRouteRef.current)) {
        warmup();
      } else {
        cleanupIdle = scheduleIdleCallback(warmup, isTouchDevice() ? 2000 : 900);
      }
    }, delay);

    return () => {
      window.clearTimeout(timer);
      cleanupIdle?.();
    };
  }, [showStartupPreloader, items, boardItems, affiliateProducts]);

  // Marketplace Discovery Trigger (ancienne page atelier, pas sur la landing SEO)
  useEffect(() => {
    // 1. Si déjà vu, on sort
    const alreadySeen = localStorage.getItem('hasSeenMarketplacePopup');
    if (alreadySeen) return;

    // 2. Uniquement sur la page atelier historique.
    if (view !== 'about') return;

    // 3. Trigger au scroll (proche du bas / après FAQ)
    let scrollHandler = null;
    const timer = setTimeout(() => {
      scrollHandler = () => {
        const scrollPosition = window.scrollY + window.innerHeight;
        const pageHeight = document.documentElement.scrollHeight;
        const triggerPoint = pageHeight - 400; // Proche du footer/après FAQ

        if (scrollPosition > triggerPoint && view === 'about') {
          console.log('MARKETPLACE POPUP TRIGGERED (bottom of home)');
          setShowMarketplacePopup(true);
          localStorage.setItem('hasSeenMarketplacePopup', 'true');
          window.removeEventListener('scroll', scrollHandler);
        }
      };
      window.addEventListener('scroll', scrollHandler, { passive: true });
    }, 2000);

    return () => {
      clearTimeout(timer);
      if (scrollHandler) window.removeEventListener('scroll', scrollHandler);
    };
  }, [view]);

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer || typeof IntersectionObserver === 'undefined') {
      setIsFooterVisible(false);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsFooterVisible(entry.isIntersecting);
    }, { threshold: 0.08 });

    observer.observe(footer);
    return () => observer.disconnect();
  }, [view]);


  useEffect(() => {
    const applyVisibility = (nextVisible) => {
      if (headerVisibleRef.current === nextVisible) return;
      headerVisibleRef.current = nextVisible;
      setIsHeaderVisible(nextVisible);
    };

    const handleScroll = () => {
      if (headerScrollRafRef.current) return;
      headerScrollRafRef.current = requestAnimationFrame(() => {
        headerScrollRafRef.current = 0;
        const currentScrollY = window.scrollY;
        const lastScrollY = lastScrollYRef.current;

        if (currentScrollY < 10) {
          applyVisibility(true);
        } else if (Math.abs(currentScrollY - lastScrollY) > 6) {
          applyVisibility(currentScrollY < lastScrollY || currentScrollY <= 20);
        }

        lastScrollYRef.current = currentScrollY;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (headerScrollRafRef.current) cancelAnimationFrame(headerScrollRafRef.current);
    };
  }, []);

  // --- CHARGEMENT ---
  // Helpers catalogue (partagés admin / public HTTP / live stock).
  const mapFurnitureSnap = React.useCallback(
    (snap) => snap.docs
      .map((d) => ({ id: d.id, collectionName: 'furniture', ...d.data() }))
      .sort(sortByCreatedAtDesc),
    [],
  );

  const mapBoardsSnap = React.useCallback(
    (snap) => snap.docs
      .map((d) => ({ id: d.id, collectionName: 'cutting_boards', ...d.data() }))
      .sort(sortByCreatedAtDesc),
    [],
  );

  const fetchPublicCatalogFallback = React.useCallback((reason, { rethrow = false } = {}) => {
    if (!publicCatalogFallbackRef.current) {
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      const url = `https://us-central1-${projectId}.cloudfunctions.net/publicCatalog`;
      publicCatalogFallbackRef.current = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`publicCatalog ${response.status}`);
          return response.json();
        })
        .then((payload) => {
          if (isCatalogStartupRoute(initialRouteRef.current)) {
            warmupStartupCatalogImagesForRoute(
              initialRouteRef.current,
              normalizePublicCatalogPayload(payload.collections),
            );
          }
          applyPublicCatalog(payload.collections);
          return payload;
        })
        .catch((error) => {
          publicCatalogFallbackRef.current = null;
          throw error;
        });
    }

    return publicCatalogFallbackRef.current.catch((error) => {
      console.error(`Fallback catalogue public impossible apres ${reason}:`, error);
      if (rethrow) throw error;
    });
  }, [applyPublicCatalog]);

  // --- CHARGEMENT DONNÉES PUBLIQUES (HTTP + admin live) ---
  // Live stock public : effet séparé (publicLiveStockKey) pour ne pas unsub/resub
  // en passant gallery → detail sur la même collection.
  useEffect(() => {
    const handlePublicReadError = (label, error) => {
      console.error(`Erreur lecture ${label}:`, error);
      fetchPublicCatalogFallback(label);
    };

    if (!publicRealtimeReady) return undefined;

    const activeCollections = activePublicRealtimeCollectionsKey
      ? activePublicRealtimeCollectionsKey.split('|')
      : [];

    if (!activeCollections.length) return undefined;

    /** onSnapshot sur les collections actives (admin, ou fallback public si HTTP down). */
    const subscribeCatalogCollections = () => {
      const subscriptions = [];

      if (activeCollections.includes('furniture')) {
        subscriptions.push(onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'furniture'), (snap) => {
          setItems(mapFurnitureSnap(snap));
          setResolvedPublicCollections((prev) => ({ ...prev, furniture: true }));
        }, (error) => {
          handlePublicReadError('meubles', error);
        }));
      }

      if (activeCollections.includes('cutting_boards')) {
        subscriptions.push(onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'cutting_boards'), (snap) => {
          setBoardItems(mapBoardsSnap(snap));
          setResolvedPublicCollections((prev) => ({ ...prev, cutting_boards: true }));
        }, (error) => {
          handlePublicReadError('planches', error);
        }));
      }

      if (activeCollections.includes('affiliate_products')) {
        subscriptions.push(onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'affiliate_products'), (snap) => {
          setAffiliateProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.status === 'published'));
          setResolvedPublicCollections((prev) => ({ ...prev, affiliate_products: true }));
        }, (error) => {
          handlePublicReadError('produits affilies', error);
        }));
      }

      return () => subscriptions.forEach((unsubscribe) => unsubscribe());
    };

    // Admin : temps réel complet (comportement historique).
    if (isAdmin) {
      return subscribeCatalogCollections();
    }

    // Public : bootstrap HTTP uniquement ici (live stock = effet suivant).
    let cancelled = false;
    let cleanupErrorFallback = null;
    const publicLiveStockEnabled = Boolean(publicLiveStockKey);

    fetchPublicCatalogFallback('lecture publique cachee', { rethrow: true }).catch(() => {
      if (cancelled || publicLiveStockEnabled) return;
      // Vues sans live stock : si HTTP tombe, fallback onSnapshot temporaire.
      cleanupErrorFallback = subscribeCatalogCollections();
    });

    return () => {
      cancelled = true;
      cleanupErrorFallback?.();
    };
  }, [
    publicRealtimeReady,
    activePublicRealtimeCollectionsKey,
    applyPublicCatalog,
    isAdmin,
    publicLiveStockKey,
    fetchPublicCatalogFallback,
    mapFurnitureSnap,
    mapBoardsSnap,
  ]);

  // --- LIVE STOCK PUBLIC : gallery|detail only (clé stable gallery↔detail même collection) ---
  useEffect(() => {
    if (!publicRealtimeReady || isAdmin || !publicLiveStockKey) return undefined;

    const stockCollections = publicLiveStockKey.split('|').filter(Boolean);
    if (!stockCollections.length) return undefined;

    const handlePublicReadError = (label, error) => {
      console.error(`Erreur lecture ${label}:`, error);
      fetchPublicCatalogFallback(label);
    };

    const subscriptions = [];

    if (stockCollections.includes('furniture')) {
      subscriptions.push(onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'furniture'), (snap) => {
        liveCollectionsRef.current.add('furniture');
        setItems(mapFurnitureSnap(snap));
        setResolvedPublicCollections((prev) => ({ ...prev, furniture: true }));
        if (import.meta.env.DEV) {
          console.debug('[catalog-live]', 'furniture', snap.size);
        }
      }, (error) => {
        handlePublicReadError('meubles', error);
      }));
    }

    if (stockCollections.includes('cutting_boards')) {
      subscriptions.push(onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'cutting_boards'), (snap) => {
        liveCollectionsRef.current.add('cutting_boards');
        setBoardItems(mapBoardsSnap(snap));
        setResolvedPublicCollections((prev) => ({ ...prev, cutting_boards: true }));
        if (import.meta.env.DEV) {
          console.debug('[catalog-live]', 'cutting_boards', snap.size);
        }
      }, (error) => {
        handlePublicReadError('planches', error);
      }));
    }

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
      stockCollections.forEach((name) => {
        liveCollectionsRef.current.delete(name);
      });
    };
  }, [
    publicRealtimeReady,
    isAdmin,
    publicLiveStockKey,
    fetchPublicCatalogFallback,
    mapFurnitureSnap,
    mapBoardsSnap,
  ]);

  // --- LOGIQUE ROUTING & AUTH (Dépend du User) ---
  useEffect(() => {
    // Logic dependent on user/auth state
    const params = new URLSearchParams(window.location.search);
    const route = getRouteFromLocation(window.location);

    // --- SECURITY LOG (IP CAPTURE) ---
    if (user && !user.isAnonymous) {
      // We fire and forget. The backend handles rate limiting or lightweight updates.
      httpsCallable(functions, 'logUserConnection')().catch(e => console.error("SecLog Error", e));
    }

    // --- STRIPE SUCCESS HANDLING ---
    if (params.get('order_success') === 'true' && user && !user.isAnonymous) {

      const clearCartAfterStripe = async () => {
        // 1. Déclencher l'UI succès immédiatement
        setOrderSuccessMethod('stripe_elements');
        setShowOrderSuccess(true);
        setView('my-orders');

        // 2. Nettoyer l'URL pour éviter de re-déclencher au F5
        replaceUrl('/mes-commandes');

        // 3. Vider le panier Firestore réellement
        try {
          const cartRef = collection(db, 'users', user.uid, 'cart');
          const snapshot = await getDocs(cartRef);

          const batch = writeBatch(db);
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();

          // Mettre à jour l'état local aussi pour être sûr
          setCartItems([]);

        } catch (e) {
          console.error("Erreur nettoyage panier post-paiement:", e);
        }
      };

      clearCartAfterStripe();
    }
    // -------------------------------


    if (route.adminGate) {
      setIsSecretGateOpen(true);
      if (isAdmin) setView('admin'); else setView('login');
    } else if (route.productId) {
      setPendingDeepLink(route.productId);
    } else {
      if (route.galleryState) {
        setPersistentGalleryState(prev => ({ ...prev, ...route.galleryState }));
      }
      // Only force view from URL on initial load to avoid interrupting user navigation (e.g. checkout redirect)
      if (loading) {
        setView(route.view);
      }
      setIsSecretGateOpen(false);
    }
    setLoading(false);

  }, [user, isAdmin]); // Re-run when auth state changes

  // --- PERSISTANCE NAVIGATION (HASH & URL) ---
  useEffect(() => {
    const applyRoute = () => {
      const route = getRouteFromLocation(window.location);
      if (route.adminGate) {
        setIsSecretGateOpen(true);
        setView(isAdmin ? 'admin' : 'login');
        return;
      }
      if (route.productId) {
        setPendingDeepLink(route.productId);
        return;
      }
      if (route.shopProductId) {
        setSelectedAffiliateProductId(route.shopProductId);
        setSelectedAffiliateProductContext(null);
        setView('shop-detail');
        return;
      }
      if (route.galleryState) {
        setPersistentGalleryState(prev => ({ ...prev, ...route.galleryState }));
      }
      setView(route.view);
    };

    window.addEventListener('popstate', applyRoute);
    window.addEventListener('hashchange', applyRoute);
    return () => {
      window.removeEventListener('popstate', applyRoute);
      window.removeEventListener('hashchange', applyRoute);
    };
  }, [isAdmin]);


  useEffect(() => {
    if (typeof window === 'undefined') return;

    const contextualItems = persistentGalleryState.activeCollection === 'cutting_boards' ? boardItems : items;
    const selectedItem = contextualItems.find((item) => item.id === selectedItemId);
    const selectedAffiliateProduct = affiliateProducts.find((product) => product.id === selectedAffiliateProductId);

    if (view === 'detail' && selectedItemId) {
      pushUrl(selectedItem ? getProductPath(selectedItem) : `/produit/${selectedItemId}`, { view: 'detail', itemId: selectedItemId });
    } else if (view === 'shop-detail' && selectedAffiliateProductId) {
      const currentShopProductId = getShopProductIdFromPath(window.location.pathname);
      if (currentShopProductId === selectedAffiliateProductId && !selectedAffiliateProduct) return;
      pushUrl(
        selectedAffiliateProduct ? getShopProductPath(selectedAffiliateProduct) : `/comptoir/${selectedAffiliateProductId}`,
        { view: 'shop-detail', itemId: selectedAffiliateProductId }
      );
    } else if (view === 'shop') {
      pushUrl('/comptoir', { view });
    } else if (view === 'delivery') {
      pushUrl('/livraison-meubles-anciens-france', { view });
    } else if (view === 'home') {
      pushUrl('/', { view: 'home' });
    } else if (view === 'about') {
      pushUrl('/a-propos', { view: 'about' });
    } else if (view === 'checkout') {
      pushUrl('/checkout', { view });
    } else if (view === 'my-orders') {
      pushUrl('/mes-commandes', { view });
    } else if (view === 'admin') {
      pushUrl('/admin', { view });
    } else if (view === 'gallery') {
      const path = persistentGalleryState.activeCollection === 'cutting_boards'
        ? '/planches-a-decouper-anciennes'
        : getFurnitureCategoryPath(persistentGalleryState.activeCategory || 'all');
      pushUrl(path, { view });
    }
  }, [view, selectedItemId, selectedAffiliateProductId, items, boardItems, affiliateProducts, persistentGalleryState.activeCollection, persistentGalleryState.activeCategory]);

  // --- TRAITEMENT DEEP LINK ---
  useEffect(() => {
    if (!pendingDeepLink) return;

    const furnitureMatch = items.find((item) => item.id === pendingDeepLink);
    const boardMatch = boardItems.find((item) => item.id === pendingDeepLink);
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
    const routeMatch = [furnitureMatch, boardMatch]
      .filter(Boolean)
      .find((item) => getProductPath(item) === currentPath);
    const targetItem = routeMatch
      || (persistentGalleryState.activeCollection === 'cutting_boards' ? boardMatch : furnitureMatch)
      || furnitureMatch
      || boardMatch;

    if (targetItem) {
      const activeCollection = targetItem.collectionName === 'cutting_boards'
        ? 'cutting_boards'
        : 'furniture';
      console.log("Deep link activated for:", targetItem.name);
      setPersistentGalleryState((previous) => ({ ...previous, activeCollection }));
      setSelectedItemId(pendingDeepLink);
      setView('detail');
      setPendingDeepLink(null);
      return;
    }

    if (
      liveCollectionsRef.current.has('furniture')
      && liveCollectionsRef.current.has('cutting_boards')
    ) {
      // Both catalogues have answered: the not-found state is now definitive.
      setSelectedItemId(pendingDeepLink);
      setView('detail');
      setPendingDeepLink(null);
    }
  }, [
    items,
    boardItems,
    pendingDeepLink,
    persistentGalleryState.activeCollection,
    resolvedPublicCollections.furniture,
    resolvedPublicCollections.cutting_boards,
  ]);

  // --- CART SYNC AND MIGRATION ---
  useEffect(() => {
    if (user && !user.isAnonymous) {
      const ownerKey = `user:${user.uid}`;
      const cartRef = collection(db, 'users', user.uid, 'cart');
      let guestMigrations = [];
      let guestCart = [];
      let guestClaimsReady = false;
      let cancelled = false;
      let migrationInFlight = false;
      let retryTimer = null;
      let retryAttempt = 0;

      // The previous UID's lines must disappear before the first snapshot arrives.
      setCartItems([]);
      setCartOwnerKey(ownerKey);

      // Setup real-time listener immediately
      console.log("Subscribing to cart for user:", user.uid);
      const unsubCart = onSnapshot(query(cartRef), (snap) => {
        if (cancelled) return;
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCartItems(items);
        setCartOwnerKey(ownerKey);
      }, (err) => {
        if (cancelled) return;
        console.error("Cart sync error:", err);
      });

      const scheduleMigrationRetry = () => {
        if (cancelled || guestCart.length === 0 || retryTimer) return;
        const delay = Math.min(30000, 1000 * (2 ** retryAttempt));
        retryAttempt += 1;
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          cleanupAndMigrate();
        }, delay);
      };

      // Cleanup duplicates and migrate local cart
      const cleanupAndMigrate = async () => {
        if (cancelled || migrationInFlight || !guestClaimsReady) return;
        migrationInFlight = true;
        try {
          const discoveredSnap = await getDocs(cartRef);
          if (cancelled) return;
          const guestTransfers = guestMigrations.map(migration => ({
            ...migration,
            items: mergeCartLinesByProduct(migration.items),
          }));
          const refsByPath = new Map(
            discoveredSnap.docs.map(cartDoc => [cartDoc.ref.path, cartDoc.ref]),
          );
          discoveredSnap.docs.forEach((cartDoc) => {
            const data = cartDoc.data();
            const deterministicRef = doc(cartRef, getCartDocumentId({
              ...data,
              id: data.originalId || data.id || cartDoc.id,
            }));
            refsByPath.set(deterministicRef.path, deterministicRef);
          });
          guestTransfers.forEach((migration) => {
            migration.items.forEach((item) => {
              const deterministicRef = doc(cartRef, getCartDocumentId(item));
              refsByPath.set(deterministicRef.path, deterministicRef);
            });
          });

          // Clear the guest key only after Firestore accepted every write.
          await finalizeGuestCartMigration({
            hasWrites: true,
            hasGuestItems: guestCart.length > 0,
            commit: () => runTransaction(db, async (transaction) => {
              const refs = [...refsByPath.values()];
              const currentSnaps = await Promise.all(refs.map(ref => transaction.get(ref)));
              const groupsByProduct = new Map();
              const existingByProduct = new Map();

              // 1. Group every legacy/canonical line before any write.
              currentSnaps.forEach((cartDoc) => {
                if (!cartDoc.exists()) return;
                const data = cartDoc.data();
                const productKey = getCartProductKey(data, `cart-doc:${cartDoc.id}`);
                const group = groupsByProduct.get(productKey) || [];
                group.push({ ref: cartDoc.ref, data });
                groupsByProduct.set(productKey, group);
              });

              // 2. Move every product to its deterministic document ID. This
              // also removes legacy random IDs and preserves migration markers.
              groupsByProduct.forEach((group, productKey) => {
                const representative = group[0].data;
                const canonicalRef = doc(cartRef, getCartDocumentId(representative));
                const canonicalEntry = group.find(entry => entry.ref.path === canonicalRef.path);
                const baseData = canonicalEntry?.data || representative;
                const migrationIds = new Set();
                let quantity = 0;

                group.forEach((entry) => {
                  quantity = normalizeCartQuantity(quantity + normalizeCartQuantity(entry.data.quantity));
                  if (Array.isArray(entry.data.guestMigrationIds)) {
                    entry.data.guestMigrationIds
                      .filter(value => typeof value === 'string')
                      .forEach(id => migrationIds.add(id));
                  }
                });

                existingByProduct.set(productKey, {
                  ref: canonicalRef,
                  baseData,
                  quantity,
                  migrationIds,
                  legacyRefs: group
                    .filter(entry => entry.ref.path !== canonicalRef.path)
                    .map(entry => entry.ref),
                });
              });

              // 3. Add the claimed guest quantities exactly once per transfer ID.
              guestTransfers.forEach((migration) => {
                migration.items.forEach((item) => {
                  const productKey = getCartProductKey(item);
                  const existing = existingByProduct.get(productKey);
                  if (existing) {
                    if (!migration.transferId || !existing.migrationIds.has(migration.transferId)) {
                      existing.quantity = addCartQuantities(existing.quantity, item.quantity);
                      if (migration.transferId) existing.migrationIds.add(migration.transferId);
                    }
                    return;
                  }

                  const { id, addedAt, ...rest } = item;
                  const newDocRef = doc(cartRef, getCartDocumentId(item));
                  const firestoreItem = {
                    ...rest,
                    quantity: normalizeCartQuantity(item.quantity),
                    addedAt: serverTimestamp(),
                    ...(migration.transferId ? { guestMigrationIds: [migration.transferId] } : {}),
                  };
                  existingByProduct.set(productKey, {
                    ref: newDocRef,
                    baseData: firestoreItem,
                    quantity: firestoreItem.quantity,
                    migrationIds: new Set(migration.transferId ? [migration.transferId] : []),
                    legacyRefs: [],
                  });
                });
              });

              // 4. One canonical write per product, after every computation.
              existingByProduct.forEach((entry) => {
                transaction.set(entry.ref, {
                  ...entry.baseData,
                  quantity: entry.quantity,
                  guestMigrationIds: [...entry.migrationIds],
                });
                entry.legacyRefs.forEach(legacyRef => transaction.delete(legacyRef));
              });
            }),
            clear: async () => {
              for (const migration of guestMigrations) {
                await clearGuestCart(undefined, user.uid, migration.transferId);
              }
            },
          });
          retryAttempt = 0;
        } catch (e) {
          if (!cancelled) {
            console.error("Cart sync/migration error:", e);
            scheduleMigrationRetry();
          }
        } finally {
          migrationInFlight = false;
        }
      };

      const retryMigrationWhenOnline = () => {
        if (retryTimer) {
          window.clearTimeout(retryTimer);
          retryTimer = null;
        }
        cleanupAndMigrate();
      };

      const claimAndMigrateGuestCart = async () => {
        try {
          guestMigrations = await claimGuestCartsForUser(user.uid);
          guestCart = guestMigrations.flatMap(migration => migration.items);
        } catch (claimError) {
          console.error('Guest cart claim unavailable:', claimError);
        } finally {
          guestClaimsReady = true;
          cleanupAndMigrate();
        }
      };

      claimAndMigrateGuestCart();
      window.addEventListener('online', retryMigrationWhenOnline);

      return () => {
        cancelled = true;
        if (retryTimer) window.clearTimeout(retryTimer);
        window.removeEventListener('online', retryMigrationWhenOnline);
        unsubCart();
      };
    } else {
      setCartItems(loadGuestCart());
      setCartOwnerKey('guest');
    }
  }, [user]);

  // --- ACTIONS ---
  // Admin actions moved to Router.jsx

  // --- CART ACTIONS ---
  const getCartItemMaxQuantity = (cartItem) => {
    const catalog = (cartItem.collectionName || 'furniture') === 'cutting_boards'
      ? boardItems
      : items;
    const catalogItem = catalog.find(item => item.id === cartItem.originalId);
    if (!catalogItem) return normalizeCartQuantity(cartItem.quantity);
    if (catalogItem.sold) return 0;
    return catalogItem.stock === undefined
      ? 1
      : Math.min(MAX_CART_QUANTITY, Math.max(0, Math.floor(Number(catalogItem.stock) || 0)));
  };

  const addToCart = async (item) => {
    const currentStock = item.stock !== undefined
      ? Math.min(MAX_CART_QUANTITY, Math.max(0, Math.floor(Number(item.stock) || 0)))
      : 1;
    const itemCollectionName = item.collectionName || 'furniture';
    const matchingCartItems = cartItems.filter(c => (
      c.originalId === item.id
      && (c.collectionName || 'furniture') === itemCollectionName
    ));
    const isAnonymous = !user || user.isAnonymous;
    const existingCartItem = matchingCartItems[0];

    if (isAnonymous && existingCartItem) {
      const inCartCount = matchingCartItems.reduce(
        (sum, cartItem) => sum + normalizeCartQuantity(cartItem.quantity),
        0,
      );
      if (inCartCount >= currentStock) {
        setStockAlert({ currentStock });
        return false;
      }
      const nextQuantity = normalizeCartQuantity(existingCartItem.quantity) + 1;
      try {
        const newCart = cartItems.map(cartItem => (
          cartItem.id === existingCartItem.id
            ? { ...cartItem, quantity: nextQuantity }
            : cartItem
        ));
        setCartItems(newCart);
        await saveGuestCart(newCart);
        setCartInteracted(true);
        return true;
      } catch (e) {
        console.error("Error updating cart quantity", e);
        toast("Erreur ajout panier : " + e.message, { type: 'error' });
        return false;
      }
    }

    const cartItemData = {
      id: isAnonymous ? `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : undefined,
      originalId: item.id,
      collectionName: item.collectionName || 'furniture',
      name: item.name,
      price: item.currentPrice || item.startingPrice,
      image: item.images?.[0] || item.imageUrl,
      material: item.material || 'Bois',
      quantity: 1,
      addedAt: isAnonymous ? Date.now() : serverTimestamp()
    };

    if (isAnonymous) {
      const newCart = [...cartItems, cartItemData];
      setCartItems(newCart);
      await saveGuestCart(newCart);
      setCartInteracted(true);
      return true;
    } else {
      try {
        const firestoreItem = { ...cartItemData };
        delete firestoreItem.id;
        const cartItemRef = doc(
          db,
          'users',
          user.uid,
          'cart',
          getCartDocumentId(cartItemData),
        );
        await runTransaction(db, async (transaction) => {
          const legacyRef = existingCartItem?.id && existingCartItem.id !== cartItemRef.id
            ? doc(db, 'users', user.uid, 'cart', existingCartItem.id)
            : null;
          const [currentSnap, legacySnap] = await Promise.all([
            transaction.get(cartItemRef),
            legacyRef ? transaction.get(legacyRef) : Promise.resolve(null),
          ]);
          const currentQuantity = (
            (currentSnap.exists() ? normalizeCartQuantity(currentSnap.data().quantity) : 0)
            + (legacySnap?.exists() ? normalizeCartQuantity(legacySnap.data().quantity) : 0)
          );
          const nextQuantity = currentQuantity + 1;
          if (nextQuantity > currentStock) {
            const stockError = new Error('Limite de stock atteinte.');
            stockError.code = 'cart/stock-limit';
            throw stockError;
          }
          transaction.set(cartItemRef, {
            ...(legacySnap?.exists() ? legacySnap.data() : {}),
            ...(currentSnap.exists() ? currentSnap.data() : firestoreItem),
            quantity: nextQuantity,
          });
          if (legacySnap?.exists()) transaction.delete(legacyRef);
        });
        setCartInteracted(true);
        return true;
      } catch (e) {
        if (e.code === 'cart/stock-limit') {
          setStockAlert({ currentStock });
          return false;
        }
        console.error("Error add cart", e);
        toast("Erreur ajout panier : " + e.message, { type: 'error' });
        return false;
      }
    }
  };

  const updateCartQuantity = async (cartDocId, requestedQuantity, requestedDelta = null) => {
    const cartItem = cartItems.find(item => item.id === cartDocId);
    if (!cartItem) return false;

    const numericQuantity = Number(requestedQuantity);
    if (!Number.isFinite(numericQuantity)) return false;
    if (numericQuantity <= 0) {
      await removeFromCart(cartDocId);
      return true;
    }

    const nextQuantity = normalizeCartQuantity(numericQuantity);
    const maxQuantity = getCartItemMaxQuantity(cartItem);
    if (nextQuantity > maxQuantity) {
      setStockAlert({ currentStock: maxQuantity });
      return false;
    }

    try {
      if (!user || user.isAnonymous) {
        const newCart = cartItems.map(item => (
          item.id === cartDocId ? { ...item, quantity: nextQuantity } : item
        ));
        setCartItems(newCart);
        await saveGuestCart(newCart);
      } else {
        const canonicalRef = doc(
          db,
          'users',
          user.uid,
          'cart',
          getCartDocumentId(cartItem),
        );
        await runTransaction(db, async (transaction) => {
          const legacyRef = cartDocId !== canonicalRef.id
            ? doc(db, 'users', user.uid, 'cart', cartDocId)
            : null;
          const [currentSnap, legacySnap] = await Promise.all([
            transaction.get(canonicalRef),
            legacyRef ? transaction.get(legacyRef) : Promise.resolve(null),
          ]);
          if (!currentSnap.exists() && !legacySnap?.exists()) return;
          const currentQuantity = (
            (currentSnap.exists() ? normalizeCartQuantity(currentSnap.data().quantity) : 0)
            + (legacySnap?.exists() ? normalizeCartQuantity(legacySnap.data().quantity) : 0)
          );
          const transactionQuantity = Number.isInteger(requestedDelta)
            ? currentQuantity + requestedDelta
            : nextQuantity;
          if (transactionQuantity <= 0) {
            if (currentSnap.exists()) transaction.delete(canonicalRef);
            if (legacySnap?.exists()) transaction.delete(legacyRef);
            return;
          }
          if (transactionQuantity > maxQuantity) {
            const stockError = new Error('Limite de stock atteinte.');
            stockError.code = 'cart/stock-limit';
            throw stockError;
          }
          transaction.set(canonicalRef, {
            ...(legacySnap?.exists() ? legacySnap.data() : {}),
            ...(currentSnap.exists() ? currentSnap.data() : {}),
            quantity: normalizeCartQuantity(transactionQuantity),
          });
          if (legacySnap?.exists()) transaction.delete(legacyRef);
        });
      }
      return true;
    } catch (e) {
      if (e.code === 'cart/stock-limit') {
        setStockAlert({ currentStock: maxQuantity });
        return false;
      }
      console.error("Error updating cart quantity", e);
      toast("Impossible de modifier la quantité : " + e.message, { type: 'error' });
      return false;
    }
  };

  const removeFromCart = async (cartDocId) => {
    if (!user || user.isAnonymous) {
      const newCart = cartItems.filter(item => item.id !== cartDocId);
      setCartItems(newCart);
      await saveGuestCart(newCart);
      return;
    }
    await deleteDoc(doc(db, 'users', user.uid, 'cart', cartDocId));
  };

  const handlePlaceOrder = async (orderData) => {
    if (!user) return;
    const orderOwnerKey = currentCartOwnerKey;

    // Le serveur retire atomiquement uniquement les quantités commandées.
    // Ne jamais vider ici le panier complet : un autre onglet peut avoir ajouté
    // une nouvelle ligne pendant une réponse réseau ambiguë.

    // A late response from account A must never mutate account B's visible state.
    if (currentCartOwnerKeyRef.current !== orderOwnerKey) {
      console.info('Order completed for a previous cart owner; current UI left untouched.');
      return;
    }

    // Handle Payment Redirect or Success. Le listener Firestore conserve les
    // éventuelles quantités ajoutées après la soumission.
    setIsCartOpen(false);
    setOrderSuccessMethod(orderData.paymentMethod || 'deferred');
    setShowOrderSuccess(true); // Trigger Success Modal

    // Restore gallery state if we have it
    if (persistentGalleryState) {
      setHeaderProps(prev => ({
        ...prev,
        activeCollection: persistentGalleryState.activeCollection,
        filter: persistentGalleryState.filter
      }));
    }

    setView('my-orders'); // Prepare Mes commandes behind the modal
    scrollToTop({ immediate: true, duration: 0 });

    console.info('Order flow completed', {
      orderId: orderData.id || null,
      paymentMethod: orderData.paymentMethod || 'unknown',
      galleryRestored: Boolean(persistentGalleryState)
    });
  };

  if (loading && !showStartupPreloader) return <div className="min-h-screen flex items-center justify-center bg-transparent"><div className="w-10 h-10 border-[3px] border-stone-200 border-t-stone-900 rounded-full animate-spin"></div></div>;

  // Active Admin List



  // Active Admin List
  const currentAdminItems = adminCollection === 'furniture' ? items : boardItems;
  // Cart Total
  const cartTotal = getCartTotal(cartItems);
  const cartItemCount = getCartItemCount(cartItems);
  const selectedAffiliateProduct = affiliateProducts.find((product) => product.id === selectedAffiliateProductId);
  const selectedCatalogItems = persistentGalleryState.activeCollection === 'cutting_boards' ? boardItems : items;
  const selectedCatalogItem = selectedCatalogItems.find(i => i.id === selectedItemId);
  const isProductCatalogResolved = resolvedPublicCollections.furniture && resolvedPublicCollections.cutting_boards;
  const isProductDetailResolved = isProductCatalogResolved && !pendingDeepLink;

  return (
    <div className={`min-h-screen font-sans selection:bg-stone-300 transition-colors duration-700 ${darkMode ? 'bg-[#0A0A0A] text-stone-200' : 'bg-[#FAFAF9] text-stone-900'}`}>
      <AnalyticsProvider
        view={view}
        selectedItemId={view === 'shop-detail' ? selectedAffiliateProductId : selectedItemId}
        selectedItemName={view === 'shop-detail' ? selectedAffiliateProduct?.name : selectedCatalogItem?.name}
        selectedItemPrice={view === 'shop-detail' ? selectedAffiliateProduct?.price : (selectedCatalogItem?.currentPrice || selectedCatalogItem?.startingPrice)}
        selectedItemContext={view === 'shop-detail' ? selectedAffiliateProductContext : null}
      />

      {showStartupPreloader && (
        <StartupPreloader
          warmup={runStartupWarmup}
          onComplete={handleStartupPreloaderComplete}
        />
      )}

      {/* RIDEAU DE TRANSITION GLOBAL (Masque le switch de page) */}
      <div
        className={`fixed inset-0 z-[2000] pointer-events-none transition-opacity duration-400 ease-in-out ${isTransitioning ? 'opacity-100' : 'opacity-0'}`}
        style={{ backgroundColor: darkMode ? '#0A0A0A' : '#FAFAF9' }}
      ></div>

      {loading && !showStartupPreloader && <div className="fixed inset-0 z-[999] flex items-center justify-center bg-transparent"><div className="w-10 h-10 border-[3px] border-stone-200 border-t-stone-900 rounded-full animate-spin"></div></div>}

      {/* COMPOSANT PANIER - Global (Disponible dès que la navbar est visible) */}
      <CartSidebar
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onRemoveItem={removeFromCart}
        onUpdateQuantity={updateCartQuantity}
        getMaxQuantity={getCartItemMaxQuantity}
        totalPrice={cartTotal}
        onCheckout={() => {
          setIsCartOpen(false);
          setView('checkout');
          scrollToTop();
        }}
        interacted={cartInteracted}
        darkMode={darkMode}
        activeDesignId={activeDesignId}
      />

      {/* MODAL LOGIN (Pour la Marketplace) */}
      {showFullLogin && (
        <div
          className="fixed inset-0 z-[200] bg-[#050505]/55 backdrop-blur-md flex items-center justify-center p-2 sm:p-3 md:p-6"
          onClick={(e) => { if (e.target === e.currentTarget) setShowFullLogin(false); }}
        >
          <div className="relative w-full max-w-[430px] overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#0b0d0f]/95 text-stone-100 shadow-[0_30px_90px_rgba(0,0,0,0.55)] animate-in zoom-in-95 max-h-[calc(100dvh-16px)] overflow-y-auto ios-modal-scroll [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:rounded-[1.65rem] md:max-h-[88vh]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(245,174,80,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.07),transparent_36%)]"></div>
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/45 to-transparent"></div>

            <AuthPanel 
              onClose={() => setShowFullLogin(false)}
              onSuccess={() => setShowFullLogin(false)}
              darkMode={darkMode}
            />
          </div>
        </div>
      )}

      {/* --- NAVBAR & MENU GLOBAUX (NE S'AFFICHENT PAS SUR LA PAGE D'ACCUEIL) --- */}
      {/* --- MENU GLOBAL (Toujours disponible sauf Home) --- */}
      {!['home', 'about'].includes(view) && (
        <GlobalMenu
          isMenuOpen={isMenuOpen}
          setIsMenuOpen={setIsMenuOpen}
          setView={setView}
          user={user}
          isAdmin={isAdmin}
          darkMode={darkMode}
          activeDesignId={activeDesignId}
          contactInfo={contactInfo}
        />
      )}

      {/* --- NAVBAR GLOBALE --- */}
      {!['home', 'about'].includes(view) && (
        <>
          {activeDesignId === 'architectural' ? (
            <ArchitecturalHeader
              headerProps={headerProps}
              user={user}
              onShowLogin={() => setShowFullLogin(true)}
              onOpenMenu={() => setIsMenuOpen(true)}
              onOpenCart={() => { setCartInteracted(true); setIsCartOpen(true); }}
              cartCount={cartItemCount}
              toggleTheme={() => setDarkMode(!darkMode)}
              darkMode={darkMode}
              onBack={view === 'detail' ? () => setView('gallery') : view === 'shop-detail' ? () => setView('shop') : null}
            />
          ) : (
            <nav className={`fixed top-0 left-0 right-0 z-[110] px-4 md:px-12 pt-[max(4.5rem,env(safe-area-inset-top)+2rem)] pb-4 md:py-8 flex justify-between items-center transition-all duration-500 ease-in-out ${isHeaderVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
              <div className="flex items-center gap-1.5 md:gap-3 cursor-pointer group" onClick={() => { window.hasShownPreloader = true; setView('about'); scrollToTop(); }}>
                <div className={`w-[28px] h-[28px] md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center backdrop-blur-2xl border transition-all group-hover:rotate-6 shadow-sm ${darkMode ? 'bg-white/10 border-white/20 text-white' : 'bg-white border-stone-300 text-stone-900'}`}>
                  <Hammer size={12} strokeWidth={1.5} className="md:w-4 md:h-4" />
                </div>
                <div className="flex flex-col justify-center">
                  <h1 className={`text-[13px] md:text-lg font-bold uppercase tracking-tight md:tracking-widest leading-none transition-colors ${darkMode ? 'text-white' : 'text-stone-900 shadow-stone-200/50'}`}>Tous à Table</h1>
                  <p className={`font-serif italic text-[11px] md:text-[14px] tracking-[0.05em] md:tracking-[0.1em] leading-none mt-0.5 md:mt-1 ml-0.5 transition-colors ${darkMode ? 'text-white/80' : 'text-stone-600'}`}>Atelier Normand</p>
                </div>
              </div>

              <div className={`flex items-center gap-1 md:gap-4 ${darkMode ? 'text-white' : 'text-stone-900'}`}>
                {user && !user.isAnonymous ? (
                  <div className="flex items-center gap-1.5 md:gap-4 mr-0.5 md:mr-2">
                    <div className="text-right hidden md:block">
                      <div className="flex items-center justify-end gap-2">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-white' : 'text-stone-900'}`}>{user.displayName || 'Client'}</p>
                        {user.emailVerified && <ShieldCheck size={14} strokeWidth={3} className={darkMode ? 'text-white' : 'text-stone-900'} title="Compte Vérifié" />}
                      </div>
                    </div>
                    <button onClick={() => { logout(); }} className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center backdrop-blur-2xl border shadow-xl transition-all ${darkMode ? 'bg-white/10 border-white/20 text-white hover:bg-white hover:text-stone-900 shadow-white/5' : 'bg-white border-stone-200 text-stone-900 hover:bg-stone-900 hover:text-white shadow-stone-200/50'}`}><LogOut size={12} className="md:w-[15px] md:h-[15px]" /></button>
                  </div>
                ) : !isSecretGateOpen && (
                  <button onClick={() => setShowFullLogin(true)} className={`flex items-center gap-2 px-3 py-2 md:px-5 md:py-2.5 rounded-full backdrop-blur-2xl border shadow-xl transition-all text-[9.5px] md:text-[11px] font-bold uppercase tracking-widest mr-0.5 md:mr-2 ${darkMode ? 'bg-white/10 border-white/20 text-white hover:bg-white hover:text-stone-900 shadow-white/5' : 'bg-white border-stone-200 text-stone-900 hover:bg-stone-900 hover:text-white shadow-stone-200/50'}`}><ShieldCheck size={12} className="md:w-3.5 md:h-3.5" /> <span className="hidden md:inline">Connexion</span></button>
                )}

                {/* CART BUTTON - Uniquement sur marketplace, detail et checkout */}
                {['gallery', 'detail', 'checkout'].includes(view) && (
                  <button
                    onClick={() => { setCartInteracted(true); setIsCartOpen(true); }}
                    className={`w-8 h-8 md:w-auto md:h-auto px-0 md:px-5 md:py-2.5 rounded-full flex items-center justify-center gap-2.5 backdrop-blur-2xl border shadow-xl transition-all group relative ${darkMode ? 'bg-white/15 border-white/20 text-white hover:bg-amber-500 hover:text-white shadow-white/5' : 'bg-white border-stone-200 text-stone-900 hover:bg-amber-500 hover:text-white shadow-stone-200/50'}`}
                  >
                    <ShoppingBag size={14} className="md:w-[15px] md:h-[15px]" />
                    <span className="hidden md:block text-[9.5px] md:text-[11px] font-bold uppercase tracking-widest">Panier</span>
                    {cartItemCount > 0 && (
                      <span className="absolute -top-1 -right-1 md:top-1 md:right-1 w-3 h-3 md:w-4 md:h-4 bg-amber-500 text-white flex items-center justify-center text-[7px] md:text-[9px] font-black rounded-full border border-white shadow-md">
                        {cartItemCount}
                      </span>
                    )}
                  </button>
                )}

                {/* DARK MODE TOGGLE */}
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center backdrop-blur-2xl border shadow-xl transition-all ml-0.5 md:ml-0 ${darkMode ? 'bg-white/15 border-white/20 text-white hover:bg-amber-500 hover:text-white shadow-white/5' : 'bg-white border-stone-200 text-stone-900 hover:bg-amber-500 hover:text-white shadow-stone-200/50'}`}
                  title={darkMode ? 'Mode Clair' : 'Mode Sombre'}
                >
                  {darkMode ? <Sun size={12} className="md:w-[15px] md:h-[15px]" /> : <Moon size={12} className="md:w-[15px] md:h-[15px]" />}
                </button>

                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`relative w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center backdrop-blur-2xl border shadow-xl group transition-all ml-0.5 md:ml-0 ${darkMode ? 'bg-white/10 border-white/20 hover:bg-white shadow-white/5' : 'bg-white border-stone-200 hover:bg-stone-900 shadow-stone-200/50'}`}>
                  <Menu size={14} className={`absolute md:w-[15px] md:h-[15px] transition-all duration-500 ease-in-out ${darkMode ? 'text-white group-hover:text-stone-900' : 'text-stone-900 group-hover:text-white'} ${isMenuOpen ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`} />
                  <X size={14} className={`absolute md:w-[15px] md:h-[15px] transition-all duration-500 ease-in-out ${darkMode ? 'text-white group-hover:text-stone-900' : 'text-stone-900 group-hover:text-white'} ${isMenuOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`} />
                </button>
              </div>
            </nav>
          )}
        </>
      )
      }

      {/* --- CONTENU PRINCIPAL --- */}
      <main className={`transition-all duration-700 ease-in-out ${isCartOpen ? 'scale-[0.98] blur-sm opacity-50' : ''}`}>
        <AppRouter
          view={view}
          setView={setView}
          items={items}
          boardItems={boardItems}
          isPreparingGallery={isPreparingGallery}
          startGalleryTransition={startGalleryTransition}
          completeGalleryTransition={completeGalleryTransition}
          darkMode={darkMode}
          activeDesignId={activeDesignId}
          isSecretGateOpen={isSecretGateOpen}
          setShowFullLogin={setShowFullLogin}
          setSelectedItemId={setSelectedItemId}
          selectedItemId={selectedItemId}
          selectedAffiliateProductId={selectedAffiliateProductId}
          setSelectedAffiliateProductId={setSelectedAffiliateProductId}
          selectedAffiliateProductContext={selectedAffiliateProductContext}
          setSelectedAffiliateProductContext={setSelectedAffiliateProductContext}
          addToCart={addToCart}
          cartItems={cartItems}
          cartTotal={cartTotal}
          handlePlaceOrder={handlePlaceOrder}
          showOrderSuccess={showOrderSuccess}
          setShowOrderSuccess={setShowOrderSuccess}
          orderSuccessMethod={orderSuccessMethod}
          adminCollection={adminCollection}
          setAdminCollection={setAdminCollection}
          editingItem={editingItem}
          setEditingItem={setEditingItem}
          onOpenMenu={() => setIsMenuOpen(true)}
          onOpenCart={() => { setCartInteracted(true); setIsCartOpen(true); }}
          toggleTheme={() => setDarkMode(!darkMode)}
          onOpenDiscovery={() => setShowMarketplacePopup(true)}
          setHeaderProps={setHeaderProps}
          persistentGalleryState={persistentGalleryState}
          saveGalleryState={saveGalleryState}
          affiliateProducts={affiliateProducts}
          homeSEOSettings={homeSEOSettings}
          isProductCatalogResolved={isProductDetailResolved}
          contactInfo={contactInfo}
        />
      </main>
      <WhatsAppFloatingButton
        contactInfo={contactInfo}
        darkMode={darkMode}
        view={view}
        item={view === 'shop-detail' ? selectedAffiliateProduct : selectedCatalogItem}
        cartCount={cartItemCount}
        cartTotal={cartTotal}
        hidden={['admin', 'login', 'home'].includes(view) || isCartOpen || showFullLogin || showStartupPreloader || isMenuOpen || showMarketplacePopup || showOrderSuccess || stockAlert || isFooterVisible}
      />
      {
        ['home', 'gallery', 'detail', 'checkout', 'my-orders', 'shop', 'shop-detail'].includes(view) && (
          <div ref={footerRef}>
            <Footer darkMode={darkMode} contactInfo={contactInfo} />
          </div>
        )
      }

      {/* Global Popups */}
      <MarketplaceDiscovery
        isOpen={showMarketplacePopup}
        onClose={() => setShowMarketplacePopup(false)}
        onExplore={() => {
          setShowMarketplacePopup(false);
          startGalleryTransition();
          setTimeout(() => {
            completeGalleryTransition();
          }, 800);
        }}
      />

      {/* MODAL STOCK INSUFFISANT (Premium UI) */}
      <AnimatePresence>
        {stockAlert && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 md:p-6 bg-stone-900/40 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className={`max-w-md w-full p-8 md:p-12 rounded-[2.5rem] shadow-2xl text-center space-y-8 relative overflow-hidden ${darkMode ? 'bg-stone-800' : 'bg-white'}`}
            >
              <div className="w-20 h-20 bg-amber-500/10 rounded-[2rem] flex items-center justify-center text-amber-500 mx-auto border border-amber-500/20 shadow-inner">
                <AlertTriangle size={40} className="animate-pulse" />
              </div>

              <div className="space-y-4">
                <h3 className="text-2xl md:text-4xl font-black tracking-tighter">Stock insuffisant</h3>
                <div className="w-12 h-1 bg-amber-500 mx-auto rounded-full opacity-30"></div>
                <p className={`text-base md:text-lg font-medium leading-relaxed px-4 ${darkMode ? 'text-stone-300' : 'text-stone-500'}`}>
                  Il ne reste que <strong className={darkMode ? 'text-amber-400' : 'text-stone-900'}>{stockAlert.currentStock} exemplaire(s)</strong> disponible(s) pour cette pièce unique.
                </p>
              </div>

              <button
                onClick={() => setStockAlert(null)}
                className="w-full py-5 bg-stone-950 text-white dark:bg-white dark:text-stone-900 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-black/10 flex items-center justify-center gap-3 group"
              >
                <span>J'ai compris</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div >
  );
};
// Wrapper to provide Context
// Wrapper to provide Context
export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </ErrorBoundary>
    </AuthProvider>
  );
}
