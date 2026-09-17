/** Read a tutor reply while keeping partial text separate from a completed turn. */
export async function readTutorStream(
  body: ReadableStream<Uint8Array> | null,
  onDelta: (partial: string) => void,
): Promise<string> {
  if (!body) throw new Error('No response body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onDelta(full);
  }
  full += decoder.decode();
  return full;
}
