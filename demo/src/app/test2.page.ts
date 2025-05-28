import {Component, ElementRef, ViewChild} from "@angular/core";
import * as Y from 'yjs'
import {DOC_IDS} from "./const";
import {EditorMigrate, schemas} from "../version-adapter/transformer";

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

    let cnt = 0
    const request = async (docId: string) => {
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

      await (await fetch("http://api-pre.jinqidongli.com/doc/flush/article", {
        method: 'POST',
        headers: myHeaders,
        body: JSON.stringify({
          id: docId,
        }),
        redirect: 'follow'
      })).json().then(async docDetail => {
        if (!docDetail.isSuccess) {
          console.log(`%c第${cnt}条查询详情失败: ${docId}`, 'color: red')
          return
        }

        await (await fetch("http://api-pre.jinqidongli.com/doc/section/list", {
          method: 'POST',
          headers: myHeaders,
          body: JSON.stringify({
            docId,
            ids: docDetail.sections
          }),
          redirect: 'follow'
        })).json().then(async sectionList => {
          if (!sectionList.isSuccess) {
            console.log(`%c第${cnt}条查询SectionList失败: ${docId}`, 'color: red')
            return
          }

          const selections = docDetail.sections.map((id: string) => sectionList[id].content);
          const miratedSections = EditorMigrate.transform(selections)
          console.log('----', selections, miratedSections)

          if(selections.length !== miratedSections.length) {
            console.warn('selections patch invalild', docId)
          }

          const root = schemas.createSnapshot('root', [docDetail.id, miratedSections])
          const storeRes = await (await fetch("http://api-pre.jinqidongli.com/doc/article/store", {
            method: 'POST',
            headers: myHeaders,
            body: JSON.stringify({
              id: docId,
              data: root
            }),
            redirect: 'follow'
          })).json()

          console.log(`第${cnt}条成功`)

        }).catch(e => {
          console.log(`%c第${cnt}条查询SectionList失败: ${docId}`, 'color: red')
        })

      }).catch(e => {
        console.log(`%c第${cnt}条查询详情失败: ${docId}`, 'color: red')
      })
    }

    for (let docId of ['6821820a69a81e64675b11f8']) {
      try {
        await request(docId)
      } catch (e) {
        console.log(e, docId)
      } finally {
        cnt++
      }
    }

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
