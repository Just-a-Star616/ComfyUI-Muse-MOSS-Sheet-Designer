import {getLocale, subscribeLocale} from './controller.js';
import {createDesignerUI, translations} from './ui.js';
import {DesignerController} from './controller.js';
const instances = new WeakMap();
const textareaRecovery = new WeakMap();
const pendingReinstall = new WeakMap();
export const NODE_TYPE = 'MuseMossSheetDesigner';

export function previewRequester(api) {
  return async (raw, signal) => {
    const response = await api.fetchApi('/muse_moss_sheet/v1/preview', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state_json:raw}),signal});
    const data = await response.json();
    if (!response.ok) { const error=new Error(data.error?.code || `HTTP ${response.status}`);error.serverCode=data.error?.code;throw error; }
    return data;
  };
}
export function graphTransaction(node, change, canvas) {
  const graph = node.graph;
  const graphEvents = typeof graph?.beforeChange === 'function' && typeof graph?.afterChange === 'function';
  const canvasEvents = typeof canvas?.emitBeforeChange === 'function' && typeof canvas?.emitAfterChange === 'function';
  // Current Frontend history listens to canvas events, not graph callbacks.
  // Match native canvas operations, retaining legacy graph notifications and
  // balancing both pairs even when a commit fails. Nested pairs capture once.
  if (canvasEvents) canvas.emitBeforeChange();
  try {
    if (graphEvents) {
      graph.beforeChange(node);
      try { change(); } finally { graph.afterChange(node); }
    } else change();
  } finally { if (canvasEvents) canvas.emitAfterChange(); }
  node.setDirtyCanvas?.(true, true);
}
/** Chain without altering prior return values; restore only our own outer hook. */
function designerHeight(root) {
  const style = getComputedStyle(root), shown = [...root.children].filter(c => c.getClientRects().length);
  let height = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + (parseFloat(style.rowGap) || 0) * Math.max(0, shown.length - 1);
  for (const child of shown) height += child.getAttribute('role') === 'tabpanel' ? 260 : child.offsetHeight;
  return Math.max(400, Math.ceil(height));
}

function chain(node, name, after) {
  const prior = node[name];
  const wrapped = function (...args) { const result = prior?.apply(this, args); after.apply(this, args); return result; };
  node[name] = wrapped;
  return () => { if (node[name] === wrapped) { if (prior === undefined) delete node[name]; else node[name] = prior; } };
}
function fallback(node, original, app, reason) {
  const message = translations[getLocale(app)].fallback;
  if (original) { original.options ??= {}; original.options.tooltip = message; original.options.dynamicPrompts = false; }
  node.mossDesignerCompatibility = {graphical: false, reason, message};
  console.warn(`[MOSS-Image Character Sheet Designer] ${message}`, reason);
  app?.extensionManager?.toast?.add?.({severity: 'warn', summary: 'MOSS-Image Character Sheet Designer', detail: message, life: 12000});
  return null;
}
function removeVisualWidget(node, widget) {
  if (!node.widgets?.includes(widget)) { widget.onRemove?.(); return; }
  // Only our nonserialized UI is removed. Never retire the canonical STRING.
  if (typeof node.removeWidget === 'function') node.removeWidget(widget);
  else { widget.onRemove?.(); node.widgets.splice(node.widgets.indexOf(widget), 1); }
  widget.element?.remove?.();
}
// Deletion can be followed by re-addition of the same node object. Keep a tiny
// one-shot hook, rather than retaining a disposed controller or active observer.
function recoverReaddedTextarea(node) {
  const original = node.widgets?.find(widget => widget.name === 'state_json');
  const element = original?.element ?? original?.inputEl;
  if (element?.tagName !== 'TEXTAREA') return;
  // Frontend aborts the original textarea's listeners when a node is deleted.
  // Re-adding the same object does not recreate those listeners. Recover only
  // input propagation, without double-calling a surviving official listener.
  let recovery = textareaRecovery.get(node);
  if (!recovery) {
    recovery = {abort: null}; textareaRecovery.set(node, recovery);
    // A single persistent cleanup hook reads the current controller. Creating
    // a fresh hook each re-add would retain already-aborted hooks in core chains.
    chain(node, 'onRemoved', () => { recovery.abort?.abort(); recovery.abort = null; });
  }
  recovery.abort?.abort(); recovery.abort = new AbortController();
  element.addEventListener('input', () => {
    if (original.value !== element.value) original.value = element.value;
  }, {signal: recovery.abort.signal});
}
function armReinstall(node, app, api) {
  if (pendingReinstall.has(node)) return;
  const unchain = chain(node, 'onAdded', () => {
    unchain(); pendingReinstall.delete(node);
    recoverReaddedTextarea(node); installDesigner(node, app, api);
  });
  pendingReinstall.set(node, unchain);
}
export function installDesigner(node, app, api) {
  if (instances.has(node)) return instances.get(node);
  pendingReinstall.get(node)?.(); pendingReinstall.delete(node);
  const original = node.widgets?.find(widget => widget.name === 'state_json');
  if (!original || typeof node.addDOMWidget !== 'function' || typeof document === 'undefined') return fallback(node, original, app, 'DOM widget API unavailable');
  const originalIndex = node.widgets.indexOf(original);
  const existingWidgets = new Set(node.widgets);
  const hookNames = ['onAdded', 'onRemoved', 'onResize', 'onConfigure', 'serialize', 'onExecuted'];
  const previousHooks = Object.fromEntries(hookNames.map(name => [name, node[name]]));
  const restoreHooks = expected => {
    for (const name of hookNames) if (!expected || node[name] === expected[name]) {
      if (previousHooks[name] === undefined) delete node[name]; else node[name] = previousHooks[name];
    }
  };
  const element = original.element ?? original.inputEl;
  // options.hidden is the public extension-hiding flag on current Frontend;
  // widget.hidden can also include connection suppression, which we must not own.
  const previousHidden = original.options?.hidden ?? original.hidden;
  const previousElementHidden = element?.hidden;
  const previousSetValue = original.options?.setValue;
  const previousCallback = original.callback;
  let ui, widget, record, installedHooks, observer, frame, ready = false;
  let unsubscribe = () => {}, restoreValueHook = () => {};
  const Controller = DesignerController;
  const controller = new Controller({
    raw: original.value, readRaw: () => original.value, writeRaw: value => { original.value = value; },
    requestPreview: previewRequester(api),
    transaction: change => graphTransaction(node, change, app?.canvas),
    onCommit: (next, previous) => { node.onWidgetChanged?.('state_json', next, previous, original); },
    onChange: (_, reason) => ui?.render(reason),
  });
  const sync = () => {
    if (!ready || record?.disposed) return;
    controller.syncFromSource();
    const connected = node.inputs?.some(input => input.name === 'state_json' && input.link != null) ?? false;
    ui?.setExternal(connected);
  };
  try {
    ui = createDesignerUI({controller, locale: getLocale(app)});
    let name = 'moss_sheet_ui', suffix = 1;
    while (node.widgets.some(candidate => candidate.name === name)) name = `moss_sheet_ui_${suffix++}`;
    widget = node.addDOMWidget(name, 'MOSS_SHEET_UI', ui.root, {
      getValue: () => original.value,
      // addDOMWidget may restore positional data before it returns. That data
      // belongs to canonical widgets, never to this presentation-only widget.
      setValue: value => { if (ready && !record?.disposed) controller.restore(value); },
      // Size to the content so the designer never scrolls; the tab panel (layout preview) gets a fixed 260px.
      getMinHeight: () => designerHeight(ui.root), getHeight: () => designerHeight(ui.root),
      // The properties sidebar can leave its preview width on this widget.
      // Use the public node-width default for the V1.1 canvas presentation.
      onDraw: drawn => { drawn.width = undefined; },
      hideOnZoom: false, serialize: false, dynamicPrompts: false,
    });
    if (!widget || !node.widgets.includes(widget)) throw new Error('addDOMWidget did not return an installed widget');
    widget.options ??= {}; widget.options.serialize = false; widget.serialize = false;
    original.options ??= {}; original.options.dynamicPrompts = false;
    // Preserve official setter/callback semantics, including their receivers,
    // return values and store updates. Never redefine original.value.
    if (typeof previousSetValue === 'function') {
      const setValue = function (...args) { const result = previousSetValue.apply(this, args); sync(); return result; };
      original.options.setValue = setValue;
      restoreValueHook = () => { if (original.options.setValue === setValue) original.options.setValue = previousSetValue; };
    } else {
      const callback = function (...args) { const result = previousCallback?.apply(this, args); sync(); return result; };
      original.callback = callback;
      restoreValueHook = () => { if (original.callback === callback) { if (previousCallback === undefined) delete original.callback; else original.callback = previousCallback; } };
    }
    original.hidden = true;
    if (element) element.hidden = true;
    const unhide = () => { original.hidden = previousHidden; if (element) element.hidden = previousElementHidden; };
    unsubscribe = subscribeLocale(app, value => { sync(); ui.setLocale(value); });
    record = {controller, ui, widget, original, originalIndex, sync, dispose({reinstall = true} = {}) {
      if (record.disposed) return; record.disposed = true; ready = false;
      if (frame !== undefined) window.cancelAnimationFrame?.(frame);
      if (observer !== undefined) clearInterval(observer);
      unsubscribe(); restoreValueHook(); unhide(); controller.dispose(); ui.dispose();
      removeVisualWidget(node, widget); restoreHooks(installedHooks); instances.delete(node);
      if (reinstall) armReinstall(node, app, api);
    }, afterConfigure() { if (!record.disposed) {
      controller.restore(original.value);
    } }};
    instances.set(node, record);
    chain(node, 'onConfigure', () => record.afterConfigure());
    const previousSerialize = node.serialize;
    if (typeof previousSerialize === 'function') node.serialize = function (...args) { ui.flushDrafts(); return previousSerialize.apply(this, args); };
    chain(node, 'onRemoved', () => record.dispose());
    chain(node, 'onExecuted', message => ui.setTokenStatus(message?.moss_sheet_status?.[0]));
    // If a later extension wrapped our hooks, a disposed UI may still occur in
    // its chain. Ensure it cannot remain registered when that node is re-added.
    chain(node, 'onAdded', () => { if (record.disposed) widget.onRemove?.(); else sync(); });
    installedHooks = Object.fromEntries(hookNames.map(name => [name, node[name]]));
    node.mossDesignerCompatibility = {graphical: true, undoTransactions: typeof node.graph?.beforeChange === 'function' && typeof node.graph?.afterChange === 'function'};
    const nodeSize = [870, 790];
    node.properties ??= {};
    if (!node.properties.moss_sheet_initialized && typeof node.setSize === 'function') node.setSize([Math.max(nodeSize[0], node.size?.[0] || 0), Math.max(nodeSize[1], node.size?.[1] || 0)]);
    node.properties.moss_sheet_initialized = true;
    ready = true;
    // Direct store edits do not call widget callbacks. Read only the public
    // canonical value, at most once per frame (timer fallback in nonvisual hosts).
    // There is no extension import/dependency on Frontend's private stores.
    if (typeof window.requestAnimationFrame === 'function') {
      const observe = () => { if (record.disposed) return; sync(); frame = window.requestAnimationFrame(observe); };
      frame = window.requestAnimationFrame(observe);
    } else { observer = setInterval(sync, 100); observer.unref?.(); }
    ui.render();
    return record;
  } catch (error) {
    ready = false;
    if (frame !== undefined) window.cancelAnimationFrame?.(frame);
    if (observer !== undefined) clearInterval(observer);
    unsubscribe(); restoreValueHook(); controller.dispose(); ui?.dispose(); instances.delete(node);
    original.hidden = previousHidden;
   
    if (element) element.hidden = previousElementHidden;
    // addDOMWidget may append/register a widget and then throw before returning.
    for (const added of [...node.widgets]) if (!existingWidgets.has(added)) {
      try { removeVisualWidget(node, added); } catch { /* Keep rollback best-effort. */ }
    }
    restoreHooks();
    return fallback(node, original, app, error.message);
  }
}
export function getDesigner(node) { return instances.get(node); }
export function createExtension(app, api) {
  return {
    name: 'muse.MossSheetDesigner',
    nodeCreated(node) { if ([NODE_TYPE].includes(node.comfyClass) || [NODE_TYPE].includes(node.type)) installDesigner(node, app, api); },
    afterConfigureGraph() {
      for (const node of app.graph?._nodes ?? []) getDesigner(node)?.afterConfigure();
    },
  };
}

