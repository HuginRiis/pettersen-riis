// Letvekts singleton som logger tidspunkter for Homey-kall fra klienten.
// Brukes av useServerFn-wrappere på Smarthus for å vise live-aktivitet.
// Ingen nettverkskall — alt holdes i minnet i nettleseren.

const ONE_HOUR_MS = 60 * 60_000;
const MAX_EVENTS = 5000; // hard cap som sikkerhetsnett

type Listener = () => void;

class HomeyApiTracker {
  private events: number[] = [];
  private listeners = new Set<Listener>();

  record(ts: number = Date.now()) {
    this.events.push(ts);
    this.prune(ts);
    this.emit();
  }

  /** Returner kopi av timestamps innenfor siste time. */
  snapshot(now: number = Date.now()): number[] {
    this.prune(now);
    return this.events.slice();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private prune(now: number) {
    const cutoff = now - ONE_HOUR_MS;
    // Drop alt eldre enn 1 time
    let i = 0;
    while (i < this.events.length && this.events[i] < cutoff) i++;
    if (i > 0) this.events.splice(0, i);
    // Hard cap
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

// Singleton i klient-bundlet
const g = globalThis as unknown as { __homeyApiTracker?: HomeyApiTracker };
export const homeyApiTracker: HomeyApiTracker =
  g.__homeyApiTracker ?? (g.__homeyApiTracker = new HomeyApiTracker());

/** Marker at et Homey-API-kall ble gjort akkurat nå. */
export function recordHomeyApiCall() {
  if (typeof window === "undefined") return;
  homeyApiTracker.record();
}
