export interface Config {
  // switch to enable the block selection
  enable: boolean
  // which element to attach the block selection
  host: HTMLElement
  // document object
  document: Document
  // the class name of the block selection area
  selectionAreaClass: string
  // the css selector of the block element. If this not set, the block selection will select the children of the host element
  selectable?: string
  // the callback when the block selected
  onItemSelect: (element: Element) => void
  // the callback when the block unselected
  onItemUnselect: (element: Element) => void
  // if only left button can trigger the block selection
  onlyLeftButton: boolean
  // the sensitivity of the block selection, it`s means the distance to trigger the block selection
  sensitivity: number
}
