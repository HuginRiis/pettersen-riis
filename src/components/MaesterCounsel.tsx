import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getTelemarkAlerts, type TelemarkAlert } from "@/server/met-alerts";
import { alertsToCounselLines, severityBadge } from "@/lib/telemark-alerts-got";
import { CloakIcon, HorseCartIcon, PollenIcon } from "@/components/MaesterIcons";

/**
 * MaesterCounsel — "Hærmesterens råd"
 *
 * En morsom, men praktisk råd-boks i Game of Thrones-stil.
 * Gir bekledning og reise-anbefalinger (hest og kjerre) basert på:
 *  - vær (temp, vind, nedbør, symbol)
 *  - tid på døgnet
 *  - årstid (måned)
 *  - pollensesong (heuristikk pr. måned)
 *
 * Bruker Met.no for live vær for Skien. SSR-trygg: ingen Date/random før mount.
 */

type MetResponse = {
  properties?: {
    timeseries?: Array<{
      time: string;
      data?: {
        instant?: {
          details?: {
            air_temperature?: number;
            wind_speed?: number;
            relative_humidity?: number;
          };
        };
        next_1_hours?: {
          summary?: { symbol_code?: string };
          details?: { precipitation_amount?: number };
        };
      };
    }>;
  };
};

type Now = {
  temp: number | null;
  wind: number | null;
  precip: number | null;
  symbol: string | null;
};

const SKIEN = { lat: 59.2096, lon: 9.6090 };

export function MaesterCounsel() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Now | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<TelemarkAlert[]>([]);
  const [alertsFetchedAt, setAlertsFetchedAt] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    setDate(new Date());
    (async () => {
      try {
        const res = await fetch(
          `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${SKIEN.lat}&lon=${SKIEN.lon}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error("Ravnen falt fra himmelen");
        const data: MetResponse = await res.json();
        const first = data.properties?.timeseries?.[0];
        const inst = first?.data?.instant?.details;
        const nx = first?.data?.next_1_hours;
        setNow({
          temp: typeof inst?.air_temperature === "number" ? inst.air_temperature : null,
          wind: typeof inst?.wind_speed === "number" ? inst.wind_speed : null,
          precip: typeof nx?.details?.precipitation_amount === "number" ? nx.details.precipitation_amount : null,
          symbol: nx?.summary?.symbol_code ?? null,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ukjent feil");
      }
    })();
  }, []);

  // Hent Telemark-farevarsler hvert 15. minutt
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await getTelemarkAlerts();
        if (cancelled) return;
        setAlerts(r.alerts ?? []);
        setAlertsFetchedAt(r.fetchedAt ?? Date.now());
      } catch (e) {
        console.warn("Kunne ikke hente Telemark-varsler:", e);
      }
    }
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const advice = useMemo(() => {
    if (!mounted || !date) return null;
    return buildAdvice({ date, weather: now, alerts });
  }, [mounted, date, now, alerts]);

  const badge = useMemo(() => severityBadge(alerts), [alerts]);
  const lastUpdated = useMemo(() => {
    if (!alertsFetchedAt) return null;
    const d = new Date(alertsFetchedAt);
    return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  }, [alertsFetchedAt]);

  return (
    <section className="container mx-auto px-4 pb-16">
      <div className="ornate-divider mb-8">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Hærmesterens råd
        </span>
      </div>

      <article className="panel rounded-lg p-6 md:p-8 glow-on-hover relative overflow-hidden">
        {/* Dekorative ravner i hjørnet */}
        <div className="absolute top-3 right-4 text-2xl opacity-30 select-none">🪶</div>

        <header className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-xl md:text-2xl text-primary">
              {advice?.greeting ?? "Hærmesteren raadslår …"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Gjeldende for Skien · {advice?.contextLine ?? "—"}
            </p>
          </div>
          {advice && (
            <div className="flex flex-col items-end gap-1">
              {badge && (
                <span
                  className={`text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-sm border ${
                    badge.color === "Red"
                      ? "border-destructive text-destructive bg-destructive/10"
                      : badge.color === "Orange"
                        ? "border-orange-500/70 text-orange-400 bg-orange-500/10"
                        : "border-yellow-500/60 text-yellow-300 bg-yellow-500/10"
                  }`}
                  title="Aktive farevarsler i Telemark fra Met.no"
                >
                  ⚠ {badge.label}
                </span>
              )}
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                {advice.season} · {advice.dayPart}
              </div>
              {lastUpdated && (
                <div className="text-[9px] text-muted-foreground/70 italic">
                  Ravnene landet kl. {lastUpdated}
                </div>
              )}
            </div>
          )}
        </header>

        {error && !advice && (
          <p className="mt-4 text-sm text-destructive">Kunne ikke tyde ravnens budskap: {error}</p>
        )}

        {!advice && !error && (
          <p className="mt-4 text-sm text-muted-foreground italic">Hærmesteren henter sine bøker …</p>
        )}

        {advice && (
          <div className="mt-6 grid md:grid-cols-3 gap-5">
            <CounselBlock
              icon={<CloakIcon className="w-8 h-8 text-primary" />}
              title="Bekledning"
              lines={advice.clothing}
            />
            <CounselBlock
              icon={<HorseCartIcon className="w-10 h-8 text-primary" />}
              title="Hest & kjerre"
              lines={advice.travel}
            />
            <CounselBlock
              icon={<PollenIcon className="w-8 h-8 text-primary" />}
              title="Pollen & plager"
              lines={advice.pollen}
            />
          </div>
        )}

        {advice && (
          <footer className="mt-6 pt-4 border-t border-border/60">
            <p className="text-medieval text-primary text-sm md:text-base text-center italic">
              "{advice.proverb}"
            </p>
          </footer>
        )}
      </article>
    </section>
  );
}

function CounselBlock({
  icon,
  title,
  lines,
}: {
  icon: ReactNode;
  title: string;
  lines: string[];
}) {
  return (
    <div className="rounded-md border border-border/70 bg-card/40 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="shrink-0" aria-hidden>
          {icon}
        </span>
        <h4 className="text-[11px] tracking-[0.3em] uppercase text-primary">{title}</h4>
      </div>
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="text-sm text-foreground/90 leading-snug flex gap-2">
            <span className="text-primary/70 mt-1">❦</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Logikk ─────────────────────────────────────────────────────────── */

type Season = "vinter" | "vår" | "sommer" | "høst";
type DayPart = "morgengry" | "dagslys" | "skumring" | "nattevakt";

function getSeason(month: number): Season {
  if (month >= 2 && month <= 4) return "vår";
  if (month >= 5 && month <= 7) return "sommer";
  if (month >= 8 && month <= 10) return "høst";
  return "vinter";
}
function getDayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 9) return "morgengry";
  if (hour >= 9 && hour < 17) return "dagslys";
  if (hour >= 17 && hour < 21) return "skumring";
  return "nattevakt";
}

function buildAdvice({
  date,
  weather,
  alerts = [],
}: {
  date: Date;
  weather: Now | null;
  alerts?: TelemarkAlert[];
}) {
  const month = date.getMonth(); // 0-11
  const hour = date.getHours();
  const season = getSeason(month);
  const dayPart = getDayPart(hour);

  const t = weather?.temp ?? null;
  const wind = weather?.wind ?? null;
  const precip = weather?.precip ?? null;
  const symbol = weather?.symbol ?? "";

  const isSnow = symbol.includes("snow");
  const isRain = symbol.includes("rain") || (precip !== null && precip > 0.2 && !isSnow);
  const isFog = symbol.includes("fog");
  const isClear = symbol.includes("clearsky") || symbol.includes("fair");
  const isWindy = wind !== null && wind >= 8;
  const isStorm = wind !== null && wind >= 14;
  const isFreezing = t !== null && t <= 0;
  const isCold = t !== null && t > 0 && t < 8;
  const isMild = t !== null && t >= 8 && t < 17;
  const isWarm = t !== null && t >= 17;

  /* ── Bekledning (2026, men i Hærmesterens tunge) ──────────────── */
  const clothing: string[] = [];
  if (isFreezing) {
    clothing.push("Dunjakke av Norrøna-merke — slik dirvolvens pels for vår tid; lukk glidelåsen helt opp til strupen.");
    clothing.push("Merinoull innerst, fôrede vinterstøvler ytterst, og en lue av strikket ull. Selv en Stark ville nikket.");
    clothing.push("Hansker med berøringsfingre — så ravnens lille glassbrett (mobilen) kan tales til uten å blottlegge huden.");
  } else if (isCold) {
    clothing.push("Skalljakke med varmt fleece-fôr og lange bukser av softshell — vinden fra fjorden bærer minner fra Muren.");
    clothing.push("Buff om halsen og en strikket lue; uten dem vil ravnene le høyt.");
    clothing.push("Goretex-støvler eller solide sneakers — våte tær fortjener ingen herre.");
  } else if (isMild) {
    clothing.push("En lett dunvest over genseren, eller en regnskall i sekken — Skiens vær er like upålitelig som en Lannister.");
    clothing.push("Jeans eller chinos, og en t-skjorte i merinoull under — slik kler en mann seg i åttende måne av 2026.");
    clothing.push("Ta med en cap eller lue; hodet skal hverken brennes eller fryses.");
  } else if (isWarm) {
    clothing.push("Linskjorte og shorts av lett bomull — la dunjakken hvile i skapet til høstvindene blåser.");
    clothing.push("Solbriller med UV-vern og en cap — slik som handelsmennene i Dorne ville bedt om.");
    clothing.push("Solkrem faktor 30 på blottede armer; selv den modigste hud brenner i nordlandets sommer.");
  } else {
    clothing.push("Kle deg i lag av merinoull og lett skall — ravnene har ennå ikke meldt sikkert om temperaturen.");
  }
  if (isRain) clothing.push("Regnjakke med tapede sømmer og vanntette joggesko — regnet kommer som drager fra vest.");
  if (isSnow) clothing.push("Vinterstøvler med god mønster i sålen, og brodder i lommen om fortauet er som speil.");
  if (isWindy && !isStorm) clothing.push("Vindtett ytterjakke og lue som ikke blåser av — vinden napper i alt som er løst.");
  if (isStorm) clothing.push("Storm! Tett skalljakke med stram hette; ingen lange frakker som flagrer som banner i kamp.");
  if (isFog) clothing.push("Refleksvest eller lyse farger — i tåken ser bilistene knapt sin egen panserhjelm.");
  if (dayPart === "nattevakt") clothing.push("Pannelykt og refleks på jakken — Nattens voktere av vår tid bærer LED, ikke fakkel.");
  if (dayPart === "morgengry" && (isCold || isFreezing)) clothing.push("Forvarm støvlene ved varmeovnen før du trår ut — gull verdt en gulldrage.");

  /* ── Reise: hest & kjerre ──────────────────────────────────────── */
  const travel: string[] = [];
  if (isFreezing && (isSnow || isRain)) {
    travel.push("Veiene er glatte som en Lannisters tunge — sett brodder under hovene før hesten spennes for.");
    travel.push("Reduser farten til skritt i svinger; en kjerre i grøfta er som et hus uten arving.");
  } else if (isFreezing) {
    travel.push("Frost ligger over Kongsveien — kontroller hesteskoene, og ha sand i kjerren mot bakkene.");
  } else if (isRain && isWindy) {
    travel.push("Våte hjul og kastevind — fest lasten med doble tau, ellers vil den danse som en septon i vin.");
  } else if (isRain) {
    travel.push("Velg den øvre vei rundt Tollnesmyra — leiren der nede sluker hjul som et beist.");
  } else if (isSnow) {
    travel.push("Spenn for sleden om snøen ligger; ellers ekstra meier under kjerren.");
  } else if (isStorm) {
    travel.push("Hærmesteren fraråder all reise — selv ravnene blir blåst av kurs.");
  } else if (isFog) {
    travel.push("Heng en bjelle på selen — i tåken hører man tidligere enn man ser.");
  } else if (isWarm && season === "sommer") {
    travel.push("Vann hesten ofte og hold rast i skyggen — heten er en stille fiende.");
    travel.push("Reis tidlig eller etter skumring; middagsstunden tilhører hesten.");
  } else {
    travel.push("Veiene er fredelige. La hesten gå i jevnt traball — du kommer fram før måltidet.");
  }
  if (dayPart === "nattevakt") travel.push("Tenn lyktene foran og bak kjerren — banditter og rådyr er begge dårlig kledd for natten.");
  if (isWindy && !isStorm) travel.push("Hold tømmene fast i kastevind — særlig ved Bryggevannet.");

  // Prepend ekte farevarsler for Telemark fra Met.no (oppdateres hvert 15. min)
  const alertLines = alertsToCounselLines(alerts, 4);
  if (alertLines.length > 0) {
    travel.unshift(...alertLines);
  }

  /* ── Pollen & plager (heuristikk pr. måned) ────────────────────── */
  const pollen: string[] = [];
  // Norge, grovt: hassel/or feb-mar, bjørk apr-mai, gress jun-jul, burot aug
  if (month === 1 || month === 2) {
    pollen.push("Hassel og or våkner — den følsomme bør bære tørklede for ansiktet.");
    pollen.push("En kopp varm te med honning lindrer mer enn en mester av Citadellet.");
  } else if (month === 3 || month === 4) {
    pollen.push("Bjørken slipper sitt gule krutt — astmatikere bør holde porten lukket ved soloppgang.");
    pollen.push("Vask kappen oftere; pollen henger seg fast som en svoren ridder.");
  } else if (month === 5 || month === 6) {
    pollen.push("Gresspollen i flom — kort hodet hesten i gangen og ikke ri gjennom enga uten årsak.");
    pollen.push("Skyll håret om kvelden, ellers tar du markens minner med i sengen.");
  } else if (month === 7) {
    pollen.push("Burot og malurt nærmer seg — den følsomme tar med urter fra Hærmesteren.");
  } else if (month === 8 || month === 9) {
    pollen.push("Pollensesongen er på hell, men muggsporer i vått løv kan plage brystet.");
  } else {
    pollen.push("Lav pollenbyrde — pust dypt og takk de gamle gudene.");
  }
  if (isRain) pollen.push("Regnet vasker luften ren — godt nytt for nesen, dårlig nytt for støvlene.");
  if (isWindy && (month >= 3 && month <= 6)) pollen.push("Vinden løfter pollen som banner — hold vinduene lukket mot sør.");
  if (isClear && (month >= 3 && month <= 6)) pollen.push("Klarvær og sol — pollennivåene topper mellom middag og skumring.");

  /* ── Greeting & proverb ───────────────────────────────────────── */
  const greeting = pickGreeting(season, dayPart);
  const proverb = pickProverb({ isSnow, isRain, isStorm, isWarm, isFreezing, season });

  const tStr = t !== null ? `${Math.round(t)}°` : "ukjent temp";
  const wStr = wind !== null ? `${Math.round(wind)} m/s` : "stille vind";
  const symStr = symbol ? prettifySymbol(symbol) : "uleste tegn";
  const contextLine = `${tStr} · ${wStr} · ${symStr}`;

  return {
    season,
    dayPart,
    greeting,
    contextLine,
    clothing,
    travel,
    pollen,
    proverb,
  };
}

function pickGreeting(season: Season, dayPart: DayPart): string {
  const base: Record<DayPart, string> = {
    morgengry: "Ved morgengry, edle herskap …",
    dagslys: "I dagens lys, lytt til Hærmesteren …",
    skumring: "Når sola hviler bak åsene …",
    nattevakt: "I nattevakten, mens borgen sover …",
  };
  const tag: Record<Season, string> = {
    vinter: "Vinteren er her.",
    vår: "Våren rører på seg.",
    sommer: "Sommerens dager er korte i nord.",
    høst: "Høsten teller løvet.",
  };
  return `${base[dayPart]} ${tag[season]}`;
}

function pickProverb(c: {
  isSnow: boolean;
  isRain: boolean;
  isStorm: boolean;
  isWarm: boolean;
  isFreezing: boolean;
  season: Season;
}): string {
  if (c.isStorm) return "Et hus som ikke fester sin kappe, mister både ære og hatt.";
  if (c.isSnow) return "Snø husker hver fotefart — gå med klokskap.";
  if (c.isFreezing) return "Den kloke fryser sjelden to ganger.";
  if (c.isRain) return "Regnet kjenner ingen lojalitet, men en god kappe gjør.";
  if (c.isWarm && c.season === "sommer") return "I sommerheten er skyggen en venn — og hesten din vet det først.";
  if (c.season === "høst") return "Når løvet faller, faller også de uforsiktige.";
  if (c.season === "vår") return "Den som nyser om våren, har ennå ikke lært å lukke vinduet.";
  return "Kle deg som om Vinteren kommer — for det gjør den alltid.";
}

function prettifySymbol(sym: string): string {
  const map: Record<string, string> = {
    clearsky: "klarvær",
    fair: "lettskyet",
    partlycloudy: "delvis skyet",
    cloudy: "skyet",
    rainshowers: "regnbyger",
    rain: "regn",
    heavyrain: "kraftig regn",
    snow: "snø",
    snowshowers: "snøbyger",
    sleet: "sludd",
    fog: "tåke",
    thunder: "torden",
  };
  // strip "_day" / "_night" / "_polartwilight"
  const base = sym.replace(/_(day|night|polartwilight)$/, "");
  for (const k of Object.keys(map)) {
    if (base.includes(k)) return map[k];
  }
  return base.replace(/_/g, " ");
}
