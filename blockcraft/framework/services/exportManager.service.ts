import {FileExporter} from "../../global";

// This constant is used to ignore tags when exporting using html2canvas
export const CANVAS_EXPORT_IGNORE_TAGS = [
  'EDGELESS-TOOLBAR-WIDGET',
  'AFFINE-DRAG-HANDLE-WIDGET',
  'AFFINE-FORMAT-BAR-WIDGET',
  'AFFINE-BLOCK-SELECTION',
];

export class ExportManagerService {

  async exportPdf(doc: BlockCraft.Doc, title = 'Untitled') {
    const rootModel = doc.root;
    if (!rootModel) return;
    const canvasImage = await this._toCanvas();
    if (!canvasImage) {
      return;
    }

    const PDFLib = await import('pdf-lib');
    const pdfDoc = await PDFLib.PDFDocument.create();
    const page = pdfDoc.addPage([canvasImage.width, canvasImage.height]);
    const imageEmbed = await pdfDoc.embedPng(canvasImage.toDataURL('PNG'));
    const { width, height } = imageEmbed.scale(1);
    page.drawImage(imageEmbed, {
      x: 0,
      y: 0,
      width,
      height,
    });
    const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });

    FileExporter.exportFile(
      title + '.pdf',
      pdfBase64
    );
  }

  async exportPng(doc: BlockCraft.Doc, title= 'Untitled') {
    const rootModel = doc.root;
    if (!rootModel) return;
    const canvasImage = await this._toCanvas();
    if (!canvasImage) {
      return;
    }

    FileExporter.exportPng(
      title,
      canvasImage.toDataURL('image/png')
    );
  }

  private async _toCanvas(): Promise<HTMLCanvasElement | void> {
    try {
      await this._checkReady();
    } catch (e: unknown) {
      console.error('Failed to export to canvas');
      console.error(e);
      return;
    }

    // if (isInsidePageEditor(this.editorHost)) {
      return this._docToCanvas();
    // }
    // else {
    //   const rootModel = this.doc.root;
    //   if (!rootModel) return;
    //
    //   const edgeless = getBlockComponentByModel(
    //     this.editorHost,
    //     rootModel
    //   ) as EdgelessRootBlockComponent;
    //   const bound = edgeless.gfx.elementsBound;
    //   return this.edgelessToCanvas(edgeless.surface.renderer, bound, edgeless);
    // }
  }

  private async _docToCanvas(): Promise<HTMLCanvasElement | void> {
    const html2canvas = (await import('html2canvas')).default;
    if (!(html2canvas instanceof Function)) return;

    // const rootComponent = getRootByEditorHost(this.editorHost);
    // if (!rootComponent) return;
    // const viewportElement = rootComponent.viewportElement;
    // if (!viewportElement) return;
    const pageContainer = document.createElement('[data-blockcraft-root="true"]');
    //   viewportElement.querySelector(
    //   '.affine-page-root-block-container'
    // );
    const rect = pageContainer?.getBoundingClientRect();
    // const { viewport } = rootComponent;
    // if (!viewport) return;
    const pageWidth = rect?.width;
    const pageLeft = rect?.left ?? 0;
    const viewportHeight = pageContainer?.scrollHeight;

    const html2canvasOption = {
      ignoreElements: function (element: Element) {
        if (
          CANVAS_EXPORT_IGNORE_TAGS.includes(element.tagName) ||
          element.classList.contains('dg')
        ) {
          return true;
        } else if (
          (element.classList.contains('close') &&
            element.parentElement?.classList.contains(
              'meta-data-expanded-title'
            )) ||
          (element.classList.contains('expand') &&
            element.parentElement?.classList.contains('meta-data'))
        ) {
          // the close and expand buttons in affine-doc-meta-data is not needed to be showed
          return true;
        } else {
          return false;
        }
      },
      onclone: async (_documentClone: Document, element: HTMLElement) => {
        element.style.height = `${viewportHeight}px`;
        // this._replaceRichTextWithSvgElement(element);
        // await this.replaceImgSrcWithSvg(element);
      },
      backgroundColor: window.getComputedStyle(viewportElement).backgroundColor,
      x: pageLeft - viewport.left,
      width: pageWidth,
      height: viewportHeight,
      useCORS: this._exportOptions.imageProxyEndpoint ? false : true,
      proxy: this._exportOptions.imageProxyEndpoint,
    };

    let data: HTMLCanvasElement;
    try {
      this._enableMediaPrint();
      data = await html2canvas(
        viewportElement as HTMLElement,
        html2canvasOption
      );
    } finally {
      this._disableMediaPrint();
    }
    return data;
  }


  private async _checkReady() {
    const pathname = location.pathname;
    const editorMode = isInsidePageEditor(this.editorHost);

    const promise = new Promise((resolve, reject) => {
      let count = 0;
      const checkReactRender = setInterval(() => {
        try {
          this._checkCanContinueToCanvas(pathname, editorMode);
        } catch (e) {
          clearInterval(checkReactRender);
          reject(e);
        }
        const rootModel = this.doc.root;
        const rootComponent = this.doc.root
          ? getBlockComponentByModel(this.editorHost, rootModel)
          : null;
        const imageCard = rootComponent?.querySelector(
          'affine-image-fallback-card'
        );
        const isReady =
          !imageCard || imageCard.getAttribute('imageState') === '0';
        if (rootComponent && isReady) {
          clearInterval(checkReactRender);
          resolve(true);
        }
        count++;
        if (count > 10 * 60) {
          clearInterval(checkReactRender);
          resolve(false);
        }
      }, 100);
    });
    return promise;
  }

  private _createCanvas(bound: IBound, fillStyle: string) {
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    canvas.width = (bound.w + 100) * dpr;
    canvas.height = (bound.h + 100) * dpr;

    ctx.scale(dpr, dpr);
    ctx.fillStyle = fillStyle;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return { canvas, ctx };
  }




}

