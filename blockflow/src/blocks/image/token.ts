import {IFileUploader} from "./type";
import {InjectionToken} from "@angular/core";

/**
 * {@link IFileUploader}
 */
export const FILE_UPLOADER = new InjectionToken<IFileUploader>('IFileUploader');
