import {CONTRACT, SCHEMA, DEFAULT_STATE} from './catalog.js';
export const VIEW_IDS = CONTRACT.view_order, PART_IDS = CONTRACT.part_order, PRESETS = CONTRACT.presets;
export const DEFAULT_JSON = JSON.stringify(DEFAULT_STATE);
export const MAX_BYTES = 64 * 1024;
export const PART_PROMPT_MAX_LENGTH = 1000;
export function validateSize(value, path, max = 16384) {
  if (!Number.isSafeInteger(value) || value < 256 || value > Math.min(max,16384) || value % 16) fail('E_SIZE_RANGE',path);
  return value;
}
export function validatePartPrompt(value) {
  if (typeof value !== 'string' || value.length > 1000 || !value.isWellFormed()) fail('E_TEXT_LIMIT');
  return value;
}
function validate(value, schema, path) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('E_TYPE',path);
    if (Object.keys(value).some(k => !Object.hasOwn(schema.properties,k)) || (schema.required ?? []).some(k => !Object.hasOwn(value,k))) fail('E_KEYS',path);
    for (const [key,item] of Object.entries(value)) validate(item,schema.properties[key],`${path}.${key}`);
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) fail('E_VIEWS_EMPTY',path);
    if (new Set(value).size !== value.length) fail('E_VIEWS_DUPLICATE',path);
    value.forEach(item => validate(item,schema.items,path));
  }
  if (schema.type === 'string' && (typeof value !== 'string' || !value.isWellFormed() || value.length > (schema.maxLength ?? Infinity))) fail('E_TEXT_LIMIT',path);
  if (schema.type === 'integer' && (!Number.isSafeInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity) || (schema.multipleOf && value % schema.multipleOf))) fail('E_TYPE',path);
  if (Object.hasOwn(schema,'const') && value !== schema.const) fail('E_SCHEMA',path);
  if (schema.enum && !schema.enum.includes(value)) fail('E_ENUM',path);
}
export function normalizeState(s,max=16384) {
  validate(s,SCHEMA,'state');
  for (const key of ['body_height','manual_width','manual_height']) validateSize(s.size[key],key,max);
  const ordered = Object.fromEntries(Object.keys(DEFAULT_STATE).map(k => [k,s[k]]));
  ordered.views = VIEW_IDS.filter(v => s.views.includes(v));
  ordered.character = {identity:s.character.identity,outfit:s.character.outfit};
  ordered.part_prompts = Object.fromEntries(PART_IDS.filter(k => s.part_prompts[k]?.trim()).map(k => [k,s.part_prompts[k]]));
  ordered.appearance = Object.fromEntries(Object.keys(DEFAULT_STATE.appearance).map(k => [k,s.appearance[k]]));
  ordered.size = Object.fromEntries(Object.keys(DEFAULT_STATE.size).map(k => [k,s.size[k]]));
  return ordered;
}
export const parseState = (raw,max) => normalizeState(parseJSONStrict(raw),max);
export const serializeState = (state,max) => JSON.stringify(normalizeState(state,max));
export function validatePreview(data,state) {
  if (!data || data.compiler_revision !== CONTRACT.contract_version || typeof data.input_hash !== 'string' || data.input_hash.length !== 64 || !data.layout_plan || data.layout_plan.panels?.length !== state.views.length) fail('preview');
  for (const key of ['width','height']) validateSize(data[key],key);
  if (JSON.stringify(data.canonical_state) !== serializeState(state)) fail('preview');
  for (let i=0;i<state.views.length;i++) {
    const p=data.layout_plan.panels[i], b=p.bbox_px;
    if (p.id !== state.views[i] || !Array.isArray(b) || b.length !== 4 || b.some(x => !Number.isSafeInteger(x)) || b[0]<0 || b[1]<0 || b[2]>data.width || b[3]>data.height || b[2]<=b[0] || b[3]<=b[1]) fail('preview');
  }
  return data;
}
export class StateError extends Error {
  constructor(code, detail = '') { super(detail ? `${code}: ${detail}` : code); this.code = code; this.detail = detail; }
}
const fail = (code, detail) => { throw new StateError(code, detail); };

// JSON.parse silently discards duplicate object keys. This small strict reader does not.
export function parseJSONStrict(raw) {
  if (typeof raw !== 'string') fail('string');
  if (new TextEncoder().encode(raw).length > MAX_BYTES) fail('oversize');
  let cursor = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(raw[cursor] ?? '\0')) cursor++; };
  const string = () => {
    const start = cursor++;
    while (cursor < raw.length) {
      if (raw[cursor] === '\\') { cursor += 2; continue; }
      if (raw[cursor++] === '"') {
        try { return JSON.parse(raw.slice(start, cursor)); } catch { fail('json'); }
      }
    }
    fail('json');
  };
  const value = (depth = 0) => {
    if (depth > 32) fail('json');
    ws();
    const c = raw[cursor];
    if (c === '"') return string();
    if (c === '{') {
      cursor++; ws(); const object = Object.create(null); const keys = new Set();
      if (raw[cursor] === '}') { cursor++; return object; }
      while (cursor < raw.length) {
        ws(); if (raw[cursor] !== '"') fail('json');
        const key = string(); if (keys.has(key)) fail('duplicateKey', key); keys.add(key);
        ws(); if (raw[cursor++] !== ':') fail('json');
        object[key] = value(depth + 1); ws();
        const delimiter = raw[cursor++];
        if (delimiter === '}') return object;
        if (delimiter !== ',') fail('json');
      }
    } else if (c === '[') {
      cursor++; ws(); const array = [];
      if (raw[cursor] === ']') { cursor++; return array; }
      while (cursor < raw.length) {
        array.push(value(depth + 1)); ws();
        const delimiter = raw[cursor++];
        if (delimiter === ']') return array;
        if (delimiter !== ',') fail('json');
      }
    } else {
      const rest = raw.slice(cursor);
      for (const [token, result] of [['true', true], ['false', false], ['null', null]]) {
        if (rest.startsWith(token)) { cursor += token.length; return result; }
      }
      const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
      if (number) { if (/[.eE]/.test(number[0])) fail('integer'); cursor += number[0].length; const result = Number(number[0]); if (!Number.isFinite(result)) fail('json'); return result; }
    }
    fail('json');
  };
  const parsed = value(); ws(); if (cursor !== raw.length) fail('json'); return parsed;
}

export function getLocale(app) {
  let value;
  try {
    const getter = app?.extensionManager?.setting?.get;
    value = typeof getter === 'function' ? getter.call(app.extensionManager.setting, 'Comfy.Locale') : app?.ui?.settings?.getSettingValue?.('Comfy.Locale');
  } catch { return 'en'; }
  return typeof value === 'string' && value.toLowerCase().split(/[-_]/)[0] === 'ja' ? 'ja' : 'en';
}
export function subscribeLocale(app, callback) {
  const source = app?.ui?.settings;
  if (typeof source?.addEventListener !== 'function' || typeof source?.removeEventListener !== 'function') return () => {};
  const handler = () => callback(getLocale(app));
  source.addEventListener('Comfy.Locale.change', handler);
  return () => source.removeEventListener('Comfy.Locale.change', handler);
}

/** One persistent value, with separate advisory preview and request identity. */
export class DesignerController {
  constructor({raw, requestPreview, transaction = fn => fn(), onChange = () => {}, onCommit = () => {}, timeoutMs = 15000, readRaw = null, writeRaw = null, adapter = null}) {
    this.adapter = adapter; this.viewIds = adapter?.viewIds ?? VIEW_IDS; this.presets = adapter?.presets ?? PRESETS;
    this.parseState = adapter?.parse ?? parseState; this.serializeState = adapter?.serialize ?? serializeState;
    this.readRaw = readRaw; this.writeRaw = writeRaw; this._raw = raw; this.observedRaw = raw; this.state = null; this.error = null; this.preview = null; this.previewRaw = null;
    this.pending = false; this.previewError = null; this.maxResolution = 16384;
    this.generation = 0; this.requestNumber = 0; this.disposed = false;
    this.requestPreview = requestPreview; this.transaction = transaction; this.onChange = onChange; this.onCommit = onCommit; this.timeoutMs = timeoutMs;
    this.restore(raw, false);
  }
  // Embedded integrations can retain their official widget as the sole value owner.
  // The controller caches parsed/preview state only; raw always reads that source.
  get raw() { return this.readRaw ? this.readRaw() : this._raw; }
  set raw(value) { if (this.writeRaw) this.writeRaw(value); else this._raw = value; }
  syncFromSource() {
    if (!this.disposed && this.raw !== this.observedRaw) { this.restore(this.raw); return true; }
    return false;
  }
  get isCurrentPreview() { return !this.pending && !this.previewError && this.preview !== null && this.previewRaw === this.raw; }
  emit(reason) { if (!this.disposed) this.onChange(this, reason); }
  invalidate() { this.generation++; this.requestNumber++; this.abort?.abort(); this.abort = null; clearTimeout(this.timer); this.pending = false; }
  restore(raw, notify = true) {
    if (this.disposed) return;
    this.invalidate(); this.observedRaw = raw; if (this.raw !== raw) this.raw = raw; this.previewRaw = null; this.previewError = null;
    try { this.state = this.parseState(raw, this.maxResolution); this.error = null; }
    catch (error) { this.state = null; this.error = error; }
    if (notify) this.emit('restore');
    if (this.state) void this.refreshPreview();
  }
  commit(next) {
    if (this.disposed) return false;
    this.syncFromSource();
    const raw = this.serializeState(next, this.maxResolution);
    if (raw === this.raw) return false;
    const previous = this.raw;
    this.transaction(() => {
      this.invalidate(); this.observedRaw = raw; this.raw = raw; this.state = this.parseState(raw, this.maxResolution); this.error = null; this.previewError = null; this.previewRaw = null;
      this.onCommit(raw, previous);
    });
    this.emit('commit'); void this.refreshPreview(); return true;
  }
  change(mutator) {
    this.syncFromSource();
    if (!this.state || this.disposed) return false;
    const next = structuredClone(this.state);
    mutator(next); return this.commit(next);
  }
  toggle(view) {
    this.syncFromSource();
    if (!this.viewIds.includes(view)) fail('views');
    if (this.state?.views.length === 1 && this.state.views[0] === view) fail('lastView');
    return this.change(next => { next.views = next.views.includes(view) ? next.views.filter(id => id !== view) : [...next.views, view]; });
  }
  preset(name) {
    if (!this.presets[name]) fail('views');
    return this.change(next => { next.views = [...this.presets[name]]; });
  }
  setMode(mode) {
    this.syncFromSource();
    if (mode === this.state?.size.mode) return false;
    if (mode === 'manual') {
      
      return this.change(next => { next.size.mode = 'manual'; });
    }
    if (mode !== 'auto') fail('mode');
    return this.change(next => { next.size.mode = 'auto'; });
  }
  setSize(field, text) {
    if (!['body_height', 'manual_width', 'manual_height'].includes(field)) fail('keys', field);
    if (typeof text !== 'string' || !/^\d+$/.test(text.trim())) fail('size', field);
    const value = validateSize(Number(text.trim()), field, this.maxResolution);
    return this.change(next => { next.size[field] = value; });
  }
  setPartPrompt(part, text) {
    this.syncFromSource();
    if (!PART_IDS.includes(part)) fail('parts');
    validatePartPrompt(text);
    if (!this.state || this.disposed) return false;
    if (text === this.state.part_prompts?.[part]) return false;
    // Opening an empty editor is not a schema migration or an Undo entry.
    if (!text.trim() && !this.state.part_prompts?.[part]) return false;
    const next = structuredClone(this.state);
    if (text.trim()) next.part_prompts[part] = text;
    else delete next.part_prompts[part];
    return this.commit(next);
  }
  setChoice(field,value) {
    return this.change(next => { next.appearance[field]=value; });
  }
  applyRaw(raw) { return this.commit(this.parseState(raw, this.maxResolution)); }
  async refreshPreview() {
    if (this.syncFromSource()) return;
    if (this.disposed || !this.state) return;
    this.abort?.abort(); clearTimeout(this.timer);
    const abort = new AbortController(); this.abort = abort;
    const generation = this.generation, request = ++this.requestNumber, raw = this.raw, state = this.state;
    const current = () => !this.disposed && this.generation === generation && this.requestNumber === request && this.raw === raw;
    this.pending = true; this.previewError = null; this.emit('pending');
    try {
      const timeout = new Promise((_, reject) => { this.timer = setTimeout(() => { abort.abort(); reject(new StateError('timeout')); }, this.timeoutMs); });
      await new Promise(resolve => setTimeout(resolve, 250));
      if (!current()) return;
      const result = await Promise.race([this.requestPreview(raw, abort.signal), timeout]);
      if (!current()) return;
      this.preview = validatePreview(result, state); this.previewRaw = raw;
      if (Number.isSafeInteger(result.max_resolution) && result.max_resolution >= 32) this.maxResolution = result.max_resolution;
      this.pending = false; this.previewError = null; this.emit('preview');
    } catch (error) {
      if (!current()) return;
      this.pending = false; this.previewError = error; this.emit('preview-error');
    } finally { if (current()) { clearTimeout(this.timer); this.abort = null; } }
  }
  dispose() { this.invalidate(); this.disposed = true; this.onChange = () => {}; this.onCommit = () => {}; this.requestPreview = null; this.preview = null; this.state = null; }
}

