export interface FixedResizeCommit {
    width: number;
    height: number;
    /** 左手柄缩放浮动对象时，对 position.x 的同步补偿。 */
    positionDeltaX: number;
}

export interface FixedResizeInput {
    side: 'left' | 'right';
    startClientX: number;
    clientX: number;
    startUnit: number;
    startWidth: number;
    startHeight: number;
    minUnit: number;
    maxUnit: number;
    /** BlockCraft 文档布局像素到屏幕视觉像素的实测比例。 */
    geometryScale: number;
    preserveRightEdge: boolean;
}

export interface FixedResizePreview extends FixedResizeCommit {
    unit: number;
}

interface FixedResizeWidthClampStyle {
    maxWidth: string;
}

/** 手势期间解除目标自身的 100% 限宽；真正上限仍由缩放几何的 maxUnit 控制。 */
export function releaseFixedResizeWidthClamp(style: FixedResizeWidthClampStyle): string {
    const original = style.maxWidth;
    style.maxWidth = 'none';
    return original;
}

/** 结束、取消和销毁共用同一条恢复路径。 */
export function restoreFixedResizeWidthClamp(style: FixedResizeWidthClampStyle, original: string): void {
    style.maxWidth = original;
}

/**
 * 固定对象缩放的唯一几何公式。输入的指针坐标是视觉像素，输出的宽高与位置补偿都是文档布局像素。
 * 预览和松手提交共用返回值，避免页面缩放不为 100% 时把视觉尺寸误存成模型尺寸。
 */
export function calculateFixedResize(input: FixedResizeInput): FixedResizePreview {
    const geometryScale = Number.isFinite(input.geometryScale) && input.geometryScale > 0
        ? input.geometryScale
        : 1;
    const visualDelta = input.side === 'right'
        ? input.clientX - input.startClientX
        : input.startClientX - input.clientX;
    const layoutDelta = visualDelta / geometryScale;
    const wantedUnit = input.startUnit * ((input.startWidth + layoutDelta) / input.startWidth);
    const unit = Math.min(input.maxUnit, Math.max(input.minUnit, wantedUnit));
    const scale = unit / input.startUnit;
    const width = input.startWidth * scale;
    const height = input.startHeight * scale;

    return {
        unit,
        width,
        height,
        positionDeltaX: input.preserveRightEdge && input.side === 'left'
            ? input.startWidth - width
            : 0
    };
}
