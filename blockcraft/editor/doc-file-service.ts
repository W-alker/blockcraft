import {DocAttachmentInfo, DocFileService} from "../framework";
import {Injectable} from "@angular/core";
import Viewer from "viewerjs";
import {FileExtensions, getFileExtensionType, getMimeType, MimeType} from "../global";

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

  uploadFile(file: File): Promise<DocAttachmentInfo> {
    return new Promise((resolve, reject) => {
      // 最大10mb
      if (file.size > 10 * 1024 * 1024) {
        reject('文件过大')
      }

      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.addEventListener('loadend', (v) => {
        resolve({
          name: file.name,
          size: file.size,
          type: getFileExtensionType(file.type as MimeType) || FileExtensions.OTHER,
          url: v.target!.result as string,
        })
      })
    })
  }

  preview() {
  }

  previewImg(arg1: unknown, arg2: unknown): void {
    if (arg1 instanceof HTMLImageElement) {
      const viewer = new Viewer(arg1, {
        title: [0, () => (typeof arg2 === 'string') ? arg2 : arg1.src],
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
