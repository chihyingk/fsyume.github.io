import { defineConfig } from 'vitepress'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 文章日期渲染：读取 frontmatter 的 date/updated，注入到页面第一个 H1 标题之后
const postDatePlugin = (md) => {
  const fmt = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d))
  md.core.ruler.push('post-date', (state) => {
    const fm = state.env?.frontmatter
    if (!fm?.date) return
    const idx = state.tokens.findIndex((t) => t.type === 'heading_open' && t.tag === 'h1')
    if (idx === -1) return
    const date = fmt(fm.date)
    const updated = fm.updated && fmt(fm.updated) !== date ? ` · 更新于 ${fmt(fm.updated)}` : ''
    const token = new state.Token('html_block', '', 0)
    token.content = `<p style="color:var(--vp-c-text-3);font-size:.875rem">📅 发表于 ${date}${updated}</p>\n`
    state.tokens.splice(idx + 3, 0, token)
  })
}

const CATS = {
  linux: 'Linux', network: '网络', python: 'Python', java: 'Java',
  database: '数据库', algorithm: '算法', others: '其他', ffxiv: '狒狒食肆',
  agent: 'AI Agent'
}

// 扫描所有 md 的 frontmatter，收集文章元数据（供时间线页与 sitemap 使用）
const scanPosts = () => {
  const posts = []
  const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..')
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const r = rel + entry.name
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), `${r}/`)
      } else if (entry.name.endsWith('.md') && entry.name !== 'index.md') {
        const raw = readFileSync(join(dir, entry.name), 'utf8')
        const fm = raw.match(/^---\n([\s\S]*?)\n---/)
        if (!fm) continue
        const date = fm[1].match(/^date:\s*([\d-]+)/m)?.[1]
        const updated = fm[1].match(/^updated:\s*([\d-]+)/m)?.[1]
        if (!date && !updated) continue
        const title = raw.match(/^# (.+)$/m)?.[1].trim() || entry.name.slice(0, -3)
        posts.push({
          page: r,
          date,
          updated,
          title,
          link: `/${r.replace(/\.md$/, '')}`,
          category: CATS[r.split('/')[0]] || r.split('/')[0]
        })
      }
    }
  }
  walk(docsDir, '')
  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return posts
}

const posts = scanPosts()
// sitemap lastmod 用（优先 updated，回退 date）
const dateMap = Object.fromEntries(posts.map((p) => [p.page, p.updated ?? p.date]))

// 虚拟模块：向 docs/timeline.md 提供文章列表数据
const postsVirtualPlugin = () => ({
  name: 'posts-virtual',
  enforce: 'pre',
  resolveId(id) {
    return id === 'virtual:posts' ? '\0virtual:posts' : null
  },
  load(id) {
    if (id === '\0virtual:posts') return `export default ${JSON.stringify(posts)}`
    return null
  },
  configureServer(server) {
    // dev 下改动任何 md（新文章/改日期）时让虚拟模块失效重新生成
    server.watcher.on('all', (_event, file) => {
      if (!file.endsWith('.md')) return
      const mod = server.moduleGraph.getModuleById('\0virtual:posts')
      if (mod) server.moduleGraph.invalidateModule(mod)
    })
  }
})

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "FS的博客",
  description: "个人技术博客：Linux / 网络 / Python / Java / 数据库 / 算法，以及最终幻想14攻略",
  lang: 'zh-CN',
  vite: {
    plugins: [postsVirtualPlugin()]
  },
  markdown: {
    config: (md) => md.use(postDatePlugin)
  },
  sitemap: {
    hostname: 'https://www.fsyume.com',
    transformItems: (items) => items.map((item) => {
      const page = item.url.endsWith('.html')
        ? item.url.replace(/\.html$/, '.md')
        : item.url === '' ? 'index.md' : `${item.url}index.md`
      const lastmod = dateMap[page]
      return lastmod ? { ...item, lastmod } : item
    })
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '首页', link: '/' },
      { text: '分类', link: '/category' },
      { text: '时间线', link: '/timeline' },
      { text: '关于', link: '/about' }
    ],
    sidebar: {
      '/linux/': [
        {
          text: 'Linux',
          items: [
            { text: 'Linux常用技巧', link: '/linux/Linux常用技巧' },
            { text: 'Linux 开启远程 root 登录', link: '/linux/Linux开启远程root登录' },
            { text: 'Rocky Linux初见', link: '/linux/rocky_linux' }
          ]
        }
      ],
      '/network/': [
        {
          text: '网络',
          items: [
            { text: '硬件类', collapsed: true, items: [
              { text: '华为交换机常用命令', link: '/network/华为交换机常用命令' },
              { text: '路由器', link: '/network/路由器' }
            ]},
            { text: '工具类', collapsed: true, items: [
              { text: 'Wireshark使用方法', link: '/network/Wireshark使用方法' }
            ]}
          ]
        }
      ],
      '/python/': [
        {
          text: 'Python',
          items: [
            { text: '图像识别', collapsed: true, items: [
              { text: 'OpenCV图像识别', link: '/python/OpenCV图像识别' }
            ]},
            { text: '小程序', collapsed: true, items: [
              { text: '通过Python和BilibiliAPI来获取B站账户UID和粉丝数', link: '/python/Python写的小程序' },
              { text: 'Python自动化办公小程序', link: '/python/自动化办公小程序' }
            ]}
          ]
        }
      ],
      '/java/': [
        {
          text: 'Java',
          items: [
            { text: '框架', collapsed: true, items: [
              { text: 'MVC三层架构', link: '/java/MVC开发模式' },
              { text: 'Spring框架', link: '/java/Spring框架' },
              { text: 'Springboot实现邮件发送', link: '/java/Springboot实现邮件发送' }
            ]},
            { text: '工具', collapsed: true, items: [
              { text: 'maven配置', link: '/java/maven配置' },
              { text: 'JWT原理', link: '/java/jwt原理' }
            ]}
          ]
        }
      ],
      '/database/': [
        {
          text: '数据库',
          items: [
            { text: 'MySQL', collapsed: true, items: [
              { text: 'MySQL数据库安装包安装（一键安装包安装）', link: '/database/mysql数据库安装包安装' },
              { text: 'MySQL数据库的安装（手动版本）', link: '/database/mysql数据库的安装' }
            ]},
            { text: '工具', collapsed: true, items: [
              { text: '数据库可视化工具DBeaver', link: '/database/数据库可视化工具DBeaver' }
            ]}
          ]
        }
      ],
      '/algorithm/': [
        {
          text: '算法',
          items: [
            { text: '算法之旅----二分查找', link: '/algorithm/二分查找' },
            { text: '算法之旅----选择排序', link: '/algorithm/选择排序' }
          ]
        }
      ],
      '/others/': [
        {
          text: '其他',
          items: [
            { text: '运维', collapsed: true, items: [
              { text: 'Docker', link: '/others/Docker' }
            ]},
            { text: 'Windows', collapsed: true, items: [
              { text: 'Windows更新延期27年后', link: '/others/Windows更新延期27年之后' }
            ]},
            { text: 'GitHub', collapsed: true, items: [
              { text: 'Github访问问题', link: '/others/GitHub访问问题' },
              { text: '为本地git配置代理', link: '/others/为本地git配置代理' },
              { text: '同时将代码同步到GitHub和Gitee', link: '/others/同时将代码同步到GitHub和Gitee' },
              { text: '自用的常见本地代理设置', link: '/others/自用的常见本地代理设置' }
            ]},
            { text: '前端', collapsed: true, items: [
              { text: '淘宝npm镜像', link: '/others/淘宝npm镜像' }
            ]},
            { text: '美化', collapsed: true, items: [
              { text: 'Windows Terminal美化', link: '/others/Windows-Terminal美化' }
            ]},
            { text: '中文排版', collapsed: true, items: [
              { text: '中文排版', link: '/others/chinese' }
            ]},
            { text: '碎碎念', collapsed: true, items: [
              { text: 'VS Code插件推荐', link: '/others/VSCode插件推荐' },
              { text: '博客更换主题', link: '/others/博客更换主题' },
              { text: '博客文章书写规范', link: '/others/博客文章书写规范' }
            ]}
          ]
        }
      ],
      '/ffxiv/': [
        {
          text: '最终幻想14',
          items: [
            { text: '给狒狒豆芽看的常见PVE黑话（2024年8月7日 6.X版本）', link: '/ffxiv/给狒狒豆芽看的常见PVE黑话' },
            { text: '萌新入门系列', collapsed: true, items: [
              { text: '系列目录', link: '/ffxiv/FF14萌新入门教程' },
              { text: 'EP1 入坑准备：下载、注册、选服、捏脸', link: '/ffxiv/FF14萌新入门-EP1-入坑准备' }
            ]}
          ]
        }
      ],
      '/agent/': [
        {
          text: 'AI Agent',
          items: [
            { text: 'OpenCode 使用笔记', link: '/agent/OpenCode使用笔记' }
          ]
        }
      ]
    },
    footer: {
      message: '<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener"><span>豫ICP备2020026923号-3</span></a>',
      copyright: 'Copyright © 2022-present <a href="https://space.bilibili.com/115505904" target="_blank" rel="noopener">chihying</a>'
    },
    search: {
      provider: 'local',
      options: {
        miniSearch: {
          options: {
            // MiniSearch 默认只按空白/标点切词，中文整句会变成一个 token，
            // 导致正文里的中文词无法被检索。这里对 CJK 追加 bigram 分词。
            tokenize: (text) =>
              text
                .split(/[\n\r\p{Z}\p{P}]+/u)
                .flatMap((segment) => {
                  const tokens = segment.match(/[A-Za-z0-9_]+/g) ?? []
                  const cjk = segment.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/gu) ?? []
                  for (const run of cjk) {
                    if (run.length === 1) {
                      tokens.push(run)
                      continue
                    }
                    for (let i = 0; i < run.length - 1; i++) {
                      tokens.push(run.slice(i, i + 2))
                    }
                  }
                  return tokens
                })
          },
          searchOptions: {
            fuzzy: 0.2,
            prefix: true,
            boost: { title: 4, text: 2, titles: 1 }
          }
        }
      }
    }
  }
})
