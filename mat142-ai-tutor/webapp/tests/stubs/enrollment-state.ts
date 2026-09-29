export const enrollmentTestState = {
  user: { id: 'student-1', email: 'Student@AHDUNI.EDU.IN', identities: [
    { provider: 'google', identity_data: { email: 'student@ahduni.edu.in', email_verified: true } },
  ] },
  claims: { email: 'student@ahduni.edu.in', amr: [{ method: 'password' }] },
  studentExists: true,
  studentLookupError: false,
  existingSessionId: '22222222-2222-4222-8222-222222222222',
  tablesRead: [] as string[],
  tutorCalls: 0,
  summaryCalls: 0,
};

export function resetEnrollmentTestState() {
  enrollmentTestState.claims = { email: 'student@ahduni.edu.in', amr: [{ method: 'password' }] };
  enrollmentTestState.studentExists = true;
  enrollmentTestState.studentLookupError = false;
  enrollmentTestState.tablesRead = [];
  enrollmentTestState.tutorCalls = 0;
  enrollmentTestState.summaryCalls = 0;
}
