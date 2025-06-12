export interface Svg2CanvasOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
}

export function svg2Canvas(svgElement: SVGElement, options: Svg2CanvasOptions = {}): Promise<HTMLCanvasElement> {
  const svgString = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      // 真实尺寸优先：传入的尺寸 > svg 的 viewBox 或宽高 > 图片自然尺寸
      const width = options.width || img.width;
      const height = options.height || img.height;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d')!;
      if (options.backgroundColor) {
        ctx.fillStyle = options.backgroundColor;
        ctx.fillRect(0, 0, width, height);
      }

      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(url); // 清理资源
      resolve(canvas);
    };

    img.src = url;
  });
}

export const svg2Png = async (svgElement: SVGElement, options: Svg2CanvasOptions = {}) => {
  const canvas = await svg2Canvas(svgElement, options);
  return canvas.toDataURL('image/png');
}

