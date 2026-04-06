# Load Test Results

Date: 2026-04-06

Command run:

```bash
npx ts-node tests/load-test.ts
```

Artifact:

- `artifacts/load-test-results.json`

## Overall Result

All 4 scenarios passed. The server stayed responsive, returned clean `429` and `408` responses under abuse, and did not crash.

## Scenario 1: Normal load

- Duration: 60 seconds
- Concurrency: 5 users
- Payload: real ~1MB CSV plus `GROUP BY` query
- Requests completed: 625
- Average throughput: 10.42 req/s
- Status codes: `625 x 200`
- Latency: p50 `557ms`, p95 `747ms`, p99 `813ms`
- Autocannon smoke check: `0` errors, `0` timeouts, p99 `62ms`
- Result: passed

Assertion outcome:

- p99 latency stayed below the 5 second target
- No unexpected `500` responses occurred
- Server remained healthy after the run

## Scenario 2: Rate limit storm

- Duration: 10 seconds
- Concurrency: 20 workers from the same IP
- First 10 requests: all `200`
- Storm requests after limit: `1559 x 429`
- Legitimate request after storm: succeeded
- Result: passed

Assertion outcome:

- Per-IP request rate limiting held at the expected threshold
- The server stayed up during the burst
- Legitimate traffic still succeeded after the storm

## Scenario 3: Large file attack

- Concurrency: 3 uploads in parallel
- Payload: ~48MB CSV per request
- Statuses: `200, 200, 200`
- Durations: `3288ms`, `3519ms`, `3859ms`
- Peak observed RSS: `960.31MB`
- Server health after run: healthy
- Result: passed

Assertion outcome:

- Large uploads completed cleanly without crashing the process
- Memory usage stayed below the configured OOM guard threshold used by the scenario
- The server remained responsive after the attack simulation

## Scenario 4: Slow query attack

- Concurrency: 5 parallel recursive CTE queries
- Statuses: `408, 408, 408, 408, 408`
- Durations: `30055ms`, `30071ms`, `30091ms`, `30097ms`, `30103ms`
- Legitimate request during attack: `200` in `1975ms`
- Result: passed

Assertion outcome:

- Every runaway query timed out within `QUERY_TIMEOUT_MS + 5s`
- Timeout handling stayed clean and consistent
- The server continued serving legitimate traffic while the attack was in flight

## Conclusion

The abuse-prevention stack held under normal usage, same-IP flooding, large upload pressure, and deliberately unbounded SQL. Rate limits, request caps, query timeouts, and concurrency controls all behaved as intended in production mode.
