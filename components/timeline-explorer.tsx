"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type BBox = [number, number, number, number];

type OcrEntry = {
  id: string;
  text: string;
  norm: string;
  context?: string;
  bbox: BBox;
  conf: number;
  kind: "line" | "word";
};

const MAX_SUGGESTIONS = 10;
const HINT_STORAGE_KEY = "chronicle.viewer.hint.dismissed.v1";
type OSDViewer = import("openseadragon").Viewer;

function normalizeQuery(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clipContext(text: string, query: string, maxLength = 78): string {
  if (text.length <= maxLength) {
    return text;
  }

  const token = query.split(" ").find((piece) => piece.length >= 2) ?? "";
  if (!token) {
    return `${text.slice(0, maxLength).trimEnd()}...`;
  }

  const lowerText = normalizeQuery(text);
  const index = lowerText.indexOf(token);
  if (index < 0) {
    return `${text.slice(0, maxLength).trimEnd()}...`;
  }

  const start = Math.max(0, index - Math.floor((maxLength - token.length) / 2));
  const end = Math.min(text.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function suggestionDomId(id: string): string {
  return `suggestion-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export default function TimelineExplorer() {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const osdRef = useRef<OSDViewer | null>(null);
  const activeOverlayRef = useRef<HTMLElement | null>(null);
  const initialQueryHandledRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  const [lineEntries, setLineEntries] = useState<OcrEntry[]>([]);
  const [wordEntries, setWordEntries] = useState<OcrEntry[]>([]);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [resultIds, setResultIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entries = useMemo(() => [...lineEntries, ...wordEntries], [lineEntries, wordEntries]);
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  const matches = useMemo(
    () => resultIds.map((id) => entryById.get(id)).filter((entry): entry is OcrEntry => !!entry),
    [entryById, resultIds]
  );

  useEffect(() => {
    let disposed = false;
    let viewer: OSDViewer | null = null;

    async function setup() {
      if (!viewerRef.current || osdRef.current) {
        return;
      }

      const osdModule = await import("openseadragon");
      const OpenSeadragon = osdModule.default;
      if (disposed || !viewerRef.current || osdRef.current) {
        return;
      }

      viewer = OpenSeadragon({
        element: viewerRef.current,
        prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/5.0.1/images/",
        tileSources: "/tiles/timeline.dzi",
        showNavigator: true,
        navigatorPosition: "BOTTOM_RIGHT",
        maxZoomPixelRatio: 2.3,
        minZoomLevel: 0.8,
        visibilityRatio: 1,
        constrainDuringPan: true,
        blendTime: 0.15,
        zoomPerScroll: 1.15,
        preserveImageSizeOnResize: true,
        animationTime: 0.6,
        gestureSettingsMouse: {
          clickToZoom: false
        }
      });

      viewer.addHandler("open", () => setIsReady(true));
      osdRef.current = viewer;
    }

    void setup();

    return () => {
      disposed = true;
      viewer?.destroy();
      osdRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/search.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<{ requestId: number; ids: string[] }>) => {
      if (event.data.requestId !== requestIdRef.current) {
        return;
      }
      setResultIds(event.data.ids);
    };
    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    try {
      const dismissed = window.localStorage.getItem(HINT_STORAGE_KEY) === "1";
      if (!dismissed) {
        setShowHint(true);
        timer = window.setTimeout(() => setShowHint(false), 8000);
      }
    } catch {
      setShowHint(true);
      timer = window.setTimeout(() => setShowHint(false), 8000);
    }

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    try {
      window.localStorage.setItem(HINT_STORAGE_KEY, "1");
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLineEntries() {
      try {
        const linesResponse = await fetch("/ocr/lines.json");
        if (linesResponse.ok) {
          const data = (await linesResponse.json()) as OcrEntry[];
          if (!cancelled) {
            setLineEntries(data);
          }
          return;
        }

        const legacyResponse = await fetch("/ocr/entries.json");
        if (!legacyResponse.ok) {
          throw new Error(`Failed to fetch OCR index: ${legacyResponse.status}`);
        }
        const data = (await legacyResponse.json()) as OcrEntry[];
        if (!cancelled) {
          setLineEntries(data.filter((entry) => entry.kind === "line"));
          setWordEntries(data.filter((entry) => entry.kind === "word"));
          setWordsLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setError("OCRインデックスを読み込めませんでした。");
        }
      }
    }

    void loadLineEntries();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (wordsLoaded || wordsLoading) {
      return;
    }
    if (!isSearchOpen && query.length < 2) {
      return;
    }

    let cancelled = false;
    setWordsLoading(true);

    async function loadWordEntries() {
      try {
        const response = await fetch("/ocr/words.json");
        if (!response.ok) {
          throw new Error(`Failed to fetch word index: ${response.status}`);
        }
        const data = (await response.json()) as OcrEntry[];
        if (!cancelled) {
          setWordEntries(data);
          setWordsLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setWordsLoaded(true);
        }
      } finally {
        if (!cancelled) {
          setWordsLoading(false);
        }
      }
    }

    void loadWordEntries();
    return () => {
      cancelled = true;
    };
  }, [isSearchOpen, query.length, wordsLoaded, wordsLoading]);

  useEffect(() => {
    if (!workerRef.current) {
      return;
    }
    workerRef.current.postMessage({
      type: "init",
      entries
    });
  }, [entries]);

  useEffect(() => {
    if (!workerRef.current) {
      return;
    }

    const normalized = normalizeQuery(query);
    if (!normalized) {
      requestIdRef.current += 1;
      setResultIds([]);
      return;
    }

    requestIdRef.current += 1;
    workerRef.current.postMessage({
      type: "query",
      requestId: requestIdRef.current,
      query: normalized,
      limit: 300
    });
  }, [query, entries.length]);

  const visibleMatches = matches.slice(0, MAX_SUGGESTIONS);
  const normalizedQuery = normalizeQuery(query);
  const activeSuggestionIndex =
    visibleMatches.length === 0 ? 0 : Math.min(activeIndex, visibleMatches.length - 1);
  const shouldShowSuggestions = isSearchOpen && isInputFocused && query.length > 0;

  const getSuggestionContext = useCallback(
    (entry: OcrEntry) => {
      const source = entry.context ?? entry.text;
      return clipContext(source, normalizedQuery);
    },
    [normalizedQuery]
  );

  const clearOverlay = useCallback(() => {
    const viewer = osdRef.current;
    const element = activeOverlayRef.current;

    if (viewer && element) {
      viewer.removeOverlay(element);
    }

    activeOverlayRef.current = null;
  }, []);

  const focusBounds = useCallback(
    (entry: OcrEntry) => {
      const viewer = osdRef.current;
      if (!viewer || !isReady) {
        return;
      }

      clearOverlay();

      const [x, y, w, h] = entry.bbox;
      const rect = viewer.viewport.imageToViewportRectangle(x, y, w, h);
      viewer.viewport.fitBoundsWithConstraints(rect, true);

      const overlay = document.createElement("div");
      overlay.className = "highlight-overlay";
      viewer.addOverlay({
        element: overlay,
        location: rect
      });
      activeOverlayRef.current = overlay;
    },
    [isReady, clearOverlay]
  );

  const jumpToMatch = useCallback(
    (index: number) => {
      const entry = matches[index];
      if (!entry) {
        return;
      }
      setActiveIndex(index);
      focusBounds(entry);
    },
    [focusBounds, matches]
  );

  useEffect(() => {
    if (!entries.length || initialQueryHandledRef.current) {
      return;
    }
    const url = new URL(window.location.href);
    const q = url.searchParams.get("q");
    if (q) {
      setQuery(q);
      initialQueryHandledRef.current = true;
    }
  }, [entries.length]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const q = normalizeQuery(query);
    if (q) {
      url.searchParams.set("q", q);
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState({}, "", url.toString());
  }, [query]);

  useEffect(() => {
    if (!matches.length || !initialQueryHandledRef.current) {
      return;
    }
    jumpToMatch(0);
    initialQueryHandledRef.current = false;
  }, [jumpToMatch, matches.length]);

  useEffect(() => {
    if (isSearchOpen) {
      inputRef.current?.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (searchRef.current?.contains(target)) {
        return;
      }
      setIsSearchOpen(false);
      setIsInputFocused(false);
      inputRef.current?.blur();
    }

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (event.key === "/") {
        if (!isTyping) {
          event.preventDefault();
          setIsSearchOpen(true);
        }
      }
      if (event.key === "Escape") {
        setIsInputFocused(false);
        setIsSearchOpen(false);
        inputRef.current?.blur();
      }
      if (!isTyping && event.key === "n" && matches.length > 0) {
        event.preventDefault();
        const nextIndex = (activeIndex + 1) % matches.length;
        jumpToMatch(nextIndex);
      }
      if (!isTyping && event.key === "p" && matches.length > 0) {
        event.preventDefault();
        const nextIndex = (activeIndex - 1 + matches.length) % matches.length;
        jumpToMatch(nextIndex);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, jumpToMatch, matches.length]);

  return (
    <main className="page-shell">
      <section className="viewer-shell">
        <div className="topbar">
          <div ref={searchRef} className={`search-block ${isSearchOpen ? "is-open" : ""}`}>
            <div className="search-shell">
              <button
                type="button"
                className="search-toggle"
                onClick={() => {
                  setIsSearchOpen((open) => {
                    if (open) {
                      setIsInputFocused(false);
                    }
                    return !open;
                  });
                }}
                aria-label="Search"
                aria-expanded={isSearchOpen}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11 4a7 7 0 1 0 4.52 12.35l4.56 4.56a1 1 0 0 0 1.42-1.42l-4.56-4.56A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10a5 5 0 0 1 0-10Z" />
                </svg>
              </button>
              <input
                ref={inputRef}
                value={query}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => window.setTimeout(() => setIsInputFocused(false), 120)}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    if (visibleMatches.length > 0) {
                      event.preventDefault();
                      setActiveIndex(
                        (prev) => (Math.min(prev, visibleMatches.length - 1) + 1) % visibleMatches.length
                      );
                    }
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    if (visibleMatches.length > 0) {
                      event.preventDefault();
                      const base = Math.min(activeIndex, visibleMatches.length - 1);
                      setActiveIndex((base - 1 + visibleMatches.length) % visibleMatches.length);
                    }
                    return;
                  }
                  if (event.key === "Enter" && matches.length > 0) {
                    jumpToMatch(activeSuggestionIndex);
                    inputRef.current?.blur();
                  }
                }}
                className="search-input"
                placeholder="Search timeline text... (/)"
                spellCheck={false}
                tabIndex={isSearchOpen ? 0 : -1}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={shouldShowSuggestions}
                aria-controls="timeline-suggestions"
                aria-activedescendant={
                  shouldShowSuggestions && visibleMatches[activeSuggestionIndex]
                    ? suggestionDomId(visibleMatches[activeSuggestionIndex].id)
                    : undefined
                }
              />
            </div>
            {shouldShowSuggestions && (
              <div className="suggestions" role="listbox" id="timeline-suggestions">
                {visibleMatches.length === 0 ? (
                  <p className="suggestion-empty">No match</p>
                ) : (
                  visibleMatches.map((entry, index) => (
                    <button
                      key={entry.id}
                      id={suggestionDomId(entry.id)}
                      className={`suggestion-item ${index === activeIndex ? "is-active" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => jumpToMatch(index)}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                    >
                      <span className="suggestion-copy">
                        <span className="suggestion-title">{entry.text}</span>
                        <span className="suggestion-context">{getSuggestionContext(entry)}</span>
                      </span>
                      <span className="suggestion-meta">{(entry.conf * 100).toFixed(0)}%</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div ref={viewerRef} className="viewer-canvas" />

        {showHint && (
          <aside className="hint-card" role="status">
            <p>
              <kbd>/</kbd> で検索、<kbd>↑</kbd>/<kbd>↓</kbd> で候補移動、<kbd>Enter</kbd> でジャンプ、
              <kbd>n</kbd>/<kbd>p</kbd> で巡回できます。
            </p>
            <button type="button" onClick={dismissHint}>
              閉じる
            </button>
          </aside>
        )}
      </section>
      {error && <p className="error-banner">{error}</p>}
    </main>
  );
}
