import {IBlockSnapshot} from "../../framework";

/**
 * 将源文档顶层块序列切分为「演示页」列表。
 *
 * 切页规则分两类：
 * - **纯分页标记**（`page-divider`）：演示模式下 `display:none`，只用于结束当前页，
 *   自身不进入任何一页，避免渲染出空白页。
 * - **内容型分页块**（标题 / callout）：既结束当前页，又作为新页的首个内容块。
 *
 * 其余普通块累积进当前页。
 */
export function analyzePages(snapshots: IBlockSnapshot[]): IBlockSnapshot[][] {
  const pages: IBlockSnapshot[][] = [];
  let currentPage: IBlockSnapshot[] = [];

  const flush = () => {
    if (currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [];
    }
  };

  for (const block of snapshots) {
    if (isSeparatorBreak(block)) {
      // 纯分页标记：结束当前页，但自身不进入任何一页。
      // 否则在「分页符紧跟另一个分页块（如标题）」或「末尾/连续分页符」时，
      // 分页符会独占一页，而它在演示模式下 display:none，渲染出完全空白页。
      flush();
    } else if (isContentBreak(block)) {
      // 内容型分页块（标题 / callout）：结束当前页并作为新页首块。
      flush();
      currentPage = [block];
    } else {
      currentPage.push(block);
    }
  }

  flush();

  return pages;
}

/**
 * 纯分页标记：演示模式下 `display:none`（见 demo-presentation.scss `.page-divider-block`），
 * 只负责切页，不作为任何一页的内容渲染。
 */
function isSeparatorBreak(block: IBlockSnapshot): boolean {
  return (block.flavour as string) === 'page-divider';
}

/** 内容型分页块：既切页、又作为新页首个内容块渲染（标题、callout）。 */
function isContentBreak(block: IBlockSnapshot): boolean {
  return block.flavour === 'callout' || !!block.props['heading'];
}
