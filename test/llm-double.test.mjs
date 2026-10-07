/**
 * The buyer agent's model double holds requests to each provider's rules.
 *
 *     npm run test:unit
 *
 * test/llm-double.mjs stands in for Qwen and Kimi in tests. It is only
 * worth running the agent against it if it refuses what the real
 * endpoint would refuse, so a request the agent gets wrong fails the run here
 * instead of failing later against Moonshot or Model Studio.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startDouble } from "./llm-double.mjs";

const tools = [{ type: "function", function: { name: "list_tasks", parameters: { type: "object", properties: {} } } }];
const ask = async (fx, body) => {
  const r = await fetch(`${fx.url}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
};
/** One streamed turn, put back together the way the agent does it. */
const assemble = (text) => {
  const msg = { content: "", reasoning_content: "", tool_calls: [] };
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
    const d = JSON.parse(line.slice(5)).choices[0].delta;
    if (d.content) msg.content += d.content;
    if (d.reasoning_content) msg.reasoning_content += d.reasoning_content;
    for (const t of d.tool_calls ?? []) {
      const at = (msg.tool_calls[t.index] ??= { id: t.id, type: "function", function: { name: "", arguments: "" } });
      if (t.function?.name) at.function.name += t.function.name;
      if (t.function?.arguments) at.function.arguments += t.function.arguments;
    }
  }
  return msg;
};

test("the first move is to list the tasks, streamed as a tool call", async () => {
  const fx = await startDouble("qwen");
  try {
    const r = await ask(fx, { model: "qwen3.8-max", stream: true, tools, temperature: 0.2, messages: [{ role: "user", content: "buy" }] });
    assert.equal(r.status, 200);
    const m = assemble(r.text);
    assert.equal(m.tool_calls[0].function.name, "list_tasks");
    assert.deepEqual(JSON.parse(m.tool_calls[0].function.arguments), {});
    assert.equal(m.reasoning_content, "", "Qwen's stand-in sends no reasoning");
  } finally {
    await fx.close();
  }
});

test("a model id the provider does not have is refused", async () => {
  const fx = await startDouble("kimi");
  try {
    const r = await ask(fx, { model: "kimi-k2.5", stream: true, tools, messages: [] });
    assert.equal(r.status, 400);
    assert.match(r.text, /expected kimi-k2\.6/);
  } finally {
    await fx.close();
  }
});

test("Kimi refuses a temperature and wants its reasoning back", async () => {
  const fx = await startDouble("kimi");
  try {
    const hot = await ask(fx, { model: "kimi-k2.6", stream: true, tools, temperature: 0.2, messages: [] });
    assert.equal(hot.status, 400);
    assert.match(hot.text, /temperature/);

    const first = assemble((await ask(fx, { model: "kimi-k2.6", stream: true, tools, messages: [{ role: "user", content: "buy" }] })).text);
    assert.ok(first.reasoning_content.length > 0, "Kimi's stand-in reasons before it calls");
    const call = first.tool_calls[0];
    const answer = { role: "tool", tool_call_id: call.id, content: JSON.stringify({ tasks: [] }) };
    const history = (assistant) => ({ model: "kimi-k2.6", stream: true, tools, messages: [{ role: "user", content: "buy" }, assistant, answer] });

    const dropped = await ask(fx, history({ role: "assistant", content: "", tool_calls: [call] }));
    assert.equal(dropped.status, 400, "an assistant turn without its reasoning is refused");
    assert.match(dropped.text, /reasoning_content/);

    const kept = await ask(fx, history({ role: "assistant", content: "", tool_calls: [call], reasoning_content: first.reasoning_content }));
    assert.equal(kept.status, 200);
    assert.match(assemble(kept.text).content, /Nothing was bought/, "with no tasks it reports that it bought nothing");
  } finally {
    await fx.close();
  }
});

test("every tool call in the history needs exactly one answer", async () => {
  const fx = await startDouble("qwen");
  try {
    const two = [
      { id: "a", type: "function", function: { name: "list_tasks", arguments: "{}" } },
      { id: "b", type: "function", function: { name: "list_tasks", arguments: "{}" } },
    ];
    const r = await ask(fx, {
      model: "qwen3.8-max", stream: true, tools,
      messages: [{ role: "user", content: "buy" }, { role: "assistant", content: "", tool_calls: two }, { role: "tool", tool_call_id: "a", content: "{}" }],
    });
    assert.equal(r.status, 400);
    assert.match(r.text, /tool_call_id b has 0 answers/);
  } finally {
    await fx.close();
  }
});
