import { constantTimeEqual } from './access';

/**
 * The lock on the page that creates student accounts.
 *
 * That page can mint sign-ins and show their passwords, so it is the most
 * dangerous thing in the app and is treated accordingly. It does not exist
 * unless `STUDENT_SETUP_TOKEN` is set, and it refuses to exist if the token is
 * short enough to be worth guessing at. Turning the page off afterwards is
 * therefore a matter of clearing one setting, with no code change and no
 * deploy that could be got wrong under time pressure.
 *
 * There is no cookie and no remembered session: the token is typed again for
 * every use. The page is used perhaps three times in a semester, so being
 * asked twice costs nothing and leaves nothing behind on the laptop.
 */

/** Long enough that guessing is hopeless, short enough to paste. */
export const MIN_SETUP_TOKEN_LENGTH = 16;

export function setupEnabled(): boolean {
  const token = process.env.STUDENT_SETUP_TOKEN?.trim() ?? '';
  return token.length >= MIN_SETUP_TOKEN_LENGTH;
}

export function isSetupTokenCorrect(supplied: string): boolean {
  if (!setupEnabled()) return false;
  return constantTimeEqual(supplied.trim(), process.env.STUDENT_SETUP_TOKEN!.trim());
}
