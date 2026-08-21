/**
 * 对象工具条（WordArt / Shape 等浮动工具条）的交互归属判定。
 *
 * 谁用：word-art-toolbar、shape-toolbar 等在 selectionChange 里决定
 * 「选区暂时丢失时要不要保住工具条」的插件。
 * 为什么：工具条面板里的取色器、下拉、数字输入会抢走原生焦点/选区；
 * 若不识别这些点击属于工具条自身，插件会误把工具条整个关掉。
 */
export function isObjectToolbarOwnedTarget(
  toolbarElement: Element | null | undefined,
  target: Element | null,
): boolean {
  if (!target || !toolbarElement) return false
  if (toolbarElement.contains(target)) return true

  // CSES 取色器/下拉把面板挂成兄弟 CDK overlay；仅当工具条内对应控件
  // 处于展开态时，才把这些面板视为工具条的一部分。
  const ownsOpenColorPicker = !!toolbarElement.querySelector(
    'cs-color-picker.cs-color-picker-open',
  )
  if (
    ownsOpenColorPicker &&
    !!target.closest('.cs-color-picker-overlay-pane .cs-color-picker-panel')
  ) {
    return true
  }
  const ownsOpenSelect = !!toolbarElement.querySelector(
    'cs-select.cs-select-open',
  )
  if (
    ownsOpenSelect &&
    !!target.closest('.cs-select-panel .cs-select-dropdown')
  ) {
    return true
  }

  // BcOverlayTrigger 打开的子浮层与工具条内的触发器共享 data-float-id 链。
  const binding = target.closest<HTMLElement>(
    '[data-float-binding][data-float-id]',
  )
  const bindingId = binding?.getAttribute('data-float-id')
  if (!bindingId) return false
  return Array.from(
    toolbarElement.querySelectorAll<HTMLElement>(
      '[data-float-binding][data-float-id]',
    ),
  ).some(
    (candidate) => candidate.getAttribute('data-float-id') === bindingId,
  )
}

/**
 * 工具条内的触发器当前是否有展开中的子浮层（填充面板、粗细下拉等）。
 *
 * 为什么：子浮层（尤其含表单控件的面板）挂载后，浏览器可能派发一次
 * 杂散 selectionchange 使模型选区被清空，而焦点并未离开编辑器——
 * 仅靠 activeElement 判定会误关工具条。面板开着本身就是「交互归属
 * 在工具条」的确定信号。
 */
export function hasOpenOwnedSubOverlay(
  toolbarElement: Element | null | undefined,
): boolean {
  if (!toolbarElement) return false
  return Array.from(
    toolbarElement.ownerDocument.querySelectorAll<HTMLElement>(
      '.cdk-overlay-container [data-float-binding][data-float-id]',
    ),
  ).some(overlay =>
    !toolbarElement.contains(overlay) &&
    isObjectToolbarOwnedTarget(toolbarElement, overlay),
  )
}
