import {InjectionToken} from "@angular/core";

export const DOC_MESSAGE_SERVICE_TOKEN = new InjectionToken<DocMessageService>('IMessageService');

export abstract class DocMessageService {
  abstract success(message: string): void;
  abstract error(message: string): void;
  abstract info(message: string): void;
  abstract warn(message: string): void;
}
