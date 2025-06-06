export function svg2Base64(svgElement: SVGElement) {
  const svgString = new XMLSerializer().serializeToString(svgElement);
  const svgBase64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  return svgBase64;
}

export function svgToImageElement(svgElement: SVGElement) {
  // 1. 获取 SVG 的 XML 内容
  const svgString = new XMLSerializer().serializeToString(svgElement);

  // 2. 编码为 Data URL
  const svgBase64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

  // 3. 创建 <img> 元素
  const img = document.createElement('img');
  img.src = svgBase64;
  img.width = svgElement.clientWidth;
  img.height = svgElement.clientHeight;

  return img;
}
