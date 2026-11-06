/** 求缩放上限只需要块的这三样，同样收窄成结构类型好让纯逻辑单测能喂假对象。 */
export interface FloatableBlock {
    /**
     * 框架算好的排版态，'absolute' = 浮于文字。**读它而不是自己从 props 推**：
     * 它额外兜住了「该 flavour 有没有声明 absolute 能力」，没声明的块即使 props 里躺着旧数据也仍判流内。
     * blockcraft 0.5.0 之后更没有别的路可走——排版态已不在 props 里（旧的 `props.placement.mode` 连字段
     * 都撤了），absolute 与否由结构决定（父级是不是 placement-layout / object-group），只有框架算得出。
     */
    placementPosition: 'absolute' | null;
    hostElement: HTMLElement;
    doc?: { objectSizing?: { rootContentElement: HTMLElement | null } } | null;
}

/** 这块此刻是不是浮于文字。也是 resizer `preserveRightEdge` 的开关，见下。 */
export function isBlockFloating(self: FloatableBlock): boolean {
    return self.placementPosition === 'absolute';
}

/**
 * 缩放上限的参照物（喂给 `<block-resizer [maxWidthContainer]>` / `<mtl-scale-resizer>`）。
 * **恒取 root 内容元素，两种排版态同一个答案。**
 *
 * **拿宿主当参照就是「只能缩小、不能放大」那个 bug**：resizer 在按下手柄那刻算上限
 * （`scale-resizer.component.ts` 里 `maxWidthContainer.clientWidth`），宿主一旦收缩到卡片宽，
 * 上限就恒等于卡片当前宽，`Math.min` 一夹往大拖全废；缩一次上限跟着降一次，成了只降不升的棘轮。
 *
 * 这个坑先后有两条路通向它，所以这里不再按排版态分叉：
 * 三类卡片现在都给宿主绑定固定像素宽高，但拖拽上限仍应取整栏宽，不能拿当前卡片宽当上限。
 *
 * 参照 root 内容元素是内置图片块的答案（`resizeMaxWidthContainer` + `preserveRightEdge`），
 * 照抄它而不是另立一套：同一个编辑器里两种块的缩放手感必须一致。
 * 代价是浮动块可以被拖得越过右边缘（上限是整栏宽、不扣 left 偏移），图片块同样如此，属既定口径。
 *
 * root 元素还没就绪（或 export/回放这类没有 objectSizing 的 surface）时回落宿主，不开天窗。
 */
export function resizeMaxWidthContainer(self: FloatableBlock): HTMLElement {
    return self.doc?.objectSizing?.rootContentElement ?? self.hostElement;
}
