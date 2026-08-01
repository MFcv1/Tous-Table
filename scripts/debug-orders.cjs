const admin = require('../functions/node_modules/firebase-admin');

const projectId = 'tousatable-client';
const app = admin.initializeApp(
    { credential: admin.credential.applicationDefault(), projectId },
    `debug-orders-${Date.now()}`
);
const db = admin.firestore(app);

async function main() {
    // Fetch all recent orders
    const snap = await db.collection('orders')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

    console.log(`\n=== LAST 10 ORDERS ===\n`);
    snap.forEach(doc => {
        const d = doc.data();
        console.log(`--- Order: ${doc.id} ---`);
        console.log(`  userId:    ${d.userId || 'MISSING'}`);
        console.log(`  userEmail: ${d.userEmail || 'MISSING'}`);
        console.log(`  fullName:  ${d.shipping?.fullName || 'N/A'}`);
        console.log(`  status:    ${d.status}`);
        console.log(`  total:     ${d.total} €`);
        console.log(`  method:    ${d.paymentMethod}`);
        console.log(`  createdAt: ${d.createdAt ? new Date(d.createdAt._seconds * 1000).toISOString() : 'N/A'}`);
        console.log(`  items:     ${(d.items || []).map(i => i.name).join(', ')}`);
        console.log('');
    });

    // Now check cart subcollections for users who have recent orders
    const userIds = new Set();
    snap.forEach(doc => {
        const d = doc.data();
        if (d.userId) userIds.add(d.userId);
    });

    console.log(`\n=== CHECKING CARTS FOR ${userIds.size} USERS ===\n`);
    for (const uid of userIds) {
        const cartSnap = await db.collection('users').doc(uid).collection('cart').get();
        console.log(`User ${uid}: ${cartSnap.size} item(s) in cart`);
        cartSnap.forEach(cd => {
            const c = cd.data();
            console.log(`  - ${c.name} (originalId: ${c.originalId}, price: ${c.price})`);
        });
    }

    process.exit(0);
}

main().catch(console.error);
