import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell } from "lucide-react";

type Row = {
  id: string;
  detected_at: string;
  snapshot_url: string | null;
  camera: string | null;
  category: string;
};

export function LatestDoorbellSnapshot() {
  const [row, setRow] = useState<Row | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("vakttarn_events")
      .select("id,detected_at,snapshot_url,camera,category")
      .eq("category", "ringt_pa")
      .not("snapshot_url", "is", null)
      .order("detected_at", { ascending: false })
      .limit(1);
    if (error) {
      setErr(error.message);
      return;
    }
    setRow((data?.[0] as Row) ?? null);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("doorbell-latest")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vakttarn_events", filter: "category=eq.ringt_pa" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <Bell size={12} /> Siste dørklokke-bilde
      </div>
      {err && <div className="text-xs text-destructive italic">⚠ {err}</div>}
      {!row && !err && (
        <div className="text-xs text-muted-foreground italic">
          Ingen ringt_pa-event med snapshot_url enda.
        </div>
      )}
      {row?.snapshot_url && (
        <div className="space-y-1">
          <img
            src={row.snapshot_url}
            alt="Siste dørklokke-snapshot"
            className="w-full rounded border border-border/40"
          />
          <div className="text-[10px] text-muted-foreground flex justify-between">
            <span>{row.camera ?? "?"}</span>
            <span>{new Date(row.detected_at).toLocaleString("nb-NO")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
