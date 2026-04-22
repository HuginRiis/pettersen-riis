import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredWho, type Who } from "@/lib/push-client";
import { sendHyttaChecklistPush } from "@/server/agenda-push";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Bell, Trash2, Plus, Loader2 } from "lucide-react";

type ChecklistItem = {
  id: string;
  label: string;
  added_by: string;
  checked: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

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

export function HyttaChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [who, setWho] = useState<Who>("Alle");

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

  const sendListPush = async () => {
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
        },
      });
      toast.success(`Ravnen fløy til ${res.sent} av ${res.total} mottakere`);
    } catch (e) {
      toast.error(`Kunne ikke sende varsel: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setNotifying(false);
    }
  };

  const openCount = items.filter((i) => !i.checked).length;

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
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={sendListPush}
            disabled={notifying || openCount === 0}
            className="gap-2"
          >
            {notifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Send ravn til alle
          </Button>
        </div>

        <div className="flex gap-2 mb-4">
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

        {loading ? (
          <p className="text-sm text-muted-foreground italic">Henter pergamentet…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Pergamentet er blankt. Begynn å skrive — ravnene venter.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={`flex items-center gap-3 rounded-md border border-border/50 px-3 py-2.5 transition ${
                  item.checked ? "opacity-60 bg-muted/20" : "bg-card/40 hover:border-primary/40"
                }`}
              >
                <Checkbox
                  checked={item.checked}
                  onCheckedChange={() => toggleItem(item)}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
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
            ))}
          </ul>
        )}

        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mt-4 text-center">
          ❦ Innført som <span className="text-primary/80">{who}</span> ❦
        </p>
      </div>
    </section>
  );
}
