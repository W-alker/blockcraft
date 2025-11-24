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

export abstract class DocFileService {
  abstract uploadImg(file: File): Promise<string>

  abstract uploadAttachment(file: File): Promise<DocAttachmentInfo>

  abstract previewAttachment(options: any): void

  abstract previewImg(options: Record<string, unknown>): void

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
