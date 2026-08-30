const admin = require('../functions/node_modules/firebase-admin');

const SOURCE_PROJECT_ID = 'sandboxtat';
const TARGET_PROJECT_ID = 'tousatable-client';
const BATCH_ID = 'approved-orders-2026-08-30';
const APPLY = process.argv.includes('--apply');
const CONFIRMED = process.argv.includes('--confirm-prod-write');

const APPROVED_ORDERS = [
    ['R5ORbbgghj9YQO1XASNd', 1490, 'completed'],
    ['NphlrxKCND0fqKSP9SV6', 1200, 'completed'],
    ['4E2c9HxdEgJBUOFBJcwx', 75, 'completed'],
    ['GB6ihH5O75F01CM1lBCL', 650, 'completed'],
    ['Xa2WpVQW2O48ASHbGNhy', 490, 'completed'],
    ['GQyM78qVvvddoZlxXT5Q', 310, 'shipped'],
    ['CkReUSFK6gza1YU04ag1', 30, 'shipped'],
    ['aP6l6aqP9AEO7yETI75e', 400, 'shipped'],
    ['n5B7VPS4LIiSiDSdydEp', 585, 'shipped'],
    ['YbnUL1vMTL4qqne9eqX5', 81, 'shipped'],
    ['AZuUzkkblJbmsitCFwKj', 1540, 'shipped'],
    ['Sp5MBI7uR5DAsy6Nn0tR', 450, 'shipped'],
    ['AXpmVNooMkIw1eeR4VQh', 210, 'shipped'],
    ['r0E51tWqtOC4BxSAIsE4', 2790, 'pending_payment'],
    ['90KD5sK2ViRxxrjwUrMD', 460, 'pending_payment'],
    ['r2XoDEJw4zi0OxIXfNlK', 990, 'pending_payment'],
    ['sLEIsFVgFmBJwDkObLK1', 2195, 'pending_payment'],
    ['5vT6JTTXyZyzPjLxl00x', 1890, 'pending_payment'],
].map(([id, total, status]) => ({ id, total, status }));

const getEmail = (order) => String(
    order.userEmail || order.shipping?.email || order.customerInfo?.email || ''
).trim().toLowerCase();

const isCancelled = (order) => ['cancelled', 'cancelled_by_client'].includes(order.status);

async function getActiveAggregate(db) {
    const snapshot = await db.collection('orders').get();
    const active = snapshot.docs.map((doc) => doc.data()).filter((order) => !isCancelled(order));
    return {
        totalDocuments: snapshot.size,
        activeOrders: active.length,
        activeRevenue: active.reduce((sum, order) => sum + Number(order.total || 0), 0),
    };
}

async function main() {
    if (SOURCE_PROJECT_ID === TARGET_PROJECT_ID) throw new Error('Source and target projects must differ.');
    if (APPLY && !CONFIRMED) {
        throw new Error('Production write refused: add --confirm-prod-write after explicit approval.');
    }

    const sourceApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: SOURCE_PROJECT_ID,
    }, `historical-source-${Date.now()}`);
    const targetApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: TARGET_PROJECT_ID,
    }, `historical-target-${Date.now()}`);
    const sourceDb = admin.firestore(sourceApp);
    const targetDb = admin.firestore(targetApp);
    const before = await getActiveAggregate(targetDb);
    const prepared = [];

    for (const expected of APPROVED_ORDERS) {
        const [sourceSnap, targetSnap] = await Promise.all([
            sourceDb.collection('orders').doc(expected.id).get(),
            targetDb.collection('orders').doc(expected.id).get(),
        ]);
        if (!sourceSnap.exists) throw new Error(`Approved source order missing: ${expected.id}`);
        if (targetSnap.exists) throw new Error(`Target order already exists; refusing overwrite: ${expected.id}`);

        const order = sourceSnap.data();
        const actual = {
            email: getEmail(order),
            total: Number(order.total || 0),
            status: order.status,
        };
        if (!actual.email || actual.total !== expected.total || actual.status !== expected.status) {
            throw new Error(`Source order no longer matches approval: ${expected.id}`);
        }
        if (!order.userId || !order.shipping || !Array.isArray(order.items) || order.items.length === 0) {
            throw new Error(`Source order is incomplete: ${expected.id}`);
        }

        const prodUser = await admin.auth(targetApp).getUserByEmail(actual.email);
        if (prodUser.uid !== order.userId) {
            throw new Error(`Production UID mismatch for approved order: ${expected.id}`);
        }

        prepared.push({ expected, order });
    }

    const approvedRevenue = prepared.reduce((sum, row) => sum + row.expected.total, 0);
    const report = {
        mode: APPLY ? 'apply' : 'dry-run',
        sourceProject: SOURCE_PROJECT_ID,
        targetProject: TARGET_PROJECT_ID,
        approvedOrders: prepared.length,
        approvedRevenue,
        before,
        expectedAfter: {
            totalDocuments: before.totalDocuments + prepared.length,
            activeOrders: before.activeOrders + prepared.length,
            activeRevenue: before.activeRevenue + approvedRevenue,
        },
    };

    console.log(JSON.stringify(report, null, 2));
    if (!APPLY) {
        console.log('Dry-run only. No Firestore document was written.');
        return;
    }

    const batch = targetDb.batch();
    for (const { expected, order } of prepared) {
        batch.create(targetDb.collection('orders').doc(expected.id), {
            ...order,
            systemImport: {
                type: 'historical-order-recovery',
                batchId: BATCH_ID,
                sourceProject: SOURCE_PROJECT_ID,
                restoredAt: admin.firestore.FieldValue.serverTimestamp(),
            },
        });
    }
    await batch.commit();

    const after = await getActiveAggregate(targetDb);
    if (
        after.totalDocuments !== report.expectedAfter.totalDocuments
        || after.activeOrders !== report.expectedAfter.activeOrders
        || after.activeRevenue !== report.expectedAfter.activeRevenue
    ) {
        throw new Error(`Post-import aggregate mismatch: ${JSON.stringify(after)}`);
    }
    console.log(JSON.stringify({ success: true, imported: prepared.length, after }, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(`Historical order restore failed: ${error.message}`);
        process.exit(1);
    });
