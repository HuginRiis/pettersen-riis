import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import heroImg from "@/assets/hero-westeros.jpg";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/agenda")({
  head: () => ({
    meta: [
      { title: "Krøniken — Agenda | House Riis" },
      { name: "description", content: "Husets kalender og meldinger med dato og emne." },
      { property: "og:title", content: "Krøniken — Agenda | House Riis" },
      { property: "og:description", content: "Send korte meldinger med dato og emne til familiens agenda." },
    ],
  }),
  component: AgendaPage,
});

type Msg = {
  id: string;
  subject: string;
  body: string | null;
  event_date: string;
  who: string;
  created_at: string;
};

const WHO = ["Alle", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

function AgendaPage() {
  const [items, setItems] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [date, setDate] = useState(today);
  const [who, setWho] = useState<(typeof WHO)[number]>("Alle");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("agenda_messages").select("*").order("event_date", { ascending: true });
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
      who,
    });
    setSubmitting(false);
    if (!error) {
      setSubject("");
      setBody("");
      setDate(today);
      setWho("Alle");
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
        subtitle="Skriv korte meldinger med dato og emne — så husker huset hva som venter."
        image={heroImg}
      />

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

          <div className="grid grid-cols-2 gap-3 mb-4">
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
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">For</label>
              <select
                value={who}
                onChange={(e) => setWho(e.target.value as (typeof WHO)[number])}
                className="w-full bg-input border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {WHO.map((w) => (
                  <option key={w} value={w}>
                    {w}
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
                    className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${whoBadge(m.who)}`}
                  >
                    {m.who}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-foreground font-semibold">{m.subject}</h4>
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
