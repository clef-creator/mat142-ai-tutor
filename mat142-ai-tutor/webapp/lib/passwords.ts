import { randomInt } from 'node:crypto';

/**
 * The passwords handed out to students.
 *
 * These are read off a printed sheet and typed by hand, once, by someone who
 * has just been told their calculus needs work. So the alphabet leaves out
 * every character that gets mistaken for another one on paper — no l or 1, no
 * O or 0, no u next to v — and the result is grouped in fours with hyphens,
 * the way a licence key is, because a fifteen-character run of letters is
 * misread and mistyped.
 *
 * What is given up in convenience is bought back in strength: three groups of
 * four from a thirty-character alphabet is a little under sixty bits, which is
 * far past anything that can be guessed against a live sign-in page.
 */

/** No look-alikes: i, l, o, u, v, and every digit that imitates a letter. */
const ALPHABET = 'abcdefghjkmnpqrstwxyz23456789';

const GROUPS = 3;
const GROUP_LENGTH = 4;

/** The shortest a generated password can be, used to check nothing regressed. */
export const PASSWORD_LENGTH = GROUPS * GROUP_LENGTH + (GROUPS - 1);

/**
 * A fresh password. `randomInt` is used rather than `Math.random` because the
 * latter is predictable, and a predictable password is not one.
 */
export function newPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = '';
    for (let i = 0; i < GROUP_LENGTH; i++) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/**
 * True for a string this file could have produced.
 *
 * Used by the tests rather than by the app, so a change to the shape of a
 * password cannot pass unnoticed.
 */
export function looksLikeGeneratedPassword(value: string): boolean {
  const pattern = new RegExp(
    `^[${ALPHABET}]{${GROUP_LENGTH}}(?:-[${ALPHABET}]{${GROUP_LENGTH}}){${GROUPS - 1}}$`,
  );
  return pattern.test(value);
}
