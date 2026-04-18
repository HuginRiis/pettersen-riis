import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Needle, Upload, Download, Type as TypeIcon, Image as ImageIcon } from "lucide-react";
import {
  generateImageStitches,
  generateTextStitches,
} from "@/lib/pes-stitch-gen";
import { writePES, type ColorBlock } from "@/lib/pes-writer";

export const Route = createFileRoute("/brodering")({
  head: () => ({
    meta: [
      { title: "Husets Brodering — House Pettersen-Riis" },
      {
        name: "description",
        content:
          "Lag broderifiler (PES) for Brother-maskiner. Skriv tekst eller last opp et bilde — maks 8×8 cm.",
      },
    ],
  }),
  component: BroderingPage,
});

const MAX_MM = 80;

// A Google-hosted TTF that opentype.js can fetch (CORS enabled).
const FONTS: { label: string; url: string }[] = [
  {
    label: "Cinzel (display)",
    url: "https://cdn.jsdelivr.net/fontsource/fonts/cinzel@latest/latin-700-normal.ttf",
  },
  {
    label: "Inter (sans)",
    url: "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf",
  },
  {
    label: "Playfair Display (serif)",
    url: "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-700-normal.ttf",
  },
];

type Generated = {
  blocks: ColorBlock[];
  widthMm: number;
  heightMm: number;
};

function BroderingPage() {
  return (
    <PageShell>
      <section className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="text-center mb-10">
          <div className="text-[10px] tracking-[0.4em] text-primary uppercase mb-3">
            Husets nålemestere
          </div>
          <h1 className="heading-hero text-4xl md:text-5xl">Brodering</h1>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Skap broderifiler for Brother-maskinen. Skriv et navn eller last opp et
            enkelt bilde, og last ned en PES-fil — alltid innenfor 8 × 8 cm.
          </p>
        </div>

        <div className="ornate-divider mb-10">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Verkstedet
          </span>
        </div>

        <Tabs defaultValue="text">
          <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
            <TabsTrigger value="text" className="gap-2">
              <TypeIcon size={14} /> Tekst
            </TabsTrigger>
            <TabsTrigger value="image" className="gap-2">
              <ImageIcon size={14} /> Bilde
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-6">
            <TextPanel />
          </TabsContent>
          <TabsContent value="image" className="mt-6">
            <ImagePanel />
          </TabsContent>
        </Tabs>

        <Card className="mt-10 border-primary/20">
          <CardHeader>
            <CardTitle className="text-primary text-base flex items-center gap-2">
              <Needle size={16} /> Råd fra mesteren
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              • PES-filen er v1 — den mest kompatible varianten for Brother
              hjemme­broderimaskiner (PE-Design / Brother Innov-is).
            </p>
            <p>
              • Designet skaleres alltid til maks 8 × 8 cm. Tegn enkle motiver med
              tydelige kanter for best resultat.
            </p>
            <p>
              • Bilder fungerer best som svart silhuett på hvit bakgrunn (logoer,
              monogrammer). Fotografier vil ikke gi godt broderi uten manuell
              digitalisering.
            </p>
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* TEXT PANEL                                                          */
/* ------------------------------------------------------------------ */

function TextPanel() {
  const [text, setText] = useState("Arne");
  const [fontIdx, setFontIdx] = useState(0);
  const [heightMm, setHeightMm] = useState(25);
  const [color, setColor] = useState("#D4AF37");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Generated | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await generateTextStitches({
        text,
        fontUrl: FONTS[fontIdx].url,
        heightMm,
        maxMm: MAX_MM,
        colorHex: color,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klarte ikke å generere broderi.");
    } finally {
      setBusy(false);
    }
  };

  // Auto-generate on first mount
  useEffect(() => {
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = () => {
    if (!result) return;
    const bytes = writePES(result.blocks);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(text || "brodering").replace(/[^a-z0-9-_]+/gi, "_")}.pes`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-primary text-base">Skriv din tekst</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="b-text">Tekst</Label>
            <Input
              id="b-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Navn eller ord"
              maxLength={20}
            />
          </div>

          <div>
            <Label>Skrifttype</Label>
            <div className="grid grid-cols-1 gap-2 mt-1">
              {FONTS.map((f, i) => (
                <button
                  key={f.label}
                  onClick={() => setFontIdx(i)}
                  className={`px-3 py-2 rounded-md border text-left text-sm transition-colors ${
                    fontIdx === i
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Tekst-høyde: {heightMm} mm</Label>
            <Slider
              value={[heightMm]}
              min={8}
              max={MAX_MM}
              step={1}
              onValueChange={(v) => setHeightMm(v[0])}
            />
          </div>

          <div>
            <Label htmlFor="b-color">Trådfarge</Label>
            <div className="flex items-center gap-2">
              <input
                id="b-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-14 rounded border border-border bg-transparent"
              />
              <span className="text-sm text-muted-foreground">{color}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={generate} disabled={busy || !text.trim()} className="flex-1">
              {busy ? "Genererer…" : "Generer broderi"}
            </Button>
            <Button
              onClick={download}
              disabled={!result}
              variant="outline"
              className="gap-2"
            >
              <Download size={14} /> PES
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <PreviewPanel result={result} color={color} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* IMAGE PANEL                                                         */
/* ------------------------------------------------------------------ */

function ImagePanel() {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [imageName, setImageName] = useState("brodering");
  const [threshold, setThreshold] = useState(128);
  const [color, setColor] = useState("#000000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Generated | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setError(null);
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);
      // Downsample to max 256 px to keep stitch count reasonable.
      const max = 256;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      setImageData(ctx.getImageData(0, 0, w, h));
      setImageName(file.name.replace(/\.[^.]+$/, "") || "brodering");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke lese bildet.");
    }
  };

  const generate = () => {
    if (!imageData) return;
    setBusy(true);
    setError(null);
    try {
      const r = generateImageStitches({
        imageData,
        threshold,
        maxMm: MAX_MM,
        colorHex: color,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klarte ikke å generere broderi.");
    } finally {
      setBusy(false);
    }
  };

  // Re-generate when threshold or color changes (debounced via effect)
  useEffect(() => {
    if (!imageData) return;
    const id = setTimeout(generate, 200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageData, threshold, color]);

  const download = () => {
    if (!result) return;
    const bytes = writePES(result.blocks);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${imageName.replace(/[^a-z0-9-_]+/gi, "_")}.pes`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-primary text-base">Last opp bilde</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed border-border rounded-md p-6 text-center cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void onFile(f);
            }}
          >
            <Upload className="mx-auto mb-2 text-primary" size={20} />
            <p className="text-sm text-muted-foreground">
              Klikk eller dra et bilde hit (PNG / JPG / SVG)
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
          </div>

          <div>
            <Label>Sort/hvit-terskel: {threshold}</Label>
            <Slider
              value={[threshold]}
              min={20}
              max={235}
              step={1}
              onValueChange={(v) => setThreshold(v[0])}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Pikslar mørkere enn dette blir broderte.
            </p>
          </div>

          <div>
            <Label htmlFor="bi-color">Trådfarge</Label>
            <div className="flex items-center gap-2">
              <input
                id="bi-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-14 rounded border border-border bg-transparent"
              />
              <span className="text-sm text-muted-foreground">{color}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={generate} disabled={busy || !imageData} className="flex-1">
              {busy ? "Genererer…" : "Generer på nytt"}
            </Button>
            <Button
              onClick={download}
              disabled={!result}
              variant="outline"
              className="gap-2"
            >
              <Download size={14} /> PES
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <PreviewPanel result={result} color={color} />
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Kunne ikke laste bildet."));
    img.src = src;
  });
}

/* ------------------------------------------------------------------ */
/* PREVIEW                                                             */
/* ------------------------------------------------------------------ */

function PreviewPanel({ result, color }: { result: Generated | null; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const W = cv.width;
    const H = cv.height;
    ctx.fillStyle = "#1a1f2c";
    ctx.fillRect(0, 0, W, H);

    // Draw 8x8 cm hoop area
    const hoopMm = MAX_MM;
    const margin = 16;
    const scale = Math.min((W - margin * 2) / hoopMm, (H - margin * 2) / hoopMm);
    const cx = W / 2;
    const cy = H / 2;

    // Hoop boundary
    ctx.strokeStyle = "rgba(212, 175, 55, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
      cx - (hoopMm * scale) / 2,
      cy - (hoopMm * scale) / 2,
      hoopMm * scale,
      hoopMm * scale,
    );
    ctx.setLineDash([]);

    // Center cross
    ctx.strokeStyle = "rgba(212, 175, 55, 0.15)";
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    if (!result) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Forhåndsvisning vises her", cx, cy + 4);
      return;
    }

    // Stitches
    let prev: { x: number; y: number } | null = null;
    let stitchCount = 0;
    for (const block of result.blocks) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (const s of block.stitches) {
        const px = cx + s.x * scale;
        const py = cy + s.y * scale;
        if (s.type === "jump" || !prev) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
          stitchCount++;
        }
        prev = { x: px, y: py };
      }
      ctx.stroke();
    }

    // Info overlay
    ctx.fillStyle = "rgba(212, 175, 55, 0.9)";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      `${result.widthMm.toFixed(1)} × ${result.heightMm.toFixed(1)} mm · ${stitchCount} sting`,
      12,
      H - 12,
    );
  }, [result, color]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-primary text-base">Forhåndsvisning</CardTitle>
      </CardHeader>
      <CardContent>
        <canvas
          ref={canvasRef}
          width={480}
          height={480}
          className="w-full rounded-md border border-border"
        />
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          Den gylne firkanten er rammen på 8 × 8 cm
        </p>
      </CardContent>
    </Card>
  );
}
