
- Script Boss: role-play runs through the `script-boss` function (Claude for the client and scoring, built-in voice for speech in and out); scored calls save into `practice_sessions` so they share the Practice history and the Team 4-1-1 column. Why: one practice history, and the AI keys stay on the server.
- Every agent picker loads people via `fetchAgentOptions()` (`list_agent_options` RPC: active team-role agent/operations in caller's org, demo only in demo mode). Why: clients and test accounts must never appear in agent dropdowns.
