export type ShortcutAction =
  | 'undo'
  | 'redo'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'deleteSelection'
  | 'toolSelect'
  | 'toolHand'
  | 'toolEraser'
  | 'toolDraw'
  | 'toolRectangle'
  | 'toolEllipse'
  | 'toolArrow'
  | 'toolLine'
  | 'toolText'
  | 'toolImage'
  | 'zoomIn'
  | 'zoomOut'
  | 'openSettings'
  | 'toggleTeleprompter'
  | 'recordingEnterPreparing'
  | 'recordingCancelPreparing'
  | 'recordingStart'
  | 'recordingPause'
  | 'recordingResume'
  | 'recordingStop'
  | 'recordingPrevSlide'
  | 'recordingNextSlide'
  | 'palette1'
  | 'palette2'
  | 'palette3'
  | 'palette4'
  | 'palette5'
  | 'palette6'
  | 'palette7'
  | 'palette8'
  | 'palette9';

export type ShortcutMap = Record<ShortcutAction, string>;

type ShortcutRule = {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
};

const SHORTCUT_STORAGE_KEY = 'canvascast.shortcuts.v1';

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  undo: 'Mod+Z',
  redo: 'Mod+Y',
  copy: 'Mod+C',
  paste: 'Mod+V',
  duplicate: 'Mod+D',
  deleteSelection: 'Delete|Backspace',
  toolSelect: 'V',
  toolHand: 'H',
  toolEraser: 'E',
  toolDraw: 'P',
  toolRectangle: 'R',
  toolEllipse: 'O',
  toolArrow: 'A',
  toolLine: 'L',
  toolText: 'T',
  toolImage: 'I',
  zoomIn: 'Mod+=',
  zoomOut: 'Mod+-',
  openSettings: '',
  toggleTeleprompter: '',
  recordingEnterPreparing: '',
  recordingCancelPreparing: '',
  recordingStart: '',
  recordingPause: '',
  recordingResume: '',
  recordingStop: '',
  recordingPrevSlide: 'ArrowLeft',
  recordingNextSlide: 'ArrowRight',
  palette1: '1',
  palette2: '2',
  palette3: '3',
  palette4: '4',
  palette5: '5',
  palette6: '6',
  palette7: '7',
  palette8: '8',
  palette9: '9',
};

export const PALETTE_SHORTCUT_COLORS: string[] = [
  '#111827',
  '#2563eb',
  '#dc2626',
  '#059669',
  '#7c3aed',
  '#ea580c',
  '#6b7280',
  '#ffffff',
  '#facc15',
];

export type ShortcutSection = {
  id: string;
  label: string;
  actions: Array<{ action: ShortcutAction; label: string }>;
};

export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    id: 'edit',
    label: '编辑',
    actions: [
      { action: 'undo', label: '撤销' },
      { action: 'redo', label: '重做' },
      { action: 'copy', label: '复制选中对象' },
      { action: 'paste', label: '粘贴选中对象' },
      { action: 'duplicate', label: '复制并偏移选中对象' },
      { action: 'deleteSelection', label: '删除选中对象' },
    ],
  },
  {
    id: 'tools',
    label: '工具',
    actions: [
      { action: 'toolSelect', label: '选择工具' },
      { action: 'toolHand', label: '平移工具' },
      { action: 'toolEraser', label: '橡皮工具' },
      { action: 'toolDraw', label: '画笔工具' },
      { action: 'toolRectangle', label: '矩形工具' },
      { action: 'toolEllipse', label: '圆形工具' },
      { action: 'toolArrow', label: '箭头工具' },
      { action: 'toolLine', label: '直线工具' },
      { action: 'toolText', label: '文本工具' },
      { action: 'toolImage', label: '插图工具' },
    ],
  },
  {
    id: 'palette',
    label: '调色板（1-9）',
    actions: [
      { action: 'palette1', label: '调色板颜色 1' },
      { action: 'palette2', label: '调色板颜色 2' },
      { action: 'palette3', label: '调色板颜色 3' },
      { action: 'palette4', label: '调色板颜色 4' },
      { action: 'palette5', label: '调色板颜色 5' },
      { action: 'palette6', label: '调色板颜色 6' },
      { action: 'palette7', label: '调色板颜色 7' },
      { action: 'palette8', label: '调色板颜色 8' },
      { action: 'palette9', label: '调色板颜色 9' },
    ],
  },
  {
    id: 'view',
    label: '视图',
    actions: [
      { action: 'zoomIn', label: '放大' },
      { action: 'zoomOut', label: '缩小' },
    ],
  },
  {
    id: 'recording',
    label: '录制',
    actions: [
      { action: 'openSettings', label: '打开录制设置' },
      { action: 'toggleTeleprompter', label: '开关提词器' },
      { action: 'recordingEnterPreparing', label: '进入录制准备' },
      { action: 'recordingCancelPreparing', label: '取消录制准备' },
      { action: 'recordingStart', label: '开始录制' },
      { action: 'recordingPause', label: '暂停录制' },
      { action: 'recordingResume', label: '继续录制' },
      { action: 'recordingStop', label: '停止录制' },
      { action: 'recordingPrevSlide', label: '录制时上一张幻灯片' },
      { action: 'recordingNextSlide', label: '录制时下一张幻灯片' },
    ],
  },
];

export const TOOL_SHORTCUT_ACTIONS = {
  select: 'toolSelect',
  hand: 'toolHand',
  eraser: 'toolEraser',
  draw: 'toolDraw',
  rectangle: 'toolRectangle',
  ellipse: 'toolEllipse',
  arrow: 'toolArrow',
  line: 'toolLine',
  text: 'toolText',
  image: 'toolImage',
} as const satisfies Partial<Record<string, ShortcutAction>>;

export function formatShortcutHint(binding: string | undefined) {
  if (!binding) {
    return '';
  }

  const primary = (binding.split('|')[0] ?? '').trim();
  if (!primary) {
    return '';
  }

  const tokens = primary.split('+').map((token) => token.trim()).filter(Boolean);
  const rendered = tokens.map((token) => formatShortcutTokenForDisplay(token));
  const isApple = isApplePlatform();

  if (isApple && rendered.length === 2 && rendered[0] === '⌘' && rendered[1].length <= 2) {
    return `[${rendered[0]}${rendered[1]}]`;
  }

  return `[${rendered.join('+')}]`;
}

function formatShortcutTokenForDisplay(token: string) {
  if (token === 'Mod') {
    return isApplePlatform() ? '⌘' : 'Ctrl';
  }
  if (token === 'Shift') {
    return 'Shift';
  }
  if (token === 'Alt') {
    return isApplePlatform() ? '⌥' : 'Alt';
  }
  if (token === 'Delete') {
    return 'Del';
  }
  if (token === 'Backspace') {
    return '⌫';
  }
  if (token === 'ArrowLeft') {
    return '←';
  }
  if (token === 'ArrowRight') {
    return '→';
  }
  if (token.length === 1) {
    return token.toUpperCase();
  }

  return token;
}

function isApplePlatform() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || navigator.userAgent.includes('Mac');
}

const SHORTCUT_KEYS = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[];

export function loadShortcutSettings(): ShortcutMap {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_SHORTCUTS };
  }

  try {
    const rawValue = window.localStorage.getItem(SHORTCUT_STORAGE_KEY);
    if (!rawValue) {
      return { ...DEFAULT_SHORTCUTS };
    }

    const parsed = JSON.parse(rawValue) as Partial<Record<ShortcutAction, unknown>>;
    const merged: ShortcutMap = { ...DEFAULT_SHORTCUTS };
    for (const key of SHORTCUT_KEYS) {
      const value = parsed[key];
      if (typeof value === 'string') {
        merged[key] = value.trim();
      }
    }

    return merged;
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function saveShortcutSettings(settings: ShortcutMap) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors and continue with in-memory state.
  }
}

export function matchShortcut(event: KeyboardEvent, binding: string | undefined) {
  if (!binding || binding.trim().length === 0) {
    return false;
  }

  const rules = parseShortcutBinding(binding);
  if (rules.length === 0) {
    return false;
  }

  return rules.some((rule) => isShortcutRuleMatch(event, rule));
}

function parseShortcutBinding(binding: string): ShortcutRule[] {
  return binding
    .split('|')
    .map((part) => parseSingleShortcut(part))
    .filter((rule): rule is ShortcutRule => rule !== null);
}

function parseSingleShortcut(binding: string): ShortcutRule | null {
  const tokens = binding
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  let mod = false;
  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  let key = '';

  for (const token of tokens) {
    const normalized = token.toLowerCase();
    if (normalized === 'mod') {
      mod = true;
      continue;
    }
    if (normalized === 'ctrl' || normalized === 'control') {
      ctrl = true;
      continue;
    }
    if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') {
      meta = true;
      continue;
    }
    if (normalized === 'shift') {
      shift = true;
      continue;
    }
    if (normalized === 'alt' || normalized === 'option') {
      alt = true;
      continue;
    }

    key = normalizeShortcutToken(token);
  }

  return key ? { mod, ctrl, meta, shift, alt, key } : null;
}

function isShortcutRuleMatch(event: KeyboardEvent, rule: ShortcutRule) {
  const hasMod = event.ctrlKey || event.metaKey;
  if (rule.mod) {
    if (!hasMod) {
      return false;
    }
  } else {
    if (rule.ctrl !== event.ctrlKey) {
      return false;
    }
    if (rule.meta !== event.metaKey) {
      return false;
    }
  }
  if (rule.shift !== event.shiftKey) {
    return false;
  }
  if (rule.alt !== event.altKey) {
    return false;
  }

  return doesKeyMatch(event.key, rule.key);
}

function doesKeyMatch(eventKey: string, expectedKey: string) {
  const normalizedEventKey = normalizeShortcutToken(eventKey);
  if (normalizedEventKey === expectedKey) {
    return true;
  }

  if (expectedKey === '=' && (normalizedEventKey === '+' || normalizedEventKey === '=')) {
    return true;
  }

  if (expectedKey === '+' && (normalizedEventKey === '+' || normalizedEventKey === '=')) {
    return true;
  }

  if (expectedKey === '-' && (normalizedEventKey === '-' || normalizedEventKey === '_')) {
    return true;
  }

  return false;
}

function normalizeShortcutToken(token: string) {
  if (token.length === 1) {
    return token.toLowerCase();
  }

  const normalized = token.toLowerCase();
  if (normalized === ' ') {
    return 'space';
  }

  if (normalized === 'spacebar') {
    return 'space';
  }

  return normalized;
}
