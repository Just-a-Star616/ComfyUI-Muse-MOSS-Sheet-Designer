from .moss_sheet.node import MuseMossSheetDesigner
from .moss_sheet.preview import register_routes

NODE_CLASS_MAPPINGS = {"MuseMossSheetDesigner": MuseMossSheetDesigner}
NODE_DISPLAY_NAME_MAPPINGS = {"MuseMossSheetDesigner": "Muse MOSS Sheet Designer (FLUX.2 / Qwen)"}
WEB_DIRECTORY = "./web"
register_routes()
