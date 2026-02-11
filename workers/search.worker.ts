import Fuse from "fuse.js";

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

type InitMessage = {
  type: "init";
  entries: OcrEntry[];
};

type QueryMessage = {
  type: "query";
  requestId: number;
  query: string;
  limit: number;
};

type WorkerMessage = InitMessage | QueryMessage;

function normalizeQuery(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let entries: OcrEntry[] = [];
let fuse: Fuse<OcrEntry> | null = null;

function buildIndex(nextEntries: OcrEntry[]) {
  entries = nextEntries;
  fuse = new Fuse(entries, {
    includeScore: false,
    threshold: 0.28,
    ignoreLocation: true,
    minMatchCharLength: 2,
    keys: [
      { name: "norm", weight: 0.75 },
      { name: "text", weight: 0.25 }
    ]
  });
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === "init") {
    buildIndex(message.entries);
    return;
  }

  if (message.type !== "query") {
    return;
  }

  const normalized = normalizeQuery(message.query);
  if (!normalized || !fuse) {
    self.postMessage({ requestId: message.requestId, ids: [] });
    return;
  }

  const ids = fuse
    .search(normalized, { limit: message.limit })
    .map((item) => item.item.id);

  self.postMessage({ requestId: message.requestId, ids });
};

