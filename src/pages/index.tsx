import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './index.module.css';

const capabilities = [
  ['01', 'IAM', '统一身份与访问管理', '以 Casdoor 承接 OIDC 身份，以 SpiceDB 表达组织、角色、共享与资源关系。'],
  ['02', 'HUB', '能力连接与编排中心', '统一管理 Skill、SkillSet、Agent 与工作流，让能力可以发现、复用、协作和演进。'],
  ['03', 'RUNTIME', '高性能智能运行时', '承接 Agent 执行、模型调用和工具调度，把权限控制留在可信运行时边界。'],
  ['04', 'SANDBOX', '零信任安全沙箱', '面向 Kubernetes 的隔离执行环境，默认无权限、按需启动、用后释放。'],
  ['05', 'GATEWAY', '智能模型网关', '统一不同模型服务的入口、路由、策略和可观测性，支持私有算力接入。'],
];

const layers = [
  ['接入层', 'Web Console · CLI · API · Git'],
  ['平台层', 'IAM · Hub · Runtime · Model Gateway'],
  ['执行层', 'Agent · Workflow · Tool · Sandbox'],
  ['基础设施', 'Kubernetes · Linux · GPU / NPU · Data'],
];

const solutions = [
  ['A', '私有化 AI 能力中台', '统一接入企业内部模型、数据与工具，在既有基础设施上构建可治理的 AI 能力目录。', '模型接入 · 知识与工具 · 权限治理'],
  ['B', '企业级 Agent 平台', '从身份、运行时到沙箱完整覆盖 Agent 生命周期，让智能体真正进入生产环境。', 'Agent Runtime · 零信任 · 弹性执行'],
  ['C', '开放能力协作网络', '以 Git 工作流管理 Skill 的版本、评审与共享，让人和 Agent 在同一套规则下协作。', 'Skill Hub · Git Workflow · ReBAC'],
];

function BlueprintMark({index}: {index: number}) {
  return <span className={`${styles.mark} ${styles[`mark${index}`]}`} aria-hidden="true"><i/><b/><em/></span>;
}

export default function Home(): ReactNode {
  return (
    <Layout title="AIsphere" description="企业 AI 基础设施">
      <main className={styles.page}>
        <section className={`${styles.hero} ${styles.blueprint}`}>
          <div className={styles.measure}><span>A</span><b>480</b><span>A′</span></div>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>AI INFRASTRUCTURE / V1.0</p>
            <h1>让企业 AI 能力<br/>真正运行起来</h1>
            <div className={styles.draftLine}><span/></div>
            <p className={styles.lead}>统一 IAM、Hub、Runtime、Sandbox、模型网关与 Kubernetes，让 AI 从能力接入走向稳定运行。</p>
            <div className={styles.actions}>
              <a className={styles.primary} href="#architecture">查看平台架构 <span>→</span></a>
              <a className={styles.secondary} href="#capabilities">了解核心能力 <span>→</span></a>
            </div>
          </div>
          <div className={styles.systemDrawing} aria-label="AIsphere 平台架构概览">
            <div className={styles.dimension}>1280</div>
            <div className={styles.modules}>
              {capabilities.map((item, index) => (
                <div className={styles.module} key={item[1]}>
                  <small>{item[0]}</small><strong>{item[1]}</strong>
                  <BlueprintMark index={index}/>
                  <span className={styles.moduleLines}/><i className={styles.connector}/>
                </div>
              ))}
            </div>
            <div className={styles.bus}><i/><i/><i/><i/><i/></div>
            <div className={styles.status}>STATUS: HEALTHY</div>
            <div className={styles.kubernetes}><small>06</small><strong>Kubernetes</strong><span>⌬</span></div>
            <div className={styles.coordinates}>X: 640&nbsp;&nbsp; Y: 780</div>
          </div>
        </section>

        <div className={styles.trust}><span>✛</span><p>安全可靠 · 开放兼容 · 稳定高效 · 企业级标准</p><code>V 1.0</code></div>

        <section className={styles.section} id="capabilities">
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>01 / CAPABILITIES</span><h2>一套平台，连接 AI 生产链路</h2></div>
            <p>每个模块独立演进，又通过统一身份、策略和运行边界协同工作。</p>
          </div>
          <div className={styles.capabilityGrid}>
            {capabilities.map((item, index) => (
              <article key={item[1]}>
                <div className={styles.cardTop}><span>{item[0]}</span><code>{item[1]}</code></div>
                <BlueprintMark index={index}/>
                <h3>{item[2]}</h3><p>{item[3]}</p>
                <Link to="/docs/guides/architecture">模块说明 <span>↗</span></Link>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.architecture} ${styles.blueprint}`} id="architecture">
          <div className={styles.archCopy}>
            <span className={styles.eyebrow}>02 / ARCHITECTURE</span>
            <h2>清晰的控制面，<br/>可信的执行面</h2>
            <p>AIsphere 不把权限交给沙箱中的 Agent。用户身份、授权判断和敏感动作由可信运行时承接，沙箱只获得完成当前任务所需的最小能力。</p>
            <ul>
              <li><b>01</b> 网关校验身份，IAM 统一做 ReBAC 授权</li>
              <li><b>02</b> Hub 管理可复用能力和 Git 协作流程</li>
              <li><b>03</b> Runtime 按策略调度模型、工具和沙箱</li>
            </ul>
          </div>
          <div className={styles.layerStack}>
            <div className={styles.stackTitle}><span>PLATFORM LAYERS</span><span>CONTROL / EXECUTION</span></div>
            {layers.map((layer, index) => <div className={styles.layer} key={layer[0]}><span>0{index + 1}</span><strong>{layer[0]}</strong><p>{layer[1]}</p></div>)}
            <div className={styles.flow}>IDENTITY → POLICY → EXECUTION → OBSERVABILITY</div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.solutions}`}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>03 / SOLUTIONS</span><h2>从企业痛点出发，而不是堆叠组件</h2></div>
            <p>在现有 Kubernetes、GPU/NPU 与企业身份体系之上，逐步引入可治理的 AI 能力。</p>
          </div>
          <div className={styles.solutionGrid}>
            {solutions.map(item => <article key={item[0]}><span>{item[0]}</span><h3>{item[1]}</h3><p>{item[2]}</p><code>{item[3]}</code></article>)}
          </div>
        </section>

        <section className={`${styles.developer} ${styles.blueprint}`}>
          <div><span className={styles.eyebrow}>04 / FOR DEVELOPERS</span><h2>面向开发者开放，<br/>面向生产环境设计</h2><Link className={styles.primary} to="/docs/kernel/intro">开始使用 AIsphere <span>→</span></Link></div>
          <div className={styles.terminal}><div><span/><span/><span/><b>aisphere / quickstart</b></div><pre><code><i>$</i> aisphere login{'\n'}<i>$</i> aisphere hub skill clone my-skill{'\n'}<i>$</i> aisphere runtime run --sandbox k8s</code></pre></div>
        </section>
      </main>
    </Layout>
  );
}
