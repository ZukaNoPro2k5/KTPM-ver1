/**
 * Capacity Test - Throughput Measurement
 * 
 * Measures throughput (requests/second) at increasing concurrency levels
 * Target: GET /api/Flights/GetAllFlights
 */

const { CONFIG, makeRequest, calculateStats, formatTable, log, sleep } = require('./utils');

const API_BASE = CONFIG.API_GATEWAY_URL;
const TARGET_ENDPOINT = '/api/Flights/GetAllFlights';
const STAGE_DURATION_MS = 15000; // 15 seconds per concurrency level
const CONCURRENCY_LEVELS = [1, 5, 10, 20, 30, 50, 75, 100];

/**
 * Run requests at a specific concurrency level for a duration
 */
async function runStage(concurrency, durationMs) {
    const results = [];
    const startTime = Date.now();
    let requestId = 0;

    // Create worker function
    async function worker() {
        while (Date.now() - startTime < durationMs) {
            const url = `${API_BASE}${TARGET_ENDPOINT}`;
            const result = await makeRequest(url, { method: 'GET' });
            results.push({
                id: ++requestId,
                ...result,
                timestamp: Date.now()
            });
        }
    }

    // Start concurrent workers
    const workers = [];
    for (let i = 0; i < concurrency; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    return results;
}

/**
 * Warm up the cache before testing
 */
async function warmCache() {
    log('Warming up cache...');
    for (let i = 0; i < 10; i++) {
        await makeRequest(`${API_BASE}${TARGET_ENDPOINT}`, { method: 'GET' });
        await sleep(100);
    }
    log('Cache warmed');
}

/**
 * Run capacity test at all concurrency levels
 */
async function runCapacityTest(cacheWarm = true) {
    console.log('\n' + '='.repeat(80));
    console.log('CAPACITY TEST - THROUGHPUT MEASUREMENT');
    console.log('QAirLine Microservices Architecture');
    console.log('='.repeat(80));
    console.log(`\nAPI Gateway: ${API_BASE}`);
    console.log(`Target Endpoint: ${TARGET_ENDPOINT}`);
    console.log(`Stage Duration: ${STAGE_DURATION_MS / 1000} seconds`);
    console.log(`Concurrency Levels: ${CONCURRENCY_LEVELS.join(', ')}`);
    console.log(`Cache Mode: ${cacheWarm ? 'Warm' : 'Cold'}`);
    console.log(`Started at: ${new Date().toISOString()}\n`);

    if (cacheWarm) {
        await warmCache();
    }

    const stageResults = [];

    for (const concurrency of CONCURRENCY_LEVELS) {
        log(`\nRunning stage: ${concurrency} concurrent users...`);

        const results = await runStage(concurrency, STAGE_DURATION_MS);

        const responseTimes = results.map(r => r.responseTime);
        const stats = calculateStats(responseTimes);
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.length - successCount;
        const errorRate = (errorCount / results.length) * 100;

        // Calculate throughput (requests per second)
        const actualDuration = (results[results.length - 1]?.timestamp - results[0]?.timestamp) / 1000 || STAGE_DURATION_MS / 1000;
        const throughput = results.length / actualDuration;

        stageResults.push({
            concurrency,
            totalRequests: results.length,
            successCount,
            errorCount,
            errorRate: Math.round(errorRate * 100) / 100,
            throughput: Math.round(throughput * 100) / 100,
            ...stats
        });

        log(`  Completed: ${results.length} requests, ${Math.round(throughput)} req/s, P95: ${stats.p95}ms, Error: ${errorRate.toFixed(1)}%`);

        // Brief pause between stages
        await sleep(2000);
    }

    // ========================================
    // Generate Report
    // ========================================
    console.log('\n' + '='.repeat(80));
    console.log('CAPACITY TEST RESULTS');
    console.log('='.repeat(80));

    // Results Table
    console.log('\n### Throughput vs Concurrency\n');
    const headers = ['Concurrency', 'Requests', 'Throughput (req/s)', 'Avg (ms)', 'P95 (ms)', 'Max (ms)', 'Error Rate'];
    const rows = stageResults.map(r => [
        r.concurrency,
        r.totalRequests,
        r.throughput,
        r.avg,
        r.p95,
        r.max,
        `${r.errorRate}%`
    ]);
    console.log(formatTable(headers, rows));

    // Find optimal concurrency
    const optimalStage = stageResults.find(r => r.p95 < 1000 && r.errorRate < 5);
    const maxThroughputStage = stageResults.reduce((max, r) =>
        (r.throughput > max.throughput && r.errorRate < 5) ? r : max, stageResults[0]);

    console.log('\n### Analysis\n');
    console.log(`Peak Throughput: ${maxThroughputStage.throughput} req/s at ${maxThroughputStage.concurrency} concurrent users`);

    if (optimalStage) {
        console.log(`Optimal Concurrency (P95 < 1000ms, Error < 5%): ${optimalStage.concurrency} users`);
    } else {
        console.log(`Warning: No concurrency level met optimal criteria (P95 < 1000ms, Error < 5%)`);
    }

    // Saturation point detection
    let saturationPoint = null;
    for (let i = 1; i < stageResults.length; i++) {
        const prev = stageResults[i - 1];
        const curr = stageResults[i];
        const throughputIncrease = ((curr.throughput - prev.throughput) / prev.throughput) * 100;

        if (throughputIncrease < 10 && curr.concurrency > prev.concurrency * 1.5) {
            saturationPoint = prev.concurrency;
            break;
        }
    }

    if (saturationPoint) {
        console.log(`Saturation Point: ~${saturationPoint} concurrent users`);
    }

    // Assessment
    console.log('\n### Assessment\n');
    let assessment = '✅ GOOD';
    if (maxThroughputStage.throughput < 50) assessment = '🔴 POOR';
    else if (maxThroughputStage.throughput < 100) assessment = '⚠️ NEEDS IMPROVEMENT';

    console.log(`Maximum Sustainable Throughput: ${maxThroughputStage.throughput} req/s`);
    console.log(`Overall Assessment: ${assessment}`);

    console.log('\n' + '='.repeat(80));
    console.log(`Test completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));

    return { stageResults, assessment, maxThroughput: maxThroughputStage.throughput };
}

// Run if executed directly
if (require.main === module) {
    // Run with cache-warm by default
    runCapacityTest(true)
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Capacity test failed:', err);
            process.exit(1);
        });
}

module.exports = { runCapacityTest };
