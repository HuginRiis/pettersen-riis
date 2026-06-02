import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
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
  .server((): Promise<typeof import("@/server/api-call-log.server")> => import("@/server/api-call-log.server"))
  .client((): Promise<typeof import("@/server/api-call-log.server")> => Promise.resolve({} as unknown as typeof import("@/server/api-call-log.server")));
const { loggedFetch } = await __load_api_call_log_server();
const __load_ai_usage_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/ai-usage.server")> => import("@/server/ai-usage.server"))
  .client((): Promise<typeof import("@/server/ai-usage.server")> => Promise.resolve({} as unknown as typeof import("@/server/ai-usage.server")));
const { logAiSearch, isHouseAuthenticated } = await __load_ai_usage_server();
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

export const calculateNorwegianTax = createServerFn({ method: "POST" })
  .inputValidator((d) => taxCalcSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

    const prompt = `Du er norsk skatteekspert. Beregn estimert skatt for inntektsåret ${data.year} basert på offisielle norske skatteregler (Skatteetaten) for det året: trinnskatt, alminnelig inntekt 22%, trygdeavgift 7,7% (lønn), minstefradrag, personfradrag, evt. fradrag for fagforening, renter, pensjonsinnbetaling og andre fradrag.

Inndata:
- Bruttolønn: ${data.brutto} kr
- Pensjonsinnbetaling (egen): ${data.pensjon} kr
- Fagforeningskontingent: ${data.fagforening} kr
- Rentefradrag (gjeldsrenter): ${data.renter} kr
- Andre fradrag: ${data.andreFradrag} kr
- Sivilstand: ${data.sivilstand}
- Skatteklasse: ${data.skatteklasse}
${data.notes ? `- Tilleggsinfo: ${data.notes}` : ""}

Returner KUN JSON i dette formatet:
{
  "year": ${data.year},
  "minstefradrag": 0,
  "personfradrag": 0,
  "alminneligInntekt": 0,
  "skattAlminnelig": 0,
  "trinnskatt": 0,
  "trygdeavgift": 0,
  "fradragSum": 0,
  "totalSkatt": 0,
  "marginalSkatt": 0,
  "gjennomsnittSkattProsent": 0,
  "nettoUtbetalt": 0,
  "forklaring": "kort forklaring av trinnene"
}
Alle tall i NOK (heltall). Marginalskatt og gjennomsnittsprosent som tall (f.eks. 35.2).`;

    const res = await loggedFetch("ai", "skatt", "https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI-feil ${res.status}: ${txt.slice(0, 300)}`);
    }
    const json: any = await res.json();
    const u = json?.usage ?? {};
    await logAiSearch({
      feature: "skatt",
      query: `skatt ${data.year}`,
      model: "google/gemini-2.5-pro",
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
    const parsed = JSON.parse(match[0]);
    return parsed as {
      year: number;
      minstefradrag: number;
      personfradrag: number;
      alminneligInntekt: number;
      skattAlminnelig: number;
      trinnskatt: number;
      trygdeavgift: number;
      fradragSum: number;
      totalSkatt: number;
      marginalSkatt: number;
      gjennomsnittSkattProsent: number;
      nettoUtbetalt: number;
      forklaring: string;
    };
  });

export const listTaxYears = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ profile: profileSchema }).parse(d ?? { profile: "arne" }))
  .handler(async ({ data }) => {
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
