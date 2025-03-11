import {InjectionToken} from "@angular/core";

/**
 * {@link IFileUploader}
 */
export const FILE_UPLOADER = new InjectionToken<IFileUploader>('IFileUploader');

export abstract class IFileUploader {
  upload() {

  }
}
