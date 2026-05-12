import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

export const listTaxYear = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ year: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const [months, settings] = await Promise.all([
      supabaseAdmin
        .from("tax_monthly")
        .select("id,year,month,employer,lonn,skatt,ekstra,source")
        .eq("year", data.year)
        .order("month", { ascending: true })
        .order("employer", { ascending: true }),
      supabaseAdmin
        .from("tax_year_settings")
        .select("year,skal_betale,ekstra_pr_mnd")
        .eq("year", data.year)
        .maybeSingle(),
    ]);
    if (months.error) throw new Error(months.error.message);
    if (settings.error) throw new Error(settings.error.message);
    return {
      months: (months.data ?? []) as TaxMonth[],
      settings: (settings.data ?? { year: data.year, skal_betale: 0, ekstra_pr_mnd: 0 }) as TaxYearSettings,
    };
  });

export const listTaxYears = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("tax_year_settings")
    .select("year")
    .order("year", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.year as number);
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
};

export const listPayslipFiles = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("payslip_files")
    .select("id,year,month,employer,file_path,file_url,original_name,mime_type,size_bytes,uploaded_at")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PayslipFile[];
});

const savePayslipFileSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12).nullable(),
  employer: z.string().max(100).nullable(),
  fileName: z.string(),
  mimeType: z.string(),
  base64: z.string().min(20),
  sizeBytes: z.number().nonnegative().nullable().optional(),
});

export const savePayslipFile = createServerFn({ method: "POST" })
  .inputValidator((d) => savePayslipFileSchema.parse(d))
  .handler(async ({ data }) => {
    const ext = data.fileName.split(".").pop()?.toLowerCase() || "bin";
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${data.year}/${Date.now()}-${safeName}`;
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
    });
    if (insErr) throw new Error(insErr.message);
    return { ok: true, url: pub.publicUrl, path };
    // eslint-disable-next-line no-unreachable
    void ext;
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
          updated_at: new Date().toISOString(),
        },
        { onConflict: "year,month,employer" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteMonthSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  employer: z.string().min(1).max(100),
});

export const deleteTaxMonth = createServerFn({ method: "POST" })
  .inputValidator((d) => deleteMonthSchema.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("tax_monthly")
      .delete()
      .eq("year", data.year)
      .eq("month", data.month)
      .eq("employer", data.employer);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const upsertSettingsSchema = z.object({
  year: z.number().int(),
  skal_betale: z.number().nonnegative(),
  ekstra_pr_mnd: z.number().nonnegative(),
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
          updated_at: new Date().toISOString(),
        },
        { onConflict: "year" },
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

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
