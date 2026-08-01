const admin = require('../functions/node_modules/firebase-admin');

const projectId = 'tousatable-client';
const app = admin.initializeApp(
    { credential: admin.credential.applicationDefault(), projectId },
    `debug-retest-${Date.now()}`
);
const db = admin.firestore(app);

async function main() {
    // Check recent orders
    console.log('=== LATEST ORDERS ===\n');
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(5).get();
    snap.forEach(doc => {
        const d = doc.data();
        console.log(`Order: ${doc.id}`);
        console.log(`  userId:    ${d.userId}`);
        console.log(`  userEmail: ${d.userEmail}`);
        console.log(`  fullName:  ${d.shipping?.fullName}`);
        console.log(`  total:     ${d.total} €`);
        console.log(`  created:   ${d.createdAt ? new Date(d.createdAt._seconds * 1000).toISOString() : 'N/A'}`);
        console.log('');
    });

    // Check both test accounts
    for (const email of ['matthis.fradin1234@gmail.com', 'lkpfra301@gmail.com']) {
        console.log(`=== ${email} ===`);
        try {
            const u = await admin.auth(app).getUserByEmail(email);
            console.log(`  uid: ${u.uid} | providers: ${u.providerData.map(p => p.providerId).join(', ')}`);
            
            // Cart
            const cart = await db.collection('users').doc(u.uid).collection('cart').get();
            console.log(`  cart: ${cart.size} item(s) ${cart.size === 0 ? '✅' : '⚠️'}`);
            cart.forEach(cd => {
                const c = cd.data();
                console.log(`    - ${c.name} (${c.price}€)`);
            });

            // Orders
            const orders = await db.collection('orders').where('userEmail', '==', email).get();
            console.log(`  orders: ${orders.size}`);
            orders.forEach(od => {
                const o = od.data();
                const uidMatch = o.userId === u.uid;
                console.log(`    - ${od.id} | ${o.total}€ | userId match: ${uidMatch ? '✅' : '❌'}`);
            });
        } catch (e) {
            console.log(`  NOT FOUND: ${e.code}`);
        }
        console.log('');
    }

    process.exit(0);
}

main().catch(console.error);
