import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Aisphere',
  tagline: 'AI-Native Service Infrastructure',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://aisphereio.github.io',
  baseUrl: '/',

  organizationName: 'aisphereio',
  projectName: 'aisphereio.github.io',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  scripts: [
    {
      src: '/js/mermaid-interactive.js',
      async: true,
    },
  ],

  markdown: {
    mermaid: true,
  },

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans', 'en'],
    localeConfigs: {
      'zh-Hans': {
        label: '中文',
      },
      en: {
        label: 'English',
      },
    },
  },

  presets: [
    [
      'classic',
      {
docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/aisphereio/aisphereio.github.io/edit/main/',
          showLastUpdateTime: true,
          showLastUpdateAuthor: false,
          lastVersion: 'current',
          versions: {
            current: {
              label: 'v1.0.0',
              path: '',
            },
          },
          remarkPlugins: [
            [require('docusaurus-remark-plugin-tab-blocks'), {}],
          ],
          // Enable breadcrumbs for document navigation context
          breadcrumbs: true,
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl: 'https://github.com/aisphereio/aisphereio.github.io/edit/main/',
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          lastmod: 'datetime',
          changefreq: 'weekly',
          priority: 0.5,
          ignorePatterns: ['/blog/tags/**', '/blog/authors/**'],
          filename: 'sitemap.xml',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    '@docusaurus/theme-mermaid',
    '@docusaurus/theme-live-codeblock',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['zh', 'en'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        searchBarPosition: 'auto',
      },
    ],
  ],

  plugins: [
    'docusaurus-plugin-image-zoom',
    [
      '@docusaurus/plugin-ideal-image',
      {
        quality: 85,
        max: 1200,
        min: 400,
        steps: 4,
        disableInDev: false,
      },
    ],
    [
      '@docusaurus/plugin-pwa',
      {
        debug: false,
        offlineModeActivationStrategies: [
          'appInstalled',
          'standalone',
          'queryString',
        ],
        pwaHead: [
          {
            tagName: 'link',
            rel: 'icon',
            href: 'img/favicon.ico',
          },
          {
            tagName: 'link',
            rel: 'manifest',
            href: '/manifest.json',
          },
          {
            tagName: 'meta',
            name: 'theme-color',
            content: '#2563eb',
          },
          {
            tagName: 'meta',
            name: 'apple-mobile-web-app-capable',
            content: 'yes',
          },
          {
            tagName: 'meta',
            name: 'apple-mobile-web-app-status-bar-style',
            content: 'black-translucent',
          },
          {
            tagName: 'link',
            rel: 'apple-touch-icon',
            href: 'img/logo.svg',
          },
        ],
      },
    ],
  ],

  themeConfig: {
    image: 'img/aisphere-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
      defaultMode: 'light',
    },
    announcementBar: {
      id: 'announcement',
      content:
        '🚀 <strong>Aisphere v1.0</strong> 已发布！查看 <a href="/docs/guides/quickstart">快速开始指南</a> 或 <a href="https://github.com/aisphereio">GitHub</a>',
      backgroundColor: 'rgba(37, 99, 235, 0.9)',
      textColor: '#ffffff',
      isCloseable: true,
    },
    navbar: {
      title: 'Aisphere',
      logo: {
        alt: 'Aisphere Logo',
        src: 'img/logo.svg',
        srcDark: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'kernelSidebar',
          position: 'left',
          label: 'Kernel',
        },
        {
          type: 'docSidebar',
          sidebarId: 'iamSidebar',
          position: 'left',
          label: 'IAM',
        },
        {
          type: 'docSidebar',
          sidebarId: 'hubSidebar',
          position: 'left',
          label: 'Hub',
        },
        {
          type: 'docSidebar',
          sidebarId: 'gatewaySidebar',
          position: 'left',
          label: 'Gateway',
        },
        {
          type: 'docSidebar',
          sidebarId: 'guidesSidebar',
          position: 'left',
          label: 'Guides',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
        {
          type: 'docsVersionDropdown',
          position: 'right',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/aisphereio',
          'aria-label': 'GitHub',
          position: 'right',
          className: 'header-github-link',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: '文档',
          items: [
            {label: 'Kernel 框架', to: '/docs/kernel/intro'},
            {label: 'IAM 服务', to: '/docs/iam/intro'},
            {label: 'Hub 服务', to: '/docs/hub/intro'},
            {label: 'Gateway 网关', to: '/docs/gateway/intro'},
            {label: 'Git Server', to: '/docs/git-server/intro'},
            {label: '开发指南', to: '/docs/guides/intro'},
          ],
        },
        {
          title: '社区',
          items: [
            {label: 'GitHub 组织', href: 'https://github.com/aisphereio'},
            {label: '提交 Issue', href: 'https://github.com/aisphereio/aisphereio.github.io/issues'},
            {label: '贡献指南', to: '/docs/kernel/contributing'},
          ],
        },
        {
          title: '更多',
          items: [
            {label: '博客', to: '/blog'},
            {label: '路线图', to: '/docs/kernel/roadmap'},
            {label: '变更日志', to: '/docs/kernel/changelog'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Aisphere. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.oneLight,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ['protobuf', 'go', 'powershell', 'bash', 'sql', 'typescript', 'yaml', 'json', 'diff'],
    },
docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
    // Enable table of contents auto-collapse for deep documents
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 5,
    },
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
      options: {
        maxTextSize: 50000,
      },
    },
    zoom: {
      selector: '.markdown img',
      background: {
        light: 'rgba(255, 255, 255, 0.9)',
        dark: 'rgba(0, 0, 0, 0.9)',
      },
      config: {
        margin: 40,
        scrollOffset: 0,
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;