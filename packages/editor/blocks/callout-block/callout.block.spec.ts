import { CsEmojiPickerComponent } from "@cses/ui";
import { Subject } from "rxjs";
import { CalloutBlockComponent } from "./callout.block";

describe("CalloutBlockComponent emoji picker", () => {
  it("uses the CSES picker and persists the selected native emoji", () => {
    const selection$ = new Subject<any>();
    const componentRef = {
      instance: { csEmojiSelect: selection$ },
      setInput: jasmine.createSpy("setInput"),
    };
    const createConnectedOverlay = jasmine
      .createSpy("createConnectedOverlay")
      .and.returnValue({ componentRef });
    const updateProps = jasmine.createSpy("updateProps");
    const block = Object.create(CalloutBlockComponent.prototype) as CalloutBlockComponent;
    Object.assign(block as any, {
      doc: {
        isReadonly: false,
        readonlyManager: { isReadonly: () => false },
        overlayService: { createConnectedOverlay },
      },
      _closePicker$: new Subject<void>(),
      updateProps,
    });
    const target = document.createElement("span");
    const event = {
      currentTarget: target,
      preventDefault: jasmine.createSpy("preventDefault"),
      stopPropagation: jasmine.createSpy("stopPropagation"),
    } as unknown as Event;

    block.onPickEmoji(event);

    expect(createConnectedOverlay.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        component: CsEmojiPickerComponent,
        target,
        backdrop: true,
      }),
    );
    expect(componentRef.setInput).toHaveBeenCalledWith("csShowSearch", true);

    selection$.next({ emoji: { native: "🚀" } });

    expect(updateProps).toHaveBeenCalledOnceWith({ prefix: "🚀" });
    selection$.next({ emoji: { native: "✅" } });
    expect(updateProps).toHaveBeenCalledTimes(1);
  });
});
