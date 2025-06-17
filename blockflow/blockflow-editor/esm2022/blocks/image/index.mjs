import { ImageBlock } from "./image.block";
export * from './token';
export const ImageSchema = {
    flavour: 'image',
    nodeType: 'block',
    render: ImageBlock,
    icon: 'bf_icon bf_tupian-color',
    svgIcon: 'bf_tupian-color',
    label: '图片',
    onCreate: (src, width) => {
        if (!src)
            throw new Error('src is required');
        return {
            props: () => ({
                src,
                width: width || 400,
                height: 0,
                align: 'left'
            }),
            children: []
        };
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2Jsb2Nrcy9pbWFnZS9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUMsVUFBVSxFQUFDLE1BQU0sZUFBZSxDQUFDO0FBR3pDLGNBQWMsU0FBUyxDQUFBO0FBRXZCLE1BQU0sQ0FBQyxNQUFNLFdBQVcsR0FBa0M7SUFDeEQsT0FBTyxFQUFFLE9BQU87SUFDaEIsUUFBUSxFQUFFLE9BQU87SUFDakIsTUFBTSxFQUFFLFVBQVU7SUFDbEIsSUFBSSxFQUFFLHlCQUF5QjtJQUMvQixPQUFPLEVBQUUsaUJBQWlCO0lBQzFCLEtBQUssRUFBRSxJQUFJO0lBQ1gsUUFBUSxFQUFFLENBQUMsR0FBVyxFQUFFLEtBQWMsRUFBRSxFQUFFO1FBQ3hDLElBQUcsQ0FBQyxHQUFHO1lBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFBO1FBQzNDLE9BQU87WUFDTCxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztnQkFDWixHQUFHO2dCQUNILEtBQUssRUFBRSxLQUFLLElBQUksR0FBRztnQkFDbkIsTUFBTSxFQUFFLENBQUM7Z0JBQ1QsS0FBSyxFQUFFLE1BQU07YUFDZCxDQUFDO1lBQ0YsUUFBUSxFQUFFLEVBQUU7U0FDYixDQUFBO0lBQ0gsQ0FBQztDQUNGLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0ltYWdlQmxvY2t9IGZyb20gXCIuL2ltYWdlLmJsb2NrXCI7XG5pbXBvcnQge0lJbWFnZUJsb2NrUHJvcHN9IGZyb20gXCIuL3R5cGVcIjtcbmltcG9ydCB7QmxvY2tTY2hlbWF9IGZyb20gXCIuLi8uLi9jb3JlXCI7XG5leHBvcnQgKiBmcm9tICcuL3Rva2VuJ1xuXG5leHBvcnQgY29uc3QgSW1hZ2VTY2hlbWE6IEJsb2NrU2NoZW1hPElJbWFnZUJsb2NrUHJvcHM+ID0ge1xuICBmbGF2b3VyOiAnaW1hZ2UnLFxuICBub2RlVHlwZTogJ2Jsb2NrJyxcbiAgcmVuZGVyOiBJbWFnZUJsb2NrLFxuICBpY29uOiAnYmZfaWNvbiBiZl90dXBpYW4tY29sb3InLFxuICBzdmdJY29uOiAnYmZfdHVwaWFuLWNvbG9yJyxcbiAgbGFiZWw6ICflm77niYcnLFxuICBvbkNyZWF0ZTogKHNyYzogc3RyaW5nLCB3aWR0aD86IG51bWJlcikgPT4ge1xuICAgIGlmKCFzcmMpIHRocm93IG5ldyBFcnJvcignc3JjIGlzIHJlcXVpcmVkJylcbiAgICByZXR1cm4ge1xuICAgICAgcHJvcHM6ICgpID0+ICh7XG4gICAgICAgIHNyYyxcbiAgICAgICAgd2lkdGg6IHdpZHRoIHx8IDQwMCxcbiAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICBhbGlnbjogJ2xlZnQnXG4gICAgICB9KSxcbiAgICAgIGNoaWxkcmVuOiBbXVxuICAgIH1cbiAgfVxufVxuIl19