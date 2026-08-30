export const GUEST_CART_STORAGE_KEY = 'tat_local_cart';
export const GUEST_CART_STORAGE_VERSION = 3;
export const MAX_CART_QUANTITY = 100;
const GUEST_CART_LOCK_NAME = 'tat_guest_cart_mutation';

export const normalizeCartQuantity = (value) => {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_CART_QUANTITY, Math.max(1, Math.floor(quantity)));
};

export const getCartProductKey = (item, fallback = '') => {
  const collectionName = item?.collectionName || 'furniture';
  const productId = item?.originalId || item?.id || fallback;
  return `${collectionName}:${productId}`;
};

export const getCartDocumentId = (item) => {
  const encodedKey = new TextEncoder().encode(getCartProductKey(item));
  const hexKey = [...encodedKey].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `product_${hexKey}`;
};

export const getCartLineTotal = (item) => {
  const price = Number(item?.price) || 0;
  return price * normalizeCartQuantity(item?.quantity);
};

export const getCartTotal = (items = []) => (
  items.reduce((sum, item) => sum + getCartLineTotal(item), 0)
);

export const getCartItemCount = (items = []) => (
  items.reduce((sum, item) => sum + normalizeCartQuantity(item?.quantity), 0)
);

export const addCartQuantities = (accountQuantity, guestQuantity) => (
  normalizeCartQuantity(
    normalizeCartQuantity(accountQuantity) + normalizeCartQuantity(guestQuantity),
  )
);

export const mergeCartLinesByProduct = (items = []) => {
  const merged = new Map();

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const productKey = getCartProductKey(item, `line-${index}`);
    const existing = merged.get(productKey);
    if (existing) {
      existing.quantity = normalizeCartQuantity(
        existing.quantity + normalizeCartQuantity(item.quantity),
      );
      return;
    }

    merged.set(productKey, {
      ...item,
      quantity: normalizeCartQuantity(item.quantity),
    });
  });

  return [...merged.values()];
};

const createGuestTransferId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const loadGuestCartState = (storage = globalThis.localStorage) => {
  const emptyState = {
    items: [],
    pendingTransfers: [],
    claimedBy: null,
    transferId: null,
  };
  if (!storage) return emptyState;
  try {
    const parsed = JSON.parse(storage.getItem(GUEST_CART_STORAGE_KEY) || 'null');
    if (
      parsed?.version === 2
      && parsed?.scope === 'guest'
      && Array.isArray(parsed.items)
    ) {
      const claimedBy = typeof parsed.claimedBy === 'string' ? parsed.claimedBy : null;
      const transferId = typeof parsed.transferId === 'string' ? parsed.transferId : null;
      const legacyItems = mergeCartLinesByProduct(parsed.items);
      const pendingTransfers = claimedBy && legacyItems.length > 0
        ? [{ claimedBy, transferId: transferId || createGuestTransferId(), items: legacyItems }]
        : [];
      return {
        items: claimedBy ? [] : legacyItems,
        pendingTransfers,
        claimedBy: pendingTransfers[0]?.claimedBy || null,
        transferId: pendingTransfers[0]?.transferId || transferId,
      };
    }
    if (
      parsed?.version !== GUEST_CART_STORAGE_VERSION
      || parsed?.scope !== 'guest'
      || !Array.isArray(parsed.items)
    ) {
      // Legacy arrays may contain a mirrored authenticated cart. Their owner is
      // unknowable, so importing them into another UID would break isolation.
      return emptyState;
    }
    const pendingTransfers = Array.isArray(parsed.pendingTransfers)
      ? parsed.pendingTransfers
        .filter(transfer => (
          typeof transfer?.claimedBy === 'string'
          && typeof transfer?.transferId === 'string'
          && Array.isArray(transfer?.items)
        ))
        .map(transfer => ({
          claimedBy: transfer.claimedBy,
          transferId: transfer.transferId,
          items: mergeCartLinesByProduct(transfer.items),
        }))
        .filter(transfer => transfer.items.length > 0)
      : [];
    return {
      items: mergeCartLinesByProduct(parsed.items),
      pendingTransfers,
      // Compatibility fields for diagnostics and older callers.
      claimedBy: pendingTransfers[0]?.claimedBy || null,
      transferId: pendingTransfers[0]?.transferId || null,
    };
  } catch {
    return emptyState;
  }
};

const writeGuestCartState = (state, storage) => {
  const pendingTransfers = Array.isArray(state.pendingTransfers)
    ? state.pendingTransfers
    : [];
  storage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify({
    version: GUEST_CART_STORAGE_VERSION,
    scope: 'guest',
    items: mergeCartLinesByProduct(state.items),
    pendingTransfers: pendingTransfers.map(transfer => ({
      claimedBy: transfer.claimedBy,
      transferId: transfer.transferId,
      items: mergeCartLinesByProduct(transfer.items),
    })),
  }));
};

export const loadGuestCart = (storage = globalThis.localStorage) => {
  return loadGuestCartState(storage).items;
};

const withGuestCartLock = async (lockManager, mutation, fallbackValue) => {
  // Without a cross-tab lock, mutating the shared guest source could transfer
  // the same cart to two different UIDs. Fail closed instead of leaking it.
  if (!lockManager?.request) return fallbackValue;
  return lockManager.request(GUEST_CART_LOCK_NAME, { mode: 'exclusive' }, mutation);
};

export const saveGuestCart = async (
  items,
  storage = globalThis.localStorage,
  lockManager = globalThis.navigator?.locks,
) => {
  if (!storage) return false;
  return withGuestCartLock(lockManager, async () => {
    try {
      const currentState = loadGuestCartState(storage);
      writeGuestCartState({
        items,
        pendingTransfers: currentState.pendingTransfers,
      }, storage);
      return true;
    } catch {
      // Private browsing or a full storage quota must not break the cart UI.
      return false;
    }
  }, false);
};

export const claimGuestCartsForUser = async (
  userUid,
  storage = globalThis.localStorage,
  lockManager = globalThis.navigator?.locks,
) => {
  if (!userUid || !storage) return [];
  return withGuestCartLock(lockManager, async () => {
    const state = loadGuestCartState(storage);
    const existingTransfers = state.pendingTransfers.filter(transfer => transfer.claimedBy === userUid);
    if (state.items.length === 0) return existingTransfers;

    const newTransfer = {
      claimedBy: userUid,
      transferId: createGuestTransferId(),
      items: state.items,
    };
    try {
      writeGuestCartState({
        items: [],
        pendingTransfers: [...state.pendingTransfers, newTransfer],
      }, storage);
      return [...existingTransfers, newTransfer];
    } catch {
      // Never migrate a cart if its target UID could not be persisted first.
      return existingTransfers;
    }
  }, []);
};

export const claimGuestCartForUser = async (...args) => (
  (await claimGuestCartsForUser(...args))[0]
  || { items: [], claimedBy: null, transferId: null }
);

export const clearGuestCart = async (
  storage = globalThis.localStorage,
  expectedClaimUid = null,
  expectedTransferId = null,
  lockManager = globalThis.navigator?.locks,
) => {
  if (!storage) return false;
  return withGuestCartLock(lockManager, async () => {
    const currentState = loadGuestCartState(storage);
    try {
      if (expectedClaimUid) {
        const pendingTransfers = currentState.pendingTransfers.filter(transfer => !(
          transfer.claimedBy === expectedClaimUid
          && (!expectedTransferId || transfer.transferId === expectedTransferId)
        ));
        if (currentState.items.length > 0 || pendingTransfers.length > 0) {
          writeGuestCartState({ items: currentState.items, pendingTransfers }, storage);
        } else {
          storage.removeItem(GUEST_CART_STORAGE_KEY);
        }
      } else {
        storage.removeItem(GUEST_CART_STORAGE_KEY);
      }
      return true;
    } catch (removeError) {
      try {
        storage.setItem(GUEST_CART_STORAGE_KEY, '[]');
        return true;
      } catch {
        throw removeError;
      }
    }
  }, false);
};

export const finalizeGuestCartMigration = async ({
  hasWrites,
  hasGuestItems,
  commit,
  clear,
}) => {
  if (hasWrites) await commit();
  if (hasGuestItems) await clear();
};
