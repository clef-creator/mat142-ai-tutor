/**
 * Which of the two ways this app can run.
 *
 * **Account mode** is the real thing: students sign in with their university
 * address, everything lives in Supabase, and the teaching team will eventually
 * have a dashboard.
 *
 * **Solo mode** is the tutor on its own. No database, no email, no accounts —
 * one shared code gets you in, and progress is kept in the browser. It exists so
 * the tutor can be used and judged before anyone has to talk to IT about DNS
 * records. Everything about how the tutor teaches is identical in both.
 *
 * The switch is simply whether Supabase has been configured. There is no third
 * state and nothing to remember to set.
 */
export function isSoloMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/**
 * Solo mode without a code would be a tutor anyone could find and run up a bill
 * on, so the app refuses to serve rather than doing that. Checked before
 * anything is rendered.
 */
export function soloModeReady(): boolean {
  return Boolean(process.env.ACCESS_CODE && process.env.ACCESS_CODE.length >= 4);
}
