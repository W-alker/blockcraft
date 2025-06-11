import {DocAttachmentInfo, DocFileService} from "../../framework";
import {Injectable} from "@angular/core";
import Viewer from "viewerjs";

@Injectable()
export class MyDocFileService extends DocFileService {

  uploadImg(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.addEventListener('loadend', (v) => {
        resolve(v.target!.result as string)
      })
    })
  }

  uploadAttachment(file: File): Promise<DocAttachmentInfo> {
    return new Promise((resolve, reject) => {
      // 最大500kb
      if (file.size > 1024 * 500) {
        reject('文件过大')
      }

      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.addEventListener('loadend', (v) => {
        resolve({
          name: file.name,
          size: file.size,
          type: file.type,
          url: v.target!.result as string,
        })
      })
    })
  }

  previewAttachment() {
  }

  previewImg(arg1: unknown, arg2: unknown): void {
    if (arg1 instanceof HTMLElement) {
      const img = arg1 instanceof HTMLImageElement ? arg1 : arg1.querySelector('img')
      if (!img) return
      const viewer = new Viewer(arg1, {
        title: [0, () => (typeof arg2 === 'string') ? arg2 : img.src],
        inline: false,
        zIndex: 2000,
        ready: () => {
          viewer.show()
        },
        stop: () => {
          viewer.destroy()
        },
        toolbar: {
          prev: 0,
          next: 0,
          zoomIn: 4,
          zoomOut: 4,
          oneToOne: 4,
          reset: 4,
          play: {
            show: 0,
            size: 'large',
          },
          rotateLeft: 4,
          rotateRight: 4,
          flipHorizontal: 4,
          flipVertical: 4,
        }
      })
    }
  }
}
