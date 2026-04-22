import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FloatingControlBar from './FloatingControlBar';
import LeftPropertiesPanel from './LeftPropertiesPanel';
import TeleprompterPanel, { DEFAULT_TELEPROMPTER_STATE, type TeleprompterPanelState } from './TeleprompterPanel';
import TopToolbar from './TopToolbar';
import WhiteboardStage from './WhiteboardStage';
import type { CameraSettings, RecordingVisualSettings } from '../cameraTypes';
import type { BackgroundSwatch } from '../mockOptions';
import { getRecordingCompositionLayout } from '../recordingLayout';
import type {
  BoardElement,
  ColorStyle,
  ImageElement,
  LayerAction,
  LinearElement,
  Slide,
  SlideFrame,
  TextEditorState,
  StrokeStyle,
  TextStyle,
  ToolType,
  ViewportState,
} from '../whiteboard/types';
import {
  DEFAULT_BOARD_COLOR,
  DEFAULT_CORNER_RADIUS,
  DEFAULT_FILL_COLOR,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_TEXT_STYLE,
  MAX_CORNER_RADIUS,
  MAX_STROKE_WIDTH,
  MIN_CORNER_RADIUS,
  MIN_STROKE_WIDTH,
  FIT_CONTENT_MAX_ZOOM,
  FIT_CONTENT_MIN_ZOOM,
  MAX_VIEWPORT_ZOOM,
  MIN_VIEWPORT_ZOOM,
  ZOOM_BUTTON_STEP,
} from '../whiteboard/types';
import {
  duplicateElements,
  generateElementId,
  getElementBounds,
  getElementCenter,
  getSelectionBounds,
  moveElementCenterTo,
  normalizeRotation,
  offsetElement,
  rotatePointAround,
} from '../whiteboard/utils';

type WhiteboardPageProps = {
  onOpenSettings: () => void;
  slideAspectRatio: number;
  cameraSettings: CameraSettings;
  onCameraSettingsChange: (patch: Partial<CameraSettings>) => void;
  cameraStream: MediaStream | null;
  microphoneStream: MediaStream | null;
  recordingBackground: BackgroundSwatch;
  recordingVisualSettings: RecordingVisualSettings;
};

type ElementScopeType = 'slide' | 'freeboard';

type ScopeHistoryEntry = {
  kind: 'scope';
  scopeType: ElementScopeType;
  scopeId: string | null;
  elements: BoardElement[];
};

type BoardHistoryEntry = {
  kind: 'board';
  activeScopeId: string | null;
  slides: Slide[];
  freeboardElements: BoardElement[];
};

type ElementsHistoryEntry = ScopeHistoryEntry | BoardHistoryEntry;

type ElementsHistory = {
  past: ElementsHistoryEntry[];
  present: BoardElement[];
  future: ElementsHistoryEntry[];
};
type RecordingStatus = 'idle' | 'preparing' | 'recording' | 'paused';

type RecordingSnapshot = {
  frame: SlideFrame;
  elements: BoardElement[];
  name?: string;
};

type RecordingTransition = {
  fromSlideId: string;
  toSlideId: string;
  fromIndex: number;
  toIndex: number;
  firstIndex: number;
  lastIndex: number;
  direction: 'next' | 'prev';
  startTime: number;
  duration: number;
  snapshots: RecordingSnapshot[];
};

type RecordingRuntime = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  frame: SlideFrame;
  mode: 'slide' | 'freeboard';
  animationFrameId: number | null;
};

type RecordingRenderState = {
  slides: Slide[];
  activeSlideId: string | null;
  elements: BoardElement[];
  slideAspectRatio: number;
  viewport: ViewportState;
  transition: RecordingTransition | null;
};

type RecordingPointerState = {
  point: {
    x: number;
    y: number;
  };
  pressed: boolean;
  visible: boolean;
};

type RecordingTarget = {
  frame: SlideFrame;
  mode: 'slide' | 'freeboard';
  slideId: string | null;
};

function WhiteboardPage({
  onOpenSettings,
  slideAspectRatio,
  cameraSettings,
  onCameraSettingsChange,
  cameraStream,
  microphoneStream,
  recordingBackground,
  recordingVisualSettings,
}: WhiteboardPageProps) {
  const initialSlideRef = useRef<Slide | null>(null);
  if (!initialSlideRef.current) {
    initialSlideRef.current = createSlide(0, slideAspectRatio);
  }

  const pageRef = useRef<HTMLDivElement | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [slides, setSlides] = useState<Slide[]>(() => [initialSlideRef.current!]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(() => initialSlideRef.current!.id);
  const [freeboardElements, setFreeboardElements] = useState<BoardElement[]>([]);
  const activeScopeRef = useRef<string | null>(initialSlideRef.current!.id);
  const [history, setHistory] = useState<ElementsHistory>({
    past: [],
    present: [],
    future: [],
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewport, setViewport] = useState<ViewportState>({ x: 180, y: 120, zoom: 1 });
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const [textDefaults, setTextDefaults] = useState<TextStyle>(DEFAULT_TEXT_STYLE);
  const [shapeDefaults, setShapeDefaults] = useState<ColorStyle>({ color: DEFAULT_BOARD_COLOR, opacity: 1, strokeWidth: DEFAULT_STROKE_WIDTH, strokeStyle: DEFAULT_STROKE_STYLE, fillColor: DEFAULT_FILL_COLOR, cornerRadius: DEFAULT_CORNER_RADIUS });
  const [clipboard, setClipboard] = useState<BoardElement[]>([]);
  const [pasteCount, setPasteCount] = useState(0);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [recordingFrame, setRecordingFrame] = useState<SlideFrame | null>(null);
  const [recordingTarget, setRecordingTarget] = useState<RecordingTarget | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [isTeleprompterOpen, setIsTeleprompterOpen] = useState(false);
  const [teleprompterState, setTeleprompterState] = useState<TeleprompterPanelState>(() => loadTeleprompterState());
  const [slideTransition, setSlideTransition] = useState<RecordingTransition | null>(null);
  const [slideTransitionTick, setSlideTransitionTick] = useState(0);
  const recordingRuntimeRef = useRef<RecordingRuntime | null>(null);
  const recordingRenderStateRef = useRef<RecordingRenderState | null>(null);
  const previousActiveSlideIdRef = useRef<string | null>(activeSlideId);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const cameraSettingsRef = useRef(cameraSettings);
  const recordingBackgroundRef = useRef(recordingBackground);
  const recordingVisualSettingsRef = useRef(recordingVisualSettings);
  const recordingPointerRef = useRef<RecordingPointerState | null>(null);
  const cameraRecordingVideoRef = useRef<HTMLVideoElement | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingAccumulatedMsRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const opacityChangeRef = useRef<{ previousElements: BoardElement[]; targetIds: string[] } | null>(null);
  const strokeWidthChangeRef = useRef<{ previousElements: BoardElement[]; targetIds: string[] } | null>(null);
  const cornerRadiusChangeRef = useRef<{ previousElements: BoardElement[]; targetIds: string[] } | null>(null);
  const normalViewportBeforeRecordingRef = useRef<ViewportState | null>(null);

  const elements = history.present;
  const updateTeleprompterState = useCallback((patch: Partial<TeleprompterPanelState>) => {
    setTeleprompterState((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    const saveTimer = window.setTimeout(() => saveTeleprompterState(teleprompterState), 250);
    return () => window.clearTimeout(saveTimer);
  }, [teleprompterState]);

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const startRecordingTimer = useCallback(() => {
    clearRecordingTimer();
    recordingStartedAtRef.current = performance.now();
    recordingTimerRef.current = window.setInterval(() => {
      if (recordingStartedAtRef.current === null) {
        return;
      }

      setRecordingElapsedMs(recordingAccumulatedMsRef.current + performance.now() - recordingStartedAtRef.current);
    }, 250);
  }, [clearRecordingTimer]);

  const freezeRecordingTimer = useCallback(() => {
    if (recordingStartedAtRef.current !== null) {
      recordingAccumulatedMsRef.current += performance.now() - recordingStartedAtRef.current;
      recordingStartedAtRef.current = null;
    }

    clearRecordingTimer();
    setRecordingElapsedMs(recordingAccumulatedMsRef.current);
  }, [clearRecordingTimer]);

  const resetRecordingTimer = useCallback(() => {
    clearRecordingTimer();
    recordingStartedAtRef.current = null;
    recordingAccumulatedMsRef.current = 0;
    setRecordingElapsedMs(0);
  }, [clearRecordingTimer]);

  useEffect(() => {
    cameraSettingsRef.current = cameraSettings;
  }, [cameraSettings]);

  useEffect(() => {
    recordingBackgroundRef.current = recordingBackground;
  }, [recordingBackground]);

  useEffect(() => {
    recordingVisualSettingsRef.current = recordingVisualSettings;
  }, [recordingVisualSettings]);

  useEffect(() => {
    const video = cameraRecordingVideoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = cameraStream;
    if (cameraStream) {
      video.play().catch(() => undefined);
    }

    return () => {
      video.srcObject = null;
    };
  }, [cameraStream]);

  useEffect(() => () => clearRecordingTimer(), [clearRecordingTimer]);

  useEffect(() => {
    setSlides((current) => reflowSlideFrames(current, slideAspectRatio));
  }, [slideAspectRatio]);
  const writeScopeElements = useCallback((scopeId: string | null, nextElements: BoardElement[]) => {
    const cloned = cloneElements(nextElements);

    if (scopeId === null) {
      setFreeboardElements(cloned);
      return;
    }

    setSlides((current) =>
      current.map((slide) => (slide.id === scopeId ? { ...slide, elements: cloned } : slide))
    );
  }, []);

  const getScopeElements = useCallback(
    (scopeId: string | null) => {
      if (scopeId === null) {
        return freeboardElements;
      }

      return slides.find((slide) => slide.id === scopeId)?.elements ?? [];
    },
    [freeboardElements, slides]
  );

  const getCurrentBoardHistoryEntry = useCallback(
    (present: BoardElement[]) =>
      createBoardHistoryEntry(
        activeScopeRef.current,
        materializeActiveSlideElements(slides, activeScopeRef.current, present),
        activeScopeRef.current === null ? present : freeboardElements
      ),
    [freeboardElements, slides]
  );

  const activateScope = useCallback(
    (scopeId: string | null) => {
      activeScopeRef.current = scopeId;
      setActiveSlideId(scopeId);
      setSelectedIds([]);
      setTextEditor(null);
      setHistory((current) => ({
        ...current,
        present: cloneElements(getScopeElements(scopeId)),
      }));
    },
    [getScopeElements]
  );

  const onElementsChange = useCallback(
    (update: React.SetStateAction<BoardElement[]>) => {
      setHistory((current) => {
        const next = resolveElementsUpdate(update, current.present);
        writeScopeElements(activeScopeRef.current, next);

        return {
          ...current,
          present: cloneElements(next),
        };
      });
    },
    [writeScopeElements]
  );

  const onCommitElementsChange = useCallback(
    (previous: BoardElement[], next: BoardElement[]) => {
      const scopeId = activeScopeRef.current;

      setHistory((current) => {
        writeScopeElements(scopeId, next);

        if (serializeElements(previous) === serializeElements(next)) {
          return {
            ...current,
            present: cloneElements(next),
          };
        }

        return {
          past: [...current.past, createScopeHistoryEntry(scopeId, previous)],
          present: cloneElements(next),
          future: [],
        };
      });
    },
    [writeScopeElements]
  );

  const onCommitElementOwnerMigration = useCallback(
    (previous: BoardElement[], next: BoardElement[], ownerMap: Record<string, string | null>) => {
      const scopeId = activeScopeRef.current;
      const migratingIds = new Set(Object.keys(ownerMap));

      if (migratingIds.size === 0) {
        onCommitElementsChange(previous, next);
        return;
      }

      const previousSlides = materializeActiveSlideElements(slides, scopeId, previous);
      const previousFreeboardElements = scopeId === null ? cloneElements(previous) : cloneElements(freeboardElements);
      const sourceSlides = materializeActiveSlideElements(slides, scopeId, next);
      const sourceFreeboardElements = scopeId === null ? cloneElements(next) : cloneElements(freeboardElements);
      const movedElements = new Map(
        next.filter((element) => migratingIds.has(element.id)).map((element) => [element.id, structuredClone(element)])
      );

      const nextSlides = sourceSlides.map((slide) => {
        const retainedElements = slide.elements
          .filter((element) => !migratingIds.has(element.id) || ownerMap[element.id] === slide.id)
          .map((element) => movedElements.get(element.id) ?? element);
        const incomingElements = next.filter(
          (element) =>
            migratingIds.has(element.id) &&
            ownerMap[element.id] === slide.id &&
            !slide.elements.some((slideElement) => slideElement.id === element.id)
        );

        return {
          ...slide,
          elements: cloneElements([...retainedElements, ...incomingElements]),
        };
      });

      const nextFreeboardElements = cloneElements([
        ...sourceFreeboardElements
          .filter((element) => !migratingIds.has(element.id) || ownerMap[element.id] === null)
          .map((element) => movedElements.get(element.id) ?? element),
        ...next.filter(
          (element) =>
            migratingIds.has(element.id) &&
            ownerMap[element.id] === null &&
            !sourceFreeboardElements.some((freeboardElement) => freeboardElement.id === element.id)
        ),
      ]);

      const firstSelectedOwner = selectedIds.map((id) => ownerMap[id]).find((owner) => owner !== undefined);
      const nextScopeId = firstSelectedOwner !== undefined ? firstSelectedOwner : scopeId;
      const nextPresent = getScopeElementsFromCollections(nextSlides, nextFreeboardElements, nextScopeId);
      const previousEntry = createBoardHistoryEntry(scopeId, previousSlides, previousFreeboardElements);

      setSlides(nextSlides);
      setFreeboardElements(nextFreeboardElements);
      activeScopeRef.current = nextScopeId;
      setActiveSlideId(nextScopeId);
      setTextEditor(null);
      setHistory((current) => {
        const nextEntry = createBoardHistoryEntry(nextScopeId, nextSlides, nextFreeboardElements);

        if (serializeBoardHistoryEntry(previousEntry) === serializeBoardHistoryEntry(nextEntry)) {
          return {
            ...current,
            present: cloneElements(nextPresent),
          };
        }

        return {
          past: [...current.past, previousEntry],
          present: cloneElements(nextPresent),
          future: [],
        };
      });
    },
    [freeboardElements, onCommitElementsChange, selectedIds, slides]
  );
  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.past.length === 0) {
        return current;
      }

      const currentScopeId = activeScopeRef.current;
      const previous = current.past[current.past.length - 1];
      setTextEditor(null);

      if (previous.kind === 'board') {
        const currentBoard = getCurrentBoardHistoryEntry(current.present);
        const restoredSlides = cloneSlides(previous.slides);
        const restoredFreeboardElements = cloneElements(previous.freeboardElements);
        setSlides(restoredSlides);
        setFreeboardElements(restoredFreeboardElements);
        activeScopeRef.current = previous.activeScopeId;
        setActiveSlideId(previous.activeScopeId);
        setSelectedIds((currentSelection) => filterSelectionForBoard(currentSelection, restoredSlides, restoredFreeboardElements));

        return {
          past: current.past.slice(0, -1),
          present: cloneElements(getScopeElementsFromCollections(restoredSlides, restoredFreeboardElements, previous.activeScopeId)),
          future: [currentBoard, ...current.future],
        };
      }

      writeScopeElements(previous.scopeId, previous.elements);
      activeScopeRef.current = previous.scopeId;
      setActiveSlideId(previous.scopeId);
      setSelectedIds((currentSelection) => (currentScopeId === previous.scopeId ? currentSelection : []));

      return {
        past: current.past.slice(0, -1),
        present: cloneElements(previous.elements),
        future: [createScopeHistoryEntry(currentScopeId, current.present), ...current.future],
      };
    });
  }, [getCurrentBoardHistoryEntry, writeScopeElements]);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (current.future.length === 0) {
        return current;
      }

      const currentScopeId = activeScopeRef.current;
      const next = current.future[0];
      setTextEditor(null);

      if (next.kind === 'board') {
        const currentBoard = getCurrentBoardHistoryEntry(current.present);
        const restoredSlides = cloneSlides(next.slides);
        const restoredFreeboardElements = cloneElements(next.freeboardElements);
        setSlides(restoredSlides);
        setFreeboardElements(restoredFreeboardElements);
        activeScopeRef.current = next.activeScopeId;
        setActiveSlideId(next.activeScopeId);
        setSelectedIds((currentSelection) => filterSelectionForBoard(currentSelection, restoredSlides, restoredFreeboardElements));

        return {
          past: [...current.past, currentBoard],
          present: cloneElements(getScopeElementsFromCollections(restoredSlides, restoredFreeboardElements, next.activeScopeId)),
          future: current.future.slice(1),
        };
      }

      writeScopeElements(next.scopeId, next.elements);
      activeScopeRef.current = next.scopeId;
      setActiveSlideId(next.scopeId);
      setSelectedIds((currentSelection) => (currentScopeId === next.scopeId ? currentSelection : []));

      return {
        past: [...current.past, createScopeHistoryEntry(currentScopeId, current.present)],
        present: cloneElements(next.elements),
        future: current.future.slice(1),
      };
    });
  }, [getCurrentBoardHistoryEntry, writeScopeElements]);

  useEffect(() => {
    const currentSlides = materializeActiveSlideElements(slides, activeScopeRef.current, elements);
    const currentFreeboardElements = activeScopeRef.current === null ? elements : freeboardElements;
    setSelectedIds((current) => filterSelectionForBoard(current, currentSlides, currentFreeboardElements));
    setTextEditor((current) =>
      current && elements.some((element) => element.id === current.elementId && element.type === 'text') ? current : null
    );
  }, [elements, freeboardElements, slides]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTypingTarget) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey;

      if (hasModifier && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (event.ctrlKey && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
        event.preventDefault();
        const nextElements = elements.filter((element) => !selectedIds.includes(element.id));
        onCommitElementsChange(elements, nextElements);
        setSelectedIds([]);
        setTextEditor((current) => (current && selectedIds.includes(current.elementId) ? null : current));
        return;
      }

      if (hasModifier && key === 'c' && selectedIds.length > 0) {
        event.preventDefault();
        setClipboard(cloneElements(elements.filter((element) => selectedIds.includes(element.id))));
        setPasteCount(0);
        return;
      }

      if (hasModifier && key === 'v' && clipboard.length > 0) {
        event.preventDefault();
        const offsetStep = 24 * (pasteCount + 1);
        const pastedElements = duplicateElements(clipboard, generateElementId).map((element) =>
          offsetElement(element, offsetStep, offsetStep)
        );
        const nextElements = [...elements, ...pastedElements];
        onCommitElementsChange(elements, nextElements);
        setSelectedIds(pastedElements.map((element) => element.id));
        setPasteCount((current) => current + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clipboard, elements, onCommitElementsChange, pasteCount, redo, selectedIds, undo]);



  const getViewportCenterAnchor = useCallback(() => {
    const rect = pageRef.current?.getBoundingClientRect();
    return rect
      ? {
          x: rect.width / 2,
          y: rect.height / 2,
        }
      : {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        };
  }, []);

  const getRecordingPresentationViewport = useCallback((frame: SlideFrame): ViewportState => {
    const rect = pageRef.current?.getBoundingClientRect();
    const viewportWidth = rect?.width ?? window.innerWidth;
    const viewportHeight = rect?.height ?? window.innerHeight;
    const safeFrameWidth = Math.max(frame.width, 1);
    const safeFrameHeight = Math.max(frame.height, 1);
    const margins = {
      left: 72,
      right: 236,
      top: 118,
      bottom: 112,
    };
    const availableWidth = Math.max(240, viewportWidth - margins.left - margins.right);
    const availableHeight = Math.max(180, viewportHeight - margins.top - margins.bottom);
    const nextZoom = clampZoom(Math.min(availableWidth / safeFrameWidth, availableHeight / safeFrameHeight), 0.4, 1.6);
    const screenCenterX = margins.left + availableWidth / 2;
    const screenCenterY = margins.top + availableHeight / 2;

    return {
      x: screenCenterX - (frame.x + safeFrameWidth / 2) * nextZoom,
      y: screenCenterY - (frame.y + safeFrameHeight / 2) * nextZoom,
      zoom: nextZoom,
    };
  }, []);

  const restoreNormalViewport = useCallback(() => {
    const previousViewport = normalViewportBeforeRecordingRef.current;
    normalViewportBeforeRecordingRef.current = null;

    if (previousViewport) {
      setViewport(previousViewport);
    }
  }, []);

  const applyZoomAtScreenPoint = useCallback((resolveNextZoom: (currentZoom: number) => number, anchor: { x: number; y: number }) => {
    if (recordingStatus !== 'idle') {
      return;
    }

    setViewport((current) => zoomViewportAtScreenPoint(current, resolveNextZoom(current.zoom), anchor));
  }, [recordingStatus]);

  const zoomOut = useCallback(() => {
    applyZoomAtScreenPoint((currentZoom) => getNextManualZoom(currentZoom, -1), getViewportCenterAnchor());
  }, [applyZoomAtScreenPoint, getViewportCenterAnchor]);

  const zoomIn = useCallback(() => {
    applyZoomAtScreenPoint((currentZoom) => getNextManualZoom(currentZoom, 1), getViewportCenterAnchor());
  }, [applyZoomAtScreenPoint, getViewportCenterAnchor]);

  const zoomTo = useCallback((nextZoom: number) => {
    if (recordingStatus !== 'idle') {
      return;
    }

    applyZoomAtScreenPoint(() => nextZoom, getViewportCenterAnchor());
  }, [applyZoomAtScreenPoint, getViewportCenterAnchor, recordingStatus]);

  const fitContent = useCallback(() => {
    if (recordingStatus !== 'idle') {
      return;
    }

    const rect = pageRef.current?.getBoundingClientRect();

    if (!rect || elements.length === 0) {
      setViewport({ x: 180, y: 120, zoom: 1 });
      return;
    }

    setViewport(fitViewportToElements(elements, rect.width, rect.height));
  }, [elements, recordingStatus]);

  const requestClearBoard = useCallback(() => {
    if (elements.length === 0) {
      return;
    }

    setIsClearConfirmOpen(true);
  }, [elements.length]);

  const cancelClearBoard = useCallback(() => {
    setIsClearConfirmOpen(false);
  }, []);

  const confirmClearBoard = useCallback(() => {
    if (elements.length > 0) {
      onCommitElementsChange(elements, []);
    }

    setSelectedIds([]);
    setTextEditor(null);
    setIsClearConfirmOpen(false);
  }, [elements, onCommitElementsChange]);

  const stageSlides = useMemo(
    () => slides.map((slide) => (slide.id === activeSlideId ? { ...slide, elements } : slide)),
    [activeSlideId, elements, slides]
  );

  const stageFreeboardElements = activeSlideId === null ? elements : freeboardElements;
  const allBoardElements = useMemo(
    () => [...stageFreeboardElements, ...stageSlides.flatMap((slide) => slide.elements)],
    [stageFreeboardElements, stageSlides]
  );

  const recordingRenderState = useMemo<RecordingRenderState>(
    () => ({
      slides: stageSlides,
      activeSlideId: recordingStatus !== 'idle' && recordingTarget?.mode === 'slide' ? recordingTarget.slideId : activeSlideId,
      elements,
      slideAspectRatio,
      viewport,
      transition: slideTransition,
    }),
    [activeSlideId, elements, recordingStatus, recordingTarget, slideAspectRatio, slideTransition, stageSlides, viewport]
  );

  useEffect(() => {
    recordingRenderStateRef.current = {
      ...recordingRenderState,
      transition: slideTransition,
    };
  }, [recordingRenderState, slideTransition]);
  const isRecordingViewportLocked = recordingStatus !== 'idle';
  const isSlideStructureLocked = recordingStatus === 'recording' || recordingStatus === 'paused';

  const getFreeboardRecordingTarget = useCallback((): RecordingTarget => {
    const rect = pageRef.current?.getBoundingClientRect();
    return {
      frame: getDefaultRecordingFrame(rect, normalViewportBeforeRecordingRef.current ?? viewport, slideAspectRatio),
      mode: 'freeboard',
      slideId: null,
    };
  }, [slideAspectRatio, viewport]);

  const syncPreparingRecordingTarget = useCallback(
    (target: RecordingTarget) => {
      if (recordingStatus !== 'preparing') {
        return;
      }

      setRecordingTarget(target);
      setRecordingFrame(target.frame);
      setViewport(getRecordingPresentationViewport(target.frame));
    },
    [getRecordingPresentationViewport, recordingStatus]
  );

  const addSlide = useCallback(() => {
    if (isSlideStructureLocked) {
      return;
    }

    const currentSlides = materializeActiveSlideElements(slides, activeSlideId, elements);
    const anchorSlideId = recordingStatus === 'preparing' && recordingTarget?.mode === 'slide' ? recordingTarget.slideId : activeSlideId;
    const activeIndex = anchorSlideId ? currentSlides.findIndex((slide) => slide.id === anchorSlideId) : currentSlides.length - 1;
    const insertIndex = Math.max(0, activeIndex + 1);
    const nextSlide = createSlide(insertIndex, slideAspectRatio);
    const nextSlides = reflowSlideFrames([
      ...currentSlides.slice(0, insertIndex),
      nextSlide,
      ...currentSlides.slice(insertIndex),
    ], slideAspectRatio);
    const nextActiveSlide = nextSlides.find((slide) => slide.id === nextSlide.id) ?? nextSlide;

    setSlides(nextSlides);
    activeScopeRef.current = nextSlide.id;
    setActiveSlideId(nextSlide.id);
    setSelectedIds([]);
    setTextEditor(null);
    setHistory((current) => ({ ...current, present: [] }));
    syncPreparingRecordingTarget({
      frame: nextActiveSlide.frame,
      mode: 'slide',
      slideId: nextActiveSlide.id,
    });
  }, [activeSlideId, elements, isSlideStructureLocked, recordingStatus, recordingTarget, slideAspectRatio, slides, syncPreparingRecordingTarget]);

  const deleteSlide = useCallback(
    (slideId: string) => {
      if (isSlideStructureLocked) {
        return;
      }

      const currentSlides = materializeActiveSlideElements(slides, activeSlideId, elements);
      const deleteIndex = currentSlides.findIndex((slide) => slide.id === slideId);
      if (deleteIndex < 0) {
        return;
      }

      const nextSlides = reflowSlideFrames(currentSlides.filter((slide) => slide.id !== slideId), slideAspectRatio);
      setSlides(nextSlides);

      if (recordingStatus === 'preparing') {
        const currentTargetSlideId = recordingTarget?.mode === 'slide' ? recordingTarget.slideId : null;
        const targetSlide =
          currentTargetSlideId && currentTargetSlideId !== slideId
            ? nextSlides.find((slide) => slide.id === currentTargetSlideId) ?? null
            : recordingTarget?.mode === 'freeboard'
              ? null
              : nextSlides[deleteIndex] ?? nextSlides[deleteIndex - 1] ?? null;
        const nextTarget: RecordingTarget = recordingTarget?.mode === 'freeboard'
          ? recordingTarget
          : targetSlide
          ? {
              frame: targetSlide.frame,
              mode: 'slide',
              slideId: targetSlide.id,
            }
          : getFreeboardRecordingTarget();
        const nextActiveSlide =
          activeSlideId && activeSlideId !== slideId
            ? nextSlides.find((slide) => slide.id === activeSlideId) ?? null
            : targetSlide;

        activeScopeRef.current = nextActiveSlide?.id ?? null;
        setActiveSlideId(nextActiveSlide?.id ?? null);
        setSelectedIds([]);
        setTextEditor(null);
        setHistory((current) => ({
          ...pruneHistoryScope(current, slideId),
          present: cloneElements(nextActiveSlide?.elements ?? freeboardElements),
        }));
        syncPreparingRecordingTarget(nextTarget);
        return;
      }

      if (activeSlideId !== slideId) {
        const nextActiveSlide = activeSlideId ? nextSlides.find((slide) => slide.id === activeSlideId) ?? null : null;
        setHistory((current) => ({
          ...pruneHistoryScope(current, slideId),
          present: cloneElements(nextActiveSlide?.elements ?? elements),
        }));
        return;
      }

      const nextActiveSlide = nextSlides[Math.min(deleteIndex, nextSlides.length - 1)] ?? null;
      activeScopeRef.current = nextActiveSlide?.id ?? null;
      setActiveSlideId(nextActiveSlide?.id ?? null);
      setSelectedIds([]);
      setTextEditor(null);
      setHistory((current) => ({
        ...pruneHistoryScope(current, slideId),
        present: cloneElements(nextActiveSlide?.elements ?? freeboardElements),
      }));
    },
    [
      activeSlideId,
      elements,
      freeboardElements,
      getFreeboardRecordingTarget,
      isSlideStructureLocked,
      recordingStatus,
      recordingTarget,
      slideAspectRatio,
      slides,
      syncPreparingRecordingTarget,
    ]
  );

  const reorderSlides = useCallback(
    (sourceSlideId: string, targetSlideId: string) => {
      if (isSlideStructureLocked) {
        return;
      }

      if (sourceSlideId === targetSlideId) {
        return;
      }

      const currentSlides = materializeActiveSlideElements(slides, activeSlideId, elements);
      const sourceIndex = currentSlides.findIndex((slide) => slide.id === sourceSlideId);
      const targetIndex = currentSlides.findIndex((slide) => slide.id === targetSlideId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return;
      }

      const orderedSlides = [...currentSlides];
      const [movedSlide] = orderedSlides.splice(sourceIndex, 1);
      orderedSlides.splice(targetIndex, 0, movedSlide);
      const nextSlides = reflowSlideFrames(orderedSlides, slideAspectRatio);
      setSlides(nextSlides);

      if (activeSlideId) {
        const nextActiveSlide = nextSlides.find((slide) => slide.id === activeSlideId);
        if (nextActiveSlide) {
          setHistory((current) => ({ ...current, present: cloneElements(nextActiveSlide.elements) }));
        }
      }

      if (recordingStatus === 'preparing' && recordingTarget?.mode === 'slide' && recordingTarget.slideId) {
        const nextTargetSlide = nextSlides.find((slide) => slide.id === recordingTarget.slideId);
        if (nextTargetSlide) {
          syncPreparingRecordingTarget({
            frame: nextTargetSlide.frame,
            mode: 'slide',
            slideId: nextTargetSlide.id,
          });
        }
      }
    },
    [activeSlideId, elements, isSlideStructureLocked, recordingStatus, recordingTarget, slideAspectRatio, slides, syncPreparingRecordingTarget]
  );

  const duplicateSlide = useCallback(
    (slideId: string) => {
      if (isSlideStructureLocked) {
        return;
      }

      const currentSlides = materializeActiveSlideElements(slides, activeSlideId, elements);
      const sourceIndex = currentSlides.findIndex((slide) => slide.id === slideId);
      if (sourceIndex < 0) {
        return;
      }

      const sourceSlide = currentSlides[sourceIndex];
      const sourceName = getSlideDisplayName(sourceSlide, sourceIndex);
      const duplicatedSlide: Slide = {
        ...sourceSlide,
        id: `slide-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: `${sourceName} copy`,
        elements: duplicateElements(sourceSlide.elements, generateElementId),
      };
      const nextSlides = reflowSlideFrames([
        ...currentSlides.slice(0, sourceIndex + 1),
        duplicatedSlide,
        ...currentSlides.slice(sourceIndex + 1),
      ], slideAspectRatio);
      const nextDuplicatedSlide = nextSlides.find((slide) => slide.id === duplicatedSlide.id) ?? duplicatedSlide;

      setSlides(nextSlides);
      activeScopeRef.current = duplicatedSlide.id;
      setActiveSlideId(duplicatedSlide.id);
      setSelectedIds([]);
      setTextEditor(null);
      setHistory((current) => ({ ...current, present: cloneElements(nextDuplicatedSlide.elements) }));
      syncPreparingRecordingTarget({
        frame: nextDuplicatedSlide.frame,
        mode: 'slide',
        slideId: nextDuplicatedSlide.id,
      });
    },
    [activeSlideId, elements, isSlideStructureLocked, slideAspectRatio, slides, syncPreparingRecordingTarget]
  );

  const renameSlide = useCallback((slideId: string, nextName: string) => {
    if (isSlideStructureLocked) {
      return;
    }

    const trimmedName = nextName.trim();
    setSlides((current) =>
      current.map((slide, index) =>
        slide.id === slideId
          ? {
              ...slide,
              name: trimmedName || getSlideDisplayName(slide, index),
            }
          : slide
      )
    );
  }, [isSlideStructureLocked]);
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const page = pageRef.current;
      if (!page || !event.ctrlKey) {
        return;
      }

      const rect = page.getBoundingClientRect();
      const isInsideBoard =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInsideBoard) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (recordingStatus !== 'idle') {
        return;
      }

      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const direction = event.deltaY < 0 ? 1 : -1;
      applyZoomAtScreenPoint((currentZoom) => getNextManualZoom(currentZoom, direction), anchor);
    };

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, [applyZoomAtScreenPoint, recordingStatus]);

  useEffect(() => {
    const handleZoomKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTypingTarget || !(event.ctrlKey || event.metaKey)) {
        return;
      }

      const isZoomOutKey = event.key === '-' || event.code === 'Minus' || event.code === 'NumpadSubtract';
      const isZoomInKey = event.key === '=' || event.key === '+' || event.code === 'Equal' || event.code === 'NumpadAdd';

      if (!isZoomOutKey && !isZoomInKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (recordingStatus !== 'idle') {
        return;
      }

      if (isZoomOutKey) {
        zoomOut();
      } else {
        zoomIn();
      }
    };

    window.addEventListener('keydown', handleZoomKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleZoomKeyDown, { capture: true });
  }, [recordingStatus, zoomIn, zoomOut]);


  const handleLayerAction = useCallback(
    (action: LayerAction) => {
      if (activeTool !== 'select' || selectedIds.length === 0) {
        return;
      }

      const nextElements = reorderElementsByLayerAction(elements, selectedIds, action);
      onCommitElementsChange(elements, nextElements);
    },
    [activeTool, elements, onCommitElementsChange, selectedIds]
  );

  const handleInsertImage = async (file: File) => {
    const src = await readFileAsDataUrl(file);
    const dimensions = await readImageDimensions(src);
    const maxWidth = 360;
    const maxHeight = 260;
    const scale = Math.min(1, maxWidth / dimensions.width, maxHeight / dimensions.height);
    const width = Math.max(80, Math.round(dimensions.width * scale));
    const height = Math.max(80, Math.round(dimensions.height * scale));
    const activeScopeId = activeScopeRef.current;
    const activeSlideForInsert = activeScopeId ? slides.find((slide) => slide.id === activeScopeId) ?? null : null;
    const insertPosition = activeSlideForInsert
      ? getCenteredElementPositionInFrame(activeSlideForInsert.frame, width, height)
      : getViewportInsertPosition(viewport, width, height);
    const { x, y } = insertPosition;

    const nextElement: ImageElement = {
      id: generateElementId(),
      type: 'image',
      x,
      y,
      width,
      height,
      src,
      fileName: file.name,
      opacity: clampOpacity(shapeDefaults.opacity),
    };

    const nextElements = [...elements, nextElement];
    onCommitElementsChange(elements, nextElements);
    setSelectedIds([nextElement.id]);
    setActiveTool('select');
  };

  const selectedElements = useMemo(
    () => allBoardElements.filter((element) => selectedIds.includes(element.id)),
    [allBoardElements, selectedIds]
  );

  const selectedTextElement = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null;
    }

    const element = allBoardElements.find((item) => item.id === selectedIds[0]);
    return element?.type === 'text' ? element : null;
  }, [allBoardElements, selectedIds]);

  const selectedColorElements = useMemo(
    () =>
      allBoardElements.filter(
        (element): element is Extract<BoardElement, { type: 'draw' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' }> =>
          selectedIds.includes(element.id) && isColorEditableElement(element)
      ),
    [allBoardElements, selectedIds]
  );

  const selectedColorStyle = useMemo(() => {
    if (selectedElements.length === 0) {
      return null;
    }

    return {
      color: selectedColorElements[0]?.color,
      opacity: clampOpacity(selectedElements[0].opacity),
    };
  }, [selectedColorElements, selectedElements]);

  const selectedStrokeElements = useMemo(
    () => allBoardElements.filter((element) => selectedIds.includes(element.id) && isStrokeWidthEditableElement(element)),
    [allBoardElements, selectedIds]
  );


  const selectedFillElements = useMemo(
    () => allBoardElements.filter((element) => selectedIds.includes(element.id) && isFillableElement(element)),
    [allBoardElements, selectedIds]
  );

  const selectedCornerRadiusElements = useMemo(
    () => allBoardElements.filter((element) => selectedIds.includes(element.id) && isCornerRadiusEditableElement(element)),
    [allBoardElements, selectedIds]
  );

  const toolbarFillColor = useMemo(() => {
    if (activeTool === 'select') {
      return selectedFillElements.length > 0 ? normalizeFillColor(selectedFillElements[0].fillColor) : undefined;
    }

    if (isFillColorTool(activeTool)) {
      return normalizeFillColor(shapeDefaults.fillColor);
    }

    return undefined;
  }, [activeTool, selectedFillElements, shapeDefaults.fillColor]);
  const toolbarStrokeWidth = useMemo(() => {
    if (activeTool === 'select') {
      return selectedStrokeElements.length > 0 ? clampStrokeWidth(selectedStrokeElements[0].strokeWidth) : null;
    }

    if (isStrokeWidthTool(activeTool)) {
      return clampStrokeWidth(shapeDefaults.strokeWidth);
    }

    return null;
  }, [activeTool, selectedStrokeElements, shapeDefaults.strokeWidth]);

  const toolbarStrokeStyle = useMemo(() => {
    if (activeTool === 'select') {
      return selectedStrokeElements.length > 0 ? normalizeStrokeStyle(selectedStrokeElements[0].strokeStyle) : null;
    }

    if (isStrokeWidthTool(activeTool)) {
      return normalizeStrokeStyle(shapeDefaults.strokeStyle);
    }

    return null;
  }, [activeTool, selectedStrokeElements, shapeDefaults.strokeStyle]);

  const toolbarCornerRadius = useMemo(() => {
    if (activeTool === 'select') {
      return selectedCornerRadiusElements.length > 0 ? clampCornerRadius(selectedCornerRadiusElements[0].cornerRadius) : null;
    }

    if (isCornerRadiusTool(activeTool)) {
      return clampCornerRadius(shapeDefaults.cornerRadius);
    }

    return null;
  }, [activeTool, selectedCornerRadiusElements, shapeDefaults.cornerRadius]);

  const toolbarTextStyle = useMemo(() => {
    if (activeTool === 'text') {
      return selectedTextElement ?? textDefaults;
    }

    if (activeTool === 'select') {
      return selectedTextElement;
    }

    return null;
  }, [activeTool, selectedTextElement, textDefaults]);

  const toolbarColorStyle = useMemo(() => {
    if (activeTool === 'text') {
      const textStyle = selectedTextElement ?? textDefaults;
      return { color: textStyle.color, opacity: clampOpacity(textStyle.opacity) };
    }

    if (isColorTool(activeTool)) {
      return { ...shapeDefaults, opacity: clampOpacity(shapeDefaults.opacity) };
    }

    if (activeTool === 'select') {
      return selectedColorStyle;
    }

    return null;
  }, [activeTool, selectedColorStyle, selectedTextElement, shapeDefaults, textDefaults]);

  const selectedBounds = useMemo(() => {
    return getSelectionBounds(selectedElements);
  }, [selectedElements]);

  const handleRotateSelection = useCallback(
    (degrees: number) => {
      if (activeTool !== 'select' || selectedIds.length === 0) {
        return;
      }

      const selectedSet = new Set(selectedIds);
      const scopeSelectedElements = elements.filter((element) => selectedSet.has(element.id));
      const scopeSelectionBounds = getSelectionBounds(scopeSelectedElements);
      if (!scopeSelectionBounds) {
        return;
      }

      const center = { x: scopeSelectionBounds.cx, y: scopeSelectionBounds.cy };
      const nextElements = elements.map((element) =>
        selectedSet.has(element.id) ? rotateElementAroundSelection(element, center, degrees) : element
      );

      onCommitElementsChange(elements, nextElements);
    },
    [activeTool, elements, onCommitElementsChange, selectedIds]
  );

  const handleFlipSelection = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      if (activeTool !== 'select' || selectedIds.length === 0) {
        return;
      }

      const selectedSet = new Set(selectedIds);
      const scopeSelectedElements = elements.filter((element) => selectedSet.has(element.id));
      const scopeSelectionBounds = getSelectionBounds(scopeSelectedElements);
      if (!scopeSelectionBounds) {
        return;
      }

      const center = { x: scopeSelectionBounds.cx, y: scopeSelectionBounds.cy };
      const nextElements = elements.map((element) =>
        selectedSet.has(element.id) ? flipElementAroundSelection(element, center, axis) : element
      );

      onCommitElementsChange(elements, nextElements);
    },
    [activeTool, elements, onCommitElementsChange, selectedIds]
  );

  const getCurrentRecordingFrame = useCallback(() => {
    const rect = pageRef.current?.getBoundingClientRect();
    const currentSlides = stageSlides;
    const activeSlide = activeSlideId
      ? currentSlides.find((slide) => slide.id === activeSlideId) ?? currentSlides[0] ?? null
      : currentSlides[0] ?? null;

    return currentSlides.length > 0 && activeSlide
      ? {
          frame: activeSlide.frame,
          mode: 'slide' as const,
          slideId: activeSlide.id,
        }
      : {
          frame: getDefaultRecordingFrame(rect, viewport, slideAspectRatio),
          mode: 'freeboard' as const,
          slideId: null,
        };
  }, [activeSlideId, slideAspectRatio, stageSlides, viewport]);

  const finishRecordingSlideTransition = useCallback(
    (transition: RecordingTransition) => {
      const currentSlides = materializeActiveSlideElements(slides, activeSlideId, elements);
      const nextSlide = currentSlides.find((slide) => slide.id === transition.toSlideId);

      if (!nextSlide) {
        setSlideTransition(null);
        recordingRenderStateRef.current = recordingRenderStateRef.current
          ? {
              ...recordingRenderStateRef.current,
              transition: null,
            }
          : null;
        return;
      }

      const nextTarget: RecordingTarget = {
        frame: nextSlide.frame,
        mode: 'slide',
        slideId: nextSlide.id,
      };

      setSlides(currentSlides);
      activeScopeRef.current = nextSlide.id;
      setActiveSlideId(nextSlide.id);
      setSelectedIds([]);
      setTextEditor(null);
      setHistory((current) => ({
        ...current,
        present: cloneElements(nextSlide.elements),
      }));
      setRecordingTarget(nextTarget);
      setRecordingFrame(nextTarget.frame);
      setViewport(getRecordingPresentationViewport(nextTarget.frame));
      setSlideTransition(null);

      if (recordingRuntimeRef.current) {
        recordingRuntimeRef.current.frame = nextTarget.frame;
        recordingRuntimeRef.current.mode = 'slide';
      }

      recordingRenderStateRef.current = {
        ...(recordingRenderStateRef.current ?? {
          slides: currentSlides,
          activeSlideId: nextSlide.id,
          elements: nextSlide.elements,
          slideAspectRatio,
          viewport,
          transition: null,
        }),
        slides: currentSlides,
        activeSlideId: nextSlide.id,
        elements: nextSlide.elements,
        transition: null,
      };
      previousActiveSlideIdRef.current = nextSlide.id;
    },
    [activeSlideId, elements, getRecordingPresentationViewport, slideAspectRatio, slides, viewport]
  );

  const switchRecordingSlide = useCallback(
    (slideId: string) => {
      if (slideTransition) {
        return;
      }

      const currentSlides = materializeActiveSlideElements(slides, activeSlideId, elements);
      const nextSlide = currentSlides.find((slide) => slide.id === slideId);

      if (!nextSlide) {
        return;
      }

      if (recordingStatus === 'idle' || recordingTarget?.mode !== 'slide' || !recordingTarget.slideId) {
        setSlides(currentSlides);
        activeScopeRef.current = nextSlide.id;
        setActiveSlideId(nextSlide.id);
        setSelectedIds([]);
        setTextEditor(null);
        setHistory((current) => ({
          ...current,
          present: cloneElements(nextSlide.elements),
        }));

        if (recordingStatus !== 'idle') {
          const nextTarget: RecordingTarget = {
            frame: nextSlide.frame,
            mode: 'slide',
            slideId: nextSlide.id,
          };
          setRecordingTarget(nextTarget);
          setRecordingFrame(nextTarget.frame);
          setViewport(getRecordingPresentationViewport(nextTarget.frame));
        }
        return;
      }

      const fromIndex = currentSlides.findIndex((slide) => slide.id === recordingTarget.slideId);
      const toIndex = currentSlides.findIndex((slide) => slide.id === nextSlide.id);

      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return;
      }

      const firstIndex = Math.max(0, Math.min(fromIndex, toIndex) - 1);
      const lastIndex = Math.min(currentSlides.length - 1, Math.max(fromIndex, toIndex) + 1);
      const transition: RecordingTransition = {
        fromSlideId: recordingTarget.slideId,
        toSlideId: nextSlide.id,
        fromIndex,
        toIndex,
        firstIndex,
        lastIndex,
        direction: toIndex > fromIndex ? 'next' : 'prev',
        startTime: performance.now(),
        duration: getSlideTransitionDuration(Math.abs(toIndex - fromIndex)),
        snapshots: currentSlides.slice(firstIndex, lastIndex + 1).map((slide, index) => ({
          frame: slide.frame,
          elements: cloneElements(slide.elements),
          name: getSlideDisplayName(slide, firstIndex + index),
        })),
      };

      setSlides(currentSlides);
      setSlideTransition(transition);
      recordingRenderStateRef.current = {
        ...(recordingRenderStateRef.current ?? {
          slides: currentSlides,
          activeSlideId: recordingTarget.slideId,
          elements,
          slideAspectRatio,
          viewport,
          transition,
        }),
        slides: currentSlides,
        transition,
      };
    },
    [
      activeSlideId,
      elements,
      getRecordingPresentationViewport,
      recordingStatus,
      recordingTarget,
      slideAspectRatio,
      slideTransition,
      slides,
      viewport,
    ]
  );

  const handleActiveScopeChange = useCallback(
    (scopeId: string | null) => {
      if (recordingStatus !== 'idle' && scopeId) {
        if (recordingTarget?.mode === 'slide' && recordingTarget.slideId === scopeId) {
          activateScope(scopeId);
          return;
        }

        switchRecordingSlide(scopeId);
        return;
      }

      activateScope(scopeId);
    },
    [activateScope, recordingStatus, recordingTarget, switchRecordingSlide]
  );

  useEffect(() => {
    if (!slideTransition) {
      return;
    }

    let frameId: number | null = null;
    const tick = () => {
      const progress = getSlideTransitionProgress(slideTransition, performance.now());
      setSlideTransitionTick(performance.now());

      if (progress >= 1) {
        finishRecordingSlideTransition(slideTransition);
        return;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [finishRecordingSlideTransition, slideTransition]);

  const enterRecordingPreparing = useCallback(() => {
    const target = getCurrentRecordingFrame();
    normalViewportBeforeRecordingRef.current = viewport;
    setRecordingError(null);
    setRecordingTarget(target);
    setRecordingFrame(target.frame);
    setViewport(getRecordingPresentationViewport(target.frame));
    setRecordingStatus('preparing');
  }, [getCurrentRecordingFrame, getRecordingPresentationViewport, viewport]);

  const cancelRecordingPreparing = useCallback(() => {
    setRecordingTarget(null);
    setRecordingFrame(null);
    setRecordingStatus('idle');
    restoreNormalViewport();
  }, [restoreNormalViewport]);

  useEffect(() => {
    if (recordingStatus === 'idle' || !recordingTarget) {
      return;
    }

    const refitRecordingViewport = () => {
      setViewport(getRecordingPresentationViewport(recordingTarget.frame));
    };

    refitRecordingViewport();
    window.addEventListener('resize', refitRecordingViewport);
    return () => window.removeEventListener('resize', refitRecordingViewport);
  }, [getRecordingPresentationViewport, recordingStatus, recordingTarget]);

  const recordingSlideIndex = useMemo(
    () =>
      recordingStatus !== 'idle' && recordingTarget?.mode === 'slide' && recordingTarget.slideId
        ? stageSlides.findIndex((slide) => slide.id === recordingTarget.slideId)
        : -1,
    [recordingStatus, recordingTarget, stageSlides]
  );

  const goToRecordingSlideOffset = useCallback(
    (offset: -1 | 1) => {
      if (slideTransition || recordingStatus === 'idle' || recordingTarget?.mode !== 'slide' || recordingSlideIndex < 0) {
        return;
      }

      const nextSlide = stageSlides[recordingSlideIndex + offset];
      if (!nextSlide) {
        return;
      }

      switchRecordingSlide(nextSlide.id);
    },
    [recordingSlideIndex, recordingStatus, recordingTarget, slideTransition, stageSlides, switchRecordingSlide]
  );

  useEffect(() => {
    const handleRecordingSlideKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTypingTarget || recordingStatus === 'idle' || recordingTarget?.mode !== 'slide') {
        return;
      }

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      goToRecordingSlideOffset(event.key === 'ArrowLeft' ? -1 : 1);
    };

    window.addEventListener('keydown', handleRecordingSlideKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleRecordingSlideKeyDown, { capture: true });
  }, [goToRecordingSlideOffset, recordingStatus, recordingTarget]);

  const handleToolbarTextStyleChange = (patch: Partial<TextStyle>) => {
    setTextDefaults((current) => ({ ...current, ...patch }));

    if (!selectedTextElement) {
      return;
    }

    onElementsChange((current) =>
      current.map((element) =>
        element.id === selectedTextElement.id && element.type === 'text'
          ? {
              ...element,
              ...patch,
            }
          : element
      )
    );
  };


  const stopRecording = useCallback(() => {
    const runtime = recordingRuntimeRef.current;
    if (!runtime || runtime.recorder.state === 'inactive') {
      return;
    }

    freezeRecordingTimer();
    runtime.recorder.stop();
  }, [freezeRecordingTimer]);

  const pauseRecording = useCallback(() => {
    const runtime = recordingRuntimeRef.current;
    if (!runtime || runtime.recorder.state !== 'recording') {
      return;
    }

    runtime.recorder.pause();
    freezeRecordingTimer();
    setRecordingStatus('paused');
  }, [freezeRecordingTimer]);

  const resumeRecording = useCallback(() => {
    const runtime = recordingRuntimeRef.current;
    if (!runtime || runtime.recorder.state !== 'paused') {
      return;
    }

    runtime.recorder.resume();
    startRecordingTimer();
    setRecordingStatus('recording');
  }, [startRecordingTimer]);

  const startRecording = useCallback(() => {
    if (recordingRuntimeRef.current) {
      return;
    }

    const target = recordingTarget ?? getCurrentRecordingFrame();
    const currentSlides = stageSlides;
    const activeSlide = target.slideId ? currentSlides.find((slide) => slide.id === target.slideId) ?? null : null;
    const recordingSlideId = target.slideId;
    const mode = target.mode;
    if (mode === 'slide' && !activeSlideId && recordingSlideId) {
      activeScopeRef.current = recordingSlideId;
      setActiveSlideId(recordingSlideId);
      setSelectedIds([]);
      setTextEditor(null);
      setHistory((current) => ({
        ...current,
        present: cloneElements(activeSlide!.elements),
      }));
    }
    const frame = target.frame;
    const outputSize = getRecordingOutputSize(frame);
    const canvas = document.createElement('canvas');
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    const context = canvas.getContext('2d');

    if (!context) {
      setRecordingStatus('idle');
      setRecordingFrame(null);
      setRecordingTarget(null);
      restoreNormalViewport();
      setRecordingError('Canvas recording is not available in this browser.');
      return;
    }

    if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      setRecordingStatus('idle');
      setRecordingFrame(null);
      setRecordingTarget(null);
      restoreNormalViewport();
      setRecordingError('MediaRecorder is not available in this browser.');
      return;
    }

    const canvasStream = canvas.captureStream(RECORDING_FPS);
    const stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...(cameraSettingsRef.current.audioDeviceId ? microphoneStream?.getAudioTracks() ?? [] : []),
    ]);
    const mimeType = getSupportedRecordingMimeType();
    const recorderOptions = {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: RECORDING_VIDEO_BITS_PER_SECOND,
    };
    let recorder: MediaRecorder;

    try {
      recorder = new MediaRecorder(stream, recorderOptions);
    } catch {
      stream.getVideoTracks().forEach((track) => track.stop());
      setRecordingStatus('idle');
      setRecordingFrame(null);
      setRecordingTarget(null);
      restoreNormalViewport();
      setRecordingError('Recording could not be started in this browser.');
      return;
    }
    const chunks: Blob[] = [];
    const runtime: RecordingRuntime = {
      canvas,
      context,
      stream,
      recorder,
      chunks,
      frame,
      mode,
      animationFrameId: null,
    };

    recordingRuntimeRef.current = runtime;
    recordingRenderStateRef.current = {
      slides: currentSlides,
      activeSlideId: mode === 'slide' ? recordingSlideId : activeSlideId,
      elements,
      slideAspectRatio,
      viewport,
      transition: null,
    };
    previousActiveSlideIdRef.current = mode === 'slide' ? recordingSlideId : activeSlideId;
    setRecordingError(null);
    setRecordingTarget(target);
    setRecordingFrame(frame);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = () => {
      setRecordingError('Recording failed. Please try again.');
    };

    recorder.onstop = () => {
      if (runtime.animationFrameId !== null) {
        cancelAnimationFrame(runtime.animationFrameId);
      }
      runtime.stream.getVideoTracks().forEach((track) => track.stop());
      recordingRuntimeRef.current = null;
      setRecordingFrame(null);
      setRecordingTarget(null);
      setRecordingStatus('idle');
      resetRecordingTimer();
      restoreNormalViewport();

      if (chunks.length === 0) {
        setRecordingError('No video data was recorded.');
        return;
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      downloadRecordingBlob(blob);
    };

    const renderFrame = () => {
      const state = recordingRenderStateRef.current;
      if (state) {
        drawRecordingFrame(
          runtime.context,
          runtime.canvas,
          runtime.frame,
          runtime.mode,
          state,
          imageCacheRef.current,
          cameraSettingsRef.current,
          cameraRecordingVideoRef.current,
          recordingBackgroundRef.current.color,
          recordingVisualSettingsRef.current,
          recordingPointerRef.current
        );
      }

      runtime.animationFrameId = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    try {
      recorder.start(250);
      recordingAccumulatedMsRef.current = 0;
      setRecordingElapsedMs(0);
      startRecordingTimer();
      setRecordingStatus('recording');
    } catch {
      if (runtime.animationFrameId !== null) {
        cancelAnimationFrame(runtime.animationFrameId);
      }
      runtime.stream.getVideoTracks().forEach((track) => track.stop());
      recordingRuntimeRef.current = null;
      setRecordingFrame(null);
      setRecordingTarget(null);
      resetRecordingTimer();
      restoreNormalViewport();
      setRecordingError('Recording could not be started in this browser.');
    }
  }, [activeSlideId, elements, getCurrentRecordingFrame, microphoneStream, recordingTarget, resetRecordingTimer, restoreNormalViewport, stageSlides, startRecordingTimer, viewport]);
  const handleToolbarColorChange = (
    patch: Partial<ColorStyle>,
    options: { commit?: boolean; target?: 'selection' | 'tool' } = {}
  ) => {
    const hasColorPatch = patch.color !== undefined;
    const hasOpacityPatch = patch.opacity !== undefined;

    if (!hasColorPatch && !hasOpacityPatch) {
      return;
    }

    const target = options.target ?? (selectedElements.length > 0 && activeTool === 'select' ? 'selection' : 'tool');
    const shouldCommit = options.commit ?? true;
    const normalizedPatch: Partial<ColorStyle> = {
      ...(hasColorPatch ? { color: patch.color } : {}),
      ...(hasOpacityPatch ? { opacity: clampOpacity(patch.opacity) } : {}),
    };

    if (target === 'tool') {
      if (activeTool === 'text') {
        setTextDefaults((current) => ({ ...current, ...normalizedPatch }));
        return;
      }

      if (isShapeColorTool(activeTool)) {
        setShapeDefaults((current) => ({ ...current, ...normalizedPatch }));
      }

      return;
    }

    if (selectedElements.length === 0) {
      return;
    }

    if (hasOpacityPatch) {
      if (!shouldCommit && !opacityChangeRef.current) {
        opacityChangeRef.current = {
          previousElements: cloneElements(elements),
          targetIds: selectedElements.map((element) => element.id),
        };
      }

      const snapshot = opacityChangeRef.current;
      const targetIds = snapshot?.targetIds ?? selectedElements.map((element) => element.id);
      const selectedElementSet = new Set(targetIds);
      const nextElements = elements.map((element) =>
        selectedElementSet.has(element.id)
          ? {
              ...element,
              opacity: normalizedPatch.opacity,
            }
          : element
      );

      if (shouldCommit) {
        const previousElements = snapshot?.previousElements ?? cloneElements(elements);
        opacityChangeRef.current = null;
        onCommitElementsChange(previousElements, nextElements);
        return;
      }

      onElementsChange(nextElements);
      return;
    }

    const selectedColorIds = new Set(selectedColorElements.map((element) => element.id));
    if (selectedColorIds.size === 0) {
      return;
    }

    const nextElements = elements.map((element) =>
      selectedColorIds.has(element.id) && isColorEditableElement(element)
        ? {
            ...element,
            color: patch.color!,
          }
        : element
    );

    onCommitElementsChange(elements, nextElements);
  };

  const handleStrokeWidthChange = (
    value: number,
    options: { commit?: boolean; target?: 'selection' | 'tool' } = {}
  ) => {
    const normalizedStrokeWidth = clampStrokeWidth(value);
    const target = options.target ?? (selectedStrokeElements.length > 0 && activeTool === 'select' ? 'selection' : 'tool');
    const shouldCommit = options.commit ?? true;

    if (target === 'tool') {
      if (isStrokeWidthTool(activeTool)) {
        setShapeDefaults((current) => ({ ...current, strokeWidth: normalizedStrokeWidth }));
      }

      return;
    }

    if (selectedStrokeElements.length === 0) {
      return;
    }

    if (!shouldCommit && !strokeWidthChangeRef.current) {
      strokeWidthChangeRef.current = {
        previousElements: cloneElements(elements),
        targetIds: selectedStrokeElements.map((element) => element.id),
      };
    }

    const snapshot = strokeWidthChangeRef.current;
    const targetIds = snapshot?.targetIds ?? selectedStrokeElements.map((element) => element.id);
    const selectedElementSet = new Set(targetIds);
    const nextElements = elements.map((element) =>
      selectedElementSet.has(element.id) && isStrokeWidthEditableElement(element)
        ? {
            ...element,
            strokeWidth: normalizedStrokeWidth,
          }
        : element
    );

    if (shouldCommit) {
      const previousElements = snapshot?.previousElements ?? cloneElements(elements);
      strokeWidthChangeRef.current = null;
      onCommitElementsChange(previousElements, nextElements);
      return;
    }

    onElementsChange(nextElements);
  };
  const handleCornerRadiusChange = (
    value: number,
    options: { commit?: boolean; target?: 'selection' | 'tool' } = {}
  ) => {
    const normalizedCornerRadius = clampCornerRadius(value);
    const target = options.target ?? (selectedCornerRadiusElements.length > 0 && activeTool === 'select' ? 'selection' : 'tool');
    const shouldCommit = options.commit ?? true;

    if (target === 'tool') {
      if (isCornerRadiusTool(activeTool)) {
        setShapeDefaults((current) => ({ ...current, cornerRadius: normalizedCornerRadius }));
      }

      return;
    }

    if (selectedCornerRadiusElements.length === 0) {
      return;
    }

    if (!shouldCommit && !cornerRadiusChangeRef.current) {
      cornerRadiusChangeRef.current = {
        previousElements: cloneElements(elements),
        targetIds: selectedCornerRadiusElements.map((element) => element.id),
      };
    }

    const snapshot = cornerRadiusChangeRef.current;
    const targetIds = snapshot?.targetIds ?? selectedCornerRadiusElements.map((element) => element.id);
    const selectedElementSet = new Set(targetIds);
    const nextElements = elements.map((element) =>
      selectedElementSet.has(element.id) && isCornerRadiusEditableElement(element)
        ? {
            ...element,
            cornerRadius: normalizedCornerRadius,
          }
        : element
    );

    if (shouldCommit) {
      const previousElements = snapshot?.previousElements ?? cloneElements(elements);
      cornerRadiusChangeRef.current = null;
      onCommitElementsChange(previousElements, nextElements);
      return;
    }

    onElementsChange(nextElements);
  };

  const handleFillColorChange = (
    value: string | null,
    options: { commit?: boolean; target?: 'selection' | 'tool' } = {}
  ) => {
    const normalizedFillColor = normalizeFillColor(value);
    const target = options.target ?? (selectedFillElements.length > 0 && activeTool === 'select' ? 'selection' : 'tool');

    if (target === 'tool') {
      if (isFillColorTool(activeTool)) {
        setShapeDefaults((current) => ({ ...current, fillColor: normalizedFillColor }));
      }

      return;
    }

    if (selectedFillElements.length === 0) {
      return;
    }

    const selectedElementSet = new Set(selectedFillElements.map((element) => element.id));
    const nextElements = elements.map((element) =>
      selectedElementSet.has(element.id) && isFillableElement(element)
        ? {
            ...element,
            fillColor: normalizedFillColor,
          }
        : element
    );

    onCommitElementsChange(elements, nextElements);
  };
  const handleStrokeStyleChange = (
    value: StrokeStyle,
    options: { commit?: boolean; target?: 'selection' | 'tool' } = {}
  ) => {
    const normalizedStrokeStyle = normalizeStrokeStyle(value);
    const target = options.target ?? (selectedStrokeElements.length > 0 && activeTool === 'select' ? 'selection' : 'tool');

    if (target === 'tool') {
      if (isStrokeWidthTool(activeTool)) {
        setShapeDefaults((current) => ({ ...current, strokeStyle: normalizedStrokeStyle }));
      }

      return;
    }

    if (selectedStrokeElements.length === 0) {
      return;
    }

    const selectedElementSet = new Set(selectedStrokeElements.map((element) => element.id));
    const nextElements = elements.map((element) =>
      selectedElementSet.has(element.id) && isStrokeWidthEditableElement(element)
        ? {
            ...element,
            strokeStyle: normalizedStrokeStyle,
          }
        : element
    );

    onCommitElementsChange(elements, nextElements);
  };
  const recordingElapsedLabel = formatRecordingElapsed(recordingElapsedMs);

  return (
    <div ref={pageRef} className="board-page">
      <TopToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onInsertImage={handleInsertImage}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={undo}
        onRedo={redo}
      />
      <LeftPropertiesPanel
        activeTool={activeTool}
        selectedCount={selectedIds.length}
        hasTextSelection={Boolean(selectedTextElement)}
        textStyle={toolbarTextStyle}
        colorStyle={toolbarColorStyle}
        strokeWidth={toolbarStrokeWidth}
        strokeStyle={toolbarStrokeStyle}
        fillColor={toolbarFillColor}
        cornerRadius={toolbarCornerRadius}
        onTextStyleChange={handleToolbarTextStyleChange}
        onColorChange={handleToolbarColorChange}
        onStrokeWidthChange={handleStrokeWidthChange}
        onStrokeStyleChange={handleStrokeStyleChange}
        onFillColorChange={handleFillColorChange}
        onCornerRadiusChange={handleCornerRadiusChange}
        canArrangeLayers={activeTool === 'select' && selectedIds.length > 0}
        onLayerAction={handleLayerAction}
        canTransformSelection={activeTool === 'select' && selectedIds.length > 0}
        onRotateSelection={handleRotateSelection}
        onFlipSelection={handleFlipSelection}
      />
      <FloatingControlBar
        onOpenSettings={onOpenSettings}
        onEnterPreparing={enterRecordingPreparing}
        onCancelPreparing={cancelRecordingPreparing}
        onStartRecording={startRecording}
        onPauseRecording={pauseRecording}
        onResumeRecording={resumeRecording}
        onStopRecording={stopRecording}
        onToggleTeleprompter={() => setIsTeleprompterOpen((current) => !current)}
        recordingStatus={recordingStatus}
        recordingElapsedLabel={recordingElapsedLabel}
      />
      {isTeleprompterOpen ? (
        <TeleprompterPanel
          value={teleprompterState}
          onChange={updateTeleprompterState}
          onClose={() => setIsTeleprompterOpen(false)}
        />
      ) : null}
      <video
        ref={cameraRecordingVideoRef}
        className="board-camera-capture-video"
        muted
        playsInline
        aria-hidden="true"
      />

      <div className="board-page__stage">
        <WhiteboardStage
          activeTool={activeTool}
          elements={elements}
          slides={stageSlides}
          freeboardElements={stageFreeboardElements}
          activeSlideId={activeSlideId}
          recordingFrame={recordingFrame}
          recordingOverlayStatus={recordingStatus}
          recordingSlideTransition={slideTransition}
          recordingSlideTransitionNow={slideTransitionTick}
          cameraSettings={cameraSettings}
          cameraStream={cameraStream}
          onCameraSettingsChange={onCameraSettingsChange}
          onRecordingPointerChange={(state) => {
            recordingPointerRef.current = state;
          }}
          selectedIds={selectedIds}
          selectedBounds={selectedBounds}
          textDefaults={textDefaults}
          shapeDefaults={shapeDefaults}
          textEditor={textEditor}
          viewport={viewport}
          onActiveSlideChange={handleActiveScopeChange}
          onActiveToolChange={setActiveTool}
          onCommitElementsChange={onCommitElementsChange}
          onCommitElementOwnerMigration={onCommitElementOwnerMigration}
          getScopeElements={getScopeElements}
          onElementsChange={onElementsChange}
          onSelectedIdsChange={setSelectedIds}
          onTextEditorChange={setTextEditor}
          onViewportChange={setViewport}
        />
      </div>

      <SlideNavigator
        slides={stageSlides}
        activeSlideId={activeSlideId}
        isStructureLocked={isSlideStructureLocked}
        onAddSlide={addSlide}
        onDeleteSlide={deleteSlide}
        onDuplicateSlide={duplicateSlide}
        onRenameSlide={renameSlide}
        onReorderSlide={reorderSlides}
        onSelectSlide={handleActiveScopeChange}
      />

      {recordingStatus !== 'idle' && recordingTarget?.mode === 'slide' && recordingFrame ? (
        <RecordingSlideSwitchButtons
          frame={recordingFrame}
          viewport={viewport}
          hasPrevious={!slideTransition && recordingSlideIndex > 0}
          hasNext={!slideTransition && recordingSlideIndex >= 0 && recordingSlideIndex < stageSlides.length - 1}
          onPrevious={() => goToRecordingSlideOffset(-1)}
          onNext={() => goToRecordingSlideOffset(1)}
        />
      ) : null}

      <ZoomControls
        zoom={viewport.zoom}
        canClear={elements.length > 0}
        locked={isRecordingViewportLocked}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onFitContent={fitContent}
        onZoomTo={zoomTo}
        onRequestClear={requestClearBoard}
      />
      {recordingError ? <div className="board-recording-error">{recordingError}</div> : null}
      {isClearConfirmOpen ? <ClearBoardConfirm onCancel={cancelClearBoard} onConfirm={confirmClearBoard} /> : null}
    </div>
  );
}

function RecordingSlideSwitchButtons({
  frame,
  viewport,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: {
  frame: SlideFrame;
  viewport: ViewportState;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const centerY = (frame.y + frame.height / 2) * viewport.zoom + viewport.y;
  const previousLeft = frame.x * viewport.zoom + viewport.x - 58;
  const nextLeft = (frame.x + frame.width) * viewport.zoom + viewport.x + 18;

  return (
    <>
      <button
        type="button"
        className="board-recording-slide-button board-recording-slide-button--previous"
        style={{ left: previousLeft, top: centerY }}
        onClick={onPrevious}
        disabled={!hasPrevious}
        aria-label="Previous slide"
      >
        {'\u2039'}
      </button>
      <button
        type="button"
        className="board-recording-slide-button board-recording-slide-button--next"
        style={{ left: nextLeft, top: centerY }}
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Next slide"
      >
        {'\u203a'}
      </button>
    </>
  );
}

function ZoomControls({
  zoom,
  canClear,
  locked,
  onZoomOut,
  onZoomIn,
  onFitContent,
  onZoomTo,
  onRequestClear,
}: {
  zoom: number;
  canClear: boolean;
  locked: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitContent: () => void;
  onZoomTo: (zoom: number) => void;
  onRequestClear: () => void;
}) {
  const percentage = Math.round(zoom * 100);
  const lockedFitTitle = locked ? '\u5f55\u5236\u6a21\u5f0f\u4e0b\u89c6\u56fe\u5df2\u81ea\u52a8\u9002\u5e94\u5f53\u524d\u5f55\u5236\u533a\u57df' : '\u9002\u5e94\u5185\u5bb9';
  const [isEditingZoom, setIsEditingZoom] = useState(false);
  const [zoomInput, setZoomInput] = useState(String(percentage));

  useEffect(() => {
    if (!isEditingZoom) {
      setZoomInput(String(percentage));
    }
  }, [isEditingZoom, percentage]);

  const commitZoomInput = () => {
    const parsedZoom = parseZoomInput(zoomInput);
    setIsEditingZoom(false);

    if (parsedZoom === null) {
      setZoomInput(String(percentage));
      return;
    }

    onZoomTo(parsedZoom);
  };

  return (
    <div
      className="board-zoom-controls"
      aria-label="Canvas zoom controls"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" className="board-zoom-controls__button" onClick={onZoomOut} disabled={locked || zoom <= MIN_VIEWPORT_ZOOM}>
        -
      </button>
      {isEditingZoom ? (
        <input
          className="board-zoom-controls__input"
          value={zoomInput}
          autoFocus
          onChange={(event) => setZoomInput(event.target.value)}
          onBlur={commitZoomInput}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitZoomInput();
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setZoomInput(String(percentage));
              setIsEditingZoom(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="board-zoom-controls__value"
          aria-label="Edit zoom percentage"
          title="Edit zoom percentage"
          onClick={() => {
            if (locked) {
              return;
            }

            setZoomInput(String(percentage));
            setIsEditingZoom(true);
          }}
        >
          {percentage}%
        </button>
      )}
      <button type="button" className="board-zoom-controls__button" onClick={onZoomIn} disabled={locked || zoom >= MAX_VIEWPORT_ZOOM}>
        +
      </button>
      <button type="button" className="board-zoom-controls__fit" onClick={onFitContent} disabled={locked} title={lockedFitTitle}>
        {'\u9002\u5e94\u5185\u5bb9'}
      </button>
      <button
        type="button"
        className="board-zoom-controls__clear"
        onClick={onRequestClear}
        disabled={!canClear}
      >
        {'\u6e05\u5c4f'}
      </button>
    </div>
  );
}



function ClearBoardConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="board-clear-confirm" role="dialog" aria-modal="true" aria-labelledby="board-clear-confirm-title">
      <div className="board-clear-confirm__panel">
        <p id="board-clear-confirm-title" className="board-clear-confirm__title">
          {'\u6e05\u7a7a\u5f53\u524d\u767d\u677f\u6240\u6709\u5185\u5bb9\uff1f'}
        </p>
        <p className="board-clear-confirm__description">{'\u6b64\u64cd\u4f5c\u53ef\u901a\u8fc7\u64a4\u9500\u6062\u590d\u3002'}</p>
        <div className="board-clear-confirm__actions">
          <button type="button" className="board-clear-confirm__button" onClick={onCancel}>
            {'\u53d6\u6d88'}
          </button>
          <button
            type="button"
            className="board-clear-confirm__button board-clear-confirm__button--danger"
            onClick={onConfirm}
          >
            {'\u6e05\u7a7a'}
          </button>
        </div>
      </div>
    </div>
  );
}
function SlideNavigator({
  slides,
  activeSlideId,
  isStructureLocked,
  onAddSlide,
  onDeleteSlide,
  onDuplicateSlide,
  onRenameSlide,
  onReorderSlide,
  onSelectSlide,
}: {
  slides: Slide[];
  activeSlideId: string | null;
  isStructureLocked: boolean;
  onAddSlide: () => void;
  onDeleteSlide: (slideId: string) => void;
  onDuplicateSlide: (slideId: string) => void;
  onRenameSlide: (slideId: string, nextName: string) => void;
  onReorderSlide: (sourceSlideId: string, targetSlideId: string) => void;
  onSelectSlide: (slideId: string) => void;
}) {
  const [draggingSlideId, setDraggingSlideId] = useState<string | null>(null);
  const [dragOverSlideId, setDragOverSlideId] = useState<string | null>(null);
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const lockedTitle = isStructureLocked ? '\u5f55\u5236\u4e2d\u4e0d\u80fd\u4fee\u6539\u5e7b\u706f\u7247\u7ed3\u6784' : undefined;

  useEffect(() => {
    if (!isStructureLocked) {
      return;
    }

    setDraggingSlideId(null);
    setDragOverSlideId(null);
    setEditingSlideId(null);
    setRenameDraft('');
  }, [isStructureLocked]);

  const beginRename = (slide: Slide) => {
    if (isStructureLocked) {
      return;
    }

    setEditingSlideId(slide.id);
    setRenameDraft(slide.name || '');
  };

  const cancelRename = () => {
    setEditingSlideId(null);
    setRenameDraft('');
  };

  const commitRename = () => {
    if (!editingSlideId || isStructureLocked) {
      cancelRename();
      return;
    }

    onRenameSlide(editingSlideId, renameDraft);
    cancelRename();
  };

  return (
    <aside className="slide-navigator" aria-label="Slide navigation">
      <div className="slide-navigator__header">
        <h2 className="slide-navigator__title">{`\u5e7b\u706f\u7247`}</h2>
      </div>
      <div className="slide-navigator__list">
        {slides.length === 0 ? (
          <button
            type="button"
            className="slide-navigator__empty"
            onClick={onAddSlide}
            disabled={isStructureLocked}
            title={lockedTitle}
          >
            <span className="slide-navigator__empty-plus">+</span>
            <span>{`\u70b9\u51fb\u6b64\u5904\u6dfb\u52a0\u7b2c\u4e00\u5f20\u5e7b\u706f\u7247`}</span>
          </button>
        ) : slides.map((slide, index) => {
          const isActive = slide.id === activeSlideId;
          const isEditing = editingSlideId === slide.id;
          return (
            <div
              key={slide.id}
              className={`slide-navigator__item${isActive ? ' slide-navigator__item--active' : ''}${
                draggingSlideId === slide.id ? ' slide-navigator__item--dragging' : ''
              }${dragOverSlideId === slide.id && draggingSlideId !== slide.id ? ' slide-navigator__item--drop-target' : ''}`}
              draggable={!isEditing && !isStructureLocked}
              onDragStart={(event) => {
                if (isStructureLocked) {
                  event.preventDefault();
                  return;
                }

                setDraggingSlideId(slide.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', slide.id);
              }}
              onDragOver={(event) => {
                if (isStructureLocked) {
                  return;
                }

                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOverSlideId(slide.id);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragOverSlideId((current) => (current === slide.id ? null : current));
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (isStructureLocked) {
                  setDraggingSlideId(null);
                  setDragOverSlideId(null);
                  return;
                }

                const sourceSlideId = draggingSlideId ?? event.dataTransfer.getData('text/plain');
                setDraggingSlideId(null);
                setDragOverSlideId(null);
                if (sourceSlideId) {
                  onReorderSlide(sourceSlideId, slide.id);
                }
              }}
              onDragEnd={() => {
                setDraggingSlideId(null);
                setDragOverSlideId(null);
              }}
            >
              <button type="button" className="slide-navigator__thumbnail-button" onClick={() => onSelectSlide(slide.id)}>
                <SlideThumbnail slide={slide} />
              </button>

              <div className="slide-navigator__meta">
                <span className="slide-navigator__page">{index + 1}</span>
                {isEditing ? (
                  <input
                    className="slide-navigator__rename-input"
                    value={renameDraft}
                    autoFocus
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitRename();
                      }

                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <button
                    type="button"
                    draggable={false}
                    className="slide-navigator__name"
                    title={lockedTitle ?? 'Double click to rename'}
                    disabled={isStructureLocked}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectSlide(slide.id);
                    }}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      beginRename(slide);
                    }}
                  >
                    {getSlideDisplayName(slide, index)}
                  </button>
                )}
              </div>

              <div className="slide-navigator__actions">
                <button
                  type="button"
                  className="slide-navigator__action"
                  aria-label="Rename slide"
                  title={lockedTitle ?? 'Rename slide'}
                  disabled={isStructureLocked}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    beginRename(slide);
                  }}
                >
                  {'\u270e'}
                </button>
                <button
                  type="button"
                  className="slide-navigator__action"
                  aria-label="Duplicate slide"
                  title={lockedTitle ?? 'Duplicate slide'}
                  disabled={isStructureLocked}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDuplicateSlide(slide.id);
                  }}
                >
                  {'\u29c9'}
                </button>
                <button
                  type="button"
                  className="slide-navigator__action slide-navigator__action--danger"
                  aria-label="Delete slide"
                  title={lockedTitle ?? 'Delete slide'}
                  disabled={isStructureLocked}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteSlide(slide.id);
                  }}
                >
                  {'\u00d7'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {slides.length > 0 ? (
        <button
          type="button"
          className="slide-navigator__add"
          onClick={onAddSlide}
          disabled={isStructureLocked}
          title={lockedTitle}
        >
          +
        </button>
      ) : null}
    </aside>
  );
}
function SlideThumbnail({ slide }: { slide: Slide }) {
  const { frame } = slide;

  return (
    <svg
      className="slide-navigator__thumbnail"
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      role="img"
      aria-label={`${slide.name} preview`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect className="slide-navigator__thumbnail-bg" {...frame} />
      {slide.elements.map((element) => renderSlideThumbnailElement(element))}
    </svg>
  );
}

function renderSlideThumbnailElement(element: BoardElement) {
  return (
    <g key={element.id} transform={getSvgElementTransform(element)} opacity={clampOpacity(element.opacity)}>
      {renderSlideThumbnailElementContent(element)}
    </g>
  );
}

function getSvgElementTransform(element: BoardElement) {
  const rotation = normalizeRotation(element.rotation ?? 0);
  const scaleX = element.flipX ? -1 : 1;
  const scaleY = element.flipY ? -1 : 1;

  if (!rotation && scaleX === 1 && scaleY === 1) {
    return undefined;
  }

  const bounds = getElementBounds(element);
  return `translate(${bounds.cx} ${bounds.cy}) rotate(${rotation}) scale(${scaleX} ${scaleY}) translate(${-bounds.cx} ${-bounds.cy})`;
}

function renderSlideThumbnailElementContent(element: BoardElement) {
  switch (element.type) {
    case 'draw':
      return (
        <polyline
          key={element.id}
          className="slide-thumbnail-element slide-thumbnail-element--stroke"
          style={getThumbnailStrokeElementStyle(element)}
          points={element.points.map((point) => [point.x, point.y].join(',')).join(' ')}
        />
      );
    case 'rectangle': {
      const box = normalizeThumbnailRect(element.x, element.y, element.width, element.height);
      const radius = clampCornerRadiusForSize(element.cornerRadius, box.width, box.height);
      return <rect key={element.id} className="slide-thumbnail-element slide-thumbnail-element--shape" style={getThumbnailShapeElementStyle(element)} rx={radius} ry={radius} {...box} />;
    }
    case 'ellipse': {
      const box = normalizeThumbnailRect(element.x, element.y, element.width, element.height);
      return (
        <ellipse
          key={element.id}
          className="slide-thumbnail-element slide-thumbnail-element--shape"
          style={getThumbnailShapeElementStyle(element)}
          cx={box.x + box.width / 2}
          cy={box.y + box.height / 2}
          rx={box.width / 2}
          ry={box.height / 2}
        />
      );
    }
    case 'line':
      return (
        <line
          key={element.id}
          className="slide-thumbnail-element slide-thumbnail-element--line"
          style={getThumbnailStrokeElementStyle(element)}
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
        />
      );
    case 'arrow': {
      const geometry = getThumbnailArrowGeometry(element);
      return (
        <g key={element.id}>
          <line
            className="slide-thumbnail-element slide-thumbnail-element--line slide-thumbnail-element--arrow-shaft"
            style={getThumbnailStrokeElementStyle(element)}
            x1={element.x1}
            y1={element.y1}
            x2={geometry?.shaftEnd.x ?? element.x2}
            y2={geometry?.shaftEnd.y ?? element.y2}
          />
          {geometry ? <polygon className="slide-thumbnail-element--arrowhead" points={geometry.points} style={{ fill: getElementColor(element), stroke: getElementColor(element), strokeWidth: Math.max(0.75, getCanvasElementStrokeWidth(element) * 0.35) }} /> : null}
        </g>
      );
    }
    case 'text':
      return (
        <foreignObject key={element.id} x={element.x} y={element.y} width={element.width} height={element.height}>
          <div
            className="slide-thumbnail-text"
            style={{ fontFamily: element.fontFamily, fontSize: `${element.fontSize}px`, color: element.color }}
          >
            {element.text || 'Text'}
          </div>
        </foreignObject>
      );
    case 'image': {
      const box = normalizeThumbnailRect(element.x, element.y, element.width, element.height);
      return <image key={element.id} href={element.src} preserveAspectRatio="none" {...box} />;
    }
    default:
      return null;
  }
}

function normalizeThumbnailRect(x: number, y: number, width: number, height: number) {
  const left = Math.min(x, x + width);
  const top = Math.min(y, y + height);
  return {
    x: left,
    y: top,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

function getThumbnailArrowGeometry(element: LinearElement) {
  const dx = element.x2 - element.x1;
  const dy = element.y2 - element.y1;
  const length = Math.hypot(dx, dy);

  if (length < 0.001) {
    return null;
  }

  const unitX = dx / length;
  const unitY = dy / length;
  const normalX = -unitY;
  const normalY = unitX;
  const strokeWidth = getCanvasElementStrokeWidth(element);
  const headLength = 10 + strokeWidth * 2.5;
  const headHalfWidth = 5 + strokeWidth * 1.25;
  const baseX = element.x2 - unitX * headLength;
  const baseY = element.y2 - unitY * headLength;
  const leftX = baseX + normalX * headHalfWidth;
  const leftY = baseY + normalY * headHalfWidth;
  const rightX = baseX - normalX * headHalfWidth;
  const rightY = baseY - normalY * headHalfWidth;

  return {
    points: `${element.x2},${element.y2} ${leftX},${leftY} ${rightX},${rightY}`,
    shaftEnd: { x: baseX, y: baseY },
  };
}

function getElementColor(element: BoardElement) {
  return 'color' in element ? element.color : '#1f2937';
}

function getThumbnailShapeElementStyle(element: BoardElement) {
  return {
    ...getThumbnailStrokeElementStyle(element),
    fill: normalizeFillColor(element.fillColor) ?? 'none',
  };
}
function getThumbnailStrokeElementStyle(element: BoardElement) {
  const strokeWidth = getCanvasElementStrokeWidth(element);
  const strokeStyle = normalizeStrokeStyle(element.strokeStyle);
  const dashArray = getStrokeDashArray(strokeStyle, strokeWidth);

  return {
    stroke: getElementColor(element),
    strokeWidth,
    ...(dashArray ? { strokeDasharray: dashArray } : {}),
    ...(strokeStyle === 'dotted' ? { strokeLinecap: 'round' as const } : {}),
  };
}

function getStrokeDashArray(style: StrokeStyle, strokeWidth: number) {
  if (style === 'dashed') {
    return `${strokeWidth * 4} ${strokeWidth * 3}`;
  }

  if (style === 'dotted') {
    return `0 ${strokeWidth * 2.5}`;
  }

  return undefined;
}
const RECORDING_FPS = 30;
const RECORDING_VIDEO_BITS_PER_SECOND = 20_000_000;
const SLIDE_TRANSITION_BASE_MS = 260;
const SLIDE_TRANSITION_PER_PAGE_MS = 80;
const SLIDE_TRANSITION_MAX_MS = 520;
const SLIDE_TRANSITION_GAP_RATIO = 0.12;
const RECORDING_OUTPUT_LONG_EDGE = 1280;
const SLIDE_WIDTH = 960;
const SLIDE_GAP = 96;
const SLIDE_ORIGIN_X = 0;
const SLIDE_ORIGIN_Y = 0;

function createSlide(index: number, aspectRatio: number): Slide {
  return {
    id: `slide-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `Slide ${index + 1}`,
    frame: getSlideFrame(index, aspectRatio),
    elements: [],
  };
}

function reflowSlideFrames(slides: Slide[], aspectRatio: number) {
  return slides.map((slide, index) => {
    const frame = getSlideFrame(index, aspectRatio);
    const dx = frame.x - slide.frame.x;
    const dy = frame.y - slide.frame.y;

    return {
      ...slide,
      frame,
      elements: dx || dy ? slide.elements.map((element) => offsetElement(element, dx, dy)) : slide.elements,
    };
  });
}

function getCenteredElementPositionInFrame(frame: SlideFrame, width: number, height: number) {
  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
  };
}

function getViewportInsertPosition(viewport: ViewportState, width: number, height: number) {
  return {
    x: (180 - viewport.x) / viewport.zoom - width / 2,
    y: (140 - viewport.y) / viewport.zoom - height / 2,
  };
}
function materializeActiveSlideElements(slides: Slide[], activeSlideId: string | null, activeElements: BoardElement[]) {
  if (!activeSlideId) {
    return slides;
  }

  return slides.map((slide) =>
    slide.id === activeSlideId
      ? {
          ...slide,
          elements: cloneElements(activeElements),
        }
      : slide
  );
}

function getSlideDisplayName(slide: Slide, index: number) {
  return slide.name?.trim() || `Slide ${index + 1}`;
}

function getSlideFrame(index: number, aspectRatio: number) {
  const safeRatio = Math.max(aspectRatio, 0.1);
  const height = SLIDE_WIDTH / safeRatio;
  return {
    x: SLIDE_ORIGIN_X + index * (SLIDE_WIDTH + SLIDE_GAP),
    y: SLIDE_ORIGIN_Y,
    width: SLIDE_WIDTH,
    height,
  };
}

function getDefaultRecordingFrame(rect: DOMRect | undefined, viewport: ViewportState, aspectRatio: number): SlideFrame {
  const viewportWidth = rect?.width ?? window.innerWidth;
  const viewportHeight = rect?.height ?? window.innerHeight;
  const worldWidth = viewportWidth / viewport.zoom;
  const worldHeight = viewportHeight / viewport.zoom;
  const safeRatio = Math.max(aspectRatio, 0.1);
  const maxWidth = Math.min(960, worldWidth * 0.72);
  const maxHeight = Math.min(720, worldHeight * 0.72);
  let width = Math.min(maxWidth, maxHeight * safeRatio);
  let height = width / safeRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * safeRatio;
  }

  const centerX = (viewportWidth / 2 - viewport.x) / viewport.zoom;
  const centerY = (viewportHeight / 2 - viewport.y) / viewport.zoom;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

function getRecordingOutputSize(frame: SlideFrame) {
  const ratio = Math.max(frame.width / Math.max(frame.height, 1), 0.1);

  if (ratio >= 1) {
    return {
      width: RECORDING_OUTPUT_LONG_EDGE,
      height: Math.max(2, Math.round(RECORDING_OUTPUT_LONG_EDGE / ratio)),
    };
  }

  return {
    width: Math.max(2, Math.round(RECORDING_OUTPUT_LONG_EDGE * ratio)),
    height: RECORDING_OUTPUT_LONG_EDGE,
  };
}

function getSupportedRecordingMimeType() {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function drawRecordingFrame(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  frame: SlideFrame,
  mode: 'slide' | 'freeboard',
  state: RecordingRenderState,
  imageCache: Map<string, HTMLImageElement>,
  cameraSettings: CameraSettings,
  cameraVideo: HTMLVideoElement | null,
  backgroundColor: string,
  visualSettings: RecordingVisualSettings,
  pointer: RecordingPointerState | null
) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const transition = mode === 'slide' ? state.transition : null;
  if (transition) {
    drawRecordingSlideTransition(
      context,
      canvas,
      frame,
      transition,
      imageCache,
      backgroundColor,
      visualSettings,
      cameraSettings
    );
    drawRecordingPointer(context, canvas, frame, visualSettings, cameraSettings, pointer);
    drawRecordingCameraOverlay(context, canvas, frame, visualSettings, cameraSettings, cameraVideo);

    return;
  }

  const snapshot = mode === 'slide' ? getActiveSlideRecordingSnapshot(state) : { frame, elements: state.elements };
  if (snapshot) {
    drawRecordingSnapshot(context, canvas, snapshot, imageCache, 0, backgroundColor, visualSettings, cameraSettings);
  }
  drawRecordingPointer(context, canvas, frame, visualSettings, cameraSettings, pointer);
  drawRecordingCameraOverlay(context, canvas, frame, visualSettings, cameraSettings, cameraVideo);
}

function getActiveSlideRecordingSnapshot(state: RecordingRenderState): RecordingSnapshot | null {
  const activeSlide = state.activeSlideId ? state.slides.find((slide) => slide.id === state.activeSlideId) : null;
  return activeSlide ? { frame: activeSlide.frame, elements: activeSlide.elements } : null;
}

function drawRecordingSlideTransition(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  frame: SlideFrame,
  transition: RecordingTransition,
  imageCache: Map<string, HTMLImageElement>,
  backgroundColor: string,
  visualSettings: RecordingVisualSettings,
  cameraSettings: CameraSettings
) {
  const layout = getStableRecordingCompositionLayout(
    { x: 0, y: 0, width: canvas.width, height: canvas.height },
    frame,
    visualSettings,
    cameraSettings
  );
  const canvasRect = layout.canvasRect;
  const visualCenterIndex = getSlideTransitionVisualCenterIndex(transition, performance.now());
  const step = getSlideTransitionStep(canvasRect.width);

  drawFixedRecordingBackground(context, layout, backgroundColor);
  drawFixedCanvasSurface(context, layout);

  context.save();
  clipToRecordingCanvas(context, layout);

  transition.snapshots.forEach((snapshot, index) => {
    const absoluteIndex = transition.firstIndex + index;
    drawRecordingSnapshotContent(context, snapshot, imageCache, layout, (absoluteIndex - visualCenterIndex) * step);
  });

  context.restore();
}

function drawRecordingSnapshot(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  snapshot: RecordingSnapshot,
  imageCache: Map<string, HTMLImageElement>,
  offsetX: number,
  backgroundColor: string,
  visualSettings: RecordingVisualSettings,
  cameraSettings: CameraSettings
) {
  const layout = getStableRecordingCompositionLayout(
    { x: 0, y: 0, width: canvas.width, height: canvas.height },
    snapshot.frame,
    visualSettings,
    cameraSettings
  );
  context.save();
  context.beginPath();
  context.rect(offsetX, 0, canvas.width, canvas.height);
  context.clip();
  context.translate(offsetX, 0);
  drawFixedRecordingBackground(context, layout, backgroundColor);
  drawFixedCanvasSurface(context, layout);
  context.save();
  clipToRecordingCanvas(context, layout);
  drawRecordingSnapshotContent(context, snapshot, imageCache, layout, 0);
  context.restore();
  context.restore();
}

function drawRecordingSnapshotContent(
  context: CanvasRenderingContext2D,
  snapshot: RecordingSnapshot,
  imageCache: Map<string, HTMLImageElement>,
  layout: ReturnType<typeof getRecordingCompositionLayout>,
  offsetX: number
) {
  const canvasRect = layout.canvasRect;

  context.save();
  context.translate(canvasRect.x + offsetX, canvasRect.y);
  context.scale(layout.scaleX, layout.scaleY);
  context.translate(-snapshot.frame.x, -snapshot.frame.y);
  snapshot.elements.forEach((element) => drawCanvasElement(context, element, imageCache));
  context.restore();
}

function getStableRecordingCompositionLayout(
  backgroundRect: { x: number; y: number; width: number; height: number },
  frame: SlideFrame,
  visualSettings: RecordingVisualSettings,
  cameraSettings: CameraSettings
) {
  const layout = getRecordingCompositionLayout(roundRecordingRect(backgroundRect), frame, visualSettings, cameraSettings);
  const canvasRect = roundRecordingRect(layout.canvasRect);
  const safeFrameWidth = Math.max(frame.width, 1);
  const safeFrameHeight = Math.max(frame.height, 1);

  return {
    ...layout,
    backgroundRect: roundRecordingRect(layout.backgroundRect),
    canvasRect,
    cameraRect: roundRecordingRect(layout.cameraRect),
    canvasRadius: Math.round(layout.canvasRadius),
    cameraRadius: Math.round(layout.cameraRadius),
    scaleX: canvasRect.width / safeFrameWidth,
    scaleY: canvasRect.height / safeFrameHeight,
  };
}

function roundRecordingRect(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function drawFixedRecordingBackground(
  context: CanvasRenderingContext2D,
  layout: ReturnType<typeof getStableRecordingCompositionLayout>,
  backgroundColor: string
) {
  const { backgroundRect } = layout;
  context.fillStyle = backgroundColor;
  context.fillRect(backgroundRect.x, backgroundRect.y, backgroundRect.width, backgroundRect.height);
}

function drawFixedCanvasSurface(context: CanvasRenderingContext2D, layout: ReturnType<typeof getStableRecordingCompositionLayout>) {
  const { canvasRect } = layout;
  context.beginPath();
  addRoundedRectPath(context, canvasRect.x, canvasRect.y, canvasRect.width, canvasRect.height, layout.canvasRadius);
  context.fillStyle = '#ffffff';
  context.fill();
}

function clipToRecordingCanvas(context: CanvasRenderingContext2D, layout: ReturnType<typeof getStableRecordingCompositionLayout>) {
  const { canvasRect } = layout;
  context.beginPath();
  addRoundedRectPath(context, canvasRect.x, canvasRect.y, canvasRect.width, canvasRect.height, layout.canvasRadius);
  context.clip();
}

function drawRecordingCameraOverlay(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  frame: SlideFrame,
  visualSettings: RecordingVisualSettings,
  settings: CameraSettings,
  video: HTMLVideoElement | null
) {
  if (!settings.enabled) {
    return;
  }

  const layout = getStableRecordingCompositionLayout(
    { x: 0, y: 0, width: canvas.width, height: canvas.height },
    frame,
    visualSettings,
    settings
  );
  const { x, y, width: size } = layout.cameraRect;

  context.save();
  context.beginPath();
  if (settings.shape === 'circle') {
    context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  } else {
    addRoundedRectPath(context, x, y, size, size, layout.cameraRadius);
  }
  context.clip();

  if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
    const sourceRatio = video.videoWidth / video.videoHeight;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;
    let sourceX = 0;
    let sourceY = 0;

    if (sourceRatio > 1) {
      sourceWidth = video.videoHeight;
      sourceX = (video.videoWidth - sourceWidth) / 2;
    } else if (sourceRatio < 1) {
      sourceHeight = video.videoWidth;
      sourceY = (video.videoHeight - sourceHeight) / 2;
    }

    context.save();
    context.translate(x + size, y);
    context.scale(-1, 1);
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, size, size);
    context.restore();
  } else {
    context.fillStyle = '#0f172a';
    context.fillRect(x, y, size, size);
    context.fillStyle = '#ffffff';
    context.font = `${Math.max(14, size * 0.12)}px system-ui`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('Camera', x + size / 2, y + size / 2);
  }

  context.restore();
}

function drawRecordingPointer(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  frame: SlideFrame,
  settings: RecordingVisualSettings,
  cameraSettings: CameraSettings,
  pointer: RecordingPointerState | null
) {
  if (settings.cursorEffect === 'none' || !pointer?.visible) {
    return;
  }

  const layout = getStableRecordingCompositionLayout(
    { x: 0, y: 0, width: canvas.width, height: canvas.height },
    frame,
    settings,
    cameraSettings
  );
  const canvasRect = layout.canvasRect;
  const x = canvasRect.x + (pointer.point.x - frame.x) * layout.scaleX;
  const y = canvasRect.y + (pointer.point.y - frame.y) * layout.scaleY;

  if (x < canvasRect.x || x > canvasRect.x + canvasRect.width || y < canvasRect.y || y > canvasRect.y + canvasRect.height) {
    return;
  }

  context.save();
  if (settings.cursorEffect === 'highlight') {
    context.beginPath();
    context.arc(x, y, pointer.pressed ? 18 : 13, 0, Math.PI * 2);
    context.fillStyle = pointer.pressed ? 'rgba(239, 68, 68, 0.22)' : 'rgba(239, 68, 68, 0.12)';
    context.strokeStyle = 'rgba(239, 68, 68, 0.86)';
    context.lineWidth = 2;
    context.fill();
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x, y + 24);
    context.lineTo(x + 7, y + 18);
    context.lineTo(x + 12, y + 30);
    context.lineTo(x + 17, y + 28);
    context.lineTo(x + 12, y + 16);
    context.lineTo(x + 22, y + 16);
    context.closePath();
    context.fillStyle = '#111827';
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2.5;
    context.stroke();
    context.fill();
  }
  context.restore();
}

function addRoundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, width, height, safeRadius);
    return;
  }

  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
}

function drawCanvasElement(context: CanvasRenderingContext2D, element: BoardElement, imageCache: Map<string, HTMLImageElement>) {
  context.save();
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.globalAlpha *= clampOpacity(element.opacity);
  applyCanvasElementTransform(context, element);
  applyCanvasStrokeStyle(context, element);

  switch (element.type) {
    case 'draw':
      if (element.points.length > 0) {
        context.beginPath();
        context.strokeStyle = element.color;
        context.lineWidth = getCanvasElementStrokeWidth(element);
        context.moveTo(element.points[0].x, element.points[0].y);
        element.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.stroke();
      }
      break;
    case 'rectangle': {
      const box = normalizeCanvasRect(element.x, element.y, element.width, element.height);
      const fillColor = normalizeFillColor(element.fillColor);
      const radius = clampCornerRadiusForSize(element.cornerRadius, box.width, box.height);
      context.beginPath();
      context.strokeStyle = element.color;
      context.lineWidth = getCanvasElementStrokeWidth(element);
      addRoundedRectPath(context, box.x, box.y, box.width, box.height, radius);
      if (fillColor) {
        context.fillStyle = fillColor;
        context.fill();
      }
      context.stroke();
      break;
    }
    case 'ellipse': {
      const box = normalizeCanvasRect(element.x, element.y, element.width, element.height);
      const fillColor = normalizeFillColor(element.fillColor);
      context.beginPath();
      context.strokeStyle = element.color;
      context.lineWidth = getCanvasElementStrokeWidth(element);
      context.ellipse(box.x + box.width / 2, box.y + box.height / 2, box.width / 2, box.height / 2, 0, 0, Math.PI * 2);
      if (fillColor) {
        context.fillStyle = fillColor;
        context.fill();
      }
      context.stroke();
      break;
    }
    case 'line':
      drawCanvasLine(context, element.x1, element.y1, element.x2, element.y2, element.color, getCanvasElementStrokeWidth(element));
      break;
    case 'arrow':
      drawCanvasArrow(context, element);
      break;
    case 'text':
      drawCanvasText(context, element);
      break;
    case 'image':
      drawCanvasImage(context, element, imageCache);
      break;
    default:
      break;
  }

  context.restore();
}

function getCanvasElementStrokeWidth(element: BoardElement) {
  return clampStrokeWidth(element.strokeWidth);
}
function applyCanvasStrokeStyle(context: CanvasRenderingContext2D, element: BoardElement) {
  const strokeWidth = getCanvasElementStrokeWidth(element);
  const strokeStyle = normalizeStrokeStyle(element.strokeStyle);

  if (strokeStyle === 'dashed') {
    context.setLineDash([strokeWidth * 4, strokeWidth * 3]);
    return;
  }

  if (strokeStyle === 'dotted') {
    context.setLineDash([0, strokeWidth * 2.5]);
    context.lineCap = 'round';
    return;
  }

  context.setLineDash([]);
}
function applyCanvasElementTransform(context: CanvasRenderingContext2D, element: BoardElement) {
  const rotation = normalizeRotation(element.rotation ?? 0);
  const scaleX = element.flipX ? -1 : 1;
  const scaleY = element.flipY ? -1 : 1;

  if (!rotation && scaleX === 1 && scaleY === 1) {
    return;
  }

  const bounds = getElementBounds(element);
  context.translate(bounds.cx, bounds.cy);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(scaleX, scaleY);
  context.translate(-bounds.cx, -bounds.cy);
}

function drawCanvasLine(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, strokeWidth: number) {
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = strokeWidth;
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function drawCanvasArrow(context: CanvasRenderingContext2D, element: LinearElement) {
  const geometry = getCanvasArrowGeometry(element);
  drawCanvasLine(context, element.x1, element.y1, geometry?.shaftEnd.x ?? element.x2, geometry?.shaftEnd.y ?? element.y2, element.color, getCanvasElementStrokeWidth(element));

  if (!geometry) {
    return;
  }

  context.setLineDash([]);
  context.beginPath();
  context.fillStyle = element.color;
  context.strokeStyle = element.color;
  context.lineWidth = Math.max(0.75, getCanvasElementStrokeWidth(element) * 0.35);
  context.moveTo(element.x2, element.y2);
  context.lineTo(geometry.left.x, geometry.left.y);
  context.lineTo(geometry.right.x, geometry.right.y);
  context.closePath();
  context.fill();
  context.stroke();
}

function getCanvasArrowGeometry(element: LinearElement) {
  const dx = element.x2 - element.x1;
  const dy = element.y2 - element.y1;
  const length = Math.hypot(dx, dy);

  if (length < 0.001) {
    return null;
  }

  const unitX = dx / length;
  const unitY = dy / length;
  const normalX = -unitY;
  const normalY = unitX;
  const strokeWidth = getCanvasElementStrokeWidth(element);
  const headLength = 10 + strokeWidth * 2.5;
  const headHalfWidth = 5 + strokeWidth * 1.25;
  const baseX = element.x2 - unitX * headLength;
  const baseY = element.y2 - unitY * headLength;

  return {
    shaftEnd: { x: baseX, y: baseY },
    left: { x: baseX + normalX * headHalfWidth, y: baseY + normalY * headHalfWidth },
    right: { x: baseX - normalX * headHalfWidth, y: baseY - normalY * headHalfWidth },
  };
}

function drawCanvasText(context: CanvasRenderingContext2D, element: Extract<BoardElement, { type: 'text' }>) {
  context.fillStyle = element.color;
  context.font = `${element.fontSize}px ${element.fontFamily}`;
  context.textBaseline = 'top';
  const lineHeight = element.fontSize * 1.25;
  element.text.split('\n').forEach((line, index) => {
    context.fillText(line || ' ', element.x, element.y + index * lineHeight, element.width);
  });
}

function drawCanvasImage(context: CanvasRenderingContext2D, element: ImageElement, imageCache: Map<string, HTMLImageElement>) {
  const box = normalizeCanvasRect(element.x, element.y, element.width, element.height);
  let image = imageCache.get(element.src);

  if (!image) {
    image = new Image();
    image.src = element.src;
    imageCache.set(element.src, image);
  }

  if (image.complete && image.naturalWidth > 0) {
    context.drawImage(image, box.x, box.y, box.width, box.height);
  }
}

function normalizeCanvasRect(x: number, y: number, width: number, height: number) {
  const left = Math.min(x, x + width);
  const top = Math.min(y, y + height);
  return {
    x: left,
    y: top,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

function easeSlideTransition(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function getSlideTransitionDuration(pageDistance: number) {
  return Math.min(
    SLIDE_TRANSITION_MAX_MS,
    SLIDE_TRANSITION_BASE_MS + Math.max(0, pageDistance - 1) * SLIDE_TRANSITION_PER_PAGE_MS
  );
}

function getSlideTransitionProgress(transition: RecordingTransition, now: number) {
  return Math.min(1, Math.max(0, (now - transition.startTime) / Math.max(transition.duration, 1)));
}

function getSlideTransitionVisualCenterIndex(transition: RecordingTransition, now: number) {
  const progress = getSlideTransitionProgress(transition, now);
  const eased = easeSlideTransition(progress);
  return transition.fromIndex + (transition.toIndex - transition.fromIndex) * eased;
}

function getSlideTransitionGap(width: number) {
  return width * SLIDE_TRANSITION_GAP_RATIO;
}

function getSlideTransitionStep(width: number) {
  return width + getSlideTransitionGap(width);
}

function downloadRecordingBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `excalicord-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function getNextManualZoom(currentZoom: number, direction: 1 | -1) {
  const stepPercent = ZOOM_BUTTON_STEP * 100;
  const currentPercent = Math.round(currentZoom * 100);
  const nextPercent =
    direction > 0
      ? Math.floor(currentPercent / stepPercent) * stepPercent + stepPercent
      : Math.ceil(currentPercent / stepPercent) * stepPercent - stepPercent;

  return clampZoom(nextPercent / 100, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM);
}

function parseZoomInput(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*%?$/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return clampZoom(parsed / 100, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM);
}

function clampZoom(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampOpacity(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0.1, value)) : 1;
}

function clampStrokeWidth(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_STROKE_WIDTH, Math.max(MIN_STROKE_WIDTH, Math.round(value)))
    : DEFAULT_STROKE_WIDTH;
}

function clampCornerRadius(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_CORNER_RADIUS, Math.max(MIN_CORNER_RADIUS, Math.round(value)))
    : DEFAULT_CORNER_RADIUS;
}

function clampCornerRadiusForSize(value: number | undefined, width: number, height: number) {
  return Math.min(clampCornerRadius(value), Math.max(0, Math.abs(width) / 2), Math.max(0, Math.abs(height) / 2));
}
function normalizeStrokeStyle(value: unknown): StrokeStyle {
  return value === 'dashed' || value === 'dotted' || value === 'solid' ? value : DEFAULT_STROKE_STYLE;
}

function normalizeFillColor(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return DEFAULT_FILL_COLOR;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'none' || normalized === 'transparent' ? DEFAULT_FILL_COLOR : value;
}
function fitViewportToElements(elements: BoardElement[], viewportWidth: number, viewportHeight: number): ViewportState {
  const contentBounds = getElementsBounds(elements);

  if (!contentBounds) {
    return { x: 180, y: 120, zoom: 1 };
  }

  const padding = 96;
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const safeWidth = Math.max(1, contentBounds.width);
  const safeHeight = Math.max(1, contentBounds.height);
  const nextZoom = clampZoom(
    Math.min(availableWidth / safeWidth, availableHeight / safeHeight),
    FIT_CONTENT_MIN_ZOOM,
    FIT_CONTENT_MAX_ZOOM
  );
  const contentCenterX = contentBounds.x + contentBounds.width / 2;
  const contentCenterY = contentBounds.y + contentBounds.height / 2;

  return {
    x: viewportWidth / 2 - contentCenterX * nextZoom,
    y: viewportHeight / 2 - contentCenterY * nextZoom,
    zoom: nextZoom,
  };
}

function getElementsBounds(elements: BoardElement[]) {
  return getSelectionBounds(elements);
}

function zoomViewportAtScreenPoint(viewport: ViewportState, nextZoomValue: number, anchor: { x: number; y: number }): ViewportState {
  const nextZoom = clampZoom(nextZoomValue, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM);
  const worldX = (anchor.x - viewport.x) / viewport.zoom;
  const worldY = (anchor.y - viewport.y) / viewport.zoom;

  return {
    x: anchor.x - worldX * nextZoom,
    y: anchor.y - worldY * nextZoom,
    zoom: nextZoom,
  };
}

function formatRecordingElapsed(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const TELEPROMPTER_STORAGE_KEY = 'excalicord.teleprompter';

function getDefaultTeleprompterState(): TeleprompterPanelState {
  if (typeof window === 'undefined') {
    return DEFAULT_TELEPROMPTER_STATE;
  }

  return {
    ...DEFAULT_TELEPROMPTER_STATE,
    position: {
      x: Math.max(24, window.innerWidth - 620),
      y: 132,
    },
  };
}

function loadTeleprompterState(): TeleprompterPanelState {
  const fallback = getDefaultTeleprompterState();
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(TELEPROMPTER_STORAGE_KEY);
    if (!rawValue) {
      return fallback;
    }

    const parsed = JSON.parse(rawValue) as Partial<TeleprompterPanelState>;
    return {
      text: typeof parsed.text === 'string' ? parsed.text : fallback.text,
      position: {
        x: getFiniteNumber(parsed.position?.x, fallback.position.x),
        y: getFiniteNumber(parsed.position?.y, fallback.position.y),
      },
      opacity: clampNumber(getFiniteNumber(parsed.opacity, fallback.opacity), 0.1, 1),
      speed: clampNumber(getFiniteNumber(parsed.speed, fallback.speed), 1, 100),
      scrollTop: Math.max(0, getFiniteNumber(parsed.scrollTop, fallback.scrollTop)),
    };
  } catch {
    return fallback;
  }
}

function saveTeleprompterState(state: TeleprompterPanelState) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(TELEPROMPTER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The teleprompter remains usable even if browser storage is unavailable.
  }
}

function getFiniteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rotateElementAroundSelection<T extends BoardElement>(element: T, center: { x: number; y: number }, degrees: number): T {
  const elementCenter = getElementCenter(element);
  const nextCenter = rotatePointAround(elementCenter, center, degrees);
  const moved = moveElementCenterTo(element, nextCenter.x, nextCenter.y);

  return {
    ...moved,
    rotation: normalizeRotation((element.rotation ?? 0) + degrees),
  };
}

function flipElementAroundSelection<T extends BoardElement>(
  element: T,
  center: { x: number; y: number },
  axis: 'horizontal' | 'vertical'
): T {
  const elementCenter = getElementCenter(element);
  const nextCenter =
    axis === 'horizontal'
      ? { x: center.x * 2 - elementCenter.x, y: elementCenter.y }
      : { x: elementCenter.x, y: center.y * 2 - elementCenter.y };
  const moved = moveElementCenterTo(element, nextCenter.x, nextCenter.y);

  if (axis === 'horizontal') {
    return {
      ...moved,
      flipX: !element.flipX,
      rotation: normalizeRotation(180 - (element.rotation ?? 0)),
    };
  }

  return {
    ...moved,
    flipY: !element.flipY,
    rotation: normalizeRotation(-(element.rotation ?? 0)),
  };
}

function reorderElementsByLayerAction(elements: BoardElement[], selectedIds: string[], action: LayerAction) {
  const selectedSet = new Set(selectedIds);
  const selectedElements = elements.filter((element) => selectedSet.has(element.id));

  if (selectedElements.length === 0) {
    return elements;
  }

  const unselectedElements = elements.filter((element) => !selectedSet.has(element.id));

  if (unselectedElements.length === 0) {
    return elements;
  }

  if (action === 'bring-to-front') {
    return [...unselectedElements, ...selectedElements];
  }

  if (action === 'send-to-back') {
    return [...selectedElements, ...unselectedElements];
  }

  const selectedIndexes = elements
    .map((element, index) => (selectedSet.has(element.id) ? index : -1))
    .filter((index) => index >= 0);

  if (selectedIndexes.length === 0) {
    return elements;
  }

  if (action === 'bring-forward') {
    const topSelectedIndex = Math.max(...selectedIndexes);
    const currentInsertIndex = elements.reduce(
      (count, element, index) => (!selectedSet.has(element.id) && index <= topSelectedIndex ? count + 1 : count),
      0
    );
    const nextInsertIndex = Math.min(unselectedElements.length, currentInsertIndex + 1);
    return insertSelectedGroup(unselectedElements, selectedElements, nextInsertIndex);
  }

  const bottomSelectedIndex = Math.min(...selectedIndexes);
  const currentInsertIndex = elements.reduce(
    (count, element, index) => (!selectedSet.has(element.id) && index < bottomSelectedIndex ? count + 1 : count),
    0
  );
  const nextInsertIndex = Math.max(0, currentInsertIndex - 1);
  return insertSelectedGroup(unselectedElements, selectedElements, nextInsertIndex);
}

function insertSelectedGroup(unselectedElements: BoardElement[], selectedElements: BoardElement[], insertIndex: number) {
  return [
    ...unselectedElements.slice(0, insertIndex),
    ...selectedElements,
    ...unselectedElements.slice(insertIndex),
  ];
}

function resolveElementsUpdate(
  update: React.SetStateAction<BoardElement[]>,
  current: BoardElement[]
) {
  return typeof update === 'function' ? update(current) : update;
}

function serializeElements(elements: BoardElement[]) {
  return JSON.stringify(elements);
}

function cloneElements(elements: BoardElement[]) {
  return structuredClone(elements);
}

function cloneSlides(slides: Slide[]) {
  return slides.map((slide) => ({
    ...slide,
    frame: { ...slide.frame },
    elements: cloneElements(slide.elements),
  }));
}

function getScopeType(scopeId: string | null): ElementScopeType {
  return scopeId === null ? 'freeboard' : 'slide';
}

function createScopeHistoryEntry(scopeId: string | null, elements: BoardElement[]): ScopeHistoryEntry {
  return {
    kind: 'scope',
    scopeType: getScopeType(scopeId),
    scopeId,
    elements: cloneElements(elements),
  };
}

function createBoardHistoryEntry(
  activeScopeId: string | null,
  slides: Slide[],
  freeboardElements: BoardElement[]
): BoardHistoryEntry {
  return {
    kind: 'board',
    activeScopeId,
    slides: cloneSlides(slides),
    freeboardElements: cloneElements(freeboardElements),
  };
}

function getScopeElementsFromCollections(slides: Slide[], freeboardElements: BoardElement[], scopeId: string | null) {
  if (scopeId === null) {
    return freeboardElements;
  }

  return slides.find((slide) => slide.id === scopeId)?.elements ?? [];
}

function filterSelectionForBoard(selectedIds: string[], slides: Slide[], freeboardElements: BoardElement[]) {
  const existingIds = new Set([
    ...freeboardElements.map((element) => element.id),
    ...slides.flatMap((slide) => slide.elements.map((element) => element.id)),
  ]);
  return selectedIds.filter((id) => existingIds.has(id));
}

function serializeBoardHistoryEntry(entry: BoardHistoryEntry) {
  return JSON.stringify({
    activeScopeId: entry.activeScopeId,
    slides: entry.slides,
    freeboardElements: entry.freeboardElements,
  });
}

function pruneHistoryScope(history: ElementsHistory, deletedScopeId: string): ElementsHistory {
  return {
    ...history,
    past: history.past.filter((entry) => entry.kind === 'board' || entry.scopeId !== deletedScopeId),
    future: history.future.filter((entry) => entry.kind === 'board' || entry.scopeId !== deletedScopeId),
  };
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function readImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });
}

function isColorTool(tool: ToolType) {
  return tool === 'text' || isShapeColorTool(tool);
}

function isShapeColorTool(tool: ToolType) {
  return tool === 'draw' || tool === 'rectangle' || tool === 'ellipse' || tool === 'line' || tool === 'arrow';
}

function isStrokeWidthTool(tool: ToolType) {
  return isShapeColorTool(tool);
}

function isFillColorTool(tool: ToolType) {
  return tool === 'rectangle' || tool === 'ellipse';
}

function isCornerRadiusTool(tool: ToolType) {
  return tool === 'rectangle';
}

function isShapeColorableElement(
  element: BoardElement
): element is Extract<BoardElement, { type: 'draw' | 'rectangle' | 'ellipse' | 'line' | 'arrow' }> {
  return (
    element.type === 'draw' ||
    element.type === 'rectangle' ||
    element.type === 'ellipse' ||
    element.type === 'line' ||
    element.type === 'arrow'
  );
}

function isColorEditableElement(
  element: BoardElement
): element is Extract<BoardElement, { type: 'draw' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' }> {
  return isShapeColorableElement(element) || element.type === 'text';
}

function isStrokeWidthEditableElement(
  element: BoardElement
): element is Extract<BoardElement, { type: 'draw' | 'rectangle' | 'ellipse' | 'line' | 'arrow' }> {
  return isShapeColorableElement(element);
}

function isFillableElement(element: BoardElement): element is Extract<BoardElement, { type: 'rectangle' | 'ellipse' }> {
  return element.type === 'rectangle' || element.type === 'ellipse';
}

function isCornerRadiusEditableElement(element: BoardElement): element is Extract<BoardElement, { type: 'rectangle' }> {
  return element.type === 'rectangle';
}

export default WhiteboardPage;
