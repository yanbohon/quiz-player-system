import {
  expect,
  test as base,
  type Page,
} from "@playwright/test";
import {
  seedStores,
  setAppState,
  setQuizState,
  waitForE2EBridge,
} from "./utils/bridge";
import {
  mockFusionDatasheet,
  mockGrabQuestionSequence,
  mockSubmitAnswerSequence,
} from "./utils/mock-api";

type SeedOptions = NonNullable<Parameters<typeof seedStores>[1]>;
type QuizSeed = Parameters<typeof setQuizState>[1];
type AppSeed = Parameters<typeof setAppState>[1];
type FusionDatasheetRecords = Parameters<typeof mockFusionDatasheet>[2];
type GrabResponses = Parameters<typeof mockGrabQuestionSequence>[1];
type SubmitResponses = Parameters<typeof mockSubmitAnswerSequence>[1];

type QuizHarness = {
  page: Page;
  goto: (path: string, seed?: SeedOptions) => Promise<void>;
  seed: (seed: SeedOptions) => Promise<void>;
  setQuizState: (partial: QuizSeed) => Promise<void>;
  setAppState: (partial: AppSeed) => Promise<void>;
  mockFusionDatasheet: (
    datasheetId: string,
    records: FusionDatasheetRecords
  ) => Promise<void>;
  mockGrabQuestionSequence: (responses: GrabResponses) => Promise<void>;
  mockSubmitAnswerSequence: (responses: SubmitResponses) => Promise<void>;
};

export const test = base.extend<{ quizApp: QuizHarness }>({
  quizApp: async ({ page }, use) => {
    const quizApp: QuizHarness = {
      page,
      async goto(path, seed) {
        if (seed) {
          await seedStores(page, seed);
        }
        await page.goto(path);
        await waitForE2EBridge(page);
      },
      async seed(seed) {
        await seedStores(page, seed);
      },
      async setQuizState(partial) {
        await setQuizState(page, partial);
      },
      async setAppState(partial) {
        await setAppState(page, partial);
      },
      async mockFusionDatasheet(datasheetId, records) {
        await mockFusionDatasheet(page, datasheetId, records);
      },
      async mockGrabQuestionSequence(responses) {
        await mockGrabQuestionSequence(page, responses);
      },
      async mockSubmitAnswerSequence(responses) {
        await mockSubmitAnswerSequence(page, responses);
      },
    };

    await use(quizApp);
  },
});

export { expect };
