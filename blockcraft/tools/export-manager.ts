import {downloadFile} from "../global";
// @ts-ignore
import domtoimage from 'dom-to-image-more'

interface CorsImgOptions {
  url: string; // eg: https://cors-anywhere.herokuapp.com/
  method: 'get' | 'post';
  headers?: Record<string, string>;
  data?: Record<string, any>;
}

interface RenderOptions {
  /**
   * Should return true if passed node should be included in the output
   * (excluding node means excluding its children as well). Not called on the root node.
   */
  filter?: (node: Node) => boolean;

  /**
   * Callback function which is called when the Document has been cloned for rendering,
   * can be used to modify the contents that will be rendered without affecting the original source document.
   */
  onclone?: (clonedDocument: Document) => void;

  /** Color for the background, any valid CSS color value. */
  bgcolor?: string;

  /** Width to be applied to node before rendering. */
  width?: number;

  /** Height to be applied to node before rendering. */
  height?: number;

  /** An object whose properties will be copied to node's style before rendering. */
  style?: Partial<CSSStyleDeclaration>;

  /** A Number between 0 and 1 indicating image quality (applicable to JPEG only), defaults to 1.0. */
  quality?: number;

  /** A Number multiplier to scale up the canvas before rendering to reduce fuzzy images, defaults to 1.0. */
  scale?: number;

  /** DataURL to use as a placeholder for failed images. */
  imagePlaceholder?: string;

  /** Set to true to cache bust by appending the time to the request URL. */
  cacheBust?: boolean;

  /** Set to 'strict' or 'relaxed' to select style caching rules. */
  styleCaching?: 'strict' | 'relaxed';

  /** Set to false to disable use of default styles of elements. */
  copyDefaultStyles?: boolean;

  /** Set to true to disable font embedding into the SVG output. */
  disableEmbedFonts?: boolean;

  /** When the image is restricted by the server from cross-domain requests, proxy options. */
  corsImg?: CorsImgOptions;

  /** Callback for adjustClonedNode event (to allow adjusting clone's properties). */
  adjustClonedNode?: (clonedNode: HTMLElement) => void;

  /** Should return true if passed propertyName should be included in the output */
  filterStyles?: (propertyName: string) => boolean;
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

const pdfSizes = {
  A0: {width: 2384, height: 3370},
  A1: {width: 1684, height: 2384},
  A2: {width: 1191, height: 1684},
  A3: {width: 842, height: 1191},
  A4: {width: 595, height: 842},   // 📄 常用标准
  A5: {width: 420, height: 595},
  A6: {width: 298, height: 420},
  Letter: {width: 612, height: 792}, // 🇺🇸 美国标准
  Legal: {width: 612, height: 1008},
  Tabloid: {width: 792, height: 1224},
};

type PdfSizeName = keyof typeof pdfSizes;

export class DocExportManager {

  constructor(private doc: BlockCraft.Doc, private exportOptions: RenderOptions = DOC_EXPORT_OPTIONS) {
  }

  async exportToJson(name: string) {
    const json = this.doc.root.toSnapshot()
    const jsonStr = JSON.stringify(json, null, 2); // 格式化输出
    const blob = new Blob([jsonStr], {type: 'application/json'})
    await downloadFile(blob, name)
  }

  async exportToJpeg(name: string, options?: Pick<RenderOptions, 'scale' | 'bgcolor'>) {
    const canvas = await this._toCanvas(options);
    const dataUrl = canvas.toDataURL('image/jpeg');
    await downloadFile(dataUrl, name);
  }

  protected async _toCanvas(options?: Pick<RenderOptions, 'scale' | 'bgcolor' | 'width' | 'height'>) {
    const dom = this.doc.scrollContainer!
    const scale = options?.scale || 1
    const canvas: HTMLCanvasElement = await domtoimage.toCanvas(dom, {
      ...DOC_EXPORT_OPTIONS,
      ...this.exportOptions,
      ...options,
      width: dom.scrollWidth * scale,
      height: dom.scrollHeight * scale,
      style: {
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      },
    });
    return canvas
  }

  /**
   * 导出为 PDF. 自动分页。但是要注意block之间块的margin需要设置
   * @param name
   * @param options
   */
  async exportToPdf(name: string, options?: Pick<RenderOptions, 'scale' | 'bgcolor'> & {
    paging?: boolean
    pdfPageSize?: PdfSizeName
    blockMargin?: number
  },) {
    const rootDom = this.doc.root.hostElement;
    const PDFLib = await import('pdf-lib');
    const pdfDoc = await PDFLib.PDFDocument.create();

    const {width: pageWidthPt, height: pageHeightPt} = pdfSizes[options?.pdfPageSize || 'A4'];

    const {scale = 1, blockMargin = 8, paging = false} = options || {}

    const canvas = await this._toCanvas(options);
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const ctx = canvas.getContext('2d')!;

    const pageHeightPx = Math.floor(canvasWidth * (pageHeightPt / pageWidthPt));

    const slices: { start: number; height: number }[] = [];

    if (paging) {
      // 处理padding
      const scrollContainerStyles = window.getComputedStyle(this.doc.scrollContainer!)

      const paddingTop = parseInt(scrollContainerStyles.paddingTop)

      // 计算所有子元素的高度（按canvas像素比例缩放）
      const blockHeights = Array.from(rootDom.children).map(
        child => (child.clientHeight + blockMargin) * scale
      );
      blockHeights.unshift(paddingTop * scale)

      let currentStartY = 0;
      let accumulatedHeight = 0;

      for (const blockHeight of blockHeights) {
        // 单个块比一页高，硬切直至一页能容纳，存留剩余高度
        if (blockHeight > pageHeightPx) {
          if (accumulatedHeight > 0) {
            slices.push({start: currentStartY, height: accumulatedHeight});
            currentStartY += accumulatedHeight;
            accumulatedHeight = 0;
          }
          let remaining = blockHeight;
          while (remaining > 0) {
            slices.push({start: currentStartY, height: Math.min(pageHeightPx, remaining)});
            currentStartY += Math.min(pageHeightPx, remaining);
            remaining -= pageHeightPx;
          }
        } else {
          if (accumulatedHeight + blockHeight > pageHeightPx) {
            // 填不下了，分页
            slices.push({start: currentStartY, height: accumulatedHeight});
            currentStartY += accumulatedHeight;
            accumulatedHeight = blockHeight;
          } else {
            accumulatedHeight += blockHeight;
          }
        }
      }
      // 最后一页
      if (accumulatedHeight > 0) {
        slices.push({start: currentStartY, height: accumulatedHeight});
      }

    } else {
      // 每页高度分隔
      let currentStartY = 0;
      let accumulatedHeight = 0;
      while (accumulatedHeight < canvasHeight) {
        slices.push({start: currentStartY, height: Math.min(pageHeightPx, canvasHeight - accumulatedHeight)});
        currentStartY += Math.min(pageHeightPx, canvasHeight - accumulatedHeight);
        accumulatedHeight += Math.min(pageHeightPx, canvasHeight - accumulatedHeight);
      }
    }

    for (const slice of slices) {
      const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasWidth;
      tempCanvas.height = slice.height;

      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.fillStyle = options?.bgcolor || '#ffffff';
      tempCtx.fillRect(0, 0, canvasWidth, slice.height);

      tempCtx.drawImage(
        canvas,
        0, slice.start, canvasWidth, slice.height,
        0, 0, canvasWidth, slice.height
      );

      const imgDataUrl = tempCanvas.toDataURL('image/png');
      const embeddedImg = await pdfDoc.embedPng(imgDataUrl);

      const scaleFactor = pageWidthPt / canvasWidth;
      const drawHeight = slice.height * scaleFactor;

      page.drawImage(embeddedImg, {
        x: 0,
        y: pageHeightPt - drawHeight,
        width: pageWidthPt,
        height: drawHeight
      });

      tempCanvas.remove();
    }

    const pdfBase64 = await pdfDoc.saveAsBase64({dataUri: true});
    await downloadFile(pdfBase64, name);
  }


}


