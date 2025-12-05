import {Injectable} from "@angular/core";
import {DocMessageService} from "../../framework";
import {NzMessageService} from "ng-zorro-antd/message";

@Injectable()
export class MyDocMessageService implements DocMessageService {
  constructor(private message: NzMessageService) {
  }

  success(message: string): void {
    this.message.success(message);
  }

  error(message: string): void {
    this.message.error(message);
  }

  infoMap = new Map<string, number>()

  info(message: string): void {
    if (this.infoMap.has(message)) {
      return
    }
    this.message.info(message);
    this.infoMap.set(message, 1)
  }

  warn(message: string): void {
    this.message.warning(message);
  }
}
