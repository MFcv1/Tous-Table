const admin = require('../functions/node_modules/firebase-admin');

const projectId = 'tousatable-client';
const app = admin.initializeApp(
    { credential: admin.credential.applicationDefault(), projectId },
    `debug-users-${Date.now()}`
);

async function main() {
    // Look up the admin user by email  
    const email = 'matthis.fradin2@gmail.com';
    
    try {
        // Get all users with this email
        const userRecord = await admin.auth(app).getUserByEmail(email);
        console.log(`\n=== USER RECORD FOR ${email} ===`);
        console.log(`  uid:           ${userRecord.uid}`);
        console.log(`  email:         ${userRecord.email}`);
        console.log(`  emailVerified: ${userRecord.emailVerified}`);
        console.log(`  displayName:   ${userRecord.displayName}`);
        console.log(`  providerData:  ${JSON.stringify(userRecord.providerData.map(p => ({ providerId: p.providerId, uid: p.uid, email: p.email })))}`);
        console.log(`  customClaims:  ${JSON.stringify(userRecord.customClaims)}`);
        console.log(`  disabled:      ${userRecord.disabled}`);
        console.log(`  metadata:      created=${userRecord.metadata.creationTime}, lastSignIn=${userRecord.metadata.lastSignInTime}`);
    } catch (e) {
        console.error(`User not found: ${e.message}`);
    }

    // Now check: is there possibly another user with same email but different provider?
    console.log(`\n=== LISTING ALL USERS (checking for duplicate emails) ===`);
    
    // List first 100 users and check for email patterns
    const listResult = await admin.auth(app).listUsers(1000);
    
    // Group by email
    const byEmail = {};
    listResult.users.forEach(u => {
        const e = u.email || 'NO_EMAIL';
        if (!byEmail[e]) byEmail[e] = [];
        byEmail[e].push(u);
    });

    // Show emails with multiple UIDs (potential duplicate accounts)
    console.log(`\nTotal users: ${listResult.users.length}`);
    const duplicates = Object.entries(byEmail).filter(([, users]) => users.length > 1);
    if (duplicates.length > 0) {
        console.log(`\n⚠️ DUPLICATE EMAIL ACCOUNTS FOUND:`);
        duplicates.forEach(([email, users]) => {
            console.log(`  ${email}:`);
            users.forEach(u => {
                console.log(`    - uid: ${u.uid}, providers: ${u.providerData.map(p => p.providerId).join(', ')}, emailVerified: ${u.emailVerified}`);
            });
        });
    } else {
        console.log(`\nNo duplicate email accounts found.`);
    }

    // Check the specific order user
    console.log(`\n=== ORDER vDURtkGoPOcGPJFnVO1A userId: p4h6PlpWX2OIZTtiRjZmaUzcTCz2 ===`);
    try {
        const orderUser = await admin.auth(app).getUser('p4h6PlpWX2OIZTtiRjZmaUzcTCz2');
        console.log(`  email:         ${orderUser.email}`);
        console.log(`  providers:     ${orderUser.providerData.map(p => p.providerId).join(', ')}`);
        console.log(`  emailVerified: ${orderUser.emailVerified}`);
    } catch (e) {
        console.error(`  User not found: ${e.message}`);
    }

    // Check ALL users who have signed in via Google AND email/password
    console.log(`\n=== USERS WITH MULTIPLE PROVIDERS ===`);
    listResult.users.forEach(u => {
        if (u.providerData.length > 1) {
            console.log(`  ${u.email} (uid: ${u.uid}): ${u.providerData.map(p => p.providerId).join(', ')}`);
        }
    });

    // Now specifically check: are there users with google.com provider whose
    // orders query by userEmail would NOT match?
    console.log(`\n=== GOOGLE USERS - Check email matching for orders ===`);
    const googleUsers = listResult.users.filter(u => 
        u.providerData.some(p => p.providerId === 'google.com')
    );
    console.log(`Google users: ${googleUsers.length}`);
    googleUsers.slice(0, 10).forEach(u => {
        const googleProvider = u.providerData.find(p => p.providerId === 'google.com');
        console.log(`  uid: ${u.uid}, auth.email: ${u.email}, google.email: ${googleProvider?.email}, emailVerified: ${u.emailVerified}`);
    });

    process.exit(0);
}

main().catch(console.error);
