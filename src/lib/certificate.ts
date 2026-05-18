function sanitizePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function escapePdfText(value: string) {
  return sanitizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(value: string, maxLength: number) {
  const words = sanitizePdfText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function buildPdf(content: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 8 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function formatPdfNumber(value: number) {
  return Number(value.toFixed(2));
}

function approximateTextWidth(value: string, fontSize: number, weight: "regular" | "bold" = "regular") {
  const factor = weight === "bold" ? 0.56 : 0.5;
  return sanitizePdfText(value).length * fontSize * factor;
}

function centeredX(value: string, fontSize: number, weight: "regular" | "bold" = "regular") {
  const width = approximateTextWidth(value, fontSize, weight);
  return formatPdfNumber(Math.max(72, (612 - width) / 2));
}

function circlePath(cx: number, cy: number, radius: number) {
  const control = radius * 0.5522847498;
  const x = formatPdfNumber(cx);
  const y = formatPdfNumber(cy);
  const r = formatPdfNumber(radius);
  const c = formatPdfNumber(control);

  return [
    `${x} ${formatPdfNumber(y + r)} m`,
    `${formatPdfNumber(x + c)} ${formatPdfNumber(y + r)} ${formatPdfNumber(x + r)} ${formatPdfNumber(y + c)} ${formatPdfNumber(x + r)} ${y} c`,
    `${formatPdfNumber(x + r)} ${formatPdfNumber(y - c)} ${formatPdfNumber(x + c)} ${formatPdfNumber(y - r)} ${x} ${formatPdfNumber(y - r)} c`,
    `${formatPdfNumber(x - c)} ${formatPdfNumber(y - r)} ${formatPdfNumber(x - r)} ${formatPdfNumber(y - c)} ${formatPdfNumber(x - r)} ${y} c`,
    `${formatPdfNumber(x - r)} ${formatPdfNumber(y + c)} ${formatPdfNumber(x - c)} ${formatPdfNumber(y + r)} ${x} ${formatPdfNumber(y + r)} c`,
  ].join(" ");
}

export function formatCertificateNumber(certificateId?: number, sessionDate?: string) {
  const date = sessionDate ? new Date(sessionDate) : new Date();
  const year = Number.isNaN(date.getTime()) ? new Date().getUTCFullYear() : date.getUTCFullYear();
  const serial = String(Math.max(certificateId || 0, 0)).padStart(6, "0");
  return certificateId ? `AFYA-${year}-${serial}` : `AFYA-${year}-PENDING`;
}

export function formatCertificateDate(sessionDate?: string) {
  const date = sessionDate ? new Date(sessionDate) : new Date();
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function downloadCertificatePdf(data: {
  recipientName: string;
  status: string;
  summary: string;
  sessionDate: string;
  certificateId?: number;
  avgMood?: number;
}) {
  const name = sanitizePdfText(data.recipientName) || "AfyaMind Member";
  const status = sanitizePdfText(data.status) || "Completed";
  const summaryLines = wrapText(data.summary || "Wellness support session completed.", 58).slice(0, 4);
  const issuedOn = formatCertificateDate(data.sessionDate);
  const certificateNumber = formatCertificateNumber(data.certificateId, data.sessionDate);
  const averageMood = typeof data.avgMood === "number" && data.avgMood > 0
    ? `${data.avgMood.toFixed(1)}/10`
    : "Recorded on issue";

  const title = "Certificate of Wellness Completion";
  const subtitle = "Official AfyaMind guided wellness session record";
  const awardedText = "This document recognizes completion of a supported wellness session by";
  const digitalLine = "Digitally issued by AfyaMind Care Team";
  const footerLine = "This certificate confirms session completion only and does not replace clinical diagnosis or emergency care.";

  const commands = [
    "0.95 0.98 0.96 rg 0 0 612 792 re f",
    "0.91 0.96 0.92 rg 22 22 568 748 re f",
    "0.56 0.69 0.59 RG 2 w 36 36 540 720 re S",
    "0.82 0.73 0.48 RG 1.5 w 52 52 508 688 re S",
    "0.90 0.95 0.91 rg 70 650 472 78 re f",
    "0.82 0.73 0.48 RG 1 w 70 650 472 78 re S",
    "0.15 0.22 0.18 rg",
    `BT /F4 10 Tf 78 705 Td (Certificate No. ${escapePdfText(certificateNumber)}) Tj ET`,
    `BT /F1 10 Tf 430 705 Td (Issued ${escapePdfText(issuedOn)}) Tj ET`,
    "0.19 0.31 0.24 rg",
    `BT /F2 30 Tf ${centeredX(title, 30, "bold")} 666 Td (${escapePdfText(title)}) Tj ET`,
    "0.26 0.33 0.29 rg",
    `BT /F3 15 Tf ${centeredX(subtitle, 15)} 640 Td (${escapePdfText(subtitle)}) Tj ET`,
    "0.18 0.24 0.20 rg",
    `BT /F1 14 Tf ${centeredX(awardedText, 14)} 560 Td (${escapePdfText(awardedText)}) Tj ET`,
    "0.19 0.31 0.24 rg",
    `BT /F2 28 Tf ${centeredX(name, 28, "bold")} 512 Td (${escapePdfText(name)}) Tj ET`,
    "0.56 0.69 0.59 RG 1.6 w 154 500 m 458 500 l S",
    "0.98 0.98 0.95 rg 84 340 444 116 re f",
    "0.80 0.72 0.47 RG 1 w 84 340 444 116 re S",
    "0.15 0.22 0.18 rg",
    `BT /F2 16 Tf 102 426 Td (Session status: ${escapePdfText(status)}) Tj ET`,
  ];

  let currentY = 398;
  summaryLines.forEach((line) => {
    commands.push(`BT /F1 13 Tf 102 ${currentY} Td (${escapePdfText(line)}) Tj ET`);
    currentY -= 20;
  });

  commands.push(
    "0.92 0.96 0.93 rg 84 246 208 68 re f",
    "0.56 0.69 0.59 RG 0.8 w 84 246 208 68 re S",
    "0.92 0.96 0.93 rg 320 246 208 68 re f",
    "0.56 0.69 0.59 RG 0.8 w 320 246 208 68 re S",
    "0.22 0.30 0.26 rg",
    "BT /F1 11 Tf 102 292 Td (Issued) Tj ET",
    "0.15 0.22 0.18 rg",
    `BT /F2 16 Tf 102 268 Td (${escapePdfText(issuedOn)}) Tj ET`,
    "0.22 0.30 0.26 rg",
    "BT /F1 11 Tf 338 292 Td (Average mood over recent check-ins) Tj ET",
    "0.15 0.22 0.18 rg",
    `BT /F2 16 Tf 338 268 Td (${escapePdfText(averageMood)}) Tj ET`,
    "0.35 0.45 0.39 RG 1.2 w 88 164 m 250 164 l S",
    "0.35 0.45 0.39 RG 1.2 w 320 164 m 460 164 l S",
    "0.22 0.30 0.26 rg",
    `BT /F1 11 Tf 88 146 Td (${escapePdfText(digitalLine)}) Tj ET`,
    "BT /F1 11 Tf 320 146 Td (Official digital verification mark) Tj ET",
    "0.93 0.87 0.65 rg",
    `${circlePath(498, 174, 40)} f`,
    "0.53 0.66 0.57 rg",
    `${circlePath(498, 174, 31)} f`,
    "1 1 1 rg",
    "BT /F2 12 Tf 470 177 Td (VERIFIED) Tj ET",
    "BT /F1 8 Tf 481 160 Td (AFYAMIND) Tj ET",
    "0.24 0.30 0.28 rg",
    `BT /F4 8 Tf 88 104 Td (${escapePdfText(certificateNumber)}) Tj ET`,
    "0.22 0.28 0.24 rg",
    `BT /F1 9 Tf ${centeredX(footerLine, 9)} 82 Td (${escapePdfText(footerLine)}) Tj ET`,
  );

  const blob = buildPdf(commands.join("\n"));
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "afyamind"}-certificate.pdf`;
  link.click();
  URL.revokeObjectURL(link.href);
}
