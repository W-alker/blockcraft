# Blockcraft 主题系统

本项目支持浅色和深色主题，采用 Craft 风格设计。

## 主题文件

- `base.scss` - 基础样式和所有 block 的混入 (mixin)
- `light.scss` - 浅色主题 (默认)
- `dark.scss` - 深色主题 (Craft 风格)
- `function.scss` - SCSS 工具函数

## 使用方法

### 1. 在 Angular 应用中引入主题

在你的 `angular.json` 或组件样式中引入：

```scss
// 浅色主题
@import 'blockcraft/themes/light.scss';

// 或深色主题
@import 'blockcraft/themes/dark.scss';
```

### 2. 设置主题属性

在编辑器根元素上设置 `data-theme` 属性：

```html
<!-- 浅色主题 -->
<div data-blockcraft-root="true" data-theme="light">
  <!-- 编辑器内容 -->
</div>

<!-- 深色主题 -->
<div data-blockcraft-root="true" data-theme="dark">
  <!-- 编辑器内容 -->
</div>
```

### 3. 动态切换主题

使用 TypeScript/JavaScript 动态切换：

```typescript
const editor = document.querySelector('[data-blockcraft-root]');

// 切换到深色主题
editor?.setAttribute('data-theme', 'dark');

// 切换到浅色主题
editor?.setAttribute('data-theme', 'light');
```

## 主题特性

### 浅色主题 (Light)
- 清爽明亮的界面
- 适合白天使用
- 高对比度文字

### 深色主题 (Dark - Craft 风格)
- 舒适的深色背景 (#191919)
- 精心调整的配色方案
- 保护眼睛，适合夜间使用
- 代码高亮采用 Material Palenight 配色

## 配色变量

所有主题都使用 CSS 变量，你可以在 `:root` 或 `[data-blockcraft-root]` 中覆盖：

```css
[data-blockcraft-root="true"][data-theme="dark"] {
  --bc-color: #e3e3e3;                    /* 主文字颜色 */
  --bc-color-light: #888888;              /* 次要文字颜色 */
  --bc-border-color: #2d2d2d;             /* 边框颜色 */
  --bc-active-color: #6B7AFF;             /* 激活/强调色 */
  --bc-select-background-color: rgba(107, 122, 255, 0.25); /* 选区背景 */
}
```

## 支持的组件

所有 Blockcraft 组件都已适配深色主题：

### 内容块
- ✅ 段落 (Paragraph)
- ✅ 标题 (Heading 1-6)
- ✅ 代码块 (Code Block)
- ✅ 引用块 (Blockquote)
- ✅ 待办事项 (Todo)
- ✅ 有序列表 (Ordered List)
- ✅ 无序列表 (Bullet List)
- ✅ 分隔线 (Divider)
- ✅ 表格 (Table)
- ✅ 图片 (Image)
- ✅ 附件 (Attachment)
- ✅ 书签 (Bookmark)
- ✅ 嵌入块 (Embed Frame)
- ✅ Callout
- ✅ Mermaid 图表
- ✅ Caption

### UI 组件
- ✅ 浮动工具栏 (Float Toolbar)
- ✅ 颜色选择器 (Color Picker)
- ✅ 光标标记 (Cursor)

## 自定义主题

如果需要创建自定义主题，可以参考 `dark.scss` 的结构：

1. 从 `base.scss` 导入基础样式
2. 定义 `[data-blockcraft-root="true"][data-theme="your-theme"]` 选择器
3. 覆盖 CSS 变量和组件样式
4. 为代码高亮定义自定义的 `code-highlight-*` mixin

```scss
@import "base";

[data-blockcraft-root="true"][data-theme="custom"] {
  background-color: #your-bg;
  color: #your-text;
  
  --bc-active-color: #your-accent;
  // ... 其他变量
  
  .code-block .edit-container {
    @include code-highlight-custom;
  }
}

@mixin code-highlight-custom {
  [type="keyword"] { color: #custom-color; }
  // ... 其他语法元素
}
```

## 注意事项

1. 确保在编辑器根元素上同时设置 `data-blockcraft-root="true"` 和 `data-theme`
2. 主题切换会立即生效，无需刷新页面
3. 所有主题都包含完整的代码高亮支持
4. Mermaid 图表会自动适配主题颜色

## 浏览器兼容性

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

支持所有现代浏览器的 CSS 变量和选择器特性。
