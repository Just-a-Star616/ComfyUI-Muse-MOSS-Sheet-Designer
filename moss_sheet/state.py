import hashlib
import json
from .catalog import CONTRACT, DEFAULT, VIEWS, PARTS

WHITESPACE = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
PROMPT_MAX_UTF16_UNITS = 2000

class StateError(ValueError):
    def __init__(self, code, path='state_json', details=''):
        self.code, self.path, self.details = code, path, details
        super().__init__(f'{code}: {path} {details}')

def fail(code, path='state_json', details=''):
    raise StateError(code, path, details)

def nonblank(text):
    return bool(text.strip(WHITESPACE))

def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)

def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            fail('E_DUPLICATE_KEY', key)
        result[key] = value
    return result

def strict_load(raw):
    try:
        return json.loads(raw, object_pairs_hook=pairs, parse_float=lambda _: fail('E_TYPE'), parse_constant=lambda _: fail('E_TYPE'))
    except (json.JSONDecodeError, RecursionError):
        fail('E_JSON_SYNTAX')

def keys(value, expected, path, optional=False):
    if type(value) is not dict:
        fail('E_TYPE', path)
    if set(value) - set(expected) or (not optional and set(value) != set(expected)):
        fail('E_KEYS', path)

def text(value, limit, path):
    if type(value) is not str:
        fail('E_TYPE', path)
    try:
        units = len(value.encode('utf-16-le')) // 2
    except UnicodeEncodeError:
        fail('E_UNICODE', path)
    if units > limit:
        fail('E_TEXT_LIMIT', path)
    return value

def enum(value, values, path):
    if type(value) is not str or value not in values:
        fail('E_ENUM', path)
    return value

def validate_prompt(value):
    if not isinstance(value,str) or not nonblank(value):
        fail('E_PROMPT_EMPTY','prompt','prompt入力に人物・衣装の説明を接続してください。 / Connect a nonempty prompt.')
    return text(value,PROMPT_MAX_UTF16_UNITS,'prompt')

def parse_state(raw, runtime_max_resolution=16384):
    if type(raw) is not str:
        fail('E_TYPE')
    try:
        length = len(raw.encode('utf-8'))
    except UnicodeEncodeError:
        fail('E_UNICODE')
    if length > 65536:
        fail('E_STATE_SIZE')
    s = strict_load(raw)
    keys(s, DEFAULT, 'state_json')
    if s['kind'] != DEFAULT['kind'] or type(s['schema_version']) is not int or s['schema_version'] != 1:
        fail('E_SCHEMA')
    views = s['views']
    if type(views) is not list:
        fail('E_TYPE', 'views')
    if not views:
        fail('E_VIEWS_EMPTY', 'views')
    for view in views:
        enum(view, VIEWS, 'views')
    if len(set(views)) != len(views):
        fail('E_VIEWS_DUPLICATE', 'views')
    keys(s['character'], DEFAULT['character'], 'character')
    character = {k: text(s['character'][k], 2000, 'character.' + k) for k in DEFAULT['character']}
    keys(s['part_prompts'], PARTS, 'part_prompts', optional=True)
    parts = {}
    for k in PARTS:
        if k in s['part_prompts']:
            value = text(s['part_prompts'][k], 1000, 'part_prompts.' + k)
            if nonblank(value):
                parts[k] = value
    choices = {'hand_state': ('auto','bare','gloved'), 'clothing_type': ('auto','pants','skirt_robe'), 'footwear_state': ('auto','shod','unshod')}
    if type(s['appearance']) is dict and 'clothing_mode' in s['appearance']:
        enum(s['appearance'].pop('clothing_mode'), ('worn','garment'), 'appearance.clothing_mode')
    keys(s['appearance'], choices, 'appearance')
    appearance = {k: enum(s['appearance'][k], values, 'appearance.' + k) for k, values in choices.items()}
    keys(s['size'], DEFAULT['size'], 'size')
    size = {'mode': enum(s['size']['mode'], ('auto', 'manual'), 'size.mode')}
    for k in ('body_height','pixel_budget','manual_width','manual_height'):
        value = s['size'][k]
        if type(value) is not int:
            fail('E_TYPE', 'size.' + k)
        if k == 'pixel_budget':
            if value not in (1000000,1500000,2000000,4000000):
                fail('E_ENUM', 'size.' + k)
        else:
            if not 256 <= value <= min(16384, runtime_max_resolution):
                fail('E_SIZE_RANGE', 'size.' + k)
            if value % 16:
                fail('E_SIZE_STEP', 'size.' + k)
        size[k] = value
    return dict(kind=DEFAULT['kind'], schema_version=1, views=[v for v in VIEWS if v in views], character=character, part_prompts=parts, appearance=appearance,
                style=enum(s['style'], CONTRACT['styles'], 'style'), background=enum(s['background'], CONTRACT['backgrounds'], 'background'),
                prompt_format=enum(s['prompt_format'], ('auto','caption','layout_json'), 'prompt_format'), negative_prompt=text(s['negative_prompt'],4000,'negative_prompt'), size=size)

def state_hash(state):
    return hashlib.sha256(compact(state).encode('utf-8')).hexdigest()
