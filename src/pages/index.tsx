import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import BlogPostItem from '@theme/BlogPostItem';

import styles from './index.module.css';

const projects = [
  {
    title: 'Kernel',
    description: '规范驱动的微服务基础框架 — proto contract → codegen → 治理 → 业务',
    icon: '⚙️',
    link: '/docs/kernel/intro',
  },
  {
    title: 'IAM',
    description: '身份认证、目录查询和权限关系服务，基于 Casdoor + SpiceDB',
    icon: '🔐',
    link: '/docs/iam/intro',
  },
  {
    title: 'Hub',
    description: 'AIHub 业务服务：技能目录、版本管理、包存储、草稿工作区',
    icon: '🧩',
    link: '/docs/hub/intro',
  },
  {
    title: 'Gateway',
    description: '边界网关，路由分发 + 边界准入，契约驱动的 route registry',
    icon: '🌐',
    link: '/docs/gateway/intro',
  },
  {
    title: 'Git Server',
    description: 'Kernel 体系下的 Git 服务，支持技能版本化存储',
    icon: '📦',
    link: '/docs/git-server/intro',
  },
  {
    title: 'Guides',
    description: '本地开发、部署运维、最佳实践和架构设计文档',
    icon: '📚',
    link: '/docs/guides/intro',
  },
];

const stats = [
  { number: '6', label: '核心服务' },
  { number: '18+', label: '文档章节' },
  { number: '100%', label: '开源' },
  { number: 'Go', label: '技术栈' },
];

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className={styles.heroBackground}>
        <div className={styles.heroGrid} />
        <div className={styles.heroGlow} />
      </div>
      <div className="container">
        <div className={styles.heroContent}>
          <Heading as="h1" className="hero__title">
            {siteConfig.title}
          </Heading>
          <p className="hero__subtitle">{siteConfig.tagline}</p>
          <div className={styles.buttons}>
            <Link
              className={clsx('button button--secondary button--lg', styles.ctaButton)}
              to="/docs/kernel/intro">
              快速开始 🚀
            </Link>
            <Link
              className={clsx('button button--outline button--lg', styles.ctaButtonOutline)}
              to="/docs/guides/architecture">
              了解架构 →
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function FeatureCard({title, description, icon, link, index}: {
  title: string;
  description: string;
  icon: string;
  link: string;
  index: number;
}) {
  return (
    <Link
      to={link}
      className={clsx('feature-card', 'animate-fade-in-up')}
      style={{animationDelay: `${index * 0.1}s`}}>
      <div className="feature-card__icon">{icon}</div>
      <Heading as="h3">{title}</Heading>
      <p>{description}</p>
    </Link>
  );
}

function StatsSection() {
  return (
    <section className="section section--alt">
      <div className="container">
        <div className="stats-container">
          {stats.map((stat) => (
            <div key={stat.label} className="stat-item">
              <div className="stat-item__number">{stat.number}</div>
              <div className="stat-item__label">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ArchitectureSection() {
  return (
    <section className="section">
      <div className="container">
        <Heading as="h2" className="section__title">系统架构</Heading>
        <p className="section__subtitle">
          Aisphere 由多个微服务组成，通过 Kernel 框架统一治理
        </p>
        <div className="architecture-section">
          <div className="mermaid">
            {`
graph TB
    subgraph "用户层"
        Browser[浏览器 / Web App]
        CLI[命令行工具]
    end

    subgraph "网关层"
        GW[Gateway<br/>边界网关]
    end

    subgraph "业务服务层"
        IAM[IAM<br/>身份认证与权限]
        Hub[Hub<br/>AIHub 业务服务]
        Git[Git Server<br/>Git 服务]
    end

    subgraph "基础设施层"
        Kernel[Kernel 框架<br/>规范驱动微服务]
        PG[(PostgreSQL)]
        S3[(MinIO/S3)]
        ETCD[(etcd)]
    end

    subgraph "外部依赖"
        CAS[Casdoor<br/>认证]
        SPDB[SpiceDB<br/>授权]
    end

    Browser --> Gateway
    CLI --> Gateway
    Gateway --> IAM
    Gateway --> Hub
    Gateway --> Git
    IAM --> CAS
    IAM --> SSDB
    Hub --> PG
    Hub --> S3
    Gateway --> ETCD
    IAM --> Kernel
    Hub --> Kernel
    Git --> Kernel
            `}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="section section--alt">
      <div className="container">
        <Heading as="h2" className="section__title">核心组件</Heading>
        <p className="section__subtitle">
          选择以下模块开始探索 Aisphere 的完整能力
        </p>
        <div className="features-container">
          {projects.map((project, idx) => (
            <FeatureCard
              key={project.title}
              title={project.title}
              description={project.description}
              icon={project.icon}
              link={project.link}
              index={idx}
            />
          ))}
        </div>
      </div>
    </section>
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
        <StatsSection />
        <FeaturesSection />
        <ArchitectureSection />
      </main>
    </Layout>
  );
}