import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  Loader2,
  Wifi,
  WifiOff,
  Battery,
  RefreshCw,
  Mail,
  KeyRound,
  Play,
  Pause,
  Square,
  Home,
  Bell,
  Crown,
  Swords,
  Shield,
  Droplets,
  Wind,
  Hourglass,
  Filter as FilterIcon,
  AlertTriangle,
} from "lucide-react";
import {
  getRoborockSnapshot,
  sendRoborockCode,
  submitRoborockCode,
  loginRoborockWithPassword,
  sendRoborockCommand,
} from "@/lib/roborock.functions";
import stovsugerArt from "@/assets/got-stovsuger.jpg";
import roboVacImg from "@/assets/icon-roborock-vacuum.png";
import { VacuumFX } from "@/components/RobotFX";

type Snap = Awaited<ReturnType<typeof getRoborockSnapshot>>;

const STATE_LABEL: Record<number, string> = {
  1: "Reiser seg", 2: "Lader (avbrutt)", 3: "Hviler", 4: "Fjernstyrt", 5: "Renser hallen",
  6: "Returnerer til tronen", 7: "Manuell modus", 8: "Lader ved tronen", 9: "Lade-feil",
  10: "Pauset", 11: "Sone-rens", 12: "Feil", 13: "Skrur av", 14: "Oppdaterer skriftrullene",
  15: "Dokker", 16: "Marsjerer", 17: "Sone-rens", 18: "Rom-rens",
  22: "Tømmer beholderen", 23: "Vasker moppen", 26: "Vender hjem for å vaske moppen",
};

const FAN_POWER_LABEL: Record<number, string> = {
  101: "Hvisken", 102: "Balansert", 103: "Storm", 104: "Drage-pust", 105: "Stille",
  106: "Skånsom",
};

const WATER_BOX_LABEL: Record<number, string> = {
  200: "Tørr", 201: "Lett dugg", 202: "Middels", 203: "Flomvann",
};

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

const CLOUD_COMMANDS: Array<{ method: string; label: string; icon: typeof Play; params?: any[]; tone: "primary" | "warn" | "danger" | "ghost" }> = [
  { method: "app_start", label: "Marsjer", icon: Swords, tone: "primary" },
  { method: "app_pause", label: "Holdt!", icon: Pause, tone: "warn" },
  { method: "app_stop", label: "Stå", icon: Square, tone: "danger" },
  { method: "app_charge", label: "Hjem til tronen", icon: Home, tone: "ghost" },
  { method: "find_me", label: "Kall ravnen", icon: Bell, tone: "ghost", params: [{}] },
];

function FancyButton({
  onClick,
  disabled,
  busy,
  Icon,
  label,
  tone,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  Icon: typeof Play;
  label: string;
  tone: "primary" | "warn" | "danger" | "ghost";
}) {
  const tones: Record<string, string> = {
    primary:
      "border-primary/60 text-primary bg-gradient-to-b from-primary/10 to-transparent hover:from-primary/25 hover:to-primary/5 shadow-[0_0_18px_-6px_hsl(var(--primary)/0.6)]",
    warn:
      "border-amber-500/50 text-amber-300 bg-gradient-to-b from-amber-500/10 to-transparent hover:from-amber-500/20",
    danger:
      "border-destructive/60 text-destructive bg-gradient-to-b from-destructive/10 to-transparent hover:from-destructive/20",
    ghost:
      "border-border text-foreground/80 bg-card/30 hover:border-primary/40 hover:text-foreground",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative inline-flex items-center gap-2 px-4 py-2.5 rounded-md border text-[11px] tracking-[0.25em] uppercase transition-all disabled:opacity-50 disabled:pointer-events-none ${tones[tone]}`}
    >
      <span className="absolute inset-0 rounded-md ring-1 ring-inset ring-white/5 pointer-events-none" />
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
      {label}
    </button>
  );
}

function StatTile({
  Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  Icon: typeof Battery;
  label: string;
  value: React.ReactNode;
  hint?: string | null;
  tone?: "default" | "primary" | "warn" | "danger";
}) {
  const ring: Record<string, string> = {
    default: "border-border",
    primary: "border-primary/40 shadow-[0_0_24px_-12px_hsl(var(--primary)/0.7)]",
    warn: "border-amber-500/40",
    danger: "border-destructive/50",
  };
  const accent: Record<string, string> = {
    default: "text-primary",
    primary: "text-primary",
    warn: "text-amber-400",
    danger: "text-destructive",
  };
  return (
    <div className={`relative rounded-lg border ${ring[tone]} bg-gradient-to-br from-card/60 via-card/30 to-transparent p-3 overflow-hidden`}>
      <div className="absolute -right-4 -top-4 opacity-[0.06]">
        <Icon size={72} />
      </div>
      <div className="flex items-center gap-1.5 text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
        <Icon size={11} className={accent[tone]} />
        {label}
      </div>
      <div className="mt-1 text-base font-serif text-foreground leading-tight">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground/80 mt-0.5">{hint}</div>}
    </div>
  );
}

function batteryTone(b: number | null): "primary" | "warn" | "danger" | "default" {
  if (b == null) return "default";
  if (b < 20) return "danger";
  if (b < 50) return "warn";
  return "primary";
}

function consumableTone(p: number | null): "primary" | "warn" | "danger" | "default" {
  if (p == null) return "default";
  if (p < 15) return "danger";
  if (p < 35) return "warn";
  return "default";
}

export function StovsugerenPanel() {
  const fetchSnap = useServerFn(getRoborockSnapshot);
  const sendCode = useServerFn(sendRoborockCode);
  const submitCode = useServerFn(submitRoborockCode);
  const passwordLogin = useServerFn(loginRoborockWithPassword);
  const sendCmd = useServerFn(sendRoborockCommand);

  const [snap, setSnap] = useState<Snap | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"send" | "verify" | "password" | null>(null);
  const [busyCmd, setBusyCmd] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setSnap(await fetchSnap());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSend = async () => {
    setBusy("send"); setInfo(null);
    const r = await sendCode();
    setBusy(null);
    setInfo(r.ok ? "Ravnen er sendt — sjekk skriftrullene (e-post)." : `Feil: ${r.error}`);
  };

  const onVerify = async () => {
    if (!code.trim()) return;
    setBusy("verify"); setInfo(null);
    const r = await submitCode({ data: { code } });
    setBusy(null);
    if (r.ok) { setInfo("Innloggingen er beseglet ✓"); setCode(""); await load(); }
    else setInfo(`Feil: ${r.error}`);
  };

  const onPassword = async () => {
    setBusy("password"); setInfo(null);
    const r = await passwordLogin();
    setBusy(null);
    if (r.ok) { setInfo("Innlogget med passord ✓"); await load(); }
    else setInfo(`Feil: ${r.error}`);
  };

  const runCmd = async (duid: string, method: string, params?: any[]) => {
    const key = `${duid}:${method}`;
    setBusyCmd(key); setInfo(null);
    try {
      const r = await sendCmd({ data: { duid, method, params: params ?? [] } });
      setInfo(r.ok ? `✓ ${method} sendt${r.acked ? " (bekreftet av borgen)" : ""}` : `✗ ${method}: ${r.error ?? "ukjent feil"}`);
    } catch (e: any) {
      setInfo(`✗ ${method}: ${e?.message ?? String(e)}`);
    } finally {
      setBusyCmd(null);
    }
  };

  return (
    <section className="container mx-auto px-4 pt-6 space-y-6">
      {/* Banner */}
      <article className="relative overflow-hidden rounded-xl border border-primary/30 panel">
        <div className="absolute inset-0 opacity-30">
          <img
            src={stovsugerArt}
            alt="Roborock i borgens hall"
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        </div>
        <div className="relative p-5 sm:p-7 flex items-center gap-4">
          <Crown className="text-primary" size={28} />
          <div className="flex-1">
            <div className="text-[10px] tracking-[0.4em] uppercase text-primary/80">Borgens tjenere</div>
            <h2 className="text-xl sm:text-2xl font-serif text-foreground tracking-wide">
              Støvsugerens ridderorden
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-xl">
              To tro Roborock-knekter — én vokter Borgen, én vokter hytta. Send dem på marsj, kall dem
              hjem til tronen, eller hvil dem ved peisen.
            </p>
          </div>
          <div className="hidden sm:flex flex-col gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded border border-primary/40 text-primary text-[11px] tracking-[0.25em] uppercase hover:bg-primary/10 disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Speid på nytt
            </button>
            <button
              onClick={() => { setShowLogin((s) => !s); setInfo(null); }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded border border-border text-foreground/80 text-[11px] tracking-[0.25em] uppercase hover:border-primary/60 hover:text-foreground"
            >
              <KeyRound size={12} />
              Logg inn på nytt
            </button>
          </div>
        </div>
      </article>

      {loading && !snap && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Henter rapport fra ravneposten…
        </div>
      )}

      {/* Devices */}
      {snap?.ok && snap.devices.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          {snap.devices.map((d) => {
            const status = (d.attribute ?? {}) as Record<string, unknown>;
            const state = num(status[121]) ?? num(status.state);
            const battery = num(status[122]) ?? num(status.battery);
            const fan = num(status[123]) ?? num(status.fan_power);
            const water = num(status[124]) ?? num(status.water_box_mode);
            const main = num(status[125]) ?? num(status.main_brush_life);
            const side = num(status[126]) ?? num(status.side_brush_life);
            const filter = num(status[127]) ?? num(status.filter_life);
            const errorCode = num(status[120]) ?? num(status.error_code);
            const cleanArea = num(status.clean_area) ?? num(status[114]);
            const cleanTime = num(status.clean_time) ?? num(status[113]);

            const allKeys = Object.keys(status).sort((a, b) => {
              const an = Number(a), bn = Number(b);
              if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
              if (!Number.isNaN(an)) return -1;
              if (!Number.isNaN(bn)) return 1;
              return a.localeCompare(b);
            });

            return (
              <article
                key={d.duid}
                className="relative rounded-xl border border-border bg-gradient-to-b from-card/70 via-card/40 to-card/20 overflow-hidden panel"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
                <header className="p-4 sm:p-5 flex items-start gap-3 border-b border-border/60">
                  {(() => {
                    const active = state != null && [5, 6, 11, 15, 16, 17, 18].includes(state);
                    return (
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl animate-pulse" />
                        <div className={`relative w-16 h-16 rounded-full border ${active ? "border-sky-300/60 bg-sky-400/10" : "border-primary/40 bg-card/80"} flex items-center justify-center`}>
                          <VacuumFX mode={active ? "suck" : "orbit"} />
                          <img
                            src={roboVacImg}
                            alt={d.name}
                            width={56}
                            height={56}
                            loading="lazy"
                            className={`relative h-14 w-14 object-contain ${active ? "animate-spin" : ""}`}
                            style={active ? { animationDuration: "6s" } : undefined}
                          />
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-serif text-foreground truncate">{d.name}</h3>
                      {d.online ? (
                        <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.25em] uppercase text-primary">
                          <Wifi size={11} /> Vakt
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
                          <WifiOff size={11} /> Borte
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mt-0.5">
                      {d.productName ?? "Roborock"}{d.fv ? ` · v${d.fv}` : ""}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5 break-all font-mono">
                      {d.duid}
                    </div>
                  </div>
                </header>

                <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <StatTile
                    Icon={Battery}
                    label="Energi"
                    value={battery != null ? `${battery}%` : "—"}
                    tone={batteryTone(battery)}
                  />
                  <StatTile
                    Icon={Shield}
                    label="Tilstand"
                    value={state != null ? (STATE_LABEL[state] ?? `kode ${state}`) : "—"}
                  />
                  <StatTile
                    Icon={Wind}
                    label="Sugekraft"
                    value={fan != null ? (FAN_POWER_LABEL[fan] ?? `kode ${fan}`) : "—"}
                  />
                  <StatTile
                    Icon={Droplets}
                    label="Mopp"
                    value={water != null ? (WATER_BOX_LABEL[water] ?? `kode ${water}`) : "—"}
                  />
                  <StatTile
                    Icon={Swords}
                    label="Hovedbørste"
                    value={main != null ? `${main}%` : "—"}
                    tone={consumableTone(main)}
                  />
                  <StatTile
                    Icon={Swords}
                    label="Sidebørste"
                    value={side != null ? `${side}%` : "—"}
                    tone={consumableTone(side)}
                  />
                  <StatTile
                    Icon={FilterIcon}
                    label="Filter"
                    value={filter != null ? `${filter}%` : "—"}
                    tone={consumableTone(filter)}
                  />
                  {cleanArea != null && (
                    <StatTile
                      Icon={Home}
                      label="Erobret område"
                      value={`${(cleanArea / 1_000_000).toFixed(1)} m²`}
                    />
                  )}
                  {cleanTime != null && (
                    <StatTile
                      Icon={Hourglass}
                      label="Marsjtid"
                      value={`${Math.round(cleanTime / 60)} min`}
                    />
                  )}
                  {errorCode != null && errorCode !== 0 && (
                    <StatTile
                      Icon={AlertTriangle}
                      label="Varsel"
                      value={`Feilkode ${errorCode}`}
                      tone="danger"
                    />
                  )}
                </div>

                {/* Commands */}
                <div className="px-4 sm:px-5 pb-4 space-y-4">
                  <div>
                    <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
                      ⚔ Befalinger
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {CLOUD_COMMANDS.map((c) => (
                        <FancyButton
                          key={c.method}
                          Icon={c.icon}
                          label={c.label}
                          tone={c.tone}
                          busy={busyCmd === `${d.duid}:${c.method}`}
                          disabled={busyCmd !== null || !d.online}
                          onClick={() => runCmd(d.duid, c.method, c.params)}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Wind size={11} className="text-primary" /> Sugekraft
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { v: 105, label: "Stille" },
                        { v: 101, label: "Hvisken" },
                        { v: 102, label: "Balansert" },
                        { v: 103, label: "Storm" },
                        { v: 104, label: "Drage-pust" },
                      ].map((opt) => {
                        const active = fan === opt.v;
                        const key = `${d.duid}:set_custom_mode:${opt.v}`;
                        return (
                          <button
                            key={opt.v}
                            disabled={busyCmd !== null || !d.online}
                            onClick={() => runCmd(d.duid, "set_custom_mode", [opt.v])}
                            className={`px-2.5 py-1.5 rounded border text-[10px] tracking-[0.2em] uppercase transition-all disabled:opacity-50 disabled:pointer-events-none ${
                              active
                                ? "border-primary text-primary bg-primary/15 shadow-[0_0_14px_-6px_hsl(var(--primary)/0.7)]"
                                : "border-border text-foreground/70 bg-card/30 hover:border-primary/40 hover:text-foreground"
                            }`}
                          >
                            {busyCmd === key && <Loader2 size={10} className="inline animate-spin mr-1" />}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Droplets size={11} className="text-primary" /> Moppvann
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { v: 200, label: "Tørr" },
                        { v: 201, label: "Lett dugg" },
                        { v: 202, label: "Middels" },
                        { v: 203, label: "Flomvann" },
                      ].map((opt) => {
                        const active = water === opt.v;
                        const key = `${d.duid}:set_water_box_custom_mode:${opt.v}`;
                        return (
                          <button
                            key={opt.v}
                            disabled={busyCmd !== null || !d.online}
                            onClick={() => runCmd(d.duid, "set_water_box_custom_mode", [opt.v])}
                            className={`px-2.5 py-1.5 rounded border text-[10px] tracking-[0.2em] uppercase transition-all disabled:opacity-50 disabled:pointer-events-none ${
                              active
                                ? "border-primary text-primary bg-primary/15 shadow-[0_0_14px_-6px_hsl(var(--primary)/0.7)]"
                                : "border-border text-foreground/70 bg-card/30 hover:border-primary/40 hover:text-foreground"
                            }`}
                          >
                            {busyCmd === key && <Loader2 size={10} className="inline animate-spin mr-1" />}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* All details */}
                {allKeys.length > 0 && (
                  <details className="border-t border-border/60 group">
                    <summary className="px-4 sm:px-5 py-3 cursor-pointer text-[10px] tracking-[0.3em] uppercase text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60 group-open:bg-primary" />
                      Alle skriftruller ({allKeys.length} felt)
                    </summary>
                    <div className="px-4 sm:px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                      {allKeys.map((k) => (
                        <div key={k} className="truncate flex justify-between gap-2 border-b border-border/30 py-0.5">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="text-foreground/90 truncate">{String(status[k] ?? "—")}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Login flow */}
      {snap && !snap.ok && snap.needsLogin && (
        <article className="panel rounded-xl p-5 border border-primary/30 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="text-primary" size={18} />
            <h3 className="font-serif text-lg text-foreground">Få tilgang til Roborock-skyen</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            For å høre fra knektene må du sende en ravn (kode på e-post) eller logge inn med passord.
          </p>
          <div className="flex flex-wrap gap-2">
            <FancyButton
              Icon={KeyRound} label="Logg inn med passord" tone="primary"
              busy={busy === "password"} disabled={busy !== null} onClick={onPassword}
            />
            <FancyButton
              Icon={Mail} label="Send kode på e-post" tone="ghost"
              busy={busy === "send"} disabled={busy !== null} onClick={onSend}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Kode fra e-post"
              className="flex-1 bg-card/30 border border-border rounded px-3 py-2 text-sm focus:border-primary/60 outline-none"
            />
            <FancyButton
              Icon={KeyRound} label="Forsegl" tone="primary"
              busy={busy === "verify"} disabled={busy !== null || !code.trim()} onClick={onVerify}
            />
          </div>
        </article>
      )}

      {info && (
        <p className="text-[11px] text-muted-foreground italic px-1">{info}</p>
      )}
    </section>
  );
}
