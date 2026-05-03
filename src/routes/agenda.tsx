import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import heroImg from "@/assets/got-agenda.jpg";
import { Trash2, Plus, Bell, BellOff, Clock } from "lucide-react";
import { getPushPublicKey } from "@/server/agenda-push";
import { GarbageCollectionPanel } from "@/components/GarbageCollectionPanel";
import { BirthdaysPanel } from "@/components/BirthdaysPanel";
import { UpcomingPushPanel } from "@/components/UpcomingPushPanel";
import {
  type Who,
  getCurrentSubscriptionDetails,
  getStoredWho,
  isPushSupported,
  isCurrentlySubscribed,
  subscribePush,
  unsubscribePush,
  updateSubscriptionWho,
} from "@/lib/push-client";

export const Route = createFileRoute("/agenda")({
  head: () => ({
    meta: [
      { title: "Krøniken — Agenda | House Pettersen Riis" },
      { name: "description", content: "Husets kalender & meldinger med dato, tid og push-varsler." },
      { property: "og:title", content: "Krøniken — Agenda | House Pettersen Riis" },
      { property: "og:description", content: "Send korte meldinger med dato, tid og varsler til familiens agenda." },
    ],
  }),
  component: AgendaPage,
});

type Msg = {
  id: string;
  subject: string;
  body: string | null;
  event_date: string;
  event_time: string | null;
  who: string;
  notify_minutes_before: number | null;
  notified_at: string | null;
  created_at: string;
};

const WHO: Who[] = ["Alle", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"];
const NOTIFY_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Ingen varsling" },
  { value: 5, label: "5 min før" },
  { value: 15, label: "15 min før" },
  { value: 30, label: "30 min før" },
  { value: 60, label: "1 time før" },
];

function AgendaPage() {
  const [items, setItems] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [who, setWho] = useState<Who>("Alle");
  const [notifyMin, setNotifyMin] = useState<number | null>(15);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("agenda_messages")
      .select("*")
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true, nullsFirst: false });
    if (!error && data) setItems(data as Msg[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("agenda_messages").insert({
      subject: subject.trim(),
      body: body.trim() || null,
      event_date: date,
      event_time: time || null,
      who,
      notify_minutes_before: notifyMin,
    });
    setSubmitting(false);
    if (!error) {
      setSubject("");
      setBody("");
      setDate(today);
      setTime("09:00");
      setWho("Alle");
      setNotifyMin(15);
      load();
    }
  }

  async function remove(id: string) {
    await supabase.from("agenda_messages").delete().eq("id", id);
    setItems((prev) => prev.filter((m) => m.id !== id));
  }

  // Group by date
  const grouped = items.reduce<Record<string, Msg[]>>((acc, m) => {
    (acc[m.event_date] ||= []).push(m);
    return acc;
  }, {});

  const upcoming = Object.entries(grouped).filter(([d]) => d >= today);
  const past = Object.entries(grouped)
    .filter(([d]) => d < today)
    .reverse();

  return (
    <PageShell>
      <PageHero
        eyebrow="Husets krønike"
        title="Agenda & Meldinger"
        subtitle="Skriv korte meldinger med dato, tid og varsler — så husker huset hva som venter."
        image={heroImg}
      />

      <PushSubscribeBar />

      <GarbageCollectionPanel />

      <BirthdaysPanel />

      <TestPushPanel />

      <section className="container mx-auto px-4 py-12 grid lg:grid-cols-3 gap-8">
        <form onSubmit={handleSubmit} className="panel rounded-lg p-6 lg:sticky lg:top-24 h-fit">
          <h2 className="text-xl text-primary mb-4 flex items-center gap-2">
            <Plus size={20} /> Ny oppføring
          </h2>
          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Emne</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="F.eks. Tannlege, Hyttetur, Bursdag"
            required
            maxLength={120}
            className="w-full bg-input border border-border rounded px-3 py-2 mb-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Beskrivelse (valgfri)
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full bg-input border border-border rounded px-3 py-2 mb-3 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Dato</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-input border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Tid</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-full bg-input border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">For</label>
              <select
                value={who}
                onChange={(e) => setWho(e.target.value as Who)}
                className="w-full bg-input border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {WHO.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Varsle</label>
              <select
                value={notifyMin === null ? "" : String(notifyMin)}
                onChange={(e) => setNotifyMin(e.target.value === "" ? null : Number(e.target.value))}
                className="w-full bg-input border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {NOTIFY_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value === null ? "" : String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !subject.trim()}
            className="w-full bg-primary text-primary-foreground font-semibold tracking-wider uppercase py-2.5 rounded hover:opacity-90 disabled:opacity-50 transition"
          >
            {submitting ? "Sender ravn..." : "Send til krøniken"}
          </button>
        </form>

        <div className="lg:col-span-2 space-y-10">
          <DateSection
            title="Kommende"
            entries={upcoming}
            onDelete={remove}
            loading={loading}
            empty="Ingen kommende oppføringer."
          />
          {past.length > 0 && <DateSection title="Tidligere" entries={past} onDelete={remove} loading={false} muted />}
        </div>
      </section>
    </PageShell>
  );
}

function PushSubscribeBar() {
  const fetchPushPublicKey = useServerFn(getPushPublicKey);
  const [supported, setSupported] = useState<boolean>(true);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [who, setWho] = useState<Who>("Alle");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setSupported(isPushSupported());
    setWho(getStoredWho());
    isCurrentlySubscribed().then(setSubscribed);
  }, []);

  async function toggle() {
    setBusy(true);
    setMsg(null);
    if (subscribed) {
      const r = await unsubscribePush();
      if (r.ok) {
        setSubscribed(false);
        setMsg("Varsler slått av på denne enheten.");
      } else setMsg(r.error || "Kunne ikke slå av.");
    } else {
      const { vapidPublicKey } = await fetchPushPublicKey();
      const r = await subscribePush(who, vapidPublicKey);
      if (r.ok) {
        setSubscribed(true);
        setMsg(`Varsler slått på for "${who}" på denne enheten.`);
      } else setMsg(r.error || "Kunne ikke slå på.");
    }
    setBusy(false);
  }

  async function changeWho(next: Who) {
    setWho(next);
    if (subscribed) {
      setBusy(true);
      const r = await updateSubscriptionWho(next);
      setBusy(false);
      setMsg(r.ok ? `Denne enheten er nå satt som "${next}".` : r.error || "Feil");
    }
  }

  if (!supported) {
    return (
      <section className="container mx-auto px-4 pt-6">
        <div className="panel rounded-lg p-4 text-sm text-muted-foreground flex items-center gap-2">
          <BellOff size={16} /> Denne enheten støtter ikke push-varsler (åpne i Chrome/Safari/Firefox på mobil eller PC).
        </div>
      </section>
    );
  }

  return (
    <section className="container mx-auto px-4 pt-6">
      <div className="panel rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          {subscribed ? <Bell size={18} className="text-primary" /> : <BellOff size={18} className="text-muted-foreground" />}
          <span className="font-medium text-foreground">Push-varsler</span>
          <span className="text-muted-foreground">
            {subscribed ? "Aktivert på denne enheten" : "Av — slå på for å få påminnelser"}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Jeg er</label>
          <select
            value={who}
            onChange={(e) => changeWho(e.target.value as Who)}
            className="bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground"
          >
            {WHO.filter((w) => w !== "Alle").map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className={`px-3 py-1.5 rounded text-sm font-medium border transition ${
              subscribed
                ? "border-border text-foreground hover:bg-accent/40"
                : "bg-primary text-primary-foreground border-primary hover:opacity-90"
            } disabled:opacity-50`}
          >
            {busy ? "..." : subscribed ? "Slå av" : "Slå på"}
          </button>
        </div>
      </div>
      {msg && <p className="text-xs text-muted-foreground mt-2 px-1">{msg}</p>}
    </section>
  );
}

function TestPushPanel() {
  const sendTestPush = useServerFn(sendAgendaTestPush);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSendTestPush() {
    setBusy(true);
    setMessage(null);
    try {
      const subscription = await getCurrentSubscriptionDetails();
      if (!subscription) {
        setMessage('Fant ikke aktiv push på denne enheten. Slå push av/på først.');
        return;
      }

      const result = await sendTestPush({
        data: { endpoint: subscription.endpoint, who: subscription.who },
      });
      setMessage(`Test-push sendt ${formatDateTimeNorwegian(result.sentAt)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kunne ikke sende test-push.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="container mx-auto px-4 pb-12">
      <div className="panel rounded-lg p-6 flex flex-col gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Test push</p>
          <h2 className="text-xl text-primary">Sjekk denne mobilen</h2>
          <p className="text-sm text-muted-foreground">
            Trykk her for å sende en test direkte til enheten som er aktivert på denne siden.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSendTestPush}
            disabled={busy}
            className="bg-primary text-primary-foreground font-semibold tracking-wider uppercase py-2.5 px-4 rounded hover:opacity-90 disabled:opacity-50 transition"
          >
            {busy ? 'Sender test…' : 'Send test-push'}
          </button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
      </div>
    </section>
  );
}

function DateSection({
  title,
  entries,
  onDelete,
  loading,
  empty,
  muted,
}: {
  title: string;
  entries: [string, Msg[]][];
  onDelete: (id: string) => void;
  loading: boolean;
  empty?: string;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="ornate-divider mb-6">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">{title}</span>
      </div>
      {loading && <p className="text-muted-foreground">Henter krøniken...</p>}
      {!loading && entries.length === 0 && empty && <p className="text-muted-foreground italic">{empty}</p>}
      <div className="space-y-6">
        {entries.map(([date, msgs]) => (
          <div key={date} className={muted ? "opacity-70" : ""}>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-medieval text-2xl text-primary">{formatDate(date)}</span>
              <span className="text-xs text-muted-foreground tracking-wider uppercase">{weekday(date)}</span>
            </div>
            <ul className="space-y-2">
              {msgs.map((m) => (
                <li key={m.id} className="panel rounded p-4 flex gap-3 items-start">
                  <span
                    className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border shrink-0 ${whoBadge(m.who)}`}
                  >
                    {m.who}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h4 className="text-foreground font-semibold">{m.subject}</h4>
                      {m.event_time && (
                        <span className="text-xs text-primary/80 tabular-nums flex items-center gap-1">
                          <Clock size={11} /> {m.event_time.slice(0, 5)}
                        </span>
                      )}
                      {m.notify_minutes_before !== null && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <Bell size={10} /> {m.notify_minutes_before} min før
                        </span>
                      )}
                      {m.notified_at && (
                        <span className="text-[10px] uppercase tracking-wider text-primary/80 flex items-center gap-1">
                          <Bell size={10} /> Sendt {formatDateTimeNorwegian(m.notified_at)}
                        </span>
                      )}
                    </div>
                    {m.body && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{m.body}</p>}
                  </div>
                  <button
                    onClick={() => onDelete(m.id)}
                    className="text-muted-foreground hover:text-destructive transition p-1"
                    aria-label="Slett"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function whoBadge(who: string) {
  if (who === "Arne") return "border-primary/50 text-primary";
  if (who === "Rebekka") return "border-accent/60 text-foreground bg-accent/30";
  return "border-border text-muted-foreground";
}

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
}
function weekday(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("nb-NO", { weekday: "long" });
}

function formatDateTimeNorwegian(iso: string) {
  return new Date(iso).toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
