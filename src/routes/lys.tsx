import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Flame, Power, ChevronDown, Loader2, Palette, Thermometer, Settings2, Star } from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { useMenuPrefs } from "@/hooks/use-menu-prefs";

import {
  getHomeySnapshot,
  setLivingRoomDeviceCapability,
  type HomeyDeviceSnapshot,
} from "@/server/homey";
import { recordHomeyApiCall } from "@/lib/homey-api-tracker";
import { Slider } from "@/components/ui/slider";
import heroImg from "@/assets/got-lys.jpg";

export const Route = createFileRoute("/lys")({
  head: () => ({
    meta: [
      { title: "Borgens Ildsteder | House Pettersen-Riis" },
      {
        name: "description",
        content: "Alle lys og dimmere i borgen — tenn, slukk eller demp flammene.",
      },
      { property: "og:title", content: "Borgens Ildsteder" },
      {
        property: "og:description",
        content: "Alle lys og dimmere i borgen — styrt fra én tronsal.",
      },
    ],
  }),
  staleTime: 60_000,
  loader: async () => {
    const res = await getHomeySnapshot();
    recordHomeyApiCall();
    return res;
  },
  component: LysPage,
  errorComponent: ({ error }) => (
    <PageShell>
      <PageHero
        eyebrow="Mørke i borgen"
        title="Borgens Ildsteder"
        subtitle="Ravnene fra Homey nådde ikke fram."
        image={heroImg}
      />
      <section className="container mx-auto px-4 py-12">
        <div className="panel rounded-lg p-6">
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </section>
    </PageShell>
  ),
});

type LightDevice = {
  id: string;
  name: string;
  zoneId: string | null;
  zoneName: string;
  on: boolean;
  hasOnOff: boolean;
  dim: number | null;
  hasDim: boolean;
  isLightClass: boolean;
  hasHue: boolean;
  hue: number | null;
  saturation: number | null;
  hasTemperature: boolean;
  temperature: number | null;
  hasLightMode: boolean;
  lightMode: string | null;
};

function LysPage() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getHomeySnapshot>>;
  const router = useRouter();
  const setCap = useServerFn(setLivingRoomDeviceCapability);
  const [overrides, setOverrides] = useState<
    Record<string, { on?: boolean; dim?: number; hue?: number; saturation?: number; temperature?: number }>
  >({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [, setUpdated] = useState<Date | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [colorOpen, setColorOpen] = useState<Record<string, boolean>>({});
  const [scenes, setScenes] = useState<Array<{ slot: number; name: string; device_ids: string[] }>>([
    { slot: 0, name: "Tenn alle", device_ids: [] },
    { slot: 1, name: "Stua", device_ids: [] },
    { slot: 2, name: "Utelys", device_ids: [] },
  ]);
  const [, setWho] = useState<string>("Alle");

  useEffect(() => {
    setUpdated(new Date());
  }, [data]);

  // Last scener for innlogget push-bruker
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getStoredWho } = await import("@/lib/push-client");
      const { supabase } = await import("@/integrations/supabase/client");
      const w = getStoredWho() || "Alle";
      if (cancelled) return;
      setWho(w);
      const { data: rows } = await supabase
        .from("user_light_scenes")
        .select("slot, name, device_ids")
        .eq("who", w)
        .order("slot");
      if (cancelled || !rows || rows.length === 0) return;
      const map = new Map<number, { slot: number; name: string; device_ids: string[] }>();
      for (const r of rows as any[]) {
        map.set(r.slot, {
          slot: r.slot,
          name: r.name ?? `Scene ${r.slot + 1}`,
          device_ids: Array.isArray(r.device_ids) ? r.device_ids : [],
        });
      }
      setScenes((prev) => prev.map((s) => map.get(s.slot) ?? s));
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data.ok) {
    return (
      <PageShell>
        <PageHero
          eyebrow="Krøniken om"
          title="Borgens Ildsteder"
          subtitle="Bind ravnene til Homey for å se flammene."
          image={heroImg}
        />
        <section className="container mx-auto px-4 py-12">
          <div className="panel rounded-lg p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {data.needsConnect ? "Ingen Homey-tilkobling." : data.error}
            </p>
            <Link
              to="/smarthus"
              className="inline-block mt-4 px-4 py-2 rounded border border-primary text-primary text-xs tracking-[0.3em] uppercase hover:bg-primary/10 transition-colors"
            >
              ✦ Til Smartborg
            </Link>
          </div>
        </section>
      </PageShell>
    );
  }

  const zoneById = new Map(data.zones.map((z) => [z.id, z]));

  const EXTRA_LIGHT_NAME_TOKENS: Array<string[]> = [
    ["garsej", "lys"], // Garsej lys ute (kontakt → utelys langs garasjen)
    ["stålampe"],       // Stålampe i stue (kontakt)
  ];

  const lights: LightDevice[] = useMemo(() => {
    const arr: LightDevice[] = [];
    for (const d of data.devices as HomeyDeviceSnapshot[]) {
      const isLight = d.class === "light";
      const hasOnOff = "onoff" in d.capabilities;
      const hasDim = "dim" in d.capabilities;
      const nameLc = (d.name ?? "").toLowerCase();
      const isExtraLight =
        hasOnOff &&
        EXTRA_LIGHT_NAME_TOKENS.some((tokens) => tokens.every((t) => nameLc.includes(t)));
      // Inkluder alt som er lys, alt med dimmer, og spesifikke navngitte kontakter
      if (!isLight && !hasDim && !isExtraLight) continue;
      const ov = overrides[d.id] ?? {};
      const on =
        typeof ov.on === "boolean"
          ? ov.on
          : d.capabilities["onoff"]?.value === true;
      const dimVal =
        typeof ov.dim === "number"
          ? ov.dim
          : typeof d.capabilities["dim"]?.value === "number"
            ? (d.capabilities["dim"]?.value as number)
            : null;
      const hasHue = "light_hue" in d.capabilities;
      const hasSat = "light_saturation" in d.capabilities;
      const hasTemp = "light_temperature" in d.capabilities;
      const hasMode = "light_mode" in d.capabilities;
      const hueVal =
        typeof ov.hue === "number"
          ? ov.hue
          : typeof d.capabilities["light_hue"]?.value === "number"
            ? (d.capabilities["light_hue"]?.value as number)
            : null;
      const satVal =
        typeof ov.saturation === "number"
          ? ov.saturation
          : typeof d.capabilities["light_saturation"]?.value === "number"
            ? (d.capabilities["light_saturation"]?.value as number)
            : null;
      const tempVal =
        typeof ov.temperature === "number"
          ? ov.temperature
          : typeof d.capabilities["light_temperature"]?.value === "number"
            ? (d.capabilities["light_temperature"]?.value as number)
            : null;
      const modeVal =
        typeof d.capabilities["light_mode"]?.value === "string"
          ? (d.capabilities["light_mode"]?.value as string)
          : null;
      arr.push({
        id: d.id,
        name: d.name,
        zoneId: d.zone ?? null,
        zoneName: d.zone ? zoneById.get(d.zone)?.name ?? "Ukjent sal" : "Ukjent sal",
        on,
        hasOnOff,
        dim: dimVal,
        hasDim,
        isLightClass: isLight,
        hasHue: hasHue && hasSat,
        hue: hueVal,
        saturation: satVal,
        hasTemperature: hasTemp,
        temperature: tempVal,
        hasLightMode: hasMode,
        lightMode: modeVal,
      });
    }
    arr.sort((a, b) => a.name.localeCompare(b.name, "nb"));
    return arr;
  }, [data, overrides, zoneById]);

  const [favoriteZones, setFavoriteZones] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getStoredWho } = await import("@/lib/push-client");
      const { supabase } = await import("@/integrations/supabase/client");
      const w = getStoredWho() || "Alle";
      const { data: row } = await supabase
        .from("user_menu_prefs")
        .select("favorite_zones")
        .eq("who", w)
        .maybeSingle();
      if (cancelled) return;
      const fz = Array.isArray((row as any)?.favorite_zones) ? ((row as any).favorite_zones as string[]) : [];
      setFavoriteZones(fz);
    })();
    const onUpd = () => {
      (async () => {
        const { getStoredWho } = await import("@/lib/push-client");
        const { supabase } = await import("@/integrations/supabase/client");
        const w = getStoredWho() || "Alle";
        const { data: row } = await supabase
          .from("user_menu_prefs")
          .select("favorite_zones")
          .eq("who", w)
          .maybeSingle();
        const fz = Array.isArray((row as any)?.favorite_zones) ? ((row as any).favorite_zones as string[]) : [];
        setFavoriteZones(fz);
      })();
    };
    window.addEventListener("menu-prefs-updated", onUpd);
    return () => { cancelled = true; window.removeEventListener("menu-prefs-updated", onUpd); };
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, LightDevice[]>();
    for (const l of lights) {
      const key = l.zoneName;
      const arr = m.get(key) ?? [];
      arr.push(l);
      m.set(key, arr);
    }
    const entries = Array.from(m.entries());
    const favOrder = new Map(favoriteZones.map((z, i) => [z, i] as const));
    return entries.sort((a, b) => {
      const fa = favOrder.has(a[0]);
      const fb = favOrder.has(b[0]);
      if (fa && !fb) return -1;
      if (fb && !fa) return 1;
      if (fa && fb) return (favOrder.get(a[0]) ?? 0) - (favOrder.get(b[0]) ?? 0);
      // Sort by lit count desc, then name
      const litA = a[1].filter((l) => l.on).length;
      const litB = b[1].filter((l) => l.on).length;
      if (litA !== litB) return litB - litA;
      return a[0].localeCompare(b[0], "nb");
    });
  }, [lights, favoriteZones]);

  const totalLit = lights.filter((l) => l.on).length;
  const totalLights = lights.length;
  const dimmable = lights.filter((l) => l.hasDim).length;

  const sendOnOff = async (id: string, on: boolean) => {
    if (busy[id]) return;
    setBusy((b) => ({ ...b, [id]: true }));
    setOverrides((o) => ({ ...o, [id]: { ...o[id], on } }));
    try {
      const res = await setCap({ data: { deviceId: id, capability: "onoff", value: on } });
      if (!res.ok) {
        setOverrides((o) => {
          const cur = { ...o[id] };
          delete cur.on;
          return { ...o, [id]: cur };
        });
      } else {
        setTimeout(() => router.invalidate(), 1500);
      }
    } finally {
      setBusy((b) => {
        const { [id]: _, ...rest } = b;
        return rest;
      });
    }
  };

  const sendDim = async (id: string, dim: number) => {
    setBusy((b) => ({ ...b, [id]: true }));
    setOverrides((o) => ({ ...o, [id]: { ...o[id], dim, on: dim > 0 } }));
    try {
      await setCap({ data: { deviceId: id, capability: "dim", value: dim } });
      setTimeout(() => router.invalidate(), 1500);
    } finally {
      setBusy((b) => {
        const { [id]: _, ...rest } = b;
        return rest;
      });
    }
  };

  const sendColorCap = async (
    id: string,
    capability: "light_hue" | "light_saturation" | "light_temperature",
    value: number,
  ) => {
    setBusy((b) => ({ ...b, [id]: true }));
    setOverrides((o) => ({
      ...o,
      [id]: {
        ...o[id],
        ...(capability === "light_hue" ? { hue: value } : {}),
        ...(capability === "light_saturation" ? { saturation: value } : {}),
        ...(capability === "light_temperature" ? { temperature: value } : {}),
      },
    }));
    try {
      await setCap({ data: { deviceId: id, capability, value } });
      setTimeout(() => router.invalidate(), 1500);
    } finally {
      setBusy((b) => {
        const { [id]: _, ...rest } = b;
        return rest;
      });
    }
  };

  const toggleZone = async (zoneLights: LightDevice[], on: boolean) => {
    await Promise.all(
      zoneLights.filter((l) => l.hasOnOff).map((l) => sendOnOff(l.id, on)),
    );
  };


  const runScene = async (scene: { device_ids: string[] }, on: boolean) => {
    const ids = scene.device_ids.length > 0 ? new Set(scene.device_ids) : null;
    const targets = lights.filter((l) => l.hasOnOff && (ids === null || ids.has(l.id)));
    await Promise.all(targets.map((l) => sendOnOff(l.id, on)));
  };

  return (
    <PageShell>
      <PageHero
        eyebrow="Krøniken om"
        title="Borgens Ildsteder"
        subtitle={`Alle ${totalLights} lys i borgen — ${totalLit} brenner nå · ${dimmable} kan dempes`}
        image={heroImg}
      />

      {/* Status + 3 scene-bokser */}
      <section className="container mx-auto px-4 pt-6 space-y-3">
        <div
          className="panel rounded-lg p-4 flex items-center gap-3"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--gold) 8%, transparent), var(--gradient-iron))",
            borderColor: "color-mix(in oklab, var(--gold) 30%, transparent)",
          }}
        >
          <Flame
            size={22}
            className="text-primary"
            style={{
              filter: "drop-shadow(0 0 8px color-mix(in oklab, var(--gold) 70%, transparent))",
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-display text-primary text-sm sm:text-base tracking-[0.2em] uppercase">
              {totalLit > 0 ? `${totalLit} ildsteder brenner` : "Mørke i alle saler"}
            </div>
            <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mt-0.5">
              {totalLit} av {totalLights} tent · {grouped.length} saler
            </div>
          </div>
          <Link
            to="/push-varslinger"
            hash="scener"
            className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground hover:text-primary transition-colors shrink-0"
            title="Tilpass scene-knappene"
          >
            ⚙ Endre
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {scenes.map((s) => {
            const sceneLights = s.device_ids.length > 0
              ? lights.filter((l) => l.hasOnOff && s.device_ids.includes(l.id))
              : lights.filter((l) => l.hasOnOff);
            const targetCount = sceneLights.length;
            const litCount = sceneLights.filter((l) => l.on).length;
            const anyOn = litCount > 0;
            const allOn = targetCount > 0 && litCount === targetCount;
            return (
              <div
                key={s.slot}
                className="panel rounded-lg p-2 sm:p-3 flex flex-col gap-1.5 sm:gap-2"
                style={{
                  borderColor: anyOn
                    ? "color-mix(in oklab, var(--gold) 55%, var(--color-border))"
                    : "color-mix(in oklab, var(--gold) 25%, var(--color-border))",
                  background: anyOn
                    ? "linear-gradient(180deg, color-mix(in oklab, var(--gold) 10%, transparent), transparent)"
                    : undefined,
                }}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <Flame
                    size={12}
                    className={anyOn ? "text-primary shrink-0" : "text-muted-foreground/40 shrink-0"}
                    style={anyOn ? {
                      filter: `drop-shadow(0 0 ${4 + (litCount / Math.max(targetCount,1)) * 8}px color-mix(in oklab, var(--gold) ${50 + (litCount / Math.max(targetCount,1)) * 40}%, transparent))`,
                    } : undefined}
                  />
                  <div className="text-display text-[11px] sm:text-sm tracking-[0.15em] uppercase text-foreground truncate">
                    {s.name || `Scene ${s.slot + 1}`}
                  </div>
                </div>
                <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
                  {litCount}/{targetCount}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => runScene(s, true)}
                    className="px-2 py-1.5 rounded text-[10px] sm:text-[11px] tracking-[0.2em] uppercase transition-colors"
                    style={{
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: anyOn
                        ? "color-mix(in oklab, var(--gold) 70%, transparent)"
                        : "color-mix(in oklab, var(--color-primary) 35%, transparent)",
                      color: anyOn ? "var(--gold)" : "var(--color-primary)",
                      background: anyOn
                        ? "color-mix(in oklab, var(--gold) 18%, transparent)"
                        : "transparent",
                      boxShadow: allOn
                        ? "0 0 14px color-mix(in oklab, var(--gold) 55%, transparent)"
                        : anyOn
                          ? "0 0 8px color-mix(in oklab, var(--gold) 35%, transparent)"
                          : undefined,
                    }}
                  >
                    ✦ Tenn
                  </button>
                  <button
                    onClick={() => runScene(s, false)}
                    className="px-2 py-1.5 rounded border border-border text-muted-foreground text-[10px] sm:text-[11px] tracking-[0.2em] uppercase hover:text-foreground transition-colors"
                  >
                    ○ Slokk
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Saler */}
      <section className="container mx-auto px-4 py-8 space-y-4">
        {grouped.map(([zoneName, zoneLights]) => {
          const lit = zoneLights.filter((l) => l.on).length;
          const isCollapsed = collapsed[zoneName] ?? false;
          return (
            <article
              key={zoneName}
              className="panel rounded-lg overflow-hidden"
              style={{
                borderColor: lit > 0
                  ? "color-mix(in oklab, var(--gold) 35%, var(--color-border))"
                  : undefined,
              }}
            >
              <header className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-border/50">
                <button
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [zoneName]: !c[zoneName] }))
                  }
                  className="flex items-center gap-3 flex-1 min-w-0 text-left group"
                >
                  <ChevronDown
                    size={16}
                    className={`text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                  <Flame
                    size={16}
                    className={lit > 0 ? "text-primary" : "text-muted-foreground/50"}
                  />
                  <div className="min-w-0">
                    <div className="text-display text-sm sm:text-base tracking-[0.2em] uppercase text-foreground truncate group-hover:text-primary transition-colors">
                      {zoneName}
                    </div>
                    <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mt-0.5">
                      {lit} / {zoneLights.length} tent
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleZone(zoneLights, true)}
                    className="px-3 py-1.5 rounded border border-primary/30 text-primary text-[10px] tracking-[0.25em] uppercase hover:bg-primary/10 transition-colors"
                  >
                    Tenn
                  </button>
                  <button
                    onClick={() => toggleZone(zoneLights, false)}
                    className="px-3 py-1.5 rounded border border-border text-muted-foreground text-[10px] tracking-[0.25em] uppercase hover:text-foreground transition-colors"
                  >
                    Slokk
                  </button>
                </div>
              </header>

              {!isCollapsed && (
                <ul className="divide-y divide-border/40">
                  {zoneLights.map((l) => {
                    // Brightness 0..1 — uses dim if present, else fully on
                    const brightness = l.on
                      ? l.hasDim && typeof l.dim === "number"
                        ? Math.max(0.08, l.dim)
                        : 1
                      : 0;
                    // Color of the flame: use hue if color bulb is in color mode, else gold
                    const flameColor =
                      l.on && l.hasHue && l.lightMode === "color" && typeof l.hue === "number"
                        ? `hsl(${Math.round(l.hue * 360)} ${Math.round((l.saturation ?? 1) * 100)}% 60%)`
                        : "color-mix(in oklab, var(--gold) 90%, transparent)";
                    const flameSize = 14 + Math.round(brightness * 8);
                    const isColorOpen = colorOpen[l.id] ?? false;
                    return (
                    <li key={l.id} className="p-4 sm:p-5">
                      <div className="flex items-center gap-3">
                        <Flame
                          size={flameSize}
                          className={l.on ? "shrink-0" : "text-muted-foreground/40 shrink-0"}
                          style={
                            l.on
                              ? {
                                  color: flameColor,
                                  filter: `drop-shadow(0 0 ${4 + brightness * 14}px ${flameColor}) drop-shadow(0 0 ${brightness * 6}px ${flameColor})`,
                                  opacity: 0.4 + brightness * 0.6,
                                }
                              : undefined
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {l.hasHue && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] tracking-[0.2em] uppercase shrink-0"
                                style={{
                                  borderColor: "color-mix(in oklab, var(--gold) 40%, transparent)",
                                  color: "color-mix(in oklab, var(--gold) 90%, var(--foreground))",
                                }}
                                title="Fargepære"
                              >
                                <Palette size={9} /> Farge
                              </span>
                            )}
                            {!l.hasHue && l.hasTemperature && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border text-[9px] tracking-[0.2em] uppercase text-muted-foreground shrink-0"
                                title="Varm/kald-pære"
                              >
                                <Thermometer size={9} /> Varm/Kald
                              </span>
                            )}
                            <span className="text-sm text-foreground truncate">{l.name}</span>
                          </div>
                          {l.hasDim && l.dim !== null && (
                            <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mt-0.5">
                              Dempet · {Math.round(l.dim * 100)}%
                            </div>
                          )}
                        </div>
                        {busy[l.id] && (
                          <Loader2 size={14} className="animate-spin text-primary shrink-0" />
                        )}
                        {l.hasOnOff && (
                          <button
                            onClick={() => sendOnOff(l.id, !l.on)}
                            disabled={busy[l.id]}
                            className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full border transition-colors ${
                              l.on
                                ? "border-primary/60 text-primary bg-primary/10 hover:bg-primary/20"
                                : "border-border text-muted-foreground hover:text-foreground"
                            } disabled:opacity-50`}
                            aria-label={l.on ? "Slokk" : "Tenn"}
                            title={l.on ? "Slokk" : "Tenn"}
                          >
                            <Power size={15} />
                          </button>
                        )}
                      </div>

                      {l.hasDim && l.dim !== null && (
                        <div className="mt-3 pl-7">
                          <Slider
                            value={[Math.round(l.dim * 100)]}
                            min={0}
                            max={100}
                            step={1}
                            onValueChange={(v) => {
                              setOverrides((o) => ({
                                ...o,
                                [l.id]: { ...o[l.id], dim: v[0] / 100 },
                              }));
                            }}
                            onValueCommit={(v) => sendDim(l.id, v[0] / 100)}
                            disabled={busy[l.id]}
                          />
                        </div>
                      )}

                      {(l.hasHue || l.hasTemperature) && (
                        <div className="mt-3 pl-7">
                          <button
                            onClick={() =>
                              setColorOpen((c) => ({ ...c, [l.id]: !c[l.id] }))
                            }
                            className="inline-flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Settings2 size={11} />
                            {isColorOpen ? "Skjul farge" : "Endre farge"}
                            <ChevronDown
                              size={11}
                              className={`transition-transform ${isColorOpen ? "rotate-180" : ""}`}
                            />
                          </button>
                          {isColorOpen && (
                            <div className="mt-3 space-y-3 p-3 rounded border border-border/60 bg-muted/20">
                              {l.hasHue && (
                                <>
                                  <div>
                                    <div className="flex items-center justify-between text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-1.5">
                                      <span>Fargetone</span>
                                      <span>{Math.round((l.hue ?? 0) * 360)}°</span>
                                    </div>
                                    <div
                                      className="h-2 w-full rounded mb-2"
                                      style={{
                                        background:
                                          "linear-gradient(to right, hsl(0 90% 55%), hsl(60 90% 55%), hsl(120 90% 55%), hsl(180 90% 55%), hsl(240 90% 55%), hsl(300 90% 55%), hsl(360 90% 55%))",
                                      }}
                                    />
                                    <Slider
                                      value={[Math.round((l.hue ?? 0) * 360)]}
                                      min={0}
                                      max={360}
                                      step={1}
                                      onValueChange={(v) =>
                                        setOverrides((o) => ({
                                          ...o,
                                          [l.id]: { ...o[l.id], hue: v[0] / 360 },
                                        }))
                                      }
                                      onValueCommit={(v) =>
                                        sendColorCap(l.id, "light_hue", v[0] / 360)
                                      }
                                      disabled={busy[l.id]}
                                    />
                                  </div>
                                  <div>
                                    <div className="flex items-center justify-between text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-1.5">
                                      <span>Metning</span>
                                      <span>{Math.round((l.saturation ?? 0) * 100)}%</span>
                                    </div>
                                    <Slider
                                      value={[Math.round((l.saturation ?? 1) * 100)]}
                                      min={0}
                                      max={100}
                                      step={1}
                                      onValueChange={(v) =>
                                        setOverrides((o) => ({
                                          ...o,
                                          [l.id]: { ...o[l.id], saturation: v[0] / 100 },
                                        }))
                                      }
                                      onValueCommit={(v) =>
                                        sendColorCap(l.id, "light_saturation", v[0] / 100)
                                      }
                                      disabled={busy[l.id]}
                                    />
                                  </div>
                                </>
                              )}
                              {l.hasTemperature && (
                                <div>
                                  <div className="flex items-center justify-between text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-1.5">
                                    <span>Varm ↔ Kald</span>
                                    <span>{Math.round((l.temperature ?? 0) * 100)}%</span>
                                  </div>
                                  <div
                                    className="h-2 w-full rounded mb-2"
                                    style={{
                                      background:
                                        "linear-gradient(to right, #ffb86b, #fff1d6, #cfe4ff)",
                                    }}
                                  />
                                  <Slider
                                    value={[Math.round((l.temperature ?? 0.5) * 100)]}
                                    min={0}
                                    max={100}
                                    step={1}
                                    onValueChange={(v) =>
                                      setOverrides((o) => ({
                                        ...o,
                                        [l.id]: { ...o[l.id], temperature: v[0] / 100 },
                                      }))
                                    }
                                    onValueCommit={(v) =>
                                      sendColorCap(l.id, "light_temperature", v[0] / 100)
                                    }
                                    disabled={busy[l.id]}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
        {grouped.length === 0 && (
          <div className="panel rounded-lg p-6 text-center text-sm text-muted-foreground">
            Fant ingen lys eller dimmere i borgen.
          </div>
        )}
      </section>
    </PageShell>
  );
}
