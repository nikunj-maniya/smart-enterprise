// Manual jsdom bootstrap for node:test — there's no Jest/Vitest "environment" here to do this
// automatically, so component tests need a DOM installed as globals before they render anything.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

const globalTarget = globalThis as unknown as Record<string, unknown>;
const props = Object.getOwnPropertyNames(dom.window).filter((prop) => !(prop in globalTarget));
for (const prop of props) {
  globalTarget[prop] = (dom.window as unknown as Record<string, unknown>)[prop];
}

globalTarget.window = dom.window;
globalTarget.document = dom.window.document;
// Node's own built-in `navigator` global is a getter-only accessor, so a plain assignment throws
// (Node 21+) — defineProperty can still override it since that accessor is itself configurable.
Object.defineProperty(globalTarget, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
// React 18's act() environment check — without this, @testing-library/react warns on every render.
globalTarget.IS_REACT_ACT_ENVIRONMENT = true;
