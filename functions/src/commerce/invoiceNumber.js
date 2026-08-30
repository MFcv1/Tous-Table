const INVOICE_COUNTER_COLLECTION = 'sys_invoice_counters';

const getInvoiceSeries = (date = new Date()) => new Intl.DateTimeFormat('en', {
    year: 'numeric',
    timeZone: 'Europe/Paris',
}).format(date);

const formatInvoiceNumber = (series, sequence) => (
    `F-${series}-${String(sequence).padStart(5, '0')}`
);

const getInvoiceCounterRef = (db, date = new Date()) => {
    const series = getInvoiceSeries(date);
    return {
        series,
        ref: db.collection(INVOICE_COUNTER_COLLECTION).doc(series),
    };
};

const getNextInvoiceIdentity = (counterSnapshot, series) => {
    const current = Number(counterSnapshot.exists ? counterSnapshot.data()?.lastSequence : 0);
    const sequence = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
    return {
        invoiceNumber: formatInvoiceNumber(series, sequence),
        invoiceSeries: series,
        invoiceSequence: sequence,
    };
};

const writeInvoiceCounter = (transaction, counterRef, invoiceIdentity, admin) => {
    transaction.set(counterRef, {
        lastSequence: invoiceIdentity.invoiceSequence,
        lastInvoiceNumber: invoiceIdentity.invoiceNumber,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
};

module.exports = {
    INVOICE_COUNTER_COLLECTION,
    formatInvoiceNumber,
    getInvoiceSeries,
    getInvoiceCounterRef,
    getNextInvoiceIdentity,
    writeInvoiceCounter,
};
