import type {Element, Properties} from 'hast'
import {IBlockProps} from '../../framework'
import {OrderedMarkerStyleId} from '../../blocks/ordered-block'

const markerStyleToListType = (
  style: unknown,
): '1' | 'a' | 'A' | 'i' | 'I' | null => {
  switch (style) {
    case 'n1': return '1'
    case 'a1': return 'a'
    case 'a2': return 'A'
    case 'r1': return 'i'
    case 'r2': return 'I'
    default: return null
  }
}

const markerStyleFromListType = (value: unknown): OrderedMarkerStyleId | null => {
  switch (value) {
    case '1': return 'n1'
    case 'a': return 'a1'
    case 'A': return 'a2'
    case 'i': return 'r1'
    case 'I': return 'r2'
    default: return null
  }
}

export const orderedListHtmlProperties = (props: IBlockProps): Properties => {
  const type = markerStyleToListType(props['ms'])
  return type ? {type} : {}
}

export const orderedMarkerFromHtml = (
  parentList?: Element,
): Partial<IBlockProps> => {
  const fallback = markerStyleFromListType(parentList?.properties?.['type'])
  return fallback ? {ms: fallback} : {}
}

export const orderedListTypeForProps = (props: IBlockProps) =>
  markerStyleToListType(props['ms'])
