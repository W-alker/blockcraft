// macOS native WebKit regression; runs the real Playground editor in its own WKWebView.
// Start Playground at :8081 and serve this directory separately:
// python3 -m http.server 18096 --bind 127.0.0.1 --directory e2e/native
// xcrun swift e2e/native/embed-webkit-zoom.swift
// This covers WKWebView.pageZoom + document CSS zoom, not the full Tauri app.
import AppKit
import WebKit

let probe = #"""
(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async read => {
    for (let n = 0; n < 100; n++) { const value = read(); if (value) return value; await sleep(100); }
    throw Error('Playground fixture did not become ready');
  };
  const init = await wait(() => Array.from(document.querySelectorAll('button'))
    .find(el => el.getAttribute('aria-label') === '初始化' || el.textContent.includes('初始化')));
  init.click();
  const doc = await wait(() => {
    const component = window.ng?.getComponent(document.querySelector('block-craft-editor'));
    return component?.doc?.isInitialized ? component.doc : null;
  });
  let inner;
  addEventListener('message', event => {
    if (event.origin === 'http://localhost:18096' && event.data.embedProbe) inner = event.data;
  });
  const snapshot = doc.schemas.createSnapshot('embed', ['http://localhost:18096/embed-viewport.html']);
  snapshot.props = {...snapshot.props, wr: 45, ar: 1.5};
  doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
  const card = await wait(() => document.querySelector(`[data-block-id="${snapshot.id}"] embed-frame-card`));
  const frame = card.querySelector('iframe');
  card.scrollIntoView({block: 'center'});
  const nativeZoom = scale => new Promise(resolve => {
    addEventListener('nativezoom', resolve, {once: true});
    webkit.messageHandlers.zoom.postMessage(scale);
  });
  const samples = [];
  let session;
  async function sample(label) {
    inner = undefined;
    frame.contentWindow.postMessage('measure', '*');
    for (let n = 0; n < 20 && !inner; n++) await sleep(100);
    if (!inner) throw Error('No iframe reply: ' + label);
    const rect = frame.getBoundingClientRect(), wrapper = card.querySelector('.iframe-wrapper').getBoundingClientRect();
    samples.push({label, outer: {width: frame.clientWidth, height: frame.clientHeight}, inner});
    if (Math.abs(inner.main.width - inner.width) > 2 || Math.abs(inner.main.height - inner.height) > 2
      || Math.abs(inner.width - frame.clientWidth) > 2 || Math.abs(inner.height - frame.clientHeight) > 2
      || Math.abs(rect.width - wrapper.width) > 1 || Math.abs(rect.height - wrapper.height) > 1) {
      throw Error('Iframe viewport or paint differs from its container: ' + JSON.stringify(samples.at(-1)));
    }
    session ??= inner.session;
    if (inner.session !== session || inner.value !== 'keep state') throw Error('Iframe state was lost: ' + label);
  }
  for (const native of [1, .8, 1.5]) {
    await nativeZoom(native);
    for (const zoom of [1, .75, 1.5]) {
      doc.viewScale.setScale(zoom); await sleep(180);
      card.style.width = '320px'; card.style.height = '300px'; await sleep(180); await sample(`${native}/${zoom} initial`);
      card.style.width = '600px'; card.style.height = '550px'; await sleep(180); await sample(`${native}/${zoom} preview`);
      card.style.height = 'auto'; card.style.aspectRatio = '1.1'; await sleep(180); await sample(`${native}/${zoom} committed geometry`);
    }
  }
  await nativeZoom(1); doc.viewScale.setScale(1); await sleep(180); await sample('reset');
  webkit.messageHandlers.complete.postMessage(JSON.stringify({ok: true, samples}));
})().catch(error => webkit.messageHandlers.complete.postMessage(JSON.stringify({ok: false, error: error.message})));
"""#

final class Reporter: NSObject, WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "zoom", let factor = message.body as? Double {
            view.pageZoom = factor
            view.evaluateJavaScript("dispatchEvent(new Event('nativezoom'))", completionHandler: nil)
            return
        }
        print(message.body)
        fflush(stdout)
        let data = (message.body as? String)?.data(using: .utf8)
        let result = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
        exit(result?["ok"] as? Bool == true ? 0 : 1)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let reporter = Reporter(), config = WKWebViewConfiguration()
if #available(macOS 14, *) { config.preferences.inactiveSchedulingPolicy = .none }
config.userContentController.add(reporter, name: "zoom")
config.userContentController.add(reporter, name: "complete")
config.userContentController.addUserScript(WKUserScript(source: probe, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1400, height: 1100), configuration: config)
let window = NSWindow(contentRect: NSRect(x: 20, y: 20, width: 1400, height: 1100), styleMask: [.borderless], backing: .buffered, defer: false)
window.contentView = view
// Keep rendering active without taking focus or intercepting the user's pointer.
window.alphaValue = 0.02
window.ignoresMouseEvents = true
window.orderBack(nil)
let activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiatedAllowingIdleSystemSleep, .latencyCritical], reason: "Embed zoom regression")
view.load(URLRequest(url: URL(string: CommandLine.arguments.dropFirst().first ?? "http://127.0.0.1:8081/")!))
DispatchQueue.main.asyncAfter(deadline: .now() + 55) { print("Native WebKit embed regression timed out"); exit(1) }
app.run()
