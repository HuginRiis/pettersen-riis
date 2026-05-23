import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredWho, type Who } from "@/lib/push-client";
import { sendHyttaChecklistPush } from "@/server/agenda-push";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Bell,
  Trash2,
  Plus,
  Loader2,
  BellRing,
  BellOff,
  CalendarIcon,
  Clock,
  Pencil,
  Users,
} from "lucide-react";

const RECIPIENT_OPTIONS: { value: string; label: string }[] = [
  { value: "Alle", label: "Alle" },
  { value: "Arne & Rebekka", label: "Arne & Rebekka" },
  { value: "Arne", label: "Arne" },
  { value: "Rebekka", label: "Rebekka" },
];

type ChecklistItem = {
  id: string;
  label: string;
  added_by: string;
  checked: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  notify_at: string | null;
  notified_at: string | null;
  notify_who: string;
  repeat_interval_days: number | null;
};

const REPEAT_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "Ingen gjentakelse" },
  { value: "1", label: "Hver dag" },
  { value: "7", label: "Hver uke" },
  { value: "14", label: "Hver 14. dag" },
  { value: "30", label: "Hver 30. dag" },
];

function repeatLabel(days: number | null | undefined): string | null {
  if (!days || days <= 0) return null;
  if (days === 1) return "hver dag";
  if (days === 7) return "hver uke";
  if (days === 14) return "hver 14. dag";
  if (days === 30) return "hver 30. dag";
  return `hver ${days}. dag`;
}

function formatRelativeOslo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return "akkurat nå";
  if (diffMin < 60) return `${diffMin} min siden`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} t siden`;
  return new Date(iso).toLocaleDateString("nb-NO", {
    timeZone: "Europe/Oslo",
    day: "2-digit",
    month: "short",
  });
}

function formatNotifyOslo(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Combine local date + HH:mm into ISO UTC string (treating as Oslo local). */
function combineDateTimeToIso(date: Date | undefined, hhmm: string): string | null {
  if (!date) return null;
  const [hh, mm] = hhmm.split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  // The Date object is in browser-local. We want it to represent that local time.
  // For users in Norway this matches Oslo. Acceptable tradeoff for a private app.
  const d = new Date(date);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

type DateTimePickerProps = {
  value: string | null;
  onChange: (iso: string | null) => void;
  small?: boolean;
};

function DateTimePicker({ value, onChange, small }: DateTimePickerProps) {
  const initialDate = value ? new Date(value) : undefined;
  const [date, setDate] = useState<Date | undefined>(initialDate);
  const [time, setTime] = useState<string>(
    initialDate
      ? `${String(initialDate.getHours()).padStart(2, "0")}:${String(initialDate.getMinutes()).padStart(2, "0")}`
      : "18:00",
  );
  const [open, setOpen] = useState(false);

  const apply = (d: Date | undefined, t: string) => {
    const iso = combineDateTimeToIso(d, t);
    onChange(iso);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={small ? "sm" : "default"}
            className={cn("gap-1.5", !value && "text-muted-foreground")}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {date
              ? date.toLocaleDateString("nb-NO", { day: "2-digit", month: "short" })
              : "Velg dag"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              setDate(d);
              apply(d, time);
              setOpen(false);
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      <div className="relative">
        <Clock className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            apply(date, e.target.value);
          }}
          className={cn("pl-7 w-[105px]", small && "h-9")}
        />
      </div>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDate(undefined);
            onChange(null);
          }}
          className="text-muted-foreground hover:text-destructive px-2"
          aria-label="Fjern varsling"
        >
          <BellOff className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function HyttaChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [who, setWho] = useState<Who>("Alle");

  // Bulk-varsling tidspunkt (gjelder hele listen)
  const [bulkDate, setBulkDate] = useState<Date | undefined>(undefined);
  const [bulkTime, setBulkTime] = useState<string>("18:00");
  const [bulkWho, setBulkWho] = useState<string>("Alle");
  const [bulkRepeat, setBulkRepeat] = useState<string>("0");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  // Mottaker for "Send nå"
  const [sendNowWho, setSendNowWho] = useState<string>("Alle");

  useEffect(() => {
    setWho(getStoredWho());
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data, error } = await supabase
        .from("hytta_checklist")
        .select("*")
        .order("checked", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!mounted) return;
      if (error) {
        toast.error("Kunne ikke laste huskelisten");
      } else {
        setItems((data || []) as ChecklistItem[]);
      }
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel("hytta_checklist_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hytta_checklist" },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const addItem = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order), 0);
    const { error } = await supabase.from("hytta_checklist").insert({
      label,
      added_by: who,
      sort_order: maxOrder + 1,
    });
    setAdding(false);
    if (error) {
      toast.error("Kunne ikke legge til");
      return;
    }
    setNewLabel("");
  };

  const toggleItem = async (item: ChecklistItem) => {
    const { error } = await supabase
      .from("hytta_checklist")
      .update({ checked: !item.checked })
      .eq("id", item.id);
    if (error) toast.error("Kunne ikke oppdatere");
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from("hytta_checklist").delete().eq("id", id);
    if (error) toast.error("Kunne ikke slette");
  };

  const sendListPushNow = async () => {
    const open = items.filter((i) => !i.checked);
    if (open.length === 0) {
      toast.info("Listen er tom — ingenting å varsle om.");
      return;
    }
    setNotifying(true);
    try {
      const lines = open.slice(0, 10).map((i) => `• ${i.label}`).join("\n");
      const more = open.length > 10 ? `\n…og ${open.length - 10} til` : "";
      const res = await sendHyttaChecklistPush({
        data: {
          title: "📜 Huskeliste til hytta",
          body: `${open.length} punkt${open.length === 1 ? "" : "er"} venter:\n${lines}${more}`,
          url: "/hytta",
          who: sendNowWho,
        },
      });
      const target = sendNowWho === "Alle" ? "alle" : sendNowWho;
      toast.success(`Ravnen fløy til ${res.sent} av ${res.total} mottakere (${target})`);
    } catch (e) {
      toast.error(`Kunne ikke sende varsel: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setNotifying(false);
    }
  };

  const scheduleBulkPush = async () => {
    const iso = combineDateTimeToIso(bulkDate, bulkTime);
    if (!iso) {
      toast.error("Velg dag og tid først.");
      return;
    }
    if (new Date(iso).getTime() < Date.now() - 60_000) {
      toast.error("Tidspunktet må være i fremtiden.");
      return;
    }

    let toUpdate: string[];
    if (editingReminder) {
      // Editing: only update items that belonged to this reminder
      toUpdate = editingReminder.itemIds;
    } else {
      // Creating new: apply to all open items (overwrites any existing)
      const open = items.filter((i) => !i.checked);
      if (open.length === 0) {
        toast.info("Ingen åpne punkter å planlegge varsel for.");
        return;
      }
      toUpdate = open.map((i) => i.id);
    }

    setScheduling(true);
    const repeatDays = parseInt(bulkRepeat, 10);
    const { error } = await supabase
      .from("hytta_checklist")
      .update({
        notify_at: iso,
        notified_at: null,
        notify_who: bulkWho,
        repeat_interval_days: repeatDays > 0 ? repeatDays : null,
      } as never)
      .in("id", toUpdate);
    setScheduling(false);
    if (error) {
      toast.error("Kunne ikke planlegge varsel");
      return;
    }
    setBulkOpen(false);
    setBulkDate(undefined);
    setEditingReminder(null);
    const target = bulkWho === "Alle" ? "alle" : bulkWho;
    toast.success(
      `${editingReminder ? "Påminnelse oppdatert" : "Ravn planlagt"} ${formatNotifyOslo(iso)} til ${target} med ${toUpdate.length} punkt${toUpdate.length === 1 ? "" : "er"}`,
    );
  };


  const openCount = items.filter((i) => !i.checked).length;

  // Group scheduled reminders by (notify_at + notify_who) — each unique combo is one "påminnelse"
  const scheduledReminders = useMemo(() => {
    const groups = new Map<
      string,
      { notify_at: string; notify_who: string; itemIds: string[] }
    >();
    for (const i of items) {
      if (
        !i.checked &&
        i.notify_at &&
        !i.notified_at &&
        new Date(i.notify_at).getTime() > Date.now()
      ) {
        const key = `${i.notify_at}__${i.notify_who || "Alle"}`;
        const existing = groups.get(key);
        if (existing) existing.itemIds.push(i.id);
        else
          groups.set(key, {
            notify_at: i.notify_at,
            notify_who: i.notify_who || "Alle",
            itemIds: [i.id],
          });
      }
    }
    return Array.from(groups.values()).sort(
      (a, b) => new Date(a.notify_at).getTime() - new Date(b.notify_at).getTime(),
    );
  }, [items]);

  // Track which reminder is being edited (null = creating new)
  const [editingReminder, setEditingReminder] = useState<{
    notify_at: string;
    notify_who: string;
    itemIds: string[];
  } | null>(null);

  const openSchedulePopover = (
    reminder?: { notify_at: string; notify_who: string; itemIds: string[] } | null,
  ) => {
    if (reminder) {
      const d = new Date(reminder.notify_at);
      setBulkDate(d);
      setBulkTime(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      );
      setBulkWho(reminder.notify_who);
      setEditingReminder(reminder);
    } else {
      setBulkDate(undefined);
      setBulkTime("18:00");
      setBulkWho("Alle");
      setEditingReminder(null);
    }
    setBulkOpen(true);
  };

  const removeReminder = async (itemIds: string[]) => {
    const { error } = await supabase
      .from("hytta_checklist")
      .update({ notify_at: null, notified_at: null })
      .in("id", itemIds);
    if (error) {
      toast.error("Kunne ikke fjerne påminnelsen");
      return;
    }
    toast.info("Påminnelse fjernet");
  };

  return (
    <section className="container mx-auto px-4 pt-8">
      <div className="panel rounded-lg p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <div className="text-display tracking-[0.3em] text-primary text-xs uppercase mb-1">
              Husets pergament
            </div>
            <h2 className="heading-hero text-2xl sm:text-3xl">Huskeliste til hytta</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {openCount > 0
                ? `${openCount} punkt${openCount === 1 ? "" : "er"} ventes brakt til borgen`
                : "Alt er besørget — ravnene hviler"}
            </p>
            {scheduledReminders.length > 0 && (
              <div className="mt-2 space-y-1">
                {scheduledReminders.map((r) => (
                  <p
                    key={`${r.notify_at}__${r.notify_who}`}
                    className="text-xs text-primary inline-flex items-center gap-1.5 flex-wrap mr-3"
                  >
                    <BellRing className="h-3 w-3" />
                    Ravn planlagt {formatNotifyOslo(r.notify_at)} til{" "}
                    <span className="font-medium">
                      {r.notify_who === "Alle" ? "alle" : r.notify_who}
                    </span>
                    <span className="text-muted-foreground/70">
                      ({r.itemIds.length} punkt{r.itemIds.length === 1 ? "" : "er"})
                    </span>
                    <button
                      onClick={() => openSchedulePopover(r)}
                      className="ml-1 text-muted-foreground/70 hover:text-primary inline-flex items-center"
                      aria-label="Rediger påminnelse"
                      title="Rediger påminnelse"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => removeReminder(r.itemIds)}
                      className="text-muted-foreground/70 hover:text-destructive inline-flex items-center"
                      aria-label="Fjern påminnelse"
                      title="Fjern påminnelse"
                    >
                      <BellOff className="h-3 w-3" />
                    </button>
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Popover
              open={bulkOpen}
              onOpenChange={(o) => {
                if (o) openSchedulePopover(null);
                else {
                  setBulkOpen(false);
                  setEditingReminder(null);
                }
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={openCount === 0}
                  className="gap-2"
                >
                  <CalendarIcon className="h-4 w-4" />
                  Planlegg ravn
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Sett én påminnelse for hele huskelisten. Varselet inneholder alle åpne punkter.
                </p>
                <Calendar
                  mode="single"
                  selected={bulkDate}
                  onSelect={setBulkDate}
                  initialFocus
                  className={cn("p-0 pointer-events-auto")}
                />
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={bulkTime}
                    onChange={(e) => setBulkTime(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <Select value={bulkWho} onValueChange={setBulkWho}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Mottaker" />
                    </SelectTrigger>
                    <SelectContent>
                      {RECIPIENT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={scheduleBulkPush}
                  disabled={scheduling || !bulkDate}
                  className="w-full gap-2"
                  size="sm"
                >
                  {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                  {editingReminder ? "Oppdater påminnelse" : "Planlegg varsel"}
                </Button>
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-1.5">
              <Select value={sendNowWho} onValueChange={setSendNowWho}>
                <SelectTrigger className="h-9 w-[110px]" aria-label="Mottaker for push">
                  <SelectValue placeholder="Mottaker" />
                </SelectTrigger>
                <SelectContent>
                  {RECIPIENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={sendListPushNow}
                disabled={notifying || openCount === 0}
                className="gap-2"
              >
                {notifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                Send nå
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem();
                }
              }}
              placeholder="Hva må med opp til hytta?"
              className="flex-1"
              maxLength={200}
            />
            <Button onClick={addItem} disabled={adding || !newLabel.trim()} className="gap-2">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Legg til
            </Button>
          </div>
        </div>


        {loading ? (
          <p className="text-sm text-muted-foreground italic">Henter pergamentet…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Pergamentet er blankt. Begynn å skrive — ravnene venter.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const notifyFuture =
                item.notify_at && new Date(item.notify_at).getTime() > Date.now() && !item.notified_at;
              const notifyPast = item.notify_at && item.notified_at;
              return (
                <li
                  key={item.id}
                  className={`flex items-start gap-3 rounded-md border border-border/50 px-3 py-2.5 transition ${
                    item.checked ? "opacity-60 bg-muted/20" : "bg-card/40 hover:border-primary/40"
                  }`}
                >
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={() => toggleItem(item)}
                    className="mt-1 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm sm:text-base ${
                        item.checked ? "line-through text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {item.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="text-primary/80">✦ {item.added_by}</span>
                      <span className="opacity-50">·</span>
                      <span>{formatRelativeOslo(item.created_at)}</span>
                      {notifyFuture && (
                        <>
                          <span className="opacity-50">·</span>
                          <span className="text-primary inline-flex items-center gap-1">
                            <BellRing className="h-3 w-3" /> {formatNotifyOslo(item.notify_at!)}
                          </span>
                        </>
                      )}
                      {notifyPast && (
                        <>
                          <span className="opacity-50">·</span>
                          <span className="text-muted-foreground/70 inline-flex items-center gap-1">
                            <Bell className="h-3 w-3" /> sendt
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => deleteItem(item.id)}
                    className="text-muted-foreground/60 hover:text-destructive transition p-1"
                    aria-label="Slett"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mt-4 text-center">
          ❦ Innført som <span className="text-primary/80">{who}</span> ❦
        </p>
      </div>
    </section>
  );
}
