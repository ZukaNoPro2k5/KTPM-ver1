/**
 * Availability Test - Uptime Rate Measurement
 * 
 * Monitors uptime percentage via periodic HTTP health probes
 * Measures API Gateway and business endpoint availability
 */

const { CONFIG, makeRequest, formatTable, log, sleep } = require('./utils');

const API_BASE = CONFIG.API_GATEWAY_URL;
const PROBE_INTERVAL_MS = 1000; // 1 second between probes
const TEST_DURATION_MS = 60000; // 1 minute default test duration
const TIMEOUT_THRESHOLD_MS = 5000; // 5 seconds timeout = DOWN

// Endpoints to monitor
const MONITORED_ENDPOINTS = [
    { name: 'API Gateway Health', path: '/health', method: 'GET' },
    { name: 'Get All Flights', path: '/api/Flights/GetAllFlights', method: 'GET' },
    { name: 'Get All Offers', path: '/api/Offers/GetAllOffers', method: 'GET' }
];

// Per-service health endpoints (for deeper analysis)
const SERVICE_HEALTH_ENDPOINTS = [
    { name: 'User Service', url: 'http://localhost:3004/health' },
    { name: 'Flight Service', url: 'http://localhost:3002/health' },
    { name: 'Booking Service', url: 'http://localhost:3003/health' },
    { name: 'Offer Service', url: 'http://localhost:3005/health' }
];

/**
 * Check health of a single endpoint
 */
async function checkHealth(endpoint) {
    const url = endpoint.url || `${API_BASE}${endpoint.path}`;
    const startTime = Date.now();

    try {
        const result = await makeRequest(url, {
            method: endpoint.method || 'GET',
            timeout: TIMEOUT_THRESHOLD_MS
        });

        return {
            name: endpoint.name,
            timestamp: startTime,
            status: result.success ? 'UP' : 'DOWN',
            responseTime: result.responseTime,
            statusCode: result.statusCode,
            error: result.error
        };
    } catch (error) {
        return {
            name: endpoint.name,
            timestamp: startTime,
            status: 'DOWN',
            responseTime: Date.now() - startTime,
            statusCode: 0,
            error: error.message
        };
    }
}

/**
 * Run availability monitoring for specified duration
 */
async function monitorAvailability(endpoints, durationMs = TEST_DURATION_MS, intervalMs = PROBE_INTERVAL_MS) {
    const results = {};
    endpoints.forEach(ep => {
        results[ep.name] = [];
    });

    const startTime = Date.now();
    let probeCount = 0;

    while (Date.now() - startTime < durationMs) {
        probeCount++;

        // Check all endpoints in parallel
        const probePromises = endpoints.map(ep => checkHealth(ep));
        const probeResults = await Promise.all(probePromises);

        // Store results
        probeResults.forEach(result => {
            results[result.name].push(result);
        });

        // Log progress every 10 probes
        if (probeCount % 10 === 0) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            log(`  Probe #${probeCount} (${elapsed}s elapsed)`);
        }

        // Wait for next probe interval
        await sleep(intervalMs);
    }

    return results;
}

/**
 * Calculate availability statistics
 */
function calculateAvailability(probeResults) {
    const total = probeResults.length;
    const upCount = probeResults.filter(r => r.status === 'UP').length;
    const downCount = total - upCount;
    const uptime = (upCount / total) * 100;

    const responseTimes = probeResults.filter(r => r.status === 'UP').map(r => r.responseTime);
    const avgResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    return {
        totalProbes: total,
        upCount,
        downCount,
        uptime: Math.round(uptime * 100) / 100,
        avgResponseTime: Math.round(avgResponseTime * 100) / 100
    };
}

/**
 * Run full availability test
 */
async function runAvailabilityTest(durationMs = TEST_DURATION_MS) {
    console.log('\n' + '='.repeat(80));
    console.log('AVAILABILITY TEST - UPTIME RATE MEASUREMENT');
    console.log('QAirLine Microservices Architecture');
    console.log('='.repeat(80));
    console.log(`\nAPI Gateway: ${API_BASE}`);
    console.log(`Test Duration: ${durationMs / 1000} seconds`);
    console.log(`Probe Interval: ${PROBE_INTERVAL_MS}ms`);
    console.log(`Timeout Threshold: ${TIMEOUT_THRESHOLD_MS}ms`);
    console.log(`Started at: ${new Date().toISOString()}\n`);

    // ========================================
    // Baseline Test (API Gateway endpoints)
    // ========================================
    console.log('-'.repeat(60));
    console.log('PHASE 1: Baseline Availability (via API Gateway)');
    console.log('-'.repeat(60));

    log('Starting baseline availability monitoring...');
    const gatewayResults = await monitorAvailability(MONITORED_ENDPOINTS, durationMs);

    // ========================================
    // Per-Service Health Check
    // ========================================
    console.log('\n' + '-'.repeat(60));
    console.log('PHASE 2: Per-Service Health Check');
    console.log('-'.repeat(60));

    log('Checking individual service health...');
    const serviceResults = await monitorAvailability(SERVICE_HEALTH_ENDPOINTS, Math.min(durationMs, 30000));

    // ========================================
    // Generate Report
    // ========================================
    console.log('\n' + '='.repeat(80));
    console.log('AVAILABILITY TEST RESULTS');
    console.log('='.repeat(80));

    // Gateway Endpoint Results
    console.log('\n### API Gateway Endpoints\n');
    const gatewayHeaders = ['Endpoint', 'Total Probes', 'UP', 'DOWN', 'Uptime %', 'Avg Response (ms)'];
    const gatewayRows = [];

    for (const [name, probes] of Object.entries(gatewayResults)) {
        const stats = calculateAvailability(probes);
        gatewayRows.push([
            name,
            stats.totalProbes,
            stats.upCount,
            stats.downCount,
            `${stats.uptime}%`,
            stats.avgResponseTime
        ]);
    }
    console.log(formatTable(gatewayHeaders, gatewayRows));

    // Per-Service Results
    console.log('\n### Individual Service Health\n');
    const serviceHeaders = ['Service', 'Total Probes', 'UP', 'DOWN', 'Uptime %', 'Avg Response (ms)'];
    const serviceRows = [];

    for (const [name, probes] of Object.entries(serviceResults)) {
        const stats = calculateAvailability(probes);
        serviceRows.push([
            name,
            stats.totalProbes,
            stats.upCount,
            stats.downCount,
            `${stats.uptime}%`,
            stats.avgResponseTime
        ]);
    }
    console.log(formatTable(serviceHeaders, serviceRows));

    // Overall Assessment
    console.log('\n### Assessment\n');

    const allGatewayStats = Object.values(gatewayResults).map(probes => calculateAvailability(probes));
    const avgUptime = allGatewayStats.reduce((sum, s) => sum + s.uptime, 0) / allGatewayStats.length;

    let assessment = '✅ GOOD';
    if (avgUptime < 95) assessment = '🔴 POOR';
    else if (avgUptime < 99) assessment = '⚠️ NEEDS IMPROVEMENT';

    console.log(`Average Uptime: ${Math.round(avgUptime * 100) / 100}%`);
    console.log(`Target: 99.9% (Three Nines)`);
    console.log(`Overall Assessment: ${assessment}`);

    // Service isolation analysis
    const allServicesUp = Object.values(serviceResults).every(probes =>
        calculateAvailability(probes).uptime > 95
    );

    if (allServicesUp) {
        console.log('\n✅ Service Isolation: All individual services maintained high availability');
    } else {
        console.log('\n⚠️ Service Isolation: Some services experienced downtime');
    }

    console.log('\n' + '='.repeat(80));
    console.log(`Test completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));

    return { gatewayResults, serviceResults, avgUptime, assessment };
}

// Run if executed directly
if (require.main === module) {
    const duration = parseInt(process.argv[2]) || TEST_DURATION_MS;

    runAvailabilityTest(duration)
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Availability test failed:', err);
            process.exit(1);
        });
}

module.exports = { runAvailabilityTest };
