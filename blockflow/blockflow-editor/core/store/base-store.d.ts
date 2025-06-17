export declare class BaseStore<Key = any, StoreItem = any> {
    protected mapStore: Map<Key, StoreItem>;
    constructor();
    size(): number;
    keys(): Key[];
    has(key: Key): boolean;
    delete(key: Key): boolean;
    values(): StoreItem[];
    get(key: Key): StoreItem | undefined;
    set(key: Key, value: StoreItem): Map<Key, StoreItem>;
}
