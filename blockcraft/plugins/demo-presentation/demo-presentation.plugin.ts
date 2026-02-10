import {DocPlugin} from "../../framework";
import {DemoConfig, PresentationController} from "./presentation-controller";

export class DemoPresentationPlugin extends DocPlugin {
  override name = 'demo-presentation';
  override version = 1.0;

  private controller: PresentationController | null = null;

  init() {
    // 扩展 doc API
    (this.doc as any).enterDemoMode = (config?: Partial<DemoConfig>) => {
      this.enter(config);
    };

    (this.doc as any).exitDemoMode = () => {
      this.exit();
    };
  }

  private enter(config?: Partial<DemoConfig>) {
    if (this.controller) {
      this.exit();
    }

    const defaultConfig: DemoConfig = {
      presentation: {
        focusStrategy: 'viewport',
        unfocusedOpacity: 0.3,
        showProgress: true,
        autoHideControls: true,
        autoHideDelay: 3000,
        enableTransition: true,
        transitionDuration: 300,
      },
      preview: {
        showToolbar: true,
      },
    };

    const finalConfig = {
      ...defaultConfig,
      ...config,
      presentation: {...defaultConfig.presentation, ...config?.presentation},
      preview: {...defaultConfig.preview, ...config?.preview},
    } as DemoConfig;

    this.controller = new PresentationController(this.doc, finalConfig);
    this.controller.start();
  }

  private exit() {
    if (this.controller) {
      this.controller.destroy();
      this.controller = null;
    }
  }

  destroy(): void {
    this.exit();
  }
}

