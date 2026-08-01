const admin = require('../functions/node_modules/firebase-admin');

const projectId = 'tousatable-client';
const app = admin.initializeApp(
    { credential: admin.credential.applicationDefault(), projectId },
    `debug-specific-${Date.now()}`
);
const db = admin.firestore(app);

async function main() {
    const targetEmail = 'matthis.fradin1234@gmail.com';

    // 1. Find all orders for this email
    console.log(`\n=== ORDERS FOR ${targetEmail} ===\n`);
    const ordersSnap = await db.collection('orders')
        .where('userEmail', '==', targetEmail)
        .get();

    if (ordersSnap.empty) {
        console.log('No orders found with userEmail filter. Trying full scan...');
        const allOrders = await db.collection('orders').get();
        allOrders.forEach(doc => {
            const d = doc.data();
            if ((d.userEmail || '').toLowerCase().includes('fradin1234') ||
                (d.shipping?.email || '').toLowerCase().includes('fradin1234')) {
                console.log(`  FOUND via scan: ${doc.id}`);
                printOrder(doc.id, d);
            }
        });
    } else {
        ordersSnap.forEach(doc => {
            printOrder(doc.id, doc.data());
        });
    }

    // 2. Find the Firebase Auth user for this email
    console.log(`\n=== AUTH USER FOR ${targetEmail} ===\n`);
    try {
        const userRecord = await admin.auth(app).getUserByEmail(targetEmail);
        console.log(`  uid:            ${userRecord.uid}`);
        console.log(`  email:          ${userRecord.email}`);
        console.log(`  emailVerified:  ${userRecord.emailVerified}`);
        console.log(`  displayName:    ${userRecord.displayName}`);
        console.log(`  providers:      ${userRecord.providerData.map(p => `${p.providerId}(uid=${p.uid})`).join(', ') || 'NONE'}`);
        console.log(`  created:        ${userRecord.metadata.creationTime}`);
        console.log(`  lastSignIn:     ${userRecord.metadata.lastSignInTime}`);

        // 3. Check this user's cart
        console.log(`\n=== CART FOR uid=${userRecord.uid} ===\n`);
        const cartSnap = await db.collection('users').doc(userRecord.uid).collection('cart').get();
        if (cartSnap.empty) {
            console.log('  Cart is EMPTY');
        } else {
            console.log(`  ${cartSnap.size} item(s):`);
            cartSnap.forEach(cd => {
                const c = cd.data();
                console.log(`    - docId: ${cd.id}`);
                console.log(`      name: ${c.name}`);
                console.log(`      originalId: ${c.originalId}`);
                console.log(`      price: ${c.price}`);
                console.log(`      collectionName: ${c.collectionName}`);
                console.log(`      addedAt: ${c.addedAt ? new Date(c.addedAt._seconds * 1000).toISOString() : 'N/A'}`);
            });
        }

        // 4. Check if order userId matches this user's uid
        console.log(`\n=== CROSS-CHECK: Order userId vs Auth uid ===\n`);
        ordersSnap.forEach(doc => {
            const d = doc.data();
            const match = d.userId === userRecord.uid;
            console.log(`  Order ${doc.id}:`);
            console.log(`    order.userId:  ${d.userId}`);
            console.log(`    auth.uid:      ${userRecord.uid}`);
            console.log(`    MATCH:         ${match ? '✅ YES' : '❌ NO — THIS IS THE BUG'}`);
        });

    } catch (e) {
        console.error(`  User not found by email: ${e.message}`);
        
        // Try to find user by looking at order userId
        console.log('\n  Trying to find user via order userId...');
        if (!ordersSnap.empty) {
            const firstOrder = ordersSnap.docs[0].data();
            if (firstOrder.userId) {
                try {
                    const orderUser = await admin.auth(app).getUser(firstOrder.userId);
                    console.log(`  Order was created by uid: ${firstOrder.userId}`);
                    console.log(`    email:          ${orderUser.email}`);
                    console.log(`    emailVerified:  ${orderUser.emailVerified}`);
                    console.log(`    providers:      ${orderUser.providerData.map(p => p.providerId).join(', ') || 'NONE'}`);
                    console.log(`    lastSignIn:     ${orderUser.metadata.lastSignInTime}`);
                    
                    if (orderUser.email !== targetEmail) {
                        console.log(`\n  ⚠️ EMAIL MISMATCH: Order userEmail is "${targetEmail}" but the uid belongs to "${orderUser.email}"`);
                    }
                } catch (e2) {
                    console.error(`  User ${firstOrder.userId} not found: ${e2.message}`);
                    console.log(`  ⚠️ The userId in the order points to a DELETED or NON-EXISTENT user!`);
                }

                // Check cart for this userId
                console.log(`\n=== CART FOR order userId=${firstOrder.userId} ===`);
                const cartSnap = await db.collection('users').doc(firstOrder.userId).collection('cart').get();
                if (cartSnap.empty) {
                    console.log('  Cart is EMPTY');
                } else {
                    console.log(`  ${cartSnap.size} item(s):`);
                    cartSnap.forEach(cd => {
                        const c = cd.data();
                        console.log(`    - ${c.name} (originalId: ${c.originalId}, price: ${c.price})`);
                    });
                }
            }
        }
    }

    process.exit(0);
}

function printOrder(id, d) {
    console.log(`--- Order: ${id} ---`);
    console.log(`  userId:       ${d.userId || 'MISSING'}`);
    console.log(`  userEmail:    ${d.userEmail || 'MISSING'}`);
    console.log(`  fullName:     ${d.shipping?.fullName || 'N/A'}`);
    console.log(`  ship.email:   ${d.shipping?.email || 'N/A'}`);
    console.log(`  status:       ${d.status}`);
    console.log(`  total:        ${d.total} €`);
    console.log(`  method:       ${d.paymentMethod}`);
    console.log(`  createdAt:    ${d.createdAt ? new Date(d.createdAt._seconds * 1000).toISOString() : 'N/A'}`);
    console.log(`  items:        ${(d.items || []).map(i => `${i.name} (${i.price}€)`).join(', ')}`);
    console.log('');
}

main().catch(console.error);
