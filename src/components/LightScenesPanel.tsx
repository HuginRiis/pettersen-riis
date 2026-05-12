import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, Save, Search, Loader2, Settings2, Globe2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredWho } from "@/lib/push-client";
import { getHomeySnapshot, type HomeyDeviceSnapshot } from "@/server/homey";
import { useMenuPrefs } from "@/hooks/use-menu-prefs";

type Scene = {
  slot: number;
  name: string;
  device_ids: string[];
  device_levels: Record<string, number>; // device id -> dim percent (0-100)
};

const DEFAULT_NAMES: Record<number, string> = {
  0: "Tenn alle",
  1: "Stua",
  2: "Utelys",
};
const SCENE_COUNT = 12;
const DEFAULTS: Scene[] = Array.from({ length: SCENE_COUNT }, (_, i) => ({
  slot: i,
  name: DEFAULT_NAMES[i] ?? `Scene ${i + 1}`,
  device_ids: [],
  device_levels: {},
}));
const SCENE_SLOTS = Array.from({ length: SCENE_COUNT }, (_, i) => i);

const EXTRA_TOKENS: string[][] = [["garsej", "lys"], ["stålampe"], ["taklys"]];

function isLightLike(d: HomeyDeviceSnapshot): boolean {
  if (d.class === "light") return true;
  if ("dim" in d.capabilities) return true;
  const nm = (d.name ?? "").toLowerCase();
  const hasOn = "onoff" in d.capabilities;
  if (hasOn && EXTRA_TOKENS.some((toks) => toks.every((t) => nm.includes(t)))) return true;
  return false;
}

export function LightScenesPanel() {
  const fetchSnap = useServerFn(getHomeySnapshot);
  const [who, setWho] = useState<string>("Alle");
  const [scenes, setScenes] = useState<Scene[]>(DEFAULTS);
  const [devices, setDevices] = useState<{ id: string; name: string; zoneName: string; hasDim: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [openSlot, setOpenSlot] = useState<number | null>(null);

  const targetWho = "__GLOBAL__";

  useEffect(() => {
    setWho(getStoredWho() || "Alle");
  }, []);

  // Load Homey snapshot
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await fetchSnap();
        if (cancelled || !snap.ok) return;
        const zoneById = new Map(snap.zones.map((z) => [z.id, z.name]));
        const list = (snap.devices as HomeyDeviceSnapshot[])
          .filter(isLightLike)
          .map((d) => ({
            id: d.id,
            name: d.name,
            zoneName: d.zone ? zoneById.get(d.zone) ?? "Ukjent sal" : "Ukjent sal",
            hasDim: "dim" in d.capabilities,
          }))
          .sort((a, b) => a.zoneName.localeCompare(b.zoneName, "nb") || a.name.localeCompare(b.name, "nb"));
        setDevices(list);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [fetchSnap]);

  // Load scenes for current target (user or global)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_light_scenes")
        .select("slot, name, device_ids, device_levels")
        .eq("who", targetWho)
        .order("slot");
      if (cancelled) return;
      const map = new Map<number, Scene>();
      for (const d of DEFAULTS) map.set(d.slot, { ...d, device_levels: { ...d.device_levels } });
      for (const r of (data ?? []) as any[]) {
        map.set(r.slot, {
          slot: r.slot,
          name: r.name ?? `Scene ${r.slot + 1}`,
          device_ids: Array.isArray(r.device_ids) ? r.device_ids : [],
          device_levels: (r.device_levels && typeof r.device_levels === "object") ? r.device_levels : {},
        });
      }
      setScenes(SCENE_SLOTS.map((s) => map.get(s)!));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [targetWho]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? devices.filter((d) =>
          d.name.toLowerCase().includes(q) || d.zoneName.toLowerCase().includes(q),
        )
      : devices;
    const m = new Map<string, typeof devices>();
    for (const d of filtered) {
      const arr = m.get(d.zoneName) ?? [];
      arr.push(d);
      m.set(d.zoneName, arr);
    }
    return Array.from(m.entries());
  }, [devices, search]);

  const updateScene = (slot: number, patch: Partial<Scene>) => {
    setScenes((prev) => prev.map((s) => (s.slot === slot ? { ...s, ...patch } : s)));
  };

  const toggleDevice = (slot: number, id: string) => {
    setScenes((prev) =>
      prev.map((s) => {
        if (s.slot !== slot) return s;
        const has = s.device_ids.includes(id);
        return { ...s, device_ids: has ? s.device_ids.filter((x) => x !== id) : [...s.device_ids, id] };
      }),
    );
  };

  const setLevel = (slot: number, id: string, pct: number) => {
    setScenes((prev) =>
      prev.map((s) => {
        if (s.slot !== slot) return s;
        const next = { ...s.device_levels };
        const clamped = Math.max(1, Math.min(100, Math.round(pct)));
        next[id] = clamped;
        return { ...s, device_levels: next };
      }),
    );
  };

  const saveScene = async (slot: number) => {
    const scene = scenes.find((s) => s.slot === slot);
    if (!scene) return;
    setSavingSlot(slot);
    // Behold kun nivåer for valgte enheter
    const cleanedLevels: Record<string, number> = {};
    for (const id of scene.device_ids) {
      if (scene.device_levels[id] != null) cleanedLevels[id] = scene.device_levels[id];
    }
    await supabase.from("user_light_scenes").upsert(
      {
        who: targetWho,
        slot,
        name: scene.name,
        device_ids: scene.device_ids,
        device_levels: cleanedLevels,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "who,slot" },
    );
    setSavingSlot(null);
  };

  const selectAll = (slot: number) => updateScene(slot, { device_ids: devices.map((d) => d.id) });
  const clearAll = (slot: number) => updateScene(slot, { device_ids: [] });

  return (
    <section id="scener" className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4">
        <h3 className="text-foreground font-semibold flex items-center gap-2">
          <Lightbulb size={18} className="text-primary" /> Lys-scener — 12 hurtigknapper
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Tolv knapper på Lys-siden (4 rader á 3). Tilpass navn og hvilke lys hver knapp styrer.
          Lagres <span className="text-primary">globalt for alle</span>.
        </p>

        {loading && <div className="text-xs text-muted-foreground mt-3">Laster…</div>}

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {scenes.map((s) => {
            const count = s.device_ids.length;
            const isOpen = openSlot === s.slot;
            return (
              <div key={s.slot} className="rounded-lg border border-border bg-card/30 p-3 flex flex-col gap-2">
                <input
                  value={s.name}
                  onChange={(e) => updateScene(s.slot, { name: e.target.value })}
                  className="px-2 py-1.5 rounded bg-background border border-border text-sm font-semibold"
                  placeholder={`Scene ${s.slot + 1}`}
                />
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                  {count === 0 ? "Alle lys (standard)" : `${count} valgte lys`}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setOpenSlot(isOpen ? null : s.slot)}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-border hover:border-primary/60"
                  >
                    <Settings2 size={11} />
                    {isOpen ? "Skjul" : "Velg lys"}
                  </button>
                  <button
                    onClick={() => saveScene(s.slot)}
                    disabled={savingSlot === s.slot}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50 ml-auto"
                  >
                    {savingSlot === s.slot ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                    Lagre
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => selectAll(s.slot)}
                        className="text-[10px] px-2 py-0.5 rounded border border-border hover:border-primary/60 text-muted-foreground"
                      >
                        Velg alle
                      </button>
                      <button
                        onClick={() => clearAll(s.slot)}
                        className="text-[10px] px-2 py-0.5 rounded border border-border hover:border-primary/60 text-muted-foreground"
                      >
                        Tøm
                      </button>
                    </div>
                    <div className="relative">
                      <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Søk lys..."
                        className="w-full pl-7 pr-2 py-1 rounded bg-background border border-border text-xs"
                      />
                    </div>
                    <div className="max-h-64 overflow-auto rounded border border-border bg-background/50 p-2 space-y-2">
                      {grouped.map(([zone, list]) => (
                        <div key={zone}>
                          <div className="text-[9px] tracking-[0.25em] uppercase text-primary mb-1">{zone}</div>
                          <ul className="space-y-0.5">
                            {list.map((d) => {
                              const checked = s.device_ids.includes(d.id);
                              const lvl = s.device_levels[d.id] ?? 100;
                              return (
                                <li key={d.id} className="space-y-1">
                                  <label className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-primary">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleDevice(s.slot, d.id)}
                                    />
                                    <span className="truncate flex-1">{d.name}</span>
                                    {checked && d.hasDim && (
                                      <span className="text-[10px] text-primary tabular-nums shrink-0">{lvl}%</span>
                                    )}
                                  </label>
                                  {checked && d.hasDim && (
                                    <input
                                      type="range"
                                      min={1}
                                      max={100}
                                      value={lvl}
                                      onChange={(e) => setLevel(s.slot, d.id, Number(e.target.value))}
                                      className="w-full h-1 accent-primary cursor-pointer ml-5"
                                      title={`Dim ${d.name} til ${lvl}%`}
                                    />
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                      {grouped.length === 0 && (
                        <div className="text-[11px] text-muted-foreground text-center py-2">Ingen treff.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
