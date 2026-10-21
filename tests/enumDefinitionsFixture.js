import { enumFixture } from './enumFixture.js';
import { addEnumNode } from '../src/core/enumDefinitions.js';
import { createEnvironmentInfo } from '../src/core/environmentModel.js';
export function enumDefinitionsFixture() {
  const f = enumFixture();
  let nodes = {};
  const group = addEnumNode(nodes, null, 'group', 'Time', 'environment'); nodes = group.nodes;
  const property = addEnumNode(nodes, group.id, 'enum', 'Event property', 'environment'); nodes = property.nodes;
  nodes[property.id].options = structuredClone(f.property.options); nodes[property.id].symbol = 'enum_event_property';
  const weekday = addEnumNode(nodes, group.id, 'enum', 'Weekday', 'environment'); nodes = weekday.nodes;
  nodes[weekday.id].options = [{ display_name: 'Monday', value: 'Monday' }, { display_name: 'Tuesday', value: 'Tuesday' }]; nodes[weekday.id].symbol = 'enum_weekday';
  const operation = addEnumNode(nodes, null, 'enum', 'Event operation', 'application'); nodes = operation.nodes;
  nodes[operation.id].options = structuredClone(f.operation.options);
  f.property.enum_id = property.id; delete f.property.options;
  f.operation.enum_id = operation.id; delete f.operation.options;
  f.draft.enumNodes = nodes; f.draft.environment = createEnvironmentInfo('Engine');
  return { ...f, enumGroupId: group.id, propertyEnumId: property.id, operationEnumId: operation.id, weekdayEnumId: weekday.id };
}
