import {DocAttachmentInfo, DocFileService, UploadProgressCallback} from "../../framework";
import {Injectable} from "@angular/core";
import Viewer from "viewerjs";

const LOCAL_URL_PREFIX = '__blockcraft_local__:'

@Injectable()
export class MyDocFileService extends DocFileService {
  private _objectURLMap = new Map<string, { file: File; nativeURL: string }>()

  private _maxSize = 60 * 1024 * 1024 // 60MB

  uploadImg(file: File, onProgress?: UploadProgressCallback): Promise<string> {
    return this._simulateUpload(onProgress, () => this._createNativeObjectURL(file))
  }

  uploadVideo(file: File, onProgress?: UploadProgressCallback): Promise<DocAttachmentInfo> {
    return this._simulateUpload(onProgress, () => ({
      name: file.name,
      size: file.size,
      type: file.type,
      url: this._createNativeObjectURL(file),
    }))
  }

  uploadAttachment(file: File, onProgress?: UploadProgressCallback): Promise<DocAttachmentInfo> {
    return this._simulateUpload(onProgress, () => ({
      name: file.name,
      size: file.size,
      type: file.type,
      url: this._createNativeObjectURL(file),
    }))
  }

  createObjectURL(file: File): string {
    const nativeURL = URL.createObjectURL(file)
    const key = LOCAL_URL_PREFIX + nativeURL
    this._objectURLMap.set(key, { file, nativeURL })
    return key
  }

  getFileByObjectURL(url: string): File | undefined {
    return this._objectURLMap.get(url)?.file
  }

  getFilePreviewURLByObjectURL(url: string): string {
    return this._objectURLMap.get(url)?.nativeURL ?? url.replace(LOCAL_URL_PREFIX, '')
  }

  removeObjectURL(url: string): void {
    const entry = this._objectURLMap.get(url)
    if (entry) {
      URL.revokeObjectURL(entry.nativeURL)
      this._objectURLMap.delete(url)
    }
  }

  isLocalObjectURL(url: string): boolean {
    return url.startsWith(LOCAL_URL_PREFIX)
  }

  isOverMaxSize(size: number): boolean {
    return size > this._maxSize
  }

  previewAttachment() {
  }

  previewImg(options: Record<string, unknown>): void {
    const el = options['el']
    const title = options['title']
    if (el instanceof HTMLElement) {
      const img = el instanceof HTMLImageElement ? el : el.querySelector('img')
      if (!img) return
      const viewer = new Viewer(el, {
        title: [0, () => (typeof title === 'string') ? title : img.src],
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
        },
        ...options
      })
    }
  }

  private _simulateUpload<T>(onProgress: UploadProgressCallback | undefined, fn: () => T, ms = 2000): Promise<T> {
    return new Promise(resolve => {
      if (!onProgress) {
        setTimeout(() => resolve(fn()), ms)
        return
      }

      const steps = 20
      const interval = ms / steps
      let step = 0

      const timer = setInterval(() => {
        step++
        onProgress(Math.min(Math.round((step / steps) * 100), 99))
        if (step >= steps) {
          clearInterval(timer)
          onProgress(100)
          resolve(fn())
        }
      }, interval)
    })
  }

  private _createNativeObjectURL(file: File): string {
    return URL.createObjectURL(file)
  }
}
