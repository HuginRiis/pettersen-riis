// Backfill: laste ned hver kvittering, komprimere til WebP via imagemagick,
// laste opp ny .webp-fil, oppdatere DB-rad, slette gammel original.
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileP = promisify(execFile);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("env missing");

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BUCKET = "receipts";
const WORK = path.join(tmpdir(), "rcpt-backfill");
await mkdir(WORK, { recursive: true });

const MAGICK = process.env.MAGICK_BIN || "magick";

const { data: rows, error } = await sb
  .from("receipts")
  .select("id,image_path,image_url")
  .order("created_at", { ascending: true });
if (error) throw error;

let savedTotal = 0;
let beforeTotal = 0;
let skipped = 0;
let failed = 0;
let done = 0;

for (const r of rows) {
  const oldPath = r.image_path;
  if (!oldPath) { skipped++; continue; }
  if (oldPath.toLowerCase().endsWith(".webp")) { skipped++; continue; }

  try {
    const dl = await sb.storage.from(BUCKET).download(oldPath);
    if (dl.error) throw dl.error;
    const ab = await dl.data.arrayBuffer();
    const buf = Buffer.from(ab);
    const beforeBytes = buf.length;

    const base = oldPath.replace(/\.[^./]+$/, "");
    const inFile = path.join(WORK, "in-" + path.basename(oldPath));
    const outFile = path.join(WORK, "out-" + path.basename(base) + ".webp");
    await writeFile(inFile, buf);

    // resize: største kant 1600, kvalitet 82
    await execFileP(MAGICK, [
      inFile,
      "-auto-orient",
      "-resize", "1600x1600>",
      "-quality", "82",
      outFile,
    ]);

    const outBuf = await readFile(outFile);
    const afterBytes = outBuf.length;

    const newPath = base + ".webp";
    const up = await sb.storage.from(BUCKET).upload(newPath, outBuf, {
      contentType: "image/webp",
      upsert: true,
    });
    if (up.error) throw up.error;
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(newPath);

    const { error: updErr } = await sb
      .from("receipts")
      .update({ image_path: newPath, image_url: pub.publicUrl })
      .eq("id", r.id);
    if (updErr) throw updErr;

    if (newPath !== oldPath) {
      await sb.storage.from(BUCKET).remove([oldPath]);
    }

    await unlink(inFile).catch(() => {});
    await unlink(outFile).catch(() => {});

    beforeTotal += beforeBytes;
    savedTotal += beforeBytes - afterBytes;
    done++;
    if (done % 10 === 0) {
      console.log(`${done}/${rows.length} — spart ${(savedTotal/1024/1024).toFixed(1)} MB av ${(beforeTotal/1024/1024).toFixed(1)} MB`);
    }
  } catch (e) {
    failed++;
    console.warn("FEIL", r.id, oldPath, e.message ?? e);
  }
}

console.log("\nFerdig.");
console.log(`Konvertert: ${done}  Hoppet over: ${skipped}  Feilet: ${failed}`);
console.log(`Original total: ${(beforeTotal/1024/1024).toFixed(2)} MB`);
console.log(`Spart: ${(savedTotal/1024/1024).toFixed(2)} MB`);
