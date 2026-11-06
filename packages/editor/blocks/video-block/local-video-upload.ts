import type {DocAttachmentInfo, DocFileService, UploadProgressCallback} from '../../framework/host/file.service'
import {extractVideoPoster} from './video-poster'

/** 上传任务属于本地文件，视图重新挂载复用同一任务。协同端没有 File，不会进入此路径。 */
export class LocalVideoUpload {
  readonly video: Promise<DocAttachmentInfo>
  private progress = 0
  private readonly listeners = new Set<UploadProgressCallback>()
  private posterFile?: Promise<File | undefined>
  private posterUrl?: Promise<string | undefined>

  constructor(
    private readonly service: DocFileService,
    private readonly file: File,
    private readonly extract = extractVideoPoster,
  ) {
    this.video = Promise.resolve().then(() => service.uploadVideo(file, progress => {
      this.progress = progress
      this.listeners.forEach(listener => listener(progress))
    }))
  }

  subscribeProgress(listener: UploadProgressCallback): () => void {
    this.listeners.add(listener)
    listener(this.progress)
    return () => this.listeners.delete(listener)
  }

  preparePoster(): Promise<File | undefined> {
    return this.posterFile ??= Promise.resolve().then(() => this.extract(this.file)).catch(() => undefined)
  }

  /** 调用方确认块仍需要封面后才上传；封面失败不能拒绝视频上传。 */
  uploadPoster(file: File): Promise<string | undefined> {
    return this.posterUrl ??= Promise.resolve().then(() => this.service.uploadImg(file)).catch(() => undefined)
  }
}

const uploads = new WeakMap<DocFileService, WeakMap<File, LocalVideoUpload>>()

export function getLocalVideoUpload(service: DocFileService, file: File): LocalVideoUpload {
  let files = uploads.get(service)
  if (!files) uploads.set(service, files = new WeakMap())
  let task = files.get(file)
  if (!task) files.set(file, task = new LocalVideoUpload(service, file))
  return task
}
