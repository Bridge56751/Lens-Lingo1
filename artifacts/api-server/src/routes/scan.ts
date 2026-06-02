import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/scan", async (req, res) => {
  const { imageBase64, targetLanguage, nativeLanguage } = req.body as {
    imageBase64?: string;
    targetLanguage?: string;
    nativeLanguage?: string;
  };

  if (!imageBase64 || !targetLanguage || !nativeLanguage) {
    res.status(400).json({ error: "imageBase64, targetLanguage, and nativeLanguage are required" });
    return;
  }

  // Use GPT vision to identify the item
  let itemName = "Unknown Item";
  let itemNameTranslated = "Unknown";
  let pronunciation = "";

  try {
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
            {
              type: "text",
              text: `Identify the main object in this image. Respond with only valid JSON in this exact format: {"itemName": "English name of the item", "itemNameTranslated": "${targetLanguage} translation", "pronunciation": "phonetic pronunciation in ${targetLanguage} using English letters"}`,
            },
          ],
        },
      ],
    });

    const content = visionResponse.choices[0]?.message?.content ?? "{}";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        itemName?: string;
        itemNameTranslated?: string;
        pronunciation?: string;
      };
      itemName = parsed.itemName ?? itemName;
      itemNameTranslated = parsed.itemNameTranslated ?? itemNameTranslated;
      pronunciation = parsed.pronunciation ?? "";
    }
  } catch (err) {
    req.log.error({ err }, "Vision identification failed, using defaults");
  }

  // Create conversation with a descriptive title
  const [conversation] = await db
    .insert(conversations)
    .values({ title: `${itemName} • ${targetLanguage}` })
    .returning();

  // Build system prompt for language learning
  const pronounceNote = pronunciation ? `, pronounced "${pronunciation}"` : "";
  const systemPrompt = `You are an enthusiastic and encouraging language tutor helping a ${nativeLanguage} speaker learn ${targetLanguage}. The user has scanned an item: "${itemName}" (${itemNameTranslated} in ${targetLanguage}${pronounceNote}).

Your teaching style:
- Keep responses SHORT (2-4 sentences max)
- Use ${targetLanguage} primarily, with brief ${nativeLanguage} translations in parentheses for new words
- Ask one simple question or give one small challenge to keep the conversation going
- Be warm and encouraging
- Do not use emojis`;

  // Generate initial AI greeting
  let initialContent = `Let's learn about "${itemName}" in ${targetLanguage}!`;
  try {
    const initialResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `I just scanned a ${itemName}. Help me learn the word for it in ${targetLanguage}!`,
        },
      ],
    });
    initialContent =
      initialResponse.choices[0]?.message?.content ?? initialContent;
  } catch (err) {
    req.log.error({ err }, "Initial message generation failed");
  }

  // Save system message, user trigger, and AI initial message to DB
  await db.insert(messages).values([
    { conversationId: conversation.id, role: "system", content: systemPrompt },
    {
      conversationId: conversation.id,
      role: "user",
      content: `I just scanned a ${itemName}. Help me learn the word for it in ${targetLanguage}!`,
    },
    { conversationId: conversation.id, role: "assistant", content: initialContent },
  ]);

  res.status(201).json({
    conversationId: conversation.id,
    itemName,
    itemNameTranslated,
    initialMessage: initialContent,
  });
});

export default router;
