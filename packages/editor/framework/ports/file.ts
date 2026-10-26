export interface DocAttachmentInfo {
  name: string
  type: string
  url: string
  size: number
}

export type UploadProgressCallback = (progress: number) => void

/** 宿主文件能力；浏览器动作与默认行为由实现提供。 */
export interface DocFilePort {
  uploadImg(file: File, onProgress?: UploadProgressCallback): Promise<string>

  uploadVideo(file: File, onProgress?: UploadProgressCallback): Promise<DocAttachmentInfo>

  uploadAttachment(file: File, onProgress?: UploadProgressCallback): Promise<DocAttachmentInfo>

  previewAttachment(options: any): void

  downloadAttachment(options: Pick<DocAttachmentInfo, 'url' | 'name'>): Promise<void>

  previewImg(options: Record<string, unknown>): void

  /**
   * 创建一个带标识前缀的 ObjectURL，用于在上传完成前本地预览文件。
   * 返回的 URL 可通过 {@link getFileByObjectURL} 取回原始 File。
   */
  createObjectURL(file: File): string

  /**
   * 通过 {@link createObjectURL} 返回的 URL 取回原始 File 对象。
   */
  getFileByObjectURL(url: string): File | undefined

  /**
   * 获取可直接用于 `<img>` / `<video>` / `<audio>` src 的浏览器原生 ObjectURL。
   */
  getFilePreviewURLByObjectURL(url: string): string

  /**
   * 释放 ObjectURL 并清理内部映射。
   */
  removeObjectURL(url: string): void

  /**
   * 判断 url 是否是本地 ObjectURL（即尚未上传到远端）。
   */
  isLocalObjectURL(url: string): boolean

  /**
   * 检查文件大小是否超出上限。
   */
  isOverMaxSize(size: number): boolean

  inputFiles(accept?: string, multiple?: boolean): Promise<FileList>
}
