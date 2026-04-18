import { lazy, Suspense } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  MapPin,
  Clock,
  Mountain,
  Compass,
  AlertTriangle,
  Backpack,
  CalendarDays,
  Bus,
  ParkingSquare,
  Home,
  Trees,
  ExternalLink,
  Footprints,
} from "lucide-react";
import type { TripSuggestion } from "@/server/turer";

const TripPointMap = lazy(() =>
  import("@/components/TripPointMap").then((m) => ({ default: m.TripPointMap })),
);

export function TripDetailDialog({
  trip,
  open,
  onOpenChange,
}: {
  trip: TripSuggestion | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!trip) return null;

  const diffColor =
    trip.difficulty === "Lett"
      ? "text-emerald-400 border-emerald-400/40"
      : trip.difficulty === "Middels"
        ? "text-amber-400 border-amber-400/40"
        : "text-rose-400 border-rose-400/40";

  const hasCoords = trip.startLat !== null && trip.startLon !== null;
  const gmapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${trip.startLat},${trip.startLon}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${trip.name} ${trip.area}`,
      )}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-background border-border">
        <DialogHeader className="text-left">
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {trip.area}
          </p>
          <DialogTitle className="text-2xl text-primary leading-tight">{trip.name}</DialogTitle>
          <DialogDescription className="text-foreground/80 text-base italic">
            {trip.description}
          </DialogDescription>
        </DialogHeader>

        {/* Stat-rad */}
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className={`px-2 py-1 rounded border ${diffColor} uppercase tracking-wider`}>
            {trip.difficulty}
          </span>
          <Stat icon={Clock} label={trip.duration} />
          {trip.distanceKm !== null && (
            <Stat icon={Footprints} label={`${trip.distanceKm.toFixed(1)} km`} />
          )}
          {trip.elevationGainM !== null && (
            <Stat icon={Mountain} label={`+${trip.elevationGainM} hm`} />
          )}
          {trip.scenery && <Stat icon={Trees} label={trip.scenery} />}
        </div>

        {/* Lang beskrivelse */}
        <Section title="Krønikens ord">
          <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">
            {trip.longDescription || trip.description}
          </p>
        </Section>

        {/* Kart */}
        {hasCoords && (
          <Section title="Startpunkt på kartet" icon={MapPin}>
            <div className="h-64 w-full rounded-md overflow-hidden border border-border">
              <Suspense
                fallback={
                  <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                    Tegner kartet...
                  </div>
                }
              >
                <TripPointMap lat={trip.startLat!} lon={trip.startLon!} label={trip.name} />
              </Suspense>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {trip.startLat!.toFixed(4)}°N, {trip.startLon!.toFixed(4)}°Ø
            </p>
          </Section>
        )}

        {/* Rute-steg */}
        {trip.routeSteps.length > 0 && (
          <Section title="Mesterens veivisning" icon={Compass}>
            <ol className="space-y-2">
              {trip.routeSteps.map((s) => (
                <li key={s.step} className="flex gap-3 text-sm">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full border border-primary/60 text-primary flex items-center justify-center text-xs font-semibold">
                    {s.step}
                  </span>
                  <span className="text-foreground/85 pt-0.5">{s.instruction}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* To kolonner med praktisk info */}
        <div className="grid sm:grid-cols-2 gap-4">
          <InfoBlock icon={Home} title="Start">
            {trip.startHint}
          </InfoBlock>
          {trip.endHint && (
            <InfoBlock icon={MapPin} title="Slutt">
              {trip.endHint}
            </InfoBlock>
          )}
          <InfoBlock icon={CalendarDays} title="Beste sesong">
            {trip.bestSeason}
          </InfoBlock>
          <InfoBlock icon={Bus} title="Transport">
            {trip.transport}
          </InfoBlock>
          <InfoBlock icon={ParkingSquare} title="Parkering">
            {trip.parking}
          </InfoBlock>
        </div>

        {/* Highlights */}
        {trip.highlights.length > 0 && (
          <Section title="Hva som lokker">
            <ul className="space-y-1.5">
              {trip.highlights.map((h, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground/85">
                  <span className="text-primary flex-shrink-0">❦</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Utstyr + Fasiliteter */}
        <div className="grid sm:grid-cols-2 gap-4">
          {trip.recommendedGear.length > 0 && (
            <Section title="Utstyr" icon={Backpack}>
              <div className="flex flex-wrap gap-1.5">
                {trip.recommendedGear.map((g, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded border border-border text-xs text-foreground/80 bg-background/40"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </Section>
          )}
          {trip.facilities.length > 0 && (
            <Section title="Fasiliteter" icon={Home}>
              <ul className="space-y-1 text-sm text-foreground/85">
                {trip.facilities.map((f, i) => (
                  <li key={i}>· {f}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* Advarsler */}
        {trip.warnings.length > 0 && (
          <Section title="Advarsler" icon={AlertTriangle}>
            <ul className="space-y-1.5">
              {trip.warnings.map((w, i) => (
                <li key={i} className="flex gap-2 text-sm text-amber-300/90">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Ekstern lenke */}
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-primary/60 text-primary hover:bg-primary/10 transition-colors text-sm tracking-wider uppercase self-start"
        >
          <ExternalLink size={14} />
          {hasCoords ? "Veibeskrivelse i Google Maps" : "Søk i Google Maps"}
        </a>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <span className="px-2 py-1 rounded border border-border text-muted-foreground inline-flex items-center gap-1.5">
      <Icon size={12} />
      {label}
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="text-[11px] uppercase tracking-[0.25em] text-primary/80 mb-2 flex items-center gap-2">
        {Icon && <Icon size={12} />}
        {title}
      </h3>
      {children}
    </section>
  );
}

function InfoBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Clock;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-primary/80 mb-1">
        <Icon size={12} />
        {title}
      </div>
      <p className="text-sm text-foreground/85">{children}</p>
    </div>
  );
}
