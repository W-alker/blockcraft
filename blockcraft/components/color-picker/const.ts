export interface IColorItem {
  name: string;
  value: string
}

export const BUILTIN_COLOR_LIST: readonly IColorItem[] = Object.freeze([
  {
    name: "mark",
    value: '#333',
  },
  {
    name: "mark",
    value: '#d9dcdf',
  },
  {
    name: "mark",
    value: '#9ad7d7',
  },
  {
    name: "mark",
    value: '#dc9b9b',
  },
  {
    name: "mark",
    value: '#dcae8e',
  },
  {
    name: "mark",
    value: '#d3b77d',
  },
  {
    name: "mark",
    value: '#7fce7e',
  },
  {
    name: "mark",
    value: '#8a9ad5',
  },
  {
    name: "mark",
    value: '#a891d9',
  },
])

export const BUILTIN_BG_COLOR_LIST: readonly IColorItem[] = Object.freeze([
  {
    name: "透明",
    value: 'transparent',
  },
  {
    name: "mark",
    value: '#F4F5F5',
  },
  {
    name: "mark",
    value: '#E0FEFE',
  },
  {
    name: "mark",
    value: '#FEDEDE',
  },
  {
    name: "mark",
    value: '#FFE6CD',
  },
  {
    name: "mark",
    value: '#FFEFBA',
  },
  {
    name: "mark",
    value: '#D3F3D2',
  },
  {
    name: "mark",
    value: '#DCE7FE',
  },
  {
    name: "mark",
    value: '#E9DFFC',
  },
])
