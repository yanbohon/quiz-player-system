import type { Page, Route } from "@playwright/test";

type DatasheetRecord = {
  recordId: string;
  fields: Record<string, unknown>;
};

type FusionEventNode = {
  id: string;
  name: string;
  type?: string;
  icon?: string;
  isFav?: boolean;
  permission?: number;
};

type GrabResponse = Record<string, unknown>;
type SubmitResponse = Record<string, unknown>;

export async function mockFusionEvents(
  page: Page,
  events: FusionEventNode[]
) {
  await page.route("**/v1/spaces/*/nodes/*", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 0,
        success: true,
        data: {
          id: "e2e-event-node",
          name: "E2E Events",
          type: "folder",
          children: events,
        },
      }),
    });
  });
}

export async function mockFusionDatasheet(
  page: Page,
  datasheetId: string,
  records: DatasheetRecord[]
) {
  await page.route(`**/v1/datasheets/${datasheetId}/records**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 0,
        success: true,
        data: {
          records,
        },
      }),
    });
  });
}

export async function mockGrabQuestionSequence(page: Page, responses: GrabResponse[]) {
  let index = 0;
  await page.route("**/grab-with-details", async (route: Route) => {
    const payload = responses[Math.min(index, responses.length - 1)] ?? {};
    index += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}

export async function mockSubmitAnswerSequence(page: Page, responses: SubmitResponse[]) {
  let index = 0;
  await page.route("**/submit-answer", async (route: Route) => {
    const payload = responses[Math.min(index, responses.length - 1)] ?? {};
    index += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}
