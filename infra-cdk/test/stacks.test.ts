import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { ComputeStack } from '../lib/compute-stack';
import { AiStack } from '../lib/ai-stack';
import { EdgeStack } from '../lib/edge-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const env = { account: '111122223333', region: 'ap-northeast-2' };
const retailVpc = {
  vpcId: 'vpc-fake',
  availabilityZones: ['ap-northeast-2a', 'ap-northeast-2b'],
  publicSubnetIds:    ['subnet-pub1','subnet-pub2'],
  privateSubnetIds:   ['subnet-pri1','subnet-pri2'],
  isolatedSubnetIds:  ['subnet-iso1','subnet-iso2'],
};

function buildApp() {
  const app = new cdk.App();
  const network = new NetworkStack(app, 't-network', { env, retailVpc });
  const data = new DataStack(app, 't-data', { env,
    vpc: network.vpc, appSg: network.appSg, neptuneSg: network.neptuneSg, osSg: network.osSg });
  const ai = new AiStack(app, 't-ai', { env, rawDocsBucket: data.rawDocsBucket });
  const compute = new ComputeStack(app, 't-compute', {
    env, crossRegionReferences: true,
    vpc: network.vpc, appSg: network.appSg, albSg: network.albSg,
    neptuneEndpoint: data.neptuneEndpoint, openSearchEndpoint: data.openSearchEndpoint,
    rawDocsBucket: data.rawDocsBucket, uploadsBucket: data.uploadsBucket,
    syntheticDataBucket: data.syntheticDataBucket,
    bedrockKbId: ai.kbId, bedrockGuardrailId: ai.guardrailId, agentCoreMemoryId: ai.memoryId });
  const edge = new EdgeStack(app, 't-edge', {
    env: { ...env, region: 'us-east-1' }, crossRegionReferences: true,
    alb: compute.alb });
  const obs = new ObservabilityStack(app, 't-obs', { env,
    apiServiceArn: compute.apiServiceArn, webServiceArn: compute.webServiceArn,
    neptuneClusterId: data.neptuneClusterId });
  return { network, data, ai, compute, edge, obs };
}

describe('GCC stacks snapshot', () => {
  test.each([
    ['network'], ['data'], ['ai'], ['compute'], ['edge'], ['obs'],
  ])('%s stack matches snapshot', (name) => {
    const stacks = buildApp();
    const stack = (stacks as any)[name];
    expect(Template.fromStack(stack).toJSON()).toMatchSnapshot();
  });
});
