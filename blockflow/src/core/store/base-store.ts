export class BaseStore<StoreItem = any> {
  protected mapStore = new Map<string, StoreItem>()

  constructor() {
  }

  size() {
    return this.mapStore.size;
  }

  keys() {
    return [...this.mapStore.keys()];
  }

  values() {
    return [...this.mapStore.values()];
  }

  get(key: string) {
    return this.mapStore.get(key);
  }

  set(key: string, value: StoreItem) {
    return this.mapStore.set(key, value)
  }
}
