// Builds a sample PDF with typed text, ruled lines and pen-style handwriting for testing.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'sample.pdf';
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const page = doc.addPage([612, 792]);
page.drawText('Patient Intake Form', { x: 60, y: 720, size: 22, font: bold });
const lines = [
  'Name of patient: ____________________________   Date: ____________',
  'Address: ________________________________________________________',
  'The patient reports mild headaches for three days with no fever.',
  'Prescribed: Paracetamol 500mg twice daily after meals for 5 days.',
  'Follow-up appointment is recommended in two weeks if symptoms persist.',
];
lines.forEach((t, i) => page.drawText(t, { x: 60, y: 670 - i * 26, size: 11, font }));
page.drawLine({ start: { x: 60, y: 520 }, end: { x: 552, y: 520 }, thickness: 1, color: rgb(0, 0, 0) });
page.drawRectangle({ x: 60, y: 300, width: 492, height: 190, borderWidth: 1, borderColor: rgb(0.2, 0.2, 0.2) });
page.drawText('Doctor notes', { x: 70, y: 470, size: 11, font: bold });
// handwriting in blue ballpoint (cursive-like squiggles)
const blue = rgb(0.1, 0.22, 0.65);
page.drawSvgPath('M 0 0 C 10 -30 20 -30 25 0 C 30 25 40 25 48 0 C 55 -25 65 -25 70 0 C 78 25 90 20 98 -5 C 104 -22 115 -18 118 0 C 125 20 140 20 150 -10', { x: 90, y: 420, borderColor: blue, borderWidth: 2.4 });
page.drawSvgPath('M 0 0 C 8 -26 18 -26 22 0 C 28 22 38 22 44 0 C 52 -30 60 -30 66 4 C 72 26 86 18 92 -6 C 98 -24 112 -20 120 2 C 128 20 146 14 160 -8 C 170 -20 180 -12 190 0', { x: 260, y: 420, borderColor: blue, borderWidth: 2.4 });
// black-ink signature
page.drawSvgPath('M 0 0 C 20 -40 35 30 50 -10 C 60 -35 70 20 85 -5 C 95 -25 110 15 130 -15 L 160 -5 C 175 0 190 -20 210 -8', { x: 300, y: 350, borderColor: rgb(0.05, 0.05, 0.05), borderWidth: 2 });
page.drawText('Signature of doctor', { x: 300, y: 312, size: 9, font });
// handwritten name in the blank of line 1
page.drawSvgPath('M 0 0 C 6 -18 12 -18 15 0 C 18 14 26 14 30 0 C 34 -16 42 -16 46 0 C 50 12 60 12 66 -2 C 70 -12 80 -10 86 0', { x: 165, y: 674, borderColor: blue, borderWidth: 1.8 });
const p2 = doc.addPage([612, 792]);
p2.drawText('Page two — typed only', { x: 60, y: 720, size: 18, font: bold });
p2.drawText('This page has only printed text for testing navigation and export.', { x: 60, y: 690, size: 11, font });
writeFileSync(out, await doc.save());
console.log('wrote', out);
