export async function summariseSession() {
  return {
    assessed: false,
    reason: 'too_short',
    outcome: null,
    summary: 'Not enough work to assess.',
    sticking_point: null,
    asked_for_answers: false,
    self_critical: false,
  };
}
