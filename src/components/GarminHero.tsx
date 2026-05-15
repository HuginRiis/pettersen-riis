import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Flame, ChevronDown, Check, Loader2, Sparkles, Watch, SlidersHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listGarminDevices,
  setDefaultGarminDevice,
  ensureGarminDeviceHero,
  getGarminOverview,
} from "@/server/garmin.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Owner = "arne" | "rebekka";

const HOUSES: Record<
  Owner,
  {
    name: string;
    house: string;
    words: string;
    Icon: typeof Crown;
    accent: string;
    border: string;
    bg: string;
   bannerFrom: string;
    bannerTo: string;
    /** Solid edge color the watch image should fade into (right side) */
    fadeColor: string;
  }
> = {
  arne: {
    name: "Arne",
    house: "House Stark",
    words: "Winter is Coming",
    Icon: Crown,
    accent: "text-slate-200",
    border: "border-slate-400/40",
    bg: "bg-slate-900/40",
    bannerFrom: "from-slate-700",
    bannerTo: "to-slate-900",
    fadeColor: "rgb(15, 23, 42)", // slate-900
  },
  rebekka: {
    name: "Rebekka",
    house: "House Targaryen",
    words: "Fire and Blood",
    Icon: Flame,
    accent: "text-rose-200",
    border: "border-rose-500/40",
    bg: "bg-rose-950/30",
    bannerFrom: "from-rose-900",
    bannerTo: "to-rose-950",
    fadeColor: "rgb(76, 5, 25)", // deep targaryen red
  },
};

type DeviceRow = {
  id: string;
  product_id: string;
  name: string;
  image_url: string | null;
  is_default: boolean;
  last_used_at: string | null;
  register_date: string | null;
};

export function GarminHero({ owner }: { owner: Owner }) {
  const h = HOUSES[owner];
  const Icon = h.Icon;

  const fetchOverview = useServerFn(getGarminOverview);
  const listDevicesFn = useServerFn(listGarminDevices);
  const setDefaultDeviceFn = useServerFn(setDefaultGarminDevice);
  const ensureHero = useServerFn(ensureGarminDeviceHero);

  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const ov = (await fetchOverview({ data: { owner } })) as {
        status: { device_name: string | null; device_image_url: string | null };
      };
      setDeviceName(ov.status.device_name);
      // Try to get cached AI hero (without forcing generation)
      const r = (await ensureHero({ data: { owner } })) as { url: string | null };
      setHeroUrl(r.url ?? ov.status.device_image_url ?? null);
    } catch {
      // ignore — banner blir uten bilde
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  const generateHero = async () => {
    setGenLoading(true);
    try {
      const r = (await ensureHero({ data: { owner, generate: true } })) as { url: string | null };
      setHeroUrl(r.url);
      toast.success("AI-bilde generert");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenLoading(false);
    }
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setDevicesLoading(true);
    try {
      const r = (await listDevicesFn({ data: { owner } })) as { devices: DeviceRow[] };
      setDevices(r.devices ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDevicesLoading(false);
    }
  };

  const chooseDefault = async (deviceId: string) => {
    setSettingDefault(deviceId);
    try {
      await setDefaultDeviceFn({ data: { owner, deviceId } });
      toast.success("Standardklokke oppdatert");
      const r = (await listDevicesFn({ data: { owner } })) as { devices: DeviceRow[] };
      setDevices(r.devices ?? []);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSettingDefault(null);
    }
  };

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-lg border ${h.border} bg-gradient-to-r ${h.bannerFrom} ${h.bannerTo} mb-3 min-h-[170px]`}
      >
        {/* Background hero image — fades into banner color on all edges */}
        {heroUrl && (
          <img
            src={heroUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover object-right opacity-90"
            style={{
              WebkitMaskImage:
                "radial-gradient(ellipse 70% 90% at 80% 50%, #000 35%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0) 95%)",
              maskImage:
                "radial-gradient(ellipse 70% 90% at 80% 50%, #000 35%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0) 95%)",
            }}
            loading="lazy"
          />
        )}
        {/* Dark gradient overlay for left-side text legibility */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.15) 75%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* Foreground content */}
        <div className="relative z-10 flex items-center justify-between gap-3 px-4 py-4 min-h-[170px]">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`h-10 w-10 rounded-full border ${h.border} bg-black/40 flex items-center justify-center shrink-0`}
            >
              <Watch className={`h-5 w-5 ${h.accent}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Aktiv enhet
              </div>
              <div
                className={`text-xl leading-tight ${h.accent} truncate`}
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
                title={deviceName ?? undefined}
              >
                {deviceName ?? "Ingen klokke"}
              </div>
              <div
                className="text-[10px] italic text-muted-foreground mt-0.5"
                style={{ fontFamily: "var(--font-medieval)" }}
              >
                « {h.words} »
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openPicker}
              title="Velg klokke"
              className={`inline-flex items-center gap-1.5 rounded-full border ${h.border} bg-black/55 backdrop-blur px-3 py-1.5 text-[12px] hover:bg-black/70 focus:outline-none focus:ring-1 focus:ring-primary ${h.accent}`}
              style={{ fontFamily: "var(--font-display)", letterSpacing: "0.08em" }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Bytt
              <ChevronDown size={12} className="opacity-70" />
            </button>
            <button
              type="button"
              onClick={generateHero}
              disabled={genLoading}
              title={heroUrl ? "Generer på nytt" : "Generer AI-bilde av klokken"}
              className={`inline-flex items-center justify-center h-8 w-8 rounded-full border ${h.border} bg-black/55 backdrop-blur hover:bg-black/70 disabled:opacity-50 ${h.accent}`}
            >
              {genLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : heroUrl ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Velg klokke for {h.name}</DialogTitle>
            <DialogDescription>
              Den valgte klokken brukes som standardenhet i banneret og syncen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto py-2">
            {devicesLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Fant ingen klokker.</p>
            ) : (
              devices.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => chooseDefault(d.id)}
                  disabled={!!settingDefault}
                  className={`w-full text-left flex items-center gap-3 rounded-md border px-3 py-2 transition ${
                    d.is_default
                      ? "border-primary/60 bg-primary/5"
                      : "border-border/60 hover:bg-muted/40"
                  }`}
                >
                  {d.image_url ? (
                    <img
                      src={d.image_url}
                      alt={d.name}
                      className="h-10 w-10 rounded object-cover bg-background"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {d.product_id}
                    </div>
                  </div>
                  {settingDefault === d.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : d.is_default ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : null}
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPickerOpen(false)}>
              Lukk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
