import {app} from '../../scripts/app.js';
import {api} from '../../scripts/api.js';
import {CONTRACT} from './catalog.js';

const NODE_TYPE = 'MuseMossSheetDesigner';
const css = 'background:#222;color:#ddd;border:1px solid #444;border-radius:4px;padding:2px 6px;font-size:12px;';

function el(tag, props = {}, children = []) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function setWidget(node, name, value) {
  const w = node.widgets?.find(x => x.name === name);
  if (!w) return;
  w.value = value;
  w.callback?.(value);
  node.setDirtyCanvas?.(true, true);
}

const getWidget = (node, name) => node.widgets?.find(x => x.name === name)?.value;

async function presetsRequest(body) {
  const r = await api.fetchApi('/muse_moss_sheet/presets', body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : undefined);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}

function presetBar(node) {
  const status = el('span', {style: 'font-size:11px;color:#999;'});
  const button = (label, title, onclick) => el('button', {textContent: label, title, onclick, style: css + 'cursor:pointer;'});
  const label = text => el('span', {textContent: text, style: 'width:72px;font-size:11px;color:#bbb;'});
  const lists = [];
  // Character / outfit: type a new name or pick one from the list (datalist combobox).
  const row = (kind, title, fields, withState) => {
    const list = el('datalist', {id: `muse-${kind}-${Math.random().toString(36).slice(2)}`});
    const name = el('input', {placeholder: `${title} name`, style: css + 'flex:1;min-width:0;'});
    name.setAttribute('list', list.id);
    name.onkeydown = e => e.stopPropagation();
    lists.push(data => list.replaceChildren(...Object.keys(data[kind] ?? {}).sort().map(k => el('option', {value: k}))));
    const load = () => {
      const p = presets[kind]?.[name.value];
      if (!p) { status.textContent = `No ${title.toLowerCase()} "${name.value}"`; return; }
      for (const k of fields) setWidget(node, k, p[k] ?? '');
      if (withState && p.state_json) setWidget(node, 'state_json', p.state_json);
      status.textContent = `Loaded ${title.toLowerCase()} "${name.value}"`;
    };
    const save = () => {
      const n = name.value.trim();
      if (!n) return;
      const body = {kind, name: n, ...Object.fromEntries(fields.map(k => [k, getWidget(node, k) ?? '']))};
      if (withState) body.state_json = getWidget(node, 'state_json');
      run(() => presetsRequest(body), `Saved ${title.toLowerCase()} "${n}"`);
    };
    const del = () => { if (name.value) run(() => presetsRequest({kind, name: name.value, delete: true}), `Deleted ${title.toLowerCase()} "${name.value}"`); };
    return el('div', {style: 'display:flex;gap:4px;align-items:center;'}, [label(title), name, list,
      button('Load', `Load ${title.toLowerCase()} preset`, load), button('Save', `Save ${withState ? 'character description, body details, nsfw details and designer settings' : 'outfit'}`, save), button('Delete', '', del)]);
  };
  let presets = {};
  const run = (fn, done) => fn().then(data => { presets = data; lists.forEach(f => f(data)); status.textContent = done; }).catch(e => { status.textContent = String(e.message || e); });
  const character = row('characters', 'Character', ['prompt', 'body_details', 'nsfw_details'], true);
  const outfit = row('outfits', 'Outfit', ['outfit'], false);
  const promptList = el('select', {style: css + 'flex:1;min-width:0;'}, (node.widgets?.find(w => w.name === 'prompt_list')?.options?.values ?? []).map(k => el('option', {value: k, textContent: k})));
  promptList.value = getWidget(node, 'prompt_list') ?? promptList.value;
  const loadList = button('Load', 'Select this list for ▶ Prompt list (your text boxes fill it in)', () => {
    setWidget(node, 'prompt_list', promptList.value);
    status.textContent = `Prompt list: ${promptList.value}`;
  });
  run(() => presetsRequest(), '');
  return el('div', {style: 'display:flex;flex-direction:column;gap:4px;'}, [character, outfit,
    el('div', {style: 'display:flex;gap:4px;align-items:center;'}, [label('Prompt list'), promptList, loadList]), status]);
}

const btn = (label, title, color, onclick, extra = '') => el('button', {textContent: label, title, onclick, style: css + `cursor:pointer;padding:4px 6px;background:${color};border-color:${color};color:#fff;` + extra});

// Describe fills the boxes only; every other button sets view_control.action and queues.
// Runs in per_view only preview the views; nothing is output until Build final sheet.
function generateBar(node, queueAction) {
  const describe = btn('🔍 Describe', 'Fill the text boxes from the reference image(s) with LC Vision, without generating. Uses the ticked describe_* toggles, or all of them if none are ticked.', '#444', () => {
    const toggles = ['describe_character', 'describe_outfit', 'describe_body', 'describe_parts'];
    if (!toggles.some(t => getWidget(node, t))) toggles.forEach(t => setWidget(node, t, true));
    app.queuePrompt(0, 1);
  }, 'flex:1;');
  return el('div', {style: 'display:flex;gap:4px;'}, [
    describe,
    btn('▶ Next view', 'Render the next view that has no current image (confirmed views are kept)', '#2563eb', () => queueAction({type: 'next'}), 'flex:1;'),
    btn('▶▶ All views', 'Render every unconfirmed view whose prompt, seed or edit changed', '#7c3aed', () => queueAction({type: 'all'}), 'flex:1;'),
    btn('▶ Prompt list', 'Queue the selected prompt_list as a dataset', '#444', () => { setWidget(node, 'mode', 'prompt_list'); app.queuePrompt(0, 1); }, 'flex:1;'),
  ]);
}

function viewPanel(node, queueAction) {
  const read = () => { try { return JSON.parse(getWidget(node, 'view_control') || '{}'); } catch { return {}; } };
  const write = c => setWidget(node, 'view_control', JSON.stringify({locked: c.locked ?? [], seeds: c.seeds ?? {}, edits: c.edits ?? {}, edit_seeds: c.edit_seeds ?? {}, prompts: c.prompts ?? {}, action: c.action ?? null}));
  const update = fn => { const c = read(); fn(c); write(c); };
  const stateViews = () => { try { return JSON.parse(getWidget(node, 'state_json')).views ?? []; } catch { return []; } };
  const cards = el('div', {style: 'display:flex;flex-wrap:wrap;gap:4px;'});
  const status = el('span', {style: 'font-size:11px;color:#999;flex:1;'});
  const open = new Set();
  const imageURL = i => api.apiURL(`/view?filename=${encodeURIComponent(i.filename)}&subfolder=${encodeURIComponent(i.subfolder || '')}&type=${i.type || 'temp'}`);

  const card = (v, c, info) => {
    const done = (c.locked ?? []).includes(v), edit = c.edits?.[v] ?? '';
    const preview = info?.image
      ? el('img', {src: imageURL(info.image), style: 'width:100%;height:150px;object-fit:contain;background:#111;border-radius:3px;cursor:zoom-in;', onclick: () => window.open(imageURL(info.image))})
      : el('div', {textContent: 'not rendered', style: 'height:150px;display:flex;align-items:center;justify-content:center;background:#111;color:#666;border-radius:3px;font-size:11px;'});
    const confirm = btn(done ? '✓ Confirmed' : 'Confirm', done ? 'Confirmed: kept on every run. Click to unlock.' : 'Keep this image; later runs skip it', done ? '#15803d' : '#166534',
      () => { update(n => { const s = new Set(n.locked ?? []); s.has(v) ? s.delete(v) : s.add(v); n.locked = [...s]; }); render(); }, 'flex:1;');
    const reroll = btn(info?.image ? '🎲 New seed' : '▶ Render', edit ? 'New seed for this view\'s edit (base image kept)' : 'Render this view with a new seed', '#2563eb', () => {
      update(n => { if (info?.image) { const seed = Math.floor(Math.random() * 2 ** 31); if (n.edits?.[v]) n.edit_seeds = {...n.edit_seeds, [v]: seed}; else n.seeds = {...n.seeds, [v]: seed}; } });
      queueAction({type: 'view', view: v});
    }, 'flex:1;');
    reroll.disabled = done;
    const promptBox = el('textarea', {value: c.prompts?.[v] ?? info?.prompt ?? '', rows: 6, style: css + 'width:100%;box-sizing:border-box;resize:vertical;font-size:10px;'});
    promptBox.onkeydown = e => e.stopPropagation();
    const promptArea = el('div', {style: `display:${open.has(v) ? 'flex' : 'none'};flex-direction:column;gap:2px;`}, [
      promptBox,
      el('div', {style: 'display:flex;gap:2px;'}, [
        btn('Apply prompt', 'Re-render this view with this prompt (same seed)', '#444', () => { update(n => { n.prompts = {...n.prompts, [v]: promptBox.value.trim()}; if (!n.prompts[v]) delete n.prompts[v]; }); queueAction({type: 'view', view: v}); }, 'flex:1;'),
        ...(c.prompts?.[v] ? [btn('Reset', 'Back to the designer prompt', '#444', () => { update(n => { delete n.prompts[v]; }); queueAction({type: 'view', view: v}); })] : []),
      ]),
    ]);
    const toggle = el('button', {textContent: (open.has(v) ? 'Hide' : 'Show') + ' prompt' + (c.prompts?.[v] ? ' (custom)' : ''), style: css + 'cursor:pointer;font-size:10px;', onclick: () => { open.has(v) ? open.delete(v) : open.add(v); render(true); }});
    const editBox = el('input', {value: edit, placeholder: 'e.g. make her smile', disabled: done, style: css + 'width:100%;box-sizing:border-box;'});
    const applyEdit = () => { update(n => { n.edits = {...n.edits, [v]: editBox.value.trim()}; if (!n.edits[v]) delete n.edits[v]; }); queueAction({type: 'view', view: v}); };
    editBox.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') applyEdit(); };
    const apply = btn('✏️ Apply edit', 'Edit this view\'s image before assembly (empty = remove the edit)', '#7c3aed', applyEdit);
    apply.disabled = done;
    const label = (CONTRACT.views[v]?.name ?? v) + (info?.stale ? ' •' : '');
    return el('div', {style: `width:132px;display:flex;flex-direction:column;gap:3px;padding:4px;background:#1a1a1a;border:1px solid ${done ? '#15803d' : '#333'};border-radius:4px;font-size:11px;color:#ccc;`}, [
      el('div', {textContent: label, title: info?.stale ? `${v}: settings changed since this render` : v, style: 'font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'}),
      preview,
      el('div', {textContent: info ? `seed ${info.seed}` + (edit ? ' · edited' : '') : '', style: 'font-size:10px;color:#777;'}),
      el('div', {style: 'display:flex;gap:2px;'}, [confirm, reroll]),
      toggle, promptArea, editBox, apply,
    ]);
  };

  const render = force => {
    // Don't rebuild while a box is being typed in (a clicked button keeps focus, so only text fields count).
    if (!force && ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && root.contains(document.activeElement)) return;
    const c = read(), info = node.properties?.muse_views ?? {};
    cards.replaceChildren(...stateViews().map(v => card(v, c, info[v])));
    const views = stateViews(), done = views.filter(v => (c.locked ?? []).includes(v)).length;
    status.textContent = `${done}/${views.length} confirmed`;
    requestAnimationFrame(() => { const h = node.computeSize?.()[1]; if (h > node.size[1]) node.setSize([node.size[0], h]); });
  };

  const editAll = el('input', {placeholder: 'Edit all unconfirmed views, e.g. make her barefoot', style: css + 'flex:1;min-width:0;'});
  editAll.onkeydown = e => e.stopPropagation();
  const root = el('div', {style: 'display:flex;flex-direction:column;gap:4px;'}, [
    el('div', {style: 'display:flex;gap:4px;align-items:center;'}, [status,
      btn('Confirm all', '', '#166534', () => { update(n => { n.locked = stateViews(); }); render(); }),
      btn('Unconfirm all', '', '#444', () => { update(n => { n.locked = []; }); render(); }),
      btn('Clear edits', 'Remove all edits and custom prompts', '#444', () => { update(n => { n.edits = {}; n.edit_seeds = {}; n.prompts = {}; }); render(); })]),
    cards,
    el('div', {style: 'display:flex;gap:4px;'}, [editAll,
      btn('✏️ Apply edit to all', '', '#7c3aed', () => { const t = editAll.value.trim(); if (!t) return; update(n => { for (const v of stateViews()) if (!(n.locked ?? []).includes(v)) n.edits = {...n.edits, [v]: t}; }); queueAction({type: 'all'}); })]),
    btn('Build final sheet now', 'Assemble the sheet and template from the current views and send them to the outputs. Views without an image are rendered first.', '#c2410c', () => queueAction({type: 'build'}), 'padding:6px;font-weight:bold;'),
  ]);
  // The designer writes state_json without widget callbacks; refresh when the pointer comes back.
  root.onmouseenter = () => render();
  root.addEventListener('pointerdown', e => e.stopPropagation());
  return {root, render, write, read};
}

app.registerExtension({
  name: 'muse.MossSheetControls',
  nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;
    const description = node.widgets?.find(w => w.name === 'prompt');
    if (description) description.label = 'character_description';
    const control = node.widgets?.find(w => w.name === 'view_control');
    if (control) { control.options ??= {}; control.options.hidden = true; control.hidden = true; }
    for (const name of ['prompt', 'outfit', 'body_details', 'nsfw_details']) {
      const w = node.widgets?.find(x => x.name === name);
      if (w) { w.options ??= {}; w.options.getMinHeight = () => 44; w.options.getMaxHeight = () => 90; }
    }
    let panel;
    const queueAction = action => {
      if (getWidget(node, 'mode') === 'prompt_list') setWidget(node, 'mode', 'per_view');
      panel.write({...panel.read(), action});
      // One-shot: clear it once the prompt is queued so a later plain Queue only previews.
      Promise.resolve(app.queuePrompt(0, 1)).finally(() => panel.write({...panel.read(), action: null}));
    };
    panel = viewPanel(node, queueAction);
    node.addDOMWidget('muse_generate', 'MUSE_GENERATE', generateBar(node, queueAction), {serialize: false, getMinHeight: () => 30});
    node.addDOMWidget('muse_presets', 'MUSE_PRESETS', presetBar(node), {serialize: false, getMinHeight: () => 106});
    node.addDOMWidget('muse_views', 'MUSE_VIEWS', panel.root, {serialize: false, getMinHeight: () => panel.root.scrollHeight + 8});
    requestAnimationFrame(() => panel.render());
    // LC Vision answers come back per box: show them in the box (editable) and switch that toggle off.
    const TOGGLES = {prompt: 'describe_character', outfit: 'describe_outfit', body_details: 'describe_body', part_prompts: 'describe_parts'};
    const prior = node.onExecuted;
    node.onExecuted = function (message) {
      const result = prior?.apply(this, arguments);
      if (message?.muse_views) {
        node.properties.muse_views = message.muse_views[0];
        panel.render(true);
      }
      for (const [field, text] of Object.entries(message?.muse_described?.[0] ?? {})) {
        if (field === 'part_prompts') {
          // Parts the model saw get replaced; parts it left empty (hidden in the reference) keep their text.
          let state = {};
          try { state = JSON.parse(getWidget(node, 'state_json')); } catch { /* unreadable state: only the parts get written */ }
          setWidget(node, 'state_json', JSON.stringify({...state, part_prompts: {...state.part_prompts, ...text}}));
        } else setWidget(node, field, text);
        setWidget(node, TOGGLES[field], false);
      }
      return result;
    };
  },
});
