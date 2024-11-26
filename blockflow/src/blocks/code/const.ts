import { IModeItem } from "./type";

export const LANGUAGE_LIST: IModeItem[] = [
  { value: 'java', name: 'Java' },
  { value: 'javascript', name: 'JavaScript' },
  { value: 'css', name: 'CSS' },
  { value: 'html', name: 'HTML' },
  { value: 'php', name: 'PHP' },
  { value: 'python', name: 'Python' },
  { value: 'go', name: 'Go' },
  { value: 'c', name: 'C' },
  { value: 'cs', name: 'C#' },
  { value: 'cpp', name: 'C++' },
  { value: 'rust', name: 'Rust' },
  { value: 'json', name: 'JSON' },
  { value: 'sql', name: 'SQL' },
  { value: 'xml', name: 'XML' },
].sort((item1, item2) => item1.name.localeCompare(item2.name))
