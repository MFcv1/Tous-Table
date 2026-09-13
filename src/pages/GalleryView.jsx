import React, { useEffect, useState, useMemo } from 'react';
import { useLiveTheme } from '../hooks/useLiveTheme';
import { useCallback } from 'react';
// Note : la marketplace repose sur le scroll natif pour limiter le coût CPU/GPU.

// DESIGNS (Layouts)
import ArchitecturalLayout from '../designs/architectural/MarketplaceLayout';
import SEO from '../components/shared/SEO';
import { getFurnitureCategory } from '../utils/furnitureCategory';
import { FURNITURE_CATEGORY_ROUTES, SITE_URL, getFurnitureCategoryPath, getProductPath, pushUrl } from '../utils/seoRoutes';
import {
    warmupBoardsIntent,
    warmupFurnitureIntent,
    warmupProductDetailIntent,
    warmupShopIntent,
} from '../utils/startupWarmup';

// SEO component is imported at the top.

const CATEGORY_SEO = {
    home: {
        title: 'Meubles Anciens Restaures en Normandie',
        description: 'Tous a Table Made in Normandie restaure et propose des meubles anciens en bois massif, planches anciennes et pieces uniques selectionnees pres de Caen.',
    },
    all: {
        title: 'Meubles Anciens a Vendre',
        description: 'Collection de meubles anciens restaures a vendre : tables de ferme, buffets, armoires, commodes, chaises et bancs prepares en Normandie.',
    },
    buffet: {
        title: 'Buffets Anciens Restaures',
        description: 'Selection de buffets anciens restaures, bahuts et meubles de rangement en bois massif, choisis et prepares par l atelier Tous a Table en Normandie.',
    },
    table: {
        title: 'Tables de Ferme Anciennes',
        description: 'Tables de ferme anciennes et tables en bois massif restaurees, pieces uniques pour salle a manger, cuisine et maison de caractere.',
    },
    chaise: {
        title: 'Chaises et Bancs Anciens',
        description: 'Chaises anciennes, bancs et assises en bois massif selectionnes pour accompagner les meubles anciens et tables de ferme restaurees.',
    },
    armoire: {
        title: 'Armoires Anciennes Restaures',
        description: 'Armoires anciennes en bois massif, vestiaires et meubles hauts restaures avec soin, disponibles a la vente avec livraison en France.',
    },
    commode: {
        title: 'Commodes et Chevets Anciens',
        description: 'Commodes anciennes, chevets, secretaires et meubles de rangement restaures pour interieur authentique et durable.',
    },
    autre: {
        title: 'Autres Meubles Anciens',
        description: 'Selection de meubles anciens singuliers : vitrines, consoles, coffres, miroirs, meubles de metier et pieces de caractere.',
    },
};

const BOARD_SEO = {
    title: 'Planches a Decouper Anciennes et Bois Massif',
    description: 'Planches a decouper en bois, pieces anciennes et objets en bois massif selectionnes par Tous a Table Made in Normandie.',
};

const getStructuredDataPrice = (item) => {
    if (!item || item.priceOnRequest) return null;
    const rawPrice = item.currentPrice ?? item.startingPrice ?? item.price;
    const price = Number(rawPrice);
    return Number.isFinite(price) && price > 0 ? price : null;
};

const getStructuredDataAvailability = (item) => {
    const stock = Number(item?.stock ?? 1);
    return !item?.sold && stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock';
};

const buildProductListSchema = (item, url, image) => {
    const price = getStructuredDataPrice(item);
    if (!price) return null;

    return {
        '@type': 'Product',
        name: item.name,
        url,
        ...(image ? { image } : {}),
        offers: {
            '@type': 'Offer',
            url,
            priceCurrency: 'EUR',
            price,
            availability: getStructuredDataAvailability(item),
            itemCondition: 'https://schema.org/UsedCondition',
        },
    };
};

const GalleryView = ({ 
    items, boardItems = [], affiliateProducts = [], user, onSelectItem, onShowLogin, darkMode = false,
    onOpenMenu, onOpenCart, toggleTheme, setHeaderProps,
    persistentGalleryState, saveGalleryState, onOpenShop
}) => {
    const [filter, setFilter] = useState(persistentGalleryState?.filter || 'fixed');
    const [activeCollection, setActiveCollection] = useState(persistentGalleryState?.activeCollection || 'furniture'); // 'furniture' | 'cutting_boards'
    const [activeCategory, setActiveCategory] = useState(persistentGalleryState?.activeCategory || 'all');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

    // THEME & DESIGN HOOK
    const { palette } = useLiveTheme(darkMode);

    useEffect(() => {
        if (persistentGalleryState?.activeCollection) {
            setActiveCollection(persistentGalleryState.activeCollection);
        }
        if (persistentGalleryState?.filter) {
            setFilter(persistentGalleryState.filter);
        }
        if (persistentGalleryState?.activeCategory) {
            setActiveCategory(persistentGalleryState.activeCategory);
        }
    }, [persistentGalleryState?.activeCollection, persistentGalleryState?.filter, persistentGalleryState?.activeCategory]);

    // --- LOGIC: FILTER & SORT ---
    // 1. Choose collection source
    const sourceItems = activeCollection === 'furniture' ? items : boardItems;

    // 2. Filter by Status (Public only) & Type (Auction/Fixed)
    const filteredItems = sourceItems.filter(item => {
        if (item.status !== 'published') return false;

        // SÃ©paration stricte : EnchÃ¨res vs Vente Directe
        if (filter === 'auction') {
            return item.auctionActive === true;
        } else {
            return !item.auctionActive;
        }
    });





    const handleCollectionIntent = useCallback((collection) => {
        if (collection === 'cutting_boards') {
            warmupBoardsIntent({ boardItems });
            return;
        }

        if (collection === 'furniture') {
            warmupFurnitureIntent({ items });
        }
    }, [boardItems, items]);

    const handleShopIntent = useCallback(() => {
        warmupShopIntent({ affiliateProducts });
    }, [affiliateProducts]);

    const handleProductIntent = useCallback((item) => {
        warmupProductDetailIntent(item);
    }, []);

    const handleSelectItem = (id) => {
        const selectedItem = filteredItems.find((item) => item.id === id);
        if (selectedItem) handleProductIntent(selectedItem);

        // [PERSISTENCE] Save current sub-view state + scroll position before navigating away
        if (saveGalleryState) {
            saveGalleryState({ activeCollection, filter, activeCategory, scrollY: window.scrollY });
        }
        onSelectItem(id);
    };

    // Always use Architectural
    const LayoutComponent = ArchitecturalLayout;
    const seoUrl = activeCollection === 'cutting_boards' ? '/planches-a-decouper-anciennes' : getFurnitureCategoryPath(activeCategory);
    const seoCopy = activeCollection === 'cutting_boards'
        ? BOARD_SEO
        : (CATEGORY_SEO[activeCategory] || CATEGORY_SEO.all);
    const breadcrumbName = activeCollection === 'cutting_boards'
        ? 'Planches a decouper anciennes'
        : (FURNITURE_CATEGORY_ROUTES[activeCategory]?.label || FURNITURE_CATEGORY_ROUTES.all.label);
    const seoListItems = useMemo(() => {
        const categoryItems = activeCollection === 'furniture' && activeCategory !== 'all'
            ? filteredItems.filter((item) => getFurnitureCategory(item) === activeCategory)
            : filteredItems;

        return categoryItems.slice(0, 24).map((item, index) => {
            const url = `${SITE_URL}${getProductPath(item)}`;
            const image = item.images?.[0] || item.imageUrl || item.thumbnailUrl;
            const productSchema = buildProductListSchema(item, url, image);
            return {
                '@type': 'ListItem',
                position: index + 1,
                url,
                ...(productSchema ? { item: productSchema } : {}),
            };
        });
    }, [activeCategory, activeCollection, filteredItems]);

    const gallerySchema = useMemo(() => {
        const graph = [
            {
                '@type': 'CollectionPage',
                '@id': `${SITE_URL}${seoUrl}#collection`,
                url: `${SITE_URL}${seoUrl}`,
                name: seoCopy.title,
                description: seoCopy.description,
                isPartOf: {
                    '@type': 'WebSite',
                    name: 'Tous a Table Made in Normandie',
                    url: SITE_URL,
                },
            },
            {
                '@type': 'BreadcrumbList',
                '@id': `${SITE_URL}${seoUrl}#breadcrumb`,
                itemListElement: [
                    {
                        '@type': 'ListItem',
                        position: 1,
                        name: 'Accueil',
                        item: `${SITE_URL}/`,
                    },
                    {
                        '@type': 'ListItem',
                        position: 2,
                        name: activeCollection === 'cutting_boards' ? 'Planches' : 'Meubles anciens',
                        item: activeCollection === 'cutting_boards' ? `${SITE_URL}/planches-a-decouper-anciennes` : `${SITE_URL}/meubles-anciens`,
                    },
                    ...(activeCollection === 'furniture' && activeCategory !== 'all' ? [{
                        '@type': 'ListItem',
                        position: 3,
                        name: breadcrumbName,
                        item: `${SITE_URL}${seoUrl}`,
                    }] : []),
                ],
            },
        ];

        if (seoListItems.length > 0) {
            graph.push({
                '@type': 'ItemList',
                '@id': `${SITE_URL}${seoUrl}#items`,
                name: seoCopy.title,
                numberOfItems: seoListItems.length,
                itemListElement: seoListItems,
            });
        }

        return {
            '@context': 'https://schema.org',
            '@graph': graph,
        };
    }, [activeCollection, activeCategory, breadcrumbName, seoCopy.description, seoCopy.title, seoListItems, seoUrl]);

    return (
        <div className="min-h-screen">
            <SEO
                title={seoCopy.title}
                description={seoCopy.description}
                url={seoUrl}
                schema={gallerySchema}
            />

            <LayoutComponent
                items={filteredItems}
                palette={palette}
                viewMode={viewMode}
                onSelectItem={handleSelectItem}
                onShowLogin={onShowLogin}
                darkMode={darkMode}
                user={user}
                onOpenMenu={onOpenMenu}
                onOpenCart={onOpenCart}
                toggleTheme={toggleTheme}
                setHeaderProps={setHeaderProps}
                onProductIntent={handleProductIntent}
                headerProps={useMemo(() => ({
                    activeCollection,
                    setActiveCollection: (val) => {
                        setActiveCollection(val);
                        const nextCategory = val === 'furniture' ? activeCategory : 'all';
                        setActiveCategory(nextCategory);
                        if (saveGalleryState) saveGalleryState({ activeCollection: val, activeCategory: nextCategory });
                        pushUrl(val === 'cutting_boards' ? '/planches-a-decouper-anciennes' : getFurnitureCategoryPath(nextCategory));
                    },
                    filter,
                    setFilter: (val) => {
                        setFilter(val);
                        if (saveGalleryState) saveGalleryState({ filter: val });
                    },
                    onOpenShop,
                    onCollectionIntent: handleCollectionIntent,
                    onShopIntent: handleShopIntent,
                    setViewMode,
                    viewMode
                }), [activeCollection, activeCategory, filter, viewMode, saveGalleryState, onOpenShop, handleCollectionIntent, handleShopIntent])}
                initialCategory={activeCategory}
                seoUrl={seoUrl}
                onCategoryChange={(category) => {
                    setActiveCategory(category);
                    if (saveGalleryState) saveGalleryState({ activeCollection: 'furniture', activeCategory: category });
                    pushUrl(getFurnitureCategoryPath(category));
                }}
            />
        </div>
    );
};

export default GalleryView;
