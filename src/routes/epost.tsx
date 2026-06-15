import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, MailOpen, AlertCircle, Flag, Paperclip, RefreshCw, ExternalLink, TrendingUp, Users, Clock } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getEmailStats, type EmailMessage } from "@/lib/email.functions";

export const Route = createFileRoute("/epost")({
  head: () => ({
    meta: [
      { title: "E-post — Innboks & statistikk" },
      { name: "description", content: "Oversikt over Outlook-innboksen med statistikk og viktige meldinger." },
    ],
  }),
  component: EpostPage,
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  if (same) return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function EpostPage() {
  const fetchStats = useServerFn(getEmailStats);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["email-stats"],
    queryFn: () => fetchStats(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const [tab, setTab] = useState<"viktig" | "ulest" | "alle">("viktig");

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Mail className="w-8 h-8 text-primary" />
              E-post
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Innboksen din fra Outlook med statistikk og viktige meldinger.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Oppdater
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 mb-4 text-sm">
            <strong>Kunne ikke hente e-post:</strong> {(error as Error)?.message || "Ukjent feil"}
          </div>
        )}

        {data && !data.ok && data.errorMessage && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 mb-4 text-sm">
            <strong>Outlook svarte ikke som forventet:</strong> {data.errorMessage}
          </div>
        )}

        {isLoading && (
          <div className="text-center py-12 text-muted-foreground">Laster innboks…</div>
        )}

        {data && (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatCard label="Totalt hentet" value={data.total} icon={<Mail />} color="#60a5fa" />
              <StatCard label="Ulest" value={data.unread} icon={<MailOpen />} color="#f59e0b" highlight={data.unread > 0} />
              <StatCard label="Viktig" value={data.highImportance} icon={<AlertCircle />} color="#ef4444" highlight={data.highImportance > 0} />
              <StatCard label="Flagget" value={data.flagged} icon={<Flag />} color="#a78bfa" />
              <StatCard label="I dag" value={data.today} icon={<Clock />} color="#22d3ee" />
              <StatCard label="Siste 7 dager" value={data.last7Days} icon={<TrendingUp />} color="#34d399" />
              <StatCard label="Siste 30 dager" value={data.last30Days} icon={<TrendingUp />} color="#10b981" />
              <StatCard label="Med vedlegg" value={data.withAttachments} icon={<Paperclip />} color="#94a3b8" />
            </div>

            <div className="grid lg:grid-cols-3 gap-4 mb-6">
              {/* Per-day chart */}
              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Siste 7 dager
                </h2>
                <PerDayChart data={data.perDay} />
              </div>

              {/* Top senders */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Mest aktive avsendere
                </h2>
                <ul className="space-y-2">
                  {data.topSenders.slice(0, 8).map((s) => (
                    <li key={s.email || s.name} className="flex items-center justify-between text-sm gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{s.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="px-2 py-0.5 rounded bg-secondary text-xs font-medium">{s.count}</span>
                        {s.unread > 0 && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs font-medium">
                            {s.unread} ulest
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Message lists */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex border-b border-border">
                <TabButton active={tab === "viktig"} onClick={() => setTab("viktig")}>
                  Viktigst ({data.importantMessages.length})
                </TabButton>
                <TabButton active={tab === "ulest"} onClick={() => setTab("ulest")}>
                  Ulest ({data.unreadMessages.length})
                </TabButton>
                <TabButton active={tab === "alle"} onClick={() => setTab("alle")}>
                  Siste ({data.recentMessages.length})
                </TabButton>
              </div>
              <ul className="divide-y divide-border">
                {(tab === "viktig" ? data.importantMessages : tab === "ulest" ? data.unreadMessages : data.recentMessages).map((m) => (
                  <MessageRow key={m.id} m={m} />
                ))}
                {tab === "ulest" && data.unreadMessages.length === 0 && (
                  <li className="p-6 text-center text-muted-foreground text-sm">Innboksen er tom — alt er lest 🎉</li>
                )}
              </ul>
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-right">
              Oppdatert {formatDate(data.fetchedAt)}
            </p>
          </>
        )}
      </div>
    </PageShell>
  );
}

function StatCard({ label, value, icon, color, highlight }: { label: string; value: number; icon: React.ReactNode; color: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span style={{ color }} className="[&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
        active ? "bg-secondary text-foreground border-b-2 border-primary" : "text-muted-foreground hover:bg-secondary/50"
      }`}
    >
      {children}
    </button>
  );
}

function MessageRow({ m }: { m: EmailMessage }) {
  return (
    <li className={`p-3 sm:p-4 hover:bg-secondary/30 ${!m.isRead ? "bg-primary/5" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-1">
          {m.isRead ? <MailOpen className="w-4 h-4 text-muted-foreground" /> : <Mail className="w-4 h-4 text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm ${m.isRead ? "" : "font-semibold"} truncate`}>{m.fromName}</span>
            {m.importance === "high" && (
              <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                <AlertCircle className="w-3 h-3" /> Viktig
              </span>
            )}
            {m.flagged && <Flag className="w-3 h-3 text-purple-400" />}
            {m.hasAttachments && <Paperclip className="w-3 h-3 text-muted-foreground" />}
            <span className="text-xs text-muted-foreground ml-auto shrink-0">{formatDate(m.receivedDateTime)}</span>
          </div>
          <div className={`text-sm mt-0.5 truncate ${m.isRead ? "text-muted-foreground" : ""}`}>{m.subject}</div>
          {m.bodyPreview && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.bodyPreview}</div>
          )}
          {m.webLink && (
            <a
              href={m.webLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
            >
              Åpne i Outlook <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

function PerDayChart({ data }: { data: { date: string; total: number; unread: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d) => {
        const dayName = new Date(d.date).toLocaleDateString("nb-NO", { weekday: "short" });
        const h = (d.total / max) * 100;
        const uh = (d.unread / max) * 100;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="text-xs font-medium">{d.total}</div>
            <div className="w-full bg-secondary rounded-t relative" style={{ height: `${Math.max(h, 4)}%` }}>
              <div className="absolute bottom-0 left-0 right-0 bg-amber-500 rounded-t" style={{ height: `${(uh / Math.max(h, 1)) * 100}%` }} />
              <div className="absolute inset-0 bg-primary/60 rounded-t" style={{ height: `${100}%`, opacity: 0.4 }} />
            </div>
            <div className="text-xs text-muted-foreground capitalize">{dayName}</div>
          </div>
        );
      })}
    </div>
  );
}
