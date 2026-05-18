# ADR 0017 — Lambda@Edge synth-time string replace + DEMO bypass

- Status: Accepted
- Date: 2026-05-18
- Deciders: 개발팀 (Kiro security gate high-severity 대응 + 운영 호환성)

## Context

Lambda@Edge `viewer-request` function 이 모든 CloudFront request 의 Cognito JWT 쿠키 검증.

문제 1 — **Lambda@Edge 가 runtime env var 미지원**. 일반 Lambda 는 `process.env.XXX` 가능하지만 *Lambda@Edge* 는 환경변수 전달 불가. `USER_POOL_ID` 와 `COGNITO_REGION` 을 어떻게 전달?

문제 2 — **PoC 데모 운영 호환성**. `.env` 에 `COGNITO_USER_POOL_ID=` 가 비어있으면 Lambda@Edge 가 *모든 request 를 unauthorized() 처리* → web app 의 `/auth/login` 으로 redirect → Next.js 에 그 route 없음 → 404 deadlock.

## Decision

**1) Synth-time string replace** — CDK 가 *synth 시점에* `lambda-edge-auth/index.js` source 를 읽어 *string replace* 후 임시 디렉토리에 write → `lambda.Code.fromAsset(tmpDir)` 로 deploy:

```typescript
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
```

**2) DEMO bypass** — Lambda@Edge source 의 첫 줄에 *empty USER_POOL_ID* 시 *모든 request pass-through*:

```javascript
exports.handler = async (event) => {
  const req = event.Records[0].cf.request;

  // DEMO mode: USER_POOL_ID 가 비어있으면 *모든 request 통과* (인증 비활성).
  // 운영 시 .env 의 COGNITO_USER_POOL_ID 채우고 edge stack redeploy.
  if (!USER_POOL_ID) return req;

  // Public paths bypass auth.
  if (req.uri.startsWith('/auth/') || req.uri === '/healthz') return req;

  // ... JWT 검증 로직 ...
};
```

## Consequences

- Lambda@Edge 가 *config* 값 (USER_POOL_ID, REGION) 을 *static literal* 로 갖음 — runtime overhead 0, env var fetch 불필요.
- 운영 모드 전환 = `.env` 의 `COGNITO_USER_POOL_ID` 채움 + `cdk deploy ontology-gcc-dev-edge` — *코드 변경 없이* DEMO ↔ Auth 토글.
- *동일 binary* 가 양 모드 — 별도 build pipeline 불필요.
- 단점: USER_POOL_ID 변경 시 *반드시 redeploy* (CloudFront cache 무시한 즉시 변경 불가).
- 단점: synth 시 `.env` 가 *없으면* 빈 USER_POOL_ID 로 build → DEMO 모드. *production deploy 전 .env 검증* 필수.
- 다른 환경변수가 늘면 *string replace 패턴 반복* — 변수 5개 넘으면 *JSON manifest 파일 + fromAsset* 패턴으로 리팩토.
