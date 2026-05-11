import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Wifi, WifiOff, Battery, RefreshCw, Mail, KeyRound } from "lucide-react";
import {
  getRoborockSnapshot,
  sendRoborockCode,
  submitRoborockCode,
} from "@/server/roborock.functions";

type Snap = Awaited<ReturnType<typeof getRoborockSnapshot>>;

const STATE_LABEL: Record<number, string> = {
  1: "Starter", 2: "Lader (avbrutt)", 3: "Inaktiv", 4: "Fjernstyrt", 5: "Renser",
  6: "Returnerer til dokk", 7: "Manuell modus", 8: "Lader", 9: "Lade-feil",
  10: "Pause", 11: "Sone-rens", 12: "Feil", 13: "Skrur av", 14: "Oppdaterer",
  15: "Dokker", 16: "Går til punkt", 17: "Sone-rens", 18: "Rom-rens",
  22: "Tømmer støv", 23: "Vasker mopp", 26: "Returnerer for å vaske mopp",
};

export function RoborockPanel() {
  const fetchSnap = useServerFn(getRoborockSnapshot);
  const sendCode = useServerFn(sendRoborockCode);
  const submitCode = useServerFn(submitRoborockCode);

  const [snap, setSnap] = useState<Snap | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setSnap(await fetchSnap()); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onSend = async () => {
    setBusy("send"); setInfo(null);
    const r = await sendCode();
    setBusy(null);
    setInfo(r.ok ? "Kode sendt på e-post. Sjekk innboksen." : `Feil: ${r.error}`);
  };

  const onVerify = async () => {
    if (!code.trim()) return;
    setBusy("verify"); setInfo(null);
    const r = await submitCode({ data: { code } });
    setBusy(null);
    if (r.ok) {
      setInfo("Logget inn ✓");
      setCode("");
      await load();
    } else {
      setInfo(`Feil: ${r.error}`);
    }
  };

  return (
    <section className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-primary" />
          <h3 className="text-foreground font-semibold flex-1">Roborock</h3>
          <button
            onClick={load}
            disabled={loading}
            className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-primary/60 disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Oppdater
          </button>
        </div>

        {loading && !snap && (
          <div className="text-xs text-muted-foreground mt-3">Henter status…</div>
        )}

        {snap && !snap.ok && snap.needsLogin && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Roborock krever engangs-kode på e-post for å logge inn.
            </p>
            <button
              onClick={onSend}
              disabled={busy !== null}
              className="text-xs inline-flex items-center gap-2 px-3 py-2 rounded border border-border hover:border-primary/60 disabled:opacity-50"
            >
              {busy === "send" ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
              Send kode på e-post
            </button>
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Kode fra e-post"
                className="flex-1 bg-card/30 border border-border rounded px-2 py-2 text-sm"
              />
              <button
                onClick={onVerify}
                disabled={busy !== null || !code.trim()}
                className="text-xs inline-flex items-center gap-2 px-3 py-2 rounded border border-border hover:border-primary/60 disabled:opacity-50"
              >
                {busy === "verify" ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                Logg inn
              </button>
            </div>
            {info && <p className="text-[11px] text-muted-foreground">{info}</p>}
          </div>
        )}

        {snap && !snap.ok && !snap.needsLogin && (
          <div className="mt-3 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
            {snap.error}
          </div>
        )}

        {snap?.ok && snap.devices.length === 0 && (
          <div className="text-xs text-muted-foreground mt-3">Ingen enheter funnet på kontoen.</div>
        )}

        {snap?.ok && snap.devices.length > 0 && (
          <div className="mt-3 space-y-2">
            {snap.devices.map((d) => {
              const status = (d.attribute ?? {}) as any;
              const state = typeof status?.state === "number" ? status.state : null;
              const battery = typeof status?.battery === "number" ? status.battery : null;
              return (
                <div key={d.duid} className="rounded-lg border border-border bg-card/30 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground flex-1 truncate">{d.name}</span>
                    {d.online ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                        <Wifi size={10} /> ONLINE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <WifiOff size={10} /> OFFLINE
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mt-1">
                    {d.productName ?? "Roborock"}{d.fv ? ` · v${d.fv}` : ""}
                  </div>
                  <div className="flex gap-3 mt-2 text-xs">
                    {battery != null && (
                      <span className="inline-flex items-center gap-1 text-foreground">
                        <Battery size={12} className="text-primary" /> {battery}%
                      </span>
                    )}
                    {state != null && (
                      <span className="text-muted-foreground">
                        Tilstand: <span className="text-foreground">{STATE_LABEL[state] ?? `kode ${state}`}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}
