// Bruksanvisninger: søk på nett, last ned PDF og lagre den i borgens arkiv.
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

const __loadAuth = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/house-auth.server")> => import("@/lib/house-auth.server"))
  .client(
    (): Promise<typeof import("@/lib/house-auth.server")> =>
      Promise.resolve({
        requireHouseAuth: async () => {},
        isHouseAuthenticated: async () => false,
      } as unknown as typeof import("@/lib/house-auth.server")),
  );
const { requireHouseAuth } = await __loadAuth();

export type ManualRow = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  source_url: string | null;
  file_path: string | null;
  file_size: number | null;
  notes: string | null;
  tags: string[];
  added_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ManualCandidate = {
  title: string;
  url: string;
  host: string;
  isPdf: boolean;
  note?: string | null;
};

const MANUAL_SELECT =
  "id,title,brand,model,category,source_url,file_path,file_size,notes,tags,added_by,created_at,updated_at";

export const listManuals = createServerFn({ method: "GET" }).handler(
  async (): Promise<ManualRow[]> => {
    await requireHouseAuth();
    const { data, error } = await supabaseAdmin!
      .from("manuals")
      .select(MANUAL_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ManualRow[];
  },
);

export const getManualFileUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<string> => {
    await requireHouseAuth();
    const { data: signed, error } = await supabaseAdmin!.storage
      .from("manuals")
      .createSignedUrl(data.path, 60 * 60);
    if (error || !signed) throw new Error(error?.message ?? "Fant ikke filen");
    return signed.signedUrl;
  });

export const deleteManual = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireHouseAuth();
    const { data: row } = await supabaseAdmin!
      .from("manuals")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();
    const path = (row as { file_path?: string | null } | null)?.file_path;
    if (path) await supabaseAdmin!.storage.from("manuals").remove([path]);
    const { error } = await supabaseAdmin!.from("manuals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateManual = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        brand: z.string().max(120).nullable().optional(),
        model: z.string().max(120).nullable().optional(),
        category: z.string().max(80).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireHouseAuth();
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin!.from("manuals").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------ Nettsøk ------------------------------ */

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

async function duckduckgo(query: string): Promise<ManualCandidate[]> {
  try {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
      },
      body: new URLSearchParams({ q: query }).toString(),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const out: ManualCandidate[] = [];
    const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < 20) {
      let href = decodeEntities(m[1]);
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) href = decodeURIComponent(uddg[1]);
      if (!/^https?:\/\//.test(href)) continue;
      const title = decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim();
      let host = "";
      try {
        host = new URL(href).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (out.some((c) => c.url === href)) continue;
      out.push({ title: title || host, url: href, host, isPdf: /\.pdf(\?|$)/i.test(href) });
    }
    return out;
  } catch {
    return [];
  }
}

export const searchManuals = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ query: z.string().min(2).max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ candidates: ManualCandidate[]; note: string | null }> => {
    await requireHouseAuth();
    const q = data.query.trim();
    const queries = [
      `${q} bruksanvisning filetype:pdf`,
      `${q} manual pdf`,
      `${q} user manual filetype:pdf`,
    ];
    const results: ManualCandidate[] = [];
    for (const query of queries) {
      const r = await duckduckgo(query);
      for (const c of r) {
        if (!results.some((x) => x.url === c.url)) results.push(c);
      }
      if (results.filter((c) => c.isPdf).length >= 6) break;
    }
    results.sort((a, b) => Number(b.isPdf) - Number(a.isPdf));
    const top = results.slice(0, 15);
    return {
      candidates: top,
      note: top.length === 0 ? "Fant ingen treff. Prøv merke + modellnummer, eller lim inn en lenke selv." : null,
    };
  });

/* --------------------------- Lagre som PDF --------------------------- */

function safeName(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[æå]/g, "a")
      .replace(/ø/g, "o")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bruksanvisning"
  );
}

export const saveManualFromUrl = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        url: z.string().url(),
        title: z.string().min(1).max(200),
        brand: z.string().max(120).optional().nullable(),
        model: z.string().max(120).optional().nullable(),
        category: z.string().max(80).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
        addedBy: z.string().max(60).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<ManualRow> => {
    await requireHouseAuth();
    const res = await fetch(data.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        Accept: "application/pdf,*/*",
      },
    });
    if (!res.ok) throw new Error(`Kunne ikke hente filen (HTTP ${res.status})`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const isPdf = buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    if (!isPdf) {
      throw new Error("Lenken peker ikke på en PDF. Åpne siden og finn den direkte PDF-lenken.");
    }
    if (buf.byteLength > 40 * 1024 * 1024) throw new Error("Filen er større enn 40 MB.");

    const path = `${new Date().getFullYear()}/${Date.now()}-${safeName(data.title)}.pdf`;
    const { error: upErr } = await supabaseAdmin!.storage
      .from("manuals")
      .upload(path, buf, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { data: row, error } = await supabaseAdmin!
      .from("manuals")
      .insert({
        title: data.title,
        brand: data.brand ?? null,
        model: data.model ?? null,
        category: data.category ?? null,
        source_url: data.url,
        file_path: path,
        file_size: buf.byteLength,
        notes: data.notes ?? null,
        added_by: data.addedBy ?? null,
      })
      .select(MANUAL_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as ManualRow;
  });

export const saveManualUpload = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        base64: z.string().min(10),
        title: z.string().min(1).max(200),
        brand: z.string().max(120).optional().nullable(),
        model: z.string().max(120).optional().nullable(),
        category: z.string().max(80).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
        addedBy: z.string().max(60).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<ManualRow> => {
    await requireHouseAuth();
    const raw = data.base64.includes(",") ? data.base64.split(",")[1] : data.base64;
    const bin = atob(raw);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const isPdf = buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    if (!isPdf) throw new Error("Filen er ikke en PDF.");
    if (buf.byteLength > 40 * 1024 * 1024) throw new Error("Filen er større enn 40 MB.");

    const path = `${new Date().getFullYear()}/${Date.now()}-${safeName(data.title)}.pdf`;
    const { error: upErr } = await supabaseAdmin!.storage
      .from("manuals")
      .upload(path, buf, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { data: row, error } = await supabaseAdmin!
      .from("manuals")
      .insert({
        title: data.title,
        brand: data.brand ?? null,
        model: data.model ?? null,
        category: data.category ?? null,
        file_path: path,
        file_size: buf.byteLength,
        notes: data.notes ?? null,
        added_by: data.addedBy ?? null,
      })
      .select(MANUAL_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as ManualRow;
  });
