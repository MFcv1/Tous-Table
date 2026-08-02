import React, { useState, useEffect, useRef } from 'react';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  onSnapshot, collection, doc, deleteDoc, serverTimestamp, addDoc, query, getDocs, getDoc, writeBatch
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions'; // Added for logUserConnection
// Auth imports removed (handled in Context)
import {
  Hammer, LogOut, ShieldCheck, Menu, Eye, EyeOff, ShoppingBag, Sun, Moon, AlertTriangle, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- IMPORTS CONFIG & UTILS ---
import { db, appId, functions, googleProvider } from './firebase/config';
import { getMillis } from './utils/time';
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
  const { user, isAdmin, loading: authLoading, loginWithGoogle, loginWithEmail, signupWithEmail, logout, verifyEmail } = useAuth();

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
  const [cartItems, setCartItems] = useState([]);
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showAuthSuccess, setShowAuthSuccess] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);
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
      if (boardItems.some((item) => item.id === selectedItemId)) return 'cutting_boards|affiliate_products';
      if (items.some((item) => item.id === selectedItemId)) return 'furniture|affiliate_products';
      return 'furniture|cutting_boards|affiliate_products';
    }
    return '';
  }, [view, persistentGalleryState.activeCollection, selectedItemId, items, boardItems]);

  /**
   * Clé live stock public (furniture / cutting_boards) stable gallery ↔ detail
   * sur la même collection — évite un unsub/resub Firestore inutile.
   * Vide hors gallery|detail.
   */
  const publicLiveStockKey = React.useMemo(() => {
    if (view === 'gallery') {
      return persistentGalleryState.activeCollection === 'cutting_boards'
        ? 'cutting_boards'
        : 'furniture';
    }
    if (view === 'detail') {
      if (boardItems.some((item) => item.id === selectedItemId)) return 'cutting_boards';
      if (items.some((item) => item.id === selectedItemId)) return 'furniture';
      // Produit pas encore résolu : les deux stock (temporaire).
      return 'furniture|cutting_boards';
    }
    return '';
  }, [view, persistentGalleryState.activeCollection, selectedItemId, items, boardItems]);

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
      setView(route.view);
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

    const allItems = [...items, ...boardItems];
    const selectedItem = allItems.find((item) => item.id === selectedItemId);
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
    if (pendingDeepLink && (items.length > 0 || boardItems.length > 0)) {
      const allItems = [...items, ...boardItems];
      const targetItem = allItems.find(i => i.id === pendingDeepLink);

      if (targetItem) {
        console.log("Deep link activated for:", targetItem.name);
        setSelectedItemId(pendingDeepLink);
        setView('detail');
        setPendingDeepLink(null); // Lien consommé
      }
    }
  }, [items, boardItems, pendingDeepLink]);

  // --- CART SYNC ---
  useEffect(() => {
    if (user && !user.isAnonymous) {
      console.log("Subscribing to cart for user:", user.uid);
      // Removing orderBy for debugging to avoid index issues
      const q = query(collection(db, 'users', user.uid, 'cart'));
      const unsubCart = onSnapshot(q, (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCartItems(items);
      }, (err) => {
        console.error("Cart sync error:", err);
      });
      return () => unsubCart();
    } else {
      setCartItems([]);
    }
  }, [user]);

  // --- AUTO-ADD PENDING ITEM AFTER LOGIN ---
  useEffect(() => {
    if (user && !user.isAnonymous && pendingItem) {
      console.log("Adding pending item to cart after login:", pendingItem.name);
      addToCart(pendingItem);
      setPendingItem(null);
    }
  }, [user, pendingItem]);

  // --- ACTIONS ---
  // Admin actions moved to Router.jsx

  const handleSocialLogin = async (provider) => {
    // For now we only support Google via context helper
    try {
      await loginWithGoogle();
      setShowFullLogin(false);
    } catch (e) { console.error(e); }
  };

  // --- CART ACTIONS ---
  const addToCart = async (item) => {
    // console.log("Add to cart clicked", user);
    if (!user || user.isAnonymous) {
      // console.log("User is not logged in or anonymous, showing login modal");
      setPendingItem(item); // Store for after login
      setShowFullLogin(true);
      return false;
    }

    // [NEW] Check Stock Limit
    const currentStock = item.stock !== undefined ? Number(item.stock) : 1;
    const inCartCount = cartItems.filter(c => c.originalId === item.id).length;

    if (inCartCount >= currentStock) {
      setStockAlert({ currentStock });
      return false;
    }

    const cartItemData = {
      originalId: item.id,
      collectionName: item.collectionName || 'furniture', // [NEW] Save collection
      name: item.name,
      price: item.currentPrice || item.startingPrice,
      image: item.images?.[0] || item.imageUrl,
      material: item.material || 'Bois',
      quantity: 1, // [FIX] Required by Firestore Rules
      addedAt: serverTimestamp()
    };


    try {
      await addDoc(collection(db, 'users', user.uid, 'cart'), cartItemData);
      setCartInteracted(true);
      setIsCartOpen(true);
      return true;
    } catch (e) {
      console.error("Error add cart", e);
      toast("Erreur ajout panier : " + e.message, { type: 'error' });
      return false;
    }
  };

  const removeFromCart = async (cartDocId) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'cart', cartDocId));
  };

  const handlePlaceOrder = async (orderData) => {
    if (!user) return;

    // 1. Create Order - REMOVED (Handled by Cloud Function createOrder)
    // The order is securely created server-side to manage stock transactions.
    // We just need to clear the local cart now.

    // 2. Clear Cart (Batch)
    // Note: In a real app we would use a batch, but loop is fine for small carts
    // We already have cartItems in state
    for (const item of cartItems) {
      await deleteDoc(doc(db, 'users', user.uid, 'cart', item.id));
    }

    // 3. Handle Payment Redirect or Success
    setCartItems([]); // Clear UI cart immediately
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

    // Email simulation log
    console.log("Order placed restoration:", persistentGalleryState, orderData);
  };

  if (loading && !showStartupPreloader) return <div className="min-h-screen flex items-center justify-center bg-transparent"><div className="w-10 h-10 border-[3px] border-stone-200 border-t-stone-900 rounded-full animate-spin"></div></div>;

  // Active Admin List



  // Active Admin List
  const currentAdminItems = adminCollection === 'furniture' ? items : boardItems;
  // Cart Total
  const cartTotal = cartItems.reduce((sum, item) => sum + (item.price || 0), 0);
  const selectedAffiliateProduct = affiliateProducts.find((product) => product.id === selectedAffiliateProductId);
  const selectedCatalogItem = items.concat(boardItems).find(i => i.id === selectedItemId);
  const isProductCatalogResolved = resolvedPublicCollections.furniture && resolvedPublicCollections.cutting_boards;

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
        totalPrice={cartTotal}
        onCheckout={() => { setIsCartOpen(false); setView('checkout'); scrollToTop(); }}
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

            {showAuthSuccess ? (
              <div className="relative p-5 md:p-8 space-y-5 md:space-y-6 text-center animate-in fade-in slide-in-from-bottom-4">
                <div className="mx-auto inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-300/10 text-amber-200 ring-1 ring-amber-200/20">
                    <Hammer size={15} />
                  </span>
                  <span className="text-left">
                    <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-white">Tous à Table</span>
                    <span className="block font-serif text-[11px] italic text-stone-400">Atelier Normand</span>
                  </span>
                </div>
                <div className="w-16 h-16 bg-emerald-400/10 rounded-2xl flex items-center justify-center mx-auto text-emerald-300 border border-emerald-300/20 shadow-[0_0_35px_rgba(52,211,153,0.14)]">
                  <ShieldCheck size={34} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black tracking-tight text-white">Vérifiez vos emails</h3>
                  <p className="text-sm text-stone-300 font-medium px-2 leading-relaxed">
                    Un lien de confirmation vient d'être envoyé. <br />
                    <span className="text-amber-200 font-bold">Pensez à regarder dans vos spams.</span>
                  </p>
                </div>
                <button onClick={() => { setShowFullLogin(false); setShowAuthSuccess(false); }} className="w-full py-4 rounded-2xl bg-white text-stone-950 font-black uppercase text-[10px] tracking-[0.2em] transition-all hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
                  C'est compris
                </button>
              </div>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFullLogin(false)}
                  className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-stone-400 transition-all hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 md:h-10 md:w-10"
                  aria-label="Fermer la connexion"
                >
                  <X size={18} />
                </button>

                {/* HEADER */}
                <div className="px-5 pb-4 pt-5 border-b border-white/10 md:px-8 md:pb-5 md:pt-8">
                  <div className="mb-4 flex items-center justify-between gap-4 pr-10 md:mb-7 md:pr-11">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-amber-200/20 bg-amber-300/10 text-amber-200 shadow-[0_0_30px_rgba(245,174,80,0.10)] md:h-10 md:w-10">
                        <Hammer size={17} />
                      </div>
                      <div className="text-left leading-none">
                        <p className="text-[13px] font-black uppercase tracking-[0.18em] text-white">Tous à Table</p>
                        <p className="mt-1 font-serif text-xs italic text-stone-400">Atelier Normand</p>
                      </div>
                    </div>
                    <span className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200 md:inline-flex">Sécurisé</span>
                  </div>

                  <div className="space-y-2 text-left md:space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-200 md:py-1.5">
                      <ShieldCheck size={12} />
                      Accès vente
                    </div>
                    <h3 className="text-[1.7rem] font-black leading-none tracking-tight text-white md:text-[2rem]">Connexion</h3>
                    <p className="max-w-[31ch] text-[13px] font-medium leading-snug text-stone-400 md:text-sm md:leading-relaxed">Identifiez-vous pour accéder à la vente et retrouver vos pièces sélectionnées.</p>
                  </div>
                </div>

                <div className="space-y-4 px-5 py-4 md:space-y-5 md:px-8 md:py-7">
                {/* FORMULAIRE EMAIL */}
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const email = e.target.email.value;
                  const pass = e.target.password.value;
                  const confirmPass = e.target.confirmPassword?.value;
                  const isSignUp = e.target.getAttribute('data-signup') === 'true';

                  try {
                    if (isSignUp) {
                      if (pass !== confirmPass) throw new Error("Les mots de passe ne correspondent pas.");
                      const userCredential = await signupWithEmail(email, pass);
                      await verifyEmail(userCredential.user);
                      setShowAuthSuccess(true);
                    } else {
                      await loginWithEmail(email, pass);
                      setShowFullLogin(false);
                    }
                  } catch (err) {
                    let msg = "Une erreur est survenue.";
                    if (err.code === 'auth/email-already-in-use') msg = "Cet email est déjà associé à un compte. Connectez-vous.";
                    else if (err.code === 'auth/weak-password') msg = "Le mot de passe doit contenir au moins 6 caractères.";
                    else if (err.code === 'auth/invalid-email') msg = "L'adresse email n'est pas valide.";
                    else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') msg = "Email ou mot de passe incorrect.";

                    toast(msg, { type: 'error' });
                  }
                }} className="space-y-2.5 md:space-y-3" data-signup="false" data-auth-form="marketplace">

                  <input name="email" type="email" placeholder="Adresse email" className="w-full rounded-2xl bg-white/[0.055] border border-white/10 px-4 py-3.5 font-bold text-sm outline-none transition-all text-white placeholder:text-stone-500 hover:bg-white/[0.075] focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20 md:p-4 md:text-base" required autoComplete="email" />

                  <div className="relative">
                    <input name="password" type={showPassword ? "text" : "password"} placeholder="Mot de passe" className="w-full rounded-2xl bg-white/[0.055] border border-white/10 px-4 py-3.5 pr-12 font-bold text-sm outline-none transition-all text-white placeholder:text-stone-500 hover:bg-white/[0.075] focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20 md:p-4 md:pr-12 md:text-base" required autoComplete="current-password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-500 transition-colors hover:text-amber-100 focus-visible:outline-none focus-visible:text-amber-100">
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>

                  <div id="confirm-pass-container" className="hidden transition-all duration-300 overflow-hidden" style={{ maxHeight: '0px' }}>
                    <div className="relative mb-2.5 md:mb-3">
                      <input name="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Confirmer mot de passe" className="w-full rounded-2xl bg-white/[0.055] border border-white/10 px-4 py-3.5 pr-12 font-bold text-sm outline-none transition-all text-white placeholder:text-stone-500 hover:bg-white/[0.075] focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20 md:p-4 md:pr-12 md:text-base" autoComplete="new-password" />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-500 transition-colors hover:text-amber-100 focus-visible:outline-none focus-visible:text-amber-100">
                        {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="w-full rounded-2xl bg-white py-3.5 text-stone-950 font-black uppercase text-[10px] tracking-[0.22em] transition-all hover:bg-amber-100 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 md:py-4">
                    <span id="btn-text">Continuer</span>
                  </button>
                </form>

                {/* DIVIDER */}
                <div className="flex items-center gap-4">
                  <div className="h-px bg-white/10 flex-1"></div>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-600">OU</span>
                  <div className="h-px bg-white/10 flex-1"></div>
                </div>

                {/* GOOGLE */}
                <button onClick={() => handleSocialLogin(googleProvider)} className="group w-full flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3.5 font-bold text-white transition-all hover:border-white/20 hover:bg-white/[0.11] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 md:p-4">
                  <div className="bg-white rounded-full p-1 shadow-sm"><img src="https://www.google.com/favicon.ico" className="w-3 h-3" alt="G" /></div>
                  <span>Continuer avec Google</span>
                </button>

                {/* FOOTER ACTIONS */}
                <div className="flex justify-between items-center px-1 pt-1">
                  <button onClick={() => {
                    const form = document.querySelector('[data-auth-form="marketplace"]');
                    const container = document.getElementById('confirm-pass-container');
                    const isSignUp = form.getAttribute('data-signup') === 'true';

                    form.setAttribute('data-signup', !isSignUp);

                    if (!isSignUp) { // Opening
                      container.classList.remove('hidden');
                      void container.offsetWidth;
                      container.style.maxHeight = '100px';
                      document.querySelector('input[name="confirmPassword"]').required = true;
                      setTimeout(() => { container.style.overflow = 'visible'; }, 300);
                    } else { // Closing
                      container.style.overflow = 'hidden';
                      container.style.maxHeight = '0px';
                      setTimeout(() => container.classList.add('hidden'), 300);
                      document.querySelector('input[name="confirmPassword"]').required = false;
                    }

                    document.getElementById('btn-text').innerText = !isSignUp ? "S'inscrire" : "Continuer";
                    document.getElementById('toggle-text').innerText = !isSignUp ? "J'ai déjà un compte" : "Pas de compte ?";
                  }} className="text-[10px] font-bold text-stone-500 transition-colors hover:text-amber-100 focus-visible:outline-none focus-visible:text-amber-100" id="toggle-text">Pas de compte ?</button>

                  <button onClick={() => setShowFullLogin(false)} className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-500 transition-colors hover:text-red-300 focus-visible:outline-none focus-visible:text-red-300">Annuler</button>
                </div>
                </div>
              </div>
            )}
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
              cartCount={cartItems.length}
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
                    {cartItems.length > 0 && (
                      <span className="absolute -top-1 -right-1 md:top-1 md:right-1 w-3 h-3 md:w-4 md:h-4 bg-amber-500 text-white flex items-center justify-center text-[7px] md:text-[9px] font-black rounded-full border border-white shadow-md">
                        {cartItems.length}
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
      <main>
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
          isProductCatalogResolved={isProductCatalogResolved}
          contactInfo={contactInfo}
        />
      </main>
      <WhatsAppFloatingButton
        contactInfo={contactInfo}
        darkMode={darkMode}
        view={view}
        item={view === 'shop-detail' ? selectedAffiliateProduct : selectedCatalogItem}
        cartCount={cartItems.length}
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
