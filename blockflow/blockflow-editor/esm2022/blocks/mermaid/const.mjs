export const TEMPLATE_LIST = [
    {
        name: '时序图',
        prefix: 'sequenceDiagram\n',
        template: '    Alice->>John: Hello John, how are you?\n' +
            '    John-->>Alice: Great!\n' +
            '    Alice-)John: See you later!\n'
    },
    {
        name: '流程图',
        prefix: 'flowchart LR\n',
        template: '    A[Start] --> B{Is it?}\n' +
            '    B -- Yes --> C[OK]\n' +
            '    C --> D[Rethink]\n' +
            '    D --> B\n' +
            '    B -- No ----> E[End]'
    },
    {
        name: '类图',
        prefix: 'classDiagram\n',
        template: '    class BankAccount\n' +
            '    BankAccount : +String owner\n' +
            '    BankAccount : +Bigdecimal balance\n' +
            '    BankAccount : +deposit(amount)\n' +
            '    BankAccount : +withdrawal(amount)'
    },
    {
        name: '思维导图',
        prefix: 'mindmap\n',
        template: '    Root\n' +
            '        A[A]\n' +
            '        :::urgent large\n' +
            '        B(B)\n' +
            '        C'
    },
    {
        name: '时间线图',
        prefix: 'timeline\n',
        template: '    title History of Social Media Platform\n' +
            '    2002 : LinkedIn\n' +
            '    2004 : Facebook\n' +
            '         : Google\n' +
            '    2005 : Youtube\n' +
            '    2006 : Twitter'
    }
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2Jsb2Nrcy9tZXJtYWlkL2NvbnN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQU1BLE1BQU0sQ0FBQyxNQUFNLGFBQWEsR0FBRztJQUMzQjtRQUNFLElBQUksRUFBRSxLQUFLO1FBQ1gsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixRQUFRLEVBQUUsOENBQThDO1lBQ3RELDZCQUE2QjtZQUM3QixtQ0FBbUM7S0FDdEM7SUFDRDtRQUNFLElBQUksRUFBRSxLQUFLO1FBQ1gsTUFBTSxFQUFFLGdCQUFnQjtRQUN4QixRQUFRLEVBQUUsOEJBQThCO1lBQ3RDLDBCQUEwQjtZQUMxQix3QkFBd0I7WUFDeEIsZUFBZTtZQUNmLDBCQUEwQjtLQUM3QjtJQUNEO1FBQ0UsSUFBSSxFQUFFLElBQUk7UUFDVixNQUFNLEVBQUUsZ0JBQWdCO1FBQ3hCLFFBQVEsRUFBRSx5QkFBeUI7WUFDakMsbUNBQW1DO1lBQ25DLHlDQUF5QztZQUN6QyxzQ0FBc0M7WUFDdEMsdUNBQXVDO0tBQzFDO0lBQ0Q7UUFDRSxJQUFJLEVBQUUsTUFBTTtRQUNaLE1BQU0sRUFBRSxXQUFXO1FBQ25CLFFBQVEsRUFBRSxZQUFZO1lBQ3BCLGdCQUFnQjtZQUNoQiwyQkFBMkI7WUFDM0IsZ0JBQWdCO1lBQ2hCLFdBQVc7S0FDZDtJQUNEO1FBQ0UsSUFBSSxFQUFFLE1BQU07UUFDWixNQUFNLEVBQUUsWUFBWTtRQUNwQixRQUFRLEVBQUUsOENBQThDO1lBQ3RELHVCQUF1QjtZQUN2Qix1QkFBdUI7WUFDdkIscUJBQXFCO1lBQ3JCLHNCQUFzQjtZQUN0QixvQkFBb0I7S0FDdkI7Q0FDRixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGludGVyZmFjZSBJVGVtcGxhdGUge1xuICBuYW1lOiBzdHJpbmdcbiAgdGVtcGxhdGU6IHN0cmluZ1xuICBwcmVmaXg6IHN0cmluZ1xufVxuXG5leHBvcnQgY29uc3QgVEVNUExBVEVfTElTVCA9IFtcbiAge1xuICAgIG5hbWU6ICfml7bluo/lm74nLFxuICAgIHByZWZpeDogJ3NlcXVlbmNlRGlhZ3JhbVxcbicsXG4gICAgdGVtcGxhdGU6ICcgICAgQWxpY2UtPj5Kb2huOiBIZWxsbyBKb2huLCBob3cgYXJlIHlvdT9cXG4nICtcbiAgICAgICcgICAgSm9obi0tPj5BbGljZTogR3JlYXQhXFxuJyArXG4gICAgICAnICAgIEFsaWNlLSlKb2huOiBTZWUgeW91IGxhdGVyIVxcbidcbiAgfSxcbiAge1xuICAgIG5hbWU6ICfmtYHnqIvlm74nLFxuICAgIHByZWZpeDogJ2Zsb3djaGFydCBMUlxcbicsXG4gICAgdGVtcGxhdGU6ICcgICAgQVtTdGFydF0gLS0+IEJ7SXMgaXQ/fVxcbicgK1xuICAgICAgJyAgICBCIC0tIFllcyAtLT4gQ1tPS11cXG4nICtcbiAgICAgICcgICAgQyAtLT4gRFtSZXRoaW5rXVxcbicgK1xuICAgICAgJyAgICBEIC0tPiBCXFxuJyArXG4gICAgICAnICAgIEIgLS0gTm8gLS0tLT4gRVtFbmRdJ1xuICB9LFxuICB7XG4gICAgbmFtZTogJ+exu+WbvicsXG4gICAgcHJlZml4OiAnY2xhc3NEaWFncmFtXFxuJyxcbiAgICB0ZW1wbGF0ZTogJyAgICBjbGFzcyBCYW5rQWNjb3VudFxcbicgK1xuICAgICAgJyAgICBCYW5rQWNjb3VudCA6ICtTdHJpbmcgb3duZXJcXG4nICtcbiAgICAgICcgICAgQmFua0FjY291bnQgOiArQmlnZGVjaW1hbCBiYWxhbmNlXFxuJyArXG4gICAgICAnICAgIEJhbmtBY2NvdW50IDogK2RlcG9zaXQoYW1vdW50KVxcbicgK1xuICAgICAgJyAgICBCYW5rQWNjb3VudCA6ICt3aXRoZHJhd2FsKGFtb3VudCknXG4gIH0sXG4gIHtcbiAgICBuYW1lOiAn5oCd57u05a+85Zu+JyxcbiAgICBwcmVmaXg6ICdtaW5kbWFwXFxuJyxcbiAgICB0ZW1wbGF0ZTogJyAgICBSb290XFxuJyArXG4gICAgICAnICAgICAgICBBW0FdXFxuJyArXG4gICAgICAnICAgICAgICA6Ojp1cmdlbnQgbGFyZ2VcXG4nICtcbiAgICAgICcgICAgICAgIEIoQilcXG4nICtcbiAgICAgICcgICAgICAgIEMnXG4gIH0sXG4gIHtcbiAgICBuYW1lOiAn5pe26Ze057q/5Zu+JyxcbiAgICBwcmVmaXg6ICd0aW1lbGluZVxcbicsXG4gICAgdGVtcGxhdGU6ICcgICAgdGl0bGUgSGlzdG9yeSBvZiBTb2NpYWwgTWVkaWEgUGxhdGZvcm1cXG4nICtcbiAgICAgICcgICAgMjAwMiA6IExpbmtlZEluXFxuJyArXG4gICAgICAnICAgIDIwMDQgOiBGYWNlYm9va1xcbicgK1xuICAgICAgJyAgICAgICAgIDogR29vZ2xlXFxuJyArXG4gICAgICAnICAgIDIwMDUgOiBZb3V0dWJlXFxuJyArXG4gICAgICAnICAgIDIwMDYgOiBUd2l0dGVyJ1xuICB9XG5dXG4iXX0=