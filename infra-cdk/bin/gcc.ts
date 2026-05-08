#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { ComputeStack } from '../lib/compute-stack';
import { AiStack } from '../lib/ai-stack';
import { EdgeStack } from '../lib/edge-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2',
};

const projectPrefix = 'ontology-gcc-dev';
const tags = { Project: 'ontology-gcc', Env: 'dev', ManagedBy: 'cdk' };

const retailVpcId = process.env.RETAIL_VPC_ID;
const retailAzs = (process.env.RETAIL_VPC_AZS ?? '').split(',').filter(Boolean);
const retailPublicSubnets = (process.env.RETAIL_PUBLIC_SUBNET_IDS ?? '').split(',').filter(Boolean);
const retailPrivateSubnets = (process.env.RETAIL_PRIVATE_SUBNET_IDS ?? '').split(',').filter(Boolean);
const retailIsolatedSubnets = (process.env.RETAIL_ISOLATED_SUBNET_IDS ?? '').split(',').filter(Boolean);

if (!retailVpcId) {
  throw new Error('RETAIL_VPC_ID env var is required (see .env.example).');
}

const network = new NetworkStack(app, `${projectPrefix}-network`, {
  env, tags,
  retailVpc: {
    vpcId: retailVpcId,
    availabilityZones: retailAzs,
    publicSubnetIds: retailPublicSubnets,
    privateSubnetIds: retailPrivateSubnets,
    isolatedSubnetIds: retailIsolatedSubnets,
  },
});

const data = new DataStack(app, `${projectPrefix}-data`, {
  env, tags,
  vpc: network.vpc,
  appSg: network.appSg,
  neptuneSg: network.neptuneSg,
  osSg: network.osSg,
});

const ai = new AiStack(app, `${projectPrefix}-ai`, {
  env, tags,
  rawDocsBucket: data.rawDocsBucket,
});

const compute = new ComputeStack(app, `${projectPrefix}-compute`, {
  env, tags,
  vpc: network.vpc,
  appSg: network.appSg,
  albSg: network.albSg,
  neptuneEndpoint: data.neptuneEndpoint,
  openSearchEndpoint: data.openSearchEndpoint,
  rawDocsBucket: data.rawDocsBucket,
  uploadsBucket: data.uploadsBucket,
  syntheticDataBucket: data.syntheticDataBucket,
  bedrockKbId: ai.kbId,
  bedrockGuardrailId: ai.guardrailId,
  agentCoreMemoryId: ai.memoryId,
});

const edge = new EdgeStack(app, `${projectPrefix}-edge`, {
  env: { ...env, region: 'us-east-1' },
  tags,
  alb: compute.alb,
  domainName: app.node.tryGetContext('domain') as string | undefined,
});

new ObservabilityStack(app, `${projectPrefix}-observability`, {
  env, tags,
  apiServiceArn: compute.apiServiceArn,
  webServiceArn: compute.webServiceArn,
  neptuneClusterId: data.neptuneClusterId,
});

app.synth();
