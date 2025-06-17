export interface Config {
    enable: boolean;
    host: HTMLElement;
    document: Document;
    selectionAreaClass: string;
    selectable?: string;
    onItemSelect: (element: Element) => void;
    onItemUnselect: (element: Element) => void;
    onlyLeftButton: boolean;
    sensitivity: number;
}
