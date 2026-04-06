# BENCHMARK_COMPARISON

## Parsing

| Scenario | Before (ms) | After (ms) | Delta | Outcome |
| --- | ---: | ---: | ---: | --- |
| 1000_rows | 4 | 2.93 | +26.75% | improved |
| 10000_rows | 21.1 | 29.92 | -41.8% | regressed |
| 100000_rows | 214.65 | 277.2 | -29.14% | regressed |
| 500000_rows | 0 | 2855.15 | n/a | regressed |

## Query

| Scenario | Before (ms) | After (ms) | Delta | Outcome |
| --- | ---: | ---: | ---: | --- |
| select_all_full_scan | 119.43 | 127.27 | -6.56% | regressed |
| select_where_text | 3.46 | 0.07 | +97.98% | improved |
| select_where_numeric | 9.01 | 20.07 | -122.75% | regressed |
| group_by_count_avg | 26.21 | 68.2 | -160.21% | regressed |
| join_two_50k_tables | 23.75 | 48.61 | -104.67% | regressed |
| subquery_with_aggregate_where | 18.49 | 41.59 | -124.93% | regressed |
| order_by_non_indexed_column | 92.73 | 249.65 | -169.22% | regressed |
| complex_group_having_order_limit | 26.2 | 68.13 | -160.04% | regressed |

## API

| Scenario | Metric | Before (ms) | After (ms) | Delta | Outcome |
| --- | --- | ---: | ---: | ---: | --- |
| small_file_simple_query | p50Ms | 5 | 2 | +60% | improved |
| small_file_simple_query | p95Ms | 152.67 | 119.33 | +21.84% | improved |
| small_file_simple_query | p99Ms | 225 | 177 | +21.33% | improved |
| medium_file_group_by | p50Ms | 53 | 47 | +11.32% | improved |
| medium_file_group_by | p95Ms | 61 | 53 | +13.11% | improved |
| medium_file_group_by | p99Ms | 61 | 53 | +13.11% | improved |
| medium_file_group_by_concurrent_10 | p50Ms | 431 | 303 | +29.7% | improved |
| medium_file_group_by_concurrent_10 | p95Ms | 566.67 | 406.67 | +28.24% | improved |
| medium_file_group_by_concurrent_10 | p99Ms | 774 | 420 | +45.74% | improved |

## Memory

| Metric | Before | After | Delta | Outcome |
| --- | ---: | ---: | ---: | --- |
| peakHeapUsedMb | 123.95 | 74.49 | +39.9% | improved |

## Biggest Wins

- Query select_where_text: 97.98% improvement
- API small_file_simple_query p50: 60% improvement
- Memory peakHeapUsedMb: 39.9% improvement
- API medium_file_group_by_concurrent_10 p50: 29.7% improvement
- Parsing 1000_rows: 26.75% improvement
