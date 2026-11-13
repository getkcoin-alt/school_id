/** Indian academic year label for a date, e.g. 2026–27 (April to March). */
export function academicYear(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}–${String((y + 1) % 100).padStart(2, "0")}`;
}

/**
 * Accepts "2027", "2027-28", "2027–28", "2027/28" or "2027-2028" and returns
 * the canonical label "2027–28"; null when it is not a sensible year.
 */
export function normaliseSession(input: string | null | undefined) {
  const m = String(input ?? "").trim().match(/^(\d{4})(?:\s*[-–/]\s*(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 2000 || y > 2100) return null;
  if (m[2]) {
    const end = Number(m[2].length === 2 ? String(y + 1).slice(0, 2) + m[2] : m[2]);
    if (end !== y + 1) return null;
  }
  return `${y}–${String((y + 1) % 100).padStart(2, "0")}`;
}

/** First year of a session label ("2027–28" -> 2027). */
export const sessionYear = (name: string) => Number(String(name).slice(0, 4)) || 0;

/** Default dates of a session: 1 April to 31 March. */
export function sessionDates(name: string) {
  const y = sessionYear(name);
  return { start: `${y}-04-01`, end: `${y + 1}-03-31` };
}

/** The session after the latest one in the list (or this year's when empty). */
export function nextSession(names: string[]) {
  const years = names.map(sessionYear).filter(Boolean);
  if (!years.length) return academicYear();
  const y = Math.max(...years) + 1;
  return `${y}–${String((y + 1) % 100).padStart(2, "0")}`;
}
