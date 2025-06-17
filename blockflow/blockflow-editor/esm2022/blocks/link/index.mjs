import { LinkBlock } from "./link.block";
export const LinkSchema = {
    flavour: 'link',
    nodeType: 'void',
    label: '链接',
    render: LinkBlock,
    icon: 'bf_icon bf_lianjie',
    svgIcon: 'bf_lianjie-color',
    onCreate: () => {
        return {
            props: () => ({
                href: '',
                text: '',
                appearance: 'text'
            }),
            children: []
        };
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2Jsb2Nrcy9saW5rL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBQyxTQUFTLEVBQUMsTUFBTSxjQUFjLENBQUM7QUFFdkMsTUFBTSxDQUFDLE1BQU0sVUFBVSxHQUEwQztJQUMvRCxPQUFPLEVBQUUsTUFBTTtJQUNmLFFBQVEsRUFBRSxNQUFNO0lBQ2hCLEtBQUssRUFBRSxJQUFJO0lBQ1gsTUFBTSxFQUFFLFNBQVM7SUFDakIsSUFBSSxFQUFFLG9CQUFvQjtJQUMxQixPQUFPLEVBQUUsa0JBQWtCO0lBQzNCLFFBQVEsRUFBRSxHQUFHLEVBQUU7UUFDYixPQUFPO1lBQ0wsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQ1osSUFBSSxFQUFFLEVBQUU7Z0JBQ1IsSUFBSSxFQUFFLEVBQUU7Z0JBQ1IsVUFBVSxFQUFFLE1BQU07YUFDbkIsQ0FBQztZQUNGLFFBQVEsRUFBRSxFQUFFO1NBQ2IsQ0FBQTtJQUNILENBQUM7Q0FDRixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtCbG9ja1NjaGVtYX0gZnJvbSBcIi4uLy4uL2NvcmVcIjtcbmltcG9ydCB7SUxpbmtCbG9ja01vZGVsfSBmcm9tIFwiLi90eXBlXCI7XG5pbXBvcnQge0xpbmtCbG9ja30gZnJvbSBcIi4vbGluay5ibG9ja1wiO1xuXG5leHBvcnQgY29uc3QgTGlua1NjaGVtYTogQmxvY2tTY2hlbWE8SUxpbmtCbG9ja01vZGVsWydwcm9wcyddPiA9IHtcbiAgZmxhdm91cjogJ2xpbmsnLFxuICBub2RlVHlwZTogJ3ZvaWQnLFxuICBsYWJlbDogJ+mTvuaOpScsXG4gIHJlbmRlcjogTGlua0Jsb2NrLFxuICBpY29uOiAnYmZfaWNvbiBiZl9saWFuamllJyxcbiAgc3ZnSWNvbjogJ2JmX2xpYW5qaWUtY29sb3InLFxuICBvbkNyZWF0ZTogKCkgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICBwcm9wczogKCkgPT4gKHtcbiAgICAgICAgaHJlZjogJycsXG4gICAgICAgIHRleHQ6ICcnLFxuICAgICAgICBhcHBlYXJhbmNlOiAndGV4dCdcbiAgICAgIH0pLFxuICAgICAgY2hpbGRyZW46IFtdXG4gICAgfVxuICB9XG59XG4iXX0=