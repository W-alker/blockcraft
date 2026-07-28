import {Subject} from "rxjs";
import {TranslatePlugin, TranslatePluginService} from "./translate.plugin";

const createService = (): TranslatePluginService => ({
  translate: jasmine.createSpy("translate").and.resolveTo("translated"),
  getSupportedLanguages: jasmine.createSpy("getSupportedLanguages").and.resolveTo([]),
});

const createEditableBlock = (id = "p1") => ({
  id,
  flavour: "paragraph",
  textLength: 6,
  textContent: jasmine.createSpy("textContent").and.returnValue("source"),
  replaceText: jasmine.createSpy("replaceText"),
  insertText: jasmine.createSpy("insertText"),
  setInlineRange: jasmine.createSpy("setInlineRange"),
  hostElement: document.createElement("paragraph-block"),
});

describe("TranslatePlugin lifecycle", () => {
  it("tears down readonly and document destroy observers on destroy", () => {
    const onDestroy$ = new Subject<void>();
    const readonlySub = {
      unsubscribe: jasmine.createSpy("unsubscribeReadonly"),
    };
    const plugin = new TranslatePlugin({persistLastTargetLang: false});
    (plugin as any).doc = {
      onDestroy$,
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange").and.returnValue(readonlySub),
    };
    const closePreview = spyOn<any>(plugin, "closePreview").and.callThrough();

    plugin.init();
    plugin.destroy();
    onDestroy$.next();

    expect(closePreview).toHaveBeenCalledTimes(1);
    expect(readonlySub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not expose translate menu for a stale active block", () => {
    const block = createEditableBlock();
    const plugin = new TranslatePlugin({
      persistLastTargetLang: false,
      service: createService(),
    });
    (plugin as any).doc = {
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
    };

    const options = plugin.createBlockControllerOptions();
    const sections = options.blockMenuResolver!({
      activeBlock: block as any,
      doc: (plugin as any).doc,
      readonly: {readonly: false, source: null, lockUserId: null},
      findClosestBlock: () => null,
    });

    expect(sections).toEqual([]);
  });

  it("does not consume translate action for a stale active block", () => {
    const block = createEditableBlock();
    const plugin = new TranslatePlugin({
      persistLastTargetLang: false,
      service: createService(),
    });
    (plugin as any).doc = {
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
    };

    const translateParagraph = spyOn<any>(plugin, "translateParagraph");
    const options = plugin.createBlockControllerOptions();
    const handled = options.blockMenuActionHandler!({
      item: {name: "translate-paragraph"} as any,
      source: "simple",
      path: [],
    }, {
      activeBlock: block as any,
      doc: (plugin as any).doc,
      readonly: {readonly: false, source: null, lockUserId: null},
      findClosestBlock: () => null,
    });

    expect(handled).toBeFalse();
    expect(translateParagraph).not.toHaveBeenCalled();
  });

  it("does not replace text when the preview block became stale", () => {
    const block = createEditableBlock();
    const plugin = new TranslatePlugin({
      persistLastTargetLang: false,
      service: createService(),
    });
    (plugin as any).doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
      messageService: {
        warn: jasmine.createSpy("warn"),
        success: jasmine.createSpy("success"),
      },
    };
    (plugin as any)._activeEditableBlock = block;
    (plugin as any)._translatedText = "translated";

    (plugin as any).replaceOriginalText();

    expect(block.replaceText).not.toHaveBeenCalled();
    expect(block.setInlineRange).not.toHaveBeenCalled();
    expect((plugin as any).doc.messageService.success).not.toHaveBeenCalled();
  });

  it("discards an awaited translation when the block becomes readonly", async () => {
    let resolveTranslation!: (value: string) => void;
    const service = createService();
    (service.translate as jasmine.Spy).and.returnValue(new Promise<string>(resolve => {
      resolveTranslation = resolve;
    }));
    const block = createEditableBlock();
    const previewRef = {
      setInput: jasmine.createSpy("setInput"),
    };
    const readonlyManager = {
      isReadonly: jasmine.createSpy("isReadonly").and.returnValue(false),
    };
    const plugin = new TranslatePlugin({
      persistLastTargetLang: false,
      service,
    });
    (plugin as any).doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      readonlyManager,
      messageService: {
        warn: jasmine.createSpy("warn"),
      },
    };
    (plugin as any)._activeEditableBlock = block;
    (plugin as any)._previewRef = previewRef;

    const translation = (plugin as any).translateParagraph(block, {reusePreview: true});
    readonlyManager.isReadonly.and.returnValue(true);
    resolveTranslation("translated");
    await translation;

    expect((plugin as any)._translatedText).toBe("");
    expect(previewRef.setInput).not.toHaveBeenCalledWith("translatedText", "translated");
  });
});
