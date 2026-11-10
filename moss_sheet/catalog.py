import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = json.loads((ROOT / 'contracts/prompt_contract.v1.json').read_text(encoding='utf-8'))
DEFAULT = json.loads((ROOT / 'contracts/default_state.json').read_text(encoding='utf-8'))
REVISION = CONTRACT['contract_version']
VIEWS = CONTRACT['view_order']
PARTS = CONTRACT['part_order']
