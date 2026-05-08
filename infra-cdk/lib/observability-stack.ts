import * as cdk from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export interface ObservabilityStackProps extends cdk.StackProps {
  apiServiceArn: string;
  webServiceArn: string;
  neptuneClusterId: string;
}

export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const dashboard = new cw.Dashboard(this, 'Dashboard', {
      dashboardName: 'ontology-gcc-dev',
    });

    dashboard.addWidgets(
      new cw.GraphWidget({
        title: 'ECS API CPU/Memory',
        left: [
          new cw.Metric({ namespace: 'AWS/ECS', metricName: 'CPUUtilization',
            dimensionsMap: { ServiceName: 'ontology-gcc-dev-api', ClusterName: 'ontology-gcc-dev-cluster' } }),
          new cw.Metric({ namespace: 'AWS/ECS', metricName: 'MemoryUtilization',
            dimensionsMap: { ServiceName: 'ontology-gcc-dev-api', ClusterName: 'ontology-gcc-dev-cluster' } }),
        ],
      }),
      new cw.GraphWidget({
        title: 'Neptune CPU/Connections',
        left: [
          new cw.Metric({ namespace: 'AWS/Neptune', metricName: 'CPUUtilization',
            dimensionsMap: { DBClusterIdentifier: props.neptuneClusterId } }),
          new cw.Metric({ namespace: 'AWS/Neptune', metricName: 'TotalRequestsPerSec',
            dimensionsMap: { DBClusterIdentifier: props.neptuneClusterId } }),
        ],
      }),
    );

    new cw.Alarm(this, 'ApiHighCpu', {
      alarmName: 'gcc-api-high-cpu',
      metric: new cw.Metric({
        namespace: 'AWS/ECS', metricName: 'CPUUtilization',
        dimensionsMap: { ServiceName: 'ontology-gcc-dev-api', ClusterName: 'ontology-gcc-dev-cluster' },
        period: cdk.Duration.minutes(5),
      }),
      threshold: 85,
      evaluationPeriods: 3,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
  }
}
