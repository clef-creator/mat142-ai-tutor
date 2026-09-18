import { randomInt } from 'node:crypto';
import { WORDS } from './words';

/**
 * The passwords handed out to students.
 *
 * These are read off a printed sheet and typed by hand by someone who has just
 * been told their calculus needs work, and then typed again a week later when
 * they come back. A run of random letters survives the first of those and not
 * the second, so a password is four ordinary words instead: `maroon-river-
 * seven-kite` is read once, pictured, and retyped from memory.
 *
 * Each student still gets their own. That is the part that matters and the
 * part not to trade away for convenience: the tutor remembers where a student
 * is struggling, and a shared password would let any classmate read it.
 *
 * On strength. Four words drawn from this list is a little over thirty-four
 * bits — about seventeen billion possibilities. That is less than the random
 * letters it replaces, and it is still far beyond what can be tried against a
 * live sign-in page: the sign-in route delays every wrong answer, Supabase
 * limits repeated attempts, and an address has to be on the pilot list before
 * a correct password gets anybody anywhere. Guessing is not the threat this
 * pilot has; a forgotten password on Monday morning is.
 */

const WORD_COUNT = 4;
const SEPARATOR = '-';

/** Shortest a generated password can be, used to check nothing regressed. */
export const PASSWORD_LENGTH =
  WORD_COUNT * Math.min(...WORDS.map((word) => word.length)) + (WORD_COUNT - 1);

/**
 * A fresh password. `randomInt` is used rather than `Math.random` because the
 * latter is predictable, and a predictable password is not one.
 *
 * Words may repeat within a password. Forbidding that would remove the one
 * arrangement an attacker could otherwise rule out, which makes guessing very
 * slightly easier rather than harder.
 */
export function newPassword(): string {
  const picked: string[] = [];
  for (let i = 0; i < WORD_COUNT; i++) {
    picked.push(WORDS[randomInt(WORDS.length)]);
  }
  return picked.join(SEPARATOR);
}

/**
 * True for a string this file could have produced.
 *
 * Used by the tests rather than by the app, so a change to the shape of a
 * password cannot pass unnoticed.
 */
export function looksLikeGeneratedPassword(value: string): boolean {
  const parts = value.split(SEPARATOR);
  return parts.length === WORD_COUNT && parts.every((part) => WORDS.includes(part));
}
