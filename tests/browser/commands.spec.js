import { test, expect } from '@playwright/test';

test('the shared command layer runs directly in a browser without Node or MCP dependencies', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createProjectSession } = await import('/src/core/projectApi.js');
    const { executeCommand, executeBatch } = await import('/src/core/commands.js');
    const project = createProjectSession(), dayId = crypto.randomUUID(), slotId = crypto.randomUUID();
    const batch = executeBatch(project, [
      { object: 'days', action: 'create', values: { id: dayId, name: 'Browser day', purposes: ['overlay'] } },
      { object: 'slots', action: 'create', values: { id: slotId, name: 'Browser task' } },
      { object: 'days', action: 'assignSlot', id: dayId, target: 0, slotId },
    ]);
    return { ok: batch.ok, day: executeCommand(project, { object: 'days', action: 'get', id: dayId }).value, slotId, errors: project.toDocument().errors };
  });
  expect(result.ok).toBe(true); expect(result.errors).toEqual([]);
  expect(result.day.slotIds[0]).toBe(result.slotId); expect(result.day.purposes).toEqual(['overlay']);
});
