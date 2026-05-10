import { createFileRoute } from "@tanstack/react-router";
import { fetchHomeyInsightsLog, getHomeySnapshot } from "@/server/homey";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADDRESS_BORGEN = "Pbth Nordre Lensmannsveg 17";
const ADDRESS_HYTTA = "Pbth Øvre Bjørkesetvegen 222";

type Loc = "tollnes" | "hytta";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function nameMatches(name: string | undefined, address: string): boolean {
  if (!name) return false;
  const n = normalize(name);
  const tokens = normalize(address).split(/\s+/).filter(Boolean);
  return tokens.every((t) => n.includes(t));
}

function osloDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

function shiftDay(dayKey: string, days: number): string {
  // dayKey er "YYYY-MM-DD"
  const [y, m, d] = dayKey.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

type DailyPoint = { day: string; kwh: number };

/**
 * meter_kwh_yesterday oppdateres ved midnatt og holder verdien for *forrige* dag.
 * Vi trekker derfor 1 fra entry-tidspunktet for å få korrekt forbruksdag.
 */
function pointsFromYesterdayLog(entries: { t: string; v: number | null }[]): DailyPoint[] {
  const byDay = new Map<string, number>();
  for (const e of entries) {
    if (e.v == null || !Number.isFinite(e.v)) continue;
    const reportedDay = osloDateKey(e.t);
    const consumptionDay = shiftDay(reportedDay, -1);
    // Behold høyeste verdi observert for samme dag (i tilfelle flere oppdateringer)
    const prev = byDay.get(consumptionDay);
    if (prev == null || (e.v as number) > prev) byDay.set(consumptionDay, e.v as number);
  }
  return [...byDay.entries()].map(([day, kwh]) => ({ day, kwh }));
}

async function upsertDays(location: Loc, points: DailyPoint[]) {
  if (points.length === 0) return { written: 0, skipped: 0 };
  // Hent eksisterende rader for å unngå å overskrive ferskere kilder.
  const days = points.map((p) => p.day);
  const { data: existing } = await supabaseAdmin
    .from("tibber_daily_kwh")
    .select("day, source")
    .eq("location", location)
    .in("day", days);
  const existingMap = new Map<string, string>();
  (existing ?? []).forEach((r: any) => existingMap.set(r.day, r.source));

  // PBTH skal vinne over Pulse-tallene; bevar kun manuelle og tibber-snapshot.
  const PREFERRED = new Set(["tibber-snapshot", "manuell"]);
  const rows = points
    .filter((p) => p.kwh > 0)
    .filter((p) => {
      const src = existingMap.get(p.day);
      // Skriv hvis det ikke finnes, eller hvis kilden er en lavere prioritet (f.eks. tidligere homey-pbth)
      return !src || !PREFERRED.has(src);
    })
    .map((p) => ({
      location,
      day: p.day,
      kwh: p.kwh,
      source: "homey-pbth",
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return { written: 0, skipped: points.length };

  const { error } = await supabaseAdmin
    .from("tibber_daily_kwh")
    .upsert(rows, { onConflict: "location,day" });
  if (error) throw new Error(error.message);
  return { written: rows.length, skipped: points.length - rows.length };
}

export const Route = createFileRoute("/api/public/hooks/backfill-pbth-history")({
  server: {
    handlers: {
      GET: async () => handle(),
      POST: async () => handle(),
    },
  },
});

async function handle() {
  try {
    const snap = await getHomeySnapshot();
    if (!snap.ok) {
      return Response.json(
        { ok: false, error: snap.error ?? "Homey ikke tilgjengelig" },
        { status: 502 },
      );
    }

    const borgen = snap.devices.find((d) => nameMatches(d.name, ADDRESS_BORGEN));
    const hytta = snap.devices.find((d) => nameMatches(d.name, ADDRESS_HYTTA));

    const targets: { loc: Loc; device: typeof borgen }[] = [
      { loc: "tollnes", device: borgen },
      { loc: "hytta", device: hytta },
    ];

    // Capabilities som kan inneholde dagsverdier
    const CAP_CANDIDATES = [
      "meter_kwh_yesterday",
      "meter_consumption_yesterday",
    ];
    // Resolusjoner — start grovest for 12 mnd, fallbacks for kortere historikk
    const RESOLUTIONS = ["lastYear", "last6Months", "last3Months", "last31Days"];

    const report: any[] = [];

    for (const { loc, device } of targets) {
      if (!device) {
        report.push({ location: loc, error: "Fant ikke PBTH-enhet" });
        continue;
      }
      const capsAvailable = Object.keys(device.capabilities ?? {});
      let usedCap: string | null = null;
      let usedRes: string | null = null;
      let allPoints: DailyPoint[] = [];

      for (const cap of CAP_CANDIDATES) {
        if (!capsAvailable.includes(cap)) continue;
        for (const res of RESOLUTIONS) {
          const log = await fetchHomeyInsightsLog(device.id, cap, res);
          if (!log || log.__error) {
            report.push({ location: loc, cap, res, error: log?.__error ?? "ingen data" });
            continue;
          }
          const entries: { t: string; v: number | null }[] = Array.isArray(log.values)
            ? log.values
            : [];
          if (entries.length === 0) continue;
          const pts = pointsFromYesterdayLog(entries);
          if (pts.length > allPoints.length) {
            allPoints = pts;
            usedCap = cap;
            usedRes = res;
          }
        }
        if (allPoints.length > 0) break;
      }

      if (allPoints.length === 0) {
        report.push({
          location: loc,
          deviceId: device.id,
          name: device.name,
          capsAvailable,
          error: "Ingen Insights-data funnet",
        });
        continue;
      }

      const { written, skipped } = await upsertDays(loc, allPoints);
      report.push({
        location: loc,
        deviceId: device.id,
        usedCap,
        usedRes,
        points: allPoints.length,
        written,
        skipped,
        sampleFirst: allPoints.slice(0, 2),
        sampleLast: allPoints.slice(-2),
      });
    }

    return Response.json({ ok: true, report });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
