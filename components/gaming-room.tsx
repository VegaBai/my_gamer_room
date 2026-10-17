'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CONTROLS } from '../lib/room/default-controls';
import { isExpansionControl, isPowerControl } from '../lib/room/expansion-controls';
import { isBedroomControl } from '../lib/room/bedroom-controls';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, ROOM_COPY, controlLabel, formatControlValue, groupLabel, resolveLanguage, statusLabel, type RoomLanguage } from '../lib/room/i18n';
import type { RoomEngine } from '../lib/room/room-engine';
import type { ControlDefinition, EngineStatus, RoomLoadingStage } from '../lib/room/types';
import { ARTWORK_INTERACTION_ID, ArtworkError, type ArtworkErrorCode, type ArtworkFit } from '../lib/room/artwork-input';
import { BOOKS, BOOK_COPY, isBookId, type BookId } from '../lib/room/books';
import { WALLPAPERS, type WallpaperId } from '../lib/room/wallpaper-options';
import { PHOTO_WALL_INTERACTION_ID, type PhotoSlot, type PhotoStatus } from '../lib/room/photo-wall';

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
  const bookCopy = BOOK_COPY[language];
  const booksButtonRef = useRef<HTMLButtonElement>(null);
  const bookPanelRef = useRef<HTMLElement>(null);
  const [availableBooks, setAvailableBooks] = useState<BookId[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<BookId | null>(null);
  const selectedBook = selectedBookId ? BOOKS[selectedBookId] : null;
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
  const [wallpaperAvailable, setWallpaperAvailable] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [wallpaperId, setWallpaperId] = useState<WallpaperId>('linen');
  const wallpaperButtonRef = useRef<HTMLButtonElement>(null);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [photosAvailable, setPhotosAvailable] = useState(false);
  const [photos, setPhotos] = useState<PhotoStatus[]>([]);
  const [photoBusy, setPhotoBusy] = useState<PhotoSlot | null>(null);
  const [photoError, setPhotoError] = useState<ArtworkErrorCode | null>(null);
  const photoButtonRef = useRef<HTMLButtonElement>(null);
  const photoPanelRef = useRef<HTMLElement>(null);

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
            setSelectedId(null);
            setSelectedBookId(null);
            setArtworkOpen(false);
            setArtworkAvailable(engine?.artworkAvailable ?? false);
            setAvailableBooks(engine?.bookIds ?? []);
            setWallpaperAvailable(engine?.wallpaperAvailable ?? false);
            setWallpaperId(engine?.wallpaper ?? 'linen');
            setWallpaperOpen(false);
            setPhotosAvailable(engine?.photoWallAvailable ?? false);
            setPhotos(engine?.photos ?? []);
          },
          onSelect: (id) => { setSelectedId(id); if (id) { setArtworkOpen(false); setWallpaperOpen(false); setPhotosOpen(false); } },
          onArtworkSelect: () => { setSelectedId(null); setHover(null); setArtworkOpen(true); setWallpaperOpen(false); setPhotosOpen(false); },
          onArtworkClose: () => { setArtworkOpen(false); setPhotosOpen(false); setHover(null); },
          onPhotoWallSelect: () => {
            setSelectedId(null); setSelectedBookId(null); setArtworkOpen(false); setWallpaperOpen(false); setHover(null);
            setPhotos(engine?.photos ?? []); setPhotosOpen(true);
          },
          onBookSelect: (id) => {
            setSelectedBookId(id);
            setHover(null);
            if (id) { setSelectedId(null); setArtworkOpen(false); setWallpaperOpen(false); setPhotosOpen(false); }
          },
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
      if (event.key === 'Escape') {
        if (document.activeElement?.closest('.photo-wall-panel')) photoButtonRef.current?.focus();
        setPhotosOpen(false);
        if (bookPanelRef.current) booksButtonRef.current?.focus();
        if (document.activeElement?.closest('.wallpaper-panel')) wallpaperButtonRef.current?.focus();
        setSelectedId(null);
        setWallpaperOpen(false);
        engineRef.current?.closeArtwork();
        engineRef.current?.closeBook();
      }
      if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey
          && !(event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable="true"]'))) {
        engineRef.current?.reset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    // Canvas selection has no focusable DOM target. Move focus into the new panel,
    // but preserve the focused book-switch button when browsing within it.
    const panel = bookPanelRef.current;
    if (selectedBookId && panel) panel.scrollTop = 0;
    if (selectedBookId && panel && !panel.contains(document.activeElement)) {
      panel.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    }
  }, [selectedBookId]);

  const closeBook = () => {
    engineRef.current?.closeBook();
    booksButtonRef.current?.focus();
  };

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

  const chooseWallpaper = (id: WallpaperId) => {
    engineRef.current?.setWallpaper(id);
    setWallpaperId(id);
  };

  useEffect(() => {
    if (photosOpen) photoPanelRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, [photosOpen]);

  const changePhoto = async (id: PhotoSlot, operation: () => Promise<unknown>) => {
    setPhotoBusy(id); setPhotoError(null);
    try { await operation(); setPhotos(engineRef.current?.photos ?? []); }
    catch (error) { setPhotoError(error instanceof ArtworkError ? error.code : 'decode'); }
    finally { setPhotoBusy(null); }
  };
  const closePhotos = () => {
    setPhotosOpen(false); engineRef.current?.closeArtwork(); photoButtonRef.current?.focus();
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
          <span className="parts-count">{DEFAULT_CONTROLS.filter(control => control.primary && (!(isExpansionControl(control.id) || isBedroomControl(control.id)) || status?.expansionReady)).length}</span>
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
              <p className="monitor-motion-hint">{status?.controlLimits?.['monitors.face']
                ? language === 'zh'
                  ? '近墙布局已启用防碰墙限位：同步内转最多 30°，左右微调与俯仰仍可使用。'
                  : 'Near-wall safety stop: shared inward rotation is limited to 30°. Individual swivel trim and tilt remain available.'
                : copy.monitorHint}</p>
            )}
            {selected.group === '百叶窗' && <p className="monitor-motion-hint">{copy.blindsHint}</p>}
            {selected.group === '垃圾桶' && <p className="monitor-motion-hint">{copy.binHint}</p>}
            {selected.group === '书架' && <button className="panel-reset" type="button"
              onClick={() => engineRef.current?.viewBookshelf()}>
              {language === 'zh' ? '查看书架正面' : 'View bookshelf'}
            </button>}
            {groupControls.map((control) => (
              isPowerControl(control.id) ? <div key={control.id} className="range-control power-control">
                <span><b>{controlLabel(control.id, language)}</b><output>{formatControlValue(control, values[control.id] ?? control.default, language)}</output></span>
                <button type="button" role="switch" aria-label={controlLabel(control.id, language)}
                  aria-checked={(values[control.id] ?? control.default) >= .5}
                  onClick={() => engineRef.current?.selectAndToggle(control.id)}>
                  <i aria-hidden="true" />{formatControlValue(control, values[control.id] ?? control.default, language)}
                </button>
              </div> : <label key={control.id} className="range-control">
                <span><b>{controlLabel(control.id, language)}</b><output>{formatControlValue(control, values[control.id] ?? control.default, language)}</output></span>
                <input
                  type="range"
                  aria-label={controlLabel(control.id, language)}
                  min={(status?.controlLimits?.[control.id]?.min ?? control.min) * (control.id === 'monitors.face' ? 90 : 1)}
                  max={(status?.controlLimits?.[control.id]?.max ?? control.max) * (control.id === 'monitors.face' ? 90 : 1)}
                  step={control.id === 'monitors.face' ? 1 : control.unit === '°' ? .5 : .01}
                  value={(values[control.id] ?? control.default) * (control.id === 'monitors.face' ? 90 : 1)}
                  onInput={(event) => engineRef.current?.setControl(control.id,
                    Number(event.currentTarget.value) / (control.id === 'monitors.face' ? 90 : 1))}
                />
              </label>
            ))}
          </div>
          <p className="panel-hint">{copy.panelHint}</p>
        </aside>
      )}

      {entered && wallpaperOpen && (
        <aside className="control-panel wallpaper-panel" aria-label={language === 'zh' ? '墙面装饰' : 'Wall finishes'}>
          <div className="panel-heading">
            <div><p>{language === 'zh' ? '细腻纹理 · 柔和配色' : 'Quiet textures · Soft tones'}</p>
              <h2>{language === 'zh' ? '墙面装饰' : 'Wall finishes'}</h2></div>
            <button type="button" aria-label={copy.closePanel} onClick={() => {
              setWallpaperOpen(false); wallpaperButtonRef.current?.focus();
            }}>×</button>
          </div>
          <div className="wallpaper-grid" role="group" aria-label={language === 'zh' ? '选择墙纸' : 'Choose wallpaper'}>
            {WALLPAPERS.map(style => <button key={style.id} type="button" aria-pressed={wallpaperId === style.id}
              onClick={() => chooseWallpaper(style.id)}>
              <span className={`wallpaper-swatch wallpaper-${style.id}`} style={{ backgroundColor: style.color }} aria-hidden="true" />
              <span>{style[language]}</span>
            </button>)}
          </div>
          <p className="panel-hint">{language === 'zh'
            ? '墙纸搭配固定的浅色墙裙与细收边。选择会保存在此浏览器。'
            : 'Paired with pale wainscoting and fine trim. Your choice stays in this browser.'}</p>
          <button className="panel-reset" type="button" onClick={() => engineRef.current?.viewBookshelf()}>
            {language === 'zh' ? '查看书架正面' : 'View bookshelf'}
          </button>
          <p className="panel-hint">{language === 'zh'
            ? '可整圈旋转镜头；外侧墙面会自动隐藏，让室内保持可见。'
            : 'Orbit all the way around. Near-side walls automatically hide to reveal the room.'}</p>
        </aside>
      )}

      {entered && photosOpen && (
        <aside ref={photoPanelRef} className="control-panel photo-wall-panel" aria-label={language === 'zh' ? '照片墙' : 'Photo wall'}>
          <div className="panel-heading">
            <h2 tabIndex={-1}>{language === 'zh' ? '照片墙' : 'Photo wall'}</h2>
            <button type="button" aria-label={language === 'zh' ? '关闭照片墙' : 'Close photo wall'} onClick={closePhotos}>×</button>
          </div>
          <p className="artwork-privacy">{language === 'zh' ? '分别替换三张拍立得。照片只保存在当前浏览器，不会上传。' : 'Replace each Polaroid. Photos stay in this browser and are never uploaded.'}</p>
          {photos.map((photo, index) => (
            <fieldset key={photo.id} className="photo-slot" disabled={photoBusy !== null}>
              <legend>{language === 'zh' ? `拍立得 ${index + 1}` : `Polaroid ${index + 1}`}</legend>
              <p className="artwork-current" role="status">{photoBusy === photo.id ? copy.artwork.loading : photo.name || (language === 'zh' ? '默认风景' : 'Default scenery')}</p>
              <label className="artwork-file-label">
                <span>{language === 'zh' ? '选择照片' : 'Choose photo'}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={language === 'zh' ? `替换拍立得 ${index + 1}` : `Replace Polaroid ${index + 1}`}
                  onChange={event => {
                    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
                    if (file) void changePhoto(photo.id, () => engineRef.current?.replacePhoto(photo.id, file) ?? Promise.resolve());
                  }} />
              </label>
              <label className="artwork-fit-label">
                <span>{copy.artwork.fit}</span>
                <select aria-label={language === 'zh' ? `拍立得 ${index + 1} 显示方式` : `Polaroid ${index + 1} fit`} value={photo.fit} disabled={!photo.name || photoBusy !== null}
                  onChange={event => { const fit = event.currentTarget.value as ArtworkFit; void changePhoto(photo.id, () => engineRef.current?.setPhotoFit(photo.id, fit) ?? Promise.resolve()); }}>
                  <option value="cover">{copy.artwork.cover}</option><option value="contain">{copy.artwork.contain}</option>
                </select>
              </label>
              <button type="button" className="panel-reset" onClick={() => void changePhoto(photo.id, () => engineRef.current?.resetPhoto(photo.id) ?? Promise.resolve())}>{copy.artwork.reset}</button>
              {!photo.saved && <p className="artwork-error" role="status">{language === 'zh' ? '当前已显示，但浏览器无法保存这次修改。' : 'Shown now, but this browser could not save the change.'}</p>}
            </fieldset>
          ))}
          {photoError && <p className="artwork-error" role="alert">{copy.artwork.errors[photoError]}</p>}
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

      {entered && selectedBook && selectedBookId && (
        <aside ref={bookPanelRef} className="control-panel book-panel" aria-labelledby="book-title">
          <div className="panel-heading">
            <div>
              <p>{bookCopy.collection}</p>
              <h2 id="book-title" tabIndex={-1}>{selectedBook.title[language]}</h2>
            </div>
            <button type="button" aria-label={bookCopy.close} onClick={closeBook}>×</button>
          </div>
          <div className="book-switcher" role="group" aria-label={bookCopy.select}>
            {availableBooks.map(id => (
              <button key={id} type="button" aria-pressed={selectedBookId === id}
                onClick={() => engineRef.current?.openBook(id)}>{BOOKS[id].title[language]}</button>
            ))}
          </div>
          <p className="book-alternate-title" lang={language === 'zh' ? 'en' : 'zh-CN'}>
            {selectedBook.title[language === 'zh' ? 'en' : 'zh']}
          </p>
          <dl className="book-facts">
            <div><dt>{bookCopy.author}</dt><dd>{selectedBook.author[language]}</dd></div>
            <div><dt>{bookCopy.year}</dt><dd>{selectedBook.year}</dd></div>
          </dl>
          <p className="book-genre">{selectedBook.genre[language]}</p>
          <h3>{bookCopy.synopsis}</h3>
          <p className="book-synopsis">{selectedBook.synopsis[language]}</p>
          {selectedBook.publicationNote && <p className="book-note">{selectedBook.publicationNote[language]}</p>}
          <details className="book-sources" key={selectedBookId}>
            <summary>{bookCopy.sources}</summary>
            <ul>{selectedBook.sources.map(source => <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a>
            </li>)}</ul>
          </details>
          <p className="book-note">{bookCopy.note}</p>
        </aside>
      )}

      {entered && status?.bookError && (
        <aside className="book-load-error" role="alert">
          <p>{bookCopy.unavailable}</p>
          <button type="button" onClick={() => window.location.reload()}>{bookCopy.retry}</button>
        </aside>
      )}

      {entered && status?.expansionError && (
        <aside className={`expansion-load-error ${status.bookError ? 'with-book-error' : ''}`} role="alert">
          <p>{copy.expansionUnavailable}</p>
          <button type="button" onClick={() => window.location.reload()}>{copy.retry}</button>
        </aside>
      )}

      {entered && hover && (
        <div className="cursor-tooltip" style={{ left: hover.x + 16, top: hover.y + 14 }}>
          {isBookId(hover.id) ? BOOKS[hover.id].title[language] : hover.id === PHOTO_WALL_INTERACTION_ID ? (language === 'zh' ? '凑近查看照片墙' : 'Inspect photo wall') : hover.id === ARTWORK_INTERACTION_ID ? copy.artwork.open : controlLabel(hover.id, language)}
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
              setPhotosOpen(false);
              if (artworkOpen) engineRef.current?.closeArtwork();
              else engineRef.current?.openArtwork();
            }}>{copy.artwork.open}</button>
          <button ref={booksButtonRef} className="book-entry" type="button" disabled={!availableBooks.length} aria-expanded={!!selectedBookId}
            onClick={() => {
              setPhotosOpen(false);
              if (selectedBookId) closeBook();
              else if (availableBooks[0]) engineRef.current?.openBook(availableBooks[0]);
            }}>{bookCopy.open}</button>
          <button ref={wallpaperButtonRef} type="button" disabled={!wallpaperAvailable} aria-expanded={wallpaperOpen}
            onClick={() => {
              if (wallpaperOpen) { setWallpaperOpen(false); return; }
              setSelectedId(null); setHover(null);
              setPhotosOpen(false);
              engineRef.current?.closeBook(); engineRef.current?.closeArtwork();
              setWallpaperOpen(true);
            }}>{language === 'zh' ? '墙纸' : 'Wallpapers'}</button>
          <button ref={photoButtonRef} type="button" disabled={!photosAvailable} aria-expanded={photosOpen} onClick={() => {
            if (photosOpen) { closePhotos(); return; }
            engineRef.current?.openPhotoWall();
          }}>{language === 'zh' ? '照片墙' : 'Photo wall'}</button>
          <button type="button" onClick={() => void engineRef.current?.enterFullscreen()}><span aria-hidden="true">⛶</span> {copy.fullscreen}</button>
        </nav>
      )}

      {entered && !selected && !artworkOpen && !selectedBookId && !wallpaperOpen && !photosOpen && (
        <section className="device-dock" aria-label={copy.deviceDock}>
          {DEFAULT_CONTROLS.filter((control) => control.primary)
            .sort((a, b) => Number(isExpansionControl(b.id)) - Number(isExpansionControl(a.id))).map((control) => (
            <button key={control.id} type="button" disabled={(isExpansionControl(control.id) || isBedroomControl(control.id)) && !status?.expansionReady}
              onClick={() => selectFromList(control)}>
              <i />{controlLabel(control.id, language)}
            </button>
          ))}
          {artworkAvailable && <button type="button" onClick={() => engineRef.current?.openArtwork()}>
            <i />{copy.artwork.open}
          </button>}
          {photosAvailable && <button type="button" onClick={() => engineRef.current?.openPhotoWall()}>
            <i />{language === 'zh' ? '凑近查看照片墙' : 'Inspect photo wall'}
          </button>}
        </section>
      )}
    </main>
  );
}
