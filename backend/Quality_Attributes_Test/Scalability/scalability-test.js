/**
 * QAirLine Scalability Test Script
 * Measures Scalability Quality Attribute:
 * - Ability to handle increased load
 * - System behavior during sudden user spikes (e.g., 10K → 15K users)
 * 
 * Methodology:
 * - Phase 1: Baseline load (establish normal performance)
 * - Phase 2: Sudden spike (ramp up quickly)
 * - Phase 3: Sustained high load
 * - Phase 4: Recovery (ramp down, measure recovery)
 * 
 * Metrics:
 * - Response time degradation during spike
 * - Error rate during load transition
 * - Throughput under variable load
 * - Recovery time to baseline performance
 */

const http = require('http');
const fs = require('fs');

const BASE_URL = 'http://localhost:3001';

// ==================== CONFIGURATION ====================
const CONFIG = {
    // Load levels (concurrent virtual users)
    BASELINE_USERS: 10,       // Normal load
    SPIKE_USERS: 100,         // Simulated 10x increase (represents 10K → 100K scenario scaled down)

    // Phase durations (ms)
    BASELINE_DURATION: 15000,   // 15s baseline
    RAMP_UP_DURATION: 5000,     // 5s quick ramp-up (sudden spike)
    SPIKE_DURATION: 20000,      // 20s sustained spike
    RAMP_DOWN_DURATION: 5000,   // 5s ramp-down
    RECOVERY_DURATION: 15000,   // 15s recovery observation

    // Sampling interval for metrics
    SAMPLE_INTERVAL: 1000,      // Sample every 1s

    // Target endpoint
    TARGET_ENDPOINT: '/api/Flights/GetAllFlights',

    // Thresholds
    ACCEPTABLE_ERROR_RATE: 5,     // 5%
    ACCEPTABLE_RESPONSE_TIME: 500 // 500ms
};

// ==================== METRICS ====================
const metrics = {
    phases: [],
    samples: [],
    currentPhase: null,
    globalStats: {
        totalRequests: 0,
        totalErrors: 0,
        responseTimes: []
    }
};

let activeWorkers = 0;
let stopAllWorkers = false;

// ==================== HTTP REQUEST ====================
function makeRequest() {
    return new Promise((resolve) => {
        const url = new URL(BASE_URL + CONFIG.TARGET_ENDPOINT);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'GET',
            timeout: 10000
        };

        const startTime = performance.now();

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const duration = performance.now() - startTime;
                resolve({ duration, isError: res.statusCode >= 400 || res.statusCode === 0 });
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
async function worker(workerId) {
    while (!stopAllWorkers) {
        const result = await makeRequest();
        metrics.globalStats.totalRequests++;
        metrics.globalStats.responseTimes.push(result.duration);
        if (result.isError) metrics.globalStats.totalErrors++;

        // Record to current sample
        if (metrics.currentSample) {
            metrics.currentSample.requests++;
            metrics.currentSample.responseTimes.push(result.duration);
            if (result.isError) metrics.currentSample.errors++;
        }
    }
}

// ==================== LOAD CONTROLLER ====================
async function setLoad(targetUsers) {
    // Scale workers up or down
    while (activeWorkers < targetUsers && !stopAllWorkers) {
        activeWorkers++;
        worker(activeWorkers); // Fire and forget
    }
    // Note: Can't easily remove workers, so we use stopAllWorkers for cleanup
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== SAMPLING ====================
function startNewSample(phaseName, targetLoad) {
    metrics.currentSample = {
        timestamp: Date.now(),
        phase: phaseName,
        targetLoad: targetLoad,
        actualLoad: activeWorkers,
        requests: 0,
        errors: 0,
        responseTimes: []
    };
}

function finishSample() {
    if (metrics.currentSample && metrics.currentSample.requests > 0) {
        const sample = metrics.currentSample;
        const sorted = [...sample.responseTimes].sort((a, b) => a - b);

        sample.stats = {
            throughput: sample.requests,
            errorRate: Math.round((sample.errors / sample.requests) * 10000) / 100,
            avgResponseTime: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length * 100) / 100,
            p95ResponseTime: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
            maxResponseTime: Math.round(sorted[sorted.length - 1] * 100) / 100
        };

        delete sample.responseTimes; // Save memory
        metrics.samples.push(sample);

        // Visual output
        const indicator = sample.stats.errorRate > CONFIG.ACCEPTABLE_ERROR_RATE ? '🔴' :
            sample.stats.avgResponseTime > CONFIG.ACCEPTABLE_RESPONSE_TIME ? '🟡' : '🟢';
        console.log(`   ${indicator} Load: ${String(sample.actualLoad).padStart(3)} | RPS: ${String(sample.stats.throughput).padStart(4)} | Err: ${String(sample.stats.errorRate + '%').padStart(6)} | Avg: ${String(sample.stats.avgResponseTime + 'ms').padStart(8)} | p95: ${String(sample.stats.p95ResponseTime + 'ms').padStart(8)}`);
    }
    metrics.currentSample = null;
}

// ==================== PHASE RUNNERS ====================
async function runPhase(phaseName, duration, loadFunction) {
    console.log(`\n   📊 Phase: ${phaseName}`);
    console.log(`   Duration: ${duration / 1000}s`);
    console.log('   ─────────────────────────────────────────────────────────────────');

    const phaseStart = Date.now();
    const phaseEnd = phaseStart + duration;
    const samples = [];

    while (Date.now() < phaseEnd && !stopAllWorkers) {
        const elapsed = Date.now() - phaseStart;
        const targetLoad = loadFunction(elapsed, duration);

        await setLoad(targetLoad);
        startNewSample(phaseName, targetLoad);

        await sleep(CONFIG.SAMPLE_INTERVAL);
        finishSample();
    }

    // Phase summary
    const phaseSamples = metrics.samples.filter(s => s.phase === phaseName);
    if (phaseSamples.length > 0) {
        const avgThroughput = phaseSamples.reduce((a, b) => a + b.stats.throughput, 0) / phaseSamples.length;
        const avgErrorRate = phaseSamples.reduce((a, b) => a + b.stats.errorRate, 0) / phaseSamples.length;
        const avgResponseTime = phaseSamples.reduce((a, b) => a + b.stats.avgResponseTime, 0) / phaseSamples.length;

        metrics.phases.push({
            name: phaseName,
            duration: duration,
            avgLoad: phaseSamples.reduce((a, b) => a + b.actualLoad, 0) / phaseSamples.length,
            avgThroughput: Math.round(avgThroughput),
            avgErrorRate: Math.round(avgErrorRate * 100) / 100,
            avgResponseTime: Math.round(avgResponseTime * 100) / 100
        });
    }
}

// ==================== SCALABILITY ANALYSIS ====================
function analyzeScalability() {
    const baseline = metrics.phases.find(p => p.name === 'Baseline');
    const spike = metrics.phases.find(p => p.name === 'Sustained Spike');
    const recovery = metrics.phases.find(p => p.name === 'Recovery');

    if (!baseline || !spike) return null;

    // Calculate scalability metrics
    const loadIncreaseFactor = spike.avgLoad / baseline.avgLoad;
    const throughputIncreaseFactor = spike.avgThroughput / baseline.avgThroughput;
    const responseTimeIncreaseFactor = spike.avgResponseTime / baseline.avgResponseTime;
    const errorRateIncrease = spike.avgErrorRate - baseline.avgErrorRate;

    // Scalability efficiency: How well does throughput scale with load?
    // Perfect scaling = 1.0, linear degradation < 1.0
    const scalabilityEfficiency = throughputIncreaseFactor / loadIncreaseFactor;

    // Response time elasticity: How much does response time grow?
    // Lower is better (ideally 1.0 = no degradation)
    const responseTimeElasticity = responseTimeIncreaseFactor;

    // Recovery assessment
    let recoveryScore = 0;
    if (recovery) {
        const recoveryRatio = recovery.avgResponseTime / baseline.avgResponseTime;
        recoveryScore = recoveryRatio <= 1.5 ? 100 : recoveryRatio <= 2.0 ? 75 : recoveryRatio <= 3.0 ? 50 : 25;
    }

    // Overall scalability score (0-100)
    let score = 0;
    score += Math.min(40, scalabilityEfficiency * 40);  // Max 40 points for throughput scaling
    score += Math.max(0, 30 - (responseTimeElasticity - 1) * 15);  // Max 30 points for response time
    score += Math.max(0, 20 - errorRateIncrease * 2);  // Max 20 points for error rate
    score += recoveryScore * 0.1;  // Max 10 points for recovery

    return {
        loadIncreaseFactor: Math.round(loadIncreaseFactor * 100) / 100,
        throughputIncreaseFactor: Math.round(throughputIncreaseFactor * 100) / 100,
        responseTimeIncreaseFactor: Math.round(responseTimeIncreaseFactor * 100) / 100,
        errorRateIncrease: Math.round(errorRateIncrease * 100) / 100,
        scalabilityEfficiency: Math.round(scalabilityEfficiency * 100) / 100,
        recoveryScore: recoveryScore,
        overallScore: Math.round(Math.min(100, Math.max(0, score)))
    };
}

// ==================== RESULTS ====================
function printResults(analysis) {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('📈 SCALABILITY TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    // Phase summary
    console.log('┌─────────────────────┬──────────┬───────────┬──────────┬──────────────┐');
    console.log('│ Phase               │ Avg Load │ Throughput│ Err Rate │ Avg Resp Time│');
    console.log('├─────────────────────┼──────────┼───────────┼──────────┼──────────────┤');

    for (const phase of metrics.phases) {
        const name = phase.name.padEnd(19);
        const load = String(Math.round(phase.avgLoad)).padStart(8);
        const throughput = (phase.avgThroughput + ' RPS').padStart(9);
        const errors = (phase.avgErrorRate + '%').padStart(8);
        const respTime = (phase.avgResponseTime + 'ms').padStart(12);
        console.log(`│ ${name} │ ${load} │ ${throughput} │ ${errors} │ ${respTime} │`);
    }
    console.log('└─────────────────────┴──────────┴───────────┴──────────┴──────────────┘');

    if (analysis) {
        console.log('\n📊 SCALABILITY ANALYSIS:\n');
        console.log(`   Load Increase Factor:       ${analysis.loadIncreaseFactor}x (baseline → spike)`);
        console.log(`   Throughput Scaling:         ${analysis.throughputIncreaseFactor}x`);
        console.log(`   Response Time Increase:     ${analysis.responseTimeIncreaseFactor}x`);
        console.log(`   Error Rate Change:          +${analysis.errorRateIncrease}%`);
        console.log(`   Scalability Efficiency:     ${(analysis.scalabilityEfficiency * 100).toFixed(1)}%`);
        console.log(`   Recovery Score:             ${analysis.recoveryScore}%`);
        console.log(`\n   ⭐ OVERALL SCALABILITY SCORE: ${analysis.overallScore}/100`);

        if (analysis.overallScore >= 80) {
            console.log('   ✅ Excellent - System scales well with load increase');
        } else if (analysis.overallScore >= 60) {
            console.log('   ⚠️ Moderate - System shows some scaling limitations');
        } else if (analysis.overallScore >= 40) {
            console.log('   🟡 Limited - Significant performance degradation under load');
        } else {
            console.log('   🔴 Poor - System does not scale well');
        }
    }
}

// ==================== MAIN ====================
async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   QAirLine Scalability Test - Load Spike Simulation        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📋 Test Configuration:');
    console.log(`   Baseline Load: ${CONFIG.BASELINE_USERS} concurrent users`);
    console.log(`   Spike Load: ${CONFIG.SPIKE_USERS} concurrent users (${CONFIG.SPIKE_USERS / CONFIG.BASELINE_USERS}x increase)`);
    console.log(`   Target Endpoint: ${CONFIG.TARGET_ENDPOINT}`);
    console.log(`   Total Test Duration: ~${(CONFIG.BASELINE_DURATION + CONFIG.RAMP_UP_DURATION + CONFIG.SPIKE_DURATION + CONFIG.RAMP_DOWN_DURATION + CONFIG.RECOVERY_DURATION) / 1000}s`);

    console.log('\n📋 Phases:');
    console.log('   1. Baseline (15s) - Establish normal performance');
    console.log('   2. Ramp Up (5s) - Quick spike to high load');
    console.log('   3. Sustained Spike (20s) - Maintain high load');
    console.log('   4. Ramp Down (5s) - Return to baseline');
    console.log('   5. Recovery (15s) - Observe recovery behavior');

    // Warmup
    console.log('\n🔥 Warming up...');
    for (let i = 0; i < 20; i++) { await makeRequest(); }
    console.log('   ✓ Warmup complete');

    try {
        // Phase 1: Baseline
        await runPhase('Baseline', CONFIG.BASELINE_DURATION,
            () => CONFIG.BASELINE_USERS);

        // Phase 2: Ramp Up (quick spike)
        await runPhase('Ramp Up', CONFIG.RAMP_UP_DURATION,
            (elapsed, duration) => {
                const progress = elapsed / duration;
                return Math.round(CONFIG.BASELINE_USERS + (CONFIG.SPIKE_USERS - CONFIG.BASELINE_USERS) * progress);
            });

        // Phase 3: Sustained Spike
        await runPhase('Sustained Spike', CONFIG.SPIKE_DURATION,
            () => CONFIG.SPIKE_USERS);

        // Stop all workers for clean ramp-down
        stopAllWorkers = true;
        await sleep(1000);
        stopAllWorkers = false;
        activeWorkers = 0;

        // Phase 4: Ramp Down
        await runPhase('Ramp Down', CONFIG.RAMP_DOWN_DURATION,
            (elapsed, duration) => {
                const progress = elapsed / duration;
                return Math.round(CONFIG.SPIKE_USERS - (CONFIG.SPIKE_USERS - CONFIG.BASELINE_USERS) * progress);
            });

        // Phase 5: Recovery
        await runPhase('Recovery', CONFIG.RECOVERY_DURATION,
            () => CONFIG.BASELINE_USERS);

    } finally {
        stopAllWorkers = true;
    }

    // Analyze and print results
    const analysis = analyzeScalability();
    printResults(analysis);

    // Export results
    const results = {
        timestamp: new Date().toISOString(),
        config: CONFIG,
        phases: metrics.phases,
        analysis: analysis,
        samples: metrics.samples
    };

    fs.writeFileSync('scalability-results.json', JSON.stringify(results, null, 2));
    console.log('\n📁 Results saved to: scalability-results.json');

    console.log('\n✅ Scalability test complete!\n');
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    stopAllWorkers = true;
    process.exit(1);
});
