import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Cake, Bell, BellOff, Trash2, Plus, Send, Pencil, X, Check } from "lucide-react";
import { sendBirthdayTestPush } from "@/server/birthdays";

export type Birthday = {
  id: string;
  name: string;
  birth_date: string; // YYYY-MM-DD
  title: string | null;
  words: string | null;
  notify_enabled: boolean;
  notify_recipients: string[];
  notify_days_before: number;
  notify_hour: number | null;
  notify_minute: number | null;
};

const RECIPIENTS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

function getOsloToday(): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  return {
    y: Number(parts.find((p) => p.type === "year")!.value),
    m: Number(parts.find((p) => p.type === "month")!.value),
    d: Number(parts.find((p) => p.type === "day")!.value),
  };
}

export function daysUntilBirthday(birthDate: string, today = getOsloToday()): number {
  const [, bm, bd] = birthDate.split("-").map(Number);
  const todayUtc = Date.UTC(today.y, today.m - 1, today.d);
  let nextUtc = Date.UTC(today.y, bm - 1, bd);
  if (nextUtc < todayUtc) nextUtc = Date.UTC(today.y + 1, bm - 1, bd);
  return Math.round((nextUtc - todayUtc) / 86400000);
}

export function ageAtNextBirthday(birthDate: string, today = getOsloToday()): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const todayUtc = Date.UTC(today.y, today.m - 1, today.d);
  const thisYearUtc = Date.UTC(today.y, bm - 1, bd);
  const nextYear = thisYearUtc < todayUtc ? today.y + 1 : today.y;
  return nextYear - by;
}

export function formatNorwegianDate(birthDate: string): string {
  const [, m, d] = birthDate.split("-").map(Number);
  const months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
  return `${d}. ${months[m - 1]}`;
}

export function BirthdaysPanel() {
  const sendTest = useServerFn(sendBirthdayTestPush);
  const [items, setItems] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [title, setTitle] = useState("");
  const [words, setWords] = useState("");
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [recipients, setRecipients] = useState<string[]>(["Alle"]);
  const [daysBefore, setDaysBefore] = useState<number>(0);
  const [notifyTime, setNotifyTime] = useState<string>("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editWords, setEditWords] = useState("");
  const [editDaysBefore, setEditDaysBefore] = useState<number>(0);
  const [editNotifyTime, setEditNotifyTime] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("birthdays" as any)
      .select("id, name, birth_date, title, words, notify_enabled, notify_recipients, notify_days_before, notify_hour, notify_minute")
      .order("name", { ascending: true });
    if (!error && data) setItems(data as unknown as Birthday[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !birthDate) return;
    setSubmitting(true);
    const { error } = await supabase.from("birthdays" as any).insert({
      name: name.trim(),
      birth_date: birthDate,
      title: title.trim() || null,
      words: words.trim() || null,
      notify_enabled: notifyEnabled,
      notify_recipients: recipients.length > 0 ? recipients : ["Alle"],
    });
    setSubmitting(false);
    if (!error) {
      setName("");
      setBirthDate("");
      setTitle("");
      setWords("");
      setNotifyEnabled(true);
      setRecipients(["Alle"]);
      load();
    }
  }

  async function toggleNotify(b: Birthday) {
    await supabase
      .from("birthdays" as any)
      .update({ notify_enabled: !b.notify_enabled })
      .eq("id", b.id);
    setItems((prev) => prev.map((x) => (x.id === b.id ? { ...x, notify_enabled: !b.notify_enabled } : x)));
  }

  async function updateRecipients(b: Birthday, next: string[]) {
    const value = next.length > 0 ? next : ["Alle"];
    await supabase.from("birthdays" as any).update({ notify_recipients: value }).eq("id", b.id);
    setItems((prev) => prev.map((x) => (x.id === b.id ? { ...x, notify_recipients: value } : x)));
  }

  async function remove(id: string) {
    await supabase.from("birthdays" as any).delete().eq("id", id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  function startEdit(b: Birthday) {
    setEditingId(b.id);
    setEditName(b.name);
    setEditBirthDate(b.birth_date);
    setEditTitle(b.title ?? "");
    setEditWords(b.words ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    if (!editName.trim() || !editBirthDate) return;
    setEditSaving(true);
    const patch = {
      name: editName.trim(),
      birth_date: editBirthDate,
      title: editTitle.trim() || null,
      words: editWords.trim() || null,
    };
    const { error } = await supabase.from("birthdays" as any).update(patch).eq("id", id);
    setEditSaving(false);
    if (!error) {
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      setEditingId(null);
    }
  }

  async function sendTestFor(id: string) {
    setMessage(null);
    try {
      const r = await sendTest({ data: { id } });
      setMessage(`Test-push sendt til ${r.sent} av ${r.total} enheter${r.errors ? ` (${r.errors} feil)` : ""}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Kunne ikke sende test.");
    }
  }

  function toggleRecipientLocal(name: string) {
    setRecipients((prev) => {
      if (prev.includes(name)) return prev.filter((p) => p !== name);
      return [...prev, name];
    });
  }

  function toggleRecipientFor(b: Birthday, name: string) {
    const next = b.notify_recipients.includes(name)
      ? b.notify_recipients.filter((p) => p !== name)
      : [...b.notify_recipients, name];
    updateRecipients(b, next);
  }

  // Sort by upcoming
  const sorted = [...items].sort(
    (a, b) => daysUntilBirthday(a.birth_date) - daysUntilBirthday(b.birth_date),
  );

  return (
    <section className="container mx-auto px-4 pb-12">
      <div className="ornate-divider mb-6">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Bursdager
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <form onSubmit={handleAdd} className="panel rounded-lg p-6 lg:sticky lg:top-24 h-fit">
          <h3 className="text-lg text-primary mb-4 flex items-center gap-2">
            <Plus size={18} /> Ny bursdag
          </h3>
          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Navn</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            className="w-full bg-input border border-border rounded px-3 py-2 mb-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Fødselsdato</label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
            className="w-full bg-input border border-border rounded px-3 py-2 mb-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Tittel (valgfri)</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="F.eks. Lord av Skien"
            className="w-full bg-input border border-border rounded px-3 py-2 mb-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Hilsen (valgfri)</label>
          <input
            value={words}
            onChange={(e) => setWords(e.target.value)}
            maxLength={120}
            className="w-full bg-input border border-border rounded px-3 py-2 mb-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <label className="flex items-center gap-2 text-sm text-foreground mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyEnabled}
              onChange={(e) => setNotifyEnabled(e.target.checked)}
              className="accent-primary"
            />
            Send push kl 08:00 på dagen
          </label>

          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Mottakere (push)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {RECIPIENTS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRecipientLocal(r)}
                className={`px-2.5 py-1 rounded-full text-xs border transition ${
                  recipients.includes(r)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent/40"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={submitting || !name.trim() || !birthDate}
            className="w-full bg-primary text-primary-foreground font-semibold tracking-wider uppercase py-2.5 rounded hover:opacity-90 disabled:opacity-50 transition"
          >
            {submitting ? "Lagrer..." : "Legg til"}
          </button>
        </form>

        <div className="lg:col-span-2 space-y-3">
          {message && (
            <div className="panel rounded p-3 text-sm text-muted-foreground">{message}</div>
          )}
          {loading && <p className="text-muted-foreground">Henter bursdager...</p>}
          {!loading && sorted.length === 0 && (
            <p className="text-muted-foreground italic">Ingen bursdager registrert ennå.</p>
          )}
          <div className="relative">
            <div
              className="space-y-3 overflow-y-auto pr-2 birthdays-scroll"
              style={{
                maxHeight: "23rem",
                scrollbarWidth: "thin",
                maskImage: "linear-gradient(to bottom, black calc(100% - 3rem), transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 3rem), transparent 100%)",
              }}
            >
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 pb-1">
              ↓ Scroll for å se flere bursdager
            </p>
          {sorted.map((b) => {
            const dleft = daysUntilBirthday(b.birth_date);
            const age = ageAtNextBirthday(b.birth_date);
            const isToday = dleft === 0;
            const isEditing = editingId === b.id;
            return (
              <article
                key={b.id}
                className={`panel rounded p-4 ${isToday ? "border-primary/60 bg-primary/5" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-12 h-12 rounded-full bg-accent/30 flex items-center justify-center text-primary">
                    <Cake size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Navn</label>
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              maxLength={60}
                              className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Fødselsdato</label>
                            <input
                              type="date"
                              value={editBirthDate}
                              onChange={(e) => setEditBirthDate(e.target.value)}
                              className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tittel</label>
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            maxLength={80}
                            className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Hilsen</label>
                          <input
                            value={editWords}
                            onChange={(e) => setEditWords(e.target.value)}
                            maxLength={120}
                            className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <h4 className="text-foreground font-semibold">{b.name}</h4>
                          {b.title && <span className="text-xs text-primary/80">{b.title}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                          {formatNorwegianDate(b.birth_date)} • Fyller {age} år •{" "}
                          {isToday ? (
                            <span className="text-primary font-semibold">I dag!</span>
                          ) : (
                            <>{dleft} {dleft === 1 ? "dag" : "dager"} igjen</>
                          )}
                        </p>
                        {b.words && (
                          <p className="text-medieval text-primary text-sm mt-1">"{b.words}"</p>
                        )}

                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {RECIPIENTS.map((r) => {
                            const active = b.notify_recipients?.includes(r);
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={() => toggleRecipientFor(b, r)}
                                className={`px-2 py-0.5 rounded-full text-[10px] border transition ${
                                  active
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border text-muted-foreground hover:bg-accent/40"
                                }`}
                              >
                                {r}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveEdit(b.id)}
                          disabled={editSaving || !editName.trim() || !editBirthDate}
                          title="Lagre"
                          className="p-1.5 rounded border border-primary/60 text-primary hover:bg-primary/10 transition disabled:opacity-50"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={cancelEdit}
                          title="Avbryt"
                          className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(b)}
                          title="Rediger"
                          className="p-1.5 rounded border border-border text-muted-foreground hover:text-primary transition"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => toggleNotify(b)}
                          title={b.notify_enabled ? "Slå av push" : "Slå på push"}
                          className={`p-1.5 rounded border transition ${
                            b.notify_enabled
                              ? "border-primary/60 text-primary"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {b.notify_enabled ? <Bell size={14} /> : <BellOff size={14} />}
                        </button>
                        <button
                          onClick={() => sendTestFor(b.id)}
                          title="Send test-push nå"
                          className="p-1.5 rounded border border-border text-muted-foreground hover:text-primary transition"
                        >
                          <Send size={14} />
                        </button>
                        <button
                          onClick={() => remove(b.id)}
                          title="Slett"
                          className="p-1.5 rounded border border-border text-muted-foreground hover:text-destructive transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
