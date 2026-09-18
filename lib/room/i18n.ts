import type { ControlDefinition, EngineStatus, RoomLoadingStage } from './types';

export type RoomLanguage = 'en' | 'zh';
export const DEFAULT_LANGUAGE: RoomLanguage = 'en';
export const LANGUAGE_STORAGE_KEY = 'gamer-room.display-language';
export const resolveLanguage = (value: unknown): RoomLanguage => value === 'zh' ? 'zh' : DEFAULT_LANGUAGE;

const english = {
  title: "Vega's Gaming Room", pageTitle: "Vega's Gaming Room | Interactive 3D Room", language: 'Display language',
  eyebrow: 'INTERACTIVE 3D ROOM', kicker: 'Pink & white · Explore · Interact',
  intro: 'Step inside. Make the room your own.',
  introCopy: 'Drag to explore. Adjust the furniture, change the wall art, or click a book to discover its story.',
  enter: 'Explore the room', preparing: 'Getting ready', retry: 'Retry',
  webglError: 'Live 3D is unavailable on this device. You can still view the room preview.',
  moduleError: 'Live 3D could not load. You can still view the room preview.',
  summary: 'Interactive features', interactionCount: 'interactive mechanisms', interactionHint: 'Click a device to fine-tune it',
  selectedDevice: 'SELECTED DEVICE', closePanel: 'Close controls', panel: 'controls',
  monitorHint: 'The arms fold in when side by side. Turning inward unfolds the arms; outward trim turns only the screen. Left + and right − turn inward. Negative tilt looks down; positive looks up.',
  panelHint: 'Drag a slider to fine-tune, or click the device again to reverse.',
  resetDevice: 'Reset to defaults', resetDeviceHint: 'Reset only this device; keep the other devices and camera unchanged.',
  interactivePart: 'Interactive part', sceneActions: 'Scene actions', orbitHint: 'Drag to orbit · Scroll to zoom',
  demo: 'Demo', resetRoom: 'Reset room', fullscreen: 'Fullscreen', deviceDock: 'Interactive devices',
  sceneLabel: 'Interactive gaming room: drag to orbit and click a device to adjust it', up: 'Up', down: 'Down',
  highQuality: 'High quality', lightweight: 'Lightweight', preview: 'Interactive preview',
  artwork: {
    open: 'Change wall art', title: 'Wall art', close: 'Close wall art', choose: 'Choose an image',
    privacy: 'PNG, JPG or WebP · up to 10 MB. Used only in this browser tab; never uploaded. Reloading restores the original.',
    original: 'Original artwork', reset: 'Restore original artwork', loading: 'Applying image…',
    fit: 'Image fit', contain: 'Show whole image', cover: 'Fill frame (crop edges)',
    errors: { type: 'Choose a PNG, JPG or WebP image.', size: 'Choose a non-empty image up to 10 MB.',
      decode: 'This image could not be read. Try another file.', dimensions: 'Use an image up to 8,192 px per side and 32 megapixels.',
      unavailable: 'The replaceable wall art is not available in this scene.' },
  },
  groups: { cabinet: 'Storage cabinet', desk: 'Sit-stand desk', chair: 'Gaming chair', microphone: 'Microphone arm', monitors: 'Dual monitors' },
  controls: {
    'cabinet.drawer.1': 'Drawer 1', 'cabinet.drawer.2': 'Drawer 2', 'cabinet.drawer.3': 'Drawer 3', 'cabinet.drawer.4': 'Drawer 4',
    'cabinet.door': 'Cabinet door', 'desk.lift': 'Desk height', 'chair.swivel': 'Chair swivel',
    'chair.moveX': 'Move left / right', 'chair.moveY': 'Move forward / back',
    'chair.headrest': 'Headrest removal', 'chair.lumbar': 'Lumbar cushion removal',
    'microphone.fold': 'Arm folding', 'microphone.yaw': 'Base rotation',
    'monitors.face': 'Inward rotation', 'monitors.leftTrim': 'Left swivel trim', 'monitors.rightTrim': 'Right swivel trim',
    'monitors.leftTilt': 'Left tilt', 'monitors.rightTilt': 'Right tilt',
  },
  loading: {
    waking: 'Waking up the room', manifest: 'Reading the scene manifest', desktop: 'Loading the high-quality model',
    low: 'Loading the lightweight model', assets: 'Loading the room and textures', ready: 'Blender scene ready',
    fallbackReady: 'Interactive preview ready', webglError: 'Live 3D could not start', moduleError: 'Live 3D could not load',
  } satisfies Record<RoomLoadingStage, string>,
};

export const ROOM_COPY = {
  en: english,
  zh: {
    title: "Vega's Gaming Room", pageTitle: "Vega's Gaming Room | Interactive 3D Room", language: '展示语言',
    eyebrow: '互动 3D 房间', kicker: '粉白科幻 · 可环绕 · 可交互',
    intro: '走进房间，亲手摆弄每一件设备。', introCopy: '拖动视角探索空间，点击家具调整它、点击画框换图，也可以点选一本书了解它的故事。',
    enter: '开始探索', preparing: '正在准备', retry: '点击重试',
    webglError: '此设备暂时无法启动实时 3D，仍可查看房间预览。', moduleError: '实时 3D 模块加载失败，仍可查看房间预览。',
    summary: '互动摘要', interactionCount: '组互动机构', interactionHint: '点击后可精细调节',
    selectedDevice: '当前设备', closePanel: '关闭控制面板', panel: '控制面板',
    monitorHint: '并列时支架收拢；向内转动先展开机械臂，向外微调只转屏幕。左屏正值、右屏负值为向内。俯仰负值向下，正值向上。',
    panelHint: '拖动滑杆精调，或再次点击设备反向播放。',
    resetDevice: '恢复默认', resetDeviceHint: '仅恢复当前设备，不影响其他设备和视角。',
    interactivePart: '可互动部件', sceneActions: '场景操作', orbitHint: '拖动环绕 · 滚轮缩放',
    demo: '演示', resetRoom: '全部复位', fullscreen: '全屏', deviceDock: '互动设备快捷入口',
    sceneLabel: '可环绕、可点击的电竞房 3D 场景', up: '仰', down: '俯',
    highQuality: 'Blender 高质量', lightweight: 'Blender 轻量', preview: '互动预览',
    artwork: {
      open: '更换挂画', title: '墙面挂画', close: '关闭挂画设置', choose: '选择图片',
      privacy: '支持 PNG、JPG、WebP，最大 10 MB。仅在当前浏览器标签页使用，不上传；刷新后恢复原图。',
      original: '原始画面', reset: '恢复原图', loading: '正在应用图片…',
      fit: '图片显示方式', contain: '完整显示', cover: '铺满画框（裁切边缘）',
      errors: { type: '请选择 PNG、JPG 或 WebP 图片。', size: '请选择非空且不超过 10 MB 的图片。',
        decode: '无法读取这张图片，请换一个文件。', dimensions: '图片单边不能超过 8192 像素，总像素不能超过 3200 万。',
        unavailable: '当前场景暂不支持替换挂画。' },
    },
    groups: { cabinet: '收纳柜', desk: '升降桌', chair: '电竞椅', microphone: '话筒臂', monitors: '双屏' },
    controls: {
      'cabinet.drawer.1': '抽屉 1', 'cabinet.drawer.2': '抽屉 2', 'cabinet.drawer.3': '抽屉 3', 'cabinet.drawer.4': '抽屉 4',
      'cabinet.door': '柜门', 'desk.lift': '桌面高度', 'chair.swivel': '椅身旋转', 'chair.headrest': '头枕拆装', 'chair.lumbar': '腰枕拆装',
      'chair.moveX': '左右移动', 'chair.moveY': '前后移动',
      'microphone.fold': '折叠程度', 'microphone.yaw': '底座转向', 'monitors.face': '双屏夹角',
      'monitors.leftTrim': '左屏微调', 'monitors.rightTrim': '右屏微调', 'monitors.leftTilt': '左屏俯仰', 'monitors.rightTilt': '右屏俯仰',
    },
    loading: { waking: '正在唤醒房间', manifest: '读取 Blender 场景清单', desktop: '加载桌面高质量模型', low: '加载轻量模型',
      assets: '载入房间模型与压缩纹理', ready: 'Blender 场景已就绪', fallbackReady: '互动预览已就绪',
      webglError: '实时 3D 启动失败', moduleError: '实时 3D 加载失败' },
  } satisfies typeof english,
};

export function controlLabel(id: string, language: RoomLanguage) {
  const copy = ROOM_COPY[language];
  return copy.controls[id as keyof typeof copy.controls] ?? copy.interactivePart;
}

export function groupLabel(id: string, language: RoomLanguage) {
  const copy = ROOM_COPY[language];
  return copy.groups[id.split('.')[0] as keyof typeof copy.groups] ?? copy.interactivePart;
}

export function statusLabel(status: EngineStatus | null, language: RoomLanguage) {
  const copy = ROOM_COPY[language];
  return !status ? copy.loading.waking : !status.usingBlenderAsset ? copy.preview
    : status.variant === 'desktop' ? copy.highQuality : copy.lightweight;
}

export function formatControlValue(control: ControlDefinition, value: number, language: RoomLanguage) {
  if (control.id === 'chair.moveX' || control.id === 'chair.moveY') return `${Math.round(value * 100)} cm`;
  if (control.id === 'desk.lift') return `${Math.round(78 + value * 40)} cm`;
  if (control.id === 'monitors.face') return `${Math.round(value * 90)}°`;
  if (control.id.endsWith('Tilt')) return value === 0 ? '0°'
    : `${value > 0 ? ROOM_COPY[language].up : ROOM_COPY[language].down} ${Math.round(Math.abs(value) * 10) / 10}°`;
  if (control.unit === '%') return `${Math.round(value * 100)}%`;
  if (control.unit === '°') return `${Math.round(value * 10) / 10}°`;
  return String(Math.round(value * 100) / 100);
}
