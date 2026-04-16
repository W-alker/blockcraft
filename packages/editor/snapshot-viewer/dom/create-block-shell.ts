import {BlockNodeType, IBlockSnapshot} from "../../framework/block-std/types/block.type";

export function createBlockShell(snapshot: IBlockSnapshot): HTMLElement {
  const element = document.createElement(getTagName(snapshot))
  element.dataset["blockId"] = snapshot.id
  element.dataset["nodeType"] = `${snapshot.nodeType}`
  element.classList.add("bc-snapshot-block")
  element.classList.add(toBlockClassName(snapshot.flavour))
  element.classList.add(`bc-flavour-${toClassToken(snapshot.flavour)}`)

  if (snapshot.nodeType === BlockNodeType.root) {
    element.setAttribute("data-blockcraft-root", "true")
    element.classList.add("readonly")
  }

  return element
}

function getTagName(snapshot: IBlockSnapshot): string {
  switch (snapshot.flavour) {
    case "paragraph":
      return "p"
    case "blockquote":
      return "blockquote"
    case "caption":
      return "figcaption"
    case "table-row":
      return "tr"
    case "table-cell":
      return "td"
    default:
      return "div"
  }
}

function toBlockClassName(flavour: string): string {
  if (flavour === "mermaid-textarea") {
    return "mermaid-textarea"
  }
  return `${toClassToken(flavour)}-block`
}

function toClassToken(flavour: string): string {
  return `${flavour}`.replace(/[^a-zA-Z0-9-_]/g, "-")
}
