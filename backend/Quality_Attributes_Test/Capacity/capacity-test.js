/**
 * QAirLine API Capacity Test Script
 * Measures system capacity: Throughput (RPS), Scalability, Breaking Point
 * 
 * Metrics collected:
 * - Requests per second (throughput)
 * - Success rate at various concurrency levels
 * - Response time degradation under load
 * - Maximum sustainable concurrent users
 */

const http = require('http');
const fs = require('fs');

const BASE_URL = 'http://localhost:3001';

// ==================== CONFIGURATION ====================
const CONFIG = {
    // Test duration per stage (ms)
    STAGE_DURATION: 15000,

    // Concurrency levels to test (progressive ramp-up)
    CONCURRENCY_LEVELS: [1, 5, 10, 20, 30, 50, 75, 100],

    // Target endpoint for capacity test (GET is most common)
    TARGET_ENDPOINT: { method: 'GET', path: '/api/Flights/GetAllFlights' },

    // Acceptable error rate threshold (%)
    ERROR_THRESHOLD: 5,

    // Acceptable p95 response time threshold (ms)
    P95_THRESHOLD: 1000
};

// ==================== METRICS ====================
const stageResults = [];
let currentMetrics = { times: [], errors: 0, requests: 0, startTime: 0 };

function resetMetrics() {
    currentMetrics = { times: [], errors: 0, requests: 0, startTime: Date.now() };
}

function recordRequest(duration, isError) {
    currentMetrics.times.push(duration);
    currentMetrics.requests++;
    if (isError) currentMetrics.errors++;
}

function calculateStats(times) {
    if (!times || times.length === 0) return null;
    const sorted = [...times].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const len = sorted.length;
    return {
        count: len,
        min: Math.round(sorted[0] * 100) / 100,
        max: Math.round(sorted[len - 1] * 100) / 100,
        avg: Math.round((sum / len) * 100) / 100,
        median: Math.round(sorted[Math.floor(len / 2)] * 100) / 100,
        p90: Math.round(sorted[Math.floor(len * 0.9)] * 100) / 100,
        p95: Math.round(sorted[Math.floor(len * 0.95)] * 100) / 100
    };
}

// ==================== HTTP REQUEST ====================
function makeRequest() {
    return new Promise((resolve) => {
        const { method, path } = CONFIG.TARGET_ENDPOINT;
        const url = new URL(BASE_URL + path);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        };

        const startTime = performance.now();

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const duration = performance.now() - startTime;
                resolve({ duration, isError: res.statusCode >= 400 });
            });
        });

        req.on('error', () => {
            resolve({ duration: performance.now() - startTime, isError: true });
        });

        req.setTimeout(10000, () => {
            req.destroy();
            resolve({ duration: 10000, isError: true });
        });

        req.end();
    });
}

// ==================== WORKER ====================
async function runWorker(stopTime) {
    while (Date.now() < stopTime) {
        const result = await makeRequest();
        recordRequest(result.duration, result.isError);
    }
}

// ==================== CAPACITY TEST ====================
async function runCapacityTest(concurrency) {
    console.log(`\n   Testing with ${concurrency} concurrent users...`);
    resetMetrics();

    const stopTime = Date.now() + CONFIG.STAGE_DURATION;
    const workers = [];

    for (let i = 0; i < concurrency; i++) {
        workers.push(runWorker(stopTime));
    }

    await Promise.all(workers);

    const elapsedSeconds = (Date.now() - currentMetrics.startTime) / 1000;
    const stats = calculateStats(currentMetrics.times);
    const throughput = Math.round((currentMetrics.requests / elapsedSeconds) * 100) / 100;
    const errorRate = Math.round((currentMetrics.errors / currentMetrics.requests) * 10000) / 100;

    const result = {
        concurrency,
        totalRequests: currentMetrics.requests,
        throughput, // RPS
        errorRate,  // %
        ...stats
    };

    stageResults.push(result);

    console.log(`   └─ ${throughput} RPS | Errors: ${errorRate}% | p95: ${stats?.p95 || 'N/A'}ms`);

    return result;
}

// ==================== BREAKING POINT DETECTION ====================
function findBreakingPoint() {
    for (let i = 1; i < stageResults.length; i++) {
        const current = stageResults[i];
        const previous = stageResults[i - 1];

        // Breaking point: Error rate exceeds threshold
        if (current.errorRate > CONFIG.ERROR_THRESHOLD && previous.errorRate <= CONFIG.ERROR_THRESHOLD) {
            return {
                type: 'error_threshold',
                concurrency: current.concurrency,
                details: `Error rate ${current.errorRate}% exceeded ${CONFIG.ERROR_THRESHOLD}% threshold`
            };
        }

        // Breaking point: p95 exceeds threshold
        if (current.p95 > CONFIG.P95_THRESHOLD && previous.p95 <= CONFIG.P95_THRESHOLD) {
            return {
                type: 'latency_threshold',
                concurrency: current.concurrency,
                details: `p95 latency ${current.p95}ms exceeded ${CONFIG.P95_THRESHOLD}ms threshold`
            };
        }

        // Breaking point: Throughput plateaus or decreases
        if (i >= 2 && current.throughput <= stageResults[i - 1].throughput * 0.95) {
            return {
                type: 'throughput_plateau',
                concurrency: current.concurrency,
                details: `Throughput plateaued at ${current.throughput} RPS (previous: ${previous.throughput} RPS)`
            };
        }
    }
    return null;
}

// ==================== RESULTS DISPLAY ====================
function printResults() {
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('📊 CAPACITY TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    console.log('┌─────────────┬──────────────┬───────────┬──────────┬─────────┬─────────┬─────────┐');
    console.log('│ Concurrency │ Total Reqs   │ RPS       │ Error %  │ avg(ms) │ p95(ms) │ max(ms) │');
    console.log('├─────────────┼──────────────┼───────────┼──────────┼─────────┼─────────┼─────────┤');

    for (const r of stageResults) {
        const c = String(r.concurrency).padStart(11);
        const t = String(r.totalRequests).padStart(12);
        const rps = String(r.throughput).padStart(9);
        const err = String(r.errorRate + '%').padStart(8);
        const avg = String(r.avg).padStart(7);
        const p95 = String(r.p95).padStart(7);
        const max = String(r.max).padStart(7);
        console.log(`│${c} │${t} │${rps} │${err} │${avg} │${p95} │${max} │`);
    }

    console.log('└─────────────┴──────────────┴───────────┴──────────┴─────────┴─────────┴─────────┘');

    // Find max throughput
    const maxThroughput = Math.max(...stageResults.map(r => r.throughput));
    const maxThroughputStage = stageResults.find(r => r.throughput === maxThroughput);

    console.log('\n📈 CAPACITY SUMMARY:\n');
    console.log(`   Maximum Throughput: ${maxThroughput} requests/second`);
    console.log(`   Optimal Concurrency: ${maxThroughputStage?.concurrency} concurrent users`);

    const breakingPoint = findBreakingPoint();
    if (breakingPoint) {
        console.log(`\n   ⚠️  Breaking Point Detected at ${breakingPoint.concurrency} concurrent users:`);
        console.log(`       ${breakingPoint.details}`);
    } else {
        console.log(`\n   ✅ No breaking point detected within tested range`);
    }

    // Effective capacity (last stage with acceptable performance)
    const acceptableStages = stageResults.filter(r => r.errorRate <= CONFIG.ERROR_THRESHOLD && r.p95 <= CONFIG.P95_THRESHOLD);
    if (acceptableStages.length > 0) {
        const bestStage = acceptableStages[acceptableStages.length - 1];
        console.log(`\n   💪 Effective Capacity: ${bestStage.concurrency} concurrent users`);
        console.log(`       (at ${bestStage.throughput} RPS with ${bestStage.errorRate}% errors and ${bestStage.p95}ms p95)`);
    }
}

function exportResults() {
    const results = {
        testConfig: CONFIG,
        timestamp: new Date().toISOString(),
        targetEndpoint: CONFIG.TARGET_ENDPOINT,
        stages: stageResults,
        summary: {
            maxThroughput: Math.max(...stageResults.map(r => r.throughput)),
            breakingPoint: findBreakingPoint(),
            effectiveCapacity: stageResults.filter(r => r.errorRate <= CONFIG.ERROR_THRESHOLD && r.p95 <= CONFIG.P95_THRESHOLD).pop()
        }
    };

    fs.writeFileSync('capacity-results.json', JSON.stringify(results, null, 2));
    console.log('\n📁 Results saved to: capacity-results.json');
}

// ==================== MAIN ====================
async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   QAirLine API Capacity Test - Throughput & Scalability    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`📋 Test Configuration:`);
    console.log(`   Target: ${CONFIG.TARGET_ENDPOINT.method} ${CONFIG.TARGET_ENDPOINT.path}`);
    console.log(`   Stage Duration: ${CONFIG.STAGE_DURATION / 1000}s per concurrency level`);
    console.log(`   Concurrency Levels: ${CONFIG.CONCURRENCY_LEVELS.join(', ')}`);
    console.log(`   Error Threshold: ${CONFIG.ERROR_THRESHOLD}%`);
    console.log(`   p95 Latency Threshold: ${CONFIG.P95_THRESHOLD}ms`);

    console.log('\n🚀 Starting capacity test...');

    // Warmup
    console.log('\n🔥 Warming up...');
    for (let i = 0; i < 20; i++) { await makeRequest(); }
    console.log('   ✓ Warmup complete');

    // Run progressive load test
    for (const level of CONFIG.CONCURRENCY_LEVELS) {
        await runCapacityTest(level);

        // Early exit if breaking point detected
        const bp = findBreakingPoint();
        if (bp && bp.type === 'error_threshold') {
            console.log(`\n   ⛔ Stopping early: Error threshold exceeded`);
            break;
        }
    }

    printResults();
    exportResults();

    console.log('\n✅ Capacity test complete!\n');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
