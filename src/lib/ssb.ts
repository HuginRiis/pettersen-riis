// SSB (Statistics Norway) PxWebApi v0 client — runs in browser (CORS is open).
// Docs: https://data.ssb.no/api/v0/

const BASE = "https://data.ssb.no/api/v0/no/table";

export type SsbVariable = {
  code: string;
  text: string;
  values: string[];
  valueTexts: string[];
  time?: boolean;
  elimination?: boolean;
};

export type SsbMetadata = {
  title: string;
  variables: SsbVariable[];
};

export async function fetchSsbMetadata(tableId: string): Promise<SsbMetadata> {
  const res = await fetch(`${BASE}/${tableId}?lang=no`);
  if (!res.ok) throw new Error(`SSB metadata ${tableId} feilet: ${res.status}`);
  return res.json();
}

export type SsbSelection = Record<string, string[]>; // dimensionCode -> selected values

export type SsbDataPoint = { __value: number | null; [dim: string]: string | number | null };

export type SsbResult = {
  title: string;
  dims: { code: string; text: string; codes: string[]; labels: string[] }[];
  rows: SsbDataPoint[];
};

export async function fetchSsbData(
  tableId: string,
  selection: SsbSelection,
): Promise<SsbResult> {
  const query = Object.entries(selection)
    .filter(([, vals]) => vals.length > 0)
    .map(([code, vals]) => ({
      code,
      selection: { filter: "item", values: vals },
    }));

  const body = {
    query,
    response: { format: "json-stat2" },
  };

  const res = await fetch(`${BASE}/${tableId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`SSB-forespørsel feilet (${res.status}): ${t.slice(0, 160)}`);
  }
  const json = await res.json();
  return parseJsonStat2(json);
}

function parseJsonStat2(json: any): SsbResult {
  const title: string = json.label ?? json.title ?? "";
  const ids: string[] = json.id ?? [];
  const sizes: number[] = json.size ?? [];
  const dimension = json.dimension ?? {};
  const values: number[] | Record<string, number> = json.value;

  const dims = ids.map((id) => {
    const d = dimension[id] ?? {};
    const cat = d.category ?? {};
    const index: Record<string, number> | string[] = cat.index ?? {};
    let codes: string[] = [];
    if (Array.isArray(index)) {
      codes = index;
    } else {
      codes = Object.keys(index).sort((a, b) => (index as any)[a] - (index as any)[b]);
    }
    const labelMap: Record<string, string> = cat.label ?? {};
    const labels = codes.map((c) => labelMap[c] ?? c);
    return { code: id, text: d.label ?? id, codes, labels };
  });

  // strides
  const strides: number[] = new Array(sizes.length).fill(1);
  for (let i = sizes.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }
  const total = sizes.reduce((a, b) => a * b, 1);

  const getValue = (flatIdx: number): number | null => {
    if (Array.isArray(values)) {
      const v = values[flatIdx];
      return v === null || v === undefined ? null : Number(v);
    }
    const v = (values as Record<string, number>)[String(flatIdx)];
    return v === null || v === undefined ? null : Number(v);
  };

  const rows: SsbDataPoint[] = [];
  for (let i = 0; i < total; i++) {
    const row: SsbDataPoint = { __value: getValue(i) };
    let rem = i;
    for (let d = 0; d < sizes.length; d++) {
      const pos = Math.floor(rem / strides[d]);
      rem = rem % strides[d];
      const dim = dims[d];
      row[dim.code] = dim.labels[pos];
    }
    rows.push(row);
  }

  return { title, dims, rows };
}

// Helper: pick top-N codes by latest value in a series dimension.
export function pickTopNByLatest(
  meta: SsbMetadata,
  seriesCode: string,
  n: number,
): string[] {
  const v = meta.variables.find((x) => x.code === seriesCode);
  if (!v) return [];
  return v.values.slice(0, Math.min(n, v.values.length));
}
