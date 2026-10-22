#!/usr/bin/env node
/**
 * Context Control infrastructure: one stack per environment, each in its own AWS account
 * of the ContextControl organization. Pick the environment with `-c stage=staging|production`.
 */
import { App } from 'aws-cdk-lib';
import { ContextControlStack } from '../lib/context-control-stack.ts';

const STAGES = {
  staging: { account: '832554215040', githubEnvironment: 'staging' },
  production: { account: '975970277865', githubEnvironment: 'production' },
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
  tags: { app: 'context-control', stage },
});
