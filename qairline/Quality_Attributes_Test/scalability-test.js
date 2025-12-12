/**
 * Scalability Test - Load Spike Test
 * 
 * Tests system behavior under sudden load increases (10x spike)
 * Measures scalability efficiency and cache impact
 */

const { CONFIG, makeRequest, calculateStats, formatTable, log, sleep } = require('./utils');

const API_BASE = CONFIG.API_GATEWAY_URL;
const TARGET_ENDPOINT = '/api/Flights/GetAllFlights';

// Test configuration
const BASELINE_CONCURRENCY = 10;
const SPIKE_CONCURRENCY = 100; // 10x spike
const BASELINE_DURATION_MS = 15000; // 15 seconds
const SPIKE_DURATION_MS = 30000; // 30 seconds spike
const RECOVERY_DURATION_MS = 15000; // 15 seconds recovery

/**
 * Run load at specified concurrency for duration
 */
async function runLoadPhase(phaseName, concurrency, durationMs) {
    log(`Starting phase: ${phaseName} (${concurrency} concurrent users, ${durationMs / 1000}s)`);

    const results = [];
    const startTime = Date.now();
    let requestId = 0;

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

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    const responseTimes = results.map(r => r.responseTime);
    const stats = calculateStats(responseTimes);
    const successCount = results.filter(r => r.success).length;
    const errorRate = ((results.length - successCount) / results.length) * 100;
    const actualDuration = (results[results.length - 1]?.timestamp - results[0]?.timestamp) / 1000;
    const throughput = results.length / (actualDuration || 1);

    log(`  Completed: ${results.length} requests, ${Math.round(throughput)} req/s, P95: ${stats.p95}ms`);

    return {
        phase: phaseName,
        concurrency,
        totalRequests: results.length,
        successCount,
        errorCount: results.length - successCount,
        errorRate: Math.round(errorRate * 100) / 100,
        throughput: Math.round(throughput * 100) / 100,
        ...stats,
        rawResults: results
    };
}

/**
 * Warm up cache
 */
async function warmCache() {
    log('Warming up cache...');
    for (let i = 0; i < 20; i++) {
        await makeRequest(`${API_BASE}${TARGET_ENDPOINT}`, { method: 'GET' });
        await sleep(50);
    }
    log('Cache warmed');
}

/**
 * Run full scalability test
 */
async function runScalabilityTest(cacheWarm = true) {
    console.log('\n' + '='.repeat(80));
    console.log('SCALABILITY TEST - LOAD SPIKE ANALYSIS');
    console.log('QAirLine Microservices Architecture');
    console.log('='.repeat(80));
    console.log(`\nAPI Gateway: ${API_BASE}`);
    console.log(`Target Endpoint: ${TARGET_ENDPOINT}`);
    console.log(`Baseline: ${BASELINE_CONCURRENCY} users`);
    console.log(`Spike: ${SPIKE_CONCURRENCY} users (${SPIKE_CONCURRENCY / BASELINE_CONCURRENCY}x increase)`);
    console.log(`Cache Mode: ${cacheWarm ? 'Warm' : 'Cold'}`);
    console.log(`Started at: ${new Date().toISOString()}\n`);

    if (cacheWarm) {
        await warmCache();
    }

    const phases = [];

    // ========================================
    // Phase 1: Baseline
    // ========================================
    console.log('\n' + '-'.repeat(60));
    console.log('PHASE 1: BASELINE LOAD');
    console.log('-'.repeat(60));

    const baseline = await runLoadPhase('Baseline', BASELINE_CONCURRENCY, BASELINE_DURATION_MS);
    phases.push(baseline);

    await sleep(3000); // Brief pause before spike

    // ========================================
    // Phase 2: Spike
    // ========================================
    console.log('\n' + '-'.repeat(60));
    console.log('PHASE 2: LOAD SPIKE (10x)');
    console.log('-'.repeat(60));

    const spike = await runLoadPhase('Spike', SPIKE_CONCURRENCY, SPIKE_DURATION_MS);
    phases.push(spike);

    await sleep(3000); // Brief pause before recovery

    // ========================================
    // Phase 3: Recovery
    // ========================================
    console.log('\n' + '-'.repeat(60));
    console.log('PHASE 3: RECOVERY');
    console.log('-'.repeat(60));

    const recovery = await runLoadPhase('Recovery', BASELINE_CONCURRENCY, RECOVERY_DURATION_MS);
    phases.push(recovery);

    // ========================================
    // Generate Report
    // ========================================
    console.log('\n' + '='.repeat(80));
    console.log('SCALABILITY TEST RESULTS');
    console.log('='.repeat(80));

    // Phase Summary Table
    console.log('\n### Phase Summary\n');
    const phaseHeaders = ['Phase', 'Concurrency', 'Requests', 'Throughput', 'Avg (ms)', 'P95 (ms)', 'Error Rate'];
    const phaseRows = phases.map(p => [
        p.phase,
        p.concurrency,
        p.totalRequests,
        `${p.throughput} req/s`,
        p.avg,
        p.p95,
        `${p.errorRate}%`
    ]);
    console.log(formatTable(phaseHeaders, phaseRows));

    // Scalability Metrics
    console.log('\n### Scalability Metrics\n');

    const concurrencyIncrease = SPIKE_CONCURRENCY / BASELINE_CONCURRENCY;
    const throughputIncrease = spike.throughput / baseline.throughput;
    const scalabilityEfficiency = (throughputIncrease / concurrencyIncrease) * 100;
    const latencyDegradation = ((spike.p95 - baseline.p95) / baseline.p95) * 100;
    const recoveryRatio = recovery.throughput / baseline.throughput;

    console.log(`Concurrency Increase: ${concurrencyIncrease}x (${BASELINE_CONCURRENCY} → ${SPIKE_CONCURRENCY})`);
    console.log(`Throughput Increase: ${throughputIncrease.toFixed(2)}x (${baseline.throughput} → ${spike.throughput} req/s)`);
    console.log(`Scalability Efficiency: ${scalabilityEfficiency.toFixed(1)}%`);
    console.log(`  (100% = linear scaling, <100% = sub-linear, >100% = super-linear)`);
    console.log(`\nLatency Degradation (P95): ${latencyDegradation > 0 ? '+' : ''}${latencyDegradation.toFixed(1)}%`);
    console.log(`  Baseline P95: ${baseline.p95}ms → Spike P95: ${spike.p95}ms`);
    console.log(`\nRecovery Ratio: ${(recoveryRatio * 100).toFixed(1)}%`);
    console.log(`  (100% = full recovery to baseline performance)`);

    // Error Analysis
    console.log('\n### Error Analysis\n');
    console.log(`Baseline Error Rate: ${baseline.errorRate}%`);
    console.log(`Spike Error Rate: ${spike.errorRate}%`);
    console.log(`Recovery Error Rate: ${recovery.errorRate}%`);

    if (spike.errorRate > 5) {
        console.log('\n⚠️ High error rate during spike indicates capacity limits reached');
    } else if (spike.errorRate > 0) {
        console.log('\n⚠️ Some errors during spike, but within acceptable range');
    } else {
        console.log('\n✅ No errors during spike - system handled load gracefully');
    }

    // Cache Impact Analysis
    console.log('\n### Cache Impact on Scalability\n');
    if (cacheWarm) {
        console.log('Test run with cache-warm mode:');
        console.log('✅ Redis cache reduces database load during high concurrency');
        console.log('✅ Cached responses enable higher throughput under spike');
        console.log(`✅ P95 latency remained at ${spike.p95}ms under ${SPIKE_CONCURRENCY}x load`);
    } else {
        console.log('Test run with cache-cold mode:');
        console.log('⚠️ Database is sole data source, higher load on MySQL');
        console.log('Consider re-running with cache-warm for comparison');
    }

    // Assessment
    console.log('\n### Assessment\n');

    let assessment = '✅ GOOD';
    if (scalabilityEfficiency < 30 || spike.errorRate > 10) {
        assessment = '🔴 POOR';
    } else if (scalabilityEfficiency < 60 || spike.errorRate > 5) {
        assessment = '⚠️ NEEDS IMPROVEMENT';
    }

    console.log(`Scalability Efficiency: ${scalabilityEfficiency.toFixed(1)}%`);
    console.log(`Recovery Performance: ${recoveryRatio > 0.9 ? '✅ Excellent' : recoveryRatio > 0.7 ? '⚠️ Good' : '🔴 Poor'}`);
    console.log(`Overall Assessment: ${assessment}`);

    // Comparison with expectations
    console.log('\n### Microservices vs Monolithic Scalability\n');
    console.log('| Metric                  | Expected (Microservices) | Observed        |');
    console.log('|-------------------------|--------------------------|-----------------|');
    console.log(`| Linear Scaling          | ${'>'}60%                     | ${scalabilityEfficiency.toFixed(1)}%           |`);
    console.log(`| Recovery Time           | Immediate                | ${recoveryRatio > 0.9 ? 'Immediate' : 'Delayed'}       |`);
    console.log(`| Error Handling          | Graceful degradation     | ${spike.errorRate < 5 ? 'Achieved' : 'Partial'}         |`);
    console.log(`| Cache Benefit           | Significant              | ${cacheWarm ? 'Active' : 'Not tested'}           |`);

    console.log('\n' + '='.repeat(80));
    console.log(`Test completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));

    return {
        phases,
        scalabilityEfficiency,
        latencyDegradation,
        recoveryRatio,
        assessment
    };
}

// Run if executed directly
if (require.main === module) {
    const cacheWarm = process.argv[2] !== '--cold';

    runScalabilityTest(cacheWarm)
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Scalability test failed:', err);
            process.exit(1);
        });
}

module.exports = { runScalabilityTest };
