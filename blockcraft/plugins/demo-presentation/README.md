# 演示模式功能使用说明

## 功能概述

演示模式插件提供两种模式：
1. **预览模式（Preview Mode）**：隐藏所有编辑工具，只读浏览
2. **演示模式（Presentation Mode）**：全屏展示，分页呈现，类似 PPT

### 演示模式特点

- ✅ **真正的分页展示**：每次只显示当前页的内容
- ✅ **内容克隆**：使用 `cloneNode()` 克隆内容块，不影响原文档
- ✅ **独立容器**：在独立的全屏容器中展示，原文档保持不变
- ✅ **平滑过渡**：页面切换时带有淡入淡出动画
- ✅ **渐进显示**：页面内的块逐个淡入显示

## 快速开始

### 1. 注册插件

在创建 `BlockCraftDoc` 时添加插件：

```typescript
import { DemoPresentationPlugin } from './plugins/demo-presentation';

const doc = new BlockCraftDoc({
  // ... 其他配置
  plugins: [
    // ... 其他插件
    new DemoPresentationPlugin()
  ]
});
```

### 2. 使用演示模式

#### 进入演示模式

```typescript
// 进入演示模式（全屏）
doc.enterDemoMode('presentation');

// 进入预览模式（只读）
doc.enterDemoMode('preview');

// 带自定义配置
doc.enterDemoMode('presentation', {
  presentation: {
    unfocusedOpacity: 0.2,  // 非聚焦块的透明度
    showProgress: true,      // 显示进度
    autoHideControls: true,  // 自动隐藏控制栏
  }
});
```

#### 退出演示模式

```typescript
doc.exitDemoMode();
```

## 分页规则

演示模式会自动将文档分页，分页标记包括：

1. **Divider 块**：分割线
2. **带有 heading 属性的块**：如标题块
3. **Callout 块**：提示框

示例文档结构：
```
段落1
段落2
─────── (Divider - 分页)
标题1 (Heading - 分页)
内容1
内容2
─────── (Divider - 分页)
Callout (分页)
结尾段落
```

会被分为 4 页展示。

## 键盘快捷键

在演示模式下：

- `↓` / `→` / `Space` / `PageDown` - 下一页
- `↑` / `←` / `PageUp` - 上一页
- `Home` - 跳转到第一页
- `End` - 跳转到最后一页
- `Esc` - 退出演示模式

在预览模式下：

- `Esc` - 退出预览模式

## 鼠标交互

在演示模式下，点击屏幕：
- 上半部分 - 上一页
- 下半部分 - 下一页

## 控制栏

演示模式下会显示浮动控制栏（自动隐藏），包含：
- 上一页按钮
- 进度指示（当前页/总页数）
- 下一页按钮
- 退出按钮

鼠标移动时控制栏会显示，3秒无操作后自动隐藏。

## 配置选项

```typescript
interface DemoConfig {
  mode: 'preview' | 'presentation';
  presentation?: {
    focusStrategy: 'viewport';        // 聚焦策略
    unfocusedOpacity: number;         // 非聚焦块透明度 (0-1)
    showProgress: boolean;            // 是否显示进度
    autoHideControls: boolean;        // 是否自动隐藏控制栏
    autoHideDelay: number;            // 自动隐藏延迟（毫秒）
    enableTransition: boolean;        // 是否启用过渡动画
    transitionDuration: number;       // 过渡动画时长（毫秒）
  };
  preview?: {
    showToolbar: boolean;             // 是否显示工具栏
  };
}
```

## 注意事项

1. 演示模式会自动设置文档为只读状态
2. 退出演示模式后会恢复原有的只读状态
3. 全屏模式使用浏览器原生 API，需要用户交互触发
4. 如果文档中没有分页标记，所有内容会作为一页展示
5. 连续的分页标记会自动合并，避免空白页
6. **演示模式使用克隆的内容**，原文档不会受影响
7. 克隆的内容是静态的，不具有交互功能
