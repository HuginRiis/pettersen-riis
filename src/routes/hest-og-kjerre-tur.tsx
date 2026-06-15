import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { Upload, Trash2 } from "lucide-react";
import hallTurer from "@/assets/got-turer.jpg";

export const Route = createFileRoute("/hest-og-kjerre-tur")({
  head: () => ({
    meta: [
      { title: "Hest og kjerre tur — House Pettersen Riis" },
      {
        name: "description",
        content:
          "Importer CSV med kjøreturer og se gjennomsnitt, totaler og effektivitet for hest og kjerre.",
      },
    ],
  }),
  component: HestOgKjerreTurPage,
});

type Trip = {
  startDato: string;
  startKl: string;
  sluttDato: string;
  sluttKl: string;
  startPos: string;
  startKoord: string;
  sluttPos: string;
  endeKoord: string;
  varighet: string; // TT:MM
  varighetMin: number;
  distanseKm: number;
  snittKmt: number;
  energyRegenKwh: number;
  effektivitet: number; // % eller tall
};

// ── Hjelp ──────────────────────────────────────────────────────────────
function parseNumber(v: string): number {
  if (!v) return NaN;
  const s = v.replace(/\s/g, "").replace("%", "").replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

function parseVarighet(v: string): number {
  if (!v) return 0;
  const parts = v.split(":").map((x) => parseInt(x, 10));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  const n = parseNumber(v);
  return isFinite(n) ? n : 0;
}

function minToHHMM(min: number): string {
  if (!isFinite(min) || min <= 0) return "00:00";
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectSep(headerLine: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = -1;
  for (const c of candidates) {
    const n = splitCsvLine(headerLine, c).length;
    if (n > bestCount) {
      bestCount = n;
      best = c;
    }
  }
  return best;
}

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[()/.\\-]/g, "")
    .replace(/\s+/g, "")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/æ/g, "ae");
}

const HEADER_MAP: Record<string, keyof Trip> = {
  startdato: "startDato",
  startklokkeslett: "startKl",
  sluttdato: "sluttDato",
  sluttidspunkt: "sluttKl",
  startposisjon: "startPos",
  startkoordinater: "startKoord",
  sluttposisjon: "sluttPos",
  endekoordinater: "endeKoord",
  varighetttmm: "varighet",
  varighet: "varighet",
  distansekm: "distanseKm",
  gjennomsnittshastighetkmt: "snittKmt",
  energyregeneratedkwh: "energyRegenKwh",
  effektivitet: "effektivitet",
};

function parseCsv(text: string): Trip[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const sep = detectSep(lines[0]);
  const headers = splitCsvLine(lines[0], sep).map(normHeader);
  const idx: Partial<Record<keyof Trip, number>> = {};
  headers.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key) idx[key] = i;
  });

  const trips: Trip[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], sep);
    const get = (k: keyof Trip) => (idx[k] != null ? cols[idx[k]!] ?? "" : "");
    const varighet = get("varighet");
    const t: Trip = {
      startDato: get("startDato"),
      startKl: get("startKl"),
      sluttDato: get("sluttDato"),
      sluttKl: get("sluttKl"),
      startPos: get("startPos"),
      startKoord: get("startKoord"),
      sluttPos: get("sluttPos"),
      endeKoord: get("endeKoord"),
      varighet,
      varighetMin: parseVarighet(varighet),
      distanseKm: parseNumber(get("distanseKm")) || 0,
      snittKmt: parseNumber(get("snittKmt")) || 0,
      energyRegenKwh: parseNumber(get("energyRegenKwh")) || 0,
      effektivitet: parseNumber(get("effektivitet")) || 0,
    };
    if (!t.startDato && !t.distanseKm && !t.varighetMin) continue;
    trips.push(t);
  }
  return trips;
}

const STORAGE_KEY = "hest-og-kjerre-trips-v1";

function HestOgKjerreTurPage() {
  const [trips, setTrips] = useState<Trip[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Trip[]) : [];
    } catch {
      return [];
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function persist(next: Trip[]) {
    setTrips(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  async function handleFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setError("Fant ingen rader. Sjekk at CSV har de forventede kolonnene.");
        return;
      }
      setFileName(file.name);
      persist(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klarte ikke lese fil.");
    }
  }

  const stats = useMemo(() => computeStats(trips), [trips]);

  return (
    <PageShell>
      <PageHero
        eyebrow="Reisedagbok"
        title="Hest og kjerre tur"
        subtitle="Importer CSV fra kjerren og se totaler, gjennomsnitt og effektivitet."
        image={hallTurer}
        compact
      />

      <section className="container mx-auto px-4 py-8 space-y-8">
        {/* Import */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Importer CSV</h2>
              <p className="text-sm text-muted-foreground">
                Forventede kolonner: Startdato, Startklokkeslett, Sluttdato,
                Sluttidspunkt, Startposisjon, Startkoordinater, Sluttposisjon,
                Endekoordinater, Varighet (TT:MM), Distanse (km),
                Gjennomsnittshastighet (km/t), Energy Regenerated (kWh),
                Effektivitet.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer hover:opacity-90">
                <Upload className="w-4 h-4" />
                <span>Velg CSV</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {trips.length > 0 && (
                <button
                  onClick={() => {
                    persist([]);
                    setFileName(null);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border hover:bg-muted"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Tøm</span>
                </button>
              )}
            </div>
          </div>
          {fileName && (
            <p className="text-xs text-muted-foreground mt-3">
              Lastet inn: <span className="font-mono">{fileName}</span> ({trips.length} turer)
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive mt-3">{error}</p>
          )}
        </div>

        {trips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            Ingen turer importert ennå. Velg en CSV for å se statistikk.
          </div>
        ) : (
          <>
            {/* Totaler */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Totaler</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Antall turer" value={String(stats.count)} />
                <StatCard
                  label="Total distanse"
                  value={`${stats.totalKm.toFixed(1)} km`}
                />
                <StatCard
                  label="Total tid"
                  value={minToHHMM(stats.totalMin)}
                />
                <StatCard
                  label="Total regen."
                  value={`${stats.totalKwh.toFixed(2)} kWh`}
                />
              </div>
            </div>

            {/* Gjennomsnitt */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Gjennomsnitt per tur</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Snitt distanse"
                  value={`${stats.avgKm.toFixed(2)} km`}
                />
                <StatCard
                  label="Snitt varighet"
                  value={minToHHMM(stats.avgMin)}
                />
                <StatCard
                  label="Snitt hastighet"
                  value={`${stats.avgSpeed.toFixed(1)} km/t`}
                />
                <StatCard
                  label="Snitt effektivitet"
                  value={`${stats.avgEff.toFixed(1)}`}
                />
                <StatCard
                  label="Snitt regen."
                  value={`${stats.avgKwh.toFixed(2)} kWh`}
                />
                <StatCard
                  label="Regen per km"
                  value={`${stats.kwhPerKm.toFixed(3)} kWh/km`}
                />
                <StatCard
                  label="Samlet snittfart"
                  value={`${stats.overallSpeed.toFixed(1)} km/t`}
                />
                <StatCard
                  label="Median distanse"
                  value={`${stats.medianKm.toFixed(2)} km`}
                />
              </div>
            </div>

            {/* Topp/bunn */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Rekorder</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <RecordCard
                  label="Lengste tur"
                  value={`${stats.maxKm.value.toFixed(1)} km`}
                  sub={tripLabel(stats.maxKm.trip)}
                />
                <RecordCard
                  label="Lengste varighet"
                  value={minToHHMM(stats.maxMin.value)}
                  sub={tripLabel(stats.maxMin.trip)}
                />
                <RecordCard
                  label="Høyeste snittfart"
                  value={`${stats.maxSpeed.value.toFixed(1)} km/t`}
                  sub={tripLabel(stats.maxSpeed.trip)}
                />
                <RecordCard
                  label="Best effektivitet"
                  value={`${stats.maxEff.value.toFixed(1)}`}
                  sub={tripLabel(stats.maxEff.trip)}
                />
                <RecordCard
                  label="Mest regenerert"
                  value={`${stats.maxKwh.value.toFixed(2)} kWh`}
                  sub={tripLabel(stats.maxKwh.trip)}
                />
                <RecordCard
                  label="Korteste tur"
                  value={`${stats.minKm.value.toFixed(2)} km`}
                  sub={tripLabel(stats.minKm.trip)}
                />
              </div>
            </div>

            {/* Tabell */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Alle turer</h2>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <Th>Start</Th>
                      <Th>Slutt</Th>
                      <Th>Fra</Th>
                      <Th>Til</Th>
                      <Th className="text-right">Varighet</Th>
                      <Th className="text-right">Km</Th>
                      <Th className="text-right">km/t</Th>
                      <Th className="text-right">kWh</Th>
                      <Th className="text-right">Eff.</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map((t, i) => (
                      <tr
                        key={i}
                        className="border-t border-border hover:bg-muted/30"
                      >
                        <Td>
                          {t.startDato} {t.startKl}
                        </Td>
                        <Td>
                          {t.sluttDato} {t.sluttKl}
                        </Td>
                        <Td>{t.startPos}</Td>
                        <Td>{t.sluttPos}</Td>
                        <Td className="text-right font-mono">{t.varighet}</Td>
                        <Td className="text-right font-mono">
                          {t.distanseKm.toFixed(1)}
                        </Td>
                        <Td className="text-right font-mono">
                          {t.snittKmt.toFixed(1)}
                        </Td>
                        <Td className="text-right font-mono">
                          {t.energyRegenKwh.toFixed(2)}
                        </Td>
                        <Td className="text-right font-mono">
                          {t.effektivitet.toFixed(1)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </PageShell>
  );
}

function tripLabel(t: Trip | null): string {
  if (!t) return "—";
  const place = t.startPos || t.sluttPos || "";
  return [t.startDato, place].filter(Boolean).join(" · ");
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1 font-mono">{value}</div>
    </div>
  );
}

function RecordCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1 font-mono">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 font-medium text-muted-foreground ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 whitespace-nowrap ${className}`}>{children}</td>;
}

function computeStats(trips: Trip[]) {
  const count = trips.length;
  const empty = {
    count: 0,
    totalKm: 0,
    totalMin: 0,
    totalKwh: 0,
    avgKm: 0,
    avgMin: 0,
    avgSpeed: 0,
    avgEff: 0,
    avgKwh: 0,
    kwhPerKm: 0,
    overallSpeed: 0,
    medianKm: 0,
    maxKm: { value: 0, trip: null as Trip | null },
    minKm: { value: 0, trip: null as Trip | null },
    maxMin: { value: 0, trip: null as Trip | null },
    maxSpeed: { value: 0, trip: null as Trip | null },
    maxEff: { value: 0, trip: null as Trip | null },
    maxKwh: { value: 0, trip: null as Trip | null },
  };
  if (count === 0) return empty;

  const totalKm = trips.reduce((s, t) => s + t.distanseKm, 0);
  const totalMin = trips.reduce((s, t) => s + t.varighetMin, 0);
  const totalKwh = trips.reduce((s, t) => s + t.energyRegenKwh, 0);
  const sumSpeed = trips.reduce((s, t) => s + t.snittKmt, 0);
  const sumEff = trips.reduce((s, t) => s + t.effektivitet, 0);

  const sortedKm = [...trips].map((t) => t.distanseKm).sort((a, b) => a - b);
  const mid = Math.floor(sortedKm.length / 2);
  const medianKm =
    sortedKm.length % 2 === 0
      ? (sortedKm[mid - 1] + sortedKm[mid]) / 2
      : sortedKm[mid];

  const pickMax = (key: (t: Trip) => number) => {
    let best = trips[0];
    for (const t of trips) if (key(t) > key(best)) best = t;
    return { value: key(best), trip: best };
  };
  const pickMin = (key: (t: Trip) => number) => {
    let best = trips[0];
    for (const t of trips) if (key(t) < key(best)) best = t;
    return { value: key(best), trip: best };
  };

  return {
    count,
    totalKm,
    totalMin,
    totalKwh,
    avgKm: totalKm / count,
    avgMin: totalMin / count,
    avgSpeed: sumSpeed / count,
    avgEff: sumEff / count,
    avgKwh: totalKwh / count,
    kwhPerKm: totalKm > 0 ? totalKwh / totalKm : 0,
    overallSpeed: totalMin > 0 ? totalKm / (totalMin / 60) : 0,
    medianKm,
    maxKm: pickMax((t) => t.distanseKm),
    minKm: pickMin((t) => t.distanseKm),
    maxMin: pickMax((t) => t.varighetMin),
    maxSpeed: pickMax((t) => t.snittKmt),
    maxEff: pickMax((t) => t.effektivitet),
    maxKwh: pickMax((t) => t.energyRegenKwh),
  };
}
