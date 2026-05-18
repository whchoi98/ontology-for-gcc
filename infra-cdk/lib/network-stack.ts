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
  public readonly albSg: ec2.SecurityGroup;
  public readonly appSg: ec2.SecurityGroup;
  public readonly neptuneSg: ec2.SecurityGroup;
  public readonly osSg: ec2.SecurityGroup;

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

    // ── ALB SG ─────────────────────────────────────────────────────
    // Public ALB 이지만 CloudFront managed prefix list 만 ingress 허용 →
    // 외부에서 ALB DNS 직접 호출 불가. CF → ALB 경로만 활성.
    // pl-22a6434b = com.amazonaws.global.cloudfront.origin-facing (ap-northeast-2).
    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-alb-sg',
      description: 'GCC ALB - ingress only from CloudFront managed prefix list',
      allowAllOutbound: true,
    });
    // CF→ALB 는 HTTP_ONLY origin policy → 80 만 필요. 443 추가 시 prefix list
    // entry 가 60+ 라 SG rule limit (default 60) 초과 → ServiceLimitExceeded.
    this.albSg.addIngressRule(
      ec2.Peer.prefixList('pl-22a6434b'),
      ec2.Port.tcp(80),
      'CloudFront origin-facing prefix list (HTTP)',
    );

    this.appSg = new ec2.SecurityGroup(this, 'AppSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-app-sg',
      description: 'GCC ECS tasks (api+web) - ingress from gcc-alb-sg only',
      allowAllOutbound: true,
    });
    this.appSg.addIngressRule(this.albSg, ec2.Port.tcp(8000), 'GCC ALB to api');
    this.appSg.addIngressRule(this.albSg, ec2.Port.tcp(3000), 'GCC ALB to web');

    this.neptuneSg = new ec2.SecurityGroup(this, 'NeptuneSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-neptune-sg',
      description: 'GCC Neptune - ingress from gcc-app-sg only',
      allowAllOutbound: false,
    });
    this.neptuneSg.addIngressRule(this.appSg, ec2.Port.tcp(8182), 'GCC api to Neptune');

    this.osSg = new ec2.SecurityGroup(this, 'OsSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-os-sg',
      description: 'GCC OpenSearch Serverless VPC endpoint',
      allowAllOutbound: false,
    });
    this.osSg.addIngressRule(this.appSg, ec2.Port.tcp(443), 'GCC api to OS');

    new cdk.CfnOutput(this, 'GccAlbSgId', { value: this.albSg.securityGroupId });
    new cdk.CfnOutput(this, 'GccAppSgId', { value: this.appSg.securityGroupId });
    new cdk.CfnOutput(this, 'GccNeptuneSgId', { value: this.neptuneSg.securityGroupId });
  }
}
