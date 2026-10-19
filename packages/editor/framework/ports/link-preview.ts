export type LinkPreviewData = {
  description: string | null;
  icon: string | null;
  image: string | null;
  title: string | null;
};

/** 宿主只提供归一化预览数据，外部 API 响应 DTO 归属具体实现。 */
export interface DocLinkPreviewPort {
  query: (url: string, signal?: AbortSignal) => Promise<Partial<LinkPreviewData>>;
}
