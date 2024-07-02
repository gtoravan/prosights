import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const chatRouter = router({
  sendMessage: publicProcedure
    .input(z.object({ message: z.string() }))
    .mutation(async ({ input }) => {
      const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: input.message }],
        model: "gpt-3.5-turbo",
      });

      const responseContent = completion.choices?.[0]?.message?.content?.trim() ?? "No response from GPT";
      return { response: responseContent };
    }),
});
