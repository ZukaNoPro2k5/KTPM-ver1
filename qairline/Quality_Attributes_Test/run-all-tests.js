/**
 * Run All Quality Tests - Master Script
 * 
 * Executes all quality attribute tests and generates comprehensive report
 */

const { runPerformanceTests } = require('./performance-test');
const { runCapacityTest } = require('./capacity-test');
const { runAvailabilityTest } = require('./availability-test');
const { runModifiabilityAnalysis } = require('./modifiability-analysis');
const { runDeployabilityAnalysis } = require('./deployability-analysis');
const { runScalabilityTest } = require('./scalability-test');
const { runInteroperabilityAnalysis } = require('./interoperability-analysis');
const { runSecurityAnalysis } = require('./security-analysis');

const fs = require('fs');
const path = require('path');

/**
 * Generate final summary report
 */
function generateSummaryReport(results) {
    const report = [];

    report.push('');
    report.push('╔═══════════════════════════════════════════════════════════════════════════════╗');
    report.push('║                    QAIRLINE QUALITY ATTRIBUTE REPORT                          ║');
    report.push('║                    Microservices + Caching Architecture                       ║');
    report.push('╚═══════════════════════════════════════════════════════════════════════════════╝');
    report.push('');
    report.push(`Report Generated: ${new Date().toISOString()}`);
    report.push('');

    report.push('┌─────────────────────────────────────────────────────────────────────────────────┐');
    report.push('│                              EXECUTIVE SUMMARY                                  │');
    report.push('└─────────────────────────────────────────────────────────────────────────────────┘');
    report.push('');
    report.push('| # | Quality Attribute   | Assessment         | Key Finding                      |');
    report.push('|---|---------------------|--------------------|---------------------------------|');

    const summaryRows = [
        ['1', 'Performance', results.performance?.assessment || 'N/A', 'Response times with caching'],
        ['2', 'Capacity', results.capacity?.assessment || 'N/A', `${results.capacity?.maxThroughput || 'N/A'} req/s peak`],
        ['3', 'Availability', results.availability?.assessment || 'N/A', `${results.availability?.avgUptime?.toFixed(1) || 'N/A'}% uptime`],
        ['4', 'Modifiability', results.modifiability?.assessment || 'N/A', 'Smaller controllers vs monolith'],
        ['5', 'Deployability', results.deployability?.assessment || 'N/A', 'Per-service rollback capability'],
        ['6', 'Scalability', results.scalability?.assessment || 'N/A', `${results.scalability?.scalabilityEfficiency?.toFixed(1) || 'N/A'}% efficiency`],
        ['7', 'Interoperability', results.interoperability?.assessment || 'N/A', `${results.interoperability?.overallScore || 'N/A'}/100 score`],
        ['8', 'Security', results.security?.assessment || 'N/A', `${results.security?.overallScore || 'N/A'}/100 score`]
    ];

    for (const row of summaryRows) {
        report.push(`| ${row[0]} | ${row[1].padEnd(19)} | ${row[2].padEnd(18)} | ${row[3].padEnd(31)} |`);
    }

    report.push('');
    report.push('┌─────────────────────────────────────────────────────────────────────────────────┐');
    report.push('│                    MICROSERVICES VS MONOLITHIC COMPARISON                       │');
    report.push('└─────────────────────────────────────────────────────────────────────────────────┘');
    report.push('');
    report.push('| Attribute       | Monolithic            | Microservices         | Verdict     |');
    report.push('|-----------------|----------------------|----------------------|-------------|');
    report.push('| Deployment      | All-or-nothing       | Per-service          | ✅ Improved |');
    report.push('| Scaling         | Vertical only        | Horizontal           | ✅ Improved |');
    report.push('| Fault Isolation | Full outage          | Partial outage       | ✅ Improved |');
    report.push('| Caching         | None / App-level     | Redis per service    | ✅ Improved |');
    report.push('| Controller Size | ~1100 LOC (God obj)  | <300 LOC each        | ✅ Improved |');
    report.push('| Complexity      | Single codebase      | Multiple services    | ⚠️ Trade-off |');
    report.push('| Network Calls   | In-process           | HTTP inter-service   | ⚠️ Trade-off |');
    report.push('');

    report.push('┌─────────────────────────────────────────────────────────────────────────────────┐');
    report.push('│                              RECOMMENDATIONS                                    │');
    report.push('└─────────────────────────────────────────────────────────────────────────────────┘');
    report.push('');
    report.push('High Priority:');
    report.push('  🔴 Implement rate limiting at API Gateway');
    report.push('  🔴 Add Helmet.js for security headers');
    report.push('  🔴 Ensure JWT secrets are in environment variables');
    report.push('');
    report.push('Medium Priority:');
    report.push('  ⚠️ Add structured logging (Winston/Pino)');
    report.push('  ⚠️ Implement inter-service authentication');
    report.push('  ⚠️ Add OpenAPI/Swagger documentation');
    report.push('');
    report.push('Low Priority:');
    report.push('  📋 Consider Kubernetes for production orchestration');
    report.push('  📋 Implement circuit breaker pattern for inter-service calls');
    report.push('  📋 Add distributed tracing (Jaeger/Zipkin)');
    report.push('');

    return report.join('\n');
}

/**
 * Run all tests
 */
async function runAllTests(options = {}) {
    const {
        skipPerformance = false,
        skipCapacity = false,
        skipAvailability = false,
        skipScalability = false,
        availabilityDuration = 30000, // 30 seconds for availability
        quickMode = true // Faster tests for demonstration
    } = options;

    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║            QAIRLINE QUALITY ATTRIBUTE MEASUREMENT SUITE                       ║');
    console.log('║                    Microservices Architecture                                  ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log(`Quick Mode: ${quickMode ? 'Yes (reduced test duration)' : 'No (full tests)'}`);
    console.log('');

    const results = {};

    // ========================================
    // 1. Performance Test
    // ========================================
    if (!skipPerformance) {
        console.log('\n▶ Running Performance Test (1/8)...');
        try {
            results.performance = await runPerformanceTests();
        } catch (error) {
            console.error('Performance test failed:', error.message);
            results.performance = { assessment: '🔴 FAILED', error: error.message };
        }
    } else {
        console.log('\n⏭ Skipping Performance Test');
    }

    // ========================================
    // 2. Capacity Test
    // ========================================
    if (!skipCapacity) {
        console.log('\n▶ Running Capacity Test (2/8)...');
        try {
            results.capacity = await runCapacityTest(true);
        } catch (error) {
            console.error('Capacity test failed:', error.message);
            results.capacity = { assessment: '🔴 FAILED', error: error.message };
        }
    } else {
        console.log('\n⏭ Skipping Capacity Test');
    }

    // ========================================
    // 3. Availability Test
    // ========================================
    if (!skipAvailability) {
        console.log('\n▶ Running Availability Test (3/8)...');
        try {
            results.availability = await runAvailabilityTest(availabilityDuration);
        } catch (error) {
            console.error('Availability test failed:', error.message);
            results.availability = { assessment: '🔴 FAILED', error: error.message };
        }
    } else {
        console.log('\n⏭ Skipping Availability Test');
    }

    // ========================================
    // 4. Modifiability Analysis
    // ========================================
    console.log('\n▶ Running Modifiability Analysis (4/8)...');
    try {
        results.modifiability = await runModifiabilityAnalysis();
    } catch (error) {
        console.error('Modifiability analysis failed:', error.message);
        results.modifiability = { assessment: '🔴 FAILED', error: error.message };
    }

    // ========================================
    // 5. Deployability Analysis
    // ========================================
    console.log('\n▶ Running Deployability Analysis (5/8)...');
    try {
        results.deployability = await runDeployabilityAnalysis();
    } catch (error) {
        console.error('Deployability analysis failed:', error.message);
        results.deployability = { assessment: '🔴 FAILED', error: error.message };
    }

    // ========================================
    // 6. Scalability Test
    // ========================================
    if (!skipScalability) {
        console.log('\n▶ Running Scalability Test (6/8)...');
        try {
            results.scalability = await runScalabilityTest(true);
        } catch (error) {
            console.error('Scalability test failed:', error.message);
            results.scalability = { assessment: '🔴 FAILED', error: error.message };
        }
    } else {
        console.log('\n⏭ Skipping Scalability Test');
    }

    // ========================================
    // 7. Interoperability Analysis
    // ========================================
    console.log('\n▶ Running Interoperability Analysis (7/8)...');
    try {
        results.interoperability = await runInteroperabilityAnalysis();
    } catch (error) {
        console.error('Interoperability analysis failed:', error.message);
        results.interoperability = { assessment: '🔴 FAILED', error: error.message };
    }

    // ========================================
    // 8. Security Analysis
    // ========================================
    console.log('\n▶ Running Security Analysis (8/8)...');
    try {
        results.security = await runSecurityAnalysis();
    } catch (error) {
        console.error('Security analysis failed:', error.message);
        results.security = { assessment: '🔴 FAILED', error: error.message };
    }

    // ========================================
    // Generate Summary Report
    // ========================================
    const summaryReport = generateSummaryReport(results);
    console.log(summaryReport);

    // Save report to file
    const reportPath = path.join(__dirname, 'quality-report.txt');
    fs.writeFileSync(reportPath, summaryReport, 'utf-8');
    console.log(`\n📄 Report saved to: ${reportPath}`);

    console.log('\n╔═══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                         ALL TESTS COMPLETED                                    ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
    console.log(`\nCompleted at: ${new Date().toISOString()}`);

    return results;
}

// Run if executed directly
if (require.main === module) {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const options = {
        skipPerformance: args.includes('--skip-perf'),
        skipCapacity: args.includes('--skip-capacity'),
        skipAvailability: args.includes('--skip-availability'),
        skipScalability: args.includes('--skip-scalability'),
        quickMode: !args.includes('--full')
    };

    // If --static-only, skip all load tests
    if (args.includes('--static-only')) {
        options.skipPerformance = true;
        options.skipCapacity = true;
        options.skipAvailability = true;
        options.skipScalability = true;
    }

    runAllTests(options)
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Test suite failed:', err);
            process.exit(1);
        });
}

module.exports = { runAllTests };
