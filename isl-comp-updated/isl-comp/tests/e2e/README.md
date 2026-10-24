# Daily Translator browser test

Drives the real `/daily` page in Chromium. Speech recognition and speech
synthesis are replaced with scripted fakes (headless browsers have no
microphone), and the AI path runs against a fake Anthropic server, so no real
key or network is needed.

```bash
# 1. fake Anthropic upstream
node tests/e2e/fake_upstream.mjs > tests/e2e/upstream.log &

# 2. real backend pointed at it
(cd server && ANTHROPIC_API_KEY=sk-e2e-test ANTHROPIC_BASE_URL=http://127.0.0.1:4999 PORT=4000 node server.js) &

# 3. frontend
npx vite --port 5173 --host 127.0.0.1 &

# 4. run
pip install playwright && playwright install chromium
python tests/e2e/daily_translator_e2e.py
```

Screenshots land in `tests/e2e/shots/` (git-ignored). Note: the real
microphone, real voices and real Anthropic responses are NOT exercised here.
