import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { chunkText, generateEmbedding } from '../lib/rag/memory-service';
import { PLAN_TIER_LIMITS } from '../lib/billing/stripe-service';

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

  test('Billing Entitlements: plan tier limits structure', () => {
    assert.equal(PLAN_TIER_LIMITS.free.maxAgents, 1, 'Free tier permits 1 agent');
    assert.equal(PLAN_TIER_LIMITS.starter.maxAgents, 3, 'Starter tier permits 3 agents');
    assert.equal(PLAN_TIER_LIMITS.pro.maxAgents, 10, 'Pro tier permits 10 agents');
    assert.equal(PLAN_TIER_LIMITS.enterprise.maxAgents, 100, 'Enterprise tier permits 100 agents');
  });
});
