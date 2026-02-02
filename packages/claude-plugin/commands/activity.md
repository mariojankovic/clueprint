---
description: Get the last 30 seconds of browser activity
allowed-tools: mcp__clueprint__activity
argument-hint: [task]
---

Call `mcp__clueprint__activity` to get recent browser activity from the background capture buffer.

This returns a timeline of user interactions, network requests, and errors without needing to start a recording. The user must have background capture enabled in the browser widget.

If the user provided a task, help debug using the activity data. Otherwise, summarize what happened.

$ARGUMENTS
