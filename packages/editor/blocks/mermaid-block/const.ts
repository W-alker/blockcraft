import {IMermaidType} from "./types";

export const MERMAID_TYPE_LIST: IMermaidType[] = [
  {
    name: '时序图',
    prefix: 'sequenceDiagram\n',
    template: '\tAlice->>John: Hello John, how are you?\n' +
      '\tJohn-->>Alice: Great!\n' +
      '\tAlice-)John: See you later!\n'
  },
  {
    name: '流程图',
    prefix: 'flowchart LR\n',
    template: '\tA[Start] --> B{Is it?}\n' +
      '\tB -- Yes --> C[OK]\n' +
      '\tC --> D[Rethink]\n' +
      '\tD --> B\n' +
      '\tB -- No ----> E[End]'
  },
  {
    name: '类图',
    prefix: 'classDiagram\n',
    template: '\tclass BankAccount\n' +
      '\tBankAccount : +String owner\n' +
      '\tBankAccount : +Bigdecimal balance\n' +
      '\tBankAccount : +deposit(amount)\n' +
      '\tBankAccount : +withdrawal(amount)'
  },
  {
    name: '思维导图',
    prefix: 'mindmap\n',
    template: 'Root\n' +
      '\tA[A]\n' +
      '\t:::urgent large\n' +
      '\tB(B)\n' +
      '\tC'
  },
  {
    name: '时间线图',
    prefix: 'timeline\n',
    template: '\ttitle History of Social Media Platform\n' +
      '\t2002 : LinkedIn\n' +
      '\t2004 : Facebook\n' +
      '\t     : Google\n' +
      '\t2005 : Youtube\n' +
      '\t2006 : Twitter'
  }
]
