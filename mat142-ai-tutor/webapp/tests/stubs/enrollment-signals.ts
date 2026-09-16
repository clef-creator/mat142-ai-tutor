import { enrollmentTestState } from './enrollment-state';

export async function summariseSession() {
  enrollmentTestState.summaryCalls += 1;
  return { assessed: false, reason: 'too_short', summary: null };
}
