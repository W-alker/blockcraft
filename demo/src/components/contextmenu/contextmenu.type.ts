export type IContextMenuItem = {
  icon: string;
  label: string;
  value?: string;
  line?: false
} | { line: true }
