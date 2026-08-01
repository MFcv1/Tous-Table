const admin = require('../functions/node_modules/firebase-admin');

const projectId = 'tousatable-client';
const app = admin.initializeApp(
    { credential: admin.credential.applicationDefault(), projectId },
    `debug-timeline-${Date.now()}`
);
const db = admin.firestore(app);

async function main() {
    const email1 = 'matthis.fradin2@gmail.com';
    const email2 = 'matthis.fradin1234@gmail.com';

    // 1. Get both user records
    console.log('=== TIMELINE INVESTIGATION ===\n');

    let user1, user2;
    try {
        user1 = await admin.auth(app).getUserByEmail(email1);
        console.log(`[ACCOUNT 1] ${email1}`);
        console.log(`  uid:        ${user1.uid}`);
        console.log(`  providers:  ${user1.providerData.map(p => p.providerId).join(', ')}`);
        console.log(`  lastSignIn: ${user1.metadata.lastSignInTime}`);
    } catch (e) {
        console.log(`[ACCOUNT 1] ${email1} — NOT FOUND: ${e.code}`);
    }

    try {
        user2 = await admin.auth(app).getUserByEmail(email2);
        console.log(`\n[ACCOUNT 2] ${email2}`);
        console.log(`  uid:        ${user2.uid}`);
        console.log(`  providers:  ${user2.providerData.map(p => p.providerId).join(', ')}`);
        console.log(`  lastSignIn: ${user2.metadata.lastSignInTime}`);
    } catch (e) {
        console.log(`[ACCOUNT 2] ${email2} — NOT FOUND: ${e.code}`);
    }

    // 2. Check the test order
    console.log('\n=== THE ORDER (vDURtkGoPOcGPJFnVO1A) ===\n');
    const orderSnap = await db.collection('orders').doc('vDURtkGoPOcGPJFnVO1A').get();
    const order = orderSnap.data();
    console.log(`  userId:       ${order.userId}`);
    console.log(`  userEmail:    ${order.userEmail}`);
    console.log(`  shipping.email: ${order.shipping?.email || 'N/A'}`);
    console.log(`  total:        ${order.total} €`);
    console.log(`  createdAt:    ${new Date(order.createdAt._seconds * 1000).toISOString()}`);
    console.log(`  items:        ${(order.items || []).map(i => i.name).join(', ')}`);
    
    // 3. Identify which account placed the order
    console.log('\n=== WHO PLACED THE ORDER? ===\n');
    if (user1 && order.userId === user1.uid) {
        console.log(`  ✅ Order was placed by ACCOUNT 1 (${email1})`);
        console.log(`     The Cloud Function context.auth.uid was: ${user1.uid}`);
        console.log(`     The Cloud Function context.auth.token.email was: ${order.userEmail}`);
    }
    if (user2 && order.userId === user2.uid) {
        console.log(`  ✅ Order was placed by ACCOUNT 2 (${email2})`);
    }
    if (order.userId !== user1?.uid && order.userId !== user2?.uid) {
        console.log(`  ⚠️ Order userId ${order.userId} matches NEITHER account!`);
    }

    // 4. Check BOTH carts
    console.log('\n=== CART STATUS ===\n');
    if (user1) {
        const cart1 = await db.collection('users').doc(user1.uid).collection('cart').get();
        console.log(`[${email1}] cart: ${cart1.size} item(s)`);
        cart1.forEach(d => {
            const c = d.data();
            console.log(`    - ${c.name} | price: ${c.price}€ | originalId: ${c.originalId} | added: ${c.addedAt ? new Date(c.addedAt._seconds * 1000).toISOString() : 'N/A'}`);
        });
    }
    if (user2) {
        const cart2 = await db.collection('users').doc(user2.uid).collection('cart').get();
        console.log(`[${email2}] cart: ${cart2.size} item(s)`);
        cart2.forEach(d => {
            const c = d.data();
            console.log(`    - ${c.name} | price: ${c.price}€ | originalId: ${c.originalId} | added: ${c.addedAt ? new Date(c.addedAt._seconds * 1000).toISOString() : 'N/A'}`);
        });
    }

    // 5. Check the shipping form email — was it fradin1234?
    console.log('\n=== SHIPPING FORM DATA ===\n');
    console.log(`  fullName:  ${order.shipping?.fullName}`);
    console.log(`  email:     ${order.shipping?.email}`);
    console.log(`  phone:     ${order.shipping?.phone}`);
    console.log(`  address:   ${order.shipping?.address}`);
    console.log(`  city:      ${order.shipping?.city}`);
    console.log(`  zip:       ${order.shipping?.zip}`);

    // 6. Timeline reconstruction  
    console.log('\n=== RECONSTRUCTED TIMELINE ===\n');
    const events = [];
    
    if (user2) {
        const cart2 = await db.collection('users').doc(user2.uid).collection('cart').get();
        cart2.forEach(d => {
            const c = d.data();
            if (c.addedAt) {
                events.push({
                    time: new Date(c.addedAt._seconds * 1000),
                    event: `[${email2}] Added "${c.name}" to cart`
                });
            }
        });
    }
    
    if (user1) {
        const cart1 = await db.collection('users').doc(user1.uid).collection('cart').get();
        cart1.forEach(d => {
            const c = d.data();
            if (c.addedAt) {
                events.push({
                    time: new Date(c.addedAt._seconds * 1000),
                    event: `[${email1}] Added "${c.name}" to cart`
                });
            }
        });
    }

    events.push({
        time: new Date(order.createdAt._seconds * 1000),
        event: `[ORDER CREATED] by uid=${order.userId} (email=${order.userEmail}) — ${order.items.map(i=>i.name).join(', ')} — ${order.total}€`
    });

    if (user1) events.push({ time: new Date(user1.metadata.lastSignInTime), event: `[${email1}] Last sign-in` });
    if (user2) events.push({ time: new Date(user2.metadata.lastSignInTime), event: `[${email2}] Last sign-in` });

    events.sort((a, b) => a.time - b.time);
    events.forEach(e => {
        console.log(`  ${e.time.toISOString()}  ${e.event}`);
    });

    // 7. KEY QUESTION: Were there TWO sessions (PC + Mobile) with different accounts?
    console.log('\n=== CONCLUSION ===\n');
    console.log('The screenshots show:');
    console.log('  - Screenshot 1 (PC): Order visible, user is logged in');
    console.log('  - Screenshot 2 (Mobile): "Mes Commandes" is EMPTY, cart has 1 item');
    console.log('  - Screenshot 3 (PC after re-login): "Mes Commandes" is EMPTY, shows ADMIN badge');
    console.log('');
    console.log('This suggests the user had:');
    console.log('  - PC browser logged in as fradin2 (admin/Google)');
    console.log('  - Mobile logged in as fradin1234 (Google)');
    console.log('  - The order was placed from PC (fradin2), NOT from mobile (fradin1234)');
    console.log('  - Mobile cart was NEVER cleared because fradin1234 never completed checkout');

    process.exit(0);
}

main().catch(console.error);
