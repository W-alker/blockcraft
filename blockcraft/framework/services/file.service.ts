import {InjectionToken} from "@angular/core";
import {FileExtensionType} from "../../global";

export interface DocAttachmentInfo {
  name: string
  type: FileExtensionType
  url: string
  size: number
  width?: number
  height?: number
}

/**
 * {@link DocFileService}
 */
export const DOC_FILE_SERVICE_TOKEN = new InjectionToken<DocFileService>('IFileUploader');

export abstract class DocFileService {
  abstract uploadImg(file: File): Promise<string>

  abstract uploadFile(file: File): Promise<DocAttachmentInfo>

  abstract preview(): void

  abstract previewImg(element: HTMLImageElement, title?: string): void

  downloadSource(src: string, fileName?: string) {
    let a: HTMLAnchorElement | null = document.createElement('a')
    a.href = src
    a.download = fileName || src
    a.target = '_blank'
    a.dispatchEvent(new MouseEvent('click'))
    a = null
  }
}
