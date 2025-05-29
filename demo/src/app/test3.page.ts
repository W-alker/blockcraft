import {Component, ViewChild} from "@angular/core";
import {EditorComponent} from '../../../blockcraft/editor'
import {performanceTest} from "../../../blockcraft";
import {OLD_JSON} from "../version-adapter";
import {DOC_IDS, TEST_DATA} from "./const";

@Component({
  selector: 'app-test3',
  template: `
    <block-craft-editor #editor></block-craft-editor>

    <button (click)="onTest()">迁移测试</button>
  `,
  styles: [``],
  imports: [
    EditorComponent
  ],
  standalone: true
})
export class Test3Page {
  @ViewChild('editor', {read: EditorComponent}) editor!: EditorComponent

  constructor() {
  }

  @performanceTest()
  onTest() {
    this.getData().then(r => {
      console.log(r.data)
      this.editor.initBySnapshot(r.data)
    })
  }

  async getData() {
    var myHeaders = new Headers();
    myHeaders.append("appType", "bct");
    myHeaders.append("device", "IOS");
    myHeaders.append("language", "zh");
    myHeaders.append("deviceId", "ED380414932542BAB4993E5AC3E07C64");
    myHeaders.append("appVersion", "1.0.120");
    // myHeaders.append("timeZone", "Asia/Shanghai");
    myHeaders.append("osVersion", "16.5.1");
    myHeaders.append("cookieId", "6835bb53551ee570db0575c8");
    myHeaders.append("siteName", "b");
    myHeaders.append("envType", "pre");
    myHeaders.append("User-Agent", "Apifox/1.0.0 (https://apifox.com)");
    myHeaders.append("Content-Type", "application/json");
    myHeaders.append("Accept", "*/*");
    myHeaders.append("Host", "196.168.1.81:3399");
    myHeaders.append("Connection", "keep-alive");

    return (await (await fetch("http://api-pre.jinqidongli.com/doc/article/store/read", {
      method: 'POST',
      headers: myHeaders,
      body: JSON.stringify({
        id: '681c337d29428c5ddf34548e',
      }),
      redirect: 'follow'
    })).json())
  }
}
