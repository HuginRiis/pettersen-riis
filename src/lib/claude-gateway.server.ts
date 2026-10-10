// Erstatter Lovable AI-gatewayen med Claude (selvhostet på NAS, ikke Lovable).
//
// Ved import kobles en avskjærer inn i globalThis.fetch: kall til
// https://ai.gateway.lovable.dev/v1/chat/completions (OpenAI-format) sendes til Claude
// via Anthropic SDK, og svaret oversettes tilbake til samme form
// (choices[0].message.content / tool_calls), så eksisterende kode, retry og
// loggedFetch-logging virker uendret. Andre fetch-kall går rett gjennom.
//
// Miljøvariabler: ANTHROPIC_API_KEY (påkrevd), CLAUDE_MODEL (valgfri).
// Bildegenerering (modalities: ["image"]) støttes ikke av Claude og gir 501.

import Anthropic from "@anthropic-ai/sdk";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "claude-opus-5-5";

// deno-lint-ignore no-explicit-any
type Any = any;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

const parseDataUrl = (url: string) => {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  return m ? { mediaType: m[1].toLowerCase(), data: m[2] } : null;
};

// Lenker lastes ned her og sendes inline, så Claude ikke trenger å nå filen selv.
async function toInline(url: string, originalFetch: typeof fetch) {
  const inline = parseDataUrl(url);
  if (inline) return inline;
  const res = await originalFetch(url);
  if (!res.ok) throw new Error(`Kunne ikke laste ned ${url}: HTTP ${res.status}`);
  let mediaType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mediaType || mediaType === "application/octet-stream") {
    mediaType = /\.pdf(\?|#|$)/i.test(url) ? "application/pdf" : /\.png(\?|#|$)/i.test(url) ? "image/png" : "image/jpeg";
  }
  return { mediaType, data: Buffer.from(await res.arrayBuffer()).toString("base64") };
}

async function fileBlock(url: string, originalFetch: typeof fetch): Promise<Anthropic.ContentBlockParam> {
  const { mediaType, data } = await toInline(url, originalFetch);
  if (mediaType === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  return { type: "image", source: { type: "base64", media_type: mediaType as Anthropic.Base64ImageSource["media_type"], data } };
}

async function convertContent(content: Any, originalFetch: typeof fetch): Promise<string | Anthropic.ContentBlockParam[]> {
  if (typeof content === "string") return content;
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const part of content ?? []) {
    if (part.type === "text") blocks.push({ type: "text", text: part.text });
    else if (part.type === "image_url") blocks.push(await fileBlock(part.image_url.url, originalFetch));
    else if (part.type === "file") blocks.push(await fileBlock(part.file.file_data ?? part.file.url, originalFetch));
  }
  // Claude anbefaler bilder/dokumenter før teksten.
  return [...blocks.filter((b) => b.type !== "text"), ...blocks.filter((b) => b.type === "text")];
}

// Strict-modus krever additionalProperties: false på alle objekter i skjemaet.
function closeObjects(schema: Any): Any {
  if (Array.isArray(schema)) return schema.map(closeObjects);
  if (!schema || typeof schema !== "object") return schema;
  const out: Any = {};
  for (const [k, v] of Object.entries(schema)) out[k] = closeObjects(v);
  if (out.type === "object" && out.additionalProperties === undefined) out.additionalProperties = false;
  return out;
}

async function toClaudeRequest(body: Any, originalFetch: typeof fetch): Promise<Anthropic.MessageCreateParamsNonStreaming> {
  const system: string[] = [];
  const messages: Anthropic.MessageParam[] = [];
  for (const m of body.messages ?? []) {
    if (m.role === "system") system.push(typeof m.content === "string" ? m.content : m.content.map((p: Any) => p.text ?? "").join("\n"));
    else messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: await convertContent(m.content, originalFetch) });
  }
  const tools: Anthropic.Tool[] | undefined = body.tools?.map((t: Any) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: closeObjects(t.function.parameters ?? { type: "object", properties: {} }),
    strict: true,
  }));
  // Tvunget verktøyvalg støttes ikke av nyere Claude-modeller; bruk auto og be eksplisitt.
  const forced = body.tool_choice?.function?.name;
  if (forced) system.push(`Svar ved å kalle verktøyet \`${forced}\`. Ikke svar med vanlig tekst.`);
  else if (body.tool_choice === "required" && tools?.length) system.push("Svar ved å kalle et av verktøyene. Ikke svar med vanlig tekst.");
  if (body.response_format?.type === "json_object" || body.response_format?.type === "json_schema") {
    const schema = body.response_format?.json_schema?.schema;
    system.push("Svar kun med gyldig JSON, uten markdown eller annen tekst." + (schema ? ` JSON-en skal følge dette skjemaet: ${JSON.stringify(schema)}` : ""));
  }
  return {
    model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    max_tokens: body.max_tokens ?? body.max_completion_tokens ?? 16000,
    ...(system.length ? { system: system.join("\n\n") } : {}),
    messages,
    ...(tools?.length ? { tools, tool_choice: { type: "auto" as const } } : {}),
  };
}

function toOpenAIResponse(msg: Anthropic.Message, wantsJson: boolean) {
  let text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  // Fjern eventuelle ```json-gjerder når JSON var bestilt.
  if (wantsJson) text = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const toolCalls = msg.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) } }));
  return {
    id: msg.id,
    model: msg.model,
    choices: [{
      index: 0,
      finish_reason: msg.stop_reason === "tool_use" ? "tool_calls" : msg.stop_reason === "max_tokens" ? "length" : msg.stop_reason === "refusal" ? "content_filter" : "stop",
      message: { role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
    }],
    usage: { prompt_tokens: msg.usage.input_tokens, completion_tokens: msg.usage.output_tokens, total_tokens: msg.usage.input_tokens + msg.usage.output_tokens },
  };
}

async function handle(init: RequestInit | undefined, originalFetch: typeof fetch): Promise<Response> {
  let body: Any;
  try {
    body = JSON.parse(String(init?.body));
  } catch {
    return jsonResponse(400, { error: { message: "Ugyldig AI-forespørsel" } });
  }
  if (Array.isArray(body.modalities) && body.modalities.includes("image")) {
    return jsonResponse(501, { error: { message: "Bildegenerering er ikke tilgjengelig (Claude lager ikke bilder)." } });
  }
  if (!process.env.ANTHROPIC_API_KEY) return jsonResponse(500, { error: { message: "ANTHROPIC_API_KEY mangler" } });

  let request: Anthropic.MessageCreateParamsNonStreaming;
  try {
    request = await toClaudeRequest(body, originalFetch);
  } catch (e) {
    return jsonResponse(400, { error: { message: `Ugyldig AI-forespørsel: ${(e as Error).message}` } });
  }
  try {
    let msg: Anthropic.Message;
    try {
      msg = await getClient().messages.create(request);
    } catch (e) {
      // Noen skjemaer bruker JSON Schema-funksjoner som strict-modus ikke støtter; prøv uten.
      if (!(e instanceof Anthropic.BadRequestError) || !request.tools) throw e;
      request = { ...request, tools: request.tools.map((t) => ({ ...t, strict: undefined })) };
      msg = await getClient().messages.create(request);
    }
    // tool_choice er "auto", så Claude kan av og til svare med tekst; be om verktøykall på nytt (maks 2 ganger).
    for (let i = 0; i < 2 && request.tools && msg.stop_reason === "end_turn" && !msg.content.some((b) => b.type === "tool_use"); i++) {
      msg = await getClient().messages.create({
        ...request,
        messages: [...request.messages, { role: "assistant", content: msg.content }, { role: "user", content: "Svar ved å kalle verktøyet, ikke med tekst." }],
      });
    }
    if (msg.stop_reason === "refusal") console.warn("Claude refusal", msg.stop_details);
    return jsonResponse(200, toOpenAIResponse(msg, !!body.response_format));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return jsonResponse(429, { error: { message: "Claude: for mange forespørsler, prøv igjen snart" } });
    if (e instanceof Anthropic.APIError) {
      console.error(`Claude API-feil ${e.status}:`, e.message);
      return jsonResponse(e.status ?? 502, { error: { message: e.message } });
    }
    console.error("Claude-kall feilet:", e);
    return jsonResponse(502, { error: { message: "Kunne ikke nå Claude" } });
  }
}

// Installer avskjæreren én gang per serverprosess.
const g = globalThis as Any;
if (!g.__claudeGatewayInstalled) {
  g.__claudeGatewayInstalled = true;
  const originalFetch: typeof fetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === GATEWAY) return handle(init, originalFetch);
    return originalFetch(input, init);
  }) as typeof fetch;
}

export {};
