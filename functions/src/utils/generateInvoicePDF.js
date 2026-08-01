const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable');

function generateInvoiceBuffer(order) {
    // jsPDF in Node.js env
    const doc = new jsPDF();

    // Set Font
    doc.setFont("helvetica");

    // --- HEADER ---
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Tous à table Made in", 15, 20);
    doc.text("Normandie", 15, 27);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Olivier Pegoix", 15, 40);
    doc.text("346 chemin de Fleury", 15, 45);
    doc.text("14123 IFS", 15, 50);
    doc.text("Tel : 07 77 32 41 78", 15, 55);
    doc.text("SIREN : 803 328 756", 15, 60);
    doc.text("Forme juridique : Entrepreneur individuel", 15, 65);

    // Right
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("FACTURE", 195, 20, { align: "right" });

    // --- CLIENT INFO ---
    const customerName = order.shipping?.fullName || order.userEmail || "Client";
    const customerAddress = order.shipping?.address || "";
    const customerCityZip = `${order.shipping?.zip || ""} ${order.shipping?.city || ""}`.trim();

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Facturé à", 15, 90);

    doc.setFont("helvetica", "normal");
    doc.text(customerName, 15, 96);
    if (customerAddress) doc.text(customerAddress, 15, 101);
    if (customerCityZip) doc.text(customerCityZip, 15, 106);

    // --- INVOICE INFO ---
    // Handle both _seconds (admin sdk) and seconds (client sdk) formatting just in case
    let dateStr = new Date().toLocaleDateString('fr-FR');
    if (order.createdAt?._seconds) {
        dateStr = new Date(order.createdAt._seconds * 1000).toLocaleDateString('fr-FR');
    } else if (order.createdAt?.seconds) {
        dateStr = new Date(order.createdAt.seconds * 1000).toLocaleDateString('fr-FR');
    } else if (order.createdAt && typeof order.createdAt.toDate === 'function') {
        dateStr = order.createdAt.toDate().toLocaleDateString('fr-FR');
    }

    const formatId = order.id ? order.id.slice(0, 8).toUpperCase() : 'N/A';

    doc.setFont("helvetica", "bold");
    doc.text("Facture n°", 150, 90);
    doc.text("Date", 150, 96);

    doc.setFont("helvetica", "normal");
    doc.text(formatId, 195, 90, { align: "right" });
    doc.text(dateStr, 195, 96, { align: "right" });

    // --- TABLE ---
    const tableData = (order.items || []).map(item => [
        item.quantity || 1,
        item.name || 'Article',
        `${(item.price || 0).toFixed(2).replace('.', ',')}`,
        `${((item.price || 0) * (item.quantity || 1)).toFixed(2).replace('.', ',')}`
    ]);

    // Initialize autoTable plugin
    const autoTableFunc = typeof autoTable === 'function' ? autoTable : autoTable.default;
    if (autoTableFunc) {
        autoTableFunc(doc, {
            startY: 120,
            head: [['QTÉ', 'DÉSIGNATION', 'PRIX UNIT.', 'MONTANT']],
            body: tableData,
            theme: 'plain',
            headStyles: {
                fontStyle: 'bold',
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0],
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 20 },
                1: { halign: 'left' },
                2: { halign: 'right', cellWidth: 35 },
                3: { halign: 'right', cellWidth: 35 }
            },
            styles: {
                font: "helvetica",
                fontSize: 9,
                cellPadding: 4,
                lineColor: [220, 220, 220],
                lineWidth: 0.1
            }
        });
    }

    // TOTAL Block
    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 180;
    const totalWidth = 35;
    const totalFormatted = `${(order.total || 0).toFixed(2).replace('.', ',')} €`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL", 150, finalY + 8, { align: "right" });

    // Total box
    doc.setFillColor(240, 240, 240);
    doc.rect(160, finalY, totalWidth, 12, 'F');
    doc.text(totalFormatted, 190, finalY + 8, { align: 'right' });

    // --- FOOTER ---
    const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
    let currentTempY = pageHeight - 65;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Conditions et modalités de paiement", 15, currentTempY);

    doc.setFont("helvetica", "normal");
    doc.text("Statut auto entrepreneur", 15, currentTempY + 5);
    doc.text("TVA non applicable article 293B du CGI", 15, currentTempY + 10);

    doc.text("Références bancaires", 15, currentTempY + 20);
    doc.text("M O. PEGOIX OU MME E. PEGOIX", 15, currentTempY + 25);
    doc.text("IBAN", 15, currentTempY + 30);
    doc.text("FR76 3002 7160 8000 0506 2940 303", 15, currentTempY + 35);
    doc.text("BIC", 15, currentTempY + 40);
    doc.text("CMCIFRPP", 15, currentTempY + 45);

    return Buffer.from(doc.output('arraybuffer'));
}

module.exports = { generateInvoiceBuffer };
