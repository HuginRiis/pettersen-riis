import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, Save, Search, Loader2, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredWho } from "@/lib/push-client";
import { getHomeySnapshot, type HomeyDeviceSnapshot } from "@/server/homey";

type Scene = {
  slot: number;
  name: string;
  device_ids: string[];
};

const DEFAULTS: Scene[] = [
  { slot: 0, name: "Tenn alle", device_ids: [] },
  { slot: 1, name: "Stua", device_ids: [] },
  { slot: 2, name: "Utelys", device_ids: [] },
];

const EXTRA_TOKENS: string[][] = [["garsej", "lys"], ["stålampe"]];

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
  const [devices, setDevices] = useState<{ id: string; name: string; zoneName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [openSlot, setOpenSlot] = useState<number | null>(null);

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
          }))
          .sort((a, b) => a.zoneName.localeCompare(b.zoneName, "nb") || a.name.localeCompare(b.name, "nb"));
        setDevices(list);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [fetchSnap]);

  // Load scenes for current user
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_light_scenes")
        .select("slot, name, device_ids")
        .eq("who", who)
        .order("slot");
      if (cancelled) return;
      const map = new Map<number, Scene>();
      for (const d of DEFAULTS) map.set(d.slot, { ...d });
      for (const r of (data ?? []) as Scene[]) {
        map.set(r.slot, {
          slot: r.slot,
          name: r.name ?? `Scene ${r.slot + 1}`,
          device_ids: Array.isArray(r.device_ids) ? r.device_ids : [],
        });
      }
      setScenes([0, 1, 2].map((s) => map.get(s)!));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [who]);

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

  const saveScene = async (slot: number) => {
    const scene = scenes.find((s) => s.slot === slot);
    if (!scene) return;
    setSavingSlot(slot);
    await supabase.from("user_light_scenes").upsert(
      {
        who,
        slot,
        name: scene.name,
        device_ids: scene.device_ids,
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
          <Lightbulb size={18} className="text-primary" /> Lys-scener — 3 hurtigknapper
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Tre knapper på toppen av Lys-siden. Tilpass navn og hvilke lys hver knapp styrer.
          Lagres for <span className="text-primary">{who}</span>.
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
                              return (
                                <li key={d.id}>
                                  <label className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-primary">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleDevice(s.slot, d.id)}
                                    />
                                    <span className="truncate">{d.name}</span>
                                  </label>
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
