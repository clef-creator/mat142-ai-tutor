/**
 * Reading the pilot list off whatever was pasted in.
 *
 * The list of students arrives as a block of text copied out of a spreadsheet
 * or an email, so it is never in one tidy shape. A line may be
 * `Aarav Shah, aarav.shah@ahduni.edu.in`, or the two the other way round, or
 * `Aarav Shah <aarav.shah@ahduni.edu.in>`, or just the address on its own.
 *
 * Every line is either understood or reported. Nothing is guessed at and
 * nothing is silently dropped, because a student quietly missing from the list
 * turns up on Monday as somebody who cannot sign in.
 */

export interface RosterEntry {
  email: string;
  displayName: string | null;
}

export interface RosterProblem {
  line: string;
  reason: string;
}

export interface ParsedRoster {
  entries: RosterEntry[];
  problems: RosterProblem[];
}

/** As many as one pilot could plausibly need, and no more. */
export const MAX_ROSTER_ENTRIES = 60;

function tidyName(value: string): string | null {
  const name = value
    .replace(/[<>"]/g, ' ')
    .replace(/[,;\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name ? name.slice(0, 80) : null;
}

/**
 * @param text   whatever was pasted in
 * @param domain the only email domain accepted, without the `@`
 */
export function parseRoster(text: string, domain: string): ParsedRoster {
  const allowedDomain = domain.trim().toLowerCase();
  const entries: RosterEntry[] = [];
  const problems: RosterProblem[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const pieces = line.split(/[\s,;\t<>"]+/).filter(Boolean);
    const addresses = pieces.filter((piece) => piece.includes('@'));

    if (addresses.length === 0) {
      problems.push({ line, reason: 'No email address on this line.' });
      continue;
    }
    if (addresses.length > 1) {
      problems.push({ line, reason: 'More than one email address on this line.' });
      continue;
    }

    const email = addresses[0].toLowerCase().replace(/[.,;]+$/, '');

    if (!email.endsWith(`@${allowedDomain}`)) {
      problems.push({ line, reason: `Not an @${allowedDomain} address.` });
      continue;
    }
    // One @, something before it, something after it.
    if (email.split('@').length !== 2 || email.startsWith('@')) {
      problems.push({ line, reason: 'That does not look like an email address.' });
      continue;
    }
    if (seen.has(email)) {
      problems.push({ line, reason: 'This address is already on the list above.' });
      continue;
    }

    seen.add(email);
    entries.push({
      email,
      displayName: tidyName(pieces.filter((piece) => piece !== addresses[0]).join(' ')),
    });
  }

  return { entries, problems };
}
