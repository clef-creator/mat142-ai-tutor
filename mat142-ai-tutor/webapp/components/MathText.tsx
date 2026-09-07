'use client';

import katex from 'katex';
import { useMemo } from 'react';

/**
 * Renders the tutor's replies: plain text with LaTeX in it.
 *
 * `$...$` is inline maths, `$$...$$` is a display line, and everything else is
 * text, split into paragraphs on blank lines.
 *
 * Three things worth knowing.
 *
 * First, the text is never inserted as HTML — only KaTeX's own output is, and
 * KaTeX escapes what it produces. So a student typing something that looks like
 * markup cannot make it run.
 *
 * Second, if a formula is malformed — easy while a reply is still streaming in,
 * because half of it has not arrived yet — we show the raw source rather than
 * throwing, so a partial message degrades to text instead of blanking the
 * screen.
 *
 * Third, and least obvious: this unit is about cost, revenue and profit, so the
 * tutor writes sums of money constantly. A naive reader treats the dollar in
 * "costs $5 per unit and sells for $12" as the start of a formula and sets the
 * words between them in italic maths type. `opensMath` below is what stops
 * that.
 */

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; value: string; display: boolean };

/** The longest an inline formula is allowed to be, in characters. */
const MAX_INLINE = 250;

/** A sum of money: `$5`, `$12.50`, `$1,200`. */
const MONEY = /^\$\d[\d,]*(?:\.\d{1,2})?/;

/** Characters that can legitimately follow a number inside a formula. */
const MATH_CONTINUES = /[$\\{(^_[a-zA-Z]/;

function isEscaped(s: string, i: number): boolean {
  let backslashes = 0;
  for (let k = i - 1; k >= 0 && s[k] === '\\'; k--) backslashes++;
  return backslashes % 2 === 1;
}

/** True if the `$` at `i` is a lone `$`, not part of `$$` and not escaped. */
function isLoneDollar(s: string, i: number): boolean {
  if (s[i] !== '$') return false;
  if (isEscaped(s, i)) return false;
  if (s[i + 1] === '$' || s[i - 1] === '$') return false;
  return true;
}

/**
 * True if the `$` at `i` can open a formula.
 *
 * It cannot if it is really a price. `$5 per unit` is money, because the digits
 * are followed by a space; `$5x$` is maths, because they are followed by a
 * letter. Nor can it if a space comes straight after the dollar, which is how
 * an ordinary sentence tends to use one.
 */
function opensMath(s: string, i: number): boolean {
  if (!isLoneDollar(s, i)) return false;

  const next = s[i + 1];
  if (next === undefined || /\s/.test(next)) return false;

  const money = MONEY.exec(s.slice(i));
  if (money) {
    const after = s[i + money[0].length];
    if (after === undefined || !MATH_CONTINUES.test(after)) return false;
  }

  return true;
}

/**
 * True if the `$` at `i` can close a formula opened earlier.
 *
 * A closing dollar sits tight against the maths — `2x$`, never `2x $` — which
 * is also what rules out the second price in a sentence with two of them.
 */
function closesMath(s: string, i: number): boolean {
  if (!isLoneDollar(s, i)) return false;
  const prev = s[i - 1];
  return prev !== undefined && !/\s/.test(prev);
}

/** Index of the `$` that closes a formula opened at `open`, or -1. */
function findClose(s: string, open: number): number {
  const limit = Math.min(s.length, open + 1 + MAX_INLINE);
  for (let i = open + 1; i < limit; i++) {
    // Inline maths never runs across a line break.
    if (s[i] === '\n') return -1;
    if (closesMath(s, i)) return i;
  }
  return -1;
}

/** Index of the next `$` that could open a formula, or -1. */
function findOpen(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (opensMath(s, i)) return i;
  }
  return -1;
}

function segment(input: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;

  while (i < input.length) {
    let display = input.indexOf('$$', i);
    if (display !== -1 && isEscaped(input, display)) display = -1;
    const inline = findOpen(input, i);

    // Whichever delimiter comes first wins.
    const next =
      display === -1 ? inline : inline === -1 ? display : Math.min(display, inline);

    if (next === -1) {
      out.push({ kind: 'text', value: input.slice(i) });
      break;
    }

    if (next > i) out.push({ kind: 'text', value: input.slice(i, next) });

    if (next === display) {
      const end = input.indexOf('$$', next + 2);
      if (end === -1) {
        // Unterminated — still streaming. Show as text for now.
        out.push({ kind: 'text', value: input.slice(next) });
        break;
      }
      out.push({ kind: 'math', value: input.slice(next + 2, end).trim(), display: true });
      i = end + 2;
    } else {
      const end = findClose(input, next);
      if (end === -1) {
        // Either the reply is still arriving, or that dollar was never maths.
        // Emit the dollar as text and carry on looking after it.
        out.push({ kind: 'text', value: input[next] });
        i = next + 1;
        continue;
      }
      out.push({ kind: 'math', value: input.slice(next + 1, end).trim(), display: false });
      i = end + 1;
    }
  }

  return out;
}

function renderMath(value: string, display: boolean): string | null {
  if (!value.trim()) return null;
  try {
    return katex.renderToString(value, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return null;
  }
}

/** `\$` in the source is a literal dollar on screen. */
function unescape(value: string): string {
  return value.replace(/\\\$/g, '$');
}

export default function MathText({ text }: { text: string }) {
  const paragraphs = useMemo(() => {
    return text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map(segment);
  }, [text]);

  return (
    <>
      {paragraphs.map((segs, pi) => (
        <p key={pi}>
          {segs.map((seg, si) => {
            if (seg.kind === 'text') {
              // Preserve single newlines inside a paragraph.
              const lines = unescape(seg.value).split('\n');
              return (
                <span key={si}>
                  {lines.map((line, li) => (
                    <span key={li}>
                      {line}
                      {li < lines.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </span>
              );
            }

            const html = renderMath(seg.value, seg.display);
            if (!html) return <code key={si}>{seg.value}</code>;

            return <span key={si} dangerouslySetInnerHTML={{ __html: html }} />;
          })}
        </p>
      ))}
    </>
  );
}
