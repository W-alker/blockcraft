import {Component, ElementRef, ViewChild} from "@angular/core";
import * as Y from 'yjs'
import {WebsocketProvider} from "y-websocket";
import {EditorMigrate} from "../version-adapter/transformer";
import {RootBlockSchema} from "../../../blockcraft";

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
    // const ids = prod_ids
    // for (const id of ids) {
    //   await this.flushDoc(id)
    // }
    this.flushMeetingDocs()
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

  async flushFromJSON(docId: string) {
    const request = async (docId: string) => {
      const myHeaders = new Headers();
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

      await (await fetch("http://api-pre.jinqidongli.com/doc/flush/article", {
        method: 'POST',
        headers: myHeaders,
        body: JSON.stringify({
          id: docId,
        }),
        redirect: 'follow'
      })).json().then(async docDetail => {
      }).catch(e => {
      })
    }
  }

  async flushMeetingDocs() {
    const request = async (uri: string, data: any = {}) => {
      const myHeaders = new Headers();
      myHeaders.append("appType", "bct");
      myHeaders.append("device", "IOS");
      myHeaders.append("language", "zh");
      myHeaders.append("deviceId", "ED380414932542BAB4993E5AC3E07C64");
      myHeaders.append("appVersion", "1.0.120");
      // myHeaders.append("timeZone", "Asia/Shanghai");
      myHeaders.append("osVersion", "16.5.1");
      myHeaders.append("cookieId", "69afe5fd359c19a63099f16d");
      myHeaders.append("siteName", "b");
      myHeaders.append("envType", "pre");
      myHeaders.append("User-Agent", "Apifox/1.0.0 (https://apifox.com)");
      myHeaders.append("Content-Type", "application/json");
      myHeaders.append("Accept", "*/*");
      myHeaders.append("Host", "196.168.1.81:3399");
      myHeaders.append("Connection", "keep-alive");

      return await (await fetch("http://196.168.1.216:3399" + uri, {
        method: 'POST',
        headers: myHeaders,
        body: JSON.stringify(data),
        redirect: 'follow'
      })).json()
    }

    let pageIndex = 0
    let hasMore = false;
    const flush = async () => {
      const res = await request('/meetingDoc/migrateQueryOldDocs', {pageIndex})
      hasMore = res.hasMore
      const items = res.items.map((v: any) => {
        const sections = v.textSections.map((v: any) => v.content)
          .reduce((pre: any, cur: any) => {
            pre[cur?.id] = cur
            return pre
          }, {})
        return {
          id: v.id,
          docType: v.docType,
          meetingId: v.meetingId,
          data: v.sections.map((sec: any) => sections[sec]).filter(Boolean)
        }
      })

      for(let i = 0; i < items.length; i++) {
        const data = EditorMigrate.transform(items[i].data)
        const rootSnapshot = RootBlockSchema.createSnapshot(items[i].id, data)
        await request('/meetingDoc/saveMeetingDoc', {
          ...items[i],
          doc: rootSnapshot
        })
      }
      pageIndex++
      if(hasMore) flush()
    }
    flush()

  }

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

