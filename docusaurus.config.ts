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
          editUrl: 'https://github.com/aisphereio/website/edit/main/',
          showLastUpdateTime: false,
          showLastUpdateAuthor: false,
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl: 'https://github.com/aisphereio/website/edit/main/',
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/aisphere-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
      defaultMode: 'light',
    },
    navbar: {
      title: 'Aisphere',
      logo: {
        alt: 'Aisphere Logo',
        src: 'img/logo.svg',
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
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/aisphereio',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Kernel', to: '/docs/kernel/intro'},
            {label: 'IAM', to: '/docs/iam/intro'},
            {label: 'Hub', to: '/docs/hub/intro'},
            {label: 'Gateway', to: '/docs/gateway/intro'},
          ],
        },
        {
          title: 'Community',
          items: [
            {label: 'GitHub', href: 'https://github.com/aisphereio'},
            {label: 'Issues', href: 'https://github.com/aisphereio/website/issues'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'Blog', to: '/blog'},
            {label: 'GitHub Organization', href: 'https://github.com/aisphereio'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Aisphere. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['protobuf', 'go', 'powershell', 'bash', 'sql', 'typescript', 'yaml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;