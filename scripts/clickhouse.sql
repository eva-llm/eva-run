CREATE TABLE IF NOT EXISTS test_results (
    id UUID,
    run_id UUID,
    provider LowCardinality(String),
    model LowCardinality(String),
    prompt String,
    output String,
    passed UInt8,
    metadata String,
    started_at DateTime64(3),
    assert_started_at DateTime64(3),
    finished_at DateTime64(3),
    diff_ms Int32,
    assert_diff_ms Int32,
    output_diff_ms Int32
) ENGINE = MergeTree()
ORDER BY (run_id, id);

CREATE TABLE IF NOT EXISTS assert_results (
    id UUID,
    test_id UUID,
    run_id UUID,
    name LowCardinality(String),
    criteria String,
    passed UInt8,
    score Float64,
    reason String,
    threshold Float64,
    metadata String, 
    started_at DateTime64(3),
    finished_at DateTime64(3),
    diff_ms Int32
) ENGINE = MergeTree()
ORDER BY (run_id, test_id);