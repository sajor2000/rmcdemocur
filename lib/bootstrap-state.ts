import fs from "fs/promises";
import path from "path";

export const BOOTSTRAP_STATE_PATH = path.join(
  process.cwd(),
  "data/bootstrap-state.json",
);

export const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;

export type BootstrapPhase =
  | "idle"
  | "schema"
  | "frameworks"
  | "course-seed"
  | "process-smoke"
  | "process-full"
  | "complete";

export type FrameworkProgress = {
  embedded: number;
  total: number;
  complete: boolean;
};

export type BootstrapState = {
  version: 1;
  updatedAt: string;
  phase: BootstrapPhase;
  smokeVerified: boolean;
  smokeVerifiedAt?: string;
  smokeCaseNumber: number;
  frameworks: {
    usmle: FrameworkProgress;
    aamc: FrameworkProgress;
    keywords: FrameworkProgress;
  };
  courseSeeded: boolean;
  processedDocumentIds: number[];
};

export function defaultBootstrapState(): BootstrapState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    phase: "idle",
    smokeVerified: false,
    smokeCaseNumber: 1,
    frameworks: {
      usmle: { embedded: 0, total: 0, complete: false },
      aamc: { embedded: 0, total: 0, complete: false },
      keywords: { embedded: 0, total: 0, complete: false },
    },
    courseSeeded: false,
    processedDocumentIds: [],
  };
}

let stateDirReady = false;

async function ensureStateDir() {
  if (stateDirReady) return;
  await fs.mkdir(path.dirname(BOOTSTRAP_STATE_PATH), { recursive: true });
  stateDirReady = true;
}

export async function loadBootstrapState(): Promise<BootstrapState> {
  try {
    const raw = await fs.readFile(BOOTSTRAP_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as BootstrapState;
    if (parsed.version === 1) return parsed;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return defaultBootstrapState();
    }
    throw err;
  }
  return defaultBootstrapState();
}

export async function saveBootstrapState(state: BootstrapState): Promise<void> {
  await ensureStateDir();
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(BOOTSTRAP_STATE_PATH, JSON.stringify(state));
}

export async function updateBootstrapState(
  patch: Partial<BootstrapState> | ((state: BootstrapState) => void),
): Promise<BootstrapState> {
  const state = await loadBootstrapState();
  if (typeof patch === "function") {
    patch(state);
  } else {
    Object.assign(state, patch);
  }
  await saveBootstrapState(state);
  return state;
}

export class CheckpointTimer {
  private lastCheckpointAt = Date.now();

  constructor(private readonly intervalMs: number = CHECKPOINT_INTERVAL_MS) {}

  isDue(): boolean {
    return Date.now() - this.lastCheckpointAt >= this.intervalMs;
  }

  markCheckpoint(): void {
    this.lastCheckpointAt = Date.now();
  }
}

export async function maybeCheckpoint(
  timer: CheckpointTimer,
  state: BootstrapState,
  label: string,
): Promise<void> {
  if (!timer.isDue()) return;
  await saveBootstrapState(state);
  timer.markCheckpoint();
  console.log(`[checkpoint] ${label} — saved ${BOOTSTRAP_STATE_PATH}`);
}
