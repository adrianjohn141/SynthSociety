// Live minds: the only place the Azure OpenAI key is used. The browser posts structured town data
// (lib/mind.js); lib/mind-prompts.js turns it into capped prompts, and the model answers in a fixed JSON shape.
import { talkMessages, TALK_SCHEMA, chatMessages, CHAT_SCHEMA } from '../../../lib/mind-prompts.js';

export const dynamic = 'force-dynamic';

function config() {
  const raw = process.env.AZURE_OPENAI_ENDPOINT?.trim() ?? '';
  const endpoint = raw.replace(/\/openai(\/.*)?$/, '').replace(/\/+$/, ''); // a pasted full "Target URI" works too
  return { endpoint, key: process.env.AZURE_OPENAI_API_KEY?.trim(), deployment: process.env.AZURE_OPENAI_DEPLOYMENT?.trim(), version: process.env.AZURE_OPENAI_API_VERSION?.trim(), effort: process.env.AZURE_OPENAI_REASONING_EFFORT?.trim() };
}
const ready = (c) => Boolean(c.endpoint && c.key && c.deployment);

// shortcut: one in-memory budget per server process; use a shared store if this is ever hosted on several instances
const LIMIT = 40, window_ = 60_000;
let calls = [];

export async function GET() {
  return Response.json({ ready: ready(config()) });
}

export async function POST(req) {
  const c = config();
  if (!ready(c)) return Response.json({ error: 'Azure OpenAI is not configured' }, { status: 503 });
  const now = Date.now();
  calls = calls.filter((t) => now - t < window_);
  if (calls.length >= LIMIT) return Response.json({ error: 'busy' }, { status: 429 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'bad request' }, { status: 400 }); }
  // speech only: no kind of request can steer where residents go
  const job = body?.kind === 'talk' ? { messages: talkMessages(body), schema: TALK_SCHEMA, name: 'speech', tokens: 600 }
    : body?.kind === 'chat' ? { messages: chatMessages(body), schema: CHAT_SCHEMA, name: 'reply', tokens: 400 } : null;
  if (!job?.messages) return Response.json({ error: 'bad request' }, { status: 400 });
  calls.push(now);

  // The v1 API takes the deployment as `model`; set AZURE_OPENAI_API_VERSION to use the older per-deployment URL instead.
  const url = c.version
    ? `${c.endpoint}/openai/deployments/${encodeURIComponent(c.deployment)}/chat/completions?api-version=${encodeURIComponent(c.version)}`
    : `${c.endpoint}/openai/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api-key': c.key },
      body: JSON.stringify({
        ...(c.version ? {} : { model: c.deployment }),
        messages: job.messages,
        response_format: { type: 'json_schema', json_schema: { name: job.name, strict: true, schema: job.schema } },
        max_completion_tokens: job.tokens,
        ...(c.effort ? { reasoning_effort: c.effort } : {}),
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      console.warn(`Azure OpenAI ${res.status}: ${detail}`);
      return Response.json({ error: `Azure OpenAI ${res.status}: ${detail.match(/"message"\s*:\s*"([^"]{1,160})/)?.[1] ?? 'request failed'}` }, { status: 502 });
    }
    const content = (await res.json()).choices?.[0]?.message?.content;
    return Response.json(JSON.parse(content));
  } catch (e) {
    console.warn('Azure OpenAI call failed:', e);
    return Response.json({ error: e?.name === 'TimeoutError' ? 'Azure OpenAI timed out' : 'Azure OpenAI call failed' }, { status: 502 });
  }
}
