import {CONTRACT,DEFAULT_STATE} from './catalog.js';
export {VIEW_IDS,PART_IDS,PART_PROMPT_MAX_LENGTH,PRESETS,StateError} from './controller.js';
export const MULTI_VIEW_IDS=CONTRACT.view_order, MULTI_PRESETS=CONTRACT.presets;
export const MULTI_MIRRORED_VIEWS=['body_right'];
export const SETTINGS={hand_state:['auto','bare','gloved'],clothing_type:['auto','pants','skirt_robe'],footwear_state:['auto','shod','unshod']};
export const DEFAULTS=DEFAULT_STATE.appearance;
export const presetOf=state=>Object.entries(CONTRACT.presets).find(([,views])=>views.join()===state?.views.join())?.[0]??'custom';
