import { NextRequest, NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are Kautilya, a strategic decision intelligence assistant embedded in a decision-making workspace. Analyze the raw input the user has written and return exactly 3 items for each of these three categories:

1. suggestions — specific, actionable improvements to how they've framed or thought about this
2. biases — cognitive biases visible in the framing (name the bias + one-line why it applies)
3. thinkAbout — important angles, risks, or blind spots they haven't addressed yet

Rules:
- Each item must be 1 concise sentence (max 15 words)
- Do not repeat points across categories
- If input is too short or vague, still return 3 items per category based on what little is there
- Return ONLY a raw JSON object — no markdown, no code fences, no extra text

Required shape:
{"suggestions":["...","...","..."],"biases":["...","...","..."],"thinkAbout":["...","...","..."]}`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Groq API key not configured" }, { status: 500 });
  }

  let body: { text?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (text.length < 10) {
    return NextResponse.json({ suggestions: [], biases: [], thinkAbout: [] });
  }

  const source = body.source ?? "decision";
  const userPrompt = `Stage: ${source}\n\nUser input:\n${text.slice(0, 1500)}`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[kautilya] Groq error", res.status, errBody.slice(0, 300));
      return NextResponse.json({ error: "Groq error" }, { status: 502 });
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";

    const stripped = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) {
      console.error("[kautilya] no JSON object found in response");
      return NextResponse.json({ suggestions: [], biases: [], thinkAbout: [] });
    }

    let parsed: { suggestions?: string[]; biases?: string[]; thinkAbout?: string[] };
    try {
      parsed = JSON.parse(stripped.slice(start, end + 1));
    } catch (e) {
      console.error("[kautilya] JSON parse failed:", e instanceof Error ? e.message : String(e));
      return NextResponse.json({ suggestions: [], biases: [], thinkAbout: [] });
    }

    return NextResponse.json({
      suggestions: (parsed.suggestions ?? []).slice(0, 3),
      biases: (parsed.biases ?? []).slice(0, 3),
      thinkAbout: (parsed.thinkAbout ?? []).slice(0, 3),
    });
  } catch (err) {
    console.error("[kautilya] fetch failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to analyze" }, { status: 502 });
  }
}
