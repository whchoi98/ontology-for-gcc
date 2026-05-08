import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  appSg: ec2.SecurityGroup;
  albSg: ec2.SecurityGroup;
  neptuneEndpoint: string;
  openSearchEndpoint: string;
  rawDocsBucket: s3.IBucket;
  uploadsBucket: s3.IBucket;
  syntheticDataBucket: s3.IBucket;
  bedrockKbId: string;
  bedrockGuardrailId: string;
  agentCoreMemoryId: string;
}

export class ComputeStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly apiServiceArn: string;
  public readonly webServiceArn: string;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: 'ontology-gcc-dev-cluster',
      containerInsights: true,
    });

    const apiRepo = new ecr.Repository(this, 'ApiRepo', {
      repositoryName: 'ontology-gcc-dev-api',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const webRepo = new ecr.Repository(this, 'WebRepo', {
      repositoryName: 'ontology-gcc-dev-web',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const originAuthSecret = new secrets.Secret(this, 'OriginAuthSecret', {
      secretName: 'ontology-gcc-dev/origin-auth',
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('NeptuneFullAccess'));
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:Converse', 'bedrock:Retrieve',
                'bedrock:ApplyGuardrail', 'aoss:APIAccessAll'],
      resources: ['*'],
    }));
    props.rawDocsBucket.grantReadWrite(taskRole);
    props.uploadsBucket.grantReadWrite(taskRole);
    props.syntheticDataBucket.grantReadWrite(taskRole);
    originAuthSecret.grantRead(taskRole);

    // ── API task ──
    const apiTask = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      cpu: 1024, memoryLimitMiB: 2048,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskRole,
    });
    apiTask.addContainer('api', {
      image: ecs.ContainerImage.fromEcrRepository(apiRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'api',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      portMappings: [{ containerPort: 8000 }],
      environment: {
        AWS_REGION: cdk.Stack.of(this).region,
        NEPTUNE_ENDPOINT: props.neptuneEndpoint,
        OPENSEARCH_ENDPOINT: props.openSearchEndpoint,
        OPENSEARCH_INDEX: 'ontology-gcc-dev-kb-index',
        BEDROCK_CHAT_MODEL_ID: 'global.anthropic.claude-sonnet-4-6',
        BEDROCK_EMBED_MODEL_ID: 'global.cohere.embed-v4:0',
        BEDROCK_KB_ID: props.bedrockKbId,
        BEDROCK_GUARDRAIL_ID: props.bedrockGuardrailId,
        AGENTCORE_MEMORY_ID: props.agentCoreMemoryId,
        RAW_DOCS_BUCKET: props.rawDocsBucket.bucketName,
        UPLOADS_BUCKET: props.uploadsBucket.bucketName,
        SYNTHETIC_DATA_BUCKET: props.syntheticDataBucket.bucketName,
        ONTOLOGY_ENV: 'dev',
        DEMO_PUBLIC_MODE: 'false',
      },
      secrets: { ORIGIN_AUTH_TOKEN: ecs.Secret.fromSecretsManager(originAuthSecret) },
    });

    // ── Web task ──
    const webTask = new ecs.FargateTaskDefinition(this, 'WebTask', {
      cpu: 512, memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    webTask.addContainer('web', {
      image: ecs.ContainerImage.fromEcrRepository(webRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'web',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      portMappings: [{ containerPort: 3000 }],
      environment: {
        NEXT_PUBLIC_API_BASE: '/api',
      },
    });

    const apiService = new ecs.FargateService(this, 'ApiService', {
      cluster,
      serviceName: 'ontology-gcc-dev-api',
      taskDefinition: apiTask,
      desiredCount: 0, // Plan 1 Task 1.10 — restore to 2 after Task 1.11 image push
      securityGroups: [props.appSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });
    const webService = new ecs.FargateService(this, 'WebService', {
      cluster,
      serviceName: 'ontology-gcc-dev-web',
      taskDefinition: webTask,
      desiredCount: 0, // Plan 1 Task 1.10 — restore to 2 after Task 1.11 image push
      securityGroups: [props.appSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    const listener = this.alb.addListener('Http', { port: 80, open: false });

    listener.addTargets('ApiTargets', {
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [apiService],
      healthCheck: { path: '/healthz', healthyHttpCodes: '200' },
      conditions: [elbv2.ListenerCondition.pathPatterns(['/api/*', '/healthz'])],
      priority: 10,
    });
    listener.addTargets('WebTargets', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [webService],
      healthCheck: { path: '/', healthyHttpCodes: '200,307' },
    });

    this.apiServiceArn = apiService.serviceArn;
    this.webServiceArn = webService.serviceArn;

    new cdk.CfnOutput(this, 'AlbDnsName', { value: this.alb.loadBalancerDnsName });
  }
}
