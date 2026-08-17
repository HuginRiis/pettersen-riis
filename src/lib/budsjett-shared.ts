// Delte typer og hjelpefunksjoner for «Regnskap og budsjett»-siden.

export type BudCategory = {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string;
  icon: string;
  monthly_budget: number | null;
  yearly_budget: number | null;
  position: number;
};

export type BudExpense = {
  id: string;
  occurred_on: string;
  category_id: string | null;
  amount: number;
  kind: "expense" | "income";
  store: string | null;
  note: string | null;
  source: string;
  status: "approved" | "pending";
  created_by: string | null;
  account: string | null;
  created_at: string;
};

export type BudRule = {
  id: string;
  pattern: string;
  category_id: string;
  hits: number;
};

/* ------------------------------------------------------------ formattering */

export const fmtNok = (v: number | null | undefined) =>
  v == null || !Number.isFinite(Number(v))
    ? "—"
    : new Intl.NumberFormat("nb-NO", {
        style: "currency",
        currency: "NOK",
        maximumFractionDigits: 0,
      }).format(Number(v));

export const monthLabel = (d: Date) =>
  d.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });

export const toLocalISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const monthRange = (d: Date) => ({
  start: toLocalISO(new Date(d.getFullYear(), d.getMonth(), 1)),
  end: toLocalISO(new Date(d.getFullYear(), d.getMonth() + 1, 1)),
});

export const yearRange = (d: Date) => ({
  start: toLocalISO(new Date(d.getFullYear(), 0, 1)),
  end: toLocalISO(new Date(d.getFullYear() + 1, 0, 1)),
});

/* ------------------------------------------------------------------ kontoer */

export type AccountKey = "john" | "hege" | "utgift";

export type AccountsConfig = {
  monthly: Record<AccountKey, Record<string, number>>;
  yearly: Record<AccountKey, Record<string, number>>;
};

export const ACCOUNT_KEYS: AccountKey[] = ["john", "hege", "utgift"];

export const ACCOUNT_LABELS: Record<AccountKey, string> = {
  john: "Konto 1",
  hege: "Konto 2",
  utgift: "Utgiftskonto",
};

export const ACCOUNT_COLORS: Record<AccountKey, string> = {
  john: "#60a5fa",
  hege: "#f472b6",
  utgift: "#fbbf24",
};

export const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const yearKey = (d: Date) => String(d.getFullYear());

export const emptyAccountsConfig = (): AccountsConfig => ({
  monthly: { john: {}, hege: {}, utgift: {} },
  yearly: { john: {}, hege: {}, utgift: {} },
});

export function normalizeAccountsConfig(v: unknown): AccountsConfig {
  const out = emptyAccountsConfig();
  const src = v as any;
  if (!src || typeof src !== "object") return out;
  for (const acc of ACCOUNT_KEYS) {
    const m = src.monthly?.[acc] ?? {};
    const y = src.yearly?.[acc] ?? {};
    for (const k of Object.keys(m)) out.monthly[acc][k] = Number(m[k]) || 0;
    for (const k of Object.keys(y)) out.yearly[acc][k] = Number(y[k]) || 0;
  }
  return out;
}

export function getStartBalance(
  cfg: AccountsConfig,
  acc: AccountKey,
  period: "month" | "year",
  d: Date,
): number {
  if (period === "month") return cfg.monthly[acc]?.[monthKey(d)] ?? 0;
  return cfg.yearly[acc]?.[yearKey(d)] ?? 0;
}

export function resolveAccount(
  account: string | null | undefined,
  createdBy?: string | null,
): AccountKey {
  const a = (account ?? "").trim().toLowerCase();
  if (a === "john" || a === "hege" || a === "utgift") return a as AccountKey;
  const c = (createdBy ?? "").trim().toLowerCase();
  if (c === "john" || c === "hege") return c as AccountKey;
  return "utgift";
}

/* ------------------------------------------------------------- kategoriregler */

/** Normaliser butikknavn/beskrivelse til en stabil nøkkel. */
export const normalizeDesc = (s: string | null | undefined): string => {
  if (!s) return "";
  let t = s.toLowerCase();
  t = t.replace(/\d{2}[./-]\d{2}([./-]\d{2,4})?/g, " ");
  t = t.replace(/\*+\d+/g, " ");
  t = t.replace(/[#*]/g, " ");
  t = t.replace(/\d{3,}/g, " ");
  t = t.replace(/[^a-z0-9æøåäöü\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t.split(" ").filter(Boolean).slice(0, 3).join(" ");
};

export const applyRules = (
  desc: string | null | undefined,
  rules: BudRule[],
): string | null => {
  const key = normalizeDesc(desc);
  if (!key) return null;
  const exact = rules.find((r) => r.pattern === key);
  if (exact) return exact.category_id;
  const prefix = rules.find((r) => r.pattern && key.startsWith(r.pattern));
  return prefix?.category_id ?? null;
};
