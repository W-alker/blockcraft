import { OrderedListBlock } from "./ordered-list.block";
export * from './utils/index';
export * from './type';
export * from './ordered-list.block';
export const OrderedListSchema = {
    flavour: 'ordered-list',
    nodeType: 'editable',
    render: OrderedListBlock,
    icon: 'bf_icon bf_youxuliebiao',
    svgIcon: 'bf_youxuliebiao-color',
    label: '有序列表',
    onCreate: (deltas, props) => {
        return {
            props: () => ({
                order: Math.max((props?.["order"] || 0), 0),
                indent: props?.indent || 0
            }),
            children: deltas
        };
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2Jsb2Nrcy9vcmRlcmVkLWxpc3QvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxFQUFDLGdCQUFnQixFQUFDLE1BQU0sc0JBQXNCLENBQUM7QUFDdEQsY0FBYyxlQUFlLENBQUE7QUFDN0IsY0FBYyxRQUFRLENBQUE7QUFDdEIsY0FBYyxzQkFBc0IsQ0FBQTtBQUVwQyxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBeUQ7SUFDckYsT0FBTyxFQUFFLGNBQWM7SUFDdkIsUUFBUSxFQUFFLFVBQVU7SUFDcEIsTUFBTSxFQUFFLGdCQUFnQjtJQUN4QixJQUFJLEVBQUUseUJBQXlCO0lBQy9CLE9BQU8sRUFBRSx1QkFBdUI7SUFDaEMsS0FBSyxFQUFFLE1BQU07SUFDYixRQUFRLEVBQUUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUU7UUFDMUIsT0FBTztZQUNMLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO2dCQUNaLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQVMsS0FBSyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNuRCxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO2FBQzNCLENBQUM7WUFDRixRQUFRLEVBQUUsTUFBTTtTQUNqQixDQUFBO0lBQ0gsQ0FBQztDQUNGLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0VkaXRhYmxlQmxvY2tTY2hlbWF9IGZyb20gXCIuLi8uLi9jb3JlXCI7XG5pbXBvcnQge0lPcmRlcmVkTGlzdEJsb2NrTW9kZWx9IGZyb20gXCIuL3R5cGVcIjtcbmltcG9ydCB7T3JkZXJlZExpc3RCbG9ja30gZnJvbSBcIi4vb3JkZXJlZC1saXN0LmJsb2NrXCI7XG5leHBvcnQgKiBmcm9tICcuL3V0aWxzL2luZGV4J1xuZXhwb3J0ICogZnJvbSAnLi90eXBlJ1xuZXhwb3J0ICogZnJvbSAnLi9vcmRlcmVkLWxpc3QuYmxvY2snXG5cbmV4cG9ydCBjb25zdCBPcmRlcmVkTGlzdFNjaGVtYTogRWRpdGFibGVCbG9ja1NjaGVtYTxJT3JkZXJlZExpc3RCbG9ja01vZGVsWydwcm9wcyddPiA9IHtcbiAgZmxhdm91cjogJ29yZGVyZWQtbGlzdCcsXG4gIG5vZGVUeXBlOiAnZWRpdGFibGUnLFxuICByZW5kZXI6IE9yZGVyZWRMaXN0QmxvY2ssXG4gIGljb246ICdiZl9pY29uIGJmX3lvdXh1bGllYmlhbycsXG4gIHN2Z0ljb246ICdiZl95b3V4dWxpZWJpYW8tY29sb3InLFxuICBsYWJlbDogJ+acieW6j+WIl+ihqCcsXG4gIG9uQ3JlYXRlOiAoZGVsdGFzLCBwcm9wcykgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICBwcm9wczogKCkgPT4gKHtcbiAgICAgICAgb3JkZXI6IE1hdGgubWF4KCg8bnVtYmVyPnByb3BzPy5bXCJvcmRlclwiXSB8fCAwKSwgMCksXG4gICAgICAgIGluZGVudDogcHJvcHM/LmluZGVudCB8fCAwXG4gICAgICB9KSxcbiAgICAgIGNoaWxkcmVuOiBkZWx0YXNcbiAgICB9XG4gIH1cbn1cbiJdfQ==