import { config } from './config'

export type Provider = 'gemini' | 'groq'
export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export function availableProviders(): Provider[] {
  const list: Provider[] = []
  if (config.ai.geminiKey) list.push('gemini')
  if (config.ai.groqKey) list.push('groq')
  return list
}

/** Minimal SSE reader: yields the JSON payload of each `data:` line. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim()
        if (payload && payload !== '[DONE]') yield payload
      }
    }
  }
}

/** Streams the model's text. Throws before yielding anything if the provider rejects the request. */
export async function* streamText(
  provider: Provider,
  system: string,
  turns: Turn[],
  maxTokens: number,
  signal: AbortSignal
): AsyncGenerator<string> {
  if (provider === 'gemini') {
    const model = config.ai.geminiModel
    const res = await fetch(
      `${config.ai.geminiBase}/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        signal,
        // The key travels in a header, never in a URL that could end up in logs.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.ai.geminiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.7,
            // Coaching lines are short and time-sensitive; skip the slow "thinking" phase
            // on flash-tier models. Pro-tier models rely on that reasoning step for
            // quality, so it's left on for those (it does make Pro noticeably slower —
            // set GEMINI_MODEL=gemini-3-flash-preview if live-game latency matters more
            // than depth).
            ...(model.includes('flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {})
          }
        })
      }
    )
    if (!res.ok || !res.body) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
    for await (const payload of sseData(res.body)) {
      const parts = JSON.parse(payload)?.candidates?.[0]?.content?.parts as { text?: string }[] | undefined
      const text = parts?.map((p) => p.text ?? '').join('') ?? ''
      if (text) yield text
    }
    return
  }

  // Groq: OpenAI-compatible chat completions endpoint.
  const res = await fetch(`${config.ai.groqBase}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.ai.groqKey}` },
    body: JSON.stringify({
      model: config.ai.groqModel,
      stream: true,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [{ role: 'system', content: system }, ...turns]
    })
  })
  if (!res.ok || !res.body) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`)
  for await (const payload of sseData(res.body)) {
    const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content as string | undefined
    if (delta) yield delta
  }
}
