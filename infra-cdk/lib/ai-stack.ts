import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface AiStackProps extends cdk.StackProps {
  rawDocsBucket: s3.IBucket;
}

export class AiStack extends cdk.Stack {
  public readonly kbId: string;
  public readonly guardrailId: string;
  public readonly memoryId: string;

  constructor(scope: Construct, id: string, props: AiStackProps) {
    super(scope, id, props);

    // ── Bedrock Guardrails ─────────────────────────────────────────
    const guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', {
      name: 'ontology-gcc-dev-guardrail',
      blockedInputMessaging: '입력에 차단된 콘텐츠가 포함되어 있습니다.',
      blockedOutputsMessaging: '출력에 차단된 콘텐츠가 포함되어 있습니다.',
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'SEXUAL',     inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE',   inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'HATE',       inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS',    inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'PHONE',           action: 'ANONYMIZE' },
          { type: 'EMAIL',           action: 'ANONYMIZE' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
        ],
      },
    });
    this.guardrailId = guardrail.attrGuardrailId;

    // ── Bedrock Knowledge Base (placeholder — actual ingestion in Plan 5) ──
    const kbRole = new iam.Role(this, 'KbRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });
    props.rawDocsBucket.grantRead(kbRole);
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // KB itself is created via custom resource or manually if Bedrock CFN gaps;
    // for now expose a placeholder ID (overwritten when KB is provisioned).
    this.kbId = 'PLACEHOLDER-KB-ID';   // Plan 5 polish: replace with real KB after KB provisioning

    // ── AgentCore Memory (custom resource — same pattern as retail ADR 0001) ──
    // Plan 1에서는 placeholder string으로 두고, 실제 생성은 retail의 패턴 그대로
    // (AwsCustomResource로 createMemory 호출) 후 Outputs로 주입.
    this.memoryId = 'pending-agentcore-memory-id';

    new cdk.CfnOutput(this, 'GuardrailId', { value: this.guardrailId });
    new cdk.CfnOutput(this, 'KbIdRef',     { value: this.kbId });
  }
}
