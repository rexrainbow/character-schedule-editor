import { useContext } from 'react';
import { BuiltinTasksContext } from '../contexts/TaskContext.js';
import { builtinVariableDefinitions, builtinTaskDefinitions, setVariableDefinition } from '../../core/builtinTaskModel.js';
export * from '../../core/builtinTaskModel.js';
export const useBuiltinVariableDefinitions = (t) => builtinVariableDefinitions(useContext(BuiltinTasksContext), t);
export const useBuiltinTaskDefinitions = (t) => builtinTaskDefinitions(useContext(BuiltinTasksContext), t);
export const useSetVariableDefinition = (t) => setVariableDefinition(useContext(BuiltinTasksContext), t);
