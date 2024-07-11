# Bumble Investors Q&A Portal with RAG

Sample application http://3.128.37.107:3000/

Local Portal URL - http://localhost:3000/

Local ChromaDB URL - http://localhost:8000/

## Features

- 🧙 E2E type safety with [tRPC](https://trpc.io)
- ⚡ Full-stack React with Next.js
- ⚙️ Retrieval-Augmented Generation powered by ChatGPT
- ⚡ Supports Multiple Document Uploads and Formats (PDF, DOCX, TXT)
- ✅ Shows Document Upload Status and Uploaded Documents 
- ⚡ User Database with Prisma
- 🔐 Authorization using [next-auth](https://next-auth.js.org/)
- 🎨 ESLint + Prettier

## Demo

![BUMBLE DEMO](Bumble.gif)

#### Full Demo here with code explanation on [Youtube](https://youtu.be/jBMlayiUklU)

## History/Work Diary

- I started off with base tRPC app provided with setup for cross user chat board. I modified it the chat page to interact with ChatGPT by adding new router procedures and that was my iteration 1.
- Next, I introduced document upload feature and saved it under a local dir which was fairly simple to do.
- For 3rd iteration, I wanted to implement RAG and I read articles on Chunking and Embeddings. I chose ChromaDB since I found the documentation easy to work with. I divided up uploaded document in smaller chunks of size 2000 in my post router by embeddings failed to generate. On further deep dive, I finally figured that documents with heavy graphical content would produce higher tokens for smaller chunks as small as 40. To tackle this, I extracted text information from the documents and successfully created embeddings of each chunk. I saved the embeddings in a collection on my ChromaDB docker. Chunk size is 300. Lastly, I created embedding of my prompt as well and am sending the top 3 chunks and prompt to chatgpt for answer.  

## Setup

###### WARNING: ChromaDB docker slows machine down extremely.
Run ChromaDB Docker:
```bash
docker pull chromadb/chroma
docker run -d -p 8000:8000 chromadb/chroma
```

First time application run:-
```bash
cd prosights
pnpm i
pnpm dx
```
###### Some libraries may be missing. Use "sudo pnpm add ____"
Reruns:-
```bash
pnpm dev
```

## Commands

```bash
pnpm build      # runs `prisma generate` + `prisma migrate` + `next build`
pnpm db-nuke    # resets local db
pnpm dev        # starts next.js + WebSocket server
pnpm dx         # starts postgres db + runs migrations + seeds + starts next.js
sudo pnpm add mammoth pdf-parse openai chromadb
```

---

Created by [@gtoravan](https://github.com/gtoravan)

tRPC Base Template by [@alexdotjs](https://twitter.com/alexdotjs). Thanks!
