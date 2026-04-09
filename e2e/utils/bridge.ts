import type { Page } from "@playwright/test";
import type {
  AnswerRecord,
  HpPenaltyGuardRecord,
} from "@/store/useAppStore";

const APP_STORAGE_KEY = "app-storage";
const E2E_APP_STATE_KEY = "contestant-app:e2e-app-state";
const E2E_QUIZ_STATE_KEY = "contestant-app:e2e-quiz-state";

type AppSeed = {
  user?: { id: string; name: string; team?: string } | null;
  isAuthenticated?: boolean;
  oceanPlayMode?: "solo" | "group" | null;
  oceanGroupId?: "red" | "blue" | null;
  oceanGroupLocked?: boolean;
  sprintTeamId?: "red" | "blue" | null;
  sprintTeamLocked?: boolean;
  sprintTeamStageId?: string | null;
  currentQuestionId?: string | null;
  answers?: Record<string, AnswerRecord>;
  hpPenaltyGuards?: Record<string, HpPenaltyGuardRecord>;
  mqttConnected?: boolean;
};

type QuizSeed = Record<string, unknown>;

function buildAppSeed(overrides: AppSeed = {}): AppSeed {
  const seed: AppSeed = {
    user: { id: "1001", name: "1号台" },
    isAuthenticated: true,
    oceanPlayMode: null,
    oceanGroupId: null,
    oceanGroupLocked: false,
    sprintTeamId: null,
    sprintTeamLocked: false,
    sprintTeamStageId: null,
    currentQuestionId: null,
    answers: {},
    hpPenaltyGuards: {},
    mqttConnected: false,
    ...overrides,
  };

  if (!seed.user) {
    seed.isAuthenticated = false;
  } else if (overrides.isAuthenticated === undefined) {
    seed.isAuthenticated = true;
  }

  return seed;
}

function buildPersistedAppState(seed: AppSeed) {
  return {
    user: seed.user ?? null,
    isAuthenticated: seed.isAuthenticated ?? Boolean(seed.user),
    oceanPlayMode: seed.oceanPlayMode ?? null,
    oceanGroupId: seed.oceanGroupId ?? null,
    oceanGroupLocked: seed.oceanGroupLocked ?? false,
    sprintTeamId: seed.sprintTeamId ?? null,
    sprintTeamLocked: seed.sprintTeamLocked ?? false,
    sprintTeamStageId: seed.sprintTeamStageId ?? null,
    answers: seed.answers ?? {},
    hpPenaltyGuards: seed.hpPenaltyGuards ?? {},
  };
}

export async function seedStores(
  page: Page,
  {
    app,
    quiz,
  }: {
    app?: AppSeed;
    quiz?: QuizSeed;
  } = {}
) {
  const appSeed = buildAppSeed(app);
  const persistedAppState = buildPersistedAppState(appSeed);

  await page.addInitScript(
    ([persisted, liveAppSeed, liveQuizSeed, keys]) => {
      window.localStorage.setItem(
        keys.appStorage,
        JSON.stringify({
          state: persisted,
          version: 0,
        })
      );
      window.localStorage.setItem(keys.e2eAppState, JSON.stringify(liveAppSeed));
      if (liveQuizSeed) {
        window.localStorage.setItem(keys.e2eQuizState, JSON.stringify(liveQuizSeed));
      } else {
        window.localStorage.removeItem(keys.e2eQuizState);
      }
    },
    [
      persistedAppState,
      appSeed,
      quiz ?? null,
      {
        appStorage: APP_STORAGE_KEY,
        e2eAppState: E2E_APP_STATE_KEY,
        e2eQuizState: E2E_QUIZ_STATE_KEY,
      },
    ] as const
  );
}

export async function waitForE2EBridge(page: Page) {
  await page.waitForFunction(() => Boolean(window.__E2E__));
}

export async function loginAsDefaultStation(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "ID 1001 1号台" }).click();
  await page.waitForFunction(() => window.location.pathname === "/waiting");
  await waitForE2EBridge(page);
}

export async function setQuizState(page: Page, partial: QuizSeed) {
  await waitForE2EBridge(page);
  await page.evaluate((payload) => {
    window.__E2E__?.setQuizState(payload);
  }, partial);
}

export async function setAppState(page: Page, partial: AppSeed) {
  await waitForE2EBridge(page);
  await page.evaluate((payload) => {
    window.__E2E__?.setAppState(payload);
  }, partial);
}
