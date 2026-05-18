import * as cdk from 'aws-cdk-lib';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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

    // ── ACM ────────────────────────────────────────────────────────
    // Wildcard *.whchoi.net cert 가 이미 발급 (ISSUED) — DNS validation 우회.
    // *.whchoi.net 이 gcc.whchoi.net 을 cover. 별도 cert 발급 불필요.
    let cert: acm.ICertificate | undefined;
    if (props.domainName) {
      cert = acm.Certificate.fromCertificateArn(
        this,
        'Cert',
        'arn:aws:acm:us-east-1:061525506239:certificate/7d53182a-2a2a-4225-a319-4f94030561b7',
      );
    }

    // ── Lambda@Edge auth function (Plan 5 Task 5.5.1) ─────────────
    // RS256 Cognito JWT verification with JWKS TTL caching.
    // ADR-0018 — Lambda@Edge env var 미지원 우회: synth time 에 .env 의
    // COGNITO_USER_POOL_ID 값을 source 에 string replace 후 임시 디렉토리에
    // write → fromAsset 으로 deploy. 첫 deploy 는 ID empty (DEMO 모드 의존),
    // user pool 생성 후 .env 채우고 재배포 시 정상 인증.
    const userPoolId = process.env.COGNITO_USER_POOL_ID || '';
    const cognitoRegion = process.env.AWS_REGION || 'ap-northeast-2';

    const lambdaSrc = fs.readFileSync(
      path.join(__dirname, '..', 'lambda-edge-auth', 'index.js'),
      'utf-8',
    )
      .replace(
        "const USER_POOL_ID = process.env.USER_POOL_ID || '';",
        `const USER_POOL_ID = ${JSON.stringify(userPoolId)};`,
      )
      .replace(
        "const COGNITO_REGION = process.env.COGNITO_REGION || 'ap-northeast-2';",
        `const COGNITO_REGION = ${JSON.stringify(cognitoRegion)};`,
      );

    const lambdaTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-edge-auth-'));
    fs.writeFileSync(path.join(lambdaTmpDir, 'index.js'), lambdaSrc);

    const authFn = new cf.experimental.EdgeFunction(this, 'AuthEdge', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(lambdaTmpDir),
    });

    // ── CloudFront ────────────────────────────────────────────────
    // CF → Public ALB (with Prefix List SG): ALB 는 internetFacing 이지만 SG
    // 에서 CloudFront managed prefix list 만 ingress 허용 → 외부 직접 접근 불가.
    // 추가로 X-Origin-Auth-Token (Secrets Manager 발급) 을 모든 origin request
    // 에 첨부 — ALB target group 에서 token 검증.
    this.distribution = new cf.Distribution(this, 'Dist', {
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(props.alb, {
          protocolPolicy: cf.OriginProtocolPolicy.HTTP_ONLY,
          httpPort: 80,
        }),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // POST/PUT/DELETE/OPTIONS/PATCH 허용 — 14 시나리오 API가 POST 사용.
        // 브라우저가 호출하는 fetch가 CloudFront 403을 받지 않도록 명시.
        allowedMethods: cf.AllowedMethods.ALLOW_ALL,
        cachePolicy: cf.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
        edgeLambdas: [
          {
            functionVersion: authFn.currentVersion,
            eventType: cf.LambdaEdgeEventType.VIEWER_REQUEST,
          },
        ],
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
