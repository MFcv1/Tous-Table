const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable');

function getOrderReference(orderId) {
    const value = String(orderId || '').trim();
    if (!value) return 'N-A';
    if (value.startsWith('checkout_')) {
        return `C-${value.slice('checkout_'.length, 'checkout_'.length + 10).toUpperCase()}`;
    }
    return value.slice(0, 8).toUpperCase();
}

function getInvoiceReference(order = {}) {
    return String(order.invoiceNumber || '').trim() || getOrderReference(order.id);
}

function toDate(value, fallback = new Date()) {
    if (!value) return fallback;
    if (typeof value.toDate === 'function') return value.toDate();
    const seconds = value._seconds ?? value.seconds;
    if (Number.isFinite(Number(seconds))) return new Date(Number(seconds) * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function formatDate(value, fallback) {
    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Paris',
    }).format(toDate(value, fallback));
}

function formatMoney(value) {
    return `${Number(value || 0).toFixed(2).replace('.', ',')} EUR`;
}

function compactAddress(address = {}) {
    return [
        address.address,
        address.addressComplement,
        [address.zip || address.postalCode, address.city].filter(Boolean).join(' '),
        address.country && address.country !== 'France' ? address.country : null,
    ].filter(Boolean);
}

function addressesDiffer(first = {}, second = {}) {
    const normalize = (value) => String(value || '').trim().toLocaleLowerCase('fr-FR');
    return ['address', 'addressComplement', 'zip', 'city', 'country']
        .some((key) => normalize(first[key]) !== normalize(second[key]));
}

function generateInvoiceBuffer(order) {
    const doc = new jsPDF();
    const shipping = order.shipping || {};
    const billing = shipping.billing || shipping;
    const isCompany = shipping.clientType === 'entreprise';
    const invoiceReference = getInvoiceReference(order);
    const issueDate = formatDate(order.invoiceIssuedAt || order.createdAt, new Date());
    const saleDate = formatDate(order.createdAt, new Date());
    const total = Number(order.total || 0);
    const contactName = shipping.fullName || [shipping.firstName, shipping.lastName].filter(Boolean).join(' ');
    const billingName = isCompany
        ? (shipping.companyName || billing.name || contactName || order.userEmail || 'Client')
        : (billing.name || contactName || order.userEmail || 'Client');

    doc.setFont('helvetica');
    doc.setTextColor(28, 25, 23);

    doc.setFontSize(17);
    doc.setFont('helvetica', 'bold');
    doc.text('TOUS A TABLE', 15, 19);
    doc.setFontSize(10);
    doc.setTextColor(120, 90, 48);
    doc.text('Made in Normandie', 15, 25);
    doc.setTextColor(68, 64, 60);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    [
        'Olivier Pegoix - Entrepreneur individuel',
        '346 chemin de Fleury',
        '14123 IFS - France',
        'Tel. 07 77 32 41 78',
        'SIREN 803 328 756',
    ].forEach((line, index) => doc.text(line, 15, 36 + (index * 5)));

    doc.setTextColor(28, 25, 23);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(21);
    doc.text('FACTURE', 195, 20, { align: 'right' });
    doc.setFontSize(9);
    doc.text(`N° ${invoiceReference}`, 195, 29, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Date d'emission : ${issueDate}`, 195, 36, { align: 'right' });
    doc.text(`Date de la vente : ${saleDate}`, 195, 42, { align: 'right' });
    doc.setDrawColor(216, 207, 194);
    doc.line(15, 69, 195, 69);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('FACTURE A', 15, 81);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    let billingY = 89;
    doc.text(billingName, 15, billingY);
    billingY += 5;
    if (isCompany && contactName) {
        doc.text(`A l'attention de ${contactName}`, 15, billingY);
        billingY += 5;
    }
    compactAddress(billing).forEach((line) => {
        doc.text(String(line), 15, billingY);
        billingY += 5;
    });
    if (isCompany && shipping.siret) {
        doc.text(`SIRET : ${shipping.siret}`, 15, billingY);
        billingY += 5;
    }
    if (isCompany && shipping.tva) {
        doc.text(`TVA intracommunautaire : ${shipping.tva}`, 15, billingY);
        billingY += 5;
    }

    if (addressesDiffer(shipping, billing)) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('LIVRAISON A', 112, 81);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        let deliveryY = 89;
        if (contactName) {
            doc.text(contactName, 112, deliveryY);
            deliveryY += 5;
        }
        compactAddress(shipping).forEach((line) => {
            doc.text(String(line), 112, deliveryY);
            deliveryY += 5;
        });
    }

    const itemRows = (order.items || []).map((item) => {
        const quantity = Number(item.quantity || 1);
        const unitPrice = Number(item.price || 0);
        return [String(quantity), item.name || 'Article', formatMoney(unitPrice), formatMoney(unitPrice * quantity)];
    });

    const autoTableFunc = typeof autoTable === 'function' ? autoTable : autoTable.default;
    const tableStartY = Math.max(132, billingY + 7);
    if (autoTableFunc) {
        autoTableFunc(doc, {
            startY: tableStartY,
            head: [['QTE', 'DESIGNATION', 'PRIX UNIT. HT', 'MONTANT HT']],
            body: itemRows,
            theme: 'grid',
            headStyles: {
                fontStyle: 'bold',
                fillColor: [28, 25, 23],
                textColor: [255, 250, 242],
                halign: 'center',
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 18 },
                1: { halign: 'left' },
                2: { halign: 'right', cellWidth: 38 },
                3: { halign: 'right', cellWidth: 38 },
            },
            styles: {
                font: 'helvetica',
                fontSize: 9,
                cellPadding: 4,
                lineColor: [225, 218, 208],
                lineWidth: 0.1,
            },
        });
    }

    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : tableStartY + 25;
    const pageHeight = doc.internal.pageSize.getHeight();
    let totalsY = finalY + 8;
    const financialBlockBottom = totalsY + (isCompany ? 94 : 89);
    if (financialBlockBottom > pageHeight - 25) {
        doc.addPage();
        totalsY = 20;
    }
    doc.setFillColor(247, 244, 239);
    doc.roundedRect(116, totalsY, 79, 35, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('TOTAL HT', 122, totalsY + 9);
    doc.text(formatMoney(total), 190, totalsY + 9, { align: 'right' });
    doc.text('TVA non applicable (0 %)', 122, totalsY + 18);
    doc.text(formatMoney(0), 190, totalsY + 18, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('NET A PAYER', 122, totalsY + 29);
    doc.text(formatMoney(total), 190, totalsY + 29, { align: 'right' });

    const paymentY = totalsY + 47;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('REGLEMENT', 15, paymentY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    const paymentLines = [
        'Paiement par virement exigible a reception de la facture, avant expedition.',
        'La commande est preparee et expediee apres reception du reglement.',
    ];
    paymentLines.forEach((line, index) => doc.text(line, 15, paymentY + 6 + (index * 5)));

    const bankY = paymentY + 6 + (paymentLines.length * 5) + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('COORDONNEES BANCAIRES', 15, bankY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.text('Titulaire : M O. PEGOIX OU MME E. PEGOIX', 15, bankY + 6);
    doc.text('IBAN : FR76 3002 7160 8000 0506 2940 303', 15, bankY + 11);
    doc.text('BIC : CMCIFRPP', 15, bankY + 16);

    if (isCompany) {
        doc.setFontSize(7.2);
        doc.setTextColor(87, 83, 78);
        doc.text(
            'Mentions professionnelles : aucun escompte. En cas de retard, penalites au taux BCE + 10 points et indemnite forfaitaire de recouvrement de 40 EUR.',
            15,
            bankY + 24,
        );
        doc.setTextColor(28, 25, 23);
    }

    const pageCount = doc.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        doc.setPage(pageNumber);
        doc.setDrawColor(216, 207, 194);
        doc.line(15, pageHeight - 23, 195, pageHeight - 23);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(87, 83, 78);
        doc.text('TVA non applicable, art. 293 B du CGI.', 15, pageHeight - 16);
        doc.text(`Page ${pageNumber}/${pageCount}`, 105, pageHeight - 16, { align: 'center' });
        doc.text('Merci pour votre confiance.', 195, pageHeight - 16, { align: 'right' });
    }

    return Buffer.from(doc.output('arraybuffer'));
}

module.exports = { generateInvoiceBuffer, getInvoiceReference, getOrderReference };
