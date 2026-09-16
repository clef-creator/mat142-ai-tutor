export const enrollmentTestState = {
  user: { id: 'student-1', email: 'Student@AHDUNI.EDU.IN' },
  allowed: false,
  allowedLookupError: false,
  existingSessionId: 'existing-session',
  tablesRead: [] as string[],
  tutorCalls: 0,
  summaryCalls: 0,
};

export function resetEnrollmentTestState() {
  enrollmentTestState.allowed = false;
  enrollmentTestState.allowedLookupError = false;
  enrollmentTestState.tablesRead = [];
  enrollmentTestState.tutorCalls = 0;
  enrollmentTestState.summaryCalls = 0;
}
