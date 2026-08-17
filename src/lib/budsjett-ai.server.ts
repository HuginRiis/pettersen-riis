// AI-uthenting av transaksjoner fra kontoutskrift (CSV, PDF eller bilde).
const MODEL = "google/gemini-2.5-flash";

export type AiTx = {
  date: string;
  description: string;
  amount: number;
  category: string;
  type: "expense" | "income";
  note?: string;
};

export type AiExtractResult = {
  transactions: AiTx[];
  account?: string;
  stats?: { inputRows?: number; chunks?: number; extracted?: number };
};

function buildSystemPrompt(catList: string) {
  return (
    "Du leser norske kontoutskrifter (PDF, bilde eller CSV-eksport fra nettbank) og henter ut ALLE transaksjoner. " +
    "Hopp ALDRI over transaksjoner pga plass — ta med absolutt alle linjer i input, også om det er flere hundre. " +
    "Ikke slå sammen, ikke oppsummer, ikke forkort: én transaksjon inn = én transaksjon ut. " +
    "For hver transaksjon: dato (YYYY-MM-DD), beskrivelse (butikk/mottaker), beløp (positiv = inntekt/innskudd, negativ = utgift/uttak), foreslått kategori, type ('expense' eller 'income'). " +
    "VIKTIGE REGLER: " +
    "1) Lønnsinnbetalinger skal tas med som type 'income' med nærmeste inntektskategori i lista. " +
    "2) Bruk KUN kategorier fra denne lista: " + catList + ". Hvis ingen passer, bruk 'Annet'. " +
    "3) Eksempler: Kantine/Spisested/Kafé → 'Restaurant og kafé'. Kiwi/Rema/Coop/Meny → 'Mat og dagligvarer'. Circle K/Shell/Esso → 'Drivstoff'. Netflix/Spotify → 'Abonnementer'. Apotek → 'Helse og apotek'. " +
    "4) Ikke ta med saldolinjer eller oppsummeringer — kun faktiske transaksjoner. " +
    "5) For CSV: tolk semikolon eller komma som skilletegn, norsk dato (dd.mm.yyyy) konverteres til YYYY-MM-DD, norsk tallformat (komma som desimal, mellomrom som tusenskille) konverteres til standard tall. " +
    "6) KONTO: prøv å identifisere hvilken konto utskriften gjelder fra topptekst/kontonummer og returner 'account' som 'john', 'hege' eller 'utgift' (bruk 'utgift' hvis usikker). " +
    "Returner kun via funksjonskallet."
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, init: RequestInit, tries = 4): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, init);
    if (res.ok || (res.status !== 429 && res.status < 500)) return res;
    last = res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(8000, 800 * 2 ** i) + Math.random() * 400;
    if (i < tries - 1) await sleep(wait);
  }
  return last as Response;
}

async function callAI(systemPrompt: string, userContent: unknown): Promise<AiExtractResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

  const res = await fetchWithRetry("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_transactions",
            description: "Strukturerte transaksjoner fra kontoutskrift",
            parameters: {
              type: "object",
              properties: {
                account: { type: "string", enum: ["john", "hege", "utgift"] },
                transactions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: { type: "string", description: "YYYY-MM-DD" },
                      description: { type: "string" },
                      amount: { type: "number" },
                      category: { type: "string" },
                      type: { type: "string", enum: ["expense", "income"] },
                      note: { type: "string" },
                    },
                    required: ["date", "description", "amount", "category", "type"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["transactions"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_transactions" } },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("For mange forespørsler mot AI. Prøv igjen om litt.");
    if (res.status === 402) throw new Error("AI-kredittene er tomme.");
    if (res.status >= 500)
      throw new Error(
        `AI-tjenesten er midlertidig utilgjengelig (${res.status}). Prøv igjen om et minutt, eller last opp CSV i stedet.`,
      );
    const t = await res.text().catch(() => "");
    throw new Error(`AI feilet (${res.status})${t ? `: ${t.slice(0, 200)}` : ""}`);
  }

  const data = (await res.json()) as any;
  const argsStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) throw new Error("Klarte ikke tolke kontoutskriften");
  const parsed = JSON.parse(argsStr);
  return { transactions: (parsed?.transactions ?? []) as AiTx[], account: parsed?.account };
}

function chunkCsv(csv: string, maxLines = 60): { text: string; rows: number }[] {
  const lines = csv.split(/\r?\n/);
  const header = lines[0] ?? "";
  const rest = lines.slice(1).filter((l) => l.trim().length > 0);
  const chunks: { text: string; rows: number }[] = [];
  for (let i = 0; i < rest.length; i += maxLines) {
    const slice = rest.slice(i, i + maxLines);
    chunks.push({ text: [header, ...slice].join("\n"), rows: slice.length });
  }
  return chunks.length ? chunks : [{ text: csv, rows: rest.length }];
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function extractStatement(input: {
  csvText?: string | null;
  fileDataUrl?: string | null;
  categories: string[];
}): Promise<AiExtractResult> {
  const catList = input.categories.length
    ? input.categories.join(", ")
    : "Mat og dagligvarer, Drivstoff, Transport, Restaurant og kafé, Abonnementer, Klær og sko, Helse og apotek, Vedlikehold hus, Annet";
  const systemPrompt = buildSystemPrompt(catList);

  let all: AiTx[] = [];
  let account: string | undefined;
  const stats: AiExtractResult["stats"] = {};

  if (input.csvText) {
    const chunks = chunkCsv(input.csvText, 60);
    stats.inputRows = chunks.reduce((a, c) => a + c.rows, 0);
    stats.chunks = chunks.length;
    const results = await runWithConcurrency(chunks, 3, async (chunk, i) => {
      const userContent = [
        {
          type: "text",
          text: `Les denne CSV-kontoutskriften (del ${i + 1} av ${chunks.length}) og hent ut ALLE ${chunk.rows} transaksjonslinjene etter reglene:\n\n${chunk.text}`,
        },
      ];
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await callAI(systemPrompt, userContent);
          if (r.transactions.length >= Math.floor(chunk.rows * 0.6) || attempt === 1) return r;
        } catch (err) {
          if (attempt === 1) throw err;
        }
      }
      return { transactions: [] as AiTx[] };
    });
    all = results.flatMap((r) => r.transactions);
    account = results.find((r) => r.account)?.account;
  } else if (input.fileDataUrl) {
    const isPdf = /^data:application\/pdf/i.test(input.fileDataUrl);
    const mediaBlock = isPdf
      ? { type: "file", file: { filename: input.fileName || "kontoutskrift.pdf", file_data: input.fileDataUrl } }
      : { type: "image_url", image_url: { url: input.fileDataUrl } };
    const r = await callAI(systemPrompt, [
      {
        type: "text",
        text: "Les denne kontoutskriften og hent ut ALLE transaksjoner etter reglene. Ta med hver eneste linje.",
      },
      mediaBlock,
    ]);
    all = r.transactions;
    account = r.account;
  } else {
    throw new Error("Mangler fil eller CSV-innhold");
  }

  const seen = new Set<string>();
  const deduped = all.filter((t) => {
    const k = `${t.date}|${Math.round((Number(t.amount) || 0) * 100)}|${(t.description || "").trim().toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  stats.extracted = deduped.length;

  return { transactions: deduped, account, stats };
}
