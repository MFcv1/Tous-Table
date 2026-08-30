const fs = require('fs');
const path = require('path');
const { generateInvoiceBuffer } = require('./src/utils/generateInvoicePDF');

const outputPath = path.resolve(__dirname, '..', 'output', 'pdf', 'facture-entreprise-sandbox.pdf');
const mockOrder = {
    id: 'checkout_facture_sandbox',
    invoiceNumber: 'F-2026-00001',
    total: 1880,
    createdAt: { _seconds: Date.UTC(2026, 7, 30, 12, 30) / 1000 },
    invoiceIssuedAt: { _seconds: Date.UTC(2026, 7, 30, 12, 30) / 1000 },
    shipping: {
        clientType: 'entreprise',
        companyName: 'Atelier Exemple SARL',
        fullName: 'Camille Martin',
        email: 'camille@example.fr',
        phone: '02 31 00 00 00',
        siret: '12345678901234',
        tva: 'FR12123456789',
        address: '12 rue de la Livraison',
        city: 'Caen',
        zip: '14000',
        country: 'France',
        billing: {
            name: 'Atelier Exemple SARL',
            address: '4 avenue de la Comptabilite',
            addressComplement: 'Service facturation',
            city: 'Rouen',
            zip: '76000',
            country: 'France',
        },
    },
    items: [
        { name: 'Enfilade ancienne en chene massif restauree', quantity: 1, price: 1490 },
        { name: 'Planche a decouper ancienne', quantity: 2, price: 195 },
    ],
    userEmail: 'camille@example.fr',
    paymentMethod: 'deferred',
    status: 'pending_payment',
};

const buffer = generateInvoiceBuffer(mockOrder);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, buffer);
console.log(`PDF genere : ${outputPath} (${buffer.length} octets)`);
