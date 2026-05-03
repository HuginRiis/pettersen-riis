/**
 * Hjelpere for "gruppe-mottakere" i push-systemet.
 *
 * En "recipient" lagret på en preferanse kan være en enkeltperson
 * ("Arne", "Rebekka", ...), "Alle" (alle abonnenter) eller en gruppe
 * som "Arne & Rebekka" som ekspanderes til flere navn.
 */
export const GROUP_RECIPIENTS: Record<string, string[]> = {
  "Arne & Rebekka": ["Arne", "Rebekka"],
};

export function isGroupRecipient(recipient: string): boolean {
  return Object.prototype.hasOwnProperty.call(GROUP_RECIPIENTS, recipient);
}

/**
 * Returnerer enkelt-navn som skal motta push for gitt recipient-streng.
 * - "Alle" → ["Alle"]
 * - "Arne" → ["Arne"]
 * - "Arne & Rebekka" → ["Arne", "Rebekka"]
 */
export function expandRecipient(recipient: string): string[] {
  return GROUP_RECIPIENTS[recipient] ?? [recipient];
}

/**
 * Bygger en PostgREST .or()-filterstreng som matcher push_subscriptions.who
 * for en gitt mottaker. Returnerer null hvis ingen filter trengs (Alle → alle).
 *
 * Eksempler:
 *   "Alle"            → null
 *   "Arne"            → "who.eq.Arne,who.eq.Alle"
 *   "Arne & Rebekka"  → "who.eq.Arne,who.eq.Rebekka,who.eq.Alle"
 */
export function buildSubscriptionWhoOr(recipient: string): string | null {
  const names = expandRecipient(recipient);
  if (names.length === 1 && names[0] === "Alle") return null;
  const set = new Set<string>([...names, "Alle"]);
  return Array.from(set).map((n) => `who.eq.${n}`).join(",");
}
