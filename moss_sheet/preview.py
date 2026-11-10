import json
import logging
import os
import folder_paths
from aiohttp import web
from nodes import MAX_RESOLUTION
from server import PromptServer
from .compiler import preview
from .state import strict_load, StateError, fail, parse_state, compact

async def preview_request(request):
    try:
        body=bytearray()
        async for chunk in request.content.iter_chunked(16384):
            body.extend(chunk)
            if len(body)>262144:
                return web.json_response({'error':{'code':'E_STATE_SIZE','path':'request'}},status=413)
        try:
            data=strict_load(body.decode('utf-8'))
        except UnicodeDecodeError:
            fail('E_UNICODE','request')
        if type(data) is not dict or set(data)!={'state_json'}:
            fail('E_KEYS','request')
        result=preview(data['state_json'],MAX_RESOLUTION)
        result['max_resolution']=min(16384,MAX_RESOLUTION)
        return web.json_response(result)
    except StateError as error:
        return web.json_response({'error':{'code':error.code,'path':error.path,'details':error.details}},status=413 if error.code=='E_STATE_SIZE' else 400)
    except Exception:
        logging.exception('MOSS sheet preview failed')
        return web.json_response({'error':{'code':'E_INTERNAL','path':'preview'}},status=500)


PRESETS_PATH = os.path.join(folder_paths.get_user_directory(), 'default', 'muse_moss_sheet_presets.json')

PRESET_FIELDS = {'characters': ('prompt', 'body_details', 'nsfw_details'), 'outfits': ('outfit',)}

def load_presets():
    if not os.path.exists(PRESETS_PATH):
        return {'characters': {}, 'outfits': {}}
    with open(PRESETS_PATH, encoding='utf-8') as f:
        presets = json.load(f)
    if 'characters' not in presets:
        # Older files held one flat dict of character presets that included the outfit.
        presets = {'characters': {k: {f: v.get(f, '') for f in (*PRESET_FIELDS['characters'], 'state_json')} for k, v in presets.items()},
                   'outfits': {k: {'outfit': v['outfit']} for k, v in presets.items() if v.get('outfit')}}
    return presets

async def presets_get(request):
    return web.json_response(load_presets())

async def presets_post(request):
    data = await request.json()
    name, kind = data.get('name'), data.get('kind')
    if kind not in PRESET_FIELDS:
        return web.json_response({'error': 'invalid preset kind'}, status=400)
    if not isinstance(name, str) or not name.strip() or len(name) > 100:
        return web.json_response({'error': 'invalid name'}, status=400)
    presets = load_presets()
    if data.get('delete'):
        presets[kind].pop(name, None)
    else:
        entry = {k: data.get(k, '') for k in PRESET_FIELDS[kind]}
        if not all(isinstance(v, str) for v in entry.values()):
            return web.json_response({'error': 'invalid preset'}, status=400)
        if kind == 'characters':
            try:
                entry['state_json'] = compact(parse_state(data.get('state_json'), MAX_RESOLUTION))
            except StateError as error:
                return web.json_response({'error': str(error)}, status=400)
        presets[kind][name.strip()] = entry
    os.makedirs(os.path.dirname(PRESETS_PATH), exist_ok=True)
    with open(PRESETS_PATH, 'w', encoding='utf-8') as f:
        json.dump(presets, f, ensure_ascii=False, indent=1)
    return web.json_response(presets)

def register_routes():
    routes = PromptServer.instance.routes
    routes.post('/muse_moss_sheet/v1/preview')(preview_request)
    routes.get('/muse_moss_sheet/presets')(presets_get)
    routes.post('/muse_moss_sheet/presets')(presets_post)
