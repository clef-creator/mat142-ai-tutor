export const writeFailureState = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  progressWriteFails: false,
  finalSaveFails: false,
  historyReadFails: false,
  deletedFailedStart: false,
};

export function resetWriteFailureState() {
  writeFailureState.progressWriteFails = false;
  writeFailureState.finalSaveFails = false;
  writeFailureState.historyReadFails = false;
  writeFailureState.deletedFailedStart = false;
}
