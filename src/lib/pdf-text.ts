// Klient-side uthenting av tekst fra PDF (kjører i nettleseren, ikke på server).
// Brukes av import i «Regnskap og budsjett» så vi slipper å sende hele PDF-en til AI.

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as any[]) {
      const str = String(item?.str ?? "").trim();
      if (!str) continue;
      const tr = item.transform as number[];
      const y = Math.round((tr?.[5] ?? 0) / 3) * 3;
      const x = tr?.[4] ?? 0;
      const arr = rows.get(y) ?? [];
      arr.push({ x, s: str });
      rows.set(y, arr);
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const cells = (rows.get(y) ?? []).sort((a, b) => a.x - b.x).map((c) => c.s);
      const line = cells.join(" ").replace(/\s{2,}/g, " ").trim();
      if (line) lines.push(line);
    }
  }
  await doc.destroy();
  return lines.join("\n");
}
