export const getOrderReference = (orderId) => {
    const value = String(orderId || '').trim();
    if (!value) return 'N-A';
    if (value.startsWith('checkout_')) {
        return `C-${value.slice('checkout_'.length, 'checkout_'.length + 10).toUpperCase()}`;
    }
    return value.slice(0, 8).toUpperCase();
};
