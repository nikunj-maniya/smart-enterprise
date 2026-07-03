## 1. Search API

- [ ] 1.1 Searcher registry + search endpoint (debounce-friendly, min 2 chars, grouped results capped per type) _(Slice 1)_
- [ ] 1.2 Tenant searchers: users, projects, departments (role-gated, tenant-scoped) + own-requests searcher stub until request changes land _(Slice 1)_
- [ ] 1.3 System Admin searchers: enterprises, registrations, platform users _(Slice 1)_
- [ ] 1.4 pg_trgm indexes on searched name/title columns _(Slice 1)_

## 2. Overlay UI

- [ ] 2.1 Search overlay: topbar trigger + Cmd/Ctrl+K, Esc close, focused input, empty/no-results/result states — match the design exactly _(Slice 2)_
- [ ] 2.2 Grouped result rows (icon, title, subtitle) with keyboard navigation _(Slice 2)_

## 3. Deep Links

- [ ] 3.1 Result selection navigates to the owning screen with the record in view _(Slice 3)_

## 4. Verify

- [ ] 4.1 Esc and outside-click close the overlay; shortcut opens it from any screen
- [ ] 4.2 A tenant user searching another enterprise's user/project by exact name gets nothing
- [ ] 4.3 An Employee cannot find colleagues' requests; a System Admin finds enterprises by name
- [ ] 4.4 Selecting each result type lands on its owning screen
