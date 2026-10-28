# Frozen pre-migration simulator

These files are the former synchronous simulator, retained only as a regression oracle.
Production code must never import this directory. Existing rule tests retain their baseline
imports here; `simulationRuntime.test.js` compares the new runtime-backed adapter with that
baseline. `runtimeEngine.test.js` and `runtimeDiagnostics.test.js` directly verify the new
engine, transactions, recovery and diagnostic contract. Browser tests exercise the migrated GUI.
