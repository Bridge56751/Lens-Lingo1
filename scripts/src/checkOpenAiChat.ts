import { openai } from "../../lib/integrations-openai-ai-server/src/client";

// Exercise the same configured client and models as chat without customer data.
for (const model of ["gpt-4o", "gpt-4o-mini"]) {
  try {
    const reply = await openai.chat.completions.create({
      model,
      max_completion_tokens: 8,
      messages: [{ role: "user", content: "Reply with OK." }],
    });
    console.log(JSON.stringify({ model, ok: !!reply.choices[0]?.message?.content }));
  } catch (error) {
    // Never serialize provider request objects or credentials.
    console.log(JSON.stringify({ model, ok: false, status: (error as { status?: number }).status }));
    process.exitCode = 1;
  }
}
