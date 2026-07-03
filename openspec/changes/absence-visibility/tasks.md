## 1. Visibility Policy

- [ ] 1.1 Central visibility policy module: declarative §11A matrix → Prisma `where`/`select` shaping per viewer role _(Slice 1)_
- [ ] 1.2 Route existing request list/detail endpoints through the policy module; tests per viewer role _(Slice 1)_
- [ ] 1.3 Field stripping for Management-level viewers (reason/context never serialized) _(Slice 1)_

## 2. Absence Feed

- [ ] 2.1 Absence range endpoint: approved Leave/WFH overlapping a month window, policy-scoped, with filters (department/project/type/person) _(Slice 2)_
- [ ] 2.2 Over-cap evaluation against the tenant's concurrent-absence cap _(Slice 2)_

## 3. Calendar UI

- [ ] 3.1 Month grid component: stacked chips, spans, day-count badges, "+N more" + day-detail, matching the design _(Slice 3)_
- [ ] 3.2 Filter bar + list/agenda alternative view _(Slice 4)_

## 4. Entry Points

- [ ] 4.1 HR Absences screen: stats row, calendar, away-this-week + by-project side panels _(Slice 5)_
- [ ] 4.2 Admin Absence Calendar screen: calendar + over-cap warning panel with flagged days _(Slice 5)_

## 5. Verify

- [ ] 5.1 An employee can never fetch another's request via list, detail, or calendar endpoints
- [ ] 5.2 A pending request is invisible to everyone but requester + assigned approvers
- [ ] 5.3 Management responses contain no reason/context fields at the wire level; HR responses do
- [ ] 5.4 PM sees only their project members' absences
- [ ] 5.5 An over-cap day is flagged with the correct names on the Admin calendar
