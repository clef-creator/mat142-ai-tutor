export async function summariseSession(args: { history: unknown[] }) {
  return {
    assessed: args.history.length >= 3,
    reason: 'too_short',
    outcome: 'steady',
    summary: 'The student practiced functions.',
    sticking_point: null,
    asked_for_answers: false,
    self_critical: false,
  };
}
