import type { TelemarkAlert } from "@/server/met-alerts";

/**
 * Oversetter Met.no farevarsler til Game of Thrones-stil meldinger
 * for "Hest & kjerre"-kolonnen.
 */

const EVENT_LABELS: Record<string, string> = {
  gale: "stiv kuling",
  wind: "stormvind",
  rain: "kraftig regn",
  snow: "snøfall",
  ice: "isgang",
  blackIce: "underkjølt regn",
  avalanches: "snøras",
  flood: "flom",
  forestFire: "skogbrann-fare",
  drivingConditions: "vanskelig kjøreføre",
  polarLow: "polart lavtrykk",
  rainFlood: "regnflom",
  stormSurge: "stormflo",
  thunder: "torden",
};

function eventToGotPhrase(a: TelemarkAlert): string {
  const name =
    a.eventAwarenessName?.toLowerCase() ??
    EVENT_LABELS[a.event] ??
    a.event.replace(/([A-Z])/g, " $1").toLowerCase();
  const area = a.area ? ` ved ${a.area}` : "";
  const colorMap: Record<string, string> = {
    Red: "Røde ravner skriker:",
    Orange: "Hærmesteren advarer:",
    Yellow: "Et budskap fra ravnene:",
  };
  const intro = colorMap[a.riskMatrixColor ?? ""] ?? "Et varsel:";

  // Plukk en GoT-vri basert på event
  const got: Record<string, string[]> = {
    gale: [
      `${intro} ${name}${area} — spenn kappen og fest lasten med doble tau, ellers vil den danse som et banner i kamp.`,
      `${intro} ${name}${area} — selv ravnene blåses av kurs i kveld.`,
    ],
    wind: [
      `${intro} ${name}${area} — la kappen være i våpenhuset; ta tett jakke som ikke flagrer.`,
    ],
    rain: [
      `${intro} ${name}${area} — velg den øvre vei rundt myrene; leiren der nede sluker hjul som et beist.`,
      `${intro} ${name}${area} — olje inn lærstøvlene før hesten spennes for.`,
    ],
    snow: [
      `${intro} ${name}${area} — spenn for sleden eller sett ekstra meier under kjerren.`,
    ],
    ice: [
      `${intro} ${name}${area} — sett brodder under hovene; en kjerre i grøfta er som et hus uten arving.`,
    ],
    blackIce: [
      `${intro} ${name}${area} — veiene er glatte som en Lannisters tunge. Reduser farten til skritt i svinger.`,
    ],
    avalanches: [
      `${intro} ${name}${area} — de gamle gudene har løsnet fjellets kappe. Hold deg unna utsatte heng.`,
    ],
    flood: [
      `${intro} ${name}${area} — elver vokser som dragens vinger. Unngå lavtliggende veier.`,
    ],
    rainFlood: [
      `${intro} ${name}${area} — vann skyller veiene rene; passer kjerren igjennom kommer hesten våt hjem.`,
    ],
    forestFire: [
      `${intro} ${name}${area} — tørt som Dornes ørken. Ingen åpen ild langs veien.`,
    ],
    drivingConditions: [
      `${intro} ${name}${area} — Hærmesteren råder til varsom ferd; kjør som om Vinteren kommer.`,
    ],
    thunder: [
      `${intro} ${name}${area} — Stormgudene rir over åsene. Søk ly om du kan.`,
    ],
    polarLow: [
      `${intro} ${name}${area} — vinden fra Muren biter hardt. Ikke reis uten godt selskap.`,
    ],
    stormSurge: [
      `${intro} ${name}${area} — havet stiger som ved Theons fall. Hold deg vekk fra brygger.`,
    ],
  };

  const arr = got[a.event] ?? [
    `${intro} ${name}${area} — far med klokskap.`,
  ];
  // deterministisk valg basert på id-hash for SSR-stabilitet
  const hash = (a.id || "").split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  return arr[hash % arr.length];
}

export function alertsToCounselLines(alerts: TelemarkAlert[], maxLines = 4): string[] {
  if (alerts.length === 0) return [];
  return alerts.slice(0, maxLines).map(eventToGotPhrase);
}

export function severityBadge(alerts: TelemarkAlert[]): {
  color: string;
  label: string;
} | null {
  if (alerts.length === 0) return null;
  const top = alerts[0];
  const color = top.riskMatrixColor ?? "Yellow";
  const label =
    color === "Red"
      ? `${alerts.length} røde ravner`
      : color === "Orange"
        ? `${alerts.length} oransje varsler`
        : `${alerts.length} gule varsler`;
  return { color, label };
}
