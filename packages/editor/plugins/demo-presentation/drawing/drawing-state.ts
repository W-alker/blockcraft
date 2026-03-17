import Konva from 'konva';

export class DrawingStateManager {
  private pageStates: Map<number, string> = new Map();

  savePage(pageIndex: number, layer: Konva.Layer): void {
    const json = layer.toJSON();
    this.pageStates.set(pageIndex, json);
  }

  restorePage(pageIndex: number, layer: Konva.Layer): void {
    layer.destroyChildren();
    const json = this.pageStates.get(pageIndex);
    if (json) {
      const data = JSON.parse(json);
      if (data.children) {
        for (const childData of data.children) {
          const node = Konva.Node.create(JSON.stringify(childData));
          layer.add(node);
        }
      }
    }
    layer.batchDraw();
  }

  hasState(pageIndex: number): boolean {
    return this.pageStates.has(pageIndex);
  }

  clearPage(pageIndex: number): void {
    this.pageStates.delete(pageIndex);
  }

  clearAll(): void {
    this.pageStates.clear();
  }
}
