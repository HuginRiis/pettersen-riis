import { useEffect, useState } from "react";
import { getNrkTraffic, type NrkTrafficItem } from "@/lib/nrk-traffic";

export function NrkTrafficSection() {
  const [items, setItems] = useState<NrkTrafficItem[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("ALL");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await getNrkTraffic();
        if (cancelled) return;
        setItems(r.items ?? []);
        setFetchedAt(r.fetchedAt ?? Date.now());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ukjent feil");
      }
    }
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const updatedLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("nb-NO", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // Tilgjengelige distrikter fra de aktive meldingene
  const availableDistricts = (() => {
    const set = new Set<string>();
    for (const it of items ?? []) {
      if (it.district) set.add(it.district);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "nb"));
  })();

  const filteredItems =
    selectedDistrict === "ALL"
      ? items ?? []
      : (items ?? []).filter((it) => it.district === selectedDistrict);

  const counts = countByCategory(filteredItems);

  return (
    <div className="mt-12">
      <div className="ornate-divider mb-6">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Kongevegens budbringere
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-4 italic">
        Trafikk og hendelser fra NRKs distriktsredaksjoner i Vestfold/Telemark, Innlandet,
        Sørlandet, Buskerud, Østfold og Stor-Oslo. Oppdateres hvert 10. min.
      </p>

      {availableDistricts.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
            Velg distrikt
          </p>
          <div className="flex flex-wrap gap-2">
            <DistrictChip
              label={`Alle distrikter (${items?.length ?? 0})`}
              active={selectedDistrict === "ALL"}
              onClick={() => setSelectedDistrict("ALL")}
            />
            {availableDistricts.map((name) => {
              const count = (items ?? []).filter(
                (it) => it.district === name,
              ).length;
              return (
                <DistrictChip
                  key={name}
                  label={`${name} (${count})`}
                  active={selectedDistrict === name}
                  onClick={() => setSelectedDistrict(name)}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <CategoryCard label="Stengt" count={counts.closure} color="closure" />
        <CategoryCard label="Ulykker" count={counts.accident} color="accident" />
        <CategoryCard label="Ras/føre" count={counts.weather} color="weather" />
        <CategoryCard label="Veiarbeid" count={counts.roadwork} color="roadwork" />
      </div>

      {updatedLabel && (
        <p className="text-xs text-muted-foreground mb-4 italic">
          Sist hørt fra budbringerne kl. {updatedLabel}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive mb-4">
          Kunne ikke hente trafikknyheter: {error}
        </p>
      )}

      <div className="space-y-3">
        {items === null && (
          <p className="text-sm text-muted-foreground italic">Henter trafikknyheter …</p>
        )}
        {items && filteredItems.length === 0 && !error && (
          <p className="text-sm text-muted-foreground italic">
            {selectedDistrict === "ALL"
              ? "Ingen ferske trafikkmeldinger fra NRK akkurat nå."
              : `Ingen ferske trafikkmeldinger fra ${selectedDistrict} akkurat nå.`}
          </p>
        )}
        {filteredItems.map((it) => (
          <TrafficCard key={it.id} item={it} />
        ))}
      </div>
    </div>
  );
}

function DistrictChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border text-foreground/80 hover:border-primary/60 hover:text-primary"
      }`}
    >
      {label}
    </button>
  );
}

function countByCategory(items: NrkTrafficItem[]) {
  const c = { closure: 0, accident: 0, weather: 0, roadwork: 0, other: 0 };
  for (const it of items) c[it.category]++;
  return c;
}

function CategoryCard({
  label, count, color,
}: {
  label: string;
  count: number;
  color: NrkTrafficItem["category"];
}) {
  const cls =
    color === "closure"
      ? "border-destructive/60 text-destructive bg-destructive/10"
      : color === "accident"
        ? "border-orange-500/60 text-orange-400 bg-orange-500/10"
        : color === "weather"
          ? "border-blue-500/50 text-blue-300 bg-blue-500/10"
          : "border-yellow-500/50 text-yellow-300 bg-yellow-500/10";
  return (
    <div className={`rounded-md border p-3 flex items-baseline justify-between ${cls}`}>
      <span className="text-[10px] uppercase tracking-[0.2em]">{label}</span>
      <span className="text-xl font-semibold">{count}</span>
    </div>
  );
}

function TrafficCard({ item }: { item: NrkTrafficItem }) {
  const cls =
    item.category === "closure" ? "border-destructive/60"
    : item.category === "accident" ? "border-orange-500/60"
    : item.category === "weather" ? "border-blue-500/50"
    : item.category === "roadwork" ? "border-yellow-500/50"
    : "border-border";
  const dot =
    item.category === "closure" ? "bg-destructive"
    : item.category === "accident" ? "bg-orange-500"
    : item.category === "weather" ? "bg-blue-400"
    : item.category === "roadwork" ? "bg-yellow-400"
    : "bg-muted";

  const label =
    item.category === "closure" ? "Stengt"
    : item.category === "accident" ? "Ulykke"
    : item.category === "weather" ? "Ras/føre"
    : item.category === "roadwork" ? "Veiarbeid"
    : "Melding";

  const when = item.pubDate ? formatRelative(item.pubDate) : null;

  return (
    <article className={`panel rounded-md border ${cls} p-3`}>
      <header className="flex items-start gap-3 flex-wrap">
        <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full ${dot}`} />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm md:text-base text-primary leading-snug">
            {label}
            <span className="text-muted-foreground/70"> · {item.district}</span>
          </h4>
        </div>
        {when && (
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {when}
          </span>
        )}
      </header>

      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-2 text-sm text-foreground/90 hover:text-primary transition-colors"
      >
        <p className="font-medium leading-snug">{item.title}</p>
        {item.description && item.description !== item.title && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {item.description}
          </p>
        )}
      </a>
    </article>
  );
}

function formatRelative(iso: string): string {
  try {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return iso;
    const diff = Date.now() - t;
    const min = Math.round(diff / 60000);
    if (min < 1) return "nå";
    if (min < 60) return `${min} min siden`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} t siden`;
    const d = Math.round(h / 24);
    return `${d} d siden`;
  } catch {
    return iso;
  }
}
