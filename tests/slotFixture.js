import { createSlot, branchFromData } from '../src/model.js';

// Existing action tests start with a task branch; new activities start empty in the app.
export function createActionSlot(slots, name) {
  return { ...createSlot(slots, name), branches: [branchFromData({ condition: null })] };
}
