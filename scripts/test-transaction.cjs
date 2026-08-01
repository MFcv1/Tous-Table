const admin = require('../functions/node_modules/firebase-admin');

const projectId = 'tousatable-client';
const app = admin.initializeApp(
    { credential: admin.credential.applicationDefault(), projectId },
    `debug-transaction-${Date.now()}`
);
const db = admin.firestore(app);

async function main() {
    const testDoc = db.collection('sys_metadata').doc('test_transaction');
    await testDoc.set({ stock: 5 });

    console.log('Testing multiple updates to the same document in a transaction...');
    try {
        await db.runTransaction(async (t) => {
            const snap = await t.get(testDoc);
            console.log('Initial stock:', snap.data().stock);
            
            // First update
            t.update(testDoc, { stock: 4 });
            console.log('Queued first update');
            
            // Second update to the same document!
            t.update(testDoc, { stock: 3 });
            console.log('Queued second update');
        });
        console.log('SUCCESS! Firebase allows multiple updates to the same doc in Node.js?');
    } catch (e) {
        console.error('ERROR:', e.message);
    }
    
    process.exit(0);
}

main().catch(console.error);
