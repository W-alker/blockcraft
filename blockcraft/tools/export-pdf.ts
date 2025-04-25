import {downloadFile} from "../global";
// @ts-ignore
import domtoimage from './dom-to-image.js';

export const getCanvas = async (dom: HTMLElement) => {

  const dataUrl = await domtoimage.toPng(dom)
  const img = document.createElement('img')
  img.src = dataUrl;

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

const DOC_EXPORT_OPTIONS = {
  filter: (node: Node) => {
    if (node instanceof HTMLElement && node.localName === 'bc-drag-handle') {
      return false;
    }
    return true;
  },
  quality: 1.0
}

/**
 * Export to PDF
 * @param dom DOM element
 * @param scale scale factor. The larger this value, the larger the exported file
 */
export const exportToPdf = async (dom: HTMLElement, scale = 1) => {
  const PDFLib = await import('pdf-lib');
  const pdfDoc = await PDFLib.PDFDocument.create();
  const page = pdfDoc.addPage([dom.scrollWidth * scale, dom.scrollHeight * scale]);

  const dataUrl = await domtoimage.toJpeg(dom, {DOC_EXPORT_OPTIONS, scale})
  const imageEmbed = await pdfDoc.embedJpg(dataUrl)

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

export const exportToImage = async (dom: HTMLElement, scale = 1) => {
  const dataUrl = await domtoimage.toJpeg(dom, {DOC_EXPORT_OPTIONS, scale});
  await downloadFile(dataUrl, 'plate.png');
};

