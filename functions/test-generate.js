const { generateInvoiceBuffer } = require('./src/utils/generateInvoicePDF');

const mockOrder = {
    id: 'testorder123',
    total: 10,
    createdAt: { _seconds: Date.now() / 1000 },
    shipping: {
        fullName: 'Matthis F',
        email: 'matthis.fradin1234@gmail.com',
        address: '16 Rue François Mitterrand',
        city: 'Fleury-sur-Orne',
        zip: '14123',
        phone: '0782013155'
    },
    items: [
        { name: 'planche', quantity: 1, price: 10 }
    ],
    userEmail: 'matthis.fradin1234@gmail.com',
    paymentMethod: 'deferred',
    status: 'pending_payment'
};

try {
    const buf = generateInvoiceBuffer(mockOrder);
    console.log("PDF généré avec succès, taille:", buf.length, "bytes");
} catch (e) {
    console.error("Erreur:", e);
}
