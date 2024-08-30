import {IBlockModel, SimpleRecord, SimpleValue} from "@core/types";
import {syncChangeArray, syncChangeMap} from "@core/yjs/changeProxy";
import Y from "@core/yjs";
import {BehaviorSubject} from "rxjs";

export type YBlockModel = Y.Map<unknown>

export const isBlockModel = (obj: any): obj is IBlockModel => {
    return obj.nodeType && obj.id && obj.flavour
}

export class ModelSyncer {
    constructor() {
    }

    blockModel2Y = (block: IBlockModel, cb?: (block: IBlockModel, yMap: Y.Map<any>) => void): YBlockModel => {
        let map: Y.Map<any>

        let children
        if (block.children) {

            if (block.nodeType === 'editable') {
                children = new Y.Text()
                block.children.length && children.applyDelta(block.children)
            } else {
                children = Y.Array.from((block.children as IBlockModel[]).map(child => this.blockModel2Y(child, cb)))
            }

        }

        const {obj: props, yObj: yProps} = this.obj2y(block.props)
        const {obj: meta, yObj: yMeta} = this.obj2y(block.meta)
        block.props = props
        block.meta = meta

        map = new Y.Map(
            [
                ['flavour', block.flavour],
                ['id', block.id],
                ['nodeType', block.nodeType],
                ['props', yProps],
                ['meta', yMeta],
                ['children', children],
            ]
        )

        cb && cb(block, map)
        return map
    }

    proxy(obj: Object, yObj: Y.Map<any> | Y.Array<any>) {
        if (typeof obj !== 'object') return obj
        if(isBlockModel(obj)) {
            // @ts-ignore
            obj.meta = this.proxyMap(obj.meta, yObj.get('meta') as Y.Map<any>)
            // @ts-ignore
            obj.props = this.proxyMap(obj.props, yObj.get('props') as Y.Map<any>)
            return obj
        }

        if (obj instanceof Array) {
            return this.proxyArray(obj, yObj as Y.Array<any>)
        }
        return this.proxyMap(obj, yObj as Y.Map<any>)
    }

    proxyMap(obj: Record<string, any>, yMap: Y.Map<any>) {
        // console.log('proxyMap', obj, yMap)
        for (const key in obj) {
            const v = obj[key]
            if (typeof v === 'object')
                obj[key] = this.proxy(v, yMap.get(key))
        }
        return syncChangeMap(obj, yMap)
    }

    proxyArray(arr: any[], yArr: Y.Array<any>) {
        for (let i = 0; i < arr.length; i++) {
            const v = arr[i]
            if (typeof v === 'object')
                arr[i] = this.proxy(v, yArr.get(i))
        }
        return syncChangeArray(arr, yArr)
    }

    private obj2y = <T extends SimpleRecord | Array<SimpleValue>>(obj: T) => {
        // console.log('obj2y', obj)

        if (obj instanceof Array) {
            const yarr = new Y.Array<unknown>()
            yarr.push(obj)
            syncChangeArray(obj, yarr)
            return {
                obj: obj,
                yObj: yarr
            }
        }

        const ym = new Y.Map<unknown>()
        for (const key in obj) {
            const v = obj[key]
            if (typeof v === 'object') {
                ym.set(key, this.obj2y(v as T).yObj)
                continue
            }
            ym.set(key, v)
        }
        const _o = syncChangeMap(obj, ym,)
        return {
            obj: _o as T,
            yObj: ym
        }
    }

}


