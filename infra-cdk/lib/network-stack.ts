import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkStackProps extends cdk.StackProps {
  retailVpc: {
    vpcId: string;
    availabilityZones: string[];
    publicSubnetIds: string[];
    privateSubnetIds: string[];
    isolatedSubnetIds: string[];
  };
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly appSg: ec2.SecurityGroup;
  public readonly neptuneSg: ec2.SecurityGroup;
  public readonly osSg: ec2.SecurityGroup;
  public readonly albSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { retailVpc } = props;

    this.vpc = ec2.Vpc.fromVpcAttributes(this, 'RetailVpc', {
      vpcId: retailVpc.vpcId,
      availabilityZones: retailVpc.availabilityZones,
      publicSubnetIds: retailVpc.publicSubnetIds,
      privateSubnetIds: retailVpc.privateSubnetIds,
      isolatedSubnetIds: retailVpc.isolatedSubnetIds,
    });

    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-alb-sg',
      description: 'GCC ALB — ingress from CloudFront prefix list only',
      allowAllOutbound: true,
    });

    const cfPrefixList = ec2.PrefixList.fromLookup(this, 'CloudFrontPrefixList', {
      prefixListName: 'com.amazonaws.global.cloudfront.origin-facing',
    });
    this.albSg.addIngressRule(
      ec2.Peer.prefixList(cfPrefixList.prefixListId),
      ec2.Port.tcp(80),
      'CloudFront origins',
    );

    this.appSg = new ec2.SecurityGroup(this, 'AppSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-app-sg',
      description: 'GCC ECS tasks (api+web)',
      allowAllOutbound: true,
    });
    this.appSg.addIngressRule(this.albSg, ec2.Port.tcp(8000), 'ALB → api');
    this.appSg.addIngressRule(this.albSg, ec2.Port.tcp(3000), 'ALB → web');

    this.neptuneSg = new ec2.SecurityGroup(this, 'NeptuneSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-neptune-sg',
      description: 'GCC Neptune — ingress from gcc-app-sg only',
      allowAllOutbound: false,
    });
    this.neptuneSg.addIngressRule(this.appSg, ec2.Port.tcp(8182), 'GCC api → Neptune');

    this.osSg = new ec2.SecurityGroup(this, 'OsSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-os-sg',
      description: 'GCC OpenSearch Serverless VPC endpoint',
      allowAllOutbound: false,
    });
    this.osSg.addIngressRule(this.appSg, ec2.Port.tcp(443), 'GCC api → OS');

    new cdk.CfnOutput(this, 'GccAppSgId', { value: this.appSg.securityGroupId });
    new cdk.CfnOutput(this, 'GccNeptuneSgId', { value: this.neptuneSg.securityGroupId });
  }
}
