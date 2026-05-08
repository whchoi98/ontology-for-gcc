import * as cdk from 'aws-cdk-lib';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface EdgeStackProps extends cdk.StackProps {
  alb: elbv2.IApplicationLoadBalancer;
  domainName?: string;  // optional — first deploy without
}

export class EdgeStack extends cdk.Stack {
  public readonly distribution: cf.Distribution;
  public readonly userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    // ── ACM (only if domain provided) ──────────────────────────────
    let cert: acm.ICertificate | undefined;
    if (props.domainName) {
      cert = new acm.Certificate(this, 'Cert', {
        domainName: props.domainName,
        validation: acm.CertificateValidation.fromDns(),
      });
    }

    // ── CloudFront ────────────────────────────────────────────────
    this.distribution = new cf.Distribution(this, 'Dist', {
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(props.alb, {
          protocolPolicy: cf.OriginProtocolPolicy.HTTP_ONLY,
          customHeaders: {
            // Origin auth token 별도 secret 매핑은 Plan 5 polish에서 추가
          },
        }),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cf.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
      },
      domainNames: props.domainName ? [props.domainName] : undefined,
      certificate: cert,
      priceClass: cf.PriceClass.PRICE_CLASS_200,
    });

    // ── Cognito ───────────────────────────────────────────────────
    const cfDomain = `https://${this.distribution.distributionDomainName}`;
    const customDomain = props.domainName ? `https://${props.domainName}` : undefined;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'ontology-gcc-dev-userpool',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 8, requireDigits: true, requireLowercase: true, requireUppercase: true, requireSymbols: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      generateSecret: true,
      authFlows: { userPassword: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        callbackUrls: [
          `${cfDomain}/auth/callback`,
          ...(customDomain ? [`${customDomain}/auth/callback`] : []),
        ],
        logoutUrls: [
          cfDomain,
          ...(customDomain ? [customDomain] : []),
        ],
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID],
      },
    });

    // Lambda@Edge auth function — placeholder edge function;
    // retail의 lambda-edge-auth/는 Phase 1에선 stub 함수만 배포해 200 OK 가능하게.
    // 실제 JWT 검증은 retail 패턴 그대로 가져오되 Plan 5 polish에서 보강.

    new cdk.CfnOutput(this, 'CloudFrontDomainName', { value: this.distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
  }
}
