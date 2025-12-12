/**
 * QAirLine API Availability Test Script
 * Measures Availability Quality Attribute:
 * 1. Uptime Rate (%) - Percentage of time service is available
 * 2. Downtime Time - Total duration of unavailability
 * 3. Error Frequency - Rate of errors per time unit
 * 
 * Methodology:
 * - Health check probes at configurable intervals
 * - Track state transitions (up/down)
 * - Log all errors with timestamps
 * - Calculate metrics over monitoring period
 */

const http = require('http');
const fs = require('fs');

const BASE_URL = 'http://localhost:3001';

// ==================== CONFIGURATION ====================
const CONFIG = {
    // Health check interval (ms)
    PROBE_INTERVAL: 1000, // 1 second

    // Endpoints to monitor
    HEALTH_ENDPOINTS: [
        { path: '/api/Flights/GetAllFlights', name: 'Flights API' },
        { path: '/api/Offers/GetAllOffers', name: 'Offers API' }
    ],

    // Success criteria
    TIMEOUT_MS: 5000,
    MAX_ACCEPTABLE_LATENCY: 500, // Consider degraded if > 500ms

    // Monitor duration per scenario (ms)
    BASELINE_DURATION: 60000,    // 1 minute baseline
    STRESS_DURATION: 60000,      // 1 minute under stress
    RECOVERY_DURATION: 30000     // 30 seconds recovery observation
};

// ==================== METRICS STORAGE ====================
let metrics = {
    startTime: null,
    endTime: null,
    totalProbes: 0,
    successfulProbes: 0,
    failedProbes: 0,
    degradedProbes: 0,
    errors: [],
    stateTransitions: [],
    downtimePeriods: [],
    currentState: 'unknown',
    responseTimesMs: []
};

function resetMetrics() {
    metrics = {
        startTime: Date.now(),
        endTime: null,
        totalProbes: 0,
        successfulProbes: 0,
        failedProbes: 0,
        degradedProbes: 0,
        errors: [],
        stateTransitions: [],
        downtimePeriods: [],
        currentState: 'unknown',
        responseTimesMs: []
    };
}

// ==================== HTTP HEALTH CHECK ====================
function healthCheck(endpoint) {
    return new Promise((resolve) => {
        const url = new URL(BASE_URL + endpoint.path);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'GET',
            timeout: CONFIG.TIMEOUT_MS
        };

        const startTime = performance.now();

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const duration = performance.now() - startTime;
                const isSuccess = res.statusCode >= 200 && res.statusCode < 500;
                const isDegraded = duration > CONFIG.MAX_ACCEPTABLE_LATENCY;

                resolve({
                    endpoint: endpoint.name,
                    status: isSuccess ? (isDegraded ? 'degraded' : 'up') : 'error',
                    statusCode: res.statusCode,
                    duration: Math.round(duration * 100) / 100,
                    timestamp: new Date().toISOString()
                });
            });
        });

        req.on('error', (err) => {
            resolve({
                endpoint: endpoint.name,
                status: 'down',
                error: err.message,
                duration: performance.now() - startTime,
                timestamp: new Date().toISOString()
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                endpoint: endpoint.name,
                status: 'timeout',
                error: 'Request timeout',
                duration: CONFIG.TIMEOUT_MS,
                timestamp: new Date().toISOString()
            });
        });

        req.end();
    });
}

// ==================== STATE TRACKING ====================
function recordProbeResult(result) {
    metrics.totalProbes++;
    metrics.responseTimesMs.push(result.duration);

    const previousState = metrics.currentState;

    if (result.status === 'up') {
        metrics.successfulProbes++;
        metrics.currentState = 'up';
    } else if (result.status === 'degraded') {
        metrics.degradedProbes++;
        metrics.currentState = 'degraded';
    } else {
        metrics.failedProbes++;
        metrics.currentState = 'down';
        metrics.errors.push({
            timestamp: result.timestamp,
            endpoint: result.endpoint,
            status: result.status,
            error: result.error || `HTTP ${result.statusCode}`
        });
    }

    // Track state transitions
    if (previousState !== 'unknown' && previousState !== metrics.currentState) {
        const transition = {
            timestamp: result.timestamp,
            from: previousState,
            to: metrics.currentState,
            endpoint: result.endpoint
        };
        metrics.stateTransitions.push(transition);

        // Track downtime periods
        if (metrics.currentState === 'down') {
            metrics.downtimePeriods.push({
                startTime: result.timestamp,
                endTime: null
            });
        } else if (previousState === 'down' && metrics.currentState !== 'down') {
            const lastDowntime = metrics.downtimePeriods[metrics.downtimePeriods.length - 1];
            if (lastDowntime && !lastDowntime.endTime) {
                lastDowntime.endTime = result.timestamp;
            }
        }
    }
}

// ==================== MONITORING LOOP ====================
async function runMonitor(durationMs, scenarioName) {
    console.log(`\n📡 Starting ${scenarioName}...`);
    console.log(`   Duration: ${durationMs / 1000} seconds`);
    console.log(`   Probe interval: ${CONFIG.PROBE_INTERVAL}ms\n`);

    resetMetrics();
    const endTime = Date.now() + durationMs;
    let probeCount = 0;

    while (Date.now() < endTime) {
        // Probe all endpoints
        for (const endpoint of CONFIG.HEALTH_ENDPOINTS) {
            const result = await healthCheck(endpoint);
            recordProbeResult(result);

            // Visual indicator
            const indicator = result.status === 'up' ? '●' :
                result.status === 'degraded' ? '◐' : '○';
            process.stdout.write(indicator);
        }

        probeCount++;
        if (probeCount % 30 === 0) {
            console.log(` [${probeCount} probes]`);
        }

        await sleep(CONFIG.PROBE_INTERVAL);
    }

    metrics.endTime = Date.now();
    console.log(`\n   ✓ ${scenarioName} complete\n`);

    return calculateResults();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== STRESS GENERATOR ====================
async function generateStress(durationMs) {
    console.log('   🔥 Generating load for stress test...');
    const endTime = Date.now() + durationMs;
    const workers = [];

    // Create 50 concurrent request generators
    for (let i = 0; i < 50; i++) {
        workers.push((async () => {
            while (Date.now() < endTime) {
                const url = new URL(BASE_URL + '/api/Flights/GetAllFlights');
                await new Promise(resolve => {
                    const req = http.request({
                        hostname: url.hostname,
                        port: url.port,
                        path: url.pathname,
                        method: 'GET',
                        timeout: 5000
                    }, (res) => {
                        res.on('data', () => { });
                        res.on('end', resolve);
                    });
                    req.on('error', resolve);
                    req.end();
                });
            }
        })());
    }

    return Promise.all(workers);
}

// ==================== RESULTS CALCULATION ====================
function calculateResults() {
    const monitorDurationMs = metrics.endTime - metrics.startTime;
    const monitorDurationSec = monitorDurationMs / 1000;

    // 1. Uptime Rate (%)
    const uptimeRate = metrics.totalProbes > 0
        ? ((metrics.successfulProbes + metrics.degradedProbes) / metrics.totalProbes * 100)
        : 0;

    // 2. Downtime Time (calculated from failed probes and transitions)
    let totalDowntimeMs = 0;
    for (const period of metrics.downtimePeriods) {
        if (period.endTime) {
            totalDowntimeMs += new Date(period.endTime) - new Date(period.startTime);
        } else {
            // Still down
            totalDowntimeMs += new Date() - new Date(period.startTime);
        }
    }
    // Approximate downtime from failed probe ratio if no transitions detected
    if (totalDowntimeMs === 0 && metrics.failedProbes > 0) {
        totalDowntimeMs = (metrics.failedProbes / metrics.totalProbes) * monitorDurationMs;
    }

    // 3. Error Frequency (errors per minute)
    const errorFrequency = (metrics.errors.length / monitorDurationSec) * 60;

    // Additional metrics
    const avgResponseTime = metrics.responseTimesMs.length > 0
        ? metrics.responseTimesMs.reduce((a, b) => a + b, 0) / metrics.responseTimesMs.length
        : 0;

    return {
        monitorDuration: {
            ms: monitorDurationMs,
            formatted: formatDuration(monitorDurationMs)
        },
        uptimeRate: Math.round(uptimeRate * 100) / 100,
        downtimeTime: {
            ms: Math.round(totalDowntimeMs),
            formatted: formatDuration(totalDowntimeMs)
        },
        errorFrequency: {
            perMinute: Math.round(errorFrequency * 100) / 100,
            total: metrics.errors.length
        },
        probes: {
            total: metrics.totalProbes,
            successful: metrics.successfulProbes,
            degraded: metrics.degradedProbes,
            failed: metrics.failedProbes
        },
        avgResponseTime: Math.round(avgResponseTime * 100) / 100,
        stateTransitions: metrics.stateTransitions.length,
        downtimePeriods: metrics.downtimePeriods.length
    };
}

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
}

// ==================== RESULTS DISPLAY ====================
function printResults(scenarioName, results) {
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`📊 ${scenarioName} RESULTS`);
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    console.log('┌────────────────────────┬──────────────────────────────────────────┐');
    console.log('│ Metric                 │ Value                                    │');
    console.log('├────────────────────────┼──────────────────────────────────────────┤');
    console.log(`│ Monitor Duration       │ ${results.monitorDuration.formatted.padEnd(40)} │`);
    console.log(`│ Total Probes           │ ${String(results.probes.total).padEnd(40)} │`);
    console.log('├────────────────────────┼──────────────────────────────────────────┤');
    console.log(`│ 1️⃣  UPTIME RATE        │ ${(results.uptimeRate + '%').padEnd(40)} │`);
    console.log(`│ 2️⃣  DOWNTIME TIME      │ ${results.downtimeTime.formatted.padEnd(40)} │`);
    console.log(`│ 3️⃣  ERROR FREQUENCY    │ ${(results.errorFrequency.perMinute + ' errors/min').padEnd(40)} │`);
    console.log('├────────────────────────┼──────────────────────────────────────────┤');
    console.log(`│ Successful Probes      │ ${String(results.probes.successful).padEnd(40)} │`);
    console.log(`│ Degraded Probes        │ ${String(results.probes.degraded).padEnd(40)} │`);
    console.log(`│ Failed Probes          │ ${String(results.probes.failed).padEnd(40)} │`);
    console.log(`│ Avg Response Time      │ ${(results.avgResponseTime + 'ms').padEnd(40)} │`);
    console.log(`│ State Transitions      │ ${String(results.stateTransitions).padEnd(40)} │`);
    console.log('└────────────────────────┴──────────────────────────────────────────┘');
}

// ==================== MAIN ====================
const allResults = {};

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   QAirLine API Availability Test - Quality Measurement     ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📋 Metrics to measure:');
    console.log('   1. Uptime Rate (%) - % of successful health checks');
    console.log('   2. Downtime Time - Total duration service was unavailable');
    console.log('   3. Error Frequency - Errors per minute\n');

    console.log('📡 Monitoring endpoints:');
    for (const ep of CONFIG.HEALTH_ENDPOINTS) {
        console.log(`   - ${ep.name}: ${ep.path}`);
    }

    // ========== SCENARIO 1: BASELINE AVAILABILITY ==========
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 SCENARIO 1: BASELINE AVAILABILITY (Normal Operation)');
    console.log('═══════════════════════════════════════════════════════════');

    const baselineResults = await runMonitor(CONFIG.BASELINE_DURATION, 'Baseline Monitoring');
    printResults('SCENARIO 1: BASELINE', baselineResults);
    allResults.baseline = baselineResults;

    // ========== SCENARIO 2: STRESS AVAILABILITY ==========
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 SCENARIO 2: STRESS AVAILABILITY (Under Heavy Load)');
    console.log('═══════════════════════════════════════════════════════════');

    // Start stress generator in parallel with monitoring
    const stressPromise = generateStress(CONFIG.STRESS_DURATION);
    const stressResults = await runMonitor(CONFIG.STRESS_DURATION, 'Stress Monitoring');
    await stressPromise;

    printResults('SCENARIO 2: STRESS', stressResults);
    allResults.stress = stressResults;

    // ========== SCENARIO 3: RECOVERY OBSERVATION ==========
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 SCENARIO 3: RECOVERY OBSERVATION (Post-Stress)');
    console.log('═══════════════════════════════════════════════════════════');

    const recoveryResults = await runMonitor(CONFIG.RECOVERY_DURATION, 'Recovery Monitoring');
    printResults('SCENARIO 3: RECOVERY', recoveryResults);
    allResults.recovery = recoveryResults;

    // ========== SUMMARY ==========
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('📈 AVAILABILITY SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    console.log('┌─────────────────┬──────────────┬──────────────┬────────────────┐');
    console.log('│ Scenario        │ Uptime Rate  │ Downtime     │ Error Freq     │');
    console.log('├─────────────────┼──────────────┼──────────────┼────────────────┤');
    console.log(`│ Baseline        │ ${(allResults.baseline.uptimeRate + '%').padEnd(12)} │ ${allResults.baseline.downtimeTime.formatted.padEnd(12)} │ ${(allResults.baseline.errorFrequency.perMinute + '/min').padEnd(14)} │`);
    console.log(`│ Stress          │ ${(allResults.stress.uptimeRate + '%').padEnd(12)} │ ${allResults.stress.downtimeTime.formatted.padEnd(12)} │ ${(allResults.stress.errorFrequency.perMinute + '/min').padEnd(14)} │`);
    console.log(`│ Recovery        │ ${(allResults.recovery.uptimeRate + '%').padEnd(12)} │ ${allResults.recovery.downtimeTime.formatted.padEnd(12)} │ ${(allResults.recovery.errorFrequency.perMinute + '/min').padEnd(14)} │`);
    console.log('└─────────────────┴──────────────┴──────────────┴────────────────┘');

    // Export results
    fs.writeFileSync('availability-results.json', JSON.stringify({
        testTime: new Date().toISOString(),
        config: CONFIG,
        scenarios: allResults
    }, null, 2));
    console.log('\n📁 Results saved to: availability-results.json');

    console.log('\n✅ Availability test complete!\n');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
