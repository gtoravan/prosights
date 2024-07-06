import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';
import { prisma } from '../prisma';
import type { Post } from '@prisma/client';

// Define OpenAI instance
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

async function ensureUploadDir() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch (error) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

// Initialize ChromaDB client and collection
const chromaClient = new ChromaClient();
const embeddingFunction = new OpenAIEmbeddingFunction({
  openai_api_key: process.env.OPENAI_API_KEY,
  model: "text-embedding-ada-002"
});
const collectionPromise = chromaClient.getOrCreateCollection({
  name: "documents",
  embeddingFunction: embeddingFunction,
  metadata: { "hnsw:space": "cosine" },
});

// Helper function to chunk document
function chunkDocument(content: string, chunkSize = 200): string[] {
  const words = content.split(' ');
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }
  return chunks;
}

async function generateEmbeddings(chunks: string[]) {
  const embeddings = [];
  for (const chunk of chunks) {
    try {
      console.log(`Generating embedding for chunk: ${chunk.slice(0, 30)}...`);
      const embedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: chunk,
      });
      embeddings.push(embedding.data[0].embedding);
    } catch (error) {
      console.error(`Failed to generate embedding for chunk: ${chunk.slice(0, 30)}...`, error);
      throw error;
    }
  }
  return embeddings;
}

async function getCollectionSize(collection) {
  const allDocuments = await collection.get();
  return allDocuments.ids.length;
}

async function generateEmbeddingForQuery(query: string) {
  try {
    const embedding = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: query,
    });
    return embedding.data[0].embedding;
  } catch (error) {
    console.error(`Failed to generate embedding for query: ${query}`, error);
    throw error;
  }
}

async function queryCollection(collection, queryEmbedding, nResults = 3) {
  try {
    console.log('Querying collection with embedding:', queryEmbedding);
    const results = await collection.query({
      query_embeddings: queryEmbedding,
      n_results: nResults,
    });
    return results;
  } catch (error) {
    console.error('Failed to query collection:', error);
    throw error;
  }
}

interface MyEvents {
  add: (data: Post) => void;
  isTypingUpdate: () => void;
}
declare interface MyEventEmitter {
  on<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  off<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  once<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  emit<TEv extends keyof MyEvents>(
    event: TEv,
    ...args: Parameters<MyEvents[TEv]>
  ): boolean;
}

class MyEventEmitter extends EventEmitter {}

const ee = new MyEventEmitter();

const currentlyTyping: Record<string, { lastTyped: Date }> = Object.create(null);

const interval = setInterval(() => {
  let updated = false;
  const now = Date.now();
  for (const [key, value] of Object.entries(currentlyTyping)) {
    if (now - value.lastTyped.getTime() > 3e3) {
      delete currentlyTyping[key];
      updated = true;
    }
  }
  if (updated) {
    ee.emit('isTypingUpdate');
  }
}, 3e3);
process.on('SIGTERM', () => {
  clearInterval(interval);
});

export const postRouter = router({
  upload: publicProcedure
    .input(z.array(z.object({ filename: z.string(), content: z.string() })))
    .mutation(async ({ input }) => {
      await ensureUploadDir();
      const collection = await collectionPromise;

      for (const file of input) {
        const { filename, content } = file;
        const filePath = path.join(UPLOAD_DIR, filename);

        // Save file temporarily to read its content
        await fs.writeFile(filePath, content, 'base64');
        const dataBuffer = await fs.readFile(filePath);

        // Extract text from PDF
        let documentContent;
        try {
          const data = await pdf(dataBuffer);
          documentContent = data.text;
        } catch (error) {
          console.error(`Failed to extract text from PDF: ${filename}`, error);
          throw new Error(`Failed to extract text from PDF: ${filename}`);
        }

        // Remove temporary file
        await fs.unlink(filePath);

        const chunks = chunkDocument(documentContent);
        console.log(`Chunked document into ${chunks.length} chunks for file: ${filename}`);

        try {
          const embeddings = await generateEmbeddings(chunks);
          console.log(`Generated embeddings for document: ${filename}`);

          console.log(`Upserting document chunks for ${filename} into ChromaDB`);
          await collection.upsert({
            ids: chunks.map((_, index) => `${filename}_chunk_${index}`),
            embeddings: embeddings,
            documents: chunks,
            metadatas: chunks.map((_, index) => ({ filename, chunk: index })),
          });
          console.log(`Upserted document chunks for ${filename} into ChromaDB`);

          // Get collection size for logging
          const collectionSize = await getCollectionSize(collection);
          console.log(`ChromaDB collection size: ${collectionSize} documents`);

          // Save the file only if the upsert is successful
          await fs.writeFile(filePath, content, 'base64');
        } catch (error) {
          console.error(`Failed to process and store document: ${filename}`, error);
          throw new Error(`Failed to process and store document: ${filename}`);
        }
      }

      return { success: true };
    }),

  listDocuments: publicProcedure.query(async () => {
    await ensureUploadDir();
    const files = await fs.readdir(UPLOAD_DIR);
    return files.map(file => ({
      name: file,
      path: `/uploads/${file}`,
    }));
  }),

  sendMessage: publicProcedure
    .input(z.object({ message: z.string() }))
    .mutation(async ({ input }) => {
      const collection = await collectionPromise;

      // Generate embedding for the query
      // const embedding = await openai.embeddings.create({
      //   model: "text-embedding-ada-002",
      //   input: input.message,
      // });
      //
      // const queryEmbedding = embedding.data[0].embedding;
      //
      // if (!queryEmbedding) {
      //   throw new Error("Failed to generate query embedding");
      // }

      // Perform semantic search

      const results = await collection.query({
        queryTexts: [input.message], // Chroma will embed this for you
        nResults: 2, // how many results to return
      });

      const topDocuments = results.documents.flat();

      // Prepare the context for GPT
      const context = topDocuments.join('\n\n');

      // Send message to GPT with context
      const completion = await openai.chat.completions.create({
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: input.message },
          { role: "system", content: `Context:\n${context}` },
        ],
        model: "gpt-3.5-turbo",
      });

      const responseContent = completion.choices?.[0]?.message?.content?.trim() ?? "No response from GPT";
      return { response: responseContent };
    }),

  add: publicProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        text: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { name } = ctx.session?.user || 'unknown';
      const post = await prisma.post.create({
        data: {
          ...input,
          name,
          source: 'GITHUB',
        },
      });
      ee.emit('add', post);
      delete currentlyTyping[name];
      ee.emit('isTypingUpdate');
      return post;
    }),

  isTyping: publicProcedure
    .input(z.object({ typing: z.boolean() }))
    .mutation(({ input, ctx }) => {
      const { name } = ctx.session?.user || 'unknown';
      if (!input.typing) {
        delete currentlyTyping[name];
      } else {
        currentlyTyping[name] = {
          lastTyped: new Date(),
        };
      }
      ee.emit('isTypingUpdate');
    }),

  infinite: publicProcedure
    .input(
      z.object({
        cursor: z.date().nullish(),
        take: z.number().min(1).max(50).nullish(),
      }),
    )
    .query(async ({ input }) => {
      const take = input.take ?? 10;
      const cursor = input.cursor;

      const page = await prisma.post.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        cursor: cursor ? { createdAt: cursor } : undefined,
        take: take + 1,
        skip: 0,
      });
      const items = page.reverse();
      let nextCursor: typeof cursor | null = null;
      if (items.length > take) {
        const prev = items.shift();
        nextCursor = prev!.createdAt;
      }
      return {
        items,
        nextCursor,
      };
    }),

  onAdd: publicProcedure.subscription(() => {
    return observable<Post>((emit) => {
      const onAdd = (data: Post) => {
        emit.next(data);
      };
      ee.on('add', onAdd);
      return () => {
        ee.off('add', onAdd);
      };
    });
  }),

  whoIsTyping: publicProcedure.subscription(() => {
    let prev: string[] | null = null;
    return observable<string[]>((emit) => {
      const onIsTypingUpdate = () => {
        const newData = Object.keys(currentlyTyping);

        if (!prev || prev.toString() !== newData.toString()) {
          emit.next(newData);
        }
        prev = newData;
      };
      ee.on('isTypingUpdate', onIsTypingUpdate);
      return () => {
        ee.off('isTypingUpdate');
      };
    });
  }),
});
