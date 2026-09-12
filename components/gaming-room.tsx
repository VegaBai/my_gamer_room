'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CONTROLS } from '../lib/room/default-controls';
import type { RoomEngine } from '../lib/room/room-engine';
import type { ControlDefinition, EngineStatus } from '../lib/room/types';

interface HoverState {
  id: string;
  x: number;
  y: number;
}

const CONTROL_BY_ID = new Map(DEFAULT_CONTROLS.map((control) => [control.id, control]));

export default function GamingRoom() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RoomEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('正在唤醒房间');
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(DEFAULT_CONTROLS.map((control) => [control.id, control.default])),
  );
  const [engineError, setEngineError] = useState<string | null>(null);

  const selected = selectedId ? CONTROL_BY_ID.get(selectedId) ?? null : null;
  const groupControls = useMemo(
    () => selected ? DEFAULT_CONTROLS.filter((control) => control.group === selected.group) : [],
    [selected],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let engine: RoomEngine | null = null;
    void import('../lib/room/room-engine').then(({ RoomEngine: Engine }) => {
      if (cancelled) return;
      try {
        engine = new Engine(host, {
          onProgress: (next, message) => {
            setProgress(next);
            setLoadingMessage(message);
          },
          onReady: (nextStatus) => {
            setReady(true);
            setStatus(nextStatus);
          },
          onSelect: setSelectedId,
          onHover: (id, x, y) => setHover(id ? { id, x, y } : null),
          onValues: (next) => setValues({ ...next }),
          onUserInput: () => undefined,
        });
        engineRef.current = engine;
      } catch (error) {
        console.error('[room] WebGL initialization failed.', error);
        setEngineError('此设备暂时无法启动实时 3D，仍可查看房间预览。');
        setLoadingMessage('实时 3D 启动失败');
      }
    }).catch((error) => {
      console.error('[room] Three.js module failed to load.', error);
      setEngineError('实时 3D 模块加载失败，仍可查看房间预览。');
      setLoadingMessage('实时 3D 加载失败');
    });
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null);
      if (event.key.toLowerCase() === 'r' && !(event.target instanceof HTMLInputElement)) {
        engineRef.current?.reset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectFromList = (control: ControlDefinition) => {
    setSelectedId(control.id);
    engineRef.current?.selectAndToggle(control.id);
  };

  return (
    <main className={`room-app ${entered ? 'is-entered' : ''}`}>
      <div ref={hostRef} className="canvas-host" />

      <div className="poster-layer" aria-hidden={entered}>
        <div className="room-poster" />
        <div className="poster-wash" />
        <div className="poster-vignette" />
      </div>

      <header className="room-header">
        <div>
          <p className="eyebrow">INTERACTIVE 3D ROOM</p>
          <h1>我的电竞房间</h1>
        </div>
        <span className="preview-pill">
          <i /> {status?.message ?? '场景加载中'}
        </span>
      </header>

      {!entered && (
        <section className="intro-card" aria-labelledby="room-intro-title">
          <p className="intro-kicker">粉白科幻 · 可环绕 · 可交互</p>
          <h2 id="room-intro-title">走进房间，亲手摆弄每一件设备。</h2>
          <p className="intro-copy">
            拖动视角探索空间，点击设备控制升降桌、屏幕、话筒、椅子和收纳柜。
          </p>
          <div className="load-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
          <p className="load-copy" role="status">{loadingMessage} · {Math.round(progress)}%</p>
          <button
            className="enter-button"
            type="button"
            disabled={!ready}
            onClick={() => setEntered(true)}
          >
            <span>{ready ? '开始探索' : '正在准备'}</span>
            <b aria-hidden="true">→</b>
          </button>
          {engineError && (
            <button className="retry-button" type="button" onClick={() => window.location.reload()}>
              {engineError} 点击重试
            </button>
          )}
        </section>
      )}

      {!entered && (
        <aside className="parts-card" aria-label="互动摘要">
          <span className="parts-count">11</span>
          <div><strong>组互动机构</strong><small>点击后可精细调节</small></div>
        </aside>
      )}

      {entered && selected && (
        <aside className="control-panel" aria-label={`${selected.group}控制面板`}>
          <div className="panel-heading">
            <div>
              <p>SELECTED DEVICE</p>
              <h2>{selected.group}</h2>
            </div>
            <button type="button" aria-label="关闭控制面板" onClick={() => setSelectedId(null)}>×</button>
          </div>
          <div className="panel-controls">
            {selected.group === '双屏' && (
              <p className="monitor-motion-hint">并列时支架收拢；向内转动先展开机械臂，向外微调只转屏幕。左屏正值、右屏负值为向内。俯仰负值向下，正值向上。</p>
            )}
            {groupControls.map((control) => (
              <label key={control.id} className="range-control">
                <span><b>{control.label}</b><output>{formatValue(control, values[control.id] ?? control.default)}</output></span>
                <input
                  type="range"
                  aria-label={control.label}
                  min={control.min}
                  max={control.max}
                  step={control.id === 'monitors.face' ? 1 / 90 : control.unit === '°' ? .5 : .01}
                  value={values[control.id] ?? control.default}
                  onInput={(event) => engineRef.current?.setControl(control.id, Number(event.currentTarget.value))}
                />
              </label>
            ))}
          </div>
          <p className="panel-hint">拖动滑杆精调，或再次点击设备反向播放。</p>
        </aside>
      )}

      {entered && hover && (
        <div className="cursor-tooltip" style={{ left: hover.x + 16, top: hover.y + 14 }}>
          {CONTROL_BY_ID.get(hover.id)?.label ?? '可互动部件'}
        </div>
      )}

      {entered && (
        <nav className="room-toolbar" aria-label="场景操作">
          <span className="orbit-tip"><i aria-hidden="true">◎</i> 拖动环绕 · 滚轮缩放</span>
          <em />
          <button type="button" onClick={() => engineRef.current?.runDemo()}><span aria-hidden="true">▶</span> 演示</button>
          <button type="button" onClick={() => engineRef.current?.reset()}><span aria-hidden="true">↺</span> 复位</button>
          <button type="button" onClick={() => void engineRef.current?.enterFullscreen()}><span aria-hidden="true">⛶</span> 全屏</button>
        </nav>
      )}

      {entered && !selected && (
        <section className="device-dock" aria-label="互动设备快捷入口">
          {DEFAULT_CONTROLS.filter((control) => control.primary).map((control) => (
            <button key={control.id} type="button" onClick={() => selectFromList(control)}>
              <i />{control.label}
            </button>
          ))}
        </section>
      )}
    </main>
  );
}

function formatValue(control: ControlDefinition, value: number) {
  if (control.id === 'desk.lift') return `${Math.round(78 + value * 40)} cm`;
  if (control.id === 'monitors.face') return `${Math.round(value * 90)}°`;
  if (control.id.endsWith('Tilt')) return value === 0 ? '0°' : `${value > 0 ? '仰' : '俯'} ${Math.round(Math.abs(value) * 10) / 10}°`;
  if (control.unit === '%') return `${Math.round(value * 100)}%`;
  if (control.unit === '°') return `${Math.round(value * 10) / 10}°`;
  return String(Math.round(value * 100) / 100);
}
