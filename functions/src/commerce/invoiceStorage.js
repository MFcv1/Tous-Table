const crypto = require('crypto');
const admin = require('firebase-admin');
const { generateInvoiceBuffer, getInvoiceReference } = require('../utils/generateInvoicePDF');

const db = admin.firestore();

function sanitizeFilePart(value) {
    return String(value || 'facture')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
}

function getInvoiceStoragePath(orderId) {
    return `invoices/${sanitizeFilePart(orderId)}/facture.pdf`;
}

function getInvoiceFilename(order = {}) {
    return `Facture_${sanitizeFilePart(getInvoiceReference(order))}.pdf`;
}

async function ensureInvoicePdf(orderId, sourceOrder) {
    const order = { ...sourceOrder, id: sourceOrder?.id || orderId };
    const storagePath = sourceOrder?.invoice?.storagePath || getInvoiceStoragePath(orderId);
    const file = admin.storage().bucket().file(storagePath);
    const [exists] = await file.exists();

    if (exists) {
        const [buffer] = await file.download();
        return {
            buffer,
            filename: sourceOrder?.invoice?.filename || getInvoiceFilename(order),
            storagePath,
            sha256: sourceOrder?.invoice?.sha256 || crypto.createHash('sha256').update(buffer).digest('hex'),
            created: false,
        };
    }

    const buffer = generateInvoiceBuffer(order);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const filename = getInvoiceFilename(order);

    try {
        await file.save(buffer, {
            resumable: false,
            validation: 'md5',
            contentType: 'application/pdf',
            metadata: {
                cacheControl: 'private, no-store, max-age=0',
                contentDisposition: `attachment; filename="${filename}"`,
                metadata: {
                    invoiceReference: getInvoiceReference(order),
                    sha256,
                },
            },
            preconditionOpts: { ifGenerationMatch: 0 },
        });
    } catch (error) {
        if (![409, 412].includes(Number(error?.code))) throw error;
        const [existingBuffer] = await file.download();
        return {
            buffer: existingBuffer,
            filename,
            storagePath,
            sha256: crypto.createHash('sha256').update(existingBuffer).digest('hex'),
            created: false,
        };
    }

    await db.collection('orders').doc(orderId).set({
        invoice: {
            storagePath,
            filename,
            reference: getInvoiceReference(order),
            sha256,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
    }, { merge: true });

    return { buffer, filename, storagePath, sha256, created: true };
}

module.exports = {
    ensureInvoicePdf,
    getInvoiceFilename,
    getInvoiceStoragePath,
};
