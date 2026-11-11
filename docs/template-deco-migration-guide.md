# 模板装饰 → cses-client 移植说明（步骤 + 注意事项）

> 结论先行：playground 的 `apps/playground/src/app/template-deco/` 只是验证场；最终落地
> `/Users/mac06/projects/cses-client`（已依赖 `@ccc/blockcraft 0.2.78`）。那边**已有**参数化编辑器宿主
> `BlockCraftEditor` 和成熟的模板 render/preview/service 层，**没有**模板编辑页（绿地新建）。
> 移植 = 核心域整段照搬 + 宿主骨架换用 cses 现成件，playground 的 surface 样板不搬。
>
> 现状核对时间：2026-07-15。cses 侧文件行号以当时代码为准，动手前先复核。

## 一、cses 侧现状（移植的落点）

| 现成件 | 位置 | 与移植的关系 |
|---|---|---|
| 快照形态编辑器宿主 `BlockCraftEditor`（`IEditorConfigs{schemas/plugins/readonly/theme/scrollContainer}`） | `src/pages/docs/editor/blockcraft-editor.ts` | **模板编辑页/使用页的宿主**，替代 playground 两个 surface 手写的启动骨架 |
| 字典与插件常量（`SchemaStore` 等多套并存） | `src/pages/docs/editor/const.ts` | 新增 `TemplateEditSchemaStore` / `TemplateRenderSchemaStore` 的归宿 |
| 文档页（协同 Yjs 形态，宿主 `<doc-editor>`） | `src/pages/docs/pages/document/document.page.ts` | 参照它的页面模块组织，不复用其协同链路 |
| 模板只读预览 | `src/pages/docs/components/template-preview/` | 与模板编辑页并存，不冲突 |
| 模板服务 | `src/pages/docs/services/doc-template.service.ts` | 替代 playground 的 `TemplateStore`（localStorage） |

## 二、移植步骤

1. **核心排版域整段照搬**：`core/placement.ts`（三态编码、坐标系、`guardDecoDeletion` 删除卫兵、
   `normalizeTemplateSnapshots` 载入自愈、`handleContainerBlankMousedown` 空白点击）——这是 cses 没有的净新增能力，勿重造。
2. **物料与容器照搬**：`decos/`（含 `_shared/` 的 `PlaceableDecoBase`/`PlaceableEditBase` 继承链、`free-drag`、`page-size`（含 `wireColumnZoom`））、
   `core/layout.block.ts`（注意它是 **schema 工厂** `createTemplateLayoutSchema(includeChildren)`）、
   `core/underlay-pick.directive.ts`、`core/active-deco.service.ts`、`embeds/`、`palette/`。
3. **注册融入 cses 常量层**：`core/registry.ts` 的 `DECOS/EMBEDS/MATERIALS` 概念搬进 `editor/const.ts` 风格；
   layout 白名单**必须**继续用 `DECOS.map(d => d.def.flavour)` 自动派生（手工清单会脱节且漏改不报错）。
   `flavours.ts` 的 `declare global` 增强一并带走。
4. **页面骨架不搬**：模板编辑页 / 使用页用 cses 现成的 `BlockCraftEditor` 宿主（传 `IEditorConfigs`），
   playground 两个 surface（`surfaces/template-edit.ts` / `template-use.ts`）里手写的
   建 doc / CSS / 启动样板是**将被替换的部分**——只搬其中三样接线（见步骤 5-7）。
5. **载入自愈接在灌快照之前**：任何"把模板快照灌进 doc"的入口（编辑页 restore、使用页 loadTemplate、
   从模板建文档）都先过 `normalizeTemplateSnapshots(children)`（悬浮物料归位 layout、layout 钉底、坏数据矫正）。
6. **删除卫兵两个面都挂**：编辑页与使用页建 doc 后 `guardDecoDeletion(doc, containerEl)`，destroy 时
   `unsubscribe()` 成对；containerEl = 编辑器容器（卫兵靠**容器捕获阶段**先于框架拿到按键，挂错层级失效）。
7. **持久化替换**：`TemplateStore`（localStorage）→ `DocTemplateService` / 后端接口；
   整页背景图与快照一起存取（playground 的 payload 形状可参照）。
8. **图片资源替换**：playground 用 data URL（`decos/_shared/image-pick.ts` 注释写明了原因与替换点）；
   cses 有真实文件服务，改走上传 + URL。

## 三、注意事项（踩过的坑，按重要度排）

1. **坐标系的三条框架依赖**（破坏 = 已存模板的悬浮物料集体静默漂移，不报错）：
   - `themes/base.scss` 给所有 `[data-block-id]` 的 `position:relative`（物料坐标的参照系是 root 块）；
   - root 块宿主不能有 padding/border（内容区原点假设）；
   - layout 容器 host 内联 `absolute top:0 left:0 width:100%`（与 root 块盒完全重合，迁移零改坐标的前提）。
   升级 `@ccc/blockcraft` 后这三处有变动要重验（浮起前后量 rect 应一致）。
2. **删除保护的边界（2026-07-15 实测结论）**：正常路径全安全——真实 Cmd+A 两段式的选区终点落在最后一个
   内容块（不在 layout），全选后**打字 / 剪切 / 粘贴替换实测都不碰 layout**（框架按选区范围删）。
   唯一杀伤态是"选区端点以 selected 形式停在 layout 上"，卫兵的吸附层 150ms 内自愈、Backspace/Delete
   有键盘墙兜底；打字/剪切/粘贴在该病理态无墙（可 Ctrl+Z 恢复）。长期方案见 `docs/template-deco-lock-plan.md`（框架级 meta 锁）。
3. **undo 合并窗依赖**：首次浮起 = `ensureLayout`（事务外懒建，组件就绪时序所迫）+ 迁移事务，
   两事务靠 Y.UndoManager `captureTimeout`(500ms) 合并成一步撤销——框架若改 captureTimeout 或中间插异步，
   会退化成两步（仅 UX）。根治方案：doc 初始化时就带上 layout 节点（初始树 `[段落, layout]`）。
4. **物料删除靠点名**：面板删除钮，或单选该物料后 Backspace/Delete（卫兵对"单块整选"放行框架）；悬浮物料
   键盘选不中，面板钮是其唯一删除入口。批量删除 = 清正文，跨度内流内物料就地量坐标转悬浮归位
   layout（不是跳过留原地）。剪切/打字路径的流内物料现随正文一起删（与退格路径不一致，产品层待定）。
5. **z<0 衬底物料的拾取限制**：被正文全宽块盖住，未选中时只有边缘 8px 环带可点/可拖（`underlay-pick`），
   露在文字区外的部分整图可拖；**选中后整图可拖**（点名即临时抓取优先权，点别处取消）。
   灵敏度调整只涉及 `BAND` 常量与命中规则，机制勿动（未选中的中间区域必须让给正文编辑）。
6. **层级只有三档**（文字下 -1 / 默认 null / 置顶 10，面板分段器）——数字 z 已弃用；老数据任意 z 按符号归档。
7. **图标规范**：物料面板图标走 iconfont sprite（`svgIcon: 'bc_*-color'`），cses 侧确认同一套字体资源已引入。
8. **锁/只读**：逐块锁在 playground 只做了准真锁验证，结论与后续计划见 `docs/template-deco-lock-plan.md`、
   `docs/template-deco-size-lock-design.md`。

## 四、移植后的验收清单（照 playground 的实测矩阵走一遍）

- [ ] 三态互切（独占/环绕/悬浮）位置定格、一步撤销
- [ ] 全选删除：正文清、物料归位 layout、layout 恒末尾、一步撤销全回滚
- [ ] 载入坏形态快照自愈（layout 居中/悬浮物料流浪/流内物料误存 layout）
- [ ] 环绕/独占不与上方物料并排（clear:both）
- [ ] 使用页同套卫兵生效
- [ ] 衬底（文字下）物料边缘可选可拖
