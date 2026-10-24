import { createServer } from 'node:http';
let n = 0;
const POOL = [
  'Where is the nearest ATM?', 'Can I get a window seat?', 'Please tell me the platform number.',
  'Is there a waiting room here?', 'I would like a bottle of water.', 'How far is the airport?',
  'Where can I charge my phone?', 'Please point to the exit.', 'Which bus goes to the market?',
  'Can you call a taxi for me?', 'Is this seat taken?', 'I need to change my ticket.',
  'Where is the lost and found?', 'What time is the next train?', 'Please show me the way.', 'Is breakfast included?',
];
createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    const prompt = body.messages?.[0]?.content ?? '';
    const start = (n++ * 8) % POOL.length;
    const list = [...POOL, ...POOL].slice(start, start + 8);
    console.log('UPSTREAM', req.url, 'key=', req.headers['x-api-key'], 'prompt-has-data=', prompt.includes('<data>'));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ type: 'message', role: 'assistant', content: [{ type: 'text', text: JSON.stringify(list) }] }));
  });
}).listen(4999, '127.0.0.1', () => console.log('fake upstream on 4999'));
