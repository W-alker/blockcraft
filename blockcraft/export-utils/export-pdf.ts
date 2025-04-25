import {downloadFile} from "../global";
import {FetchUtils} from "../global/utils/fetch";
// @ts-ignore
import domtoimage from 'dom-to-image-more';

export const getCanvas = async (dom: HTMLElement) => {

  const dataUrl = await domtoimage.toPng(dom)
  const img = document.createElement('img')
  img.src = dataUrl;
  console.log('img', img)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = img.width
  canvas.height = img.height
  ctx.drawImage(img, 0, 0)

  // const {default: html2canvas} = await import('html2canvas-pro');
  //
  // const style = document.createElement('style');
  // document.head.append(style);
  //
  // const canvas = await html2canvas(dom, {
  //   ignoreElements: (element) => {
  //     if (element.localName === 'bc-context-handle') {
  //       return true;
  //     }
  //     return false;
  //   },
  //   onclone: async (document: Document, element) => {
  //     const editorElement = document.querySelector(
  //       '[contenteditable="true"]'
  //     );
  //     if (editorElement) {
  //       Array.from(editorElement.querySelectorAll('*')).forEach((element) => {
  //         const existingStyle = element.getAttribute('style') || '';
  //         element.setAttribute(
  //           'style',
  //           `${existingStyle}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important`
  //         );
  //       });
  //     }
  //
  //     await replaceImgSrcWithSvg(element)
  //   },
  //   allowTaint: true,
  //   useCORS: true
  // })
  //
  // style.remove();

  return canvas;
}

export const replaceImgSrcWithSvg = async (element: HTMLElement) => {
  const imgList = Array.from(element.querySelectorAll('img'));
  // Create an array of promises
  const promises = imgList.map(img => {
    return FetchUtils.fetchImage(img.src)
      .then(response => response && response.blob())
      .then(async blob => {
        if (!blob) return;
        // If the file type is SVG, set svg width and height
        if (blob.type === 'image/svg+xml') {
          // Parse the SVG
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(
            await blob.text(),
            'image/svg+xml'
          );
          const svgElement =
            svgDoc.documentElement as unknown as SVGSVGElement;

          // Check if the SVG has width and height attributes
          if (
            !svgElement.hasAttribute('width') &&
            !svgElement.hasAttribute('height')
          ) {
            // Get the viewBox
            const viewBox = svgElement.viewBox.baseVal;
            // Set the SVG width and height
            svgElement.setAttribute('width', `${viewBox.width}px`);
            svgElement.setAttribute('height', `${viewBox.height}px`);
          }

          // Replace the img src with the modified SVG
          const serializer = new XMLSerializer();
          const newSvgStr = serializer.serializeToString(svgElement);
          img.src =
            'data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(newSvgStr);
        }
      });
  });
}

export const exportToPdf = async (dom: HTMLElement) => {
  // const canvas = await getCanvas(dom);

  // domtoimage.toPng(dom).then((dataUrl: string) => {
  //   var img = new Image();
  //   img.src = dataUrl;
  //   document.body.appendChild(img);
  // })

  const PDFLib = await import('pdf-lib');
  const pdfDoc = await PDFLib.PDFDocument.create();
  const page = pdfDoc.addPage([dom.scrollWidth, dom.scrollHeight]);

  const dataUrl = await domtoimage.toPng(dom, {
    filter: (node: Node) => {
      if (node instanceof HTMLElement && node.localName === 'bc-drag-handle') {
        return false;
      }
      return true;
    }
  })
  const imageEmbed = await pdfDoc.embedPng(dataUrl)

  const {height, width} = imageEmbed.scale(1);
  page.drawImage(imageEmbed, {
    height,
    width,
    x: 0,
    y: 0,
  });
  const pdfBase64 = await pdfDoc.saveAsBase64({dataUri: true});

  await downloadFile(pdfBase64, 'plate.pdf');
};

export const exportToImage = async (dom: HTMLElement) => {
  const canvas = await getCanvas(dom);
  await downloadFile(canvas.toDataURL('image/png'), 'plate.png');
};

