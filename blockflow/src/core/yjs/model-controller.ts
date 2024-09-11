import {DeltaInsert, DeltaOperation, IBlockModel} from "@core";

type Path = (string | number)[]

interface IArrayDeltaOperation {
    retain?: number
    delete?: number
    insert?: any[]
}

type IArrayRecord = IArrayDeltaOperation[]

interface IMapRecord {
    key: string
    action: 'add' | 'update' | 'delete'
    oldVal: any
    newVal: any
}

interface IRecord {
    path: Path
    record: IArrayRecord | IMapRecord | DeltaOperation
    target: any
}

interface ITransaction {
    origin: any,
    records: IRecord[]
}

const definePath = (obj: Object, path: Path) => {
    Object.defineProperty(obj, '_path_', {
        value: path,
        enumerable: false,
        writable: false
    })
}

const getPath = (obj: Object) => {
    // @ts-ignore
    return obj['_path_'] as Path
}

/**
 * @deprecated
 */
export class ModelController {
    blockModelStore = new Map<string, IBlockModel>()
    history: ITransaction[] = []
    private record: IRecord[] = []

    transact(fn: () => void, origin: any = null) {
        fn()
        console.log(JSON.parse(JSON.stringify(this.record)))
        this.history.push({
            origin,
            records: this.record
        })
        this.record = []
    }

    constructor(public readonly rootModel: IBlockModel[], protected rootId: string) {
        this.rootModel = this.proxyArray(rootModel, [this.rootId])
    }

    private setRecord(record: IRecord) {
        this.record.push(record)
    }

    proxyMap(obj: Record<string, any>, path: Path) {
        if (obj['flavour'] && obj['id']) {
            path = [obj['id']]
            this.blockModelStore.set(obj['id'], obj as IBlockModel)
        }
        definePath(obj, path)

        for (const key in obj) {
            if (Array.isArray(obj[key])) {
                if (obj['flavour'] && key === 'children')
                    obj[key] = this.proxyDelta(obj[key], path.concat(key))
                else obj[key] = this.proxyArray(obj[key], path.concat(key))
            } else if (typeof obj[key] === 'object') {
                obj[key] = this.proxyMap(obj[key], path.concat(key))
            }
        }

        return new Proxy(obj, {
            set: (target, key: string, value) => {
                this.setRecord({
                    path,
                    target,
                    record: {
                        key,
                        action: target[key] ? 'update' : 'add',
                        oldVal: target[key],
                        newVal: value
                    }
                })
                return Reflect.set(target, key, value)
            },
            deleteProperty: (target, key: string) => {
                this.setRecord({
                    path,
                    target,
                    record: {
                        key,
                        action: 'delete',
                        oldVal: target[key],
                        newVal: undefined
                    }
                })
                return Reflect.deleteProperty(target, key)
            }
        })

    }

    proxyArray(arr: any[], path: Path) {
        for (const key in arr) {
            if (Array.isArray(arr[key])) {
                arr[key] = this.proxyArray(arr[key], path.concat(key))
            } else if (typeof arr[key] === 'object') {
                arr[key] = this.proxyMap(arr[key], path.concat(key))
            }
        }

        Object.defineProperty(arr, 'push', {
            value: (value: any) => {
                this.setRecord({
                    path,
                    target: arr,
                    record: [{retain: arr.length}, {insert: [value]}]
                })
                return Array.prototype.push.call(arr, value)
            },
            enumerable: false,
            writable: false
        })

        Object.defineProperty(arr, 'splice', {
            value: (start: number, deleteCount: number, ...items: any[]) => {
                const deleted = Array.prototype.splice.call(arr, start, deleteCount)
                this.setRecord({
                    path,
                    target: arr,
                    record: [{retain: start}, {delete: deleted}, {insert: items}]
                })
                return deleted
            },
            enumerable: false,
            writable: false
        })

        Object.defineProperty(arr, 'pop', {
            value: () => {
                this.setRecord({
                    path,
                    target: arr,
                    record: [{retain: arr.length - 1}, {delete: 1}]
                })
                return Array.prototype.pop.call(arr)
            },
            enumerable: false,
            writable: false
        })

        Object.defineProperty(arr, 'shift', {
            value: () => {
                const deleted = Array.prototype.shift.call(arr)
                this.setRecord({
                    path,
                    target: arr,
                    record: [{retain: 0}, {delete: deleted}]
                })
                return deleted
            },
            enumerable: false,
            writable: false
        })

        Object.defineProperty(arr, 'unshift', {
            value: (value: any) => {
                this.setRecord({
                    path,
                    target: arr,
                    record: [{retain: 0}, {insert: [value]}]
                })
                return Array.prototype.unshift.call(arr, value)
            },
            enumerable: false,
            writable: false
        })

        return arr
    }

    proxyDelta(deltas: DeltaInsert[], path: Path) {
        definePath(deltas, path)
        return deltas
    }
}
