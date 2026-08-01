const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

async function migrate() {
    console.log("🚀 Démarrage de la migration de Prod vers Sandbox...");
    
    const prodApp = admin.initializeApp({ projectId: 'tousatable-client' }, 'prod');
    const sandboxApp = admin.initializeApp({ projectId: 'sandboxtat' }, 'sandbox');
    const prodDb = getFirestore(prodApp);
    const sandboxDb = getFirestore(sandboxApp);

    // List of known top-level collections
    const collections = [
      'affiliate_clicks',
      'analytics_sessions',
      'artifacts',
      'client_errors',
      'newsletter_subscribers',
      'orders',
      'sys_metadata',
      'sys_ratelimit',
      'users'
    ];

    async function copyCollection(srcRef, destRef) {
        const snapshot = await srcRef.get();
        if (snapshot.empty) return;
        
        console.log(`Copying collection: ${srcRef.path} (${snapshot.size} documents)`);
        
        const batchArray = [];
        let batch = sandboxDb.batch();
        let operationCounter = 0;
        
        for (const doc of snapshot.docs) {
            batch.set(destRef.doc(doc.id), doc.data());
            operationCounter++;
            
            if (operationCounter === 490) {
                batchArray.push(batch);
                batch = sandboxDb.batch();
                operationCounter = 0;
            }
            
            // Recursively copy subcollections
            const subCollections = await doc.ref.listCollections();
            for (const subCol of subCollections) {
                await copyCollection(subCol, destRef.doc(doc.id).collection(subCol.id));
            }
        }
        
        if (operationCounter > 0) {
            batchArray.push(batch);
        }
        
        // Commit batches
        for (const b of batchArray) {
            await b.commit();
        }
    }

    try {
        for (const col of collections) {
            await copyCollection(prodDb.collection(col), sandboxDb.collection(col));
        }
        console.log("🎉 MIGRATION TERMINÉE AVEC SUCCÈS !");
        process.exit(0);
    } catch (e) {
        console.error("❌ Erreur :", e);
        process.exit(1);
    }
}

migrate();
