import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Zap } from "lucide-react";
import { getTibberPeakHours, type PeakHoursResult, type PeakMonth } from "@/lib/tibber.functions";

const TIERS = [
  { max: 5, label: "0–5 kW", price: 269 },
  { max: 10, label: "5–10 kW", price: 459 },
  { max: 15, label: "10–15 kW", price: 648 },
];
const GOLD = "#a68b3a";
const TEXT = "#e8d9b0";

function tierFor(kw: number) {
  return TIERS.find((t) => kw < t.max) ?? null;
}

function fmtMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("nb-NO", { month: "long", year: "numeric" });
}
function fmtHour(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short" });
  const h = d.toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
  const end = new Date(d.getTime() + 3600_000).toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
  return `${day} kl. ${h}–${end}`;
}
const kw = (n: number) => n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PeakHoursPanel() {
  const fetchPeaks = useServerFn(getTibberPeakHours);
  const [data, setData] = useState<PeakHoursResult | null>(null);
  const [home, setHome] = useState<"tollnes" | "hytta">("tollnes");

  useEffect(() => {
    fetchPeaks().then(setData).catch((e) => setData({ homes: {}, error: String(e) }));
  }, [fetchPeaks]);

  const months = data?.homes[home] ?? [];

  return (
    <article
      className="rounded-lg p-5 sm:p-6 border space-y-4"
      style={{ background: "linear-gradient(180deg,#0a0804,#0e0a05)", borderColor: "rgba(166,139,58,0.28)" }}
    >
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] tracking-[0.42em] uppercase" style={{ color: GOLD, fontFamily: "Cinzel, serif" }}>
            Effekttrinn
          </div>
          <h2 className="text-2xl mt-1 flex items-center gap-2" style={{ color: TEXT, fontFamily: "Cinzel, serif" }}>
            <Zap size={20} style={{ color: GOLD }} /> Topp 3 timer per måned
          </h2>
          <p className="text-xs mt-1" style={{ color: "rgba(232,217,176,0.55)" }}>
            De tre timene med høyest forbruk (maks én per dag). Snittet avgjør nettleie-trinnet.
          </p>
        </div>
        <div className="flex gap-2">
          {(["tollnes", "hytta"] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHome(h)}
              className="px-4 py-1.5 rounded-full text-xs tracking-[0.2em] uppercase"
              style={{
                fontFamily: "Cinzel, serif",
                background: home === h ? GOLD : "transparent",
                color: home === h ? "#0a0804" : "rgba(232,217,176,0.6)",
                border: `1px solid ${home === h ? GOLD : "rgba(166,139,58,0.3)"}`,
              }}
            >
              {h === "tollnes" ? "Borgen" : "Hytta"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap gap-2 text-[11px]" style={{ color: "rgba(232,217,176,0.7)" }}>
        {TIERS.map((t) => (
          <span key={t.label} className="px-2 py-1 rounded border" style={{ borderColor: "rgba(166,139,58,0.25)" }}>
            {t.label}: {t.price} kr/mnd
          </span>
        ))}
      </div>

      {!data ? (
        <p className="text-xs" style={{ color: "rgba(232,217,176,0.5)" }}>Henter timer fra Tibber…</p>
      ) : data.error ? (
        <p className="text-xs" style={{ color: "#e07a5f" }}>{data.error}</p>
      ) : months.length === 0 ? (
        <p className="text-xs" style={{ color: "rgba(232,217,176,0.5)" }}>Ingen data.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {months.map((m) => <MonthCard key={m.month} m={m} />)}
        </div>
      )}
    </article>
  );
}

function MonthCard({ m }: { m: PeakMonth }) {
  const tier = tierFor(m.avgKw);
  const maxKwh = Math.max(...m.peaks.map((p) => p.kwh), 1);
  return (
    <div className="rounded-md p-4 border" style={{ borderColor: "rgba(166,139,58,0.2)", background: "rgba(166,139,58,0.04)" }}>
      <div className="flex justify-between items-baseline">
        <div className="capitalize text-sm" style={{ color: TEXT, fontFamily: "Cinzel, serif" }}>{fmtMonth(m.month)}</div>
        <div className="text-right">
          <div className="tabular-nums text-lg" style={{ color: GOLD }}>{kw(m.avgKw)} kW</div>
          <div className="text-[10px]" style={{ color: "rgba(232,217,176,0.6)" }}>
            {tier ? `${tier.label} → ${tier.price} kr` : "Over 15 kW"}
          </div>
        </div>
      </div>
      <ol className="mt-3 space-y-2">
        {m.peaks.map((p, i) => (
          <li key={p.from} className="text-xs">
            <div className="flex justify-between" style={{ color: "rgba(232,217,176,0.8)" }}>
              <span>{i + 1}. {fmtHour(p.from)}</span>
              <span className="tabular-nums">{kw(p.kwh)} kW</span>
            </div>
            <div className="h-1.5 mt-1 rounded" style={{ background: "rgba(166,139,58,0.12)" }}>
              <div className="h-full rounded" style={{ width: `${(p.kwh / maxKwh) * 100}%`, background: GOLD }} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
