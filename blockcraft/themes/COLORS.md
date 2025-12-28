# Blockcraft 配色参考

本文档列出了浅色和深色主题的所有配色方案。

## CSS 变量总览

### 文字和颜色

| 变量名 | 浅色主题 | 深色主题 | 说明 |
|--------|---------|---------|------|
| `--bc-fs` | `16px` | `16px` | 基础字体大小 |
| `--bc-lh` | `24px` | `24px` | 基础行高 |
| `--bc-color` | `#333` | `#e3e3e3` | 主文字颜色 |
| `--bc-color-light` | `#999` | `#888888` | 次要文字颜色 |
| `--bc-color-lighter` | `#ccc` | `#666666` | 更浅的文字 |
| `--bc-color-dark` | `#000` | `#ffffff` | 深色/强调文字 |

### 边框

| 变量名 | 浅色主题 | 深色主题 | 说明 |
|--------|---------|---------|------|
| `--bc-border-color` | `#ddd` | `#2d2d2d` | 标准边框 |
| `--bc-border-color-light` | `#eee` | `#252525` | 浅色边框 |
| `--bc-border-color-dark` | `#ccc` | `#3a3a3a` | 深色边框 |

### 背景色

| 变量名 | 浅色主题 | 深色主题 | 说明 |
|--------|---------|---------|------|
| `--bc-bg-primary` | `#fff` | `#191919` | 主背景 |
| `--bc-bg-secondary` | `#f5f5f5` | `#1e1e1e` | 二级背景 |
| `--bc-bg-elevated` | `#fafafa` | `#252525` | 浮起元素背景 |
| `--bc-bg-hover` | `#f0f0f0` | `#2a2a2a` | 悬停背景 |

### 状态色

| 变量名 | 浅色主题 | 深色主题 | 说明 |
|--------|---------|---------|------|
| `--bc-warning-color` | `#f5a623` | `#f5a623` | 警告色 |
| `--bc-error-color` | `#e03131` | `#ff6b6b` | 错误色 |
| `--bc-success-color` | `#37b24d` | `#51cf66` | 成功色 |
| `--bc-info-color` | `#339af0` | `#4fc3f7` | 信息色 |

### 强调色

| 变量名 | 浅色主题 | 深色主题 | 说明 |
|--------|---------|---------|------|
| `--bc-active-color` | `#4857E2` | `#6B7AFF` | 激活/强调色 |
| `--bc-active-color-light` | `#1890ff` | `#5B6AE8` | 浅色激活色 |
| `--bc-active-color-lighter` | `rgba(72,87,226,0.1)` | `rgba(107,122,255,0.15)` | 更浅的激活色背景 |

### 特殊背景

| 变量名 | 浅色主题 | 深色主题 | 说明 |
|--------|---------|---------|------|
| `--bc-error-background-color` | `rgba(224,49,49,0.1)` | `rgba(255,107,107,0.15)` | 错误背景 |
| `--bc-select-background-color` | `rgba(24,144,255,0.3)` | `rgba(107,122,255,0.25)` | 选区背景 |
| `--bc-mark-bg-color` | `rgba(255,198,10,0.4)` | `rgba(255,198,10,0.3)` | 标记背景 |
| `--bc-highlight-bg-color` | `rgba(255,198,10,0.25)` | `rgba(255,198,10,0.2)` | 高亮背景 |

### 光标颜色 🆕

| 变量名 | 浅色主题 | 深色主题 | 说明 |
|--------|---------|---------|------|
| `--bc-caret-color` | `#000` | `#ffffff` | 标准光标颜色 |
| `--bc-caret-color-on-mark` | `#000` | `#ffffff` | 高亮块上的光标颜色 |

### 间距

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `--bc-segments-gap` | `8px` | 块之间间距 |
| `--bc-padding-sm` | `4px` | 小间距 |
| `--bc-padding-md` | `8px` | 中等间距 |
| `--bc-padding-lg` | `12px` | 大间距 |
| `--bc-padding-xl` | `16px` | 超大间距 |

### 圆角

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `--bc-radius-sm` | `2px` | 小圆角 |
| `--bc-radius-md` | `4px` | 中等圆角 |
| `--bc-radius-lg` | `8px` | 大圆角 |

### 阴影

| 变量名 | 浅色主题 | 深色主题 | 说明 |
|--------|---------|---------|------|
| `--bc-shadow-sm` | `0 1px 3px rgba(0,0,0,0.1)` | `0 1px 3px rgba(0,0,0,0.3)` | 小阴影 |
| `--bc-shadow-md` | `0 2px 8px rgba(0,0,0,0.15)` | `0 2px 8px rgba(0,0,0,0.4)` | 中等阴影 |
| `--bc-shadow-lg` | `0 4px 16px rgba(0,0,0,0.2)` | `0 4px 16px rgba(0,0,0,0.5)` | 大阴影 |

### 过渡动画

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `--bc-transition-fast` | `0.15s ease` | 快速过渡 |
| `--bc-transition-base` | `0.3s ease` | 标准过渡 |
| `--bc-transition-slow` | `0.5s ease` | 慢速过渡 |

## 浅色主题 (Light Theme)

### 基础颜色
```scss
background: #ffffff
text: #333333
text-secondary: #999999
```

### 边框和分隔
```scss
border: #dddddd
border-light: #eeeeee
```

### 强调色
```scss
primary: #4857E2
primary-light: #1890ff
```

### 代码高亮 (Light)
```scss
variable: #005f87      // 深蓝青
keyword: #d12f1b       // 鲜红
title: #8e44ad         // 紫色
number: #c25e00        // 暗橘色
string: #2a7b00        // 深绿色
comment: slategray     // 灰色
function: #0066cc      // 亮蓝色
operator: #aa00aa      // 品红
punctuation: #999999   // 深灰
```

## 深色主题 (Dark Theme - Craft 风格)

### 基础颜色
```scss
background: #191919
text: #e3e3e3
text-secondary: #888888
placeholder: #555555
```

### 背景层级
```scss
bg-primary: #191919    // 主背景
bg-secondary: #1e1e1e  // 二级背景（代码块、卡片）
bg-elevated: #252525   // 浮起背景（工具栏、头部）
bg-hover: #2a2a2a      // 悬停背景
```

### 边框和分隔
```scss
border: #2d2d2d
border-light: #252525
border-strong: #3a3a3a
```

### 强调色
```scss
primary: #6B7AFF
primary-light: #5B6AE8
primary-hover: rgba(107, 122, 255, 0.2)
```

### 状态色
```scss
error: #ff6b6b
warning: #f5a623
success: #51cf66
info: #4fc3f7
```

### 代码高亮 (Dark - Material Palenight)
```scss
variable: #4fc3f7      // 亮青蓝
keyword: #ff6b9d       // 粉红
title: #c792ea         // 淡紫
number: #f78c6c        // 橘色
string: #c3e88d        // 嫩绿
comment: #676e95       // 灰蓝
function: #82aaff      // 亮蓝
operator: #89ddff      // 青色
punctuation: #999999   // 灰色
tag: #f07178           // 珊瑚红
attribute: #c792ea     // 淡紫
attr-name: #ffcb6b     // 金黄
attr-value: #c3e88d    // 嫩绿
property: #ffcb6b      // 金黄
selector: #c3e88d      // 嫩绿
builtin: #82aaff       // 亮蓝
class: #ffcb6b         // 金黄
constant: #f78c6c      // 橘色
regex: #c3e88d         // 嫩绿
important: #ff5370     // 鲜红
```

## 组件专属颜色

### 表格 (Table)

#### 浅色
```scss
cell-background: transparent
cell-border: #ddd
header-background: #f2f3f5
control-bar: #f1f1f1
control-bar-hover: #E0E0E0
control-bar-active: #4857E2
```

#### 深色
```scss
cell-background: #1e1e1e
cell-border: #2d2d2d
header-background: #252525
control-bar: #2a2a2a
control-bar-hover: #353535
control-bar-active: #6B7AFF
```

### 代码块 (Code Block)

#### 浅色
```scss
background: transparent
border: #e6e6e6
header: #F7F9FE
```

#### 深色
```scss
background: #1e1e1e
border: #2d2d2d
header: #252525
```

### Callout 块

#### 浅色
```scss
background: transparent
border: transparent
hover-bg: rgba(24, 144, 255, 0.3)
```

#### 深色
```scss
background: #252525
border: #2d2d2d
hover-bg: rgba(107, 122, 255, 0.2)
```

### 引用块 (Blockquote)

#### 浅色
```scss
border-left: #ddd
background: transparent
```

#### 深色
```scss
border-left: #3a3a3a
background: rgba(255, 255, 255, 0.03)
text: #cccccc
```

### 图片块 (Image)

#### 浅色
```scss
outline-selected: #1890ff
resize-handle-bg: #fff
resize-handle-border: #4857E2
```

#### 深色
```scss
outline-selected: #6B7AFF
resize-handle-bg: #191919
resize-handle-border: #6B7AFF
```

### 浮动工具栏 (Float Toolbar)

#### 浅色
```scss
background: #ffffff
shadow: rgba(0, 0, 0, 0.2)
item-color: #333
item-hover: rgba(215, 215, 215, 0.6)
item-active: rgba(95, 111, 255, 0.08)
divider: #e0e0e0
```

#### 深色
```scss
background: #2a2a2a
shadow: rgba(0, 0, 0, 0.5)
item-color: #e3e3e3
item-hover: rgba(255, 255, 255, 0.08)
item-active: rgba(107, 122, 255, 0.2)
divider: #3a3a3a
```

## 使用建议

### 1. 保持对比度
深色主题中，确保文字和背景的对比度至少为 4.5:1（WCAG AA 标准）。

### 2. 避免纯黑和纯白
- 深色主题使用 `#191919` 而不是 `#000000`
- 文字使用 `#e3e3e3` 而不是 `#ffffff`

### 3. 一致的层级关系
```scss
// 深色主题背景层级
Level 0 (最深): #191919  // 页面背景
Level 1: #1e1e1e         // 内容块
Level 2: #252525         // 浮起元素
Level 3: #2a2a2a         // 悬停状态
```

### 4. 边框策略
深色主题中，边框应该比背景亮，形成视觉分隔：
```scss
background: #1e1e1e
border: #2d2d2d  // 比背景亮约 15 个色阶
```

### 5. 强调色应用
- 使用蓝色系作为主要强调色 (`#6B7AFF`)
- 保持足够的饱和度，在深色背景上清晰可见
- 悬停和激活状态使用半透明叠加

### 6. 代码高亮配色原则
- 关键字使用高饱和度颜色（粉红、紫色）
- 字符串和注释使用中等饱和度（绿色、灰蓝）
- 保持整体和谐，避免过于鲜艳

## 自定义主题

如果你想创建自定义配色，建议使用以下工具：

1. **对比度检查**: [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
2. **配色生成**: [Coolors](https://coolors.co/)
3. **深色主题参考**: [Material Design Dark Theme](https://material.io/design/color/dark-theme.html)

## 颜色命名规范

在创建自定义主题时，建议遵循以下命名规范：

```scss
// 基础颜色
--bc-color-*              // 文字颜色
--bc-bg-*                 // 背景颜色
--bc-border-*             // 边框颜色

// 语义颜色
--bc-primary-*            // 主色调
--bc-success-*            // 成功状态
--bc-warning-*            // 警告状态
--bc-error-*              // 错误状态
--bc-info-*               // 信息提示

// 交互颜色
--bc-hover-*              // 悬停状态
--bc-active-*             // 激活状态
--bc-focus-*              // 聚焦状态
--bc-disabled-*           // 禁用状态
```
