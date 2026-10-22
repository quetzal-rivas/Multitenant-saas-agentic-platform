import * as path from 'node:path';
import { CfnOutput, CfnParameter, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';

export interface ContextControlStackProps extends StackProps {
  stage: 'staging' | 'production';
  /** owner/name of the GitHub repository whose workflow deploys this stack. */
  githubRepository: string;
  /** Its numeric id: GitHub's immutable OIDC subject is repo:<owner>@<id>/<name>@<repoId>:… */
  githubRepositoryId: string;
  /** GitHub Actions environment allowed to assume the deploy role. */
  githubEnvironment: string;
  alertEmail: string;
}

/** Repository root (this file is infra/cdk/lib/). */
const ROOT = path.resolve(import.meta.dirname, '../../..');

/** Names the application code and the deploy workflow refer to; keep them stable. */
const NAMES = {
  worker: 'cc-agent-worker',
  deployer: 'cc-function-deployer',
  computeRole: 'ContextControlAmplifyComputeRole',
  workerRole: 'ContextControlAgentWorkerRole',
  execRole: 'ContextControlFunctionExecRole',
  deployerRole: 'ContextControlFunctionDeployerRole',
  deployRole: 'ContextControlGitHubDeployRole',
};

/**
 * Everything Context Control runs on in one AWS account, except the Amplify app itself
 * (connected to GitHub once in the console; the deploy workflow sets its variables and
 * starts its builds):
 *  - KMS key for tenant secrets (envelope encryption)
 *  - Amplify compute role (what the web app may do)
 *  - cc-agent-worker (agent runs) and cc-function-deployer (AI Function Studio) Lambdas
 *  - the logs-only role tenant functions (ccfn-*) run as
 *  - voice media bucket (spoken-audio cache, inbound call recordings)
 *  - GitHub OIDC deploy role (no stored AWS keys)
 *  - alarms emailed to alertEmail
 *
 * Secrets reach the Lambdas as NoEcho parameters, so they are not stored in the template.
 */
export class ContextControlStack extends Stack {
  constructor(scope: Construct, id: string, props: ContextControlStackProps) {
    super(scope, id, props);
    const { account, region } = this;
    const retain = RemovalPolicy.RETAIN;

    // Runtime configuration passed by the deploy workflow (empty until the first pipeline run).
    const param = (name: string, description: string, noEcho = false) =>
      new CfnParameter(this, name, { type: 'String', default: '', noEcho, description }).valueAsString;
    const supabaseUrl = param('SupabaseUrl', 'NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = param('SupabaseAnonKey', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = param('SupabaseServiceRoleKey', 'SUPABASE_SERVICE_ROLE_KEY', true);
    const googleClientId = param('GoogleOAuthClientId', 'GOOGLE_OAUTH_CLIENT_ID');
    const googleClientSecret = param('GoogleOAuthClientSecret', 'GOOGLE_OAUTH_CLIENT_SECRET', true);

    // --- Tenant secrets key -------------------------------------------------------------
    const key = new kms.Key(this, 'TenantSecretsKey', {
      alias: 'alias/context-control-tenant-secrets',
      description: 'Context Control multi-tenant secrets envelope encryption key',
      enableKeyRotation: true,
      removalPolicy: retain,
    });

    // --- Voice media bucket ---------------------------------------------------------------
    const voiceBucket = new s3.Bucket(this, 'VoiceMediaBucket', {
      bucketName: `cc-voice-cache-${account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      bucketKeyEnabled: true,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: retain,
      lifecycleRules: [
        { id: 'expire-tts-clips', prefix: 'tts/', expiration: Duration.days(90), abortIncompleteMultipartUploadAfter: Duration.days(1) },
        { id: 'expire-inbound-media', prefix: 'inbound/', expiration: Duration.days(365), abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
    });

    // --- Roles ------------------------------------------------------------------------------
    const lambdaPrincipal = new iam.ServicePrincipal('lambda.amazonaws.com');
    const basicExecution = iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole');
    const tenantFunctionsArn = `arn:aws:lambda:${region}:${account}:function:ccfn-*`;
    const workerArn = `arn:aws:lambda:${region}:${account}:function:${NAMES.worker}`;
    const deployerArn = `arn:aws:lambda:${region}:${account}:function:${NAMES.deployer}`;

    const execRole = new iam.Role(this, 'FunctionExecRole', {
      roleName: NAMES.execRole,
      description: 'Execution role for Context Control tenant functions: CloudWatch Logs only',
      assumedBy: lambdaPrincipal,
      managedPolicies: [basicExecution],
    });

    const deployerRole = new iam.Role(this, 'FunctionDeployerRole', {
      roleName: NAMES.deployerRole,
      description: 'Creates Context Control tenant functions (ccfn-*) with the logs-only execution role',
      assumedBy: lambdaPrincipal,
      managedPolicies: [basicExecution],
      inlinePolicies: {
        'create-tenant-functions': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({ actions: ['lambda:CreateFunction', 'lambda:TagResource'], resources: [tenantFunctionsArn] }),
            new iam.PolicyStatement({
              actions: ['iam:PassRole'],
              resources: [execRole.roleArn],
              conditions: { StringEquals: { 'iam:PassedToService': 'lambda.amazonaws.com' } },
            }),
          ],
        }),
      },
    });

    const workerRole = new iam.Role(this, 'AgentWorkerRole', {
      roleName: NAMES.workerRole,
      description: 'Runs Context Control agent turns',
      assumedBy: lambdaPrincipal,
      managedPolicies: [basicExecution],
      inlinePolicies: {
        'agent-worker': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({ actions: ['kms:Decrypt', 'kms:GenerateDataKey'], resources: [key.keyArn] }),
            new iam.PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [tenantFunctionsArn, workerArn] }),
          ],
        }),
      },
    });

    const computeRole = new iam.Role(this, 'AmplifyComputeRole', {
      roleName: NAMES.computeRole,
      description: 'What the Context Control web app (Amplify SSR) may do',
      assumedBy: new iam.PrincipalWithConditions(new iam.ServicePrincipal('amplify.amazonaws.com'), {
        StringEquals: { 'aws:SourceAccount': account },
      }),
      inlinePolicies: {
        'kms-tenant-secrets': new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({ actions: ['kms:GenerateDataKey', 'kms:Decrypt'], resources: [key.keyArn] })],
        }),
        'agent-worker': new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [workerArn] })],
        }),
        'tenant-functions': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'lambda:UpdateFunctionCode',
                'lambda:UpdateFunctionConfiguration',
                'lambda:InvokeFunction',
                'lambda:GetFunction',
                'lambda:GetFunctionConfiguration',
                'lambda:DeleteFunction',
              ],
              resources: [tenantFunctionsArn],
            }),
            new iam.PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [deployerArn] }),
          ],
        }),
        'voice-audio-cache': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({ actions: ['s3:GetObject', 's3:PutObject'], resources: [voiceBucket.arnForObjects('tts/*'), voiceBucket.arnForObjects('inbound/*')] }),
            new iam.PolicyStatement({
              actions: ['s3:ListBucket'],
              resources: [voiceBucket.bucketArn],
              conditions: { StringLike: { 's3:prefix': ['tts/*', 'inbound/*'] } },
            }),
          ],
        }),
      },
    });

    // --- Lambdas ----------------------------------------------------------------------------
    const worker = new lambda.Function(this, 'AgentWorker', {
      functionName: NAMES.worker,
      description: 'Context Control agent runs (auto-continued every 15 minutes)',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      // Built by `node scripts/build-agent-worker.mjs` before synth.
      code: lambda.Code.fromAsset(path.join(ROOT, 'dist/agent-worker')),
      role: workerRole,
      timeout: Duration.minutes(15),
      memorySize: 512,
      // Failed async invocations are recovered by the minute tick; Lambda must not replay them.
      retryAttempts: 0,
      logGroup: new logs.LogGroup(this, 'AgentWorkerLogs', { logGroupName: `/aws/lambda/${NAMES.worker}`, retention: logs.RetentionDays.ONE_MONTH, removalPolicy: retain }),
      environment: {
        NODE_ENV: 'production',
        AGENT_WORKER_FUNCTION: NAMES.worker,
        FUNCTION_DEPLOYER_NAME: NAMES.deployer,
        FUNCTION_EXEC_ROLE_ARN: execRole.roleArn,
        KMS_KEY_ID: key.keyArn,
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
        GOOGLE_OAUTH_CLIENT_ID: googleClientId,
        GOOGLE_OAUTH_CLIENT_SECRET: googleClientSecret,
      },
    });

    const deployer = new lambda.Function(this, 'FunctionDeployer', {
      functionName: NAMES.deployer,
      description: 'Creates AI Function Studio tenant functions (ccfn-*)',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(ROOT, 'infra/function-deployer')),
      role: deployerRole,
      timeout: Duration.seconds(30),
      memorySize: 256,
      logGroup: new logs.LogGroup(this, 'FunctionDeployerLogs', { logGroupName: `/aws/lambda/${NAMES.deployer}`, retention: logs.RetentionDays.ONE_MONTH, removalPolicy: retain }),
      environment: { EXEC_ROLE_ARN: execRole.roleArn },
    });

    // --- GitHub Actions deploy role (OIDC) ---------------------------------------------------
    const github = new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });
    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: NAMES.deployRole,
      description: `Deploys Context Control ${props.stage} from GitHub Actions (${props.githubEnvironment} environment only)`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(github.openIdConnectProviderArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        // The repository id is pinned, so the owner part may change (e.g. a transfer to an organization).
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            `repo:*/${props.githubRepository.split('/')[1]}@${props.githubRepositoryId}:environment:${props.githubEnvironment}`,
            `repo:${props.githubRepository}:environment:${props.githubEnvironment}`,
          ],
        },
      }),
      inlinePolicies: {
        deploy: new iam.PolicyDocument({
          statements: [
            // cdk deploy works through the bootstrap roles.
            new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: [`arn:aws:iam::${account}:role/cdk-*`] }),
            // The workflow syncs the Amplify app's variables and starts its builds.
            new iam.PolicyStatement({
              actions: ['amplify:GetApp', 'amplify:ListApps', 'amplify:UpdateApp', 'amplify:StartJob', 'amplify:StopJob', 'amplify:GetJob', 'amplify:ListJobs', 'amplify:GetBranch', 'amplify:UpdateBranch'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // --- Alarms --------------------------------------------------------------------------------
    const alerts = new sns.Topic(this, 'Alerts', { displayName: `Context Control ${props.stage} alerts` });
    alerts.addSubscription(new subs.EmailSubscription(props.alertEmail));
    const alarm = (id: string, metric: cloudwatch.IMetric, threshold: number, description: string) =>
      new cloudwatch.Alarm(this, id, {
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: description,
      }).addAlarmAction(new cwActions.SnsAction(alerts));
    alarm('WorkerErrors', worker.metricErrors({ period: Duration.minutes(5) }), 3, 'Agent worker failed 3+ times in 5 minutes');
    alarm('WorkerThrottles', worker.metricThrottles({ period: Duration.minutes(5) }), 1, 'Agent worker was throttled');
    alarm('DeployerErrors', deployer.metricErrors({ period: Duration.minutes(5) }), 1, 'AI Function Studio could not create a function');

    new CfnOutput(this, 'AmplifyComputeRoleArn', { value: computeRole.roleArn });
    new CfnOutput(this, 'KmsKeyArn', { value: key.keyArn });
    new CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
    new CfnOutput(this, 'VoiceBucket', { value: voiceBucket.bucketName });
    new CfnOutput(this, 'FunctionExecRoleArn', { value: execRole.roleArn });
  }
}
