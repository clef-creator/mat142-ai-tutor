export const enrollmentTestState = {
  user: { id: 'student-1', email: 'Student@AHDUNI.EDU.IN' },
  allowed: false,
  allowedLookupError: false,
  existingSessionId: '22222222-2222-4222-8222-222222222222',
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
