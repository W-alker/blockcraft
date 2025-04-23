import {InjectionToken} from "@angular/core";
import {FileExtensionType} from "../../global";

export interface DocAttachmentInfo {
  name: string
  type: FileExtensionType
  url: string
  size: number
}

/**
 * {@link DocFileService}
 */
export const DOC_FILE_SERVICE_TOKEN = new InjectionToken<DocFileService>('IFileUploader');

export abstract class DocFileService {
  abstract uploadImg(file: File): Promise<string>

  abstract uploadAttachment(file: File): Promise<DocAttachmentInfo>

  abstract previewAttachment(): void

  abstract previewImg(element: HTMLImageElement, title?: string): void

  downloadSource(src: string, fileName?: string) {
    let a: HTMLAnchorElement | null = document.createElement('a')
    a.href = src
    a.download = fileName || src
    a.target = '_blank'
    a.dispatchEvent(new MouseEvent('click'))
    a = null
  }

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
        input = null
      }
    })
  }

  abstract downloadAttachment(attachment: DocAttachmentInfo): void
}
