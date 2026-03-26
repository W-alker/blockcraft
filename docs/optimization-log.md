# 数据结构优化记录

日期: 2026-03-24

---

## 1. ScrollBlot 前缀和索引 + leaves 缓存

**文件**: `packages/editor/framework/block-std/inline/blot/scroll-blot.ts`

**问题**: `_children` 是一个扁平数组，所有位置相关操作（`findByOffset`、`offsetOf`、`textLength`、`leaves`）都是 O(n) 线性扫描。`leaves` getter 每次调用都重新 filter 生成新数组。

**改动**:
- 新增 `_cachedLeaves` 和 `_prefixSums` 缓存数组，通过 `_ensureIndex()` 懒重建
- 所有变更方法（build、applyDelta、insert、remove、splice、cursor 操作）结束后调用 `_invalidateIndex()` 失效缓存
- `findByOffset()` 改为 O(log n) 二分查找
- `textLength` 改为 O(1)，直接取前缀和末尾值
- `leaves` 返回缓存数组，不再每次 filter
- 内部变更方法使用 `_filterLeaves()` 取新鲜快照，避免迭代中修改导致缓存失效问题

**复杂度变化**:

| 操作 | 优化前 | 优化后 |
|------|--------|--------|
| `findByOffset(offset)` | O(n) | O(log n) |
| `textLength` | O(n) | O(1) |
| `leaves` getter | O(n) 每次 filter | O(1) 缓存 |
| `offsetOf(blot)` | O(n) | O(n) 扫描，O(1) 前缀和查值 |

---

## 2. 修复 native2Y 重复推入 bug

**文件**: `packages/editor/framework/block-std/reactive/block.ts`

**问题**: `native2Y` 函数缺少 `else` 分支，导致：
- 数组路径：object 类型值被推入两次（转换后的 Y 类型 + 原始值）
- Map 路径：object 类型值被 set 两次（转换值立即被原始值覆盖）

**改动**: 为 Array 和 Map 两个分支都加上 `else`，保证每个值只处理一次

```typescript
// 修复前：
if (v != null && typeof v === 'object') {
  arr.push(native2Y(v))
}
arr.push(v)  // 始终执行，导致重复

// 修复后：
if (v != null && typeof v === 'object') {
  arr.push(native2Y(v))
} else {
  arr.push(v)
}
```

---

## 3. 一致性检查优化

**文件**: `packages/editor/framework/block-std/block/component/editable-block.ts`

**问题**: `_verifyBlotConsistency()` 在每次 `_applyDeltaToView()` 后调用，执行全量遍历 Yjs deltas 和 blot leaves 构建文本字符串再比对，两步都是 O(n)。

**改动**: 增加 O(1) 长度快速校验前置门控：

```typescript
// 快速路径：长度不一致直接返回 false
if (this.yText.length !== this._runtime.scrollBlot.textLength) {
  return false
}
// 长度一致时才走全量文本比对
```

因为 `scrollBlot.textLength` 已经是 O(1)（优化 #1），快速路径几乎零开销。绝大多数真实不一致都是长度差异，全量比对只在长度相同时才执行。

---

## 4. blot _childIndex 字段

**文件**:
- `packages/editor/framework/block-std/inline/blot/blot.ts`
- `packages/editor/framework/block-std/inline/blot/scroll-blot.ts`

**问题**: ScrollBlot 中有 16 处 `_children.indexOf(blot)` 调用，每次 O(n)。

**改动**:
- 在 `LeafBlot` 上新增 `_childIndex` 字段（初始值 -1）
- `_ensureIndex()` 重建时同时为每个 blot 赋值 `_childIndex`
- 新增 `_childIndexOf(blot)` 方法：先检查 `_childIndex` 是否有效（O(1)），无效时回退到 `indexOf`
- 全部 16 处 `_children.indexOf()` 替换为 `_childIndexOf()`

**效果**: 缓存命中时 O(1)，缓存冷态（变更后、下次 `_ensureIndex()` 前）回退到 O(n)。
