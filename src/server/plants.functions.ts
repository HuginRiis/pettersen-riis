import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getValidConnection, getHomeyRawSnapshot } from "@/lib/homey.functions";

const VISION_MODEL = "google/gemini-2.5-flash";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";

export type PlantAnalysis = {
  species_common: string | null;
  species_latin: string | null;
  kind: string; // plante|tre|busk|urt|blomst|sopp
  edible: boolean | null;
  toxicity: "none" | "mild" | "moderate" | "severe" | "unknown";
  toxicity_notes: string | null;
  care_summary: string | null;
  where_grows: string | null;
  watering_days_interval: number | null;
  fertilize_weeks_interval: number | null;
  season_start_month: number | null;
  season_end_month: number | null;
  confidence: "low" | "medium" | "high";
  warning: string | null;
};

function callAi(body: unknown) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const analyzePlantImage = createServerFn({ method: "POST" })
  .inputValidator((input: { imageUrl: string }) => input)
  .handler(async ({ data }): Promise<PlantAnalysis> => {
    const res = await callAi({
      model: VISION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Du er en norsk botaniker som identifiserer planter, trær, urter, busker, blomster og sopp fra bilder. Svar KUN via verktøyet 'identify_plant'. Vær ærlig om usikkerhet. ALDRI si at noe er spiselig hvis du ikke er sikker. Sopp og bær er spesielt farlige — vær konservativ.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Identifiser planten/treet/sopperen på bildet. Norsk navn, latin, om den er spiselig, giftighet, og stell-tips." },
            { type: "image_url", image_url: { url: data.imageUrl } },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "identify_plant",
            description: "Strukturert plante-identifikasjon",
            parameters: {
              type: "object",
              properties: {
                species_common: { type: ["string", "null"], description: "Norsk navn" },
                species_latin: { type: ["string", "null"] },
                kind: { type: "string", enum: ["plante", "tre", "busk", "urt", "blomst", "sopp", "ukjent"] },
                edible: { type: ["boolean", "null"], description: "true=trygt å spise, false=ikke spis, null=usikker" },
                toxicity: { type: "string", enum: ["none", "mild", "moderate", "severe", "unknown"] },
                toxicity_notes: { type: ["string", "null"], description: "Hva er giftig, for hvem (mennesker/hund/katt), symptomer" },
                care_summary: { type: ["string", "null"], description: "2-4 setninger om stell: lys, vann, jord" },
                where_grows: { type: ["string", "null"], description: "Hvor i Norge/Skandinavia vokser den naturlig, hvilke habitater" },
                watering_days_interval: { type: ["integer", "null"], description: "Antall dager mellom vanninger" },
                fertilize_weeks_interval: { type: ["integer", "null"], description: "Antall uker mellom gjødsling" },
                season_start_month: { type: ["integer", "null"], description: "1-12, høstemåned start" },
                season_end_month: { type: ["integer", "null"], description: "1-12, høstemåned slutt" },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                warning: { type: ["string", "null"], description: "Advarsel hvis ligner farlig art" },
              },
              required: ["kind", "toxicity", "confidence"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "identify_plant" } },
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("AI er midlertidig overbelastet — prøv igjen om litt.");
      if (res.status === 402) throw new Error("AI-kreditt tom — fyll på i Lovable.");
      throw new Error(`AI-feil (${res.status})`);
    }
    const json = await res.json();
    const tc = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc?.function?.arguments) throw new Error("AI ga ingen plante-data");
    const p = JSON.parse(tc.function.arguments);
    return {
      species_common: p.species_common ?? null,
      species_latin: p.species_latin ?? null,
      kind: p.kind ?? "ukjent",
      edible: typeof p.edible === "boolean" ? p.edible : null,
      toxicity: p.toxicity ?? "unknown",
      toxicity_notes: p.toxicity_notes ?? null,
      care_summary: p.care_summary ?? null,
      where_grows: p.where_grows ?? null,
      watering_days_interval: p.watering_days_interval ?? null,
      fertilize_weeks_interval: p.fertilize_weeks_interval ?? null,
      season_start_month: p.season_start_month ?? null,
      season_end_month: p.season_end_month ?? null,
      confidence: p.confidence ?? "low",
      warning: p.warning ?? null,
    };
  });

export const generatePlantReference = createServerFn({ method: "POST" })
  .inputValidator((input: { plantId: string; species: string }) => input)
  .handler(async ({ data }): Promise<{ url: string }> => {
    const prompt = `A high-quality botanical illustration of "${data.species}". Painted in the style of classic 19th century scientific botany plates — soft watercolor, detailed leaves, flowers and fruit shown together, neutral cream background, no text labels. Single specimen, centered.`;
    const aiRes = await callAi({
      model: IMAGE_MODEL,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    });
    if (!aiRes.ok) throw new Error(`AI image error (${aiRes.status})`);
    const json = await aiRes.json();
    const dataUrl: string | undefined = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:")) throw new Error("Ingen bilde-data");
    const m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!m) throw new Error("Ugyldig bilde-data");
    const mime = m[1];
    const ext = mime.split("/")[1] ?? "png";
    const buf = Buffer.from(m[2], "base64");
    const path = `ai/${data.plantId}-${Date.now()}.${ext}`;
    const { error } = await supabaseAdmin.storage.from("plants").upload(path, buf, { contentType: mime, upsert: true });
    if (error) throw new Error(error.message);
    const { data: pub } = supabaseAdmin.storage.from("plants").getPublicUrl(path);
    const url = pub.publicUrl;
    await supabaseAdmin.from("plants").update({ ai_reference_image_url: url }).eq("id", data.plantId);
    await supabaseAdmin.from("plant_photos").insert({
      plant_id: data.plantId,
      photo_url: url,
      is_ai_generated: true,
      notes: "AI-illustrasjon",
    });
    return { url };
  });

export const searchPlantContext = createServerFn({ method: "POST" })
  .inputValidator((input: { species: string; lat?: number | null; lon?: number | null }) => input)
  .handler(async ({ data }): Promise<{ text: string }> => {
    const loc = data.lat && data.lon ? ` Jeg fant den på koordinat ${data.lat.toFixed(3)}, ${data.lon.toFixed(3)} i Norge.` : "";
    const res = await callAi({
      model: VISION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Du er en norsk plante-ekspert. Svar kort og praktisk på norsk i 3-5 setninger om hvor planten vokser, hva som er spiselig på den (rot/blad/blomst/frukt), og når sesongen er. Aldri si at noe er spiselig hvis du er usikker.",
        },
        { role: "user", content: `Fortell om "${data.species}".${loc}` },
      ],
    });
    if (!res.ok) throw new Error(`AI-feil (${res.status})`);
    const json = await res.json();
    return { text: json.choices?.[0]?.message?.content ?? "Ingen info." };
  });

// Reverse-geocode via Nominatim (OpenStreetMap) — gratis, ingen nøkkel
export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((input: { lat: number; lon: number }) => input)
  .handler(async ({ data }): Promise<{ label: string | null }> => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${data.lat}&lon=${data.lon}&zoom=16&accept-language=nb`;
      const res = await fetch(url, { headers: { "User-Agent": "house-pettersen-riis/1.0 (planter)" } });
      if (!res.ok) return { label: null };
      const j = await res.json();
      const a = j.address ?? {};
      const parts = [
        a.road,
        a.suburb || a.neighbourhood || a.hamlet || a.village || a.town,
        a.city || a.municipality,
      ].filter(Boolean);
      return { label: parts.length > 0 ? parts.join(", ") : (j.display_name ?? null) };
    } catch {
      return { label: null };
    }
  });

// ===== Mi Flora via Homey =====

export type MiFloraDevice = {
  id: string;
  name: string;
  zone: string | null;
  soilMoisture: number | null; // %
  light: number | null; // lux
  temperature: number | null; // °C
  fertility: number | null; // µS/cm
  battery: number | null; // %
};

function isFloraDevice(name: string, caps: Record<string, unknown>): boolean {
  if (/flower\s*care|mi[\s-]*flora|miflora|plant/i.test(name)) return true;
  // Mi Flora unique combo: humidity + luminance + conductivity (or measure_water in some variants)
  return (
    ("measure_humidity" in caps || "measure_water" in caps) &&
    "measure_luminance" in caps &&
    ("measure_conductivity" in caps || "measure_fertility" in caps)
  );
}

function capVal(caps: Record<string, unknown>, key: string): number | null {
  const c = caps?.[key] as { value?: unknown } | undefined;
  const v = c?.value;
  return typeof v === "number" ? v : null;
}

async function loadMiFloraDevices(): Promise<MiFloraDevice[]> {
  const conn = await getValidConnection().catch(() => null);
  if (!conn) return [];
  const raw = await getHomeyRawSnapshot(conn).catch(() => null);
  if (!raw) return [];
  const zoneMap = new Map<string, string>();
  for (const z of raw.zonesRaw as any[]) zoneMap.set(z.id ?? z._id, z.name ?? "");
  const out: MiFloraDevice[] = [];
  for (const d of raw.devicesRaw as any[]) {
    const caps = d.capabilitiesObj ?? d.capabilities_obj ?? {};
    const name = d.name ?? "";
    if (!isFloraDevice(name, caps)) continue;
    out.push({
      id: d.id ?? d._id,
      name,
      zone: zoneMap.get(d.zone) ?? null,
      soilMoisture: capVal(caps, "measure_humidity") ?? capVal(caps, "measure_water"),
      light: capVal(caps, "measure_luminance"),
      temperature: capVal(caps, "measure_temperature"),
      fertility: capVal(caps, "measure_conductivity") ?? capVal(caps, "measure_fertility"),
      battery: capVal(caps, "measure_battery"),
    });
  }
  return out;
}

export const getMiFloraDevices = createServerFn({ method: "GET" }).handler(
  async (): Promise<MiFloraDevice[]> => loadMiFloraDevices(),
);

export const getMiFloraReading = createServerFn({ method: "POST" })
  .inputValidator((input: { deviceId: string }) => input)
  .handler(async ({ data }): Promise<MiFloraDevice | null> => {
    const all = await loadMiFloraDevices();
    return all.find((d) => d.id === data.deviceId) ?? null;
  });
