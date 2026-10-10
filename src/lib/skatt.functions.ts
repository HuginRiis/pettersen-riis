import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
import { createIsomorphicFn as __claudeIso } from "@tanstack/react-start";
// Lovable AI → Claude (selvhostet): avskjæreren lastes bare på serveren.
await __claudeIso().server(() => import("@/lib/claude-gateway.server")).client(() => Promise.resolve({}))();
const __loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();
const __load_api_call_log_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/api-call-log.server")> => import("@/lib/api-call-log.server"))
  .client((): Promise<typeof import("@/lib/api-call-log.server")> => Promise.resolve({} as unknown as typeof import("@/lib/api-call-log.server")));
const { loggedFetch } = await __load_api_call_log_server();
const __load_ai_usage_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/ai-usage.server")> => import("@/lib/ai-usage.server"))
  .client((): Promise<typeof import("@/lib/ai-usage.server")> => Promise.resolve({} as unknown as typeof import("@/lib/ai-usage.server")));
const { logAiSearch, isHouseAuthenticated } = await __load_ai_usage_server();
const __load_house_auth = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/house-auth.server")> => import("@/lib/house-auth.server"))
  .client((): Promise<typeof import("@/lib/house-auth.server")> => Promise.resolve({ requireHouseAuth: async () => {}, isHouseAuthenticated: async () => false } as unknown as typeof import("@/lib/house-auth.server")));
const { requireHouseAuth } = await __load_house_auth();
export type TaxMonth = {
  id: string;
  year: number;
  month: number;
  employer: string;
  lonn: number;
  skatt: number;
  ekstra: number;
  source: string | null;
};

export type TaxYearSettings = {
  year: number;
  skal_betale: number;
  ekstra_pr_mnd: number;
};

export const PROFILES = ["arne", "rebekka"] as const;
export type Profile = (typeof PROFILES)[number];
const profileSchema = z.enum(PROFILES).default("arne");

export const listTaxYear = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ year: z.number().int(), profile: profileSchema }).parse(d))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const [months, settings] = await Promise.all([
      supabaseAdmin
        .from("tax_monthly")
        .select("id,year,month,employer,lonn,skatt,ekstra,source")
        .eq("year", data.year)
        .eq("profile", data.profile)
        .order("month", { ascending: true })
        .order("employer", { ascending: true }),
      supabaseAdmin
        .from("tax_year_settings")
        .select("year,skal_betale,ekstra_pr_mnd")
        .eq("year", data.year)
        .eq("profile", data.profile)
        .maybeSingle(),
    ]);
    if (months.error) throw new Error(months.error.message);
    if (settings.error) throw new Error(settings.error.message);
    return {
      months: (months.data ?? []) as TaxMonth[],
      settings: (settings.data ?? { year: data.year, skal_betale: 0, ekstra_pr_mnd: 0 }) as TaxYearSettings,
    };
  });

export type MonthlyAgg = { year: number; month: number; lonn: number; skatt: number; ekstra: number };

export const listMonthlyRange = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ years: z.array(z.number().int()).min(1).max(10), profile: profileSchema }).parse(d))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { data: rows, error } = await supabaseAdmin
      .from("tax_monthly")
      .select("year,month,lonn,skatt,ekstra")
      .eq("profile", data.profile)
      .in("year", data.years);
    if (error) throw new Error(error.message);
    const map = new Map<string, MonthlyAgg>();
    for (const r of rows ?? []) {
      const k = `${r.year}-${r.month}`;
      const cur = map.get(k) ?? { year: r.year as number, month: r.month as number, lonn: 0, skatt: 0, ekstra: 0 };
      cur.lonn += Number(r.lonn);
      cur.skatt += Number(r.skatt);
      cur.ekstra += Number(r.ekstra);
      map.set(k, cur);
    }
    return Array.from(map.values());
  });

const taxCalcSchema = z.object({
  year: z.number().int(),
  brutto: z.number().nonnegative(),
  pensjon: z.number().nonnegative().default(0),
  fagforening: z.number().nonnegative().default(0),
  renter: z.number().nonnegative().default(0),
  andreFradrag: z.number().nonnegative().default(0),
  sivilstand: z.enum(["enslig", "gift"]).default("enslig"),
  skatteklasse: z.union([z.literal(1), z.literal(2)]).default(1),
  notes: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Deterministisk skatteberegning basert på offisielle satser fra Skatteetaten.
// Ingen AI involvert — alle satser, fradrag og trinn er hentet fra
// Skatteetatens publiserte satsoversikter for de aktuelle inntektsårene:
//   https://www.skatteetaten.no/satser/
//   https://www.skatteetaten.no/satser/trinnskatt/
//   https://www.skatteetaten.no/satser/minstefradrag/
//   https://www.skatteetaten.no/satser/personfradrag/
//   https://www.skatteetaten.no/satser/trygdeavgift-pa-lonnsinntekt/
// Tallene under er for vanlige skatteytere (ikke Finnmark/Nord-Troms).
// ---------------------------------------------------------------------------

type TrinnBracket = { from: number; rate: number };
type TaxYearRules = {
  personfradrag: number;          // klasse 1
  minstefradragRate: number;      // f.eks. 0.46
  minstefradragMax: number;
  trygdeavgiftRate: number;       // lønnsinntekt
  trygdeavgiftFribelop: number;   // nedre grense
  trygdeavgiftOpptrapping: number; // opptrappingssats
  alminneligRate: number;         // 0.22
  trinn: TrinnBracket[];          // sortert stigende
};

const TAX_RULES: Record<number, TaxYearRules> = {
  // 2024 — Skatteetaten/statsbudsjettet 2024
  2024: {
    personfradrag: 88_250,
    minstefradragRate: 0.46,
    minstefradragMax: 104_450,
    trygdeavgiftRate: 0.078,
    trygdeavgiftFribelop: 99_650,
    trygdeavgiftOpptrapping: 0.25,
    alminneligRate: 0.22,
    trinn: [
      { from: 208_050, rate: 0.017 },
      { from: 292_850, rate: 0.040 },
      { from: 670_000, rate: 0.137 },
      { from: 937_900, rate: 0.167 },
      { from: 1_350_000, rate: 0.177 },
    ],
  },
  // 2025 — Skatteetaten/statsbudsjettet 2025
  2025: {
    personfradrag: 108_550,
    minstefradragRate: 0.46,
    minstefradragMax: 92_000,
    trygdeavgiftRate: 0.077,
    trygdeavgiftFribelop: 99_650,
    trygdeavgiftOpptrapping: 0.25,
    alminneligRate: 0.22,
    trinn: [
      { from: 217_400, rate: 0.017 },
      { from: 306_050, rate: 0.040 },
      { from: 697_150, rate: 0.137 },
      { from: 942_400, rate: 0.167 },
      { from: 1_410_750, rate: 0.177 },
    ],
  },
  // 2026 — Skatteetaten/statsbudsjettet 2026 (vedtatt 18. desember 2025)
  2026: {
    personfradrag: 114_540,
    minstefradragRate: 0.46,
    minstefradragMax: 95_700,
    trygdeavgiftRate: 0.076,
    trygdeavgiftFribelop: 99_650,
    trygdeavgiftOpptrapping: 0.25,
    alminneligRate: 0.22,
    trinn: [
      { from: 226_100, rate: 0.017 },
      { from: 318_300, rate: 0.040 },
      { from: 725_050, rate: 0.137 },
      { from: 980_100, rate: 0.168 },
      { from: 1_467_200, rate: 0.178 },
    ],
  },
};

function rulesFor(year: number): TaxYearRules {
  if (TAX_RULES[year]) return TAX_RULES[year];
  // Fallback: bruk nyeste kjente år
  const years = Object.keys(TAX_RULES).map(Number).sort((a, b) => b - a);
  return TAX_RULES[years[0]];
}

function calcTrinnskatt(personinntekt: number, trinn: TrinnBracket[]): { total: number; marginal: number } {
  let total = 0;
  let marginal = 0;
  for (let i = 0; i < trinn.length; i++) {
    const t = trinn[i];
    const next = trinn[i + 1]?.from ?? Infinity;
    if (personinntekt > t.from) {
      const top = Math.min(personinntekt, next);
      total += (top - t.from) * t.rate;
      marginal = t.rate;
    }
  }
  return { total, marginal };
}

function calcTrygdeavgift(personinntekt: number, r: TaxYearRules): { sum: number; marginal: number } {
  if (personinntekt <= r.trygdeavgiftFribelop) return { sum: 0, marginal: 0 };
  // Opptrappingsregel: trygdeavgift kan ikke overstige opptrapping * (personinntekt - fribeløp)
  const full = personinntekt * r.trygdeavgiftRate;
  const cap = (personinntekt - r.trygdeavgiftFribelop) * r.trygdeavgiftOpptrapping;
  if (cap < full) return { sum: cap, marginal: r.trygdeavgiftOpptrapping };
  return { sum: full, marginal: r.trygdeavgiftRate };
}

export const calculateNorwegianTax = createServerFn({ method: "POST" })
  .inputValidator((d) => taxCalcSchema.parse(d))
  .handler(async ({ data }) => {
    const r = rulesFor(data.year);

    // Personinntekt = bruttolønn (pensjonsinnbetaling reduserer IKKE personinntekt for lønnstaker,
    // men gir fradrag i alminnelig inntekt via tjenestepensjonsordning til 2% – her tar vi det som
    // generelt fradrag på linje med "andre fradrag").
    const personinntekt = data.brutto;

    // Minstefradrag i lønn — prosent av bruttolønn, opp til årets makstak
    const minstefradrag = Math.min(
      Math.round(data.brutto * r.minstefradragRate),
      r.minstefradragMax,
    );

    // Personfradrag (klasse 2 ble fjernet fra 2018, men feltet beholdes for kompatibilitet)
    const personfradrag = r.personfradrag;

    // Fradrag mot alminnelig inntekt
    const fradragSum =
      minstefradrag +
      personfradrag +
      data.pensjon +
      data.fagforening +
      data.renter +
      data.andreFradrag;

    // Alminnelig inntekt = bruttolønn − fradrag (kan ikke bli negativ)
    const alminneligInntekt = Math.max(0, data.brutto - fradragSum);
    const skattAlminnelig = alminneligInntekt * r.alminneligRate;

    // Trinnskatt på personinntekt
    const { total: trinnskatt, marginal: trinnMarginal } = calcTrinnskatt(personinntekt, r.trinn);

    // Trygdeavgift på personinntekt
    const { sum: trygdeavgift, marginal: trygdMarginal } = calcTrygdeavgift(personinntekt, r);

    const totalSkatt = skattAlminnelig + trinnskatt + trygdeavgift;
    const nettoUtbetalt = data.brutto - totalSkatt;
    const gjennomsnittSkattProsent = data.brutto > 0 ? (totalSkatt / data.brutto) * 100 : 0;
    // Marginalskatt for neste lønnskrone = alminnelig (22 %) + trinn + trygd
    const marginalSkatt = (r.alminneligRate + trinnMarginal + trygdMarginal) * 100;

    const forklaring =
      `Beregnet etter Skatteetatens satser for ${data.year}: ` +
      `minstefradrag ${(r.minstefradragRate * 100).toFixed(0)}% av lønn (maks ${r.minstefradragMax.toLocaleString("nb-NO")} kr), ` +
      `personfradrag ${r.personfradrag.toLocaleString("nb-NO")} kr, ` +
      `alminnelig inntekt skattlagt med ${(r.alminneligRate * 100).toFixed(0)}%, ` +
      `trinnskatt etter ${r.trinn.length} trinn, ` +
      `trygdeavgift ${(r.trygdeavgiftRate * 100).toFixed(1).replace(".", ",")}% over fribeløp ${r.trygdeavgiftFribelop.toLocaleString("nb-NO")} kr (opptrappingssats ${(r.trygdeavgiftOpptrapping * 100).toFixed(0)}%).` +
      (data.notes ? ` Merknad: ${data.notes}` : "");

    return {
      year: data.year,
      minstefradrag: Math.round(minstefradrag),
      personfradrag: Math.round(personfradrag),
      alminneligInntekt: Math.round(alminneligInntekt),
      skattAlminnelig: Math.round(skattAlminnelig),
      trinnskatt: Math.round(trinnskatt),
      trygdeavgift: Math.round(trygdeavgift),
      fradragSum: Math.round(fradragSum),
      totalSkatt: Math.round(totalSkatt),
      marginalSkatt: Math.round(marginalSkatt * 10) / 10,
      gjennomsnittSkattProsent: Math.round(gjennomsnittSkattProsent * 10) / 10,
      nettoUtbetalt: Math.round(nettoUtbetalt),
      forklaring,
    };
  });

export const listTaxYears = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ profile: profileSchema }).parse(d ?? { profile: "arne" }))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { data: rows, error } = await supabaseAdmin
      .from("tax_year_settings")
      .select("year")
      .eq("profile", data.profile)
      .order("year", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => r.year as number);
  });

export type PayslipFile = {
  id: string;
  year: number;
  month: number | null;
  employer: string | null;
  file_path: string;
  file_url: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  extracted_text: string | null;
  extracted_at: string | null;
};

export const listPayslipFiles = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ profile: profileSchema }).parse(d ?? { profile: "arne" }))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { data: rows, error } = await supabaseAdmin
      .from("payslip_files")
      .select("id,year,month,employer,file_path,file_url,original_name,mime_type,size_bytes,uploaded_at,extracted_text,extracted_at")
      .eq("profile", data.profile)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as PayslipFile[];
  });

export const extractPayslipText = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), force: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { data: row, error: selErr } = await supabaseAdmin
      .from("payslip_files")
      .select("id,file_path,file_url,mime_type,extracted_text")
      .eq("id", data.id)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!row) throw new Error("Fant ikke lønnslippen");
    if (row.extracted_text && !data.force) {
      return { text: row.extracted_text as string, cached: true };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

    // Last ned filen som base64 — bruk signed URL fra storage så vi ikke er avhengig av public bucket
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("payslips")
      .createSignedUrl(row.file_path as string, 60);
    if (sErr || !signed?.signedUrl) throw new Error(sErr?.message ?? "Klarte ikke lage signert URL");
    const fileRes = await fetch(signed.signedUrl);
    if (!fileRes.ok) throw new Error(`Klarte ikke laste filen (${fileRes.status})`);
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const mime = (row.mime_type as string) || "image/jpeg";
    const dataUrl = `data:${mime};base64,${b64}`;

    const prompt = `Du er en maester ved Citadellet i Oldtown som leser en lønnslipp som om den var en kongelig skattruller fra Jerntronen. Hent ut ALLE detaljer fra bildet, men skriv det i Game of Thrones-stil — høytidelig, middelaldersk norsk, med referanser til myntene som "gulldrager" (kr) der det passer, og kall arbeidsgiveren for "huset", lønnsperioden for "månens omdreining", skatten for "kronens tiende" osv.

Strukturer som en pergamentrull med tydelige overskrifter (bruk · eller — som skilletegn, IKKE markdown):

⚔ HUSET (arbeidsgiver) og dets tjener (arbeidstaker, ansattnr)
🌙 MÅNENS OMDREINING (periode + utbetalingsdato)
👑 GULLET FRA HUSET (brutto lønn, timer/sats, tillegg, bonuser, naturalytelser)
🗡 KRONENS TIENDE OG ANDRE TREKK (skatt, ekstra skatt, fagforening, pensjon, andre trekk)
💰 NETTO I PUNGEN (netto utbetalt)
🏰 SKATTKAMMERET HITTIL I ÅRET (hittil-tall: lønn, skatt, feriepenger)
📜 ANDRE PERGAMENTNOTATER (kontonummer, kommentarer, alt annet)

Hold det kort, faktabasert og nøyaktig — alle tall som står på slippen MÅ med. Ikke finn på data. Ren tekst, ingen markdown-kodeblokker, ingen ** eller ##.`;

    const res = await loggedFetch("ai", "skatt", "https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI-feil ${res.status}: ${txt.slice(0, 300)}`);
    }
    const json: any = await res.json();
    const u = json?.usage ?? {};
    await logAiSearch({
      feature: "lonnslipp",
      query: `lønnslipp-saga ${data.id}`,
      model: "google/gemini-2.5-pro",
      authenticated: await isHouseAuthenticated(),
      status: "ok",
      promptTokens: u.prompt_tokens ?? null,
      completionTokens: u.completion_tokens ?? null,
      totalTokens: u.total_tokens ?? null,
    });
    const text: string = (json?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("AI returnerte tom tekst");

    await supabaseAdmin
      .from("payslip_files")
      .update({ extracted_text: text, extracted_at: new Date().toISOString() })
      .eq("id", data.id);

    return { text, cached: false };
  });

const savePayslipFileSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12).nullable(),
  employer: z.string().max(100).nullable(),
  fileName: z.string(),
  mimeType: z.string(),
  base64: z.string().min(20),
  sizeBytes: z.number().nonnegative().nullable().optional(),
  profile: profileSchema,
});

export const savePayslipFile = createServerFn({ method: "POST" })
  .inputValidator((d) => savePayslipFileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${data.profile}/${data.year}/${Date.now()}-${safeName}`;
    const buf = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabaseAdmin.storage
      .from("payslips")
      .upload(path, buf, { contentType: data.mimeType, upsert: false });
    if (upErr) throw new Error(`Opplasting feilet: ${upErr.message}`);
    const { data: pub } = supabaseAdmin.storage.from("payslips").getPublicUrl(path);
    const { error: insErr } = await supabaseAdmin.from("payslip_files").insert({
      year: data.year,
      month: data.month,
      employer: data.employer,
      file_path: path,
      file_url: pub.publicUrl,
      original_name: data.fileName,
      mime_type: data.mimeType,
      size_bytes: data.sizeBytes ?? buf.length,
      profile: data.profile,
    });
    if (insErr) throw new Error(insErr.message);
    return { ok: true, url: pub.publicUrl, path };
  });

export const deletePayslipFile = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { data: row, error: selErr } = await supabaseAdmin
      .from("payslip_files").select("file_path").eq("id", data.id).maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (row?.file_path) {
      await supabaseAdmin.storage.from("payslips").remove([row.file_path]);
    }
    const { error } = await supabaseAdmin.from("payslip_files").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


const upsertMonthSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  employer: z.string().min(1).max(100).default("Hovedjobb"),
  lonn: z.number().nonnegative(),
  skatt: z.number().nonnegative(),
  ekstra: z.number().nonnegative(),
  source: z.string().max(200).nullable().optional(),
  profile: profileSchema,
});

export const upsertTaxMonth = createServerFn({ method: "POST" })
  .inputValidator((d) => upsertMonthSchema.parse(d))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { error } = await supabaseAdmin
      .from("tax_monthly")
      .upsert(
        {
          year: data.year,
          month: data.month,
          employer: data.employer,
          lonn: data.lonn,
          skatt: data.skatt,
          ekstra: data.ekstra,
          source: data.source ?? null,
          profile: data.profile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile,year,month,employer" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteMonthSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  employer: z.string().min(1).max(100),
  profile: profileSchema,
});

export const deleteTaxMonth = createServerFn({ method: "POST" })
  .inputValidator((d) => deleteMonthSchema.parse(d))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { error } = await supabaseAdmin
      .from("tax_monthly")
      .delete()
      .eq("year", data.year)
      .eq("month", data.month)
      .eq("employer", data.employer)
      .eq("profile", data.profile);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const upsertSettingsSchema = z.object({
  year: z.number().int(),
  skal_betale: z.number().nonnegative(),
  ekstra_pr_mnd: z.number().nonnegative(),
  profile: profileSchema,
});

export const upsertTaxSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => upsertSettingsSchema.parse(d))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { error } = await supabaseAdmin
      .from("tax_year_settings")
      .upsert(
        {
          year: data.year,
          skal_betale: data.skal_betale,
          ekstra_pr_mnd: data.ekstra_pr_mnd,
          profile: data.profile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile,year" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const parsePayslipSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  base64: z.string().min(20),
});

const NB_MONTHS: Record<string, number> = {
  januar: 1, februar: 2, mars: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, desember: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, des: 12,
};

export const parsePayslip = createServerFn({ method: "POST" })
  .inputValidator((d) => parsePayslipSchema.parse(d))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

    const prompt = `Du analyserer en norsk lønnsslipp. Hent ut:
- år (year, 4-sifret)
- måned (month, 1-12) — bruk lønnsperioden, ikke utbetalingsdato
- arbeidsgiver (employer) — firmanavnet som utbetaler lønnen (kort navn, f.eks. "Acme AS")
- bruttolønn for perioden i NOK (lonn)
- forskuddsskatt/ordinært skattetrekk for perioden i NOK (skatt) — kun ordinær skatt, IKKE inkluder ekstra/frivillig trekk
- frivillig/ekstra skattetrekk for perioden i NOK (ekstra), 0 hvis ikke spesifisert

Svar KUN med JSON: {"year":2026,"month":3,"employer":"Acme AS","lonn":74281,"skatt":24367,"ekstra":1000,"note":"kort begrunnelse"}.
Hvis du ikke finner et felt, sett 0 (eller "Ukjent" for employer). Hvis måned er angitt som tekst (f.eks. "mars 2026"), oversett til tall.`;

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${data.mimeType};base64,${data.base64}` },
            },
          ],
        },
      ],
    };

    const res = await loggedFetch("ai", "skatt", "https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI-feil ${res.status}: ${txt.slice(0, 300)}`);
    }
    const json: any = await res.json();
    const u = json?.usage ?? {};
    await logAiSearch({
      feature: "lonnslipp",
      query: `lønnslipp-parse ${data.fileName}`,
      model: "google/gemini-2.5-flash",
      authenticated: await isHouseAuthenticated(),
      status: "ok",
      promptTokens: u.prompt_tokens ?? null,
      completionTokens: u.completion_tokens ?? null,
      totalTokens: u.total_tokens ?? null,
    });
    const content: string = json?.choices?.[0]?.message?.content ?? "";

    const cleaned = content.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Klarte ikke tolke svar fra AI");
    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error("Ugyldig JSON fra AI");
    }

    let year = Number(parsed.year);
    let month = Number(parsed.month);
    if (!month && typeof parsed.month === "string") {
      month = NB_MONTHS[parsed.month.toLowerCase()] ?? 0;
    }
    const lonn = Number(parsed.lonn) || 0;
    const skatt = Number(parsed.skatt) || 0;
    const ekstra = Number(parsed.ekstra) || 0;
    const note = String(parsed.note ?? "");
    const employer = String(parsed.employer ?? "").trim() || "Hovedjobb";

    if (!year || !month || month < 1 || month > 12) {
      throw new Error("AI fant ikke gyldig år/måned. Velg manuelt.");
    }

    return { year, month, employer, lonn, skatt, ekstra, note, fileName: data.fileName };
  });
