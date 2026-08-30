import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const checks = [];

const expect = (label, condition) => {
    checks.push({ label, condition: Boolean(condition) });
};

const maintenance = read('functions/src/maintenance/tools.js');
const analytics = read('functions/src/analytics/sessions.js');
const adminManagement = read('functions/src/auth/adminManagement.js');
const cancelOrder = read('functions/src/commerce/cancelOrder.js');
const adminOrders = read('src/features/admin/AdminOrders.jsx');
const adminShop = read('src/features/admin/AdminShop.jsx');
const orderEmails = read('functions/src/email/orderEmails.js');
const rules = read('firestore.rules');

expect('garbage collector réservé au super-admin', /runGarbageCollector[\s\S]*?checkIsSuperAdmin\(context\)/.test(maintenance));
expect('purges analytics réservées au super-admin', ['deleteSession', 'clearAllSessions', 'clearAllAffiliateClicks'].every(name => new RegExp(`exports\\.${name}[\\s\\S]*?checkIsSuperAdmin\\(context\\)`).test(analytics)));
expect('gestion des admins réservée au super-admin', ['addAdminUser', 'removeAdminUser'].every(name => new RegExp(`exports\\.${name}[\\s\\S]*?checkIsSuperAdmin\\(context\\)`).test(adminManagement)));
expect('annulation destructive commande réservée au super-admin', /cancelAndDeleteOrderAdmin[\s\S]*?checkIsSuperAdmin\(context\)/.test(cancelOrder));
expect('annulation client refuse un paiement Stripe déjà restauré', /\[['"]paid['"][\s\S]*?['"]payment_failed['"]/.test(cancelOrder));
expect('restauration stock idempotente selon stockReserved', /orderStillOwnsReservedStock[\s\S]*?stockReserved !== false/.test(cancelOrder) && (cancelOrder.match(/if \(orderStillOwnsReservedStock\(orderData\)\)/g) || []).length >= 2);
expect('aucune suppression directe de commande dans le navigateur', !/deleteDoc\s*\(\s*doc\(db,\s*['"]orders['"]/.test(adminOrders));
expect('purge clics boutique via callable protégée', /httpsCallable\(functions,\s*['"]clearAllAffiliateClicks['"]\)/.test(adminShop) && !/writeBatch\(db\)/.test(adminShop));
expect('suppression directe orders interdite par les règles', /match \/orders\/\{orderId\}[\s\S]*?allow delete: if false;/.test(rules));
expect('mise à jour orders limitée aux champs opérationnels', /changed\.hasOnly\(\[['"]status['"], ['"]shippingReminderSnoozes['"]\]\)/.test(rules));
expect('suppression directe affiliate_clicks interdite par les règles', /match \/affiliate_clicks\/\{clickId\}[\s\S]*?allow delete: if false;/.test(rules));
expect('whitelist admin modifiable uniquement par le développeur', /docId == ['"]admin_users['"] \? isDeveloperOwner\(\) : isArtisan\(\)/.test(rules));
expect('suppression des métadonnées réservée au développeur', /match \/sys_metadata\/\{docId\}[\s\S]*?allow delete: if isDeveloperOwner\(\);/.test(rules));
expect('import historique ne renvoie pas les anciens emails', /historical-order-recovery[\s\S]*?approved-orders-2026-08-30[\s\S]*?notification skipped/.test(orderEmails));

for (const check of checks) {
    console.log(`${check.condition ? 'PASS' : 'FAIL'} ${check.label}`);
}

if (checks.some(check => !check.condition)) process.exitCode = 1;
