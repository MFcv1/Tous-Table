const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

async function migrateArtifacts() {
    console.log("🚀 Démarrage de la migration du catalogue...");
    
    const prodApp = admin.initializeApp({ projectId: 'tousatable-client' }, 'prod');
    const sandboxApp = admin.initializeApp({ projectId: 'sandboxtat' }, 'sandbox');
    const prodDb = getFirestore(prodApp);
    const sandboxDb = getFirestore(sandboxApp);

    async function copyCollection(srcRef, destRef) {
        const snapshot = await srcRef.get();
        if (!snapshot.empty) {
            console.log(`Copying collection: ${srcRef.path} (${snapshot.size} documents)`);
            let batch = sandboxDb.batch();
            let count = 0;
            const batchArray = [];
            for (const doc of snapshot.docs) {
                batch.set(destRef.doc(doc.id), doc.data());
                count++;
                if (count === 490) { batchArray.push(batch); batch = sandboxDb.batch(); count = 0; }
                const subCols = await doc.ref.listCollections();
                for (const subCol of subCols) {
                    await copyCollection(subCol, destRef.doc(doc.id).collection(subCol.id));
                }
            }
            if (count > 0) batchArray.push(batch);
            for (const b of batchArray) await b.commit();
        } else {
            // Document might be empty but has subcollections, or just empty collection.
            // listCollections() doesn't work on collection reference, only document reference.
        }
    }

    // Since 'artifacts' collection only contains document 'tousatable-client'
    const srcDoc = prodDb.doc('artifacts/tousatable-client');
    const destDoc = sandboxDb.doc('artifacts/sandboxtat');
    
    // Copy the document itself if it has data
    const docSnap = await srcDoc.get();
    if (docSnap.exists) {
        await destDoc.set(docSnap.data());
    } else {
        await destDoc.set({}); // Create empty document to anchor subcollections
    }

    // Now list all subcollections of srcDoc and copy them
    const subCols = await srcDoc.listCollections();
    for (const subCol of subCols) {
         await copyCollection(subCol, destDoc.collection(subCol.id));
    }
    
    console.log("🎉 Migration du catalogue terminée !");
    process.exit(0);
}

migrateArtifacts().catch(console.error);
