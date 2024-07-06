import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { ChromaClient } from 'chromadb';
import { OpenAIEmbeddingFunction } from 'chromadb';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const chromaClient = new ChromaClient(); // Adjust to your Chroma DB endpoint


const embeddingFunction = new OpenAIEmbeddingFunction({
  openai_api_key: process.env.OPENAI_API_KEY,
  model: "text-embedding-ada-002"
});

async function chunkAndEmbed(content: string) {
  const chunks = content.match(/.{1,1000}/g) || []; // Simple chunking

  const collection = await chromaClient.getOrCreateCollection({
    name: "documents",
    embeddingFunction: embeddingFunction
  });

  const embeddings = await Promise.all(chunks.map(async (chunk, index) => {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: chunk,
    });
    const embedding = response.data[0].embedding;

    await collection.upsert({
      documents: [chunk],
      ids: [`doc_chunk_${index}`],
      embeddings: [embedding]
    });

    return embedding;
  }));

  return embeddings;
}

export const documentsRouter = router({
  upload: publicProcedure
    .input(z.object({ filename: z.string(), content: z.string() }))
    .mutation(async ({ input }) => {
      const { filename, content } = input;
      const filePath = path.join(__dirname, '../../uploads', filename);
      await fs.writeFile(filePath, content, 'base64'); // assuming content is base64 encoded

      const documentContent = Buffer.from(content, 'base64').toString('utf-8');
      await chunkAndEmbed(documentContent);

      return { success: true };
    }),

  list: publicProcedure.query(async () => {
    const files = await fs.readdir(path.join(__dirname, '../../uploads'));
    return files.map(file => ({
      name: file,
      path: `/uploads/${file}`,
    }));
  }),
});
