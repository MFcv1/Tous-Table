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
      'artifacts',
      'newsletter_subscribers',
      'orders',
      'sys_metadata',
      'users'
    ];

    async function copyCollection(srcRef, destRef) {
        // listDocuments() returns all documents, even those that don't exist but have subcollections
        const docRefs = await srcRef.listDocuments();
        if (docRefs.length === 0) return;
        
        console.log(`Copying collection: ${srcRef.path} (${docRefs.length} documents/placeholders)`);
        
        const batchArray = [];
        let batch = sandboxDb.batch();
        let operationCounter = 0;
        
        for (const docRef of docRefs) {
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                batch.set(destRef.doc(docRef.id), docSnap.data());
                operationCounter++;
                
                if (operationCounter === 490) {
                    batchArray.push(batch);
                    batch = sandboxDb.batch();
                    operationCounter = 0;
                }
            }
            
            // Recursively copy subcollections
            const subCollections = await docRef.listCollections();
            for (const subCol of subCollections) {
                await copyCollection(subCol, destRef.doc(docRef.id).collection(subCol.id));
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
            if (col === 'artifacts') {
                console.log("Renaming artifacts/tat-made-in-normandie -> artifacts/sandboxtat...");
                await copyCollection(
                    prodDb.collection('artifacts').doc('tat-made-in-normandie').collection('public'),
                    sandboxDb.collection('artifacts').doc('sandboxtat').collection('public')
                );
            } else {
                await copyCollection(prodDb.collection(col), sandboxDb.collection(col));
            }
        }
        console.log("🎉 MIGRATION TERMINÉE AVEC SUCCÈS !");
        process.exit(0);
    } catch (e) {
        console.error("❌ Erreur :", e);
        process.exit(1);
    }
}

migrate();
