import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TIBBER_URL = "https://api.tibber.com/v1-beta/gql";

type Loc = "hytta" | "tollnes";

function classify(nick: string | null, addr: string | null): Loc | null {
  const hay = `${nick ?? ""} ${addr ?? ""}`.toLowerCase();
  if (hay.includes("bjørkeset") || hay.includes("bjorkeset") || hay.includes("hytt")) return "hytta";
  if (hay.includes("tollnes") || hay.includes("lensmann")) return "tollnes";
  return null;
}

async function tibberGql<T>(token: string, query: string): Promise<T> {
  const res = await fetch(TIBBER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = (await res.json()) as { data?: T; errors?: any };
  if (json.errors) throw new Error(`tibber: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json.data as T;
}

function osloDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

export async function snapshotTibberDailyToDb(): Promise<{
  saved: Array<{ location: Loc; day: string; kwh: number; cost: number | null }>;
  error?: string;
}> {
  const token = process.env.TIBBER_TOKEN;
  if (!token) return { saved: [], error: "TIBBER_TOKEN mangler" };

  try {
    // Hent siste 3 dager med daglig forbruk for hvert hjem (i dag, i går, i forgårs)
    // — slik at vi alltid fanger gårsdagen selv om jobben kjører tidlig/sent
    const data = await tibberGql<{
      viewer?: {
        homes?: Array<{
          id: string;
          appNickname: string | null;
          address: { address1: string | null } | null;
          daily?: { nodes: Array<{ from: string; consumption: number | null; cost: number | null }> };
        }>;
      };
    }>(
      token,
      `{ viewer { homes {
        id appNickname address { address1 }
        daily: consumption(resolution: DAILY, last: 3) {
          nodes { from consumption cost }
        }
      } } }`,
    );

    const homes = data?.viewer?.homes ?? [];

    const rows: Array<{ location: Loc; day: string; kwh: number; cost: number | null; source: string }> = [];

    for (const h of homes) {
      const loc = classify(h.appNickname, h.address?.address1 ?? null);
      if (!loc) continue;
      for (const n of h.daily?.nodes ?? []) {
        if (n.consumption == null) continue;
        const day = osloDateKey(n.from);
        // Lagrer alt — inkl. dagens (oppdateres hvert 2. min)
        rows.push({
          location: loc,
          day,
          kwh: Math.round(n.consumption * 100) / 100,
          cost: n.cost != null ? Math.round(n.cost * 100) / 100 : null,
          source: "tibber-snapshot",
        });
      }
    }

    if (rows.length === 0) {
      return { saved: [], error: "Ingen daglige tall å lagre (ennå)" };
    }

    const { error } = await supabaseAdmin
      .from("tibber_daily_kwh")
      .upsert(rows, { onConflict: "location,day" });

    if (error) {
      return { saved: [], error: `DB-feil: ${error.message}` };
    }

    return {
      saved: rows.map(({ location, day, kwh, cost }) => ({ location, day, kwh, cost })),
    };
  } catch (e: any) {
    return { saved: [], error: e?.message ?? "Ukjent feil" };
  }
}
