import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRule, isFieldVisible } from './rules.js';
import { parseDefinition } from './metadata.js';
import { validatePayload } from './compile.js';
import { hrHeadVisibilityRule, leaveFormFixture, leavePayloadFixtures } from './fixtures.js';

// Proof that the renderer (client) and the server run the SAME shared functions
// over the SAME fixtures and reach the SAME outcomes.

test('evaluateRule / isFieldVisible: HR Head appears only when duration > 2', () => {
  assert.equal(evaluateRule(hrHeadVisibilityRule, { awayDuration: 3 }), true);
  assert.equal(evaluateRule(hrHeadVisibilityRule, { awayDuration: 2 }), false);
  assert.equal(evaluateRule(hrHeadVisibilityRule, { awayDuration: 1 }), false);
  // Unanswered field: an ordering comparison predictably evaluates false.
  assert.equal(evaluateRule(hrHeadVisibilityRule, {}), false);
  // No rule ⇒ always visible.
  assert.equal(isFieldVisible(undefined, {}), true);
  assert.equal(isFieldVisible(hrHeadVisibilityRule, { awayDuration: 5 }), true);
});

test('parseDefinition accepts the fixture and rejects unknown field types by name', () => {
  assert.doesNotThrow(() => parseDefinition(leaveFormFixture));
  assert.throws(
    () =>
      parseDefinition({
        ...leaveFormFixture,
        sections: [
          {
            order: 0,
            title: 'Bad',
            fields: [{ key: 'weird', label: 'Weird', type: 'rainbow' }],
          },
        ],
      }),
    /weird/,
  );
});

for (const fixture of leavePayloadFixtures) {
  test(`validatePayload: ${fixture.name}`, () => {
    const result = validatePayload(leaveFormFixture, fixture.payload);
    assert.equal(result.success, fixture.expectValid, JSON.stringify(result.errors));
    if (fixture.expectValid) {
      assert.ok(result.data, 'expected validated data on success');
      assert.equal(result.errors, undefined);
    } else {
      assert.ok(result.errors, 'expected errors on failure');
      for (const key of fixture.expectErrorFields ?? []) {
        assert.ok(result.errors?.[key], `expected an error on field "${key}"`);
      }
    }
  });
}
