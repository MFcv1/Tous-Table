import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const { formatInvoiceNumber, getInvoiceSeries, getNextInvoiceIdentity } = require('../functions/src/commerce/invoiceNumber.js');

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const checks = [];
const expect = (condition, message) => {
    checks.push({ condition: Boolean(condition), message });
};

const createOrder = read('functions/src/commerce/createOrder.js');
const invoiceStorage = read('functions/src/commerce/invoiceStorage.js');
const getInvoice = read('functions/src/commerce/getInvoice.js');
const invoicePdf = read('functions/src/utils/generateInvoicePDF.js');
const checkoutDetails = read('src/utils/checkoutCustomerDetails.js');
const myOrders = read('src/pages/MyOrdersView.jsx');
const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');

expect(formatInvoiceNumber('2026', 1) === 'F-2026-00001', 'la première facture respecte le format annuel séquentiel');
expect(formatInvoiceNumber('2026', 42) === 'F-2026-00042', 'la séquence est complétée sur cinq chiffres');
expect(getInvoiceSeries(new Date('2026-12-31T23:30:00.000Z')) === '2027', 'la série annuelle suit le fuseau Europe/Paris');
expect(
    getNextInvoiceIdentity({ exists: true, data: () => ({ lastSequence: 41 }) }, '2026').invoiceNumber === 'F-2026-00042',
    'le compteur reprend la dernière séquence enregistrée',
);
expect(createOrder.includes('transaction.get(invoiceCounter.ref)'), 'le compteur est lu dans la transaction de création');
expect(createOrder.includes('writeInvoiceCounter(transaction'), 'le compteur est écrit dans la transaction de création');
expect(createOrder.includes('billing_company_mismatch'), 'le serveur refuse une autre identité juridique avec le même SIRET');
expect(firestoreRules.includes('match /sys_invoice_counters/{seriesId}') && firestoreRules.includes('allow read, write: if false'), 'le compteur est inaccessible au client');
expect(invoiceStorage.includes('ifGenerationMatch: 0'), 'le fichier facture ne peut pas écraser un PDF existant');
expect(invoiceStorage.includes("cacheControl: 'private, no-store, max-age=0'"), 'le PDF stocké est privé et non mis en cache publiquement');
expect(getInvoice.includes('enforceAppCheck: true'), 'le téléchargement impose App Check');
expect(getInvoice.includes('canReadOrderInvoice(order, context.auth)'), 'le téléchargement contrôle la propriété de la commande');
expect(!getInvoice.includes('getSignedUrl'), 'aucun lien Storage permanent ou signé n’est exposé au navigateur');
expect(storageRules.includes('match /invoices/{allPaths=**}') && storageRules.includes('allow read, write: if false'), 'Storage bloque tout accès client aux factures');
expect(checkoutDetails.includes('name: isCompany ? companyName : formData.billingName'), 'une entreprise conserve la même identité sur l’adresse de facturation différente');
expect(myOrders.includes("httpsCallable(functions, 'getInvoicePdf')"), 'Mes commandes télécharge la copie serveur immuable');
expect(!myOrders.includes('generateInvoice('), 'le navigateur ne régénère plus lui-même la facture');
expect(invoicePdf.includes("Date d'emission"), 'la facture affiche sa date d’émission');
expect(invoicePdf.includes('Date de la vente'), 'la facture affiche la date de vente');
expect(invoicePdf.includes('TOTAL HT') && invoicePdf.includes('NET A PAYER'), 'la facture distingue HT, TVA et net à payer');
expect(invoicePdf.includes('avant expedition') && invoicePdf.includes('expediee apres reception du reglement'), 'la facture explique simplement le paiement avant expédition');
expect(invoicePdf.includes('if (isCompany)') && invoicePdf.includes('indemnite forfaitaire de recouvrement de 40 EUR.'), 'les mentions de retard restent limitées aux factures professionnelles');

const failures = checks.filter((check) => !check.condition);
checks.forEach((check) => console.log(`${check.condition ? 'OK' : 'FAIL'} - ${check.message}`));

if (failures.length > 0) {
    process.exitCode = 1;
} else {
    console.log(`\nInvoice boundary OK (${checks.length} checks).`);
}
