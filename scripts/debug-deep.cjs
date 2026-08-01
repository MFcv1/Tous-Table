const admin = require('../functions/node_modules/firebase-admin');

const projectId = 'tousatable-client';
const app = admin.initializeApp(
    { credential: admin.credential.applicationDefault(), projectId },
    `debug-deep-${Date.now()}`
);
const db = admin.firestore(app);

async function main() {
    // 1. Check how many users have email matthis.fradin2@gmail.com
    console.log('=== LOOKING UP ALL USERS WITH matthis.fradin2@gmail.com ===');
    const listResult = await admin.auth(app).listUsers(1000);
    const matchingUsers = listResult.users.filter(u => 
        u.email === 'matthis.fradin2@gmail.com'
    );
    console.log(`Found ${matchingUsers.length} user(s) with this email:`);
    matchingUsers.forEach(u => {
        console.log(`  uid: ${u.uid}`);
        console.log(`  providers: ${u.providerData.map(p => `${p.providerId}(${p.uid})`).join(', ')}`);
        console.log(`  emailVerified: ${u.emailVerified}`);
        console.log(`  created: ${u.metadata.creationTime}`);
        console.log(`  lastSignIn: ${u.metadata.lastSignInTime}`);
        console.log('');
    });

    // 2. Check MANUSAN's account
    console.log('=== LOOKING UP MANUSAN (mcdo.manusan@gmail.com) ===');
    const manusanUsers = listResult.users.filter(u => 
        u.email === 'mcdo.manusan@gmail.com'
    );
    console.log(`Found ${manusanUsers.length} user(s):`);
    manusanUsers.forEach(u => {
        console.log(`  uid: ${u.uid}`);
        console.log(`  providers: ${u.providerData.map(p => `${p.providerId}(${p.uid})`).join(', ')}`);
        console.log(`  emailVerified: ${u.emailVerified}`);
        console.log(`  lastSignIn: ${u.metadata.lastSignInTime}`);
    });

    // 3. Check if MANUSAN has cart items still  
    console.log('\n=== MANUSAN CART CHECK ===');
    const manusanUid = 'tNYuXT8J1fUI5uqZpe47FAd2zTI2';
    const cartSnap = await db.collection('users').doc(manusanUid).collection('cart').get();
    console.log(`Cart items: ${cartSnap.size}`);
    cartSnap.forEach(d => {
        const c = d.data();
        console.log(`  - ${c.name} (price: ${c.price}, originalId: ${c.originalId})`);
    });

    // 4. Check the Firestore rules issue: the query uses where('userEmail', '==', user.email)
    // Let's verify what happens if someone logs in with a DIFFERENT provider
    // but same email
    console.log('\n=== KEY FINDING ===');
    console.log('The MyOrdersView queries: where("userEmail", "==", user.email)');
    console.log('The createOrder stores: userEmail = context.auth.token.email');
    console.log('');
    console.log('The Firestore rules for orders allow read if:');
    console.log('  request.auth.uid == resource.data.userId');
    console.log('  OR request.auth.token.email == resource.data.userEmail');
    console.log('');
    console.log('The query WHERE clause filters by userEmail, which should match.');
    console.log('But Firestore SECURITY RULES also need to be satisfied for WHERE queries!');
    console.log('');
    console.log('CRITICAL BUG: Firestore evaluates security rules based on the INDEX,');
    console.log('not per-document. For a where() query, Firestore needs to know ALL');
    console.log('results will pass the rules. The rule uses resource.data.userId OR');
    console.log('resource.data.userEmail, but Firestore cannot guarantee this at the');
    console.log('index level unless there is a SINGLE rule path that matches.');
    console.log('');
    console.log('If user logs in with different UID (new session/device), the userId check FAILS.');
    console.log('The userEmail check should pass, but Firestore may not evaluate OR conditions');
    console.log('correctly for list/query operations because it needs to ensure ALL results match.');

    // 5. Let's check: does the order for matthis.fradin2 have the SAME userId as current login?
    console.log('\n=== CHECKING YOUR TEST ORDER ===');
    const orderSnap = await db.collection('orders').doc('vDURtkGoPOcGPJFnVO1A').get();
    const order = orderSnap.data();
    console.log(`Order userId:    ${order.userId}`);
    console.log(`Order userEmail: ${order.userEmail}`);
    
    // Your current user
    const currentUser = await admin.auth(app).getUser('p4h6PlpWX2OIZTtiRjZmaUzcTCz2');
    console.log(`\nCurrent user uid:   ${currentUser.uid}`);
    console.log(`Current user email: ${currentUser.email}`);
    console.log(`UIDs match: ${order.userId === currentUser.uid}`);
    console.log(`Emails match: ${order.userEmail === currentUser.email}`);

    process.exit(0);
}

main().catch(console.error);
