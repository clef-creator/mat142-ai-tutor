import assert from 'node:assert/strict';
import { POST as startSession } from '@/app/api/session/start/route';
import { POST as endSession } from '@/app/api/session/end/route';
import { GET as chatStatus } from '@/app/api/chat/route';
import { resetWriteFailureState, writeFailureState as state } from './stubs/write-failure-state';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
const endRequest = () => new Request('http://localhost/api/session/end', {
  method: 'POST', body: JSON.stringify({ sessionId: state.sessionId }),
});
const statusRequest = () => new Request(`http://localhost/api/chat?sessionId=${state.sessionId}&requestId=33333333-3333-4333-8333-333333333333`);

async function run() {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    resetWriteFailureState();
    state.progressWriteFails = true;
    const start = await startSession(new Request('http://localhost/api/session/start', { method: 'POST' }));
    assert.equal(start.status, 500, 'failed progress write is not reported as a started session');
    assert.equal(state.deletedFailedStart, true, 'the incomplete session is removed');

    resetWriteFailureState();
    state.historyReadFails = true;
    const endWithoutHistory = await endSession(endRequest());
    assert.equal(endWithoutHistory.status, 500, 'end refuses a missing transcript');
    const statusWithoutHistory = await chatStatus(statusRequest());
    assert.equal(statusWithoutHistory.status, 500, 'chat status refuses an incomplete history read');

    resetWriteFailureState();
    state.finalSaveFails = true;
    const endWithFailedSave = await endSession(endRequest());
    assert.equal(endWithFailedSave.status, 500, 'failed final save is not reported as success');

    resetWriteFailureState();
    const status = await chatStatus(statusRequest());
    assert.equal(status.status, 200);
    const body = await status.json();
    assert.equal(body.status, 'completed');
    assert.deepEqual(body.history, [{ role: 'assistant', content: 'Saved reply' }]);
    console.log('Session write failure checks passed.');
  } finally {
    console.error = originalError;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
