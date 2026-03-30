import {InjectionToken} from "@angular/core";

export interface DocAttachmentInfo {
  name: string
  type: string
  url: string
  size: number
}

/**
 * {@link DocFileService}
 */
export const DOC_FILE_SERVICE_TOKEN = new InjectionToken<DocFileService>('IFileUploader');

export type UploadProgressCallback = (progress: number) => void

export abstract class DocFileService {
  abstract uploadImg(file: File, onProgress?: UploadProgressCallback): Promise<string>

  abstract uploadVideo(file: File, onProgress?: UploadProgressCallback): Promise<DocAttachmentInfo>

  abstract uploadAttachment(file: File, onProgress?: UploadProgressCallback): Promise<DocAttachmentInfo>

  abstract previewAttachment(options: any): void

  abstract previewImg(options: Record<string, unknown>): void

  /**
   * 创建一个带标识前缀的 ObjectURL，用于在上传完成前本地预览文件。
   * 返回的 URL 可通过 {@link getFileByObjectURL} 取回原始 File。
   */
  abstract createObjectURL(file: File): string

  /**
   * 通过 {@link createObjectURL} 返回的 URL 取回原始 File 对象。
   */
  abstract getFileByObjectURL(url: string): File | undefined

  /**
   * 获取可直接用于 `<img>` / `<video>` / `<audio>` src 的浏览器原生 ObjectURL。
   */
  abstract getFilePreviewURLByObjectURL(url: string): string

  /**
   * 释放 ObjectURL 并清理内部映射。
   */
  abstract removeObjectURL(url: string): void

  /**
   * 判断 url 是否是本地 ObjectURL（即尚未上传到远端）。
   */
  abstract isLocalObjectURL(url: string): boolean

  /**
   * 检查文件大小是否超出上限。
   */
  abstract isOverMaxSize(size: number): boolean

  inputFiles(accept = '', multiple = false): Promise<FileList> {
    return new Promise((resolve, reject) => {
      let input: HTMLInputElement | null = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      input.multiple = multiple
      input.click()
      input.onchange = () => {
        const inputFiles = input!.files
        if (!inputFiles) reject('no files selected')
        resolve(inputFiles!)

        input?.remove()
        input = null
      }
    })
  }
}
