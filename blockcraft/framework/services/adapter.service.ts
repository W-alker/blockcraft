import {InjectionToken} from "@angular/core";
import {IBlockSnapshot} from "../block-std";

export const DOC_ADAPTER_SERVICE_TOKEN = new InjectionToken<DocAdapterService>("DOC_ADAPTER_SERVICE_TOKEN")

export abstract class DocAdapterService {
  abstract html2snapshot(html: string): Promise<IBlockSnapshot>

  abstract snapshot2html(snapshot: IBlockSnapshot): Promise<string>
}
