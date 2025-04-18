import {Injectable} from "@angular/core";
import {DocMessageService} from "../framework";
import {NzMessageService} from "ng-zorro-antd/message";

@Injectable()
export class MyDocMessageService implements DocMessageService{
  constructor(private message: NzMessageService) {}

  success(message: string): void {
    this.message.success(message);
  }

  error(message: string): void {
    this.message.error(message);
  }

  info(message: string): void {
    this.message.info('This is a normal message');
  }

  warn(message: string): void {
    this.message.warning(message);
  }
}
