import {Component, ViewChild} from "@angular/core";
import {EditorComponent} from '../../../blockcraft/editor'
import {
  BlockNodeType,
  IBlockSnapshot,
  native2YBlock,
  NativeBlockModel,
  performanceTest, Y_BLOCK_MAP_NAME,
  YBlock
} from "../../../blockcraft";
import * as Y from 'yjs'
import {encodeStateAsUpdate, encodeStateVectorFromUpdate} from "yjs";

@Component({
  selector: 'app-test3',
  template: `
    <block-craft-editor #editor></block-craft-editor>

    <button (click)="onTest()">迁移测试</button>
    <button (click)="onTest2()">Yjs测试</button>
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

  onTest2() {
    const json = this.editor.doc.exportSnapshot()

    const doc1 = new Y.Doc({
      guid: this.editor.docId
    })
    const yBlockMap = doc1.getMap<YBlock>(Y_BLOCK_MAP_NAME)

    const snapshot2YBlock = (snapshot: IBlockSnapshot) => {
      const _children = snapshot.nodeType === BlockNodeType.editable ? snapshot.children : snapshot.children.map(childSnapshot => childSnapshot.id)
      const yBlock = native2YBlock({...snapshot, children: _children} as NativeBlockModel)
      yBlockMap.set(snapshot.id, yBlock)
      if (snapshot.nodeType !== BlockNodeType.editable && snapshot.children.length) {
        snapshot.children.forEach(childSnapshot => snapshot2YBlock(childSnapshot))
      }
    }
    snapshot2YBlock(json!)

    const doc1Vc = encodeStateAsUpdate(doc1)
    const doc2Vc = encodeStateAsUpdate(this.editor.doc.yDoc)


    const stateVc1 = encodeStateVectorFromUpdate(doc1Vc)
    const stateVc2 = encodeStateVectorFromUpdate(doc2Vc)

    const diff = Y.encodeStateAsUpdate(doc1, stateVc2)

    console.log(yBlockMap, doc1.toJSON())
    // ;(this.editor.doc.root.firstChildren?.yBlock.get('children') as Y.Text).insert(0, 'hello world')

    Y.applyUpdate(this.editor.doc.yDoc, diff)

    // Y.applyUpdate(doc1, doc2Vc)


  }


}
