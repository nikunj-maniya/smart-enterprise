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
globalTarget.navigator = dom.window.navigator;
// React 18's act() environment check — without this, @testing-library/react warns on every render.
globalTarget.IS_REACT_ACT_ENVIRONMENT = true;
