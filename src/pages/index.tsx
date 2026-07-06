import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const projects = [
  {
    title: 'Kernel',
    description: '规范驱动的微服务基础框架 — proto contract → codegen → 治理 → 业务',
    link: '/docs/kernel/intro',
  },
  {
    title: 'IAM',
    description: '身份认证、目录查询和权限关系服务，基于 Casdoor + SpiceDB',
    link: '/docs/iam/intro',
  },
  {
    title: 'Hub',
    description: 'AIHub 业务服务：技能目录、版本管理、包存储、草稿工作区',
    link: '/docs/hub/intro',
  },
  {
    title: 'Gateway',
    description: '边界网关，路由分发 + 边界准入，契约驱动的 route registry',
    link: '/docs/gateway/intro',
  },
  {
    title: 'Git Server',
    description: 'Kernel 体系下的 Git 服务，支持技能版本化存储',
    link: '/docs/git-server/intro',
  },
  {
    title: 'Guides',
    description: '本地开发、部署运维、最佳实践和架构设计文档',
    link: '/docs/guides/intro',
  },
];

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/kernel/intro">
            Get Started 🚀
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Aisphere - AI-Native Service Infrastructure">
      <HomepageHeader />
      <main>
        <div className="container">
          <div className="features-container">
            {projects.map((project) => (
              <Link key={project.title} to={project.link} className="feature-card">
                <Heading as="h3">{project.title}</Heading>
                <p>{project.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </Layout>
  );
}

function useSiteConfig() {
  return useDocusaurusContext();
}