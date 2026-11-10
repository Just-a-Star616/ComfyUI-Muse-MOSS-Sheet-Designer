from .catalog import CONTRACT as C, REVISION, PARTS
from .state import compact, nonblank, parse_state, state_hash
from .layout import compute_layout

def composition_caption(layout, concise=False):
    panels = layout['panels']
    if concise and all(p['kind']=='portrait' for p in panels):
        numbers = ('zero','one','two','three','four','five','six')
        columns = len({p['bbox_px'][0] for p in panels})
        rows = len({p['bbox_px'][1] for p in panels})
        return f'{numbers[len(panels)].capitalize()} close-up headshots in {numbers[columns]} columns and {numbers[rows]} rows, with matching head sizes.'
    if not concise and len({p['kind'] for p in panels}) == 1:
        return ''
    rows = []
    for row_index, kinds in enumerate(layout['rows']):
        groups = []
        for kind in kinds:
            group = sorted((p for p in panels if p['kind'] == kind), key=lambda p: (p['bbox_px'][1], p['bbox_px'][0]))
            names = ', '.join(C['views'][p['id']]['name'] for p in group)
            columns = len({p['bbox_px'][0] for p in group})
            row_count = len({p['bbox_px'][1] for p in group})
            if concise:
                name = C['compact_group_names'][kind]
                shape = f' in {columns} columns and {row_count} rows' if columns > 1 and row_count > 1 else ''
                if kind == 'detail':
                    groups.append(names + (' from top to bottom' if row_count > 1 else ''))
                else:
                    groups.append(f'{len(group)} {name}{shape}')
            elif len(group) == 1:
                groups.append(names)
            else:
                order = f'{columns} columns by {row_count} rows, read left to right then top to bottom' if columns > 1 and row_count > 1 else 'top to bottom' if row_count > 1 else 'left to right'
                description = order if kind == 'portrait' and len(group) >= 3 else f'{order}: {names}'
                groups.append(f"{len(group)} {C['group_names'][kind]} ({description})")
        prefix = f'Sheet row {row_index + 1}, from left to right: ' if len(layout['rows']) > 1 else 'From left to right: '
        rows.append(prefix + '; '.join(groups) + '.')
    return ' '.join(rows)

def render_prompt(draft, layout, form):
    """Serialize the same panel descriptions for native JSON and caption output."""
    w,h = draft['width'],draft['height']
    if form == 'layout_json':
        return compact(dict(summary=draft['summary'],items=[dict(label=i['label'],caption=i['caption'],bbox=[i['bbox'][1]-h//2,i['bbox'][0]-w//2,i['bbox'][3]-h//2,i['bbox'][2]-w//2]) for i in draft['items']],bbox_coord_space='abs_centralized',bbox_format='yxyx'))
    captions = []
    for panel, item in zip(layout['panels'], draft['items']):
        caption = item['caption']
        if len(draft['items']) > 1:
            x0,y0,x1,y1 = item['bbox']
            horizontal = 'left' if 3*(x0+x1)<2*w else 'right' if 3*(x0+x1)>=4*w else 'center'
            vertical = 'upper' if 3*(y0+y1)<2*h else 'lower' if 3*(y0+y1)>=4*h else 'middle'
            caption = f"The {C['views'][panel['id']]['name']} is in the {vertical} {horizontal} region. {caption}"
        captions.append(caption)
    return '\n\n'.join([draft['summary']['caption']]+captions)

def compile_state(state, layout):
    views, parts, appearance = state['views'], state['part_prompts'], state['appearance']
    summary = C['summary']
    garment_views = [v for v in views if v.startswith('clothing_')]
    clothing_only = len(garment_views) == len(views)
    concise = bool(garment_views) or sum(v.startswith('face_') for v in views) >= 3
    # Rebuild the troublesome layouts from short descriptions. The original
    # templates remain only for the already working single/three/five/seven sets.
    intro = C['compact_summary']['garment' if clothing_only else 'sheet'] if concise else summary['multi_intro' if len(views)>1 else 'single_intro']
    background = state['background'].replace('_',' ') if concise and all(v.startswith('face_') for v in views) else C['backgrounds'][state['background']]
    sentences = [intro.format(count=len(views),background=background)]
    composition = composition_caption(layout, concise)
    if composition:
        sentences.append(composition)
    sentences.append(('Design reference: ' if concise else summary['identity_prefix'])+state['character']['identity'])
    if nonblank(state['character']['outfit']):
        sentences.append(summary['outfit_prefix']+state['character']['outfit'])
    if C['styles'][state['style']]:
        sentences.append(C['styles'][state['style']])
    if parts.get('other'):
        sentences.append(summary['other_prefix']+parts['other'])
    if not concise:
        if len(views)>1:
            sentences.append(summary['consistency'])
        if sum(v.startswith('body_') for v in views)>=2:
            sentences.append(summary['body_alignment'])
        sentences.extend([summary['appearance_scope'],summary['blank_sheet']])
    shared = ' '.join(sentences)
    w,h = layout['canvas']
    items = []
    for panel in layout['panels']:
        v = panel['id']
        definition = C['views'][v]
        label = definition['label']
        caption = C['compact_views'][v] if concise else C['view_prefix_'+label]+definition['caption']
        sections = [caption]
        for part in PARTS:
            if part in parts and v in C['part_visibility'][part]:
                prefix = 'Lower-garment details: ' if panel['kind']=='clothing' and part=='lower_body' else C['part_prefixes'][part]
                sections.append(prefix+parts[part])
        for setting in C['setting_order']:
            choice = appearance[setting]
            if choice != 'auto' and v in C['setting_visibility'][setting]:
                sections.append(C['setting_captions'][setting][choice])
        if len(sections)>1 and not concise:
            sections.append(C['local_suffix'])
        caption = ' '.join(sections)
        x0,y0,x1,y1 = panel['bbox_px']
        items.append(dict(label=label,caption=caption,bbox=[x0,y0,x1,y1]))
    form = state['prompt_format']
    if form=='auto':
        form='caption' if len(views)==1 else 'layout_json'
    draft=dict(width=w,height=h,bbox_coord_space='abs',bbox_format='xyxy',summary=dict(canvas='multi_panel' if len(views)>1 else 'single',caption=shared),items=items)
    prompt = render_prompt(draft,layout,form)
    return dict(prompt=prompt,negative_prompt=state['negative_prompt'],resolved_format=form,layout_draft=draft)

def preview(raw, runtime_max_resolution=16384):
    state = parse_state(raw,runtime_max_resolution)
    layout = compute_layout(state,runtime_max_resolution)
    w,h = layout['canvas']
    ready = nonblank(state['character']['identity'])
    compiled = compile_state(state,layout) if ready else dict(prompt=None,negative_prompt=state['negative_prompt'],resolved_format=('caption' if len(state['views'])==1 else 'layout_json') if state['prompt_format']=='auto' else state['prompt_format'])
    warnings=[]
    for condition,code in [(layout['density_score']<1,'dense_layout'),(len(state['views'])>=8,'many_views'),(state['size']['mode']=='manual' and w*h>4000000,'high_resolution'),(state['size']['mode']=='manual' and not .45<=w/h<=2.5,'extreme_aspect_ratio')]:
        if condition:
            warnings.append(dict(code=code,path='size',details=''))
    return dict(schema_version=1,compiler_revision=REVISION,input_hash=state_hash(state),canonical_state=state,ready=ready,width=w,height=h,layout_plan=layout,**compiled,warnings=warnings,blocking_errors=[] if ready else [dict(code='E_IDENTITY_EMPTY',path='character.identity',details='')],token_status='not_measured')
