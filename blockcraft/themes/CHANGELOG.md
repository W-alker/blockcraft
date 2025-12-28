# 主题系统更新日志

## [2025-12-27] 添加深色主题支持

### 🎨 新增功能

#### 1. 深色主题文件
- ✅ 新增 `dark.scss` - Craft 风格深色主题
- ✅ 覆盖所有组件和 block 的深色样式
- ✅ 完整的代码高亮配色（Material Palenight 风格）

#### 2. 主题系统优化
- ✅ 更新 `function.scss` - 添加 `code-highlight-dark` mixin 声明
- ✅ 保持与现有 `light.scss` 的兼容性
- ✅ 使用 CSS 变量实现主题切换

### 📦 涉及的组件

#### 内容块 (Blocks)
- ✅ 段落 (Paragraph)
- ✅ 标题 (Heading 1-6)
- ✅ 代码块 (Code Block) - 含语法高亮
- ✅ 引用块 (Blockquote)
- ✅ 待办事项 (Todo)
- ✅ 有序列表 (Ordered List)
- ✅ 无序列表 (Bullet List)
- ✅ 分隔线 (Divider) - 含所有样式变体
- ✅ 表格 (Table) - 含控制栏和调整器
- ✅ 图片 (Image) - 含调整手柄
- ✅ 附件 (Attachment)
- ✅ 书签 (Bookmark)
- ✅ 嵌入块 (Embed Frame)
- ✅ Callout
- ✅ Mermaid 图表 - 含 SVG 元素适配
- ✅ Caption

#### UI 组件 (Components)
- ✅ 浮动工具栏 (Float Toolbar)
- ✅ 颜色选择器 (Color Picker)
- ✅ 光标标记 (Cursor)
- ✅ 滚动条样式

### 🎨 配色方案

#### 主色调
```scss
// 深色主题
background: #191919
text: #e3e3e3
primary: #6B7AFF
border: #2d2d2d
```

#### 代码高亮
采用 Material Palenight 配色方案，包含 20+ 种语法元素颜色。

### 📝 文档

新增以下文档文件：

1. **README.md** - 主题系统使用指南
   - 快速开始
   - API 说明
   - 最佳实践

2. **COLORS.md** - 配色参考文档
   - CSS 变量总览
   - 组件配色详情
   - 自定义主题指南

3. **theme-switcher.example.ts** - 主题切换示例代码
   - 组件示例
   - 服务示例
   - 高级用法

4. **CHANGELOG.md** - 本文件

### 🔧 使用方法

#### 引入主题
```json
// angular.json
{
  "styles": [
    "blockcraft/themes/light.scss",
    "blockcraft/themes/dark.scss"
  ]
}
```

#### 设置主题
```html
<!-- 浅色主题 -->
<div data-blockcraft-root="true" data-theme="light"></div>

<!-- 深色主题 -->
<div data-blockcraft-root="true" data-theme="dark"></div>
```

#### 动态切换
```typescript
const editor = document.querySelector('[data-blockcraft-root]');
editor?.setAttribute('data-theme', 'dark');
```

### 🎯 设计原则

1. **对比度优先** - 确保 WCAG AA 标准（4.5:1）
2. **层级分明** - 4 级背景层次
3. **一致性** - 与 Craft 风格保持一致
4. **可访问性** - 适合长时间使用
5. **性能优化** - 使用 CSS 变量，无 JS 依赖

### 🐛 已知问题

无

### 📋 TODO

- [ ] 添加更多预设配色方案（蓝色、绿色等）
- [ ] 支持用户自定义主题颜色
- [ ] 添加主题预览组件
- [ ] 集成到设置面板

### 🙏 致谢

配色灵感来源：
- [Craft](https://www.craft.do/) - 整体深色主题风格
- [Material Palenight](https://github.com/equinusocio/material-theme) - 代码高亮配色

---

## 技术细节

### 文件结构
```
blockcraft/themes/
├── base.scss                    # 基础样式（不变）
├── light.scss                   # 浅色主题（已存在）
├── dark.scss                    # 深色主题（新增）
├── function.scss                # 工具函数（更新）
├── blocks/                      # 各 block 样式（不变）
├── components/                  # 各组件样式（不变）
├── README.md                    # 使用文档（新增）
├── COLORS.md                    # 配色文档（新增）
├── CHANGELOG.md                 # 本文件（新增）
└── theme-switcher.example.ts   # 示例代码（新增）
```

### CSS 变量覆盖策略

深色主题通过 `[data-theme="dark"]` 选择器覆盖变量：

```scss
[data-blockcraft-root="true"][data-theme="dark"] {
  --bc-color: #e3e3e3;           // 覆盖基础变量
  
  .code-block {                   // 覆盖组件样式
    background-color: #1e1e1e;
  }
}
```

### 兼容性保证

- ✅ 不影响现有浅色主题
- ✅ 向后兼容所有 block 和组件
- ✅ 无需修改任何业务代码
- ✅ 可与现有样式系统共存

### 性能影响

- 文件大小增加约 15KB（未压缩）
- 运行时无性能损耗（纯 CSS）
- 主题切换瞬时完成（无动画开销）

---

**版本**: 1.0.0  
**作者**: Qoder AI  
**日期**: 2025-12-27
