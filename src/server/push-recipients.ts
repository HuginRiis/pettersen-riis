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
