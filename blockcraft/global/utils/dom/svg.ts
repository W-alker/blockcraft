export function svg2Base64(svgElement: SVGElement) {
  const svgString = new XMLSerializer().serializeToString(svgElement);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
}

interface Svg2CanvasOptions {
  backgroundColor?: string;
}

export function svg2Canvas(svgElement: SVGElement, options: Svg2CanvasOptions = {}): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!

  if (options.backgroundColor) {
    ctx.fillStyle = options.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const img = new Image();
  return new Promise((resolve) => {
    img.src = svg2Base64(svgElement);

    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      resolve(canvas)
    }
  })
}

export function svg2ImageElement(svgElement: SVGElement) {
  const svgBase64 = svg2Base64(svgElement)

  const img = document.createElement('img');
  img.src = svgBase64;
  img.width = svgElement.clientWidth;
  img.height = svgElement.clientHeight;

  return img;
}
