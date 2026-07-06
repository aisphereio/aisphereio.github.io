import type {ReactNode} from 'react';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  icon: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Proto-First 开发',
    icon: '📋',
    description: (
      <>
        业务声明 proto contract，Kernel 自动生成 HTTP/gRPC 绑定、访问控制、Gateway 路由和治理代码。
      </>
    ),
  },
  {
    title: '统一治理',
    icon: '🛡️',
    description: (
      <>
        认证、授权、审计、限流、熔断、重试 — 所有横切关注点由框架统一提供，业务只写领域逻辑。
      </>
    ),
  },
  {
    title: '多云就绪',
    icon: '☁️',
    description: (
      <>
        配置、注册、存储、缓存均支持多 provider，可在本地、K8s 和混合云环境间无缝切换。
      </>
    ),
  },
];

function Feature({title, icon, description}: FeatureItem) {
  return (
    <div className={styles.featureCard}>
      <div className={styles.featureIcon}>{icon}</div>
      <Heading as="h3">{title}</Heading>
      <p>{description}</p>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className={styles.featureGrid}>
          {FeatureList.map((props, idx) => (
            <FeatureComponent key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}