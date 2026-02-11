"use client";

import Fuse from "fuse.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type BBox = [number, number, number, number];

type OcrEntry = {
  id: string;
  text: string;
  norm: string;
  bbox: BBox;
  conf: number;
  kind: "line" | "word";
};

const MAX_SUGGESTIONS = 10;
type OSDViewer = import("openseadragon").Viewer;

function normalizeQuery(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function TimelineExplorer() {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const osdRef = useRef<OSDViewer | null>(null);
  const activeOverlayRef = useRef<HTMLElement | null>(null);
  const overlayTimerRef = useRef<number | null>(null);
  const initialQueryHandledRef = useRef(false);

  const [entries, setEntries] = useState<OcrEntry[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (overlayTimerRef.current) {
        window.clearTimeout(overlayTimerRef.current);
      }
      viewer?.destroy();
      osdRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadEntries() {
      try {
        const response = await fetch("/ocr/entries.json");
        if (!response.ok) {
          throw new Error(`Failed to fetch OCR index: ${response.status}`);
        }
        const data = (await response.json()) as OcrEntry[];
        if (!cancelled) {
          setEntries(data);
        }
      } catch {
        if (!cancelled) {
          setError("OCRインデックスを読み込めませんでした。");
        }
      }
    }

    void loadEntries();
    return () => {
      cancelled = true;
    };
  }, []);

  const fuse = useMemo(() => {
    if (entries.length === 0) {
      return null;
    }
    return new Fuse(entries, {
      includeScore: true,
      threshold: 0.28,
      ignoreLocation: true,
      minMatchCharLength: 2,
      keys: [
        { name: "norm", weight: 0.75 },
        { name: "text", weight: 0.25 }
      ]
    });
  }, [entries]);

  const matches = useMemo(() => {
    const q = normalizeQuery(query);
    if (!q || !fuse) {
      return [];
    }
    return fuse.search(q).map((item) => item.item);
  }, [fuse, query]);

  const visibleMatches = matches.slice(0, MAX_SUGGESTIONS);

  const clearOverlay = useCallback(() => {
    const viewer = osdRef.current;
    const element = activeOverlayRef.current;

    if (viewer && element) {
      viewer.removeOverlay(element);
    }

    if (overlayTimerRef.current) {
      window.clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
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
      overlayTimerRef.current = window.setTimeout(() => {
        clearOverlay();
      }, 1800);
    },
    [clearOverlay, isReady]
  );

  const jumpToMatch = useCallback(
    (index: number) => {
      const entry = matches[index];
      if (!entry) {
        return;
      }
      setActiveIndex(index);
      setSelectedIndex(index);
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
    setSelectedIndex(null);
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
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "/") {
        const target = event.target as HTMLElement | null;
        const isTyping =
          !!target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable);
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
      if (event.key === "n" && matches.length > 0) {
        event.preventDefault();
        const nextIndex = (activeIndex + 1) % matches.length;
        jumpToMatch(nextIndex);
      }
      if (event.key === "p" && matches.length > 0) {
        event.preventDefault();
        const nextIndex = (activeIndex - 1 + matches.length) % matches.length;
        jumpToMatch(nextIndex);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, jumpToMatch, matches.length, isSearchOpen]);

  return (
    <main className="page-shell">
      <section className="viewer-shell">
        <div className="topbar">
          <div className={`search-block ${isSearchOpen ? "is-open" : ""}`}>
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
                  if (event.key === "Enter" && matches.length > 0) {
                    jumpToMatch(activeIndex);
                    inputRef.current?.blur();
                  }
                }}
                className="search-input"
                placeholder="Search timeline text... (/)"
                spellCheck={false}
                tabIndex={isSearchOpen ? 0 : -1}
              />
            </div>
            {isSearchOpen && isInputFocused && query && (
              <div className="suggestions">
                {visibleMatches.length === 0 ? (
                  <p className="suggestion-empty">No match</p>
                ) : (
                  visibleMatches.map((entry, index) => (
                    <button
                      key={entry.id}
                      className={`suggestion-item ${index === activeIndex ? "is-active" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => jumpToMatch(index)}
                      type="button"
                    >
                      <span>{entry.text}</span>
                      <span className="suggestion-meta">
                        {(entry.conf * 100).toFixed(0)}%
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div ref={viewerRef} className="viewer-canvas" />
      </section>
      {error && <p className="error-banner">{error}</p>}
    </main>
  );
}
