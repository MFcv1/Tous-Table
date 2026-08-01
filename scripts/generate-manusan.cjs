const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');

// jspdf and jspdf-autotable are ES modules, so we import them dynamically
async function main() {
    const jsPDFModule = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');
    const jsPDF = jsPDFModule.jsPDF || jsPDFModule.default.jsPDF || jsPDFModule.default;
    const autoTable = autoTableModule.default;

    const projectId = 'tousatable-client';

    function initFirestore() {
        const app = admin.initializeApp(
            {
                credential: admin.credential.applicationDefault(),
                projectId,
            },
            `fetch-order-${projectId}-${Date.now()}`
        );
        return admin.firestore(app);
    }

    const db = initFirestore();

    console.log("Fetching orders from 'orders' collection...");
    const snapshot = await db.collection('orders').get();
    let targetOrder = null;
    
    snapshot.forEach(doc => {
        const data = doc.data();
        data.id = doc.id;
        const name = (data.shipping?.fullName || data.userEmail || "").toLowerCase();
        if (name.includes("manusan")) {
            targetOrder = data;
        }
    });

    if (!targetOrder) {
        console.error("Order for MANUSAN not found.");
        process.exit(1);
    }
    
    console.log("Order found:", targetOrder.id, targetOrder.shipping?.fullName, targetOrder.total);

    // Generate Invoice
    const doc = new jsPDF();
    const order = targetOrder;

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
    const invoiceDate = order.createdAt?._seconds ? new Date(order.createdAt._seconds * 1000).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
    const formatId = order.id ? order.id.slice(0, 8).toUpperCase() : 'N/A';

    doc.setFont("helvetica", "bold");
    doc.text("Facture n°", 150, 90);
    doc.text("Date", 150, 96);

    doc.setFont("helvetica", "normal");
    doc.text(formatId, 195, 90, { align: "right" });
    doc.text(invoiceDate, 195, 96, { align: "right" });

    // --- TABLE ---
    const tableData = (order.items || []).map(item => [
        item.quantity || 1,
        item.name || 'Article',
        `${(item.price || 0).toFixed(2).replace('.', ',')}`,
        `${((item.price || 0) * (item.quantity || 1)).toFixed(2).replace('.', ',')}`
    ]);

    autoTable(doc, {
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

    // TOTAL Block
    const finalY = doc.lastAutoTable.finalY;
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

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const outputPath = join(process.cwd(), `Facture_${formatId}.pdf`);
    writeFileSync(outputPath, pdfBuffer);
    console.log(`Saved PDF to ${outputPath}`);
    process.exit(0);
}

main().catch(console.error);
