// Beregninger for Jaguar-kjøreloggen: parsing av CSV og statistikk.
import type { CarTrip } from "@/lib/car-trips.functions";

export type ParsedTrip = {
  start_ts: string;
  end_ts: string | null;
  start_place: string | null;
  start_lat: number | null;
  start_lon: number | null;
  end_place: string | null;
  end_lat: number | null;
  end_lon: number | null;
  duration_min: number | null;
  distance_km: number;
  avg_speed_kmh: number | null;
  energy_regen_kwh: number | null;
  efficiency_kwh_100km: number | null;
};

/** Enkel CSV-splitter som håndterer anførselstegn og komma inni felt. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const v = Number(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

/** "14.08.2026" + "14:43" → ISO-streng (lokal tid, Norge). */
function toIso(date: string, time: string): string | null {
  const m = /^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/.exec(date.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const t = /^(\d{1,2}):(\d{2})/.exec((time || "00:00").trim());
  const hh = t ? t[1].padStart(2, "0") : "00";
  const mi = t ? t[2] : "00";
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:00+02:00`;
}

function coords(s: string | undefined): [number | null, number | null] {
  if (!s) return [null, null];
  const parts = s.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return [null, null];
  return [parts[0], parts[1]];
}

function durationToMin(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d+):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Leser Jaguar/InControl-eksporten (Trips.csv).
 * Kolonner: Startdato, Startklokkeslett, Sluttdato, Sluttidspunkt, Startposisjon,
 * Startkoordinater, Sluttposisjon, Endekoordinater, Varighet, Distanse, Snittfart,
 * Energy Regenerated, Effektivitet.
 */
export function parseTripsCsv(text: string): { trips: ParsedTrip[]; skipped: number } {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { trips: [], skipped: 0 };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (frag: string) => header.findIndex((h) => h.includes(frag));

  const iStartDate = idx("startdato") >= 0 ? idx("startdato") : 0;
  const iStartTime = idx("startklokke") >= 0 ? idx("startklokke") : 1;
  const iEndDate = idx("sluttdato") >= 0 ? idx("sluttdato") : 2;
  const iEndTime = idx("sluttid") >= 0 ? idx("sluttid") : 3;
  const iStartPos = idx("startposisjon");
  const iStartCoord = idx("startkoordinat");
  const iEndPos = idx("sluttposisjon");
  const iEndCoord = idx("endekoordinat") >= 0 ? idx("endekoordinat") : idx("sluttkoordinat");
  const iDur = idx("varighet");
  const iDist = idx("distanse");
  const iSpeed = idx("hastighet");
  const iRegen = idx("regenerat");
  const iEff = idx("effektivitet");

  const trips: ParsedTrip[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    const startIso = toIso(c[iStartDate] ?? "", c[iStartTime] ?? "");
    const dist = num(c[iDist]);
    if (!startIso || dist == null) {
      skipped++;
      continue;
    }
    const [slat, slon] = coords(c[iStartCoord]);
    const [elat, elon] = coords(c[iEndCoord]);
    trips.push({
      start_ts: startIso,
      end_ts: toIso(c[iEndDate] ?? c[iStartDate] ?? "", c[iEndTime] ?? ""),
      start_place: c[iStartPos] || null,
      start_lat: slat,
      start_lon: slon,
      end_place: c[iEndPos] || null,
      end_lat: elat,
      end_lon: elon,
      duration_min: durationToMin(c[iDur]),
      distance_km: dist,
      avg_speed_kmh: num(c[iSpeed]),
      energy_regen_kwh: num(c[iRegen]),
      efficiency_kwh_100km: num(c[iEff]),
    });
  }
  return { trips, skipped };
}

/* ------------------------------- statistikk ------------------------------- */

export const WEEKDAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

export const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
};

export type Bucket = {
  key: string;
  label: string;
  km: number;
  trips: number;
  minutes: number;
  kwh: number;
  regen: number;
};

function emptyBucket(key: string, label: string): Bucket {
  return { key, label, km: 0, trips: 0, minutes: 0, kwh: 0, regen: 0 };
}

const tripKwh = (t: Pick<CarTrip, "distance_km" | "efficiency_kwh_100km">) =>
  t.efficiency_kwh_100km != null ? (t.distance_km * t.efficiency_kwh_100km) / 100 : 0;

function addToBucket(b: Bucket, t: CarTrip) {
  b.km += t.distance_km;
  b.trips += 1;
  b.minutes += t.duration_min ?? 0;
  b.kwh += tripKwh(t);
  b.regen += t.energy_regen_kwh ?? 0;
}

export type TripStats = {
  count: number;
  totalKm: number;
  totalMinutes: number;
  totalKwh: number;
  totalRegen: number;
  avgSpeed: number;
  avgEfficiency: number;
  avgTripKm: number;
  avgTripMin: number;
  firstDate: Date | null;
  lastDate: Date | null;
  spanDays: number;
  activeDays: number;
  perDay: Bucket[];
  perWeek: Bucket[];
  perMonth: Bucket[];
  avgPerDay: { km: number; trips: number; minutes: number; kwh: number; projectedKm: number };
  avgPerActiveDay: { km: number; trips: number; minutes: number; kwh: number; projectedKm: number };
  avgPerWeek: { km: number; trips: number; minutes: number; kwh: number; projectedKm: number };
  avgPerMonth: { km: number; trips: number; minutes: number; kwh: number; projectedKm: number };
  byWeekday: { label: string; km: number; trips: number }[];
  byHour: { hour: string; trips: number; km: number }[];
  topPlaces: { place: string; visits: number; km: number; lat: number | null; lon: number | null }[];
  longest: CarTrip | null;
  fastest: CarTrip | null;
  mostEfficient: CarTrip | null;
  leastEfficient: CarTrip | null;
  busiestDay: Bucket | null;
};

const shortPlace = (p: string | null) => {
  if (!p) return "Ukjent";
  const parts = p.split(",");
  return parts.length > 1 ? `${parts[0].trim()}, ${parts[1].trim()}` : p.trim();
};

export function computeStats(trips: CarTrip[]): TripStats {
  const sorted = [...trips].sort(
    (a, b) => new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime(),
  );

  const perDayMap = new Map<string, Bucket>();
  const perWeekMap = new Map<string, Bucket>();
  const perMonthMap = new Map<string, Bucket>();
  const weekdayArr = WEEKDAYS.map((label) => ({ label, km: 0, trips: 0 }));
  const hourArr = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, "0")}`,
    trips: 0,
    km: 0,
  }));
  const placeMap = new Map<
    string,
    { place: string; visits: number; km: number; latSum: number; lonSum: number; geo: number }
  >();

  let totalKm = 0;
  let totalMinutes = 0;
  let totalKwh = 0;
  let totalRegen = 0;
  let longest: CarTrip | null = null;
  let fastest: CarTrip | null = null;
  let mostEfficient: CarTrip | null = null;
  let leastEfficient: CarTrip | null = null;

  for (const t of sorted) {
    const d = new Date(t.start_ts);
    const dk = dayKey(d);
    if (!perDayMap.has(dk)) perDayMap.set(dk, emptyBucket(dk, dk.slice(8) + "." + dk.slice(5, 7)));
    addToBucket(perDayMap.get(dk)!, t);

    const { year, week } = isoWeek(d);
    const wk = `${year}-U${String(week).padStart(2, "0")}`;
    if (!perWeekMap.has(wk)) perWeekMap.set(wk, emptyBucket(wk, `Uke ${week}`));
    addToBucket(perWeekMap.get(wk)!, t);

    const mk = dk.slice(0, 7);
    if (!perMonthMap.has(mk)) perMonthMap.set(mk, emptyBucket(mk, monthLabel(mk)));
    addToBucket(perMonthMap.get(mk)!, t);

    const wd = (d.getDay() + 6) % 7;
    weekdayArr[wd].km += t.distance_km;
    weekdayArr[wd].trips += 1;

    hourArr[d.getHours()].trips += 1;
    hourArr[d.getHours()].km += t.distance_km;

    const key = shortPlace(t.end_place);
    const p =
      placeMap.get(key) ?? { place: key, visits: 0, km: 0, latSum: 0, lonSum: 0, geo: 0 };
    p.visits += 1;
    p.km += t.distance_km;
    if (t.end_lat != null && t.end_lon != null) {
      p.latSum += t.end_lat;
      p.lonSum += t.end_lon;
      p.geo += 1;
    }
    placeMap.set(key, p);

    totalKm += t.distance_km;
    totalMinutes += t.duration_min ?? 0;
    totalKwh += tripKwh(t);
    totalRegen += t.energy_regen_kwh ?? 0;

    if (!longest || t.distance_km > longest.distance_km) longest = t;
    if (t.avg_speed_kmh != null && (!fastest || t.avg_speed_kmh > (fastest.avg_speed_kmh ?? 0))) fastest = t;
    if (t.efficiency_kwh_100km != null && t.distance_km >= 3) {
      if (!mostEfficient || t.efficiency_kwh_100km < (mostEfficient.efficiency_kwh_100km ?? 999))
        mostEfficient = t;
      if (!leastEfficient || t.efficiency_kwh_100km > (leastEfficient.efficiency_kwh_100km ?? -1))
        leastEfficient = t;
    }
  }

  const perDay = [...perDayMap.values()];
  const perWeek = [...perWeekMap.values()];
  const perMonth = [...perMonthMap.values()];

  const firstDate = sorted.length ? new Date(sorted[0].start_ts) : null;
  const lastDate = sorted.length ? new Date(sorted[sorted.length - 1].start_ts) : null;
  const spanDays =
    firstDate && lastDate
      ? Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / 86400000) + 1)
      : 0;
  const activeDays = perDay.length;
  const count = sorted.length;

  const per = (divisor: number) => ({
    km: divisor ? totalKm / divisor : 0,
    trips: divisor ? count / divisor : 0,
    minutes: divisor ? totalMinutes / divisor : 0,
    kwh: divisor ? totalKwh / divisor : 0,
  });

  const busiestDay = perDay.reduce<Bucket | null>((acc, b) => (!acc || b.km > acc.km ? b : acc), null);

  return {
    count,
    totalKm,
    totalMinutes,
    totalKwh,
    totalRegen,
    avgSpeed: totalMinutes ? totalKm / (totalMinutes / 60) : 0,
    avgEfficiency: totalKm ? (totalKwh / totalKm) * 100 : 0,
    avgTripKm: count ? totalKm / count : 0,
    avgTripMin: count ? totalMinutes / count : 0,
    firstDate,
    lastDate,
    spanDays,
    activeDays,
    perDay,
    perWeek,
    perMonth,
    avgPerDay: { ...per(spanDays), projectedKm: spanDays ? (totalKm / spanDays) * 365 : 0 },
    avgPerActiveDay: { ...per(activeDays), projectedKm: activeDays ? (totalKm / activeDays) * 365 : 0 },
    avgPerWeek: { ...per(spanDays / 7), projectedKm: spanDays ? (totalKm / (spanDays / 7)) * 52 : 0 },
    avgPerMonth: { ...per(spanDays / 30.44), projectedKm: spanDays ? (totalKm / (spanDays / 30.44)) * 12 : 0 },
    byWeekday: weekdayArr,
    byHour: hourArr,
    topPlaces: [...placeMap.values()]
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10)
      .map((p) => ({
        place: p.place,
        visits: p.visits,
        km: p.km,
        lat: p.geo ? p.latSum / p.geo : null,
        lon: p.geo ? p.lonSum / p.geo : null,
      })),
    longest,
    fastest,
    mostEfficient,
    leastEfficient,
    busiestDay,
  };
}

export const fmtKm = (n: number) => `${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} km`;
export const fmtHm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} t ${m} min` : `${m} min`;
};
export const fmtKwh = (n: number) => `${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} kWh`;
