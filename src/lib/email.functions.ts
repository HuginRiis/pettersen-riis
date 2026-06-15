import { createServerFn } from "@tanstack/react-start";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/microsoft_outlook";

export type EmailMessage = {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  receivedDateTime: string;
  isRead: boolean;
  importance: "low" | "normal" | "high";
  hasAttachments: boolean;
  bodyPreview: string;
  flagged: boolean;
  webLink?: string;
};

export type EmailStats = {
  fetchedAt: string;
  ok: boolean;
  errorMessage?: string;
  total: number;
  unread: number;
  read: number;
  highImportance: number;
  flagged: number;
  withAttachments: number;
  today: number;
  last7Days: number;
  last30Days: number;
  perDay: { date: string; total: number; unread: number }[];
  perHour: { hour: number; total: number }[];
  topSenders: { email: string; name: string; count: number; unread: number }[];
  importantMessages: EmailMessage[];
  recentMessages: EmailMessage[];
  unreadMessages: EmailMessage[];
};

function emptyStats(now: Date, errorMessage?: string): EmailStats {
  const perDay: { date: string; total: number; unread: number }[] = [];
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 6; i >= 0; i--) {
    const d = new Date(startOfToday.getTime() - i * 24 * 3600 * 1000);
    perDay.push({ date: d.toISOString().slice(0, 10), total: 0, unread: 0 });
  }
  return {
    fetchedAt: now.toISOString(),
    ok: !errorMessage,
    errorMessage,
    total: 0, unread: 0, read: 0, highImportance: 0, flagged: 0, withAttachments: 0,
    today: 0, last7Days: 0, last30Days: 0,
    perDay,
    perHour: Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0 })),
    topSenders: [],
    importantMessages: [],
    recentMessages: [],
    unreadMessages: [],
  };
}

function scoreImportance(m: EmailMessage): number {
  let s = 0;
  if (m.importance === "high") s += 100;
  if (m.flagged) s += 50;
  if (!m.isRead) s += 20;
  if (m.hasAttachments) s += 5;
  // Recent emails get a small boost
  const ageHrs = (Date.now() - new Date(m.receivedDateTime).getTime()) / 3600000;
  if (ageHrs < 24) s += 10;
  else if (ageHrs < 72) s += 5;
  return s;
}

export const getEmailStats = createServerFn({ method: "GET" }).handler(async (): Promise<EmailStats> => {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.MICROSOFT_OUTLOOK_API_KEY;
  if (!lovableKey || !connKey) throw new Error("Mangler Outlook-tilkobling");

  const headers = {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
  };

  // Fetch the latest 250 inbox messages.
  const select = "id,subject,from,receivedDateTime,isRead,importance,hasAttachments,bodyPreview,flag,webLink";
  const url =
    `${GATEWAY_URL}/me/mailFolders/inbox/messages` +
    `?$top=250&$orderby=receivedDateTime desc&$select=${select}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const raw: any[] = json.value ?? [];

  const messages: EmailMessage[] = raw.map((m) => ({
    id: m.id,
    subject: m.subject ?? "(uten emne)",
    from: m.from?.emailAddress?.address ?? "",
    fromName: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Ukjent",
    receivedDateTime: m.receivedDateTime,
    isRead: !!m.isRead,
    importance: (m.importance ?? "normal") as "low" | "normal" | "high",
    hasAttachments: !!m.hasAttachments,
    bodyPreview: (m.bodyPreview ?? "").slice(0, 200),
    flagged: m.flag?.flagStatus === "flagged",
    webLink: m.webLink,
  }));

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ms7 = 7 * 24 * 3600 * 1000;
  const ms30 = 30 * 24 * 3600 * 1000;

  let unread = 0,
    high = 0,
    flagged = 0,
    attach = 0,
    today = 0,
    last7 = 0,
    last30 = 0;

  const perDayMap = new Map<string, { total: number; unread: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(startOfToday.getTime() - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    perDayMap.set(key, { total: 0, unread: 0 });
  }

  const perHourMap = new Map<number, number>();
  for (let h = 0; h < 24; h++) perHourMap.set(h, 0);

  const senderMap = new Map<string, { email: string; name: string; count: number; unread: number }>();

  for (const m of messages) {
    const t = new Date(m.receivedDateTime).getTime();
    const age = now.getTime() - t;
    if (!m.isRead) unread++;
    if (m.importance === "high") high++;
    if (m.flagged) flagged++;
    if (m.hasAttachments) attach++;
    if (t >= startOfToday.getTime()) today++;
    if (age <= ms7) last7++;
    if (age <= ms30) last30++;

    const dayKey = new Date(m.receivedDateTime).toISOString().slice(0, 10);
    const d = perDayMap.get(dayKey);
    if (d) {
      d.total++;
      if (!m.isRead) d.unread++;
    }

    if (age <= ms7) {
      const hr = new Date(m.receivedDateTime).getHours();
      perHourMap.set(hr, (perHourMap.get(hr) ?? 0) + 1);
    }

    const key = m.from || m.fromName;
    const s = senderMap.get(key) ?? { email: m.from, name: m.fromName, count: 0, unread: 0 };
    s.count++;
    if (!m.isRead) s.unread++;
    senderMap.set(key, s);
  }

  const topSenders = Array.from(senderMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const importantMessages = [...messages]
    .sort((a, b) => scoreImportance(b) - scoreImportance(a))
    .slice(0, 15);

  return {
    fetchedAt: now.toISOString(),
    total: messages.length,
    unread,
    read: messages.length - unread,
    highImportance: high,
    flagged,
    withAttachments: attach,
    today,
    last7Days: last7,
    last30Days: last30,
    perDay: Array.from(perDayMap.entries()).map(([date, v]) => ({ date, ...v })),
    perHour: Array.from(perHourMap.entries()).map(([hour, total]) => ({ hour, total })),
    topSenders,
    importantMessages,
    recentMessages: messages.slice(0, 30),
    unreadMessages: messages.filter((m) => !m.isRead).slice(0, 30),
  };
});
