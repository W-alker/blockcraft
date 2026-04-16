import {MarkdownStreamSession} from "./stream-session";

describe("MarkdownStreamSession", () => {
  it("appends chunks to the current markdown buffer", () => {
    const session = new MarkdownStreamSession();

    session.append("# Hel");
    session.append("lo");

    expect(session.getText()).toBe("# Hello");
    expect(session.getVersion()).toBe(2);
    expect(session.isFinalized()).toBeFalse();
  });

  it("replaces the full markdown buffer and tracks a new version", () => {
    const session = new MarkdownStreamSession();

    session.append("# Hel");
    session.replace("# Hello\n\nworld");

    expect(session.getText()).toBe("# Hello\n\nworld");
    expect(session.getVersion()).toBe(2);
    expect(session.isFinalized()).toBeFalse();
  });

  it("marks the session finalized when finish is called", () => {
    const session = new MarkdownStreamSession();

    session.append("hello");
    session.finish();

    expect(session.isFinalized()).toBeTrue();
  });
});

