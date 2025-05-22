import {IMermaidType} from "./types";

export const MERMAID_TYPE_LIST: IMermaidType[] = [
  {
    name: '时序图',
    prefix: 'sequenceDiagram\n',
    template: '  Alice->>John: Hello John, how are you?\n' +
      '  John-->>Alice: Great!\n' +
      '  Alice-)John: See you later!\n'
  },
  {
    name: '流程图',
    prefix: 'flowchart LR\n',
    template: '  A[Start] --> B{Is it?}\n' +
      '  B -- Yes --> C[OK]\n' +
      '  C --> D[Rethink]\n' +
      '  D --> B\n' +
      '  B -- No ----> E[End]'
  },
  {
    name: '类图',
    prefix: 'classDiagram\n',
    template: '  class BankAccount\n' +
      '  BankAccount : +String owner\n' +
      '  BankAccount : +Bigdecimal balance\n' +
      '  BankAccount : +deposit(amount)\n' +
      '  BankAccount : +withdrawal(amount)'
  },
  {
    name: '思维导图',
    prefix: 'mindmap\n',
    template: 'Root\n' +
      '  A[A]\n' +
      '  :::urgent large\n' +
      '  B(B)\n' +
      '  C'
  },
  {
    name: '时间线图',
    prefix: 'timeline\n',
    template: '  title History of Social Media Platform\n' +
      '  2002 : LinkedIn\n' +
      '  2004 : Facebook\n' +
      '         : Google\n' +
      '    2005 : Youtube\n' +
      '    2006 : Twitter'
  }
]
