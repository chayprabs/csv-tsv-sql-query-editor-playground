# Edge-Case Test Notes

- `SYS-03` high-concurrency blocking is covered by the benchmark suite rather than a deterministic unit test. The closest automated check is `benchmarks/benchmark-api.ts`, which exercises 10 concurrent requests.
- `SYS-05` client disconnect mid-response is not deterministic in a unit test because the route work runs in a worker thread and request abortion depends on transport timing. The closest automated coverage is the worker cancellation path in `app/api/query/route.ts` plus the timeout test in `tests/edge-cases/uploads-and-runtime.test.ts`.
- `SYS-06` forced out-of-memory is intentionally not simulated in the test runner because it would destabilize the whole process. The closest automated coverage is the size-limit enforcement and the memory benchmark in `benchmarks/benchmark-memory.ts`.
