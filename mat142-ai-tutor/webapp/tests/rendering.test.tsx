import { renderToStaticMarkup } from 'react-dom/server';
import MathText from '@/components/MathText';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (!cond) { failures++; console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`); }
  else console.log(`ok    ${name}`);
}

const render = (t: string) => renderToStaticMarkup(<MathText text={t} />);

// Plain prose survives untouched.
const prose = render('Nice. Now try the next one.');
check('plain text renders', prose.includes('Nice. Now try the next one.'), prose);

// Inline maths becomes KaTeX, not literal dollars.
const inline = render("The derivative is $f'(x) = 2x$ here.");
check('inline maths renders as KaTeX', inline.includes('katex'), inline.slice(0, 120));
check('inline maths drops the dollar signs', !inline.includes('$'), inline.slice(0, 200));

// Display maths.
const display = render('So:\n\n$$\\frac{dy}{dx} = 3x^2$$\n\nWhat is next?');
check('display maths renders', display.includes('katex-display') || display.includes('katex'));
check('text around display maths survives', display.includes('What is next?'));

// Half-arrived stream must not blank the screen.
const streaming = render('The answer is $f(x) = 3x');
check('an unfinished formula degrades to text', streaming.includes('f(x) = 3x'), streaming);

// Malformed LaTeX must not throw.
let threw = false;
try { render('Try $\\frac{}$ this'); } catch { threw = true; }
check('malformed LaTeX does not throw', !threw);

// Raw text is never treated as markup.
const nasty = render('What about <b>this</b> and <script>alert(1)</script>?');
check('raw markup is escaped, not executed', !nasty.includes('<script>'), nasty);
check('raw markup is still readable', nasty.includes('&lt;script&gt;') || nasty.includes('alert(1)'));

// Money. This unit is full of cost and revenue problems.
const money = render('The cost is $5 per unit and the price is $12 per unit.');
check('a pair of money amounts is not eaten as maths', money.includes('5') && money.includes('12'), money);
check('money keeps its dollar signs', (money.match(/\$/g) ?? []).length >= 2, money);

const oneAmount = render('Each unit costs $40 to make.');
check('a single money amount survives', oneAmount.includes('40'), oneAmount);

const mixed = render('If each unit costs $8, then $C(x) = 8x$ is the cost function.');
check('money and maths in one sentence', mixed.includes('8') && mixed.includes('katex'), mixed);

// Escaped dollar.
const escaped = render('It costs \\$5.');
check('an escaped dollar is not maths', escaped.includes('5'), escaped);
check('an escaped dollar loses its backslash', !escaped.includes('\\$'), escaped);

// More money, phrased the way the tutor actually phrases it.
const cases: [string, string[]][] = [
  ['Revenue is $200 and cost is $150, so profit is $50.', ['200', '150', '50']],
  ['Each unit sells for $12.50 and costs $7.25 to make.', ['12.50', '7.25']],
  ['Fixed costs are $1,200 per month.', ['1,200']],
  ['The profit went from $80 to $95 to $110.', ['80', '95', '110']],
  ['Should the price be $20 or $25?', ['20', '25']],
];
cases.forEach(([text, wants]) => {
  const html = render(text);
  const noMath = !html.includes('katex');
  const allPresent = wants.every((w) => html.includes(w));
  check(`money stays money: "${text.slice(0, 34)}..."`, noMath && allPresent, html.slice(0, 200));
});

// Maths that legitimately starts with a number must still work.
const numeric = render('So $2x + 3$ is the answer, and $5x^2$ before that.');
check('a formula starting with a digit still renders', (numeric.match(/katex-mathml/g) ?? []).length === 2, numeric.slice(0, 160));

const single = render('the number $2$ is even');
check('a single-digit formula still renders', single.includes('katex'), single.slice(0, 160));

// Money and maths together, both ways round.
const both = render('At $8 per unit the cost is $C(x) = 8x$ dollars.');
check('money before a formula', both.includes('katex') && both.includes('8 per unit'), both.slice(0, 200));

const both2 = render('Since $C(x) = 8x$, ten units cost $80.');
check('money after a formula', both2.includes('katex') && both2.includes('80'), both2.slice(0, 200));

// A lone stray dollar must not swallow the rest of the reply.
const stray = render('That costs $ and then some more text follows here.');
check('a stray dollar is harmless', !stray.includes('katex') && stray.includes('more text'), stray.slice(0, 200));

// Very long spans are not maths.
const long = render('$' + 'word '.repeat(80) + '$');
check('an absurdly long span is not treated as maths', !long.includes('katex'));

// Streaming, character by character, must never throw and never blank out.
const full = "Good. Now $\\frac{d}{dx}(3x^2) = 6x$, and at $x = 2$ that is $12$. It costs $5 too.";
let streamFailures = 0;
for (let n = 1; n <= full.length; n++) {
  try {
    const out = render(full.slice(0, n));
    if (out.trim() === '' && full.slice(0, n).trim() !== '') streamFailures++;
  } catch { streamFailures++; }
}
check('every prefix of a streaming reply renders', streamFailures === 0, `${streamFailures} bad prefixes`);

// Paragraphs and single newlines.
const paras = render('First line.\nSecond line.\n\nNew paragraph.');
check('single newlines become breaks', paras.includes('<br/>') || paras.includes('<br>'), paras);
check('blank lines become paragraphs', (paras.match(/<p>/g) ?? []).length === 2, paras);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
