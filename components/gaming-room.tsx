'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CONTROLS } from '../lib/room/default-controls';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, ROOM_COPY, controlLabel, formatControlValue, groupLabel, resolveLanguage, statusLabel, type RoomLanguage } from '../lib/room/i18n';
import type { RoomEngine } from '../lib/room/room-engine';
import type { ControlDefinition, EngineStatus, RoomLoadingStage } from '../lib/room/types';
import { ARTWORK_INTERACTION_ID, ArtworkError, type ArtworkErrorCode, type ArtworkFit } from '../lib/room/artwork-input';

interface HoverState {
  id: string;
  x: number;
  y: number;
}

const CONTROL_BY_ID = new Map(DEFAULT_CONTROLS.map((control) => [control.id, control]));

export default function GamingRoom({ posterUrl }: { posterUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RoomEngine | null>(null);
  const languageRef = useRef<RoomLanguage>(DEFAULT_LANGUAGE);
  const [language, setLanguage] = useState<RoomLanguage>(DEFAULT_LANGUAGE);
  const copy = ROOM_COPY[language];
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState<RoomLoadingStage>('waking');
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(DEFAULT_CONTROLS.map((control) => [control.id, control.default])),
  );
  const [engineError, setEngineError] = useState<'webglError' | 'moduleError' | null>(null);
  const [artworkAvailable, setArtworkAvailable] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [artworkName, setArtworkName] = useState('');
  const [artworkFit, setArtworkFit] = useState<ArtworkFit>('contain');
  const [artworkBusy, setArtworkBusy] = useState(false);
  const [artworkError, setArtworkError] = useState<ArtworkErrorCode | null>(null);
  const artworkRequestRef = useRef(0);

  const selected = selectedId ? CONTROL_BY_ID.get(selectedId) ?? null : null;
  const groupControls = useMemo(
    () => selected ? DEFAULT_CONTROLS.filter((control) => control.group === selected.group) : [],
    [selected],
  );

  useEffect(() => {
    try {
      const saved = resolveLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
      languageRef.current = saved;
      setLanguage(saved);
    } catch { /* Display language still works when browser storage is disabled. */ }
  }, []);

  useEffect(() => {
    languageRef.current = language;
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = ROOM_COPY[language].pageTitle;
    engineRef.current?.setSceneLabel(ROOM_COPY[language].sceneLabel);
  }, [language]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let engine: RoomEngine | null = null;
    void import('../lib/room/room-engine').then(({ RoomEngine: Engine }) => {
      if (cancelled) return;
      try {
        engine = new Engine(host, {
          onProgress: (next, stage) => {
            setProgress(next);
            setLoadingStage(stage);
          },
          onReady: (nextStatus) => {
            setReady(true);
            setStatus(nextStatus);
            setArtworkAvailable(engine?.artworkAvailable ?? false);
          },
          onSelect: (id) => { setSelectedId(id); if (id) setArtworkOpen(false); },
          onArtworkSelect: () => { setSelectedId(null); setHover(null); setArtworkOpen(true); },
          onArtworkClose: () => { setArtworkOpen(false); setHover(null); },
          onHover: (id, x, y) => setHover(id ? { id, x, y } : null),
          onValues: (next) => setValues({ ...next }),
          onUserInput: () => undefined,
        });
        engineRef.current = engine;
        engine.setSceneLabel(ROOM_COPY[languageRef.current].sceneLabel);
      } catch (error) {
        console.error('[room] WebGL initialization failed.', error);
        setEngineError('webglError');
        setLoadingStage('webglError');
      }
    }).catch((error) => {
      console.error('[room] Three.js module failed to load.', error);
      setEngineError('moduleError');
      setLoadingStage('moduleError');
    });
    return () => {
      cancelled = true;
      ++artworkRequestRef.current;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedId(null); engineRef.current?.closeArtwork(); }
      if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey
          && !(event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable="true"]'))) {
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

  const changeLanguage = (value: string) => {
    const next = resolveLanguage(value);
    languageRef.current = next;
    setLanguage(next);
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* Optional device-local preference. */ }
  };

  const replaceArtwork = async (file: File) => {
    const request = ++artworkRequestRef.current;
    setArtworkBusy(true);
    setArtworkError(null);
    try {
      const applied = await engineRef.current?.replaceArtwork(file);
      if (request === artworkRequestRef.current && applied) setArtworkName(file.name);
    } catch (error) {
      if (request === artworkRequestRef.current) setArtworkError(error instanceof ArtworkError ? error.code : 'decode');
    } finally {
      if (request === artworkRequestRef.current) setArtworkBusy(false);
    }
  };

  const resetArtwork = () => {
    ++artworkRequestRef.current;
    engineRef.current?.resetArtwork();
    setArtworkName('');
    setArtworkBusy(false);
    setArtworkError(null);
  };

  return (
    <main className={`room-app ${entered ? 'is-entered' : ''}`}>
      <div ref={hostRef} className="canvas-host" />

      <div className="poster-layer" aria-hidden={entered}>
        <div className="room-poster" style={{ backgroundImage: `url("${posterUrl}")` }} />
        <div className="poster-wash" />
        <div className="poster-vignette" />
      </div>

      <header className="room-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
        </div>
        <div className="header-settings">
          <span className="preview-pill"><i /> {statusLabel(status, language)}</span>
          <select className="language-select" aria-label={copy.language} value={language}
            onChange={(event) => changeLanguage(event.currentTarget.value)}>
            <option value="en" lang="en">English</option>
            <option value="zh" lang="zh-CN">中文</option>
          </select>
        </div>
      </header>

      {!entered && (
        <section className="intro-card" aria-labelledby="room-intro-title">
          <p className="intro-kicker">{copy.kicker}</p>
          <h2 id="room-intro-title">{copy.intro}</h2>
          <p className="intro-copy">{copy.introCopy}</p>
          <div className="load-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
          <p className="load-copy" role="status">{copy.loading[loadingStage]} · {Math.round(progress)}%</p>
          <button
            className="enter-button"
            type="button"
            disabled={!ready}
            onClick={() => setEntered(true)}
          >
            <span>{ready ? copy.enter : copy.preparing}</span>
            <b aria-hidden="true">→</b>
          </button>
          {engineError && (
            <button className="retry-button" type="button" onClick={() => window.location.reload()}>
              {copy[engineError]} {copy.retry}
            </button>
          )}
        </section>
      )}

      {!entered && (
        <aside className="parts-card" aria-label={copy.summary}>
          <span className="parts-count">{DEFAULT_CONTROLS.filter(control => control.primary).length}</span>
          <div><strong>{copy.interactionCount}</strong><small>{copy.interactionHint}</small></div>
        </aside>
      )}

      {entered && selected && (
        <aside className="control-panel" aria-label={`${groupLabel(selected.id, language)} ${copy.panel}`}>
          <div className="panel-heading">
            <div>
              <p>{copy.selectedDevice}</p>
              <h2>{groupLabel(selected.id, language)}</h2>
            </div>
            <button type="button" aria-label={copy.closePanel} onClick={() => setSelectedId(null)}>×</button>
          </div>
          <button className="panel-reset" type="button" title={copy.resetDeviceHint}
            onClick={() => engineRef.current?.resetGroup(selected.id)}>
            <span aria-hidden="true">↺</span> {copy.resetDevice}
          </button>
          <div className="panel-controls">
            {selected.group === '双屏' && (
              <p className="monitor-motion-hint">{copy.monitorHint}</p>
            )}
            {groupControls.map((control) => (
              <label key={control.id} className="range-control">
                <span><b>{controlLabel(control.id, language)}</b><output>{formatControlValue(control, values[control.id] ?? control.default, language)}</output></span>
                <input
                  type="range"
                  aria-label={controlLabel(control.id, language)}
                  min={control.min}
                  max={control.max}
                  step={control.id === 'monitors.face' ? 1 / 90 : control.unit === '°' ? .5 : .01}
                  value={values[control.id] ?? control.default}
                  onInput={(event) => engineRef.current?.setControl(control.id, Number(event.currentTarget.value))}
                />
              </label>
            ))}
          </div>
          <p className="panel-hint">{copy.panelHint}</p>
        </aside>
      )}

      {entered && artworkOpen && (
        <aside className="control-panel artwork-panel" aria-label={copy.artwork.title}>
          <div className="panel-heading">
            <h2>{copy.artwork.title}</h2>
            <button type="button" aria-label={copy.artwork.close} onClick={() => engineRef.current?.closeArtwork()}>×</button>
          </div>
          <label className="artwork-file-label">
            <span>{copy.artwork.choose}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={copy.artwork.choose}
              disabled={artworkBusy} onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void replaceArtwork(file);
              }} />
          </label>
          <p className="artwork-current" role="status">{artworkBusy ? copy.artwork.loading : artworkName || copy.artwork.original}</p>
          {artworkError && <p className="artwork-error" role="alert">{copy.artwork.errors[artworkError]}</p>}
          <label className="artwork-fit-label">
            <span>{copy.artwork.fit}</span>
            <select value={artworkFit} disabled={!artworkName || artworkBusy} onChange={event => {
              const fit = event.currentTarget.value as ArtworkFit;
              engineRef.current?.setArtworkFit(fit);
              setArtworkFit(fit);
            }}>
              <option value="contain">{copy.artwork.contain}</option>
              <option value="cover">{copy.artwork.cover}</option>
            </select>
          </label>
          <button type="button" className="panel-reset" onClick={resetArtwork}>{copy.artwork.reset}</button>
          <p className="artwork-privacy">{copy.artwork.privacy}</p>
        </aside>
      )}

      {entered && hover && (
        <div className="cursor-tooltip" style={{ left: hover.x + 16, top: hover.y + 14 }}>
          {hover.id === ARTWORK_INTERACTION_ID ? copy.artwork.open : controlLabel(hover.id, language)}
        </div>
      )}

      {entered && (
        <nav className="room-toolbar" aria-label={copy.sceneActions}>
          <span className="orbit-tip"><i aria-hidden="true">◎</i> {copy.orbitHint}</span>
          <em />
          <button type="button" onClick={() => engineRef.current?.runDemo()}><span aria-hidden="true">▶</span> {copy.demo}</button>
          <button type="button" onClick={() => engineRef.current?.reset()}><span aria-hidden="true">↺</span> {copy.resetRoom}</button>
          <button type="button" disabled={!artworkAvailable} aria-expanded={artworkOpen}
            onClick={() => {
              if (artworkOpen) engineRef.current?.closeArtwork();
              else engineRef.current?.openArtwork();
            }}>{copy.artwork.open}</button>
          <button type="button" onClick={() => void engineRef.current?.enterFullscreen()}><span aria-hidden="true">⛶</span> {copy.fullscreen}</button>
        </nav>
      )}

      {entered && !selected && !artworkOpen && (
        <section className="device-dock" aria-label={copy.deviceDock}>
          {DEFAULT_CONTROLS.filter((control) => control.primary).map((control) => (
            <button key={control.id} type="button" onClick={() => selectFromList(control)}>
              <i />{controlLabel(control.id, language)}
            </button>
          ))}
          {artworkAvailable && <button type="button" onClick={() => engineRef.current?.openArtwork()}>
            <i />{copy.artwork.open}
          </button>}
        </section>
      )}
    </main>
  );
}
