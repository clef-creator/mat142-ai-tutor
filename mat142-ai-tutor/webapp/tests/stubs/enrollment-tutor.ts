import { enrollmentTestState } from './enrollment-state';

export const STREAM_HEADERS = { 'Content-Type': 'text/plain' };

export function streamTutorReply() {
  enrollmentTestState.tutorCalls += 1;
  return new ReadableStream();
}
