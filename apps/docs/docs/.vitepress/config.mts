import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Blockcraft',
  description: '正式富文本编辑器项目文档站',
  themeConfig: {
    nav: [
      { text: '介绍', link: '/' },
      { text: '架构', link: '/guide/architecture' },
      { text: '虚拟渲染', link: '/guide/virtual-rendering' }
    ],
    sidebar: [
      {
        text: '指南',
        items: [
          { text: '项目介绍', link: '/' },
          { text: '架构说明', link: '/guide/architecture' },
          { text: '虚拟渲染历史方案', link: '/guide/virtual-rendering' },
          { text: '旧版 README', link: '/guide/legacy-readme' }
        ]
      }
    ]
  }
});
