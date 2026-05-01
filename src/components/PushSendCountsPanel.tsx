import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { getPushCounts, type PushCountsRow } from "@/server/push-log.functions";

export function PushSendCountsPanel() {
  const fetchCounts = useServerFn(getPushCounts);
  const [rows, setRows] = useState<PushCountsRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchCounts()
        .then((r) => {
          if (!cancelled) {
            setRows(r);
            setErr(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setErr(e?.message ?? "Klarte ikke laste varslingstall");
        });
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [fetchCounts]);

  return (
    <section className="panel rounded-lg p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell size={16} className="text-primary" />
        <h2 className="text-display tracking-[0.25em] uppercase text-sm text-primary">
          Sendte varslinger
        </h2>
      </div>
      {err && <p className="text-rose-400 text-xs">{err}</p>}
      {!rows && !err && <p className="text-muted-foreground text-xs">Laster…</p>}
      {rows && rows.length === 0 && (
        <p className="text-muted-foreground text-xs">Ingen varslinger sendt ennå.</p>
      )}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left py-1.5 pr-3">Mottaker</th>
                <th className="text-right py-1.5 px-2">I dag</th>
                <th className="text-right py-1.5 px-2">7d</th>
                <th className="text-right py-1.5 px-2">30d</th>
                <th className="text-right py-1.5 pl-2">Totalt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.recipient} className="border-t border-border/50">
                  <td className="py-1.5 pr-3 font-medium text-foreground">{r.recipient}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.today}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.week}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.month}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums font-semibold text-primary">
                    {r.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
