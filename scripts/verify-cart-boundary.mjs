import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addCartQuantities,
  claimGuestCartForUser,
  claimGuestCartsForUser,
  clearGuestCart,
  finalizeGuestCartMigration,
  getCartItemCount,
  getCartDocumentId,
  getCartLineTotal,
  getCartProductKey,
  getCartTotal,
  loadGuestCart,
  loadGuestCartState,
  mergeCartLinesByProduct,
  saveGuestCart,
} from '../src/utils/cartState.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};
let lockTail = Promise.resolve();
const lockManager = {
  request: (_name, _options, mutation) => {
    const result = lockTail.then(mutation);
    lockTail = result.catch(() => undefined);
    return result;
  },
};

const furniture = { id: 'cart-furniture', originalId: 'shared-id', collectionName: 'furniture', price: '500', quantity: 1 };
const boards = { id: 'cart-boards', originalId: 'shared-id', collectionName: 'cutting_boards', price: 10, quantity: 3 };

assert.equal(getCartLineTotal(boards), 30, 'line total must multiply unit price by quantity');
assert.equal(getCartTotal([furniture, boards]), 530, 'cart total must sum quantity-aware line totals');
assert.equal(getCartItemCount([furniture, boards]), 4, 'badge must count units, not Firestore documents');
assert.notEqual(getCartProductKey(furniture), getCartProductKey(boards), 'collection is part of product identity');
assert.notEqual(getCartDocumentId(furniture), getCartDocumentId(boards), 'Firestore cart IDs must be deterministic per collection and product');

const merged = mergeCartLinesByProduct([
  { ...boards, id: 'first-board', quantity: 2 },
  { ...boards, id: 'second-board', quantity: 3 },
  furniture,
]);
assert.equal(merged.length, 2, 'duplicates from the same collection must merge');
assert.equal(merged.find(item => item.collectionName === 'cutting_boards').quantity, 5, 'duplicate quantities must not be lost');
assert.equal(addCartQuantities(2, 3), 5, 'independent account and guest quantities must add up');

const ambiguousLegacyStorage = createStorage();
ambiguousLegacyStorage.setItem('tat_local_cart', JSON.stringify([furniture]));
assert.deepEqual(loadGuestCart(ambiguousLegacyStorage), [], 'ownerless legacy mirrors must never migrate into a UID');

const concurrentClaimStorage = createStorage();
await saveGuestCart([furniture], concurrentClaimStorage, lockManager);
const concurrentClaims = await Promise.all([
  claimGuestCartsForUser('uid-concurrent-a', concurrentClaimStorage, lockManager),
  claimGuestCartsForUser('uid-concurrent-b', concurrentClaimStorage, lockManager),
]);
assert.equal(
  concurrentClaims.reduce((sum, transfers) => sum + transfers.flatMap(transfer => transfer.items).length, 0),
  1,
  'the cross-tab lock must let only one UID claim the same guest cart',
);
assert.equal(
  loadGuestCartState(concurrentClaimStorage).pendingTransfers.length,
  1,
  'a concurrent claim must persist a single owner',
);

const successfulStorage = createStorage();
await saveGuestCart([boards], successfulStorage, lockManager);
const successfulClaim = await claimGuestCartForUser('uid-a', successfulStorage, lockManager);
assert.equal(successfulClaim.claimedBy, 'uid-a', 'guest transfer must be claimed before migration');
assert.ok(successfulClaim.transferId, 'claimed transfer must have a stable id');
assert.equal((await claimGuestCartForUser('uid-b', successfulStorage, lockManager)).items.length, 0, 'another UID must not read a claimed transfer');
const successfulEvents = [];
await finalizeGuestCartMigration({
  hasWrites: true,
  hasGuestItems: true,
  commit: async () => successfulEvents.push('commit'),
  clear: async () => {
    successfulEvents.push('clear');
    await clearGuestCart(successfulStorage, 'uid-a', null, lockManager);
  },
});
assert.deepEqual(successfulEvents, ['commit', 'clear'], 'guest cart must clear only after commit');
assert.deepEqual(loadGuestCart(successfulStorage), [], 'successful migration must clear guest source');

const failingStorage = createStorage();
await saveGuestCart([boards], failingStorage, lockManager);
const failingClaim = await claimGuestCartForUser('uid-a', failingStorage, lockManager);
const failingEvents = [];
await assert.rejects(
  finalizeGuestCartMigration({
    hasWrites: true,
    hasGuestItems: true,
    commit: async () => {
      failingEvents.push('commit');
      throw new Error('network unavailable');
    },
    clear: async () => {
      failingEvents.push('clear');
      await clearGuestCart(failingStorage, 'uid-a', null, lockManager);
    },
  }),
  /network unavailable/,
);
assert.deepEqual(failingEvents, ['commit'], 'failed commit must never clear guest source');
assert.equal(loadGuestCartState(failingStorage).pendingTransfers[0].items.length, 1, 'failed migration must remain retryable');
assert.equal((await claimGuestCartForUser('uid-a', failingStorage, lockManager)).transferId, failingClaim.transferId, 'retry must retain the same transfer id');
assert.equal((await claimGuestCartForUser('uid-b', failingStorage, lockManager)).items.length, 0, 'failed A transfer must never migrate into B');
await saveGuestCart([furniture], failingStorage, lockManager);
assert.equal(loadGuestCart(failingStorage).length, 1, 'a new anonymous cart must persist beside a failed claimed transfer');
const allATransfers = await claimGuestCartsForUser('uid-a', failingStorage, lockManager);
assert.equal(allATransfers.length, 2, 'login must migrate both the old retry and the newer anonymous cart');
assert.ok(allATransfers.some(transfer => transfer.transferId === failingClaim.transferId), 'new guest items must not replace the pending A transfer');
await clearGuestCart(failingStorage, 'uid-a', failingClaim.transferId, lockManager);
assert.equal(loadGuestCartState(failingStorage).pendingTransfers.length, 1, 'clearing A transfer must preserve the newer claimed transfer');

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(appSource, /localStorage\.(?:setItem|removeItem)\(['"]tat_local_cart['"]/, 'App must not bypass guest-cart boundary helpers');
assert.doesNotMatch(appSource, /CART PERSISTENCE \(Mirror to Local Storage\)/, 'authenticated carts must not be mirrored into guest storage');
assert.match(appSource, /getCartTotal\(cartItems\)/, 'App total must use the quantity-aware helper');
assert.match(appSource, /finalizeGuestCartMigration/, 'migration durability helper must remain wired');
assert.match(appSource, /cartOwnerKey === currentCartOwnerKey/, 'visible cart must be scoped to the current UID');
assert.match(appSource, /guestMigrationIds/, 'ambiguous commit retries must use a durable transfer marker');
assert.doesNotMatch(appSource, /guestMigrationIds: \[\.\.\.entry\.migrationIds\]\.slice/, 'migration markers must not be evicted while a transfer remains retryable');
assert.match(appSource, /runTransaction\(db/, 'cart migration must be transactionally safe across tabs');
assert.match(appSource, /getCartDocumentId\(item\)/, 'new cart lines must use deterministic product document IDs');
assert.match(appSource, /transaction\.get\(cartItemRef\)/, 'authenticated adds must increment the server quantity transactionally');
assert.doesNotMatch(appSource, /await setDoc\(cartItemRef/, 'authenticated adds must not overwrite migration markers with a blind set');
assert.doesNotMatch(appSource, /setCartItems\(\[\]\); \/\/ Clear UI cart immediately/, 'order completion must not hide a newer cross-tab cart');
assert.match(appSource, /scheduleMigrationRetry/, 'network failures must schedule an automatic retry');
assert.match(appSource, /addEventListener\('online'/, 'network recovery must trigger an immediate retry');

const sidebarSource = readFileSync(new URL('../src/components/cart/CartSidebar.jsx', import.meta.url), 'utf8');
const checkoutSource = readFileSync(new URL('../src/pages/CheckoutView.jsx', import.meta.url), 'utf8');
const productDetailSource = readFileSync(new URL('../src/designs/architectural/ArchitecturalProductDetail.jsx', import.meta.url), 'utf8');
const createOrderSource = readFileSync(new URL('../functions/src/commerce/createOrder.js', import.meta.url), 'utf8');
assert.match(sidebarSource, /getCartLineTotal\(item\)/, 'sidebar must show quantity-aware line totals');
assert.match(sidebarSource, /onUpdateQuantity/, 'sidebar must expose quantity controls');
assert.match(checkoutSource, /getCartLineTotal\(item\)/, 'checkout summary must show quantity-aware line totals');
assert.match(productDetailSource, /cartItem\.collectionName \|\| 'furniture'/, 'product detail membership must include collection identity');
assert.match(createOrderSource, /txTotal \+= realPrice \* qtyToReserve/, 'dormant Stripe branch must not undercount quantities if re-enabled');
assert.match(createOrderSource, /stockKey = `\$\{colName\}:\$\{realItemId\}`/, 'server stock aggregation must include collection identity');
assert.match(createOrderSource, /getIdempotentOrderId\(userId, attemptId\)/, 'order retries must target a deterministic server document');
assert.match(createOrderSource, /checkoutAttemptId: attemptId/, 'orders must persist their idempotency key');
assert.match(createOrderSource, /quantityToRemove -= removedQuantity/, 'order creation must remove only submitted cart quantities');
assert.match(createOrderSource, /transaction\.get\([\s\S]*collection\('cart'\)/, 'order creation must transactionally inspect canonical and legacy cart lines');
assert.doesNotMatch(createOrderSource, /const cartSnaps = await cartRef\.get\(\)/, 'an idempotent replay must never clear the whole current cart');
assert.match(createOrderSource, /restoreRequests\.map\(\(\{ itemRef \}\) => transaction\.get\(itemRef\)\)/, 'Stripe rollback must complete reads before writes');
assert.match(createOrderSource, /CARD_PAYMENTS_ENABLED = false/, 'server must keep card payments disabled with the frontend');
assert.match(createOrderSource, /reason: 'card_payments_disabled'/, 'direct calls must not bypass disabled card payments');

console.log('Cart boundary verification OK.');
