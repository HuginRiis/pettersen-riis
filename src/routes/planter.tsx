import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { analyzePlantImage, generatePlantReference, searchPlantContext, getMiFloraDevices, reverseGeocode, type PlantAnalysis, type MiFloraDevice } from "@/server/plants.functions";
import { Camera, Loader2, MapPin, Droplet, Sun, Thermometer, Sprout, AlertTriangle, Check, X, Sparkles, Trash2, Plus, BellRing, BellOff } from "lucide-react";
import heroImg from "@/assets/got-plants.jpg";

export const Route = createFileRoute("/planter")({
  component: PlanterPage,
  head: () => ({
    meta: [
      { title: "Planter & Trær | House Pettersen Riis" },
      { name: "description", content: "Identifiser planter og trær med AI, sjekk om de er spiselige eller giftige, koble til Mi Flora-sensor og få varsel om vanning, gjødsling og høsting." },
      { property: "og:title", content: "Planter & Trær" },
      { property: "og:description", content: "AI-identifikasjon, Mi Flora-sensor og varslinger for planter og trær." },
    ],
  }),
});

type Plant = {
  id: string;
  name: string;
  species_common: string | null;
  species_latin: string | null;
  kind: string;
  edible: boolean | null;
  toxicity: string;
  toxicity_notes: string | null;
  care_summary: string | null;
  where_grows: string | null;
  watering_days_interval: number | null;
  fertilize_weeks_interval: number | null;
  season_start_month: number | null;
  season_end_month: number | null;
  miflora_device_id: string | null;
  miflora_device_name: string | null;
  soil_moisture_min: number | null;
  light_lux_min: number | null;
  temp_min: number | null;
  temp_max: number | null;
  notify_watering: boolean;
  notify_fertilize: boolean;
  notify_sensor: boolean;
  notify_season: boolean;
  last_watered_at: string | null;
  last_fertilized_at: string | null;
  cover_photo_url: string | null;
  ai_reference_image_url: string | null;
  created_at: string;
};

type Photo = {
  id: string;
  plant_id: string;
  photo_url: string;
  taken_at: string;
  lat: number | null;
  lon: number | null;
  location_label: string | null;
  is_ai_generated: boolean;
  notes: string | null;
};

function PlanterPage() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [floras, setFloras] = useState<MiFloraDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureState | null>(null);

  const loadFloras = useServerFn(getMiFloraDevices);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("plants").select("*").order("created_at", { ascending: false });
    setPlants((data ?? []) as Plant[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    loadFloras().then((d) => setFloras(d ?? [])).catch(() => setFloras([]));
  }, [loadFloras]);

  return (
    <PageShell>
      <PageHero
        eyebrow="Borgens hage"
        title="Planter & Trær"
        subtitle="Ta bilde av en plante eller tre — AI sjekker om den er spiselig, giftig, hvor den vokser, og hvordan du steller den. Mi Flora-sensorer kobles automatisk fra Homey."
        image={heroImg}
      />

      <section className="container mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-display text-primary text-sm tracking-[0.3em] uppercase">Mine planter</h2>
            <p className="text-xs text-muted-foreground mt-1">{plants.length} registrert · {floras.length} Mi Flora-sensor{floras.length === 1 ? "" : "er"} funnet</p>
          </div>
          <CameraButton onCaptured={(s) => setCapture(s)} />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="animate-spin" size={16} /> Henter planter…</div>
        ) : plants.length === 0 ? (
          <div className="panel rounded-lg p-8 text-center text-muted-foreground text-sm">
            <Sprout className="mx-auto mb-3 text-primary" size={32} />
            Ingen planter ennå. Trykk «Ta bilde» for å identifisere din første.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plants.map((p) => (
              <PlantCard key={p.id} plant={p} flora={floras.find((f) => f.id === p.miflora_device_id) ?? null} onOpen={() => setOpenId(p.id)} />
            ))}
          </div>
        )}
      </section>

      {capture && (
        <CaptureDialog
          state={capture}
          floras={floras}
          onClose={() => setCapture(null)}
          onSaved={() => { setCapture(null); void load(); }}
        />
      )}

      {openId && (
        <PlantDetailDialog
          plantId={openId}
          floras={floras}
          onClose={() => setOpenId(null)}
          onChanged={() => void load()}
        />
      )}
    </PageShell>
  );
}

// ============ Plant card ============

function PlantCard({ plant, flora, onOpen }: { plant: Plant; flora: MiFloraDevice | null; onOpen: () => void }) {
  const daysSinceWater = plant.last_watered_at ? Math.floor((Date.now() - new Date(plant.last_watered_at).getTime()) / 86400000) : null;
  const waterDue = plant.watering_days_interval && daysSinceWater !== null && daysSinceWater >= plant.watering_days_interval;

  return (
    <button onClick={onOpen} className="panel rounded-lg overflow-hidden border border-border/60 hover:border-primary/60 transition text-left">
      <div className="aspect-[4/3] bg-muted relative">
        {plant.cover_photo_url ? (
          <img src={plant.cover_photo_url} alt={plant.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Sprout size={48} className="text-muted-foreground/40" /></div>
        )}
        <ToxicityBadge edible={plant.edible} toxicity={plant.toxicity} />
      </div>
      <div className="p-3">
        <div className="font-semibold text-foreground truncate">{plant.name}</div>
        {plant.species_latin && <div className="text-[10px] italic text-muted-foreground truncate">{plant.species_latin}</div>}
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {flora && (
            <>
              {flora.soilMoisture !== null && <Pill icon={Droplet} label={`${Math.round(flora.soilMoisture)}%`} color={flora.soilMoisture < (plant.soil_moisture_min ?? 20) ? "text-orange-400" : "text-cyan-400"} />}
              {flora.light !== null && <Pill icon={Sun} label={`${Math.round(flora.light)} lx`} color="text-amber-400" />}
              {flora.temperature !== null && <Pill icon={Thermometer} label={`${flora.temperature.toFixed(1)}°`} color="text-rose-400" />}
            </>
          )}
          {waterDue && <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-semibold">Trenger vann</span>}
        </div>
      </div>
    </button>
  );
}

function Pill({ icon: Icon, label, color }: { icon: any; label: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background/60 ${color}`}>
      <Icon size={10} /> {label}
    </span>
  );
}

function ToxicityBadge({ edible, toxicity }: { edible: boolean | null; toxicity: string }) {
  if (toxicity === "severe" || toxicity === "moderate") {
    return <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><AlertTriangle size={10} /> Giftig</span>;
  }
  if (edible === true) {
    return <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Check size={10} /> Spiselig</span>;
  }
  if (toxicity === "mild") {
    return <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider">Mild gift</span>;
  }
  return null;
}

// ============ Capture ============

type CaptureState = {
  file: File;
  previewUrl: string;
  uploadUrl?: string;
  lat?: number | null;
  lon?: number | null;
  analysis?: PlantAnalysis;
  status: "uploading" | "analyzing" | "ready" | "error";
  error?: string;
};

function CameraButton({ onCaptured }: { onCaptured: (s: CaptureState) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handle = async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    const state: CaptureState = { file, previewUrl, status: "uploading" };
    onCaptured(state);
  };
  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow hover:opacity-90"
      >
        <Camera size={16} /> Ta bilde / last opp
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

function CaptureDialog({ state, floras, onClose, onSaved }: { state: CaptureState; floras: MiFloraDevice[]; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<CaptureState>(state);
  const [name, setName] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [mifloraId, setMifloraId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const analyze = useServerFn(analyzePlantImage);
  const genRef = useServerFn(generatePlantReference);

  useEffect(() => {
    (async () => {
      try {
        // GPS
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 60000 }),
          );
          setS((p) => ({ ...p, lat: pos.coords.latitude, lon: pos.coords.longitude }));
        } catch { /* ignore */ }

        // Upload
        const ext = s.file.name.split(".").pop() ?? "jpg";
        const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from("plants").upload(path, s.file, { contentType: s.file.type });
        if (error) throw error;
        const { data: pub } = supabase.storage.from("plants").getPublicUrl(path);
        const uploadUrl = pub.publicUrl;

        setS((p) => ({ ...p, uploadUrl, status: "analyzing" }));

        const analysis = await analyze({ data: { imageUrl: uploadUrl } });
        setS((p) => ({ ...p, analysis, status: "ready" }));
        setName(analysis.species_common ?? "Ny plante");
      } catch (e) {
        setS((p) => ({ ...p, status: "error", error: e instanceof Error ? e.message : "Feilet" }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!s.analysis || !s.uploadUrl) return;
    setSaving(true);
    try {
      const a = s.analysis;
      const flora = floras.find((f) => f.id === mifloraId);
      const { data: plant, error } = await supabase
        .from("plants")
        .insert({
          name: name || "Ukjent plante",
          species_common: a.species_common,
          species_latin: a.species_latin,
          kind: a.kind,
          edible: a.edible,
          toxicity: a.toxicity,
          toxicity_notes: a.toxicity_notes,
          care_summary: a.care_summary,
          where_grows: a.where_grows,
          watering_days_interval: a.watering_days_interval,
          fertilize_weeks_interval: a.fertilize_weeks_interval,
          season_start_month: a.season_start_month,
          season_end_month: a.season_end_month,
          miflora_device_id: flora?.id ?? null,
          miflora_device_name: flora?.name ?? null,
          cover_photo_url: s.uploadUrl,
          ai_raw: a as never,
        })
        .select()
        .single();
      if (error) throw error;
      await supabase.from("plant_photos").insert({
        plant_id: plant.id,
        photo_url: s.uploadUrl,
        lat: s.lat ?? null,
        lon: s.lon ?? null,
        location_label: locationLabel || null,
      });
      // Fire-and-forget AI reference
      if (a.species_common || a.species_latin) {
        genRef({ data: { plantId: plant.id, species: a.species_latin ?? a.species_common ?? name } }).catch(() => {});
      }
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Kunne ikke lagre");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell onClose={onClose} title="Identifiser plante">
      <div className="grid md:grid-cols-2 gap-4">
        <img src={s.previewUrl} alt="" className="w-full rounded-lg object-cover aspect-[4/3]" />
        <div className="space-y-3">
          {s.status === "uploading" && <StatusLine icon={Loader2} text="Laster opp bilde…" spin />}
          {s.status === "analyzing" && <StatusLine icon={Sparkles} text="AI analyserer planten…" spin />}
          {s.status === "error" && <div className="text-red-400 text-sm">{s.error}</div>}
          {s.status === "ready" && s.analysis && (
            <>
              <AnalysisView a={s.analysis} />
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Navn (din etikett)</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 px-3 py-2 rounded bg-background border border-border text-sm" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sted (valgfritt)</label>
                <input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} placeholder="f.eks. Hagen ved hytta" className="w-full mt-1 px-3 py-2 rounded bg-background border border-border text-sm" />
                {s.lat && s.lon && (
                  <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1"><MapPin size={10} /> {s.lat.toFixed(4)}, {s.lon.toFixed(4)}</p>
                )}
              </div>
              {floras.length > 0 && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Mi Flora-sensor (valgfritt)</label>
                  <select value={mifloraId} onChange={(e) => setMifloraId(e.target.value)} className="w-full mt-1 px-3 py-2 rounded bg-background border border-border text-sm">
                    <option value="">— Ingen —</option>
                    {floras.map((f) => <option key={f.id} value={f.id}>{f.name}{f.zone ? ` (${f.zone})` : ""}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={onClose} className="px-3 py-2 rounded border border-border text-sm">Avbryt</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 px-3 py-2 rounded bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">
                  {saving ? "Lagrer…" : "Lagre plante"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </DialogShell>
  );
}

function StatusLine({ icon: Icon, text, spin }: { icon: any; text: string; spin?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon size={16} className={spin ? "animate-spin" : "text-primary"} /> {text}
    </div>
  );
}

function AnalysisView({ a }: { a: PlantAnalysis }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="font-semibold text-foreground">{a.species_common ?? "Ukjent art"}</div>
          {a.species_latin && <div className="text-[11px] italic text-muted-foreground">{a.species_latin}</div>}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.confidence} tillit</span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <span className="px-1.5 py-0.5 rounded bg-muted">{a.kind}</span>
        {a.edible === true && <span className="px-1.5 py-0.5 rounded bg-emerald-600/30 text-emerald-300">Spiselig</span>}
        {a.edible === false && <span className="px-1.5 py-0.5 rounded bg-red-600/30 text-red-300">Ikke spis</span>}
        {a.toxicity !== "none" && a.toxicity !== "unknown" && <span className="px-1.5 py-0.5 rounded bg-amber-600/30 text-amber-300">Gift: {a.toxicity}</span>}
      </div>
      {a.warning && <div className="text-xs text-red-400 flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {a.warning}</div>}
      {a.toxicity_notes && <p className="text-xs text-muted-foreground">{a.toxicity_notes}</p>}
      {a.care_summary && <p className="text-xs text-foreground/80"><strong>Stell:</strong> {a.care_summary}</p>}
      {a.where_grows && <p className="text-xs text-foreground/80"><strong>Vokser:</strong> {a.where_grows}</p>}
      <p className="text-[10px] text-amber-400/80 italic">⚠ AI-forslag — sjekk alltid selv før du spiser noe fra naturen.</p>
    </div>
  );
}

// ============ Detail dialog ============

function PlantDetailDialog({ plantId, floras, onClose, onChanged }: { plantId: string; floras: MiFloraDevice[]; onClose: () => void; onChanged: () => void }) {
  const [plant, setPlant] = useState<Plant | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [context, setContext] = useState<string | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(false);
  const ctx = useServerFn(searchPlantContext);
  const genRef = useServerFn(generatePlantReference);

  const refresh = async () => {
    const [p, ph] = await Promise.all([
      supabase.from("plants").select("*").eq("id", plantId).single(),
      supabase.from("plant_photos").select("*").eq("plant_id", plantId).order("taken_at", { ascending: false }),
    ]);
    setPlant(p.data as Plant);
    setPhotos((ph.data ?? []) as Photo[]);
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [plantId]);

  const update = async (patch: Partial<Plant>) => {
    await supabase.from("plants").update(patch as never).eq("id", plantId);
    await refresh();
    onChanged();
  };

  const wateredNow = () => update({ last_watered_at: new Date().toISOString() } as Partial<Plant>);
  const fertilizedNow = () => update({ last_fertilized_at: new Date().toISOString() } as Partial<Plant>);

  const remove = async () => {
    if (!confirm("Slette denne planten og alle bilder?")) return;
    await supabase.from("plants").delete().eq("id", plantId);
    onChanged();
    onClose();
  };

  const fetchContext = async () => {
    if (!plant?.species_latin && !plant?.species_common) return;
    setLoadingCtx(true);
    try {
      const photo = photos.find((p) => p.lat && p.lon);
      const r = await ctx({ data: { species: plant.species_latin ?? plant.species_common ?? plant.name, lat: photo?.lat ?? null, lon: photo?.lon ?? null } });
      setContext(r.text);
    } catch (e) {
      setContext(e instanceof Error ? e.message : "Feilet");
    } finally {
      setLoadingCtx(false);
    }
  };

  const generateRef = async () => {
    if (!plant) return;
    await genRef({ data: { plantId: plant.id, species: plant.species_latin ?? plant.species_common ?? plant.name } });
    await refresh();
  };

  if (!plant) return <DialogShell onClose={onClose} title="Laster…"><Loader2 className="animate-spin" /></DialogShell>;

  const flora = floras.find((f) => f.id === plant.miflora_device_id) ?? null;

  return (
    <DialogShell onClose={onClose} title={plant.name}>
      <div className="space-y-5">
        {/* Cover */}
        {plant.cover_photo_url && (
          <div className="relative">
            <img src={plant.cover_photo_url} alt="" className="w-full rounded-lg max-h-72 object-cover" />
            <ToxicityBadge edible={plant.edible} toxicity={plant.toxicity} />
          </div>
        )}

        {/* Quick facts */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-[10px] uppercase text-muted-foreground">Art</div>{plant.species_common ?? "—"}</div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Latin</div><em>{plant.species_latin ?? "—"}</em></div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Type</div>{plant.kind}</div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Spiselig</div>{plant.edible === true ? "Ja" : plant.edible === false ? "Nei" : "Usikker"}</div>
        </div>

        {plant.toxicity_notes && <Panel title="⚠ Giftighet" tone="warn">{plant.toxicity_notes}</Panel>}
        {plant.care_summary && <Panel title="🌱 Stell">{plant.care_summary}</Panel>}
        {plant.where_grows && <Panel title="📍 Hvor vokser den">{plant.where_grows}</Panel>}

        {/* Mi Flora */}
        {flora && (
          <Panel title={`🌿 Mi Flora — ${flora.name}`}>
            <div className="grid grid-cols-4 gap-2 text-xs mt-1">
              <FloraStat icon={Droplet} label="Jord" value={flora.soilMoisture !== null ? `${Math.round(flora.soilMoisture)}%` : "—"} />
              <FloraStat icon={Sun} label="Lys" value={flora.light !== null ? `${Math.round(flora.light)} lx` : "—"} />
              <FloraStat icon={Thermometer} label="Temp" value={flora.temperature !== null ? `${flora.temperature.toFixed(1)}°` : "—"} />
              <FloraStat icon={Sprout} label="Næring" value={flora.fertility !== null ? `${Math.round(flora.fertility)}` : "—"} />
            </div>
          </Panel>
        )}

        {!flora && floras.length > 0 && (
          <Panel title="Koble til Mi Flora">
            <select
              onChange={(e) => {
                const f = floras.find((x) => x.id === e.target.value);
                update({ miflora_device_id: f?.id ?? null, miflora_device_name: f?.name ?? null } as Partial<Plant>);
              }}
              value={plant.miflora_device_id ?? ""}
              className="w-full mt-1 px-3 py-2 rounded bg-background border border-border text-sm"
            >
              <option value="">— Ingen sensor —</option>
              {floras.map((f) => <option key={f.id} value={f.id}>{f.name}{f.zone ? ` (${f.zone})` : ""}</option>)}
            </select>
          </Panel>
        )}

        {/* Photos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Bilder ({photos.length})</h3>
            <button onClick={generateRef} className="text-xs text-primary hover:underline flex items-center gap-1"><Sparkles size={12} /> AI-illustrasjon</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((ph) => (
              <div key={ph.id} className="relative group">
                <img src={ph.photo_url} alt="" className="w-full aspect-square object-cover rounded" loading="lazy" />
                {ph.is_ai_generated && <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-purple-600/80 text-white text-[8px] uppercase">AI</span>}
                {ph.lat && ph.lon && (
                  <a href={`https://www.google.com/maps?q=${ph.lat},${ph.lon}`} target="_blank" rel="noreferrer" className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/60 text-white text-[8px] flex items-center gap-0.5">
                    <MapPin size={8} /> kart
                  </a>
                )}
                <button
                  onClick={async () => { await supabase.from("plant_photos").delete().eq("id", ph.id); await refresh(); }}
                  className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"
                  aria-label="Slett"
                ><X size={10} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Context search */}
        <Panel title="Hva er spiselig & hvor vokser den">
          {context ? (
            <p className="text-sm whitespace-pre-wrap">{context}</p>
          ) : (
            <button onClick={fetchContext} disabled={loadingCtx} className="text-sm text-primary hover:underline flex items-center gap-1">
              {loadingCtx ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />} Søk relatert info
            </button>
          )}
        </Panel>

        {/* Care actions */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={wateredNow} className="px-3 py-2 rounded bg-cyan-600/30 text-cyan-200 text-sm flex items-center justify-center gap-1.5"><Droplet size={14} /> Vannet nå</button>
          <button onClick={fertilizedNow} className="px-3 py-2 rounded bg-emerald-600/30 text-emerald-200 text-sm flex items-center justify-center gap-1.5"><Sprout size={14} /> Gjødslet nå</button>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          {plant.last_watered_at && <div>Sist vannet: {new Date(plant.last_watered_at).toLocaleString("nb-NO")}</div>}
          {plant.last_fertilized_at && <div>Sist gjødslet: {new Date(plant.last_fertilized_at).toLocaleString("nb-NO")}</div>}
        </div>

        {/* Intervals */}
        <Panel title="Intervaller">
          <div className="grid grid-cols-2 gap-3 mt-1">
            <NumField label="Vanning hver X dag" value={plant.watering_days_interval} onChange={(v) => update({ watering_days_interval: v } as Partial<Plant>)} />
            <NumField label="Gjødsling hver X uke" value={plant.fertilize_weeks_interval} onChange={(v) => update({ fertilize_weeks_interval: v } as Partial<Plant>)} />
            <NumField label="Sesong start (md)" value={plant.season_start_month} onChange={(v) => update({ season_start_month: v } as Partial<Plant>)} />
            <NumField label="Sesong slutt (md)" value={plant.season_end_month} onChange={(v) => update({ season_end_month: v } as Partial<Plant>)} />
          </div>
        </Panel>

        {/* Notifications */}
        <Panel title="🔔 Varslinger">
          <div className="space-y-2 mt-1">
            <NotifToggle label="Vanning" on={plant.notify_watering} onChange={(v) => update({ notify_watering: v } as Partial<Plant>)} />
            <NotifToggle label="Gjødsling" on={plant.notify_fertilize} onChange={(v) => update({ notify_fertilize: v } as Partial<Plant>)} />
            <NotifToggle label="Mi Flora-advarsler (lav fukt, lite lys, temp)" on={plant.notify_sensor} onChange={(v) => update({ notify_sensor: v } as Partial<Plant>)} />
            <NotifToggle label="Sesong/høsting" on={plant.notify_season} onChange={(v) => update({ notify_season: v } as Partial<Plant>)} />
          </div>
        </Panel>

        {plant.notify_sensor && flora && (
          <Panel title="Sensor-terskler">
            <div className="grid grid-cols-2 gap-3 mt-1">
              <NumField label="Jord min %" value={plant.soil_moisture_min} onChange={(v) => update({ soil_moisture_min: v } as Partial<Plant>)} />
              <NumField label="Lys min lx" value={plant.light_lux_min} onChange={(v) => update({ light_lux_min: v } as Partial<Plant>)} />
              <NumField label="Temp min °C" value={plant.temp_min as never} onChange={(v) => update({ temp_min: v } as Partial<Plant>)} />
              <NumField label="Temp max °C" value={plant.temp_max as never} onChange={(v) => update({ temp_max: v } as Partial<Plant>)} />
            </div>
          </Panel>
        )}

        <div className="pt-2 border-t border-border/60">
          <button onClick={remove} className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1"><Trash2 size={14} /> Slett plante</button>
        </div>
      </div>
    </DialogShell>
  );
}

function FloraStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="text-center panel rounded p-2">
      <Icon size={14} className="mx-auto text-primary" />
      <div className="text-[9px] uppercase text-muted-foreground mt-1">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Panel({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={`panel rounded-lg p-3 border ${tone === "warn" ? "border-amber-500/40" : "border-border/60"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full mt-1 px-2 py-1.5 rounded bg-background border border-border text-sm"
      />
    </label>
  );
}

function NotifToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`w-full flex items-center justify-between px-3 py-2 rounded border ${on ? "border-primary/60 bg-primary/10" : "border-border"} text-sm`}
    >
      <span className="flex items-center gap-2">
        {on ? <BellRing size={14} className="text-primary" /> : <BellOff size={14} className="text-muted-foreground" />}
        {label}
      </span>
      <span className={`text-[10px] uppercase ${on ? "text-primary" : "text-muted-foreground"}`}>{on ? "På" : "Av"}</span>
    </button>
  );
}

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="bg-background rounded-t-2xl sm:rounded-2xl border border-border w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-background/95 backdrop-blur z-10 px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted" aria-label="Lukk"><X size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
