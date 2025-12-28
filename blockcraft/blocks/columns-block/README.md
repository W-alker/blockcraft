# 多栏布局组件 (Columns Block)

## 📖 概述

多栏布局组件允许用户创建类似 Notion 的多栏内容布局，支持 2-6 栏的灵活配置。

## ✨ 特性

- ✅ **灵活栏数**：支持 2-6 栏布局
- ✅ **响应式设计**：小屏幕自动切换为单栏
- ✅ **可调间距**：支持 0/8/16/24/32px 间距
- ✅ **嵌套支持**：每栏可包含任意类型的块
- ✅ **暗色主题**：完整支持暗色模式
- ✅ **简洁工具栏**：直观的栏数/间距调整

## 🏗️ 架构设计

### 组件结构

```
columns-block (容器)
├── column-block (栏 1)
│   ├── paragraph
│   ├── image
│   └── ...
├── column-block (栏 2)
│   └── ...
└── column-block (栏 N)
    └── ...
```

### 数据模型

```typescript
interface ColumnsBlockModel {
  flavour: 'columns',
  nodeType: BlockNodeType.block
  props: {
    columnCount: number      // 栏数 (2-6)
    columnWidths: number[]   // 每栏宽度百分比
    gap: number              // 栏间距（px）
  }
  children: ColumnBlockModel[]
}

interface ColumnBlockModel {
  flavour: 'column',
  nodeType: BlockNodeType.block
  props: {}
  children: Block[]  // 可包含任意块
}
```

## 🚀 使用方法

### 1. 注册 Schema

```typescript
import { ColumnsBlockSchema, ColumnBlockSchema } from './blocks';

// 在 Schema 集合中注册
const schemas = [
  // ... 其他 schemas
  ColumnBlockSchema,
  ColumnsBlockSchema
];
```

### 2. 编程式创建

```typescript
// 创建 2 栏布局
const columns = doc.schemas.create('columns', 2);

// 创建 3 栏布局
const threeColumns = doc.schemas.create('columns', 3);

// 插入到文档
doc.crud.insertBlocks(index, [columns]);
```

### 3. 用户界面

组件提供内置工具栏，用户可以：
- 点击 `-` / `+` 调整栏数
- 点击平均分配按钮重置栏宽
- 点击间距按钮切换栏间距

## 🎨 样式定制

### CSS 变量

```css
.columns-block__container {
  /* 栏宽度通过 CSS 变量动态设置 */
  grid-template-columns: var(--col-0, 1fr) var(--col-1, 1fr);
  
  /* 间距 */
  gap: var(--column-gap, 16px);
}
```

### 自定义样式

```scss
// 自定义栏的背景色
.column-block {
  background: #f5f5f5;
  
  &:hover {
    background: #e8e8e8;
  }
}

// 自定义工具栏
.columns-block__toolbar {
  background: rgba(72, 87, 226, 0.05);
  border-color: rgba(72, 87, 226, 0.2);
}
```

## 📱 响应式设计

组件内置响应式支持：

```scss
@media (max-width: 768px) {
  .columns-block__container {
    grid-template-columns: 1fr !important;  // 强制单栏
  }
}
```

在小屏幕设备上，所有多栏布局会自动切换为单栏垂直排列。

## 🔧 高级用法

### 自定义栏宽比例

```typescript
// 创建 1:2 的两栏布局
const columns = doc.schemas.create('columns', 2);
columns.props.columnWidths = [33.33, 66.67];

// 创建 1:2:1 的三栏布局
const threeColumns = doc.schemas.create('columns', 3);
threeColumns.props.columnWidths = [25, 50, 25];
```

### 动态添加/删除栏

```typescript
const columnsBlock = doc.getBlockById('columns-id');

// 增加一栏
columnsBlock.setProp('columnCount', columnsBlock.props.columnCount + 1);

// 减少一栏
columnsBlock.setProp('columnCount', columnsBlock.props.columnCount - 1);
```

### 嵌套多栏

多栏组件支持嵌套使用：

```typescript
// 外层 2 栏
const outerColumns = doc.schemas.create('columns', 2);

// 在第一栏内再创建 2 栏
const innerColumns = doc.schemas.create('columns', 2);
outerColumns.children[0].insertChildren(0, [innerColumns]);
```

## ⚙️ API 参考

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| columnCount | number | 2 | 栏数 (2-6) |
| columnWidths | number[] | [50, 50] | 每栏宽度百分比数组 |
| gap | number | 16 | 栏间距（像素） |

### 方法

| 方法 | 参数 | 说明 |
|------|------|------|
| changeColumnCount | count: number | 改变栏数 |
| resetColumnWidths | - | 重置为平均分配 |
| toggleGap | - | 切换间距 (0/8/16/24/32) |

## 🎯 最佳实践

1. **栏数选择**
   - 2栏：适合并排对比、左右布局
   - 3栏：适合三等分内容、特性展示
   - 4+栏：适合图片画廊、卡片列表

2. **间距设置**
   - 0px：紧凑布局，适合表格式内容
   - 16px：默认值，适合大多数场景
   - 32px：宽松布局，适合强调分隔

3. **响应式考虑**
   - 始终测试小屏幕表现
   - 避免在栏内使用过宽的内容
   - 考虑单栏降级时的阅读体验

4. **性能优化**
   - 避免过多层级的嵌套
   - 单页面不建议超过 10 个多栏组件
   - 大量内容考虑使用虚拟滚动

## 🐛 已知问题

- [ ] 拖拽调整栏宽功能待实现
- [ ] 栏数减少时的内容迁移策略待优化
- [ ] 打印时的布局适配待完善

## 📚 相关组件

- `frame-block`: 基础容器块
- `table-block`: 表格布局
- `root-block`: 根容器

## 🔗 参考

- [Notion 多栏布局](https://www.notion.so/help/guides/adding-columns)
- [CSS Grid Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout)
