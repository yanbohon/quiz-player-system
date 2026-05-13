# Next.js to Vite + React Migration Design

## Status

Approved design for a first-stage framework migration.

## Context

The contestant app is currently a Next.js 15 mobile SPA-like client. Its primary runtime behavior is browser-side:

- fixed station login
- waiting page driven by MQTT host commands
- quiz page for multiple contest modes
- Zustand state persistence
- Fusion and quiz-pool API calls from the browser
- Arco Design Mobile UI
- Vitest unit/component tests and Playwright E2E tests

The current code uses Next.js mostly as a routing, build, image, and deployment shell. The app does not rely on SSR, React Server Components, API routes, dynamic SEO, or server actions. Most pages and providers are client components.

## Decision

Migrate the project to Vite + React as a browser-only SPA while preserving business behavior.

The first stage is a framework-shell migration only. It must not refactor contest logic, rewrite the UI, change the API model, or alter quiz behavior except where a compatibility adapter is required to remove Next-specific APIs.

## Goals

- Replace Next.js build/runtime with Vite + React.
- Keep Arco Design Mobile, CSS Modules, Zustand, React Query, MQTT.js, Fusion API, quiz-pool API, Vitest, and Playwright.
- Keep existing visual output and interaction behavior as close as possible.
- Use Vite `dist/` as the primary production artifact.
- Support static deployment and a lightweight static-file CloudRun container.
- Support both `VITE_*` and legacy `NEXT_PUBLIC_*` environment variables during migration.
- Preserve existing route behavior for `/`, `/login`, `/waiting`, and `/quiz?mode=<mode>`.
- Preserve localStorage keys and persisted state contracts.

## Non-Goals

- No UI framework migration.
- No contest-mode redesign.
- No `quiz/page.tsx`, `quizStore`, or `useQuizRuntime` business refactor beyond required import/API compatibility.
- No API payload changes.
- No change to MQTT topic semantics or host command semantics.
- No change to Fusion schema assumptions.
- No change to answer persistence semantics.
- No removal of existing tests except Next-specific mocks that become obsolete.

## Target Architecture

### Runtime Shape

The migrated app is a Vite-built React SPA:

```text
index.html
src/main.tsx
src/App.tsx
src/providers/AppProviders.tsx
src/pages/LoginPage.tsx
src/pages/WaitingPage.tsx
src/pages/QuizPage.tsx
src/features/quiz/...
src/store/...
src/lib/...
src/hooks/...
```

The business layers remain conceptually unchanged:

- `useAppStore` keeps login, MQTT status, answer cache, group selections, and HP guard persistence.
- `useQuizStore` keeps contest, stage, question, team, score, ranking, and quiz-pool state.
- `useQuizRuntime` keeps the unified contest runtime abstraction.
- `useControlCommands` keeps MQTT host-command handling.
- `useQuizSubmission` and `useQuizPersistenceQueue` keep answer submission and retry behavior.

### Routing

Use `react-router-dom` for client routing.

Routes:

```text
/             -> WaitingPage
/login        -> LoginPage
/waiting      -> WaitingPage
/quiz         -> QuizPage
```

Query parameters remain part of the URL contract:

```text
/quiz?mode=speed-run
/quiz?mode=ocean-adventure
/quiz?mode=buzzer-sprint&entry=...
```

If the app is served under a base path such as `/xinsai-player`, the router must use the same basename as Vite `base`.

### Providers

The current provider responsibilities remain:

- React Query `QueryClientProvider`
- optional React Query Devtools
- `E2EBridge`
- global MQTT control-command bridge
- session guard and tab leader gating

The provider should be moved out of Next app routing and become a normal React provider module, for example:

```text
src/app/providers.tsx -> src/providers/AppProviders.tsx
```

The migration may keep the old path temporarily if it reduces churn, but the final imports must not depend on Next conventions.

## Next-Specific Replacement Plan

### `next/navigation`

Replace imports from `next/navigation` with `react-router-dom`.

Mapping:

```text
useRouter().push(path)       -> useNavigate()(path)
useRouter().replace(path)    -> useNavigate()(path, { replace: true })
usePathname()                -> useLocation().pathname
useSearchParams()            -> react-router-dom useSearchParams()
```

To reduce churn, introduce a local navigation adapter if useful:

```text
src/lib/router.ts
```

The adapter can expose `useAppNavigate`, `useAppPathname`, and `useAppSearchParams` so most code does not import `react-router-dom` directly.

### `next/image`

Replace `next/image` with a local image compatibility component.

Recommended adapter:

```text
src/components/AppImage.tsx
```

The component should support only the prop subset used by this app:

- `src`
- `alt`
- `width`
- `height`
- `className`
- `priority`
- `loading`
- `onError`
- `fill`
- `sizes`

For `fill`, the adapter renders an `img` with absolute positioning and full-size styles. Parent layout constraints remain the responsibility of existing CSS.

For local SVG icon imports, configure Vite so existing imports continue to work where practical.

### Metadata and Viewport

Move metadata and viewport content from `src/app/layout.tsx` into `index.html`.

Required values:

- `lang="zh-CN"`
- title: `答题系统 - 选手端`
- description: `答题系统选手端应用`
- viewport matching the current mobile behavior as closely as possible

The existing layout also mounts `FlexibleLayout`; after migration it should be mounted from `main.tsx` or `App.tsx`.

### Global CSS

Move or keep `src/app/globals.css` as the single global stylesheet. Import it once in `src/main.tsx`.

CSS Modules stay unchanged.

### Environment Variables

Introduce a browser-safe environment helper.

Recommended file:

```text
src/config/env.ts
```

Behavior:

- Prefer `VITE_*`.
- Fall back to matching `NEXT_PUBLIC_*`.
- Keep defaults only where the current app already has intentional defaults.
- Avoid reading `process.env` directly in browser code after migration.

Examples:

```text
VITE_MQTT_URL -> NEXT_PUBLIC_MQTT_URL
VITE_TIHAI_API_BASE -> NEXT_PUBLIC_TIHAI_API_BASE
VITE_FUSION_API_BASE -> NEXT_PUBLIC_FUSION_API_BASE
VITE_BASE_PATH -> NEXT_PUBLIC_BASE_PATH
VITE_E2E -> NEXT_PUBLIC_E2E
VITE_ENABLE_QUERY_DEVTOOLS -> NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS
```

This dual-prefix strategy allows existing Playwright and deployment env files to keep working while new Vite-native env names are introduced.

### Base Path

Vite `base`, React Router basename, static asset URLs, and deployment fallback rules must use the same normalized base path.

Rules:

- Empty base path means root deployment.
- `/xinsai-player` means the app is served under that prefix.
- Normalize leading slash.
- Avoid trailing slash except where Vite requires one internally.

The spec assumes `/xinsai-player` remains supported because the current Docker and Next config already reference it.

## Build and Tooling

### Package Scripts

Replace Next scripts with Vite equivalents:

```json
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "type-check": "tsc --noEmit",
  "test": "vitest run",
  "test:e2e": "playwright test"
}
```

`start` can either be removed or mapped to `vite preview --host 0.0.0.0` for local production preview. Production deployment should not depend on Vite preview unless explicitly chosen.

### Dependencies

Add:

- `@vitejs/plugin-react`
- `vite`
- `react-router-dom`

Likely add if needed:

- `vite-plugin-svgr`

Remove after migration:

- `next`
- `eslint-config-next`

Keep React 19 unless a concrete library incompatibility appears.

### Vite Config

Create `vite.config.ts` with:

- React plugin
- `@` alias to `src`
- base path from env helper or direct environment normalization
- CSS Modules default behavior
- MQTT/browser compatibility settings only as needed by real build errors
- test config can remain in `vitest.config.ts` or be unified carefully

The existing Next Webpack fallback for MQTT should not be copied blindly. Add Vite compatibility only when the build or runtime proves it is required.

### TypeScript

Update `tsconfig.json`:

- remove Next plugin
- remove `.next/types/**/*.ts`
- remove `next-env.d.ts` from required include
- keep `moduleResolution: "bundler"`
- keep `@/*` path alias
- add Vite env typings through `vite/client`

Replace `next.d.ts` with Vite-compatible env declarations or create `src/vite-env.d.ts`.

## Deployment

### Primary Static Output

The primary production artifact is:

```text
dist/
```

This can be deployed to CloudBase Hosting or any static file host.

Deployment requirements:

- serve static assets from the configured base path
- route all SPA paths back to `index.html`
- preserve query strings such as `/quiz?mode=speed-run`
- set cache headers for hashed assets where the host supports it

### CloudRun Compatibility Container

Keep a CloudRun-compatible Dockerfile, but change it from Next standalone server to static file serving.

Acceptable runtime choices:

- Nginx serving `/usr/share/nginx/html`
- small Node static server

Nginx is preferred for production simplicity.

Required behavior:

- copy Vite `dist/` into the image
- expose the CloudRun port
- serve SPA fallback to `index.html`
- handle the configured base path

### CloudBase Config

Update CloudBase env documentation and config to support `VITE_*` names while keeping legacy `NEXT_PUBLIC_*` during migration.

Do not delete legacy env keys in the first stage. Removal is a later cleanup task after deployment verification.

## Testing Strategy

### Unit and Component Tests

Keep Vitest.

Update test setup:

- remove `next/image` mock
- replace `next/navigation` mocks with React Router test wrappers or the local router adapter mock
- keep jsdom environment
- keep Testing Library setup

High-value tests to keep green:

- `src/store/quizStore.test.ts`
- `src/features/quiz/useQuizRuntime.test.ts`
- `src/features/quiz/useControlCommands.test.ts`
- `src/features/quiz/hooks/useQuizSubmission.test.ts`
- `src/features/quiz/hooks/useQuizPersistenceQueue.test.ts`
- question rendering and answer formatting tests

### E2E Tests

Update Playwright web server command:

```text
npm run dev -- --host 127.0.0.1 --port 3100
```

Update E2E env:

- provide `VITE_E2E=true`
- provide `VITE_MQTT_ENABLED=false` for normal E2E
- provide Vite equivalents for API and Fusion envs
- keep legacy `NEXT_PUBLIC_*` during the transition to test fallback behavior

Keep existing route-level E2E coverage:

- auth
- waiting page
- speed-run
- ocean-adventure
- ultimate challenge
- broker/MQTT tests

### Manual Smoke Checks

Run the existing manual smoke checklist after the automated tests pass, especially for:

- MQTT connection status
- host command routing
- direct refresh on `/login`, `/waiting`, and `/quiz`
- base path deployment
- image rendering in waiting and quiz pages
- drawing board and image question interactions

## Migration Phases

### Phase 1: Add Vite Shell

- Add Vite dependencies and config.
- Add `index.html`.
- Add `src/main.tsx` and `src/App.tsx`.
- Mount `FlexibleLayout` and providers.
- Add React Router routes.
- Keep existing business modules untouched.

### Phase 2: Replace Next APIs

- Replace `next/navigation` with router adapter or React Router hooks.
- Replace `next/image` with `AppImage`.
- Move metadata/viewport to `index.html`.
- Remove Next-only layout/page assumptions.

### Phase 3: Environment Compatibility

- Add env helper with `VITE_*` priority and `NEXT_PUBLIC_*` fallback.
- Update `src/config/control.ts`, `src/config/api.ts`, E2E seed checks, and provider devtools checks to use the helper.
- Update docs and deployment examples.

### Phase 4: Build and Test Tooling

- Update scripts.
- Update TypeScript config.
- Update Vitest setup and mocks.
- Update Playwright web server config.
- Run type-check, unit tests, and key E2E tests.

### Phase 5: Deployment Compatibility

- Replace Next standalone Dockerfile with static-file server Dockerfile.
- Document static `dist/` deployment path.
- Add or document SPA fallback rules for base path deployments.
- Verify local preview and container preview.

### Phase 6: Cleanup

- Remove Next package and config after Vite build and tests pass.
- Remove obsolete Next typings and mocks.
- Keep legacy `NEXT_PUBLIC_*` env fallback for this stage.
- Defer deeper business refactors to a separate spec.

## Acceptance Criteria

The migration is complete when all of the following are true:

- `npm run dev` starts a Vite dev server.
- `/`, `/login`, `/waiting`, and `/quiz?mode=speed-run` render correctly.
- Direct browser refresh works for `/login`, `/waiting`, and `/quiz`.
- `npm run build` produces a valid `dist/`.
- `npm run type-check` passes.
- `npm test` passes.
- Core Playwright E2E tests pass or any skipped tests have documented external-service reasons.
- Arco Mobile UI remains in use.
- Existing CSS Modules styling remains visually consistent.
- Existing localStorage keys remain unchanged.
- Existing MQTT topic names and command semantics remain unchanged.
- Existing Fusion and quiz-pool request payloads remain unchanged.
- Both `VITE_*` and legacy `NEXT_PUBLIC_*` env names are accepted.
- A static preview or container preview serves the app with SPA fallback.
- `/xinsai-player` base path remains supported if configured.

## Risk Register

### Vite Browser Compatibility for MQTT.js

Risk: MQTT.js may require browser-specific resolution or polyfills under Vite.

Mitigation: Build first with minimal Vite config, then add only the compatibility shims required by actual errors.

### Base Path Mismatch

Risk: Vite `base`, router basename, CloudRun route prefix, and static host fallback can diverge.

Mitigation: centralize base path normalization and include direct-refresh tests under the configured prefix.

### Image Layout Drift

Risk: Replacing `next/image` with `img` can alter layout in poster, badge, or option images.

Mitigation: create a small `AppImage` adapter and visually verify waiting and quiz image surfaces.

### Environment Variable Drift

Risk: Existing deployment uses `NEXT_PUBLIC_*`; Vite exposes only `VITE_*` by default.

Mitigation: implement explicit dual-prefix env helper and update Playwright to exercise both paths during transition.

### Over-Refactor During Migration

Risk: Large files such as `quiz/page.tsx`, `quizStore`, and `useQuizRuntime` invite unrelated cleanup.

Mitigation: first-stage rule forbids business refactors. Any deeper cleanup must be tracked in a separate spec.

## Out-of-Scope Follow-Ups

These are intentionally deferred:

- split `src/app/quiz/page.tsx` into smaller page-level hooks
- split `useQuizStore` into store plus Fusion repositories
- split `useQuizRuntime` by contest mode
- remove legacy `NEXT_PUBLIC_*` env support
- replace Arco Design Mobile
- redesign quiz UI

## Rollback Plan

Keep the migration in reviewable commits. If Vite migration blocks delivery:

1. revert the Vite shell and package changes
2. keep any pure docs-only findings
3. return to the existing Next.js scripts and Dockerfile
4. defer the migration until a smaller compatibility issue can be isolated

No data migration is involved because persisted client keys and API contracts must remain unchanged.
