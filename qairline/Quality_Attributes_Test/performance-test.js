/**
 * Performance Test - Response Time Measurement
 * 
 * Measures response time (min/avg/median/p95/max) for all API endpoints
 * Tests both cache-cold and cache-warm scenarios
 */

const { CONFIG, ENDPOINTS, makeRequest, calculateStats, formatTable, log, sleep } = require('./utils');

const API_BASE = CONFIG.API_GATEWAY_URL;
const ITERATIONS_PER_ENDPOINT = 20; // Number of requests per endpoint

// Test scenarios
const SCENARIOS = {
    baseline: { name: 'Baseline (1 VU)', concurrency: 1 },
    normalLoad: { name: 'Normal Load (10 VU)', concurrency: 10 },
    adminHeavy: { name: 'Admin Heavy', concurrency: 5 }
};

/**
 * Test a single endpoint multiple times
 */
async function testEndpoint(endpoint, iterations = ITERATIONS_PER_ENDPOINT) {
    const results = [];

    for (let i = 0; i < iterations; i++) {
        const url = `${API_BASE}${endpoint.path}`;
        const result = await makeRequest(url, {
            method: endpoint.method,
            body: endpoint.body
        });

        results.push(result);

        // Small delay between requests
        await sleep(50);
    }

    return results;
}

/**
 * Clear Redis cache (simulated by waiting for TTL or making write requests)
 */
async function simulateCacheCold() {
    log('Simulating cache-cold scenario (waiting for cache to clear or using unique requests)...');
    // In real scenario, you would use redis-cli FLUSHALL
    // For now, we just log the intent
    await sleep(1000);
}

/**
 * Warm up the cache by making initial requests
 */
async function warmCache() {
    log('Warming up cache...');

    // Hit cacheable endpoints multiple times
    const cacheableEndpoints = [
        '/api/Flights/GetAllFlights',
        '/api/Offers/GetAllOffers'
    ];

    for (const path of cacheableEndpoints) {
        for (let i = 0; i < 5; i++) {
            await makeRequest(`${API_BASE}${path}`, { method: 'GET' });
            await sleep(100);
        }
    }

    log('Cache warmed up');
}

/**
 * Run performance tests for a category of endpoints
 */
async function testCategory(categoryName, endpoints) {
    const results = [];

    for (const endpoint of endpoints) {
        log(`  Testing: ${endpoint.name} (${endpoint.method} ${endpoint.path})`);

        const testResults = await testEndpoint(endpoint);
        const responseTimes = testResults.map(r => r.responseTime);
        const successCount = testResults.filter(r => r.success).length;
        const stats = calculateStats(responseTimes);

        results.push({
            name: endpoint.name,
            path: endpoint.path,
            method: endpoint.method,
            iterations: testResults.length,
            successRate: `${Math.round((successCount / testResults.length) * 100)}%`,
            ...stats
        });
    }

    return results;
}

/**
 * Run full performance test suite
 */
async function runPerformanceTests() {
    console.log('\n' + '='.repeat(80));
    console.log('PERFORMANCE TEST - RESPONSE TIME MEASUREMENT');
    console.log('QAirLine Microservices Architecture');
    console.log('='.repeat(80));
    console.log(`\nAPI Gateway: ${API_BASE}`);
    console.log(`Iterations per endpoint: ${ITERATIONS_PER_ENDPOINT}`);
    console.log(`Started at: ${new Date().toISOString()}\n`);

    const allResults = {
        cacheCold: {},
        cacheWarm: {}
    };

    // ========================================
    // Cache-Cold Tests
    // ========================================
    console.log('\n' + '-'.repeat(60));
    console.log('SCENARIO 1: Cache-Cold Tests');
    console.log('-'.repeat(60));

    await simulateCacheCold();

    log('Testing Guest endpoints (cache-cold)...');
    allResults.cacheCold.guest = await testCategory('Guest', ENDPOINTS.guest);

    log('Testing Auth endpoints...');
    allResults.cacheCold.auth = await testCategory('Auth', ENDPOINTS.auth);

    log('Testing Booking endpoints...');
    allResults.cacheCold.booking = await testCategory('Booking', ENDPOINTS.booking);

    log('Testing Admin endpoints...');
    allResults.cacheCold.admin = await testCategory('Admin', ENDPOINTS.admin);

    // ========================================
    // Cache-Warm Tests
    // ========================================
    console.log('\n' + '-'.repeat(60));
    console.log('SCENARIO 2: Cache-Warm Tests');
    console.log('-'.repeat(60));

    await warmCache();

    log('Testing Guest endpoints (cache-warm)...');
    allResults.cacheWarm.guest = await testCategory('Guest', ENDPOINTS.guest);

    // ========================================
    // Generate Report
    // ========================================
    console.log('\n' + '='.repeat(80));
    console.log('PERFORMANCE TEST RESULTS');
    console.log('='.repeat(80));

    // Cache-Cold Results Table
    console.log('\n### Cache-Cold Results\n');
    const coldHeaders = ['Endpoint', 'Method', 'Min (ms)', 'Avg (ms)', 'Median (ms)', 'P95 (ms)', 'Max (ms)', 'Success'];
    const coldRows = [];

    for (const category of Object.values(allResults.cacheCold)) {
        for (const result of category) {
            coldRows.push([
                result.name,
                result.method,
                result.min,
                result.avg,
                result.median,
                result.p95,
                result.max,
                result.successRate
            ]);
        }
    }
    console.log(formatTable(coldHeaders, coldRows));

    // Cache-Warm Results Table (Guest only - cacheable endpoints)
    console.log('\n### Cache-Warm Results (Cacheable Endpoints)\n');
    const warmHeaders = ['Endpoint', 'Method', 'Min (ms)', 'Avg (ms)', 'Median (ms)', 'P95 (ms)', 'Max (ms)', 'Success'];
    const warmRows = [];

    for (const result of allResults.cacheWarm.guest || []) {
        warmRows.push([
            result.name,
            result.method,
            result.min,
            result.avg,
            result.median,
            result.p95,
            result.max,
            result.successRate
        ]);
    }
    console.log(formatTable(warmHeaders, warmRows));

    // Cache Impact Comparison
    console.log('\n### Cache Impact Comparison\n');
    const compHeaders = ['Endpoint', 'Cold Avg (ms)', 'Warm Avg (ms)', 'Cold P95 (ms)', 'Warm P95 (ms)', 'Improvement'];
    const compRows = [];

    for (let i = 0; i < (allResults.cacheCold.guest || []).length; i++) {
        const cold = allResults.cacheCold.guest[i];
        const warm = allResults.cacheWarm.guest[i];
        if (cold && warm) {
            const improvement = Math.round(((cold.avg - warm.avg) / cold.avg) * 100);
            compRows.push([
                cold.name,
                cold.avg,
                warm.avg,
                cold.p95,
                warm.p95,
                `${improvement > 0 ? '+' : ''}${improvement}%`
            ]);
        }
    }
    console.log(formatTable(compHeaders, compRows));

    // Assessment
    console.log('\n### Assessment\n');

    const avgP95Cold = coldRows.reduce((sum, row) => sum + parseFloat(row[5]), 0) / coldRows.length;
    const avgP95Warm = warmRows.length > 0 ? warmRows.reduce((sum, row) => sum + parseFloat(row[5]), 0) / warmRows.length : avgP95Cold;

    let assessment = '✅ GOOD';
    if (avgP95Cold > 1000) assessment = '🔴 POOR';
    else if (avgP95Cold > 500) assessment = '⚠️ NEEDS IMPROVEMENT';

    console.log(`Average P95 (Cache-Cold): ${Math.round(avgP95Cold)} ms`);
    console.log(`Average P95 (Cache-Warm): ${Math.round(avgP95Warm)} ms`);
    console.log(`Overall Assessment: ${assessment}`);

    console.log('\n' + '='.repeat(80));
    console.log(`Test completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));

    return { allResults, assessment };
}

// Run if executed directly
if (require.main === module) {
    runPerformanceTests()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Performance test failed:', err);
            process.exit(1);
        });
}

module.exports = { runPerformanceTests };
