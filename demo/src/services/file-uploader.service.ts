import {Injectable} from "@angular/core";

@Injectable()
export class FileUploaderService {
  // constructor(
  //   private fileService: FileService
  // ) {
  // }

  uploadImg(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.addEventListener('loadend', (v) => {
        resolve(v.target!.result as string)
      })
    })
    // return new Promise((resolve, reject) => {
    //   this.fileService.uploadFile(file, (e) => {
    //   }, FileBucket(file.name))
    //     .then(fileInfo => {
    //       const info = ObjectU.objectExcludeFields(fileInfo, ['origin', 'ossAccount', 'ossParts', 'ossUploadId', 'ossRequestId']);
    //       resolve(this.fileService.getFilePath(info))
    //     }).catch(reason => {
    //     reject(reason)
    //   })
    // })
  }

}
