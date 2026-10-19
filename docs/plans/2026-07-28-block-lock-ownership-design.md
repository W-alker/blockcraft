# Block 锁所有权设计

- 日期：2026-07-28
- 状态：已实现并完成关键回归验证
- 范围：BlockCraft 编辑器的块级只读能力

## 1. 背景

当前块级只读状态持久化为 `meta.readonly?: boolean`。任何运行兼容客户端
的人都可以调用解锁入口删除该标记，编辑器无法区分锁的创建者和其他用户。

本次改造将“是否只读”和“谁拥有锁”合并为一个原子字段，使普通客户端只能
解除自己创建的锁，同时允许宿主按业务权限授权管理员强制解锁。

## 2. 目标

- 将块锁持久化为所有者用户 ID，而不是布尔值。
- 默认仅锁所有者可以解锁。
- 允许宿主通过同步策略额外授权管理员或文档所有者解锁。
- 保持祖先锁对子树的继承，以及现有输入、结构变更和历史记录守卫。
- 未提供用户身份时仍可编辑未锁内容，但不能加锁或解锁。
- 不给输入、选区、鼠标移动等高频路径增加权限回调或 DOM 查询。
- 复制块时不复制锁。

## 3. 非目标

- 不兼容、不迁移旧的 `meta.readonly` 数据。
- 不提供多人共同持有同一个锁的语义。
- 不允许通过加锁操作覆盖或抢占其他用户的锁。
- 不把客户端校验视为服务端安全边界。
- 不在本次改造中修改 `packages/editor/package.json` 的版本号。

## 4. 领域模型

### 4.1 持久化数据

```ts
interface IBaseMetadata {
  lock?: string
}
```

`lock` 的值直接是锁所有者的非空 `userId`：

- 字段不存在：块没有显式锁。
- 字段为非空字符串：块被该用户显式锁定。
- 子块不持久化继承状态；继承关系继续由 `BlockReadonlyManager` 根据
  `BlockModelGraph` 实时解析。

使用单个字符串字段可以在一次 `Y.Map` 写入中同时表达锁状态与所有者，避免
两个独立字段在 CRDT 同步时形成“有锁无所有者”或“有所有者无锁”的非法组合。

旧的 `meta.readonly` 将从公开类型和运行时解析中移除。包含该字段的历史文档
不会被视为已锁，也不会在初始化或写入时自动迁移。

### 4.2 当前用户和宿主授权

`DocConfig` 新增：

```ts
interface BlockUnlockContext {
  blockId: string
  lockUserId: string
  currentUserId: string | null
}

interface DocConfig {
  currentUserId?: string
  canUnlockBlock?: (context: BlockUnlockContext) => boolean
}
```

规则：

1. `currentUserId` 是当前 `BlockCraftDoc` 实例的固定身份，必须是非空字符串
   才能执行锁控制。
2. `lockUserId === currentUserId` 时，锁所有者始终可以解锁。
3. 非所有者只有在 `canUnlockBlock(context) === true` 时可以解锁。
4. `canUnlockBlock` 是附加授权而不是所有者权限的覆盖器，不能禁止所有者解锁。
5. 回调必须同步、纯读，不应请求网络；它只在权限查询和解锁入口执行。
6. 没有 `currentUserId` 时，未锁内容仍可编辑，但加锁和解锁都被拒绝。

用户显示名、角色和组织权限仍由宿主所有。框架只持久化稳定用户 ID，不把
Awareness 光标用户当作权限身份来源。

## 5. 公共 API

保留现有入口的调用形态：

```ts
doc.setBlockReadonly(blockOrId, true)
doc.setBlockReadonly(blockOrId, false)
doc.isBlockReadonly(blockOrId)
```

语义调整为：

- `true`：用 `DocConfig.currentUserId` 创建显式锁。
- `false`：校验所有者或宿主授权后删除显式锁。

新增权限查询：

```ts
doc.canUnlockBlock(blockOrId): boolean
```

`BlockReadonlyResolution` 增加有效锁所有者：

```ts
interface BlockReadonlyResolution {
  readonly: boolean
  source: BlockReadonlySource
  lockUserId: string | null
}
```

- 文档级只读的 `lockUserId` 为 `null`。
- 显式锁返回当前块的锁用户 ID。
- 继承锁返回锁源祖先的用户 ID。
- 未锁定时为 `null`。

`BlockReadonlyManager` 内部提供显式锁所有者查询和 `canUnlock` 判断，抓手菜单
不直接读取或修改 Yjs。

## 6. 命令规则

### 6.1 加锁

加锁必须依次满足：

1. 块仍可从 `BlockModelGraph` 到达。
2. 目标不是 Root。
3. `currentUserId` 是非空字符串。
4. 目标没有其他用户的显式锁。
5. 目标没有继承祖先锁。

目标已经由当前用户显式锁定时，加锁是幂等操作。目标已由其他用户锁定时，
不得覆盖其 `meta.lock`。管理员也不通过“加锁”抢占所有权；需要先明确解锁，
再以自己的身份重新加锁。

### 6.2 解锁

解锁只作用于当前块的显式锁：

1. 当前块只有继承锁时拒绝，调用方应转到 `source.blockId`。
2. 当前用户是锁所有者时允许。
3. 否则仅在宿主 `canUnlockBlock` 返回 `true` 时允许。
4. 没有身份或授权时拒绝，不修改 Yjs。
5. 已经未锁定的目标视为幂等完成。

锁控制继续使用 `ORIGIN_BLOCK_READONLY_CONTROL`，同步并持久化，但不进入普通
内容 Undo/Redo 历史。

### 6.3 内容守卫

现有内容守卫语义保持不变：

- 显式锁和继承锁都会阻止文本、格式、属性、插入、删除、替换、移动、剪切、
  粘贴以及受影响的 Undo/Redo。
- 未锁祖先包含锁定后代时，祖先不能被删除或移动。
- 选区、复制、链接访问、媒体预览和下载仍然可用。

## 7. 管理器与缓存

`BlockReadonlyManager` 将显式锁索引从 `Set<string>` 调整为
`Map<string, string>`：

```ts
Map<blockId, lockUserId>
```

- 初始化只扫描可达块的 `meta.lock` 非空字符串。
- `onMetaUpdate$` 只关心 `lock` key。
- 有效只读解析继续使用结构路径和 resolution cache。
- 子树锁计数继续按显式锁 block ID 延迟重建，不复制结构索引。
- 结构变化、锁变化和文档只读变化继续失效相同的缓存。
- 输入守卫只读取缓存后的有效只读结果，不调用 `canUnlockBlock`。

该调整保持常见查询的时间复杂度不变：

- 显式锁查询：`O(1)`。
- 缓存命中的有效只读查询：`O(1)`。
- 缓存未命中：沿当前块祖先路径解析。
- 子树锁计数：仅在权限或结构 revision 变化后延迟重建。

## 8. UI 行为

BlockController 抓手菜单中的锁开关按以下规则呈现：

| 状态 | 开关 | 描述 |
|---|---|---|
| 未锁且有当前用户 | 未选中、可用 | 无 |
| 未锁但无当前用户 | 未选中、禁用 | 未识别当前用户 |
| 当前用户显式锁定 | 选中、可用 | 无 |
| 其他用户显式锁定，无额外授权 | 选中、禁用 | 由其他用户锁定 |
| 其他用户显式锁定，有额外授权 | 选中、可用 | 无 |
| 继承祖先锁 | 选中、禁用 | 由上级内容块锁定 |

锁定块继续保留复制和真正的只读菜单项。UI 的禁用只是体验层，点击处理器和
文档 API 必须重新校验权限，避免菜单打开后权限或远程状态变化造成越权。

框架不直接显示原始用户 ID。自定义菜单可以从 resolution 中读取
`lockUserId`，再由宿主映射成显示名。

## 9. 快照、复制和适配器

- 完整文档 snapshot 和 Yjs 持久化保留 `meta.lock`。
- Clipboard 在生成内部 snapshot、HTML、Markdown 和纯文本前递归移除
  `meta.lock`，粘贴出的副本默认可编辑。
- HTML/Markdown 导入不创建锁。
- HTML/Markdown 导出不暴露锁字段。
- 普通块转换、拆分、合并和新建 snapshot 不继承源块的锁，除非它们是在
  保留同一 block ID 的原位属性/文本更新中。

## 10. 协同与安全边界

本设计提供可信客户端权限控制。所有兼容客户端通过相同 API 和守卫时，普通
用户不能解除其他用户的锁。

Yjs 远程 update 不携带可被编辑器信任的业务用户身份。恶意或旧客户端仍可
直接构造 update 删除 `meta.lock`，其他客户端只能观察最终 CRDT 状态，不能
证明删除者是否有权限。因此：

- 远程 `meta.lock` 变化仍正常应用、刷新缓存和视图。
- 框架不尝试回滚无法归因的远程锁变化，避免形成同步振荡。
- 安全敏感的宿主必须在协同服务端或持久化边界再次验证权限。

同一 `meta.lock` key 的并发写入按 Yjs 冲突规则收敛为一个最终字符串。框架
禁止通过本地 API 覆盖已有的他人锁，但不能把这一客户端约束提升为服务端
互斥锁。

## 11. 错误与反馈

程序化加锁或解锁失败时抛出可识别的锁权限错误，至少区分：

- 缺少当前用户身份。
- Root 不允许块锁。
- 目标继承祖先锁。
- 锁由其他用户持有。
- 当前用户无解锁授权。
- block 已失效或不可达。

直接用户操作继续通过现有 `DocMessageService.warn` 节流反馈。内容修改沿用
“内容已锁定，无法修改”；锁控制失败使用更明确的提示，例如“无权解除其他
用户的锁”。程序化 `api` 调用只抛错，不产生 toast。

## 12. 测试矩阵

### 12.1 领域与数据

- `meta.lock` 非空字符串被索引，缺失、空字符串和非字符串不构成锁。
- 所有者可以解锁，其他用户不能解锁，管理员策略可以解锁。
- 没有当前用户时不能加锁或解锁。
- 其他用户的锁不能被加锁操作覆盖。
- 同一用户重复加锁、已解锁目标重复解锁保持幂等。
- Root 不能加锁。
- 祖先锁继承、最近锁源和锁所有者解析正确。
- 锁源移动、删除、远程新增和远程删除后缓存正确失效。
- 旧 `meta.readonly` 不再产生锁。

### 12.2 UI

- 抓手菜单覆盖所有身份、所有者、管理员、继承锁状态。
- 菜单打开后远程修改锁，执行动作时会重新校验。
- 锁定块仍可复制，其他变更菜单保持禁用或隐藏。

### 12.3 数据边界

- 完整导出保留 `lock`。
- Clipboard 各格式均移除 `lock`。
- 粘贴、转换、拆分和新建块不会复制锁所有权。

### 12.4 回归

- 普通输入、IME、selected 选区替换、跨块删除。
- Undo/Redo、拖拽、剪切和粘贴。
- 表格列宽、媒体尺寸和其他 props 修改。
- 虚拟化下未挂载块的锁查询与远程刷新。
- 现有 block readonly 测试、编辑器构建和关键 E2E。

## 13. 文档与发布

这是持久化 schema、`DocConfig`、公开只读解析结果和默认行为的变更。实现时
必须同步：

- `packages/editor/ai-skills/blockcraft.md`
- `packages/editor/ai-skills/blockcraft-app.md`
- `packages/editor/ai-skills/blockcraft-block.md`
- `packages/editor/ai-skills/blockcraft-data.md`
- `packages/editor/ai-skills/blockcraft-plugins-block.md`
- `packages/editor/ai-skills/MIGRATIONS.md`

所有被修改的 ai-skills 文档更新顶部 `Last updated:` 日期。迁移条目明确说明
`meta.readonly` 被 `meta.lock?: string` 替代、宿主如何提供当前用户和管理员
策略，以及旧数据不会自动迁移。

除非用户另行要求，不修改 `packages/editor/package.json` 版本号，也不自动
提交工作区改动。

## 14. 已确认决策

- 身份从 `DocConfig` 注入，不依赖 Awareness。
- 默认仅所有者解锁，宿主可额外授权管理员。
- `currentUserId` 可选；缺失时禁止锁控制但不影响未锁内容编辑。
- 持久化字段使用 `meta.lock?: string`。
- 不兼容旧 `meta.readonly`。
- 当前范围是可信客户端权限控制，不包含服务端强授权。

## 15. 实现与验证结果

- `meta.lock?: string`、`DocConfig.currentUserId`、`canUnlockBlock` 和
  `BlockLockError` 已落地。
- BlockController 已覆盖所有者、其他用户、管理员授权、缺少身份和继承锁状态。
- Clipboard 会递归移除复制快照中的锁所有权。
- 锁相关单元回归 330 项通过，Block readonly E2E 4 项通过。
- `pnpm build:editor` 通过；未修改包版本，未创建 Git commit。
