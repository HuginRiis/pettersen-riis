import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { X, Loader2, Camera } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

export function BarcodeScannerDialog({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStarting(true);
    setError(null);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.QR_CODE,
    ]);
    const reader = new BrowserMultiFormatReader(hints);

    (async () => {
      try {
        // Foretrekk bakkamera på mobil
        const constraints: MediaStreamConstraints = {
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        };
        const controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current!,
          (result, err) => {
            if (cancelled) return;
            if (result) {
              const text = result.getText();
              if (text) {
                controls.stop();
                onDetected(text);
              }
            }
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      } catch (e: any) {
        if (cancelled) return;
        setStarting(false);
        setError(
          e?.message?.includes("Permission")
            ? "Kameratilgang ble avvist. Tillat kamera i nettleseren og prøv igjen."
            : e?.message ?? "Kunne ikke starte kamera",
        );
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-border bg-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2 text-sm">
            <Camera size={16} className="text-primary" />
            <span className="text-display tracking-widest uppercase text-xs text-primary">
              Skann strekkode
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-primary p-1"
            aria-label="Lukk"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative aspect-[3/4] bg-black">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
          />
          {/* Sikteramme */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-4/5 h-1/3 border-2 border-primary/80 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>

          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="animate-spin text-primary" size={28} />
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/70">
              <p className="text-sm text-center text-destructive">{error}</p>
            </div>
          )}
        </div>

        <div className="p-3 text-[11px] text-muted-foreground text-center">
          Hold strekkoden inne i rammen — søker automatisk når den treffer.
        </div>
      </div>
    </div>
  );
}
