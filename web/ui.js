import {VIEW_IDS, PART_IDS, PART_PROMPT_MAX_LENGTH, PRESETS, presetOf, StateError} from './presentation_state.js';
import {createArtwork} from './artwork.js';
import {MULTI_VIEW_IDS, MULTI_PRESETS, SETTINGS, DEFAULTS, MULTI_MIRRORED_VIEWS} from './presentation_state.js';
let sequence = 0;
export const HEIGHT_PRESETS = [672, 896, 1120, 1344, 1792];
export const STYLE_IDS = ['none', 'anime', 'photo', 'realistic_painting', 'semi_realistic_anime', 'oil_painting', 'watercolor', 'gouache', 'colored_pencil', '3d'];
const EN = {
  intro: 'Choose the views for your character sheet', selected: 'selected',
  face_front: 'Portrait', face_left: 'Left portrait', body_front: 'Front', body_left: 'Left side', body_back: 'Back', hands: 'Hands', feet: 'Footwear',
  face_front_tip: 'Front-facing face to chest', face_left_tip: 'Head to chest, camera facing the subject’s anatomical left side', body_front_tip: 'Full body, head to soles', body_left_tip: "Camera looks directly at the subject’s anatomical left side", body_back_tip: 'Direct rear view, full body', hands_tip: 'Both hands; retain gloves from the reference', feet_tip: 'Separate close-up of both feet in described footwear; visible boot shafts retained',
  preset: 'Preset', template: 'Muse template · 5 views', five: 'Standard · 5 views', basic: 'Basic · 4 views', detail: 'Detail · 7 views', turnaround: 'Turnaround · 3', single: 'Single view', custom: 'Custom',
  auto: 'Auto', manual: 'Manual', size: 'Output size', bodyHeight: 'Panel height', width: 'Width', height: 'Height', returnAuto: 'Back to Auto', updating: 'Updating dimensions…',
  customHeight: 'Custom panel height', customHeightChoice: 'Custom…',
  autoHint: 'Auto keeps the requested full-body panel height.', manualHint: 'Manual keeps your canvas size when views change.',
  layout: 'SHEET PREVIEW', diagram: 'Layout guide', experimental: 'Experimental', pixels: 'pixels',
  caveat: 'A prompt layout guide. Exact geometry and generation quality are not guaranteed.',
  resolutionWarning: 'High resolution is experimental. This inherited display threshold is not a MOSS quality or VRAM limit.',
  committed: 'Saved', pending: 'Updating…', stale: 'Updating…', previous: 'Previous layout', unavailable: 'Preview unavailable', retry: 'Retry preview', empty: 'Waiting for Python layout', dense: 'Dense',
  draft: 'Uncommitted values are not saved or queued.', invalid: 'Saved JSON is invalid. Its original value is preserved.', editJSON: 'Saved data (JSON)', apply: 'Apply JSON', rawHint: 'For manual recovery. Only Apply changes the saved data.', settingsTab: 'Settings',
  lastView: 'Keep at least one view selected.', sizeError: 'Enter a whole number of at least 32, in steps of 32.', maxSize: 'Exceeds the ComfyUI resolution limit.', integer: 'JSON integer fields cannot use decimal or exponent notation.', version: 'Only schema_version 1 or 2 is supported.', views: 'Select one or more of the seven known view IDs.', json: 'The JSON syntax is invalid.', duplicateKey: 'Duplicate JSON key', keys: 'Unknown or missing JSON keys', oversize: 'JSON must be no larger than 64 KiB.', mode: 'Size mode must be auto or manual.', object: 'Expected a JSON object', string: 'state_json must be a string.', preview: 'The server returned an invalid preview.', timeout: 'Preview timed out. The saved selection is unchanged.', network: 'Could not reach the preview endpoint. Queue still validates on the server.',
  fallback: 'Graphical designer unavailable. Edit the normal state_json string; Python compilation is still available.',
  layoutTab: 'Layout', partsTab: 'Part prompts', part: 'Body part', partPrompt: 'Prompt', partCount: 'parts specified',
  generatedPrompt: 'Generated prompt', characterOnly: 'Optimized original Designer prompt · Picture 1 only · layout reference bypassed', layoutReference: 'Picture 1: character / Picture 2: layout',
  styleTab: 'Style', style: 'Style', clearStyle: 'Clear', styleHint: 'Changes rendering only. Keeps the reference character, outfit, accessories and colors, except for your part prompts. Applies to all selected views.',
  styleUnavailable: 'Restart ComfyUI and reload the page to enable the style input.',
  style_none: 'None · default', style_anime: 'Anime', style_photo: 'Photo', style_realistic_painting: 'Realistic painting', style_semi_realistic_anime: 'Semi-realistic anime', style_oil_painting: 'Oil painting', style_watercolor: 'Watercolor', style_gouache: 'Gouache', style_colored_pencil: 'Colored pencil', style_3d: '3D CG',
  style_none_tip: 'Adds no style instruction.', style_anime_tip: 'Anime linework and cel shading.', style_photo_tip: 'Photographic surface rendering.', style_realistic_painting_tip: 'Realistic forms rendered as a painting.', style_semi_realistic_anime_tip: 'Anime linework with softly modeled shading; keeps reference proportions.', style_oil_painting_tip: 'Oil-painted brushwork.', style_watercolor_tip: 'Pigment washes with clear contours.', style_gouache_tip: 'Opaque painted color fills.', style_colored_pencil_tip: 'Colored-pencil strokes and shading.', style_3d_tip: 'Three-dimensional surface shading.',
  partPlaceholder: 'Describe colors, shapes, patterns, text, or placement freely.',
  partHint: 'One instruction per part, shared across related selected views. Leave blank to follow the description.',
  partSaved: 'Saved as you type. Enter adds a new line.', partGuide: 'The layout guide uses mannequins; it does not visualize these instructions.',
  head_hair_part: 'Head / hair', face_part: 'Face', upper_clothing_part: 'Upper-body clothing', back_clothing_part: 'Back of clothing', lower_body_part: 'Lower body', hands_part: 'Hands / gloves', footwear_part: 'Feet / footwear', other_part: 'Overall / other',
  partText: 'Each part prompt must be a string.', parts: 'Unknown body part.', partLength: 'Keep each prompt within 1000 characters; some symbols count as more than one.', partUnicode: 'The prompt contains invalid Unicode.',
  undoWarning: 'This frontend does not expose the expected Undo transaction API.',
};
const JA = {
  intro: 'キャラクターシートに使うビューを選択', selected: '選択中',
  face_front: '顔・胸', face_left: '横顔・左', body_front: '全身正面', body_left: '左側面', body_back: '全身背面', hands: '両手', feet: '足・履物',
  face_front_tip: '正面の顔から胸まで', face_left_tip: '人物の解剖学的左側から見た横顔。髪全体から胸まで', body_front_tip: '頭頂から靴底までの全身正面', body_left_tip: 'カメラが人物の解剖学的左側を正面から見る', body_back_tip: '真後ろから見た全身', hands_tip: '左右の手。参照にある手袋を保持', feet_tip: '両足の独立した拡大図。説明した履物と見えているブーツの筒を保持',
  preset: 'プリセット', template: 'Museテンプレート5ビュー', five: '標準5ビュー', basic: '基本4面', detail: '7面・ディテール', turnaround: '三面図のみ', single: '1カット', custom: 'カスタム',
  auto: 'Auto', manual: 'Manual', size: '出力サイズ', bodyHeight: '基準高', width: '幅', height: '高さ', returnAuto: 'Autoに戻す', updating: '寸法更新中…',
  customHeight: '基準高を手入力', customHeightChoice: '手入力…',
  autoHint: 'Autoは指定した全身パネルの高さを維持します。', manualHint: 'Manualはビューを変えても幅・高さを維持します。',
  layout: 'シートプレビュー', diagram: '配置ガイド', experimental: 'Experimental', pixels: '画素',
  caveat: '配置はプロンプト上の指示です。正確な形状や生成品質は保証しません。',
  resolutionWarning: '高解像度は試験対象です。この既存の表示閾値はMOSSの品質・VRAM上限ではありません。',
  committed: '保存済み', pending: '更新中…', stale: '更新中…', previous: '前の配置', unavailable: 'プレビュー取得失敗', retry: '再試行', empty: 'Pythonの配置を取得中', dense: '高密度',
  draft: '未確定の値は保存・実行されません。', invalid: '保存JSONが不正です。原文を保持しています。', editJSON: '保存データ（JSON）', apply: 'JSONを適用', rawHint: '手動修復用です。「適用」を押したときだけ保存データを変更します。', settingsTab: '設定',
  lastView: '最低1つのビューを選択してください。', sizeError: '32以上の32倍数を整数で入力してください。', maxSize: 'ComfyUIの解像度上限を超えています。', integer: 'JSONの整数項目に小数・指数表記は使えません。', version: 'schema_versionは整数の1または2に対応しています。', views: '既知の7種類から1つ以上のビューを指定してください。', json: 'JSONの構文が不正です。', duplicateKey: 'JSONキーが重複しています', keys: 'JSONキーの不足または未知のキー', oversize: 'JSONは64 KiB以内にしてください。', mode: 'size.modeはautoまたはmanualにしてください。', object: 'JSONオブジェクトが必要です', string: 'state_jsonは文字列で指定してください。', preview: 'サーバーからのプレビューが不正です。', timeout: 'プレビューがタイムアウトしました。保存済み選択は維持しています。', network: 'プレビューを取得できません。Queue時にはサーバーで検証されます。',
  fallback: 'GUIデザイナーを利用できません。通常のstate_json文字列を編集してください。Python実行は利用可能です。',
  layoutTab: 'レイアウト', partsTab: '部位指定', part: '部位', partPrompt: 'プロンプト', partCount: '部位を指定中',
  generatedPrompt: '生成プロンプト', characterOnly: '旧版ベースの最適化・Picture 1のみ・配置参照は自動バイパス', layoutReference: 'Picture 1：人物／Picture 2：配置',
  styleTab: 'スタイル', style: 'スタイル', clearStyle: '解除', styleHint: '人物の描画方法だけを変更します。部位指定を除き、参照の人物・衣装・小物・色を保持し、選択中の全ビューへ共通で適用します。',
  styleUnavailable: 'スタイル入力を有効にするには、ComfyUIを再起動してページを再読込してください。',
  style_none: '指定なし〈デフォルト〉', style_anime: 'アニメ', style_photo: 'フォト〈写真〉', style_realistic_painting: '写実〈絵画〉', style_semi_realistic_anime: '写実アニメ', style_oil_painting: '油彩', style_watercolor: '水彩', style_gouache: 'ガッシュ〈不透明水彩〉', style_colored_pencil: '色鉛筆', style_3d: '3D CG',
  style_none_tip: 'スタイル文を追加しません。', style_anime_tip: 'アニメ風の線とセル塗り。', style_photo_tip: '写真としての表面・陰影表現。', style_realistic_painting_tip: '写実的な形と立体感を絵として描きます。', style_semi_realistic_anime_tip: '説明した顔立ち・体格に、アニメの線と立体的な陰影。', style_oil_painting_tip: '油絵の筆触。', style_watercolor_tip: '輪郭を保った水彩の色の重なり。', style_gouache_tip: '不透明な色面と筆触。', style_colored_pencil_tip: '色鉛筆の線・塗りの質感。', style_3d_tip: '立体レンダリングの表面・陰影表現。',
  partPlaceholder: '色・形・柄・文字・位置などを自由に入力',
  partHint: '部位ごとの指示を、関連する選択ビューへ共通で反映します。空欄なら参照画像に従います。',
  partSaved: '入力は即時保存。Enterで改行します。', partGuide: 'マネキンは配置確認用です。部位指定の見た目はプレビューに反映しません。',
  head_hair_part: '頭・髪', face_part: '顔', upper_clothing_part: '上半身の服', back_clothing_part: '背面の服', lower_body_part: '下半身', hands_part: '手・手袋', footwear_part: '足・履物', other_part: '全体・その他',
  partText: '部位プロンプトは文字列で入力してください。', parts: '未知の部位です。', partLength: '各プロンプトは1000文字以内にしてください（絵文字などは複数文字分）。', partUnicode: 'プロンプトに不正なUnicodeが含まれています。',
  undoWarning: 'このfrontendでは必要なUndoトランザクションAPIを確認できません。',
};
Object.assign(EN, {
  handState: 'Unknown hand state.', clothingMode: 'Unknown clothing mode.',
  handStateLabel: 'Hand appearance', hand_reference: 'Follow reference', hand_bare: 'Bare hands', hand_gloved: 'Gloves',
  qualityHint: 'Hand choice overrides coverage only; other part text remains. Garments only excludes the wearer from the two clothing panels.',
  multiHandsTip: 'Both complete hands; follow the description or the explicit hand choice',
  garmentTip: 'Garments only, laid flat without a person',
  body_3q: 'Front 3/4', body_right: 'Right side', face_right: 'Right portrait', face_3q_left: 'Left 3/4', face_3q_right: 'Right 3/4', face_back: 'Rear portrait',
  clothing_front: 'Clothing front', clothing_back: 'Clothing back',
  face_right_tip: 'True 90-degree right side view (profile), head through chest',
  face_3q_left_tip: 'Front-left three-quarter bust, anatomical-left side',
  body_3q_tip: 'Full body turned 45 degrees; front and anatomical-left side visible',
  body_right_tip: 'Anatomical-right full-body profile; nose and toes toward the LEFT image edge (generated, not mirrored)',
  face_3q_right_tip: 'Front-right three-quarter bust, anatomical-right side',
  face_back_tip: 'Head through chest directly from behind, no visible face',
  clothing_front_tip: 'Front of the outfit, laid flat without a person',
  clothing_back_tip: 'Back of the outfit, laid flat without a person',
  head: 'Head · 6 views', clothing: 'Clothing · front/back', multiDetail: 'All · 13 views',
  references: 'Additional reference roles', extraReference: 'Additional reference',
  connected: 'connected', notConnected: 'not connected', roles: 'Unknown reference role.',
  role_same_character: 'Same character · additional angle', role_face: 'Face only', role_head: 'Head / face / hair',
  role_clothing: 'Complete outfit', role_clothing_front: 'Front of outfit', role_clothing_back: 'Back of outfit',
  role_hands: 'Hands / accessories', role_footwear: 'Feet / footwear',
  referenceRoleHint: 'Connect external LoadImage nodes to the Designer. Roles apply wherever visible, even with the detail card off.',
  numberingProvisional: 'Planned Picture numbers from connections; actual images are resolved at execution.',
});
Object.assign(JA, {
  handState: '未知の手の状態です。', clothingMode: '未知の衣装表示です。',
  handStateLabel: '手の状態', hand_reference: '参照に従う', hand_bare: '素手', hand_gloved: '手袋',
  qualityHint: '手の選択は着用有無を優先し、部位文は形・素材などに使います。衣服のみでは衣装2枚に人物を描きません。',
  multiHandsTip: '両手の全体。人物説明または手の状態の明示指定に従う',
  garmentTip: '衣服のみを平置き。人物を含めない',
  body_3q: '全身斜め', body_right: '右側面', face_right: '横顔・右', face_3q_left: '左斜め', face_3q_right: '右斜め', face_back: '頭部背面',
  clothing_front: '衣装正面', clothing_back: '衣装背面',
  face_right_tip: '人物の解剖学的右側から見た横顔。髪全体から胸まで',
  face_3q_left_tip: '人物の左側から45度の斜め正面。頭から胸まで',
  body_3q_tip: '全身を45度回転。正面と人物の左側が見える',
  body_right_tip: '人物の右側から見る。全身側面で鼻・つま先は画面の左へ（反転ではなく生成）',
  face_3q_right_tip: '人物の右側から45度の斜め正面。頭から胸まで',
  face_back_tip: '真後ろの頭から胸まで。顔を見せない',
  clothing_front_tip: '衣服だけを平置きした正面。人物は含めない',
  clothing_back_tip: '衣服だけを平置きした背面。人物は含めない',
  head: '頭部6ビュー', clothing: '衣装・前後', multiDetail: '全13ビュー',
  references: '追加参照の役割', extraReference: '追加参照',
  connected: '接続中', notConnected: '未接続', roles: '未知の参照役割です。',
  role_same_character: '同一人物・補足画像', role_face: '顔のみ', role_head: '頭部・顔・髪',
  role_clothing: '衣装全体', role_clothing_front: '衣装前面', role_clothing_back: '衣装背面',
  role_hands: '手・小物', role_footwear: '足・履物',
  referenceRoleHint: '外部のLoadImageをDesignerに接続します。詳細カードがOFFでも、見える部位へ適用します。',
  numberingProvisional: '接続に基づくPicture予定番号です。実際の画像は実行時に確定します。',
});
Object.assign(EN, {
  startHelp:'1 Describe your character → 2 Select illustrated views → 3 Connect prompt and dimensions to the MOSS workflow.',
  identity:'Prompt input (required)',outfit:'Outfit (shared by all views)',identityPlaceholder:'Name or trigger tags, age, hair, face, build, distinguishing features…',outfitPlaceholder:'Clothes, colors, materials, accessories…',
  identityRequired:'Enter the character, outfit and distinguishing features in Prompt input above.',pixelBudget:'Pixel budget',composition:'Finish text composition before saving or queueing.',external:'External state input connected. Local editing is disabled.',lastTokens:'Tokens at last execution',seven:'7 views · hands and feet',
  bodyHeight:'Panel height',autoHint:'Auto fits the selected views within the pixel budget. The actual height may be smaller.',manualHint:'Manual keeps your chosen width and height. View changes only rearrange the sheet.',
  partHint:'Optional: add details only for the selected body part. Connect the character and outfit description to the prompt input socket.',partPlaceholder:'For example: a silver hairpin on the left side; a blue emblem on the back of the jacket.',
  styleHint:'Applies this rendering style to the entire sheet; preserves your character and outfit descriptions.',caveat:'Layout guide only. MOSS receives the same panel positions as Layout JSON; the pictures here are not your generated character.',resolutionWarning:'Dense / many-view layout is experimental. Reduce views or increase the pixel budget if details are too small.',sizeError:'Enter a multiple of 16, from 256 to the supported maximum.',version:'Unsupported MOSS state version.',views:'Select one or more of the 13 views.'
});
Object.assign(JA, {
  startHelp:'① 人物を入力 → ② イラストのカードで向きを選択 → ③ prompt・幅・高さを生成ノードへ接続',
  identity:'プロンプトの入力（必須）',outfit:'衣装の補足（任意）',identityPlaceholder:'人物名・トリガータグ、髪・顔・体格、衣装・色・小物、特徴など',outfitPlaceholder:'服の種類・色・素材・アクセサリーなど。「プロンプトの入力」に含めても構いません。',
  identityRequired:'「プロンプトの入力」に人物・衣装・特徴を入力してください。',pixelBudget:'Autoの画素予算',composition:'日本語変換を確定してから保存・実行してください。',external:'外部state入力を使用中です。ローカル編集は無効です。',lastTokens:'前回実行時のトークン数',seven:'7面・手足を追加',
  bodyHeight:'基準高',autoHint:'Autoは画素予算に収めて配置します。実効高は希望値より小さくなる場合があります。',manualHint:'指定した幅・高さを維持します。ビューを変えると、その画像サイズ内で配置を調整します。',
  partHint:'必要な部位だけ補足します。人物全体と衣装の説明はprompt入力ソケットへ接続してください。空欄の部位には補足しません。',partPlaceholder:'例：左側に銀色の髪留め／ジャケットの背中に青い紋章',
  styleHint:'シート全体の描画スタイルを選択します。入力した人物・衣装の特徴は維持します。',caveat:'配置確認用のガイドです。MOSSには同じ領域のLayout JSONを渡します。ここに表示する人形は生成結果ではありません。',resolutionWarning:'多数ビュー・高密度の配置は実験的です。細部が小さい場合はビューを減らすか画素予算を上げてください。',sizeError:'256以上、上限以内の16の倍数を入力してください。',version:'対応していないMOSS保存形式です。',views:'13種類から1つ以上のビューを選択してください。'
});
export const translations = {en: EN, ja: JA};
const multiTips = {
  en: {face_left: 'Anatomical-left strict profile; nose toward the RIGHT image edge',
    face_right: 'Anatomical-right strict profile; nose toward the LEFT image edge',
    face_3q_left: 'Anatomical-left 45-degree view; nose toward the RIGHT image edge',
    face_3q_right: 'Anatomical-right 45-degree view; nose toward the LEFT image edge',
    body_left: 'Anatomical-left full-body profile; nose and toes toward the RIGHT image edge'},
  ja: {face_left: '人物の左側から見る。厳密な横顔で鼻は画面の右へ',
    face_right: '人物の右側から見る。厳密な横顔で鼻は画面の左へ',
    face_3q_left: '人物の左側から45度。鼻は画面の右へ',
    face_3q_right: '人物の右側から45度。鼻は画面の左へ',
    body_left: '人物の左側から見る。全身側面で鼻・つま先は画面の右へ'},
};
export function errorText(error, locale = 'en') {
  const t = translations[locale] ?? EN;
  const mossCodes={E_JSON_SYNTAX:'json',E_DUPLICATE_KEY:'duplicateKey',E_STATE_SIZE:'oversize',E_UNICODE:'partUnicode',E_SCHEMA:'version',E_KEYS:'keys',E_TYPE:'integer',E_ENUM:'views',E_VIEWS_EMPTY:'lastView',E_VIEWS_DUPLICATE:'views',E_TEXT_LIMIT:'partLength',E_IDENTITY_EMPTY:'identityRequired',E_SIZE_STEP:'sizeError',E_SIZE_RANGE:'sizeError'};
  const mapped=mossCodes[error?.code ?? error?.serverCode];
  if(mapped)return `${t[mapped]}${error.detail ? ` (${error.detail})` : ''}`;
  if (error instanceof StateError) {
    const key = error.code === 'size' ? 'sizeError' : error.code;
    return `${t[key] ?? t.network}${['duplicateKey', 'keys', 'object', 'maxSize'].includes(error.code) && error.detail ? ` (${error.detail})` : ''}`;
  }
  const serverCodes = {duplicate_key: 'duplicateKey', non_finite: 'integer', invalid_integer: 'integer', invalid_size: 'sizeError', size_limit: 'maxSize', unsupported_schema: 'version', empty_views: 'views', unknown_view: 'views', invalid_mode: 'mode', missing_key: 'keys', unknown_key: 'keys', invalid_json: 'json', invalid_utf8: 'json', state_too_large: 'oversize', request_too_large: 'oversize', unknown_part: 'parts', part_prompt_too_long: 'partLength', invalid_hand_state: 'handState', invalid_clothing_mode: 'clothingMode'};
  return error?.serverCode && serverCodes[error.serverCode] ? t[serverCodes[error.serverCode]] : error?.serverMessage || t.network;
}
function element(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }
const button = className => { const el = element('button', className); el.type = 'button'; return el; };
export function loadStyles() {
  if (document.querySelector('link[data-moss-sheet-style]')) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('./sheet_style.css', import.meta.url).href; link.dataset.mossSheetStyle = ''; document.head.append(link);
}

/** Real UI renderer shared by the ComfyUI extension and the browser test harness. */
export function createDesignerUI({controller, locale = 'ja', compatibilityWarning = false}) {
  const reference = true, multiReference = true;
  const readStyle = () => controller.state?.style ?? 'none';
  const writeStyle = value => controller.change(state => { state.style = value; });
  loadStyles();
  const id = `moss-reference13-${++sequence}`;
  const root = element('section', 'moss-designer moss-reference13 moss-sheet-designer'); root.dataset.instance = id; root.classList.toggle('moss-reference', reference); root.setAttribute('aria-label', reference ? 'MOSS Character Sheet Designer Reference' : 'MOSS Character Sheet Designer');
  root.classList.toggle('moss-multi-reference', multiReference);
  root.setAttribute('aria-label', 'MOSS-Image Character Sheet Designer');
  const viewIds = multiReference ? MULTI_VIEW_IDS : VIEW_IDS;
  const presets = multiReference ? MULTI_PRESETS : PRESETS;
  const abort = new AbortController(); const listen = (el, type, handler) => el.addEventListener(type, handler, {signal: abort.signal});
  let language = locale, t = translations[locale] ?? EN, disposed = false;
  const partDrafts = new Map(); let selectedPart = PART_IDS[0], activeTab = 'layout';
  const drafts = new Map(); let customHeight = false; let localError = null, lastRaw = Symbol(), lastPreviewKey = null; let external = false, token = null, partComposing = false;
  const header = element('div', 'moss-intro'), intro = element('span'), count = element('span', 'moss-count'); header.append(intro, count);
  const version = element('span', 'moss-node-version', 'v1.0'); header.prepend(version);
  const cards = element('div', 'moss-cards'), cardMap = new Map();
  const headRow = element('div', 'moss-card-row moss-head-row'), bodyRow = element('div', 'moss-card-row moss-body-row');
  if (multiReference) cards.append(headRow, bodyRow);
  for (const view of viewIds) {
    const card = button('moss-card'); card.dataset.view = view;
    const figure = element('span', 'moss-card-figure'); figure.append(createArtwork(view, `${id}-card-${view}`, {mirror: multiReference && MULTI_MIRRORED_VIEWS.includes(view)}));
    const check = element('span', 'moss-check', '✓'); check.setAttribute('aria-hidden', 'true');
    const label = element('span', 'moss-card-label'); card.append(figure, check, label);
    listen(card, 'click', () => act(() => controller.toggle(view)));
    (multiReference ? (viewIds.indexOf(view) < 6 ? headRow : bodyRow) : cards).append(card); cardMap.set(view, {card, label});
  }
  const presetRow = element('div', 'moss-preset-row'), presetLabel = element('label'), preset = element('select', 'moss-select'); preset.id = `${id}-preset`; presetLabel.htmlFor = preset.id;
  for (const name of [...Object.keys(presets), 'custom']) { const option = element('option'); option.value = name; option.disabled = name === 'custom'; preset.append(option); }
  presetRow.append(presetLabel, preset); listen(preset, 'change', () => act(() => controller.preset(preset.value)));
  const controls = element('div', 'moss-controls');
  const modeRow = element('div', 'moss-mode-row'), sizeLabel = element('span', 'moss-field-title'), modeGroup = element('div', 'moss-mode-group');
  const auto = button('moss-mode'), manual = button('moss-mode'); auto.dataset.mode = 'auto'; manual.dataset.mode = 'manual'; modeGroup.append(auto, manual); modeRow.append(sizeLabel, modeGroup);
  listen(auto, 'click', () => act(() => controller.setMode('auto'))); listen(manual, 'click', () => act(() => controller.setMode('manual', displayOutput())));
  const numberRow = element('div', 'moss-number-row'), fields = new Map();
  for (const [field, labelKey] of [['body_height', 'bodyHeight'], ['manual_width', 'width'], ['manual_height', 'height']]) {
    const wrap = element('div', 'moss-number-field'), label = element('label'), input = element('input'); input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off'; input.spellcheck = false; input.id = `${id}-${field}`; input.dataset.field = field; label.htmlFor = input.id;
    const message = element('span', 'moss-draft-note'); message.id = `${input.id}-note`; input.setAttribute('aria-describedby', message.id);
    const line = element('div', 'moss-input-line'); line.append(input);
    if (field === 'body_height') {
      // The value and arrow are one full-width native select. A tiny separate
      // select anchors its popup to the arrow instead of the displayed value.
      const choices = element('select', 'moss-select moss-height-choices'); choices.dataset.heightPresets = '';
      choices.id = `${input.id}-choices`; label.htmlFor = choices.id;
      for (const height of HEIGHT_PRESETS) { const option = element('option', '', String(height)); option.value = String(height); choices.append(option); }
      const custom = element('option'); custom.value = 'custom'; choices.append(custom);
      listen(choices, 'change', () => {
        if (choices.value === 'custom') {
          customHeight = true; renderFields(); input.focus(); input.select();
        } else {
          customHeight = false; drafts.delete(field); act(() => controller.setSize(field, choices.value));
        }
      });
      line.prepend(choices); fields.set(field, {wrap, label, input, message, labelKey, choices, custom});
    } else fields.set(field, {wrap, label, input, message, labelKey});
    wrap.append(label, line, message); numberRow.append(wrap);
    listen(input, 'input', () => { drafts.set(field, {text: input.value, error: null}); renderFields(); });
    listen(input, 'blur', () => commitDraft(field));
    listen(input, 'keydown', event => { if (event.isComposing || event.keyCode === 229) return; if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commitDraft(field); } if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); drafts.delete(field); if (field === 'body_height') customHeight = false; renderFields(); fields.get(field).choices?.focus(); } });
  }
  const modeHint = element('div', 'moss-mode-hint'); controls.append(modeRow, numberRow);
  const budgetWrap=element('label','moss-budget'),budgetLabel=element('span'),budget=element('select','moss-select');
  budget.dataset.pixelBudget='';for(const value of [1000000,1500000,2000000,4000000]){const option=element('option','',`${value/1000000} MP`);option.value=String(value);budget.append(option);}
  budgetWrap.append(budgetLabel,budget);controls.append(budgetWrap);
  listen(budget,'change',()=>act(()=>controller.change(state=>{state.size.pixel_budget=Number(budget.value);})));
  const metrics = element('div', 'moss-metrics'), dimensions = element('strong', 'moss-dimensions'), pixels = element('span', 'moss-pixels'), badge = element('span', 'moss-experimental'); metrics.append(dimensions, pixels, badge);
  const warning = element('div', 'moss-resolution-note');
  const status = element('div', 'moss-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  metrics.append(status); badge.tabIndex = 0;
  const errorBox = element('div', 'moss-error'); errorBox.setAttribute('role', 'alert');
  const retry = button('moss-retry'); listen(retry, 'click', () => { localError = null; void controller.refreshPreview(); });
  const styleStatus = element('div', 'moss-style-status'), styleBadge = element('span'), clearStyle = button('moss-clear-style');
  styleStatus.dataset.styleStatus = ''; styleStatus.setAttribute('role', 'status'); styleStatus.setAttribute('aria-live', 'polite');
  clearStyle.dataset.clearStyle = ''; listen(clearStyle, 'click', () => act(() => writeStyle('none'))); styleStatus.append(styleBadge, clearStyle);
  const previewHead = element('div', 'moss-preview-head'), tabs = element('div', 'moss-tabs'), previewTag = element('span', 'moss-preview-tag');
  tabs.setAttribute('role', 'tablist'); const tabMap = new Map();
  const tabNames = reference ? ['layout', 'parts', 'style', 'settings'] : ['layout', 'parts', 'settings'];
  for (const name of tabNames) {
    const tab = button('moss-tab'); tab.id = `${id}-${name}-tab`; tab.dataset.tab = name;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `${id}-${name}-panel`);
    listen(tab, 'click', () => { activeTab = name; render(); });
    listen(tab, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      activeTab = event.key === 'Home' ? tabNames[0] : event.key === 'End' ? tabNames.at(-1) : tabNames[(tabNames.indexOf(activeTab) + (event.key === 'ArrowRight' ? 1 : tabNames.length - 1)) % tabNames.length];
      render(); tabMap.get(activeTab).focus();
    });
    tabs.append(tab); tabMap.set(name, tab);
  }
  previewHead.append(tabs, styleStatus, previewTag);
  const stage = element('div', 'moss-stage'); stage.id = `${id}-layout-panel`; stage.setAttribute('role', 'tabpanel'); stage.setAttribute('aria-labelledby', `${id}-layout-tab`); stage.tabIndex = 0;
  stage.dataset.previewStage = ''; const canvas = element('div', 'moss-sheet'); const empty = element('div', 'moss-empty'); stage.append(canvas, empty);
  function displayOutput() { return controller.isCurrentPreview ? controller.preview : null; }
  const partPanel = element('div', 'moss-part-panel'); partPanel.id = `${id}-parts-panel`; partPanel.setAttribute('role', 'tabpanel'); partPanel.setAttribute('aria-labelledby', `${id}-parts-tab`);
  const partRow = element('div', 'moss-part-row'), partLabel = element('label'), partSelect = element('select', 'moss-select');
  partSelect.id = `${id}-part`; partSelect.dataset.partSelect = ''; partLabel.htmlFor = partSelect.id;
  for (const part of PART_IDS) { const option = element('option'); option.value = part; partSelect.append(option); }
  const partCount = element('span', 'moss-part-count'); partCount.setAttribute('aria-live', 'polite');
  partRow.append(partLabel, partSelect, partCount);
  const promptLabel = element('label', 'moss-prompt-label'), partInput = element('textarea', 'moss-part-input');
  partInput.id = `${id}-part-prompt`; partInput.dataset.partPrompt = ''; promptLabel.htmlFor = partInput.id;
  partInput.maxLength = PART_PROMPT_MAX_LENGTH; partInput.spellcheck = false; partInput.rows = 5;
  const partHint = element('div', 'moss-part-hint'), partNote = element('div', 'moss-part-note'), partLength = element('span', 'moss-part-length');
  partHint.id = `${id}-part-hint`; partNote.id = `${id}-part-note`;
  partInput.setAttribute('aria-describedby', `${partHint.id} ${partNote.id}`);
  const partBottom = element('div', 'moss-part-bottom'); partBottom.append(partNote, partLength);
  partPanel.append(partRow, partHint, promptLabel, partInput, partBottom);
  const qualityMap = new Map();
  const qualityBox = element('div', 'mossr13-choices');
  qualityBox.append(presetRow);
  for (const field of ['clothing_type', 'hand_state', 'footwear_state']) {
    const row = element('div', 'mossr13-choice'), label = element('label'), select = element('select', 'moss-select');
    row.dataset.choiceGroup = field; select.dataset.appearanceChoice = field;
    select.id = `${id}-${field}`; label.htmlFor = select.id;
    for (const value of SETTINGS[field]) { const option = element('option'); option.value = value; select.append(option); }
    listen(select, 'change', () => act(() => controller.setChoice(field, select.value)));
    row.append(label, select); qualityBox.append(row); qualityMap.set(field, {label, select});
  }
  // Persist synchronously on every input, including IME input. Do not rewrite an
  // unchanged textarea value while composing, so the caret and composition live on.
  listen(partInput, 'compositionstart', () => { partComposing = true; });
  listen(partInput, 'compositionend', () => { partComposing = false; commitPart(); });
  listen(partInput, 'input', () => { if (!partComposing) commitPart(); });
  listen(partInput, 'keydown', event => event.stopPropagation()); // Enter remains a native newline.
  listen(partSelect, 'change', () => { selectedPart = partSelect.value; render(); });
  const stylePanel = element('div', 'moss-style-panel'); stylePanel.id = `${id}-style-panel`; stylePanel.setAttribute('role', 'tabpanel'); stylePanel.setAttribute('aria-labelledby', `${id}-style-tab`);
  const styleHint = element('div', 'moss-part-hint'), styleChoices = element('div', 'moss-style-choices'), styleMap = new Map();
  styleChoices.setAttribute('role', 'radiogroup'); styleChoices.setAttribute('aria-labelledby', `${id}-style-tab`);
  for (const style of STYLE_IDS) {
    const choice = element('label', 'moss-style-choice'), input = element('input'), text = element('span'), label = element('strong'), hint = element('span');
    input.type = 'radio'; input.name = `${id}-style`; input.value = style; input.dataset.style = style;
    text.append(label, hint); choice.append(input, text); styleChoices.append(choice); styleMap.set(style, {choice, input, label, hint});
    listen(input, 'change', () => { if (input.checked) act(() => writeStyle(style)); });
  }
  stylePanel.append(styleHint, styleChoices);
  const footer = element('div', 'moss-footer');
  const settingsPanel = element('div', 'moss-settings-panel'); settingsPanel.id = `${id}-settings-panel`;
  settingsPanel.setAttribute('role', 'tabpanel'); settingsPanel.setAttribute('aria-labelledby', `${id}-settings-tab`);
  const jsonDetails = element('details', 'moss-json-editor'), summary = element('summary'), rawInput = element('textarea'), rawHint = element('p'), apply = button('moss-apply'); rawInput.spellcheck = false; rawInput.setAttribute('aria-label', 'state_json');
  listen(apply, 'click', () => act(() => {
    controller.applyRaw(rawInput.value);
    // A valid JSON replacement owns these values, even when the saved JSON is unchanged.
    drafts.clear(); partDrafts.clear();  partComposing = false;
  })); jsonDetails.append(summary, rawInput, rawHint, apply);
  settingsPanel.append(modeHint, warning, footer, jsonDetails);
  root.append(header, cards, qualityBox, controls, metrics, errorBox, retry);
  root.append(previewHead, stage, partPanel, settingsPanel);
  if (reference) root.append(stylePanel);
  // Keep node dragging out of text controls, but let browser keyboard accessibility work.
  listen(root, 'pointerdown', event => event.stopPropagation());
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fitSheet()) : null;
  resizeObserver?.observe(stage);
  function act(fn) { if (external) return; try { localError = null; fn(); } catch (error) { localError = error; } render(); }
  function commitDraft(field) {
    const draft = drafts.get(field); if (!draft) return;
    try {
      // Remove only this draft before the synchronous commit rerenders the UI.
      drafts.delete(field); controller.setSize(field, draft.text);
    } catch (error) { drafts.set(field, {...draft, error}); }
    render();
  }
  function commitPart() {
    const text = partInput.value;
    try {
      partDrafts.set(selectedPart, {text, error: null}); controller.setPartPrompt(selectedPart, text);
    } catch (error) { partDrafts.set(selectedPart, {text, error}); }
    renderParts();
  }
  function renderParts() {
    const state = controller.state, prompts = state?.part_prompts ?? {}, draft = partDrafts.get(selectedPart);
    tabs.setAttribute('aria-label', t.diagram);
    for (const [name, tab] of tabMap) {
      tab.textContent = name === 'layout' ? t.layoutTab : name === 'style' ? t.styleTab : name === 'settings' ? t.settingsTab : `${t.partsTab}${Object.keys(prompts).length ? ` (${Object.keys(prompts).length})` : ''}`;
      tab.setAttribute('aria-selected', String(name === activeTab)); tab.tabIndex = name === activeTab ? 0 : -1;
    }
    stage.hidden = activeTab !== 'layout'; partPanel.hidden = activeTab !== 'parts'; stylePanel.hidden = activeTab !== 'style'; settingsPanel.hidden = activeTab !== 'settings';
    previewTag.textContent = activeTab === 'layout' ? t.diagram : ''; previewTag.title = t.caveat;
    const selectedStyle = readStyle();
    styleStatus.hidden = !reference || selectedStyle === 'none'; styleBadge.textContent = `${t.style}：${t[`style_${selectedStyle}`] ?? selectedStyle}`;
    styleBadge.title = styleBadge.textContent; clearStyle.textContent = t.clearStyle; clearStyle.disabled = !writeStyle;
    styleHint.textContent = writeStyle ? t.styleHint : t.styleUnavailable;
    for (const [style, item] of styleMap) {
      item.input.checked = style === selectedStyle; item.input.disabled = !state || !writeStyle;
      item.choice.classList.toggle('moss-style-selected', item.input.checked);
      item.label.textContent = t[`style_${style}`]; item.hint.textContent = t[`style_${style}_tip`];
    }
    partLabel.textContent = t.part; partSelect.disabled = !state; partSelect.value = selectedPart;
    for (const option of partSelect.options) option.textContent = `${prompts[option.value] ? '● ' : ''}${t[`${option.value}_part`]}`;
    partCount.textContent = `${Object.keys(prompts).length} ${t.partCount}`;
    promptLabel.textContent = `${t[`${selectedPart}_part`]} · ${t.partPrompt}`;
    partHint.textContent = t.partHint; partInput.disabled = !state; partInput.placeholder = t.partPlaceholder;
    const value = draft?.text ?? prompts[selectedPart] ?? '';
    if (partInput.value !== value) partInput.value = value;
    partInput.setAttribute('aria-invalid', String(Boolean(draft?.error)));
    partNote.textContent = draft?.error ? `${errorText(draft.error, language)} ${t.draft}` : t.partSaved;
    partNote.classList.toggle('moss-part-invalid', Boolean(draft?.error));
    partLength.textContent = `${partInput.value.length} / ${PART_PROMPT_MAX_LENGTH}`;
  }
  function renderRoles() {
    const ja = language === 'ja';
    const labels = ja ? {clothing_type: '衣装の型', hand_state: '手', footwear_state: '足・履物'} : {clothing_type: 'Clothing shape', hand_state: 'Hands', footwear_state: 'Feet'};
    const options = ja ? {auto: 'Auto', pants: 'パンツ', skirt_robe: 'スカート・ローブ', bare: '素手', gloved: 'グローブ', shod: '靴あり', unshod: '靴なし'} : {auto: 'Auto', pants: 'Pants', skirt_robe: 'Skirt / robe', bare: 'Bare hands', gloved: 'Gloves', shod: 'Footwear on', unshod: 'Footwear off'};
    const tips = ja ? {
      clothing_type: '入力した衣装説明に従う、またはパンツ／スカート・ローブを指定。全身と衣装の前後に適用します。',
      hand_state: '説明に従う／素手／グローブ。手の詳細と全身ビューに適用します。',
      footwear_state: '説明に従う／靴あり／靴なし。足の詳細と全身ビューに適用。靴なしでも靴下・タイツは維持します。',
    } : {
      clothing_type: 'Follow the description shape or choose pants / skirt or robe. Applies to full-body and front/back outfit views.',
      hand_state: 'Follow the description, bare hands or gloves. Applies to hand details and full-body views.',
      footwear_state: 'Follow the description, footwear on or off. Applies to foot details and full-body views. Footwear off preserves compatible socks and tights.',
    };
    for (const [field, item] of qualityMap) {
      item.label.textContent = labels[field]; item.select.disabled = !controller.state;
      item.select.title = tips[field];
      item.select.value = controller.state?.appearance[field] ?? DEFAULTS[field];
      for (const option of item.select.options) option.textContent = options[option.value];
    }
  }
  function renderFields() {
    const state = controller.state;
    budgetLabel.textContent=t.pixelBudget;budget.value=String(state?.size.pixel_budget??2000000);budget.disabled=!state||state.size.mode!=='auto';
    for (const [field, item] of fields) {
      const draft = drafts.get(field), active = state && (field === 'body_height' ? state.size.mode === 'auto' : state.size.mode === 'manual');
      item.label.textContent = t[item.labelKey]; item.input.disabled = !active;
      item.label.title = field === 'body_height' ? t.autoHint : t.manualHint;
      const autoDimension = state?.size.mode === 'auto' && field !== 'body_height';
      const displayValue = autoDimension ? (displayOutput() ? String(field === 'manual_width' ? displayOutput().width : displayOutput().height) : '—') : state ? String(state.size[field]) : '';
      item.input.value = draft ? draft.text : displayValue;
      item.input.title = autoDimension && !controller.isCurrentPreview ? t.updating : ''; 
      item.input.setAttribute('aria-invalid', String(Boolean(draft?.error)));
      item.message.textContent = draft ? `${draft.error ? `${errorText(draft.error, language)} ` : ''}${t.draft}` : '';
      item.wrap.classList.toggle('moss-has-draft', Boolean(draft));
      if (item.choices) {
        const showCustom = Boolean(state && (customHeight || !HEIGHT_PRESETS.includes(state.size.body_height)));
        item.choices.disabled = !active; item.choices.title = t.bodyHeight;
        item.choices.value = showCustom ? 'custom' : state ? String(state.size.body_height) : '';
        item.custom.textContent = t.customHeightChoice;
        item.input.hidden = !showCustom; item.input.disabled = !active || !showCustom;
        item.input.setAttribute('aria-label', t.customHeight);
      }
    }
  }
  function fitSheet() {
    const p = controller.preview; if (!p || !stage.clientWidth) return;
    const availableW = Math.max(1, stage.clientWidth - 30), availableH = Math.max(1, stage.clientHeight - 28);
    const scale = Math.min(availableW / p.width, availableH / p.height);
    canvas.style.width = `${p.width * scale}px`; canvas.style.height = `${p.height * scale}px`;
    canvas.style.setProperty('--moss-frame-width', `${Math.max(1, Math.floor((Math.min(p.width, p.height) + 128) / 256)) * scale}px`);
  }
  function renderPreview() {
    const p = controller.preview, valid = !external && controller.isCurrentPreview && Boolean(controller.state);
    canvas.hidden = !valid; empty.hidden = valid;
    empty.textContent = external ? t.external : controller.error ? t.invalid : controller.previewError ? t.unavailable : t.empty;
    const key = valid ? JSON.stringify(p.layout_plan) : null;
    if (key !== lastPreviewKey) {
      canvas.replaceChildren(); lastPreviewKey = key;
      if (valid) for (const panel of p.layout_plan.panels) {
        const box = element('div','moss-panel'); box.dataset.panel = panel.id;
        const [x0,y0,x1,y1] = panel.bbox_px;
        Object.assign(box.style,{left:`${x0/p.width*100}%`,top:`${y0/p.height*100}%`,width:`${(x1-x0)/p.width*100}%`,height:`${(y1-y0)/p.height*100}%`});
        box.append(createArtwork(panel.id,`${id}-${panel.id}`,{mirror:MULTI_MIRRORED_VIEWS.includes(panel.id)}));
        canvas.append(box);
      }
    }
    stage.setAttribute('aria-busy',String(controller.pending)); fitSheet();
  }
  function flushDrafts() {
    if (external) return;
    if (partComposing) throw new StateError('composition');


    for (const [field, draft] of [...drafts]) {
      drafts.delete(field);
      try { controller.setSize(field, draft.text); }
      catch (error) { drafts.set(field, {...draft, error}); render(); fields.get(field).input.focus(); throw error; }
    }
    for (const [part, draft] of partDrafts) if (draft.error) { selectedPart = part; activeTab = 'parts'; render(); partInput.focus(); throw draft.error; }
    render();
  }
  function render(reason) {
    if (disposed) return;
    for (const control of root.querySelectorAll('input,textarea,select,button')) control.disabled = false;
    if (reason === 'restore') { drafts.clear(); partDrafts.clear();  partComposing = false; customHeight = false; localError = null; }
    t = translations[language] ?? EN; root.lang = language;
    if (reason === 'commit' || reason === 'restore') token = null;


    const state = controller.state, current = controller.isCurrentPreview;
    if (controller.error) activeTab = 'settings';
    intro.textContent = t.intro; count.textContent = `${state?.views.length ?? 0} / ${viewIds.length} ${t.selected}`;
    for (const [view, {card, label}] of cardMap) {
      card.setAttribute('aria-pressed', String(Boolean(state?.views.includes(view)))); card.disabled = !state;
      const tip = multiReference && view === 'hands' ? t.multiHandsTip : multiReference && view.startsWith('clothing_') ? t.garmentTip : multiReference && multiTips[language]?.[view] || t[`${view}_tip`];
      card.title = tip; card.setAttribute('aria-label', `${t[view]}: ${tip}`); label.textContent = t[view];
    }
    presetLabel.textContent = t.preset; preset.disabled = !state; preset.value = Object.entries(presets).find(([, views]) => views.join() === state?.views.join())?.[0] ?? 'custom';
    for (const option of preset.options) option.textContent = multiReference && option.value === 'detail' ? t.multiDetail : t[option.value];
    auto.textContent = t.auto; manual.textContent = t.manual;
    auto.disabled = !state; manual.disabled = !state || (state.size.mode === 'auto' && !current);
    auto.setAttribute('aria-pressed', String(state?.size.mode === 'auto')); manual.setAttribute('aria-pressed', String(state?.size.mode === 'manual'));
    sizeLabel.textContent = t.size;
    modeHint.textContent = state?.size.mode === 'manual' ? t.manualHint : t.autoHint;
    modeGroup.title = modeHint.textContent;
    renderFields(); renderParts(); renderRoles();
    const p = controller.preview, actual = displayOutput(), displayP = actual && state;
    dimensions.textContent = displayP ? `${actual.width.toLocaleString('en-US')} × ${actual.height.toLocaleString('en-US')}` : '— × —';
    const pixelCount = displayP ? actual.width * actual.height : 0;
    pixels.textContent = displayP ? `${(pixelCount / 1e6).toFixed(2)} MP` : '';
    pixels.title = displayP ? `${pixelCount.toLocaleString(language)} ${t.pixels}` : '';
    badge.textContent = t.dense; badge.hidden = !displayP || !(p?.warnings?.length || (state?.views.length ?? 0) >= 8);
    warning.textContent = `${t.resolutionWarning}${p?.layout_plan ? ` (${t.bodyHeight}: ${p.layout_plan.requested_body_height} → ${Number(p.layout_plan.actual_body_height.toFixed(2))})` : ''}`; warning.hidden = badge.hidden;
    badge.title = warning.textContent; badge.setAttribute('aria-label', warning.textContent);
    metrics.classList.toggle('moss-stale', Boolean(displayP && !current));
    status.textContent = controller.pending ? (displayP ? t.stale : t.pending) : controller.previewError ? `${t.unavailable}${displayP ? ` · ${t.previous}` : ''}` : compatibilityWarning ? t.undoWarning : t.committed;
    const problem = controller.error || localError || controller.previewError;
    errorBox.textContent = problem ? `${controller.error ? `${t.invalid} ` : ''}${errorText(problem, language)}` : ''; errorBox.hidden = !problem;
    retry.textContent = t.retry; retry.hidden = !controller.previewError || !state;
    footer.textContent = t.caveat;
    summary.textContent = t.editJSON; rawHint.textContent = t.rawHint; apply.textContent = t.apply;
    jsonDetails.hidden = false;
    if (lastRaw !== controller.raw) { rawInput.value = typeof controller.raw === 'string' ? controller.raw : String(controller.raw); lastRaw = controller.raw; }
    if (controller.error) jsonDetails.open = true;
    renderPreview();
    if (external) { status.textContent = t.external; for (const control of root.querySelectorAll('input,textarea,select,button:not([role=tab])')) control.disabled = true; }
    else if (token && current && token.input_hash === p.input_hash) status.textContent += ` · ${t.lastTokens}: ${token.positive_tokens ?? '—'}`;
    status.title = status.textContent;
  }
  render();
  return {root, render, flushDrafts, setExternal(value) { if (external !== value) { external = value; token = null; render(); } }, setTokenStatus(value) { token = value; render(); }, invalidateTokens() { if (token) { token = null; render(); } }, setLocale(value) { language = value === 'ja' ? 'ja' : 'en'; render('locale'); }, dispose() { disposed = true; abort.abort(); resizeObserver?.disconnect(); drafts.clear(); partDrafts.clear(); root.remove(); }, controller};
}
