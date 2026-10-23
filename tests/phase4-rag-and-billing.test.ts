import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { chunkText, generateEmbedding } from '../lib/rag/memory-service';

describe('Phase 4 RAG Ingestion & Billing Entitlements Verification', () => {
  test('RAG Chunking: splits document text into overlapping chunks', () => {
    const text = 'A'.repeat(1200);
    const chunks = chunkText(text, 500, 50);

    assert.ok(chunks.length >= 3, 'Document of 1200 chars must be split into at least 3 chunks');
    assert.equal(chunks[0].length, 500, 'First chunk size must be 500 chars');
  });

  test('RAG Embedding: generates valid 1536-dimensional vector', async () => {
    const embedding = await generateEmbedding('Context Control platform query', 'demo_key');

    assert.equal(embedding.length, 1536, 'Vector dimension must be 1536 for RAG compatibility');
    assert.ok(typeof embedding[0] === 'number', 'Vector elements must be numbers');
  });
});
