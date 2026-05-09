const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

/** Redirect to Cognito login when the API returns 401. */
function handleUnauthorized(): never {
  if (typeof window !== "undefined") {
    window.location.href = "/api/auth/login";
  }
  throw new Error("authentication required");
}

/** Generic SSE async iterator. Consumed by /search and /chat pages. */
export async function* streamSSE<T = unknown>(
  url: string,
  body: unknown,
): AsyncGenerator<{ type: string; data: T }> {
  const fullUrl = url.startsWith("http") || url.startsWith("/api")
    ? url
    : `${BASE}${url}`;
  const r = await fetch(fullUrl, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (r.status === 401) handleUnauthorized();
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n\n");
    buf = lines.pop() || "";
    for (const ln of lines) {
      const trimmed = ln.trim();
      if (!trimmed.startsWith("data: ")) continue;
      try {
        yield JSON.parse(trimmed.slice(6)) as { type: string; data: T };
      } catch {
        /* skip malformed */
      }
    }
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (r.status === 401) handleUnauthorized();
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (r.status === 401) handleUnauthorized();
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

/** GCC scenario API helpers. Pages may call these or fetch directly. */
export const api = {
  search: (q: string, persona = "marketing", top_n = 10) =>
    postJson<{ hits: unknown[]; subgraph: unknown }>("/search", { q, persona, top_n }),
  insights: (question: string, persona = "marketing") =>
    postJson("/insights", { question, persona }),
  personaMatch: (customer_id: string) =>
    postJson("/persona-match", { customer_id }),
  cluster: (k = 6) =>
    postJson("/cluster", { k }),
  lookalike: (seed_persona: string, top_n = 200) =>
    postJson("/lookalike", { seed_persona, top_n }),
  campaignRoi: (campaign_id?: string) =>
    postJson("/campaign-roi", { campaign_id }),
  networkMap: (region_cd?: string) =>
    postJson("/network-map/map", { region_cd }),
  compliance: (customer_id: string) =>
    postJson("/compliance/check", { customer_id }),
  externalSignal: (customer_id: string) =>
    postJson("/external-signal/fuse", { customer_id }),
  outlier: (limit = 50) =>
    postJson("/outlier/detect", { limit }),
  payment: (customer_id?: string) =>
    postJson("/payment/analyze", { customer_id }),
  journey: (customer_id: string) =>
    postJson("/journey", { customer_id }),
  weather: (region_cd?: string) =>
    postJson("/weather/correlate", { region_cd }),
};

// listPersonas — GS Caltex M&M본부 5 부서
export function listPersonas(_n = 5) {
  return Promise.resolve({
    items: [
      { persona_id: "marketing",   label_ko: "마케팅" },
      { persona_id: "strategy",    label_ko: "고객전략" },
      { persona_id: "data_ai",     label_ko: "데이터·AI" },
      { persona_id: "crm_member",  label_ko: "CRM·회원사업" },
      { persona_id: "retail_sales", label_ko: "리테일영업" },
    ],
  });
}

// listObjects — GET /api/objects/<label>?limit=N
export function listObjects(label: string, limit = 100) {
  return getJson<{ label: string; items: unknown[] }>(`/objects/${encodeURIComponent(label)}?limit=${limit}`);
}

// getOpsTrace — GET /api/ops/trace
export async function getOpsTrace(limit = 50) {
  try {
    return await getJson<unknown>(`/ops/trace?limit=${limit}`);
  } catch {
    return { items: [], error: "trace endpoint not available" };
  }
}

/** Generic SSE streamer for SSE endpoints (chat, etc). */
function sseStream(
  path: string,
  body: unknown,
  onEvent: (e: { type: string; [k: string]: unknown }) => void,
): () => void {
  const ctrl = new AbortController();
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: ctrl.signal,
    credentials: "include",
  }).then(async (r) => {
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      const why = r.status === 401
        ? "로그인 세션이 만료되었습니다. 페이지를 새로고침하면 자동 재로그인됩니다."
        : `(${r.status}) ${detail.slice(0, 200) || r.statusText}`;
      onEvent({ type: "error", message: why, status: r.status });
      onEvent({ type: "stop", reason: `error:${r.status}` });
      if (r.status === 401) handleUnauthorized();
      return;
    }
    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const eventSep = /\r?\n\r?\n/;
    const lineSep = /\r?\n/;
    const dispatch = (ev: string) => {
      const dataLine = ev.split(lineSep).find((l) => l.startsWith("data:"));
      if (!dataLine) return;
      const payload = dataLine.slice(5).trimStart();
      if (!payload) return;
      try { onEvent(JSON.parse(payload)); } catch { /* skip malformed */ }
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split(eventSep);
      buf = events.pop() ?? "";
      for (const ev of events) dispatch(ev);
    }
    if (buf.trim()) dispatch(buf);
    onEvent({ type: "stop", reason: "stream_end" });
  }).catch((err) => {
    if (err?.name !== "AbortError") {
      onEvent({ type: "stop", reason: `fetch_error:${String(err)}` });
    }
  });
  return () => ctrl.abort();
}

export function chatStream(
  msg: string, session_id: string, persona = "marketing",
  onEvent: (e: { type: string; [k: string]: unknown }) => void,
): () => void {
  return sseStream("/chat", { msg, session_id, persona }, onEvent);
}
