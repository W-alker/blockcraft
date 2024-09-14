export class BaseStore<Key = any ,StoreItem = any> {
  protected mapStore = new Map<Key, StoreItem>()

  constructor() {
  }

  size() {
    return this.mapStore.size;
  }

  keys() {
    return [...this.mapStore.keys()];
  }

  has(key: Key) {
    return this.mapStore.has(key);
  }

  delete(key: Key) {
    return this.mapStore.delete(key);
  }

  values() {
    return [...this.mapStore.values()];
  }

  get(key: Key) {
    return this.mapStore.get(key);
  }

  set(key: Key, value: StoreItem) {
    return this.mapStore.set(key, value)
  }
}
