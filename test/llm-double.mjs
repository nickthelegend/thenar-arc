/**
 * A test double for the buyer agent's model: scripted replies, for tests only.
 * It is not Qwen and not Kimi, and the agent itself has no way to reach it: a
 * test starts it and points QWEN_BASE_URL or KIMI_BASE_URL at it.
 *
 * It speaks the same OpenAI-compatible chat API the agent uses for both
 * (streamed, with tool calls), so in a test everything around the model runs
 * for real:
 * - the agent's request building and stream parsing;
 * - its tool loop and its budget;
 * - the x402 payment on the chain;
 * - the SalesLog check.
 * Only the choices are scripted. They follow the agent's goal:
 * 1. list the tasks;
 * 2. take the one with the most accepted episodes;
 * 3. read its datasheet;
 * 4. ask the price;
 * 5. buy;
 * 6. verify on chain;
 * 7. report only figures the tools returned.
 *
 * It also holds each request to the rules of the provider it stands in for,
 * and answers 400 as the real endpoint would when the agent breaks one:
 * - the model id must be that provider's;
 * - Kimi takes no temperature, and wants its reasoning back on every
 *   assistant turn it wrote;
 * - every tool call in the history must have exactly one answer.
 */
import { createServer } from "node:http";

export const PROVIDERS = {
  qwen: { label: "Qwen 3.8 Max (Alibaba Cloud Model Studio)", model: "qwen3.8-max", reasoning: false, temperature: true },
  kimi: { label: "Kimi K2.6 (Moonshot)", model: "kimi-k2.6", reasoning: true, temperature: false },
  ollama: { label: "Qwen 3 on Ollama", model: "qwen3:4b", reasoning: false, temperature: true },
};

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

/** The rules the real endpoint enforces, as far as this agent can break them. */
function refusal(provider, req, reasoningByCallId) {
  if (req.model !== provider.model) return `model ${JSON.stringify(req.model)} does not exist here; expected ${provider.model}`;
  if (req.stream !== true) return "this double serves streamed turns only";
  if (!Array.isArray(req.tools) || !req.tools.length) return "no tools were offered";
  if (!provider.temperature && "temperature" in req) return `invalid temperature: ${provider.model} only accepts its own`;
  const answered = new Map();
  for (const m of req.messages ?? []) if (m.role === "tool") answered.set(m.tool_call_id, (answered.get(m.tool_call_id) ?? 0) + 1);
  for (const m of req.messages ?? []) {
    if (m.role !== "assistant") continue;
    for (const c of m.tool_calls ?? []) {
      if (answered.get(c.id) !== 1) return `tool_call_id ${c.id} has ${answered.get(c.id) ?? 0} answers; it needs exactly one`;
      const thought = reasoningByCallId.get(c.id);
      if (provider.reasoning && thought && m.reasoning_content !== thought) {
        return "an assistant turn with tool calls is missing its reasoning_content";
      }
    }
  }
  return null;
}

/** What the agent has learned so far, by tool. */
function results(messages) {
  const names = new Map();
  for (const m of messages) for (const c of m.tool_calls ?? []) names.set(c.id, { name: c.function.name, args: c.function.arguments });
  const out = {};
  for (const m of messages) {
    if (m.role !== "tool") continue;
    const call = names.get(m.tool_call_id);
    if (!call) continue;
    try { out[call.name] = JSON.parse(m.content); } catch { out[call.name] = { error: "unreadable tool answer" }; }
  }
  return out;
}

/** The next move: a tool call, or the final report. */
function decide(messages) {
  const r = results(messages);
  if (!r.list_tasks) return { tool: "list_tasks", args: {}, why: "First, see what is for sale." };
  const tasks = r.list_tasks.tasks ?? [];
  const best = [...tasks].sort((a, b) => b.episodes - a.episodes || a.task_id - b.task_id)[0];
  if (!best || best.episodes === 0) return { report: "Nothing was bought: no task has an accepted episode yet." };
  const id = best.task_id;
  if (!r.read_datasheet) return { tool: "read_datasheet", args: { task_id: id }, why: `Task ${id} has the most accepted episodes (${best.episodes}); read how it was collected.` };
  if (!r.get_price) return { tool: "get_price", args: { task_id: id }, why: "Check the price against the budget before paying." };
  if (r.get_price.error) return { report: `Nothing was bought: the price could not be read (${r.get_price.error}).` };
  if (!r.buy_corpus) return { tool: "buy_corpus", args: { task_id: id }, why: `It costs ${r.get_price.price}, within the ${r.get_price.budget_left} left. Buy it.` };
  const b = r.buy_corpus;
  if (b.error) return { report: `Nothing was bought: ${b.error}.` };
  if (!r.verify_on_chain) return { tool: "verify_on_chain", args: { task_id: id }, why: "Check the bytes received against the sale SalesLog recorded." };
  const v = r.verify_on_chain;
  return {
    report:
      `Bought task ${id}'s corpus (${b.episodes} episodes, ${b.frames} frames, ${b.labelled_failures} labelled failures) because it has the most accepted episodes. ` +
      `It cost ${b.paid}; payment transaction ${b.payment_tx}. ` +
      (v.verified
        ? `SalesLog entry ${v.entry} at ${v.sales_log} records sha256 ${v.logged_sha256}, which matches the bytes received.`
        : `The chain did not confirm it: ${v.reason ?? "the logged sha256 differs from the bytes received"}.`),
  };
}

function* chunks(text, size = 24) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

/**
 * Start the double on a free local port. Returns its base URL (as the agent's
 * LLM url) and the requests it saw, for tests to inspect.
 */
export async function startDouble(name) {
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`no double for ${name}; one of ${Object.keys(PROVIDERS).join(", ")}`);
  const seen = [];
  const reasoningByCallId = new Map();
  let turn = 0;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) return send(res, 404, { error: { message: "not found" } });
      let body;
      try { body = JSON.parse(raw); } catch { return send(res, 400, { error: { message: "body is not JSON" } }); }
      seen.push(body);
      const why = refusal(provider, body, reasoningByCallId);
      if (why) return send(res, 400, { error: { message: why, type: "invalid_request_error" } });

      const next = decide(body.messages ?? []);
      turn += 1;
      res.writeHead(200, { "content-type": "text/event-stream" });
      const emit = (delta, finish = null) =>
        res.write(`data: ${JSON.stringify({ id: `double-${turn}`, model: provider.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
      const thought = provider.reasoning ? (next.why ?? "Report what the tools returned, and nothing else.") : "";
      for (const part of chunks(thought)) emit({ reasoning_content: part });
      if (next.tool) {
        const id = `call_double_${turn}`;
        if (thought) reasoningByCallId.set(id, thought);
        emit({ role: "assistant", tool_calls: [{ index: 0, id, type: "function", function: { name: next.tool, arguments: "" } }] });
        for (const part of chunks(JSON.stringify(next.args), 8)) emit({ tool_calls: [{ index: 0, function: { arguments: part } }] });
        emit({}, "tool_calls");
      } else {
        for (const part of chunks(next.report)) emit({ content: part });
        emit({}, "stop");
      }
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/v1`,
    model: provider.model,
    label: provider.label,
    requests: seen,
    close: () => new Promise((ok) => server.close(ok)),
  };
}
