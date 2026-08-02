import { useState } from "react";
import { LAN_MODE_LABEL, LAN_MODE_COLOR } from "@/lib/lan-games";
import {
  LINKETUR_CABINS,
  LINKETUR_CREW,
  CREW_GAMES,
} from "@/lib/linketur-crew";
import {
  Home,
  KeyRound,
  Users,
  Cpu,
  MonitorSmartphone,
  HardDrive,
  MemoryStick,
  Gamepad2,
  Eye,
  EyeOff,
} from "lucide-react";

export function LinketurCrew() {
  const [showCode, setShowCode] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-8">
      {/* Hyttene */}
      <section className="space-y-3">
        <h2 className="text-xl text-foreground inline-flex items-center gap-2">
          <Home size={18} className="text-primary" /> Hyttene vi er på
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {LINKETUR_CABINS.map((c) => (
            <article
              key={c.id}
              className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
            >
              <div className="relative h-44 overflow-hidden">
                <img
                  src={c.image}
                  alt={`${c.name} i ${c.place}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                <div className="absolute bottom-3 left-4">
                  <h3 className="text-lg text-foreground">{c.name}</h3>
                  <div className="text-xs text-muted-foreground">{c.place}</div>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <p className="text-sm text-muted-foreground">{c.info}</p>
                <div className="grid grid-cols-2 gap-2">
                  {c.facts.map((f) => (
                    <div
                      key={f.label}
                      className="rounded-lg border border-border bg-background/60 p-2"
                    >
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {f.label}
                      </div>
                      <div className="text-xs text-foreground">{f.value}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowCode((p) => ({ ...p, [c.id]: !p[c.id] }))}
                  className="inline-flex w-full items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground"
                  aria-label={`Vis kode for ${c.name}`}
                >
                  <span className="inline-flex items-center gap-2">
                    <KeyRound size={14} className="text-primary" /> Kode til turen
                  </span>
                  <span className="inline-flex items-center gap-2 font-mono tracking-widest">
                    {showCode[c.id] ? c.code : "••••"}
                    {showCode[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Gjengen + PC-er */}
      <section className="space-y-3">
        <h2 className="text-xl text-foreground inline-flex items-center gap-2">
          <Users size={18} className="text-primary" /> Gjengen og riggene ({LINKETUR_CREW.length})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {LINKETUR_CREW.map((m) => (
            <div
              key={m.name}
              className="rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-base text-foreground">{m.name}</h3>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                  {m.role}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{m.pc}</div>
              <dl className="mt-3 space-y-1.5 text-xs">
                <SpecRow icon={<Cpu size={12} />} label="CPU" value={m.specs.cpu} />
                <SpecRow icon={<Gamepad2 size={12} />} label="GPU" value={m.specs.gpu} />
                <SpecRow icon={<MemoryStick size={12} />} label="RAM" value={m.specs.ram} />
                <SpecRow icon={<HardDrive size={12} />} label="Disk" value={m.specs.disk} />
                <SpecRow
                  icon={<MonitorSmartphone size={12} />}
                  label="Skjerm"
                  value={m.specs.skjerm}
                />
              </dl>
              {m.note && <p className="mt-3 text-[11px] text-muted-foreground">{m.note}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Spillene vi faktisk spiller */}
      <section className="space-y-3">
        <h2 className="text-xl text-foreground inline-flex items-center gap-2">
          <Gamepad2 size={18} className="text-primary" /> LAN-spillene vi spiller
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CREW_GAMES.map((g) => {
            const color = LAN_MODE_COLOR[g.mode];
            return (
              <div key={g.title} className="relative overflow-hidden rounded-lg border border-border bg-card p-4">
                <div
                  className="absolute inset-x-0 top-0 h-0.5 opacity-70"
                  style={{ backgroundColor: color }}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">{g.title}</div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    {LAN_MODE_LABEL[g.mode]}
                  </span>
                </div>
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Users size={12} /> {g.players}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{g.special}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SpecRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon} {label}
      </dt>
      <dd className="text-foreground/90">{value}</dd>
    </div>
  );
}
