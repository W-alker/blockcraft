import { Injectable, signal } from '@angular/core'

/**
 * 编辑器视图状态（**调试脚手架**）。当前只有「列宽百分比」一项：
 * 调试面板的宽度滑块**写**它，编辑 / 使用 surface **读**它来缩放 `.editor-container`，
 * 用来现场验证自适应（百分比物料随列宽等比缩放），不必去拖浏览器窗口。
 *
 * 放在 `debug-panel/` 下：它是调试脚手架，与调试面板同域、迁移时一并删除（见 CLAUDE.md 硬坑③：
 * `--tpl-editor-scale` + 宽度滑块不迁 cses）。⚠️ 目前编辑/使用 surface 仍读它驱动 `--tpl-editor-scale`，
 * 即「生产 surface → debug-panel」这一笔**临时反向依赖**——cses 迁移删掉那行缩放脚手架后此依赖自然消失。
 *
 * 按页 provide（见 `template-page` / `template-use-page` 的 `providers`）——同一页里调试面板与 surface
 * 注入到**同一实例**，省掉父子 `@Input`/`@Output` 串联；换页各自独立、随页销毁。
 */
@Injectable()
export class EditorViewState {
  /** 编辑器列宽占「自然宽 `min(908px, 100%−32px)`」的百分比，5–100。默认 100 = 不缩放（与原观感一致）。 */
  readonly widthPct = signal(100)
}
