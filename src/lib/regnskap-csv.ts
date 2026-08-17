// CSV-import for regnskapet: fleksibel parser for norske bankeksporter.
// Kjører i nettleseren (ingen server-avhengigheter) og produserer rene rader
// som sendes videre til serverfunksjonen for lagring.

export type ParsedTx = {
  tx_date: string; // YYYY-MM-DD
  booked_date: string | null;
  description: string;
  counterparty: string | null;
  amount: number; // negativ = utgift
  currency: string;
  bank_type: string | null;
  bank_subtype: string | null;
  account: string | null;
  to_account: string | null;
  reference: string | null;
  bank_status: string | null;
  raw: Record<string, string>;
};

export type ParseResult = {
  rows: ParsedTx[];
  headers: string[];
  errors: { line: number; message: string; raw: string }[];
  delimiter: string;
};

/** Leser filen med riktig tegnsett (UTF-8, ellers ISO-8859-1/Windows-1252). */
export async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return stripBom(text);
  } catch {
    return stripBom(new TextDecoder("windows-1252").decode(buf));
  }
}

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

function detectDelimiter(headerLine: string): string {
  const cands = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = -1;
  for (const d of cands) {
    const n = headerLine.split(d).length - 1;
    if (n > bestCount) {
      bestCount = n;
      best = d;
    }
  }
  return best;
}

/** Enkel CSV-splitter som håndterer anførselstegn og escapede anførselstegn. */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Deler tekst i linjer, men respekterer linjeskift inne i anførselstegn. */
function splitRecords(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQ = !inQ;
      cur += ch;
    } else if (!inQ && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.filter((l) => l.trim().length > 0);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    .replace(/[^a-z0-9]/g, "");

function findCol(headers: string[], candidates: string[], exclude: string[] = []): number {
  const nh = headers.map(norm);
  for (const c of candidates) {
    const nc = norm(c);
    const i = nh.findIndex((h) => h === nc);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const nc = norm(c);
    const i = nh.findIndex((h) => h.includes(nc) && !exclude.some((e) => h.includes(norm(e))));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseNorwegianNumber(input: string): number | null {
  if (!input) return null;
  let s = input.replace(/\u00a0/g, " ").replace(/\s/g, "").replace(/kr/gi, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Komma som tusenskille hvis det følges av nøyaktig 3 sifre flere steder
    const parts = s.split(",");
    if (parts.length > 2 || parts[1]?.length === 3) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export function parseDate(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/.exec(s);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = Number(y) > 70 ? `19${y}` : `20${y}`;
    return `${y}-${mo}-${d}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/** Nøkkel for duplikatkontroll: dato + beskrivelse + beløp (ikke konto). */
export function dedupeKey(date: string, description: string, amount: number): string {
  const desc = description
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return `${date}|${desc}|${amount.toFixed(2)}`;
}

export function parseBankCsv(text: string): ParseResult {
  const lines = splitRecords(text);
  const errors: ParseResult["errors"] = [];
  if (lines.length === 0) return { rows: [], headers: [], errors, delimiter: ";" };

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter).map((h) => h.replace(/^"|"$/g, ""));

  const iDate = findCol(headers, [
    "utført dato", "utfort dato", "transaksjonsdato", "dato", "date", "betalingsdato",
  ], ["bokf", "rente", "valuter"]);
  const iBooked = findCol(headers, ["bokført dato", "bokfort dato", "bokføringsdato", "valuteringsdato"]);
  const iDesc = findCol(headers, ["beskrivelse", "tekst", "forklaring", "melding til", "description", "narrative"]);
  const iAmount = findCol(headers, ["beløp", "belop", "amount", "sum"], ["inn", "ut", "inn/ut", "valuta"]);
  const iIn = findCol(headers, ["beløp inn", "belop inn", "inn", "kredit", "credit", "innbetalt"]);
  const iOut = findCol(headers, ["beløp ut", "belop ut", "ut", "debet", "debit", "utbetalt"]);
  const iCcy = findCol(headers, ["valuta", "currency"]);
  const iType = findCol(headers, ["type"], ["under"]);
  const iSub = findCol(headers, ["undertype", "subtype"]);
  const iFrom = findCol(headers, ["fra konto", "konto", "kontonummer", "account"], ["til"]);
  const iTo = findCol(headers, ["til konto"]);
  const iRecipient = findCol(headers, ["mottakernavn", "mottaker", "avsender", "motpart", "navn"]);
  const iRef = findCol(headers, ["melding/kid/fakt.nr", "melding", "kid", "referanse", "arkivreferanse"]);
  const iStatus = findCol(headers, ["status"]);

  const rows: ParsedTx[] = [];

  for (let li = 1; li < lines.length; li++) {
    const raw = lines[li];
    const cells = splitLine(raw, delimiter).map((c) => c.replace(/^"|"$/g, ""));
    if (cells.every((c) => !c)) continue;
    const get = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : "");

    const date = parseDate(get(iDate)) ?? parseDate(get(iBooked));
    if (!date) {
      errors.push({ line: li + 1, message: "Fant ingen gyldig dato", raw });
      continue;
    }

    let amount: number | null = null;
    const inV = iIn >= 0 ? parseNorwegianNumber(get(iIn)) : null;
    const outV = iOut >= 0 ? parseNorwegianNumber(get(iOut)) : null;
    if (inV !== null && inV !== 0) amount = Math.abs(inV);
    else if (outV !== null && outV !== 0) amount = -Math.abs(outV);
    else if (iAmount >= 0) amount = parseNorwegianNumber(get(iAmount));
    if (amount === null) {
      errors.push({ line: li + 1, message: "Fant ingen gyldig beløp", raw });
      continue;
    }

    const rawObj: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = get(i);
      if (v) rawObj[h] = v;
    });

    const description = get(iDesc) || get(iRecipient) || get(iType) || "(uten beskrivelse)";

    rows.push({
      tx_date: date,
      booked_date: parseDate(get(iBooked)),
      description,
      counterparty: get(iRecipient) || null,
      amount,
      currency: (get(iCcy) || "NOK").toUpperCase().slice(0, 6),
      bank_type: get(iType) || null,
      bank_subtype: get(iSub) || null,
      account: get(iFrom) || null,
      to_account: get(iTo) || null,
      reference: get(iRef) || null,
      bank_status: get(iStatus) || null,
      raw: rawObj,
    });
  }

  return { rows, headers, errors, delimiter };
}
