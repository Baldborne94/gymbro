// Finto servizio Anthropic per i test: risponde come l'API Messages in streaming,
// così il coach si prova senza chiave vera, senza rete e senza costi.
import http from 'node:http';

const EXERCISES = ['base-panca-piana', 'base-squat', 'base-non-esiste'];

export const ROUTINE = {
  name: 'Forza 3 giorni',
  weeks: 6,
  notes: 'Base di forza con progressione lineare.',
  days: [
    {
      name: 'Giorno A',
      exercises: EXERCISES.map((id, i) => ({
        exercise_id: id, sets: 4, reps_min: 5, reps_max: 8, rest_sec: 150, load: i === 0 ? 80 : null, superset_next: false, notes: '',
      })),
    },
    { name: 'Giorno vuoto', exercises: [{ exercise_id: 'base-inventato', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90, load: null, superset_next: false, notes: '' }] },
  ],
};

export const TEXT = '## Prossima sessione\n- **Panca piana**: prova 82,5 kg × 8.\n- Squat: resta a 100 kg.';

const sse = (res, events) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
};

/** Avvia il finto servizio. `mode` decide la risposta: ok, refusal, unauthorized. */
export async function startFakeAnthropic(port = 0) {
  const state = { mode: 'ok', requests: [] };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      state.requests.push({ url: req.url, headers: req.headers, body });
      if (state.mode === 'unauthorized') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
        return;
      }
      const wantsJson = Boolean(body.output_config?.format);
      const text = state.mode === 'refusal' ? '' : wantsJson ? JSON.stringify(ROUTINE) : TEXT;
      const half = Math.ceil(text.length / 2);
      sse(res, [
        ['message_start', { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } } }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(0, half) } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(half) } }],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: state.mode === 'refusal' ? 'refusal' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 50 } }],
        ['message_stop', { type: 'message_stop' }],
      ]);
    });
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: actual } = server.address();
  return { url: `http://127.0.0.1:${actual}`, state, close: () => new Promise((r) => server.close(r)) };
}
