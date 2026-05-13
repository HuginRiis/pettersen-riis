import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GarminPanel } from "@/components/GarminPanel";
import { GarminCompare } from "@/components/GarminCompare";
import { Crown, Flame, Swords } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listGarminDevices } from "@/server/garmin.functions";

type Owner = "arne" | "rebekka";

const HOUSES: Record<Owner, {
  name: string;
  house: string;
  words: string;
  Icon: typeof Crown;
  accent: string;
  border: string;
  bg: string;
  bannerFrom: string;
  bannerTo: string;
}> = {
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

function HouseBanner({ owner }: { owner: Owner }) {
  const h = HOUSES[owner];
  const Icon = h.Icon;
  const fetchDevices = useServerFn(listGarminDevices);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetchDevices({ data: { owner } }) as { devices: Array<{ is_default: boolean; image_transparent_url: string | null; image_url: string | null }> };
        if (!alive) return;
        const def = r.devices.find((d) => d.is_default) ?? r.devices[0] ?? null;
        setWatchUrl(def?.image_transparent_url ?? def?.image_url ?? null);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [fetchDevices, owner]);
  return (
    <div className={`relative overflow-hidden rounded-lg border ${h.border} bg-gradient-to-r ${h.bannerFrom} ${h.bannerTo} px-4 py-3 mb-3 flex items-center gap-3`}>
      <div className={`h-10 w-10 rounded-full border ${h.border} ${h.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`h-5 w-5 ${h.accent}`} />
      </div>
      <div className="flex-1 min-w-0 pr-20 sm:pr-24">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
          {h.house}
        </div>
        <div className={`text-lg leading-tight ${h.accent}`} style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.05em" }}>
          {h.name}
        </div>
        <div className="text-[10px] italic text-muted-foreground" style={{ fontFamily: "var(--font-medieval)" }}>
          « {h.words} »
        </div>
      </div>
      {watchUrl && (
        <img
          src={watchUrl}
          alt=""
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-20 sm:h-24 w-auto object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
          loading="lazy"
        />
      )}
    </div>
  );
}

export function GarminHouses() {
  const [tab, setTab] = useState<"arne" | "rebekka" | "compare">("arne");

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList className="grid grid-cols-3 w-full bg-card/40 border border-border/60 h-auto p-1">
          <TabsTrigger
            value="arne"
            className="data-[state=active]:bg-slate-800/60 data-[state=active]:text-slate-100 data-[state=active]:border-slate-400/50 border border-transparent flex items-center gap-1.5"
            style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
          >
            <Crown className="h-3.5 w-3.5" /> Arne
          </TabsTrigger>
          <TabsTrigger
            value="rebekka"
            className="data-[state=active]:bg-rose-950/60 data-[state=active]:text-rose-100 data-[state=active]:border-rose-500/50 border border-transparent flex items-center gap-1.5"
            style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
          >
            <Flame className="h-3.5 w-3.5" /> Rebekka
          </TabsTrigger>
          <TabsTrigger
            value="compare"
            className="data-[state=active]:bg-amber-950/60 data-[state=active]:text-amber-100 data-[state=active]:border-amber-500/50 border border-transparent flex items-center gap-1.5"
            style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
          >
            <Swords className="h-3.5 w-3.5" /> Sammenlign
          </TabsTrigger>
        </TabsList>

        <TabsContent value="arne" className="mt-3">
          <HouseBanner owner="arne" />
          <GarminPanel owner="arne" displayName="Arne" />
        </TabsContent>
        <TabsContent value="rebekka" className="mt-3">
          <HouseBanner owner="rebekka" />
          <GarminPanel owner="rebekka" displayName="Rebekka" />
        </TabsContent>
        <TabsContent value="compare" className="mt-3">
          <GarminCompare />
        </TabsContent>
      </Tabs>
    </div>
  );
}
