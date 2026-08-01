const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable');

console.log("jsPDF typeof:", typeof jsPDF);
console.log("autoTable typeof:", typeof autoTable);

const doc = new jsPDF();
doc.text("Hello", 10, 10);
const buf = Buffer.from(doc.output('arraybuffer'));
console.log("Buffer length:", buf.length);
