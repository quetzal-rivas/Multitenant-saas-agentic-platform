#!/usr/bin/env node
/**
 * Context Control infrastructure: one stack per environment, each in its own AWS account
 * of the ContextControl organization. Pick the environment with `-c stage=staging|production`.
 */
import { App } from 'aws-cdk-lib';
import { ContextControlStack } from '../lib/context-control-stack.ts';

// maxConcurrentRuns must match the platform's max_concurrent_runs (Platform control workflow).
// Both environments are sized the same, so staging proves what production will run
// (Lambda concurrency: staging account 1,000, production 400).
const STAGES = {
  staging: { account: '832554215040', githubEnvironment: 'staging', maxConcurrentRuns: 50, workerReservedConcurrency: 50 },
  production: { account: '975970277865', githubEnvironment: 'production', maxConcurrentRuns: 50, workerReservedConcurrency: 50 },
} as const;

const app = new App();
const stage = app.node.tryGetContext('stage') as keyof typeof STAGES | undefined;
if (!stage || !(stage in STAGES)) {
  throw new Error(`Pass -c stage=${Object.keys(STAGES).join('|')}`);
}

new ContextControlStack(app, `ContextControl-${stage}`, {
  env: { account: STAGES[stage].account, region: 'us-east-2' },
  stage,
  githubRepository: 'quetzal-rivas/Multitenant-saas-agentic-platform',
  githubRepositoryId: '1389238528',
  githubEnvironment: STAGES[stage].githubEnvironment,
  alertEmail: 'aws@contextcontrol.com.mx',
  // Both accounts verify the domain (each with its own DKIM keys). Staging's SES stays in the
  // sandbox, so it can only email addresses at this domain (the test accounts), never customers.
  emailDomain: 'contextcontrol.com.mx',
  maxConcurrentRuns: STAGES[stage].maxConcurrentRuns,
  workerReservedConcurrency: STAGES[stage].workerReservedConcurrency,
  tags: { app: 'context-control', stage },
});
