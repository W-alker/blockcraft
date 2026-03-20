# MentionPlugin

行内 @提及插件。在文档中输入 `@` 触发浮动面板，选择后插入不可编辑的 mention embed。

## 架构设计

插件采用**引擎 + 面板**分层架构，插件本身是纯执行流引擎，不包含任何 UI 和业务逻辑。

```
┌─────────────────────────────────────────────────┐
│  MentionPlugin（引擎层）                          │
│                                                   │
│  负责：                                           │
│    触发检测 → 锚点追踪 → 关键词提取 → 键盘捕获     │
│    → 确认提交（写入 embed delta）→ 生命周期管理     │
│                                                   │
│  不关心：                                          │
│    面板长什么样、数据怎么来、列表怎么选             │
├─────────────────────────────────────────────────┤
│  IMentionPanel（接口层）                          │
│                                                   │
│  Plugin → Panel:                                  │
│    onKeywordChange(keyword)  关键词变化            │
│    onKeydown(event): boolean 键盘事件转发          │
│    updatePosition(rect)      位置更新              │
│                                                   │
│  Panel → Plugin:                                  │
│    onConfirm: Observable     用户确认选择          │
├─────────────────────────────────────────────────┤
│  具体面板实现（UI 层）                             │
│                                                   │
│  例如 createDefaultMentionPanel：                  │
│    Angular CDK Overlay + MentionDialog            │
│    内部自行处理：搜索请求、Tab 切换、列表渲染、     │
│    上下键选择、Enter 确认 ...                      │
└─────────────────────────────────────────────────┘
```

## 快速上手

### 1. 注册 mention embed 转换器

在 `DocConfig.embeds` 中注册 mention 类型的双向转换：

```typescript
embeds: [
  [
    'mention',
    {
      // Delta → DOM：将 embed delta 渲染为 DOM 元素
      toView: (embed) => {
        const span = document.createElement('span')
        span.textContent = embed.insert['mention'] as string
        span.setAttribute('data-mention-id', embed.attributes!['mentionId'] as string)
        span.setAttribute('data-mention-type', embed.attributes!['mentionType'] as string)
        return span
      },
      // DOM → Delta：从 DOM 元素反序列化为 embed delta（用于复制粘贴等场景）
      toDelta: (el) => ({
        insert: { mention: el.textContent! },
        attributes: {
          mentionId: el.getAttribute('data-mention-id')!,
          mentionType: el.getAttribute('data-mention-type')
        }
      })
    }
  ]
]
```

### 2. 使用内置面板

最简方式，使用内置的 `createDefaultMentionPanel`：

```typescript
import { MentionPlugin, createDefaultMentionPanel } from '@ccc/blockcraft'

new MentionPlugin({
  panel: createDefaultMentionPanel({
    request: (keyword, type) => api.searchMentions(keyword, type),
  }),
  onMentionClick: (id, type, event) => {
    router.navigate([type, id])
  },
})
```

### 3. 添加 mention 样式

mention embed 渲染后是一个 `<span data-mention-id="..." data-mention-type="...">` 元素，需要自行添加样式：

```css
span[data-mention-id] {
  padding: 0 .15em;
  color: #4857E2;
  cursor: pointer;

  &[data-mention-type="user"]::before {
    content: '@';
  }
}
```

## API

### MentionPluginConfig

```typescript
interface MentionPluginConfig {
  panel: MentionPanelFactory       // 必填，面板工厂
  trigger?: string                  // 触发字符，默认 '@'
  onMentionClick?: (              // 点击已有 mention 时的回调
    id: string,
    type: string,
    event: MouseEvent
  ) => void
}
```

### IMentionPanel

面板需要实现的接口。插件通过这个接口与面板通信。

```typescript
interface IMentionPanel {
  onKeywordChange(keyword: string): void      // 插件推送关键词
  onKeydown(event: KeyboardEvent): boolean    // 插件转发键盘事件
  updatePosition(rect: DOMRect): void         // 插件推送位置更新
  readonly onConfirm: Observable<IMentionData> // 面板通知确认
  dispose(): void                              // 插件通知销毁
}
```

#### onKeywordChange

用户在 `@` 后输入的文本发生变化时调用。首次打开时会推送空字符串 `''`。
面板拿到关键词后自行决定如何使用（发起搜索请求、本地过滤、忽略等）。

#### onKeydown

插件在 mention 会话期间捕获以下键盘事件并转发给面板：
- `ArrowUp` / `ArrowDown` / `Enter` / `Tab`
- `Escape`（面板返回 `false` 时插件会关闭会话）

面板返回 `true` 表示已处理（插件会 preventDefault），返回 `false` 表示不处理（事件继续传播到编辑器）。

#### onConfirm

面板通过此 Observable 发射 `IMentionData`，插件收到后执行：
1. 删除 `@keyword` 文本
2. 插入 mention embed delta + 尾部空格
3. 恢复光标到 embed 之后
4. 关闭会话

```typescript
interface IMentionData {
  id: string                                   // 必填，写入 mentionId 属性
  name: string                                 // 必填，写入 embed 显示文本
  [key: string]: string | number | boolean     // 其余字段写入 embed attributes
}
```

### MentionPanelFactory

```typescript
type MentionPanelFactory = (ctx: {
  doc: BlockCraft.Doc    // 编辑器实例（可用于获取 injector、overlay 等服务）
  rect: DOMRect          // '@' 字符的屏幕位置，用作面板初始定位锚点
}) => IMentionPanel
```

工厂函数在每次 `@` 触发时调用一次，返回的面板实例生存到会话关闭。

### DefaultMentionPanelConfig

内置面板的配置：

```typescript
interface DefaultMentionPanelConfig {
  request: (keyword: string, type: MentionType) => Promise<IMentionResponse>
}

type MentionType = 'user' | 'doc'
interface IMentionResponse { list: IMentionData[] }
```

## 自定义面板

如果内置面板不满足需求，可以实现自己的 `MentionPanelFactory`。

### 示例：纯 DOM 面板

```typescript
const myPanelFactory: MentionPanelFactory = (ctx) => {
  const confirm$ = new Subject<IMentionData>()

  // 创建浮动容器
  const container = document.createElement('div')
  container.className = 'my-mention-panel'
  container.style.cssText = `
    position: fixed;
    top: ${ctx.rect.bottom}px;
    left: ${ctx.rect.left}px;
  `
  document.body.appendChild(container)

  // 内部状态
  let items: IMentionData[] = []
  let selectedIndex = 0

  const render = () => {
    container.innerHTML = items.map((item, i) =>
      `<div class="item ${i === selectedIndex ? 'active' : ''}"
            data-id="${item.id}">${item.name}</div>`
    ).join('')
  }

  // 点击选择
  container.addEventListener('mousedown', (e) => {
    e.preventDefault()
    const target = (e.target as HTMLElement).closest('[data-id]')
    if (!target) return
    const item = items.find(i => i.id === target.getAttribute('data-id'))
    if (item) confirm$.next(item)
  })

  return {
    onKeywordChange(keyword) {
      // 自行搜索
      fetch(`/api/mention?q=${keyword}`)
        .then(r => r.json())
        .then(data => { items = data; selectedIndex = 0; render() })
    },

    onKeydown(e) {
      switch (e.key) {
        case 'ArrowUp':
          selectedIndex = Math.max(0, selectedIndex - 1)
          render()
          return true
        case 'ArrowDown':
          selectedIndex = Math.min(items.length - 1, selectedIndex + 1)
          render()
          return true
        case 'Enter':
          if (items[selectedIndex]) confirm$.next(items[selectedIndex])
          return true
        default:
          return false
      }
    },

    updatePosition(rect) {
      container.style.top = `${rect.bottom}px`
      container.style.left = `${rect.left}px`
    },

    onConfirm: confirm$.asObservable(),

    dispose() {
      confirm$.complete()
      container.remove()
    },
  }
}

// 使用
new MentionPlugin({ panel: myPanelFactory })
```

### 示例：React / Vue 面板

思路相同 -- 在工厂函数中挂载框架组件，通过 `onKeywordChange` / `onKeydown` 驱动组件状态，通过回调发射 `onConfirm`：

```typescript
// React 示例思路
const reactPanelFactory: MentionPanelFactory = (ctx) => {
  const confirm$ = new Subject<IMentionData>()
  const container = document.createElement('div')
  document.body.appendChild(container)

  // 用 ref 桥接命令式调用
  const ref = { setKeyword: (_: string) => {}, handleKey: (_: KeyboardEvent) => false }

  const root = createRoot(container)
  root.render(<MyMentionPanel
    ref={ref}
    initialRect={ctx.rect}
    onConfirm={item => confirm$.next(item)}
  />)

  return {
    onKeywordChange(kw) { ref.setKeyword(kw) },
    onKeydown(e) { return ref.handleKey(e) },
    updatePosition(rect) { /* update via ref */ },
    onConfirm: confirm$.asObservable(),
    dispose() { root.unmount(); container.remove(); confirm$.complete() },
  }
}
```

## 执行流程

```
用户输入 '@'
  │
  ├─ 触发条件检查：
  │    ✓ 非 IME 合成中
  │    ✓ 光标在可编辑块的文本位置
  │    ✓ '@' 前是空格或行首
  │    ✓ 当前没有已打开的会话
  │
  ├─ 插入 '@' 到 Y.Text（受控渲染）
  │
  ├─ 创建协同安全锚点（OneShotCursorAnchor）
  │    └─ 使用 Yjs RelativePosition，远程编辑不影响锚点位置
  │
  ├─ 调用 panel = config.panel({ doc, rect })
  │
  ├─ panel.onKeywordChange('')          ← 初始推送
  │
  ├─ 进入会话循环 ─────────────────────────────────
  │   │
  │   ├─ 文本变化（300ms 防抖）
  │   │    ├─ 提取关键词（'@' 到光标之间的文本）
  │   │    ├─ 关键词为 null → 关闭会话
  │   │    ├─ panel.onKeywordChange(keyword)
  │   │    └─ panel.updatePosition(rect)
  │   │
  │   ├─ 键盘事件
  │   │    ├─ Escape → panel.onKeydown(e)
  │   │    │            └─ 返回 false → 关闭会话
  │   │    └─ ArrowUp/Down/Enter/Tab → panel.onKeydown(e)
  │   │                                 └─ 返回 true → preventDefault
  │   │
  │   ├─ 选区变化 → 光标离开 @keyword 范围 → 关闭会话
  │   ├─ 滚动 → panel.updatePosition(rect)
  │   └─ 只读切换 / 文档销毁 → 关闭会话
  │
  ├─ panel.onConfirm 发射 { id, name, ... }
  │    ├─ 删除 @keyword 文本
  │    ├─ 插入 embed delta: { insert: {mention: name}, attributes: {mentionId: id, ...} }
  │    ├─ 插入尾部空格
  │    └─ 恢复光标
  │
  └─ 关闭会话
       ├─ 解绑临时热键
       ├─ 释放锚点
       └─ panel.dispose()
```

## 写入的 Delta 格式

确认选择后，插件向 Y.Text 写入的 delta：

```typescript
[
  { retain: atIndex },                    // 保留 '@' 之前的内容
  { delete: keywordLength + 1 },          // 删除 '@' + keyword
  {
    insert: { mention: '张三' },           // embed 对象，key 为 'mention'
    attributes: {
      mentionId: 'user-123',              // 来自 IMentionData.id
      // IMentionData 中除 id/name 外的字段也会写入 attributes
    }
  },
  { insert: ' ' }                        // 尾部空格，确保光标可停靠
]
```

## 文件结构

```
plugins/mention/
  index.ts                    MentionPlugin 类 + re-exports
  types.ts                    IMentionPanel、MentionPanelFactory、MentionPluginConfig 等类型
  widget/
    default-panel.ts          createDefaultMentionPanel — 内置面板工厂
    mention-dialog.ts         MentionDialog Angular 组件
    mention-dialog.html       模板
    mention-dialog.scss       样式
```
