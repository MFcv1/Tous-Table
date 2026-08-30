const admin = require('../functions/node_modules/firebase-admin');

const PROJECT_ID = 'sandboxtat';
const testEmail = String(process.env.SANDBOX_TEST_EMAIL || '').trim().toLowerCase();

if (!testEmail) {
    throw new Error('SANDBOX_TEST_EMAIL est requis.');
}

admin.initializeApp({
    projectId: PROJECT_ID,
    storageBucket: 'sandboxtat.firebasestorage.app',
});

const db = admin.firestore();
const { ensureInvoicePdf } = require('../functions/src/commerce/invoiceStorage');

async function main() {
    const snapshot = await db.collection('orders')
        .where('userEmail', '==', testEmail)
        .limit(20)
        .get();
    const candidate = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .find((order) => !String(order.status || '').includes('cancel'));

    if (!candidate) {
        throw new Error('Aucune commande de test active trouvée dans la sandbox.');
    }

    const first = await ensureInvoicePdf(candidate.id, candidate);
    const second = await ensureInvoicePdf(candidate.id, candidate);
    if (first.sha256 !== second.sha256 || !first.buffer.equals(second.buffer)) {
        throw new Error('Le second téléchargement ne correspond pas au PDF immuable initial.');
    }

    const [metadata] = await admin.storage().bucket().file(first.storagePath).getMetadata();
    if (metadata.contentType !== 'application/pdf') {
        throw new Error(`Content-Type inattendu : ${metadata.contentType || 'absent'}`);
    }
    if (!String(metadata.cacheControl || '').includes('private')) {
        throw new Error(`Cache-Control inattendu : ${metadata.cacheControl || 'absent'}`);
    }

    const refreshed = await db.collection('orders').doc(candidate.id).get();
    const invoice = refreshed.data()?.invoice;
    if (!invoice?.storagePath || invoice.sha256 !== first.sha256) {
        throw new Error('Le snapshot de facture n’est pas rattaché à la commande.');
    }

    console.log(JSON.stringify({
        projectId: PROJECT_ID,
        orderId: candidate.id,
        reference: invoice.reference,
        bytes: first.buffer.length,
        immutableReplay: true,
        contentType: metadata.contentType,
        cacheControl: metadata.cacheControl,
    }, null, 2));
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
