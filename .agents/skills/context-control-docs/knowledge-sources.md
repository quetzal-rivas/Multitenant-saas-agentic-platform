Source: app/docs/page.tsx (route: /docs?section=knowledge-sources)

Context & Knowledge Engine · Section 07
# Knowledge Base Ingestion & pgvector RAG
Index documents, website URLs, and memory fragments into Supabase `pgvector` for semantic search retrieval.
UI Screenshot Preview
### 1. Overview & Strategic Purpose
The **Knowledge Base Ingestion & RAG Engine** equips agents with enterprise-wide long-term memory and factual knowledge retrieval. By integrating a high-performance Retrieval-Augmented Generation (RAG) pipeline backed by Supabase `pgvector`, the platform allows agents to dynamically search, retrieve, and synthesize factual document fragments in real-time.
### 2. Key Capabilities & Architecture
* **Multi-Source Document Ingestion Pipeline:** Supports file uploads (PDF, TXT, Markdown) and automated URL Web Crawlers to scrape and extract clean markdown from target websites.
* **Automated Text Chunking & Overlap Strategy:** Documents pass through a text chunking engine that splits large texts into optimized passages (500 tokens per chunk with a 50-token sliding window overlap) to preserve context continuity.
* **Supabase pgvector Embedding Store:** Chunks are transformed into 1536-dimensional vector embeddings using models like OpenAI `text-embedding-3-small`. Embeddings are indexed using HNSW / IVFFlat cosine similarity indexes in `public.memory_store`.
* **Hardware-Level Tenant RLS Security:** Vector similarity queries enforce strict PostgreSQL Row-Level Security (RLS). Cross-tenant data leaks are physically impossible at the database engine level because queries evaluate `tenant_id = current_setting('app.current_tenant_id')`.
### 3. Step-by-Step UI How-To-Use Guide
* Select **Sources** from the workspace sidebar menu.
* Click **Ingest New Source** and choose either **File Upload** or **URL Web Crawler**.
* Enter the target website URLs or drop your PDF files into the dropzone.
* Select the target **Knowledge Category** (e.g. *Legal & Compliance*) and click **Process & Embed**.
* To test vector retrieval, click the **Semantic Search Sandbox** tab. Type a query string (e.g., *"What is our refund policy?"*), set the Similarity Threshold slider, and click **Run Vector Search** to inspect matching chunks.