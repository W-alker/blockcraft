import { BlockquoteBlock } from "./blockquote.block";
export const BlockquoteSchema = {
    flavour: 'blockquote',
    nodeType: 'editable',
    icon: 'bf_icon bf_blockquote',
    label: '引用块',
    render: BlockquoteBlock,
    onCreate: (deltas, props) => {
        return {
            props: () => ({
                indent: 0
            }),
            children: deltas
        };
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2Jsb2Nrcy9ibG9ja3F1b3RlL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBQyxlQUFlLEVBQUMsTUFBTSxvQkFBb0IsQ0FBQztBQUVuRCxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBNkI7SUFDeEQsT0FBTyxFQUFFLFlBQVk7SUFDckIsUUFBUSxFQUFFLFVBQVU7SUFDcEIsSUFBSSxFQUFFLHVCQUF1QjtJQUM3QixLQUFLLEVBQUUsS0FBSztJQUNaLE1BQU0sRUFBRSxlQUFlO0lBQ3ZCLFFBQVEsRUFBRSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUMxQixPQUFPO1lBQ0wsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQ1osTUFBTSxFQUFFLENBQUM7YUFDVixDQUFDO1lBQ0YsUUFBUSxFQUFFLE1BQU07U0FDakIsQ0FBQTtJQUNILENBQUM7Q0FDRixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtFZGl0YWJsZUJsb2NrU2NoZW1hfSBmcm9tIFwiLi4vLi4vY29yZVwiO1xuaW1wb3J0IHtCbG9ja3F1b3RlQmxvY2t9IGZyb20gXCIuL2Jsb2NrcXVvdGUuYmxvY2tcIjtcblxuZXhwb3J0IGNvbnN0IEJsb2NrcXVvdGVTY2hlbWE6IEVkaXRhYmxlQmxvY2tTY2hlbWE8YW55PiA9IHtcbiAgZmxhdm91cjogJ2Jsb2NrcXVvdGUnLFxuICBub2RlVHlwZTogJ2VkaXRhYmxlJyxcbiAgaWNvbjogJ2JmX2ljb24gYmZfYmxvY2txdW90ZScsXG4gIGxhYmVsOiAn5byV55So5Z2XJyxcbiAgcmVuZGVyOiBCbG9ja3F1b3RlQmxvY2ssXG4gIG9uQ3JlYXRlOiAoZGVsdGFzLCBwcm9wcykgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICBwcm9wczogKCkgPT4gKHtcbiAgICAgICAgaW5kZW50OiAwXG4gICAgICB9KSxcbiAgICAgIGNoaWxkcmVuOiBkZWx0YXNcbiAgICB9XG4gIH1cbn1cbiJdfQ==