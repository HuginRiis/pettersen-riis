// Client-side image compressor: downscales og koder om til WebP via Canvas.
// Brukes for kvittering- og lønnsbilder før opplasting til Storage.
// PDF / ikke-bilder slippes uendret igjennom.

export type CompressOptions = {
  maxDim?: number; // største kant i px
  quality?: number; // 0..1
};

export async function compressImageToWebp(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // HEIC og lignende kan ikke dekodes av nettleseren — hopp over.
  if (/heic|heif/i.test(file.type)) return file;

  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.82;

  const bitmap = await loadBitmap(file);
  const { width, height } = fitInside(bitmap.width, bitmap.height, maxDim);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) (bitmap as ImageBitmap).close();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", quality),
  );
  if (!blob) return file;
  // Behold bare hvis vi faktisk sparte plass.
  if (blob.size >= file.size && file.type === "image/webp") return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.webp`, {
    type: "image/webp",
    lastModified: Date.now(),
  });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through til <img>
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function fitInside(w: number, h: number, maxDim: number) {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h };
  const scale = Math.min(maxDim / w, maxDim / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}
