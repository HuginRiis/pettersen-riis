export type RenovationLocation = "borg" | "hytta";
export type ProjectStatus = "planlagt" | "pagaende" | "ferdig";
export type ProjectPriority = "lav" | "middels" | "hoy" | "haster";
export type ProjectCategory =
  | "maling"
  | "snekring"
  | "elektro"
  | "ror"
  | "gulv"
  | "tak"
  | "kjokken"
  | "bad"
  | "hage"
  | "annet";

export type Project = {
  id: string;
  location: RenovationLocation;
  title: string;
  description: string | null;
  status: ProjectStatus;
  cover_image_url: string | null;
  room_name: string | null;
  homey_zone_id: string | null;
  category: ProjectCategory;
  priority: ProjectPriority;
  planned_start: string | null;
  planned_end: string | null;
  completed_at: string | null;
  budget_nok: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  label: string;
  done: boolean;
  sort_order: number;
};

export type ProjectImage = {
  id: string;
  project_id: string;
  url: string;
  caption: string | null;
  sort_order: number;
};

export type CostLine = {
  id: string;
  project_id: string;
  description: string;
  amount_nok: number;
  kind: string;
  cost_date: string;
};

export type Contractor = {
  id: string;
  project_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planlagt: "Planlagt",
  pagaende: "Pågående",
  ferdig: "Ferdig",
};

export const STATUS_TONE: Record<ProjectStatus, string> = {
  planlagt: "border-muted-foreground/40 text-muted-foreground bg-muted/10",
  pagaende: "border-amber-500/60 text-amber-400 bg-amber-500/5",
  ferdig: "border-emerald-500/60 text-emerald-400 bg-emerald-500/5",
};

export const PRIORITY_LABEL: Record<ProjectPriority, string> = {
  lav: "Lav",
  middels: "Middels",
  hoy: "Høy",
  haster: "Haster",
};

export const PRIORITY_TONE: Record<ProjectPriority, string> = {
  lav: "text-muted-foreground border-muted-foreground/40",
  middels: "text-sky-400 border-sky-500/40",
  hoy: "text-amber-400 border-amber-500/50",
  haster: "text-rose-400 border-rose-500/60",
};

export const CATEGORY_LABEL: Record<ProjectCategory, string> = {
  maling: "Maling",
  snekring: "Snekring",
  elektro: "Elektro",
  ror: "Rør",
  gulv: "Gulv",
  tak: "Tak",
  kjokken: "Kjøkken",
  bad: "Bad",
  hage: "Hage",
  annet: "Annet",
};

export const CATEGORY_ICON: Record<ProjectCategory, string> = {
  maling: "🎨",
  snekring: "🪚",
  elektro: "⚡",
  ror: "🔧",
  gulv: "🪵",
  tak: "🏠",
  kjokken: "🍳",
  bad: "🛁",
  hage: "🌿",
  annet: "🔨",
};

export const ALL_CATEGORIES: ProjectCategory[] = [
  "maling",
  "snekring",
  "elektro",
  "ror",
  "gulv",
  "tak",
  "kjokken",
  "bad",
  "hage",
  "annet",
];

export const ALL_PRIORITIES: ProjectPriority[] = ["lav", "middels", "hoy", "haster"];
