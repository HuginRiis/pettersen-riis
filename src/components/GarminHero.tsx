import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Flame, ChevronDown, Check, Loader2, Sparkles } from "lucide-react";
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
    bannerFrom: "from-slate-700/60",
    bannerTo: "to-slate-900/80",
  },
  rebekka: {
    name: "Rebekka",
    house: "House Targaryen",
    words: "Fire and Blood",
    Icon: Flame,
    accent: "text-rose-200",
    border: "border-rose-500/40",
    bg: "bg-rose-950/30",
    bannerFrom: "from-rose-900/60",
    bannerTo: "to-black/80",
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
      const r = (await ensureHero({ data: { owner } })) as { url: string | null };
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
        className={`relative overflow-hidden rounded-lg border ${h.border} bg-gradient-to-r ${h.bannerFrom} ${h.bannerTo} px-4 pt-3 pb-4 mb-3`}
      >
        {/* Top row: house badge + device picker */}
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`h-10 w-10 rounded-full border ${h.border} ${h.bg} flex items-center justify-center shrink-0`}
            >
              <Icon className={`h-5 w-5 ${h.accent}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {h.house}
              </div>
              <div
                className={`text-lg leading-tight ${h.accent}`}
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                }}
              >
                {h.name}
              </div>
              <div
                className="text-[10px] italic text-muted-foreground"
                style={{ fontFamily: "var(--font-medieval)" }}
              >
                « {h.words} »
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={openPicker}
            title="Velg klokke"
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-md border ${h.border} ${h.bg} px-2 py-1 text-[11px] hover:opacity-90 focus:outline-none focus:ring-1 focus:ring-primary`}
          >
            <span className={`max-w-[140px] truncate ${h.accent}`}>
              {deviceName ?? "Velg klokke"}
            </span>
            <ChevronDown size={12} className="opacity-70" />
          </button>
        </div>

        {/* Hero device image — centered below text */}
        <div className="relative z-0 mt-3 flex flex-col items-center justify-center min-h-[180px]">
          {heroUrl ? (
            <img
              src={heroUrl}
              alt={deviceName ?? "Garmin"}
              className="max-h-48 w-auto object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.45)]"
              loading="lazy"
            />
          ) : (
            <button
              type="button"
              onClick={generateHero}
              disabled={genLoading}
              className={`inline-flex items-center gap-2 rounded-md border ${h.border} ${h.bg} px-3 py-2 text-xs hover:opacity-90 disabled:opacity-50`}
            >
              {genLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {genLoading ? "Genererer …" : "Generer AI-bilde av klokken"}
            </button>
          )}
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
