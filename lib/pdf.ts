/** Minimal dependency-free PDF writer — Helvetica/base14, Latin text
 *  only, one page stream. Shared by the claim package export (C5) and
 *  the governance exports (B1/B4). */
export function textPdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) =>
    // strip non-latin glyphs the base font can't render
    s.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, (c) => `\\${c}`);
  const text = [title, ...lines];
  const stream = text
    .map((t, i) => `BT /F1 ${i === 0 ? 12 : 9} Tf 40 ${800 - i * 14} Td (${esc(t)}) Tj ET`)
    .join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offs: number[] = [];
  for (const [i, o] of objs.entries()) {
    offs.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offs) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
