import {Component, ElementRef, ViewChild} from "@angular/core";
import * as Y from 'yjs'
import {WebsocketProvider} from "y-websocket";
import {EditorMigrate} from "../version-adapter/transformer";

@Component({
  selector: 'app-test2',
  template: `
    <input type="file" id="csvFile" accept=".csv" (change)="onCsv($event)"/>
    <button (click)="onFlush()">(刷数据)</button>
  `,
  styles: [``],
  standalone: true
})
export class Test2Page {

  @ViewChild('btn', {read: ElementRef}) btn!: ElementRef
  @ViewChild('btn2', {read: ElementRef}) btn2!: ElementRef

  doc = new Y.Doc();

  model: Record<string, any> = {}

  constructor() {
  }

  async onFlush() {
    const ids = prod_ids
    for (const id of ids) {
      await this.flushDoc(id)
    }
  }

  async flushDoc(docId: string) {
    const yDoc1 = new Y.Doc({gc: false})
    const socket1 = await this.createSocket('ws://ws-doc.cses7.com', docId, yDoc1)
    socket1.destroy()
    const socket2 = await this.createSocket('ws://ws-doc-v2.cses7.com/collaboration', docId, yDoc1)
    socket2.destroy()
    yDoc1.destroy()
    console.log('同步完成', docId)
  }

  createSocket(uri: string, docId: string, yDoc: Y.Doc): Promise<WebsocketProvider> {
    const provider = new WebsocketProvider(uri, docId, yDoc, {
      connect: true
    })
    return new Promise((resolve) => {
      const syncFn = (v: boolean) => {
        console.log('同步状态' + uri, v)
        if (!v) return;
        provider.off('sync', syncFn);

        const updates = Y.encodeStateAsUpdate(yDoc)
        console.log('更新长度', updates.length)

        let timer: any
        // if (updates.length <= 2) {
        //   timer = setTimeout(() => {
        //     resolve(provider)
        //   }, 3000)
        // }

        if (updates.length >= 10) {
          resolve(provider);
          return;
        }

        const waitFn = async (v: any) => {
          console.log('等待更新', v.byteLength)
          if (v.byteLength < 10) return;
          timer && clearTimeout(timer)
          yDoc.off('update', waitFn);
          resolve(provider);
        };
        yDoc.on('update', waitFn);
      };
      provider.on('sync', syncFn);
    })
  }

  // async flushFromJSON(docId: string) {
  //   const request = async (docId: string) => {
  //     const myHeaders = new Headers();
  //     myHeaders.append("appType", "bct");
  //     myHeaders.append("device", "IOS");
  //     myHeaders.append("language", "zh");
  //     myHeaders.append("deviceId", "ED380414932542BAB4993E5AC3E07C64");
  //     myHeaders.append("appVersion", "1.0.120");
  //     // myHeaders.append("timeZone", "Asia/Shanghai");
  //     myHeaders.append("osVersion", "16.5.1");
  //     myHeaders.append("cookieId", "6835bb53551ee570db0575c8");
  //     myHeaders.append("siteName", "b");
  //     myHeaders.append("envType", "pre");
  //     myHeaders.append("User-Agent", "Apifox/1.0.0 (https://apifox.com)");
  //     myHeaders.append("Content-Type", "application/json");
  //     myHeaders.append("Accept", "*/*");
  //     myHeaders.append("Host", "196.168.1.81:3399");
  //     myHeaders.append("Connection", "keep-alive");
  //
  //     await (await fetch("http://api-pre.jinqidongli.com/doc/flush/article", {
  //       method: 'POST',
  //       headers: myHeaders,
  //       body: JSON.stringify({
  //         id: docId,
  //       }),
  //       redirect: 'follow'
  //     })).json().then(async docDetail => {
  //     }).catch(e => {
  //     })
  //   }
  // }


  async onCsv(e: any) {
    const file = e.target.files[0];
    const text = await file.text();

    // 自定义解析逻辑（基础版）
    const rows = text.split('\n').filter((row: any) => row.trim() !== '');
    const headers = rows[0].split(',').map((h: any) => h.trim());
    const data = rows.slice(1)

    console.log('解析结果:', data);
  }
}

const _fail_ids = [
  '6952302adf61df69e8c4e95c',
  '6952302bc9ced620c5afed89',
  '685d18e34d78a96cfb610826',
  '6952302bdf61df69e8c4e95e',
  '6952302bc9ced620c5afed8b',
  '6952302bdf61df69e8c4e960',
  '675a89e2240a616c438ba76e',
  '662b2809bd53f07ec953343b',
  '65ee876476ee3d10ffd4ce2f',
  '674d85ed34c2814531dd406a',
  '677bad9e2b639a4be50446d1',
  '677badbb2b639a4be50446dc',
  '677ba0e2341f673c42900f98',
  '677ba87c341f673c429010ed',
  '677ba06f098541777ea2492d',
  '677bada92b639a4be50446d9',
  '677ba070341f673c42900f88',
  '658521b63a11bb5b0b1573a5',
  '673dac5ff0047d051dffcbaf',
  '662b2813bd53f07ec9533444',
  '670e21382af0f85085780295',
  '6746805fbdfbe82304ef78eb',
  '6756c93e8ea9803a782199aa',
  '6756c77b8ea9803a782198ab',
  '67c51cb85ff1c07c046a5f3b'
];

const prod_ids = [
  '691aefcc0781f16f91af5b8c',
  '691300507d9cf51e1cbde2cc'
]
