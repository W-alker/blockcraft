import { TodoListBlock } from "./todo-list.block";
export const TodoListSchema = {
    flavour: 'todo-list',
    nodeType: 'editable',
    icon: 'bf_icon bf_gongzuoshixiang',
    svgIcon: 'bf_gongzuoshixiang-color',
    label: '工作事项',
    render: TodoListBlock,
    onCreate: (deltas, props) => {
        return {
            props: () => ({
                checked: false,
                indent: props?.indent || 0
            }),
            children: deltas
        };
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2Jsb2Nrcy90b2RvLWxpc3QvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxFQUFDLGFBQWEsRUFBQyxNQUFNLG1CQUFtQixDQUFDO0FBRWhELE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBc0Q7SUFDL0UsT0FBTyxFQUFFLFdBQVc7SUFDcEIsUUFBUSxFQUFFLFVBQVU7SUFDcEIsSUFBSSxFQUFFLDRCQUE0QjtJQUNsQyxPQUFPLEVBQUUsMEJBQTBCO0lBQ25DLEtBQUssRUFBRSxNQUFNO0lBQ2IsTUFBTSxFQUFFLGFBQWE7SUFDckIsUUFBUSxFQUFFLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQzFCLE9BQU87WUFDTCxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztnQkFDWixPQUFPLEVBQUUsS0FBSztnQkFDZCxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO2FBQzNCLENBQUM7WUFDRixRQUFRLEVBQUUsTUFBTTtTQUNqQixDQUFBO0lBQ0gsQ0FBQztDQUNGLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0lUb2RvTGlzdEJsb2NrTW9kZWx9IGZyb20gXCIuL3R5cGVcIjtcbmltcG9ydCB7RWRpdGFibGVCbG9ja1NjaGVtYX0gZnJvbSBcIi4uLy4uL2NvcmVcIjtcbmltcG9ydCB7VG9kb0xpc3RCbG9ja30gZnJvbSBcIi4vdG9kby1saXN0LmJsb2NrXCI7XG5cbmV4cG9ydCBjb25zdCBUb2RvTGlzdFNjaGVtYTogRWRpdGFibGVCbG9ja1NjaGVtYTxJVG9kb0xpc3RCbG9ja01vZGVsWydwcm9wcyddPiA9IHtcbiAgZmxhdm91cjogJ3RvZG8tbGlzdCcsXG4gIG5vZGVUeXBlOiAnZWRpdGFibGUnLFxuICBpY29uOiAnYmZfaWNvbiBiZl9nb25nenVvc2hpeGlhbmcnLFxuICBzdmdJY29uOiAnYmZfZ29uZ3p1b3NoaXhpYW5nLWNvbG9yJyxcbiAgbGFiZWw6ICflt6XkvZzkuovpobknLFxuICByZW5kZXI6IFRvZG9MaXN0QmxvY2ssXG4gIG9uQ3JlYXRlOiAoZGVsdGFzLCBwcm9wcykgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICBwcm9wczogKCkgPT4gKHtcbiAgICAgICAgY2hlY2tlZDogZmFsc2UsXG4gICAgICAgIGluZGVudDogcHJvcHM/LmluZGVudCB8fCAwXG4gICAgICB9KSxcbiAgICAgIGNoaWxkcmVuOiBkZWx0YXNcbiAgICB9XG4gIH1cbn1cbiJdfQ==