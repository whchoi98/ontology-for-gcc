import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as oss from 'aws-cdk-lib/aws-opensearchserverless';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface DataStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  appSg: ec2.SecurityGroup;
  neptuneSg: ec2.SecurityGroup;
  osSg: ec2.SecurityGroup;
}

export class DataStack extends cdk.Stack {
  public readonly neptuneEndpoint: string;
  public readonly neptuneClusterId: string;
  public readonly openSearchEndpoint: string;
  public readonly rawDocsBucket: s3.IBucket;
  public readonly uploadsBucket: s3.IBucket;
  public readonly syntheticDataBucket: s3.IBucket;
  public readonly bulkLoaderRoleArn: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    // ── S3 buckets ─────────────────────────────────────────────────
    const account = cdk.Stack.of(this).account;
    this.rawDocsBucket = new s3.Bucket(this, 'RawDocs', {
      bucketName: `ontology-gcc-dev-raw-docs-${account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.uploadsBucket = new s3.Bucket(this, 'Uploads', {
      bucketName: `ontology-gcc-dev-uploads-${account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.syntheticDataBucket = new s3.Bucket(this, 'Synthetic', {
      bucketName: `ontology-gcc-dev-synthetic-data-${account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Neptune Bulk Loader IAM (ADR 0003 prep) ────────────────────
    const bulkLoaderRole = new iam.Role(this, 'NeptuneBulkLoaderRole', {
      roleName: 'gcc-neptune-bulk-loader-role',
      assumedBy: new iam.ServicePrincipal('rds.amazonaws.com'),
    });
    this.syntheticDataBucket.grantRead(bulkLoaderRole);
    this.bulkLoaderRoleArn = bulkLoaderRole.roleArn;

    // ── S3 VPC endpoint: deferred to retail-side out-of-band ─────────
    // Vpc.fromVpcAttributes does not populate routeTableIds so a Gateway
    // endpoint cannot be installed from this stack. Per ADR 0003, the
    // S3 gateway endpoint will be added on retail's network stack
    // (or via direct AWS CLI / console) before Plan 2 Bulk Loader runs.
    // Until then, Neptune reaches S3 via NAT egress in private subnets.

    // ── Neptune ────────────────────────────────────────────────────
    const subnetGroup = new neptune.CfnDBSubnetGroup(this, 'NeptuneSubnetGroup', {
      dbSubnetGroupDescription: 'GCC Neptune subnets',
      subnetIds: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
      dbSubnetGroupName: 'gcc-neptune-subnets',
    });

    const cluster = new neptune.CfnDBCluster(this, 'NeptuneCluster', {
      dbClusterIdentifier: 'ontology-gcc-dev-neptune',
      engineVersion: '1.3.2.0',
      dbSubnetGroupName: subnetGroup.dbSubnetGroupName,
      vpcSecurityGroupIds: [props.neptuneSg.securityGroupId],
      iamAuthEnabled: true,
      associatedRoles: [{ roleArn: bulkLoaderRole.roleArn }],
    });
    cluster.addDependency(subnetGroup);

    new neptune.CfnDBInstance(this, 'NeptuneInstance', {
      dbInstanceClass: 'db.t4g.medium',
      dbClusterIdentifier: cluster.ref,
      dbInstanceIdentifier: 'ontology-gcc-dev-neptune-1',
    });

    this.neptuneEndpoint = cluster.attrEndpoint;
    this.neptuneClusterId = cluster.ref;

    // ── OpenSearch Serverless ──────────────────────────────────────
    const securityPolicy = new oss.CfnSecurityPolicy(this, 'OsSecurityPolicy', {
      name: 'gcc-os-encryption',
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [{ ResourceType: 'collection', Resource: ['collection/ontology-gcc-dev'] }],
        AWSOwnedKey: true,
      }),
    });

    const networkPolicy = new oss.CfnSecurityPolicy(this, 'OsNetworkPolicy', {
      name: 'gcc-os-network',
      type: 'network',
      // Plan 1: AllowFromPublic=true; access control via IAM/aoss:APIAccessAll.
      // Plan 5 polish: tighten with VPC endpoint + SourceVPCEs.
      policy: JSON.stringify([
        {
          Rules: [
            { ResourceType: 'collection', Resource: ['collection/ontology-gcc-dev'] },
            { ResourceType: 'dashboard', Resource: ['collection/ontology-gcc-dev'] },
          ],
          AllowFromPublic: true,
        },
      ]),
    });

    const collection = new oss.CfnCollection(this, 'OsCollection', {
      name: 'ontology-gcc-dev',
      type: 'VECTORSEARCH',
    });
    collection.addDependency(securityPolicy);
    collection.addDependency(networkPolicy);

    this.openSearchEndpoint = collection.attrCollectionEndpoint;

    // ── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'NeptuneEndpoint', { value: this.neptuneEndpoint });
    new cdk.CfnOutput(this, 'OpenSearchEndpoint', { value: this.openSearchEndpoint });
    new cdk.CfnOutput(this, 'BulkLoaderRoleArn', { value: this.bulkLoaderRoleArn });
    new cdk.CfnOutput(this, 'SyntheticBucketName', { value: this.syntheticDataBucket.bucketName });
  }
}
