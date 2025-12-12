/**
 * Modifiability Analysis - Static Code Analysis
 * 
 * Analyzes code structure for coupling, cohesion, and module size metrics
 * Compares microservices architecture to original monolithic version
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Service source directories
const SERVICES = {
    'API Gateway': 'api-gateway/src',
    'User Service': 'services/user-service/src',
    'Flight Service': 'services/flight-service/src',
    'Booking Service': 'services/booking-service/src',
    'Offer Service': 'services/offer-service/src'
};

// Original monolithic metrics (for comparison)
const MONOLITHIC_BASELINE = {
    flightControllerLOC: 1100,
    totalBackendLOC: 2500,
    couplingScore: 'High',
    cohesionScore: 'Low'
};

/**
 * Count lines of code in a file
 */
function countLOC(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const nonEmptyLines = lines.filter(line => line.trim().length > 0);
        const codeLines = nonEmptyLines.filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('/*'));
        return {
            total: lines.length,
            nonEmpty: nonEmptyLines.length,
            code: codeLines.length
        };
    } catch (error) {
        return { total: 0, nonEmpty: 0, code: 0, error: error.message };
    }
}

/**
 * Analyze imports in a TypeScript/JavaScript file
 */
function analyzeImports(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const importRegex = /import\s+.*\s+from\s+['"](.+)['"]/g;
        const requireRegex = /require\s*\(\s*['"](.+)['"]\s*\)/g;

        const imports = [];
        let match;

        while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        while ((match = requireRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }

        // Categorize imports
        const internal = imports.filter(i => i.startsWith('.') || i.startsWith('..'));
        const external = imports.filter(i => !i.startsWith('.') && !i.startsWith('..'));
        const serviceToService = imports.filter(i => i.includes('service') || i.includes('Service'));

        return {
            total: imports.length,
            internal: internal.length,
            external: external.length,
            serviceToService: serviceToService.length,
            details: imports
        };
    } catch (error) {
        return { total: 0, internal: 0, external: 0, serviceToService: 0, details: [], error: error.message };
    }
}

/**
 * Analyze exports in a TypeScript/JavaScript file
 */
function analyzeExports(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const exportRegex = /export\s+(class|function|const|let|var|default|interface|type)\s+(\w+)?/g;
        const moduleExportsRegex = /module\.exports\s*=/g;

        const exports = [];
        let match;

        while ((match = exportRegex.exec(content)) !== null) {
            exports.push({ type: match[1], name: match[2] || 'default' });
        }

        const moduleExportsCount = (content.match(moduleExportsRegex) || []).length;

        return {
            total: exports.length + moduleExportsCount,
            classes: exports.filter(e => e.type === 'class').length,
            functions: exports.filter(e => e.type === 'function').length,
            details: exports
        };
    } catch (error) {
        return { total: 0, classes: 0, functions: 0, details: [], error: error.message };
    }
}

/**
 * Get all TypeScript/JavaScript files in a directory
 */
function getSourceFiles(dirPath) {
    const files = [];

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'tests') {
                files.push(...getSourceFiles(fullPath));
            } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
                files.push(fullPath);
            }
        }
    } catch (error) {
        // Directory doesn't exist
    }

    return files;
}

/**
 * Analyze a single service
 */
function analyzeService(serviceName, servicePath) {
    const fullPath = path.join(PROJECT_ROOT, servicePath);
    const files = getSourceFiles(fullPath);

    const analysis = {
        name: serviceName,
        path: servicePath,
        fileCount: files.length,
        totalLOC: 0,
        codeLOC: 0,
        imports: { total: 0, internal: 0, external: 0, serviceToService: 0 },
        exports: { total: 0, classes: 0, functions: 0 },
        modules: [],
        controllers: []
    };

    for (const file of files) {
        const relativePath = path.relative(fullPath, file);
        const loc = countLOC(file);
        const imports = analyzeImports(file);
        const exports = analyzeExports(file);

        analysis.totalLOC += loc.total;
        analysis.codeLOC += loc.code;
        analysis.imports.total += imports.total;
        analysis.imports.internal += imports.internal;
        analysis.imports.external += imports.external;
        analysis.imports.serviceToService += imports.serviceToService;
        analysis.exports.total += exports.total;
        analysis.exports.classes += exports.classes;
        analysis.exports.functions += exports.functions;

        // Track controllers separately
        if (relativePath.includes('controller') || relativePath.includes('Controller')) {
            analysis.controllers.push({
                name: path.basename(file, path.extname(file)),
                loc: loc.code,
                imports: imports.total
            });
        }

        analysis.modules.push({
            path: relativePath,
            loc: loc.code,
            imports: imports.total,
            exports: exports.total
        });
    }

    // Calculate coupling score (0-100, lower is better)
    // Based on: external imports, service-to-service calls
    const couplingScore = Math.min(100,
        (analysis.imports.serviceToService * 10) +
        (analysis.imports.external * 2)
    );

    // Calculate cohesion score (0-100, higher is better)
    // Based on: internal imports vs external, focused exports
    const cohesionScore = analysis.imports.total > 0
        ? Math.round((analysis.imports.internal / analysis.imports.total) * 100)
        : 100;

    analysis.couplingScore = couplingScore;
    analysis.cohesionScore = cohesionScore;

    return analysis;
}

/**
 * Format results as table
 */
function formatTable(headers, rows) {
    const colWidths = headers.map((h, i) => {
        const maxRowWidth = Math.max(...rows.map(r => String(r[i] || '').length));
        return Math.max(h.length, maxRowWidth) + 2;
    });

    let output = '\n';
    output += '| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |\n';
    output += '|' + colWidths.map(w => '-'.repeat(w + 2)).join('|') + '|\n';
    rows.forEach(row => {
        output += '| ' + row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join(' | ') + ' |\n';
    });

    return output;
}

/**
 * Run full modifiability analysis
 */
async function runModifiabilityAnalysis() {
    console.log('\n' + '='.repeat(80));
    console.log('MODIFIABILITY ANALYSIS - STATIC CODE ANALYSIS');
    console.log('QAirLine Microservices Architecture');
    console.log('='.repeat(80));
    console.log(`\nProject Root: ${PROJECT_ROOT}`);
    console.log(`Started at: ${new Date().toISOString()}\n`);

    const serviceAnalyses = [];

    // Analyze each service
    for (const [serviceName, servicePath] of Object.entries(SERVICES)) {
        console.log(`Analyzing: ${serviceName}...`);
        const analysis = analyzeService(serviceName, servicePath);
        serviceAnalyses.push(analysis);
    }

    // ========================================
    // Generate Report
    // ========================================
    console.log('\n' + '='.repeat(80));
    console.log('MODIFIABILITY ANALYSIS RESULTS');
    console.log('='.repeat(80));

    // Service Overview
    console.log('\n### Service Overview\n');
    const overviewHeaders = ['Service', 'Files', 'Total LOC', 'Code LOC', 'Controllers', 'Coupling', 'Cohesion'];
    const overviewRows = serviceAnalyses.map(s => [
        s.name,
        s.fileCount,
        s.totalLOC,
        s.codeLOC,
        s.controllers.length,
        s.couplingScore,
        `${s.cohesionScore}%`
    ]);
    console.log(formatTable(overviewHeaders, overviewRows));

    // Controller Analysis
    console.log('\n### Controller Size Analysis\n');
    const controllerHeaders = ['Controller', 'Service', 'Lines of Code', 'vs Monolith'];
    const controllerRows = [];

    for (const service of serviceAnalyses) {
        for (const controller of service.controllers) {
            const vsMonolith = Math.round((controller.loc / MONOLITHIC_BASELINE.flightControllerLOC) * 100);
            controllerRows.push([
                controller.name,
                service.name,
                controller.loc,
                `${vsMonolith}%`
            ]);
        }
    }
    console.log(formatTable(controllerHeaders, controllerRows));

    // Import/Export Analysis
    console.log('\n### Coupling Analysis (Imports)\n');
    const couplingHeaders = ['Service', 'Total Imports', 'Internal', 'External', 'Service-to-Service'];
    const couplingRows = serviceAnalyses.map(s => [
        s.name,
        s.imports.total,
        s.imports.internal,
        s.imports.external,
        s.imports.serviceToService
    ]);
    console.log(formatTable(couplingHeaders, couplingRows));

    // Comparison with Monolithic
    console.log('\n### Comparison with Monolithic Version\n');

    const totalMicroservicesLOC = serviceAnalyses.reduce((sum, s) => sum + s.codeLOC, 0);
    const largestController = serviceAnalyses
        .flatMap(s => s.controllers)
        .reduce((max, c) => c.loc > max.loc ? c : max, { loc: 0, name: 'None' });

    const avgCoupling = serviceAnalyses.reduce((sum, s) => sum + s.couplingScore, 0) / serviceAnalyses.length;
    const avgCohesion = serviceAnalyses.reduce((sum, s) => sum + s.cohesionScore, 0) / serviceAnalyses.length;

    console.log(`| Metric                    | Monolithic    | Microservices | Improvement |`);
    console.log(`|---------------------------|---------------|---------------|-------------|`);
    console.log(`| Largest Controller (LOC)  | ${MONOLITHIC_BASELINE.flightControllerLOC}          | ${largestController.loc}           | ${Math.round((1 - largestController.loc / MONOLITHIC_BASELINE.flightControllerLOC) * 100)}% smaller |`);
    console.log(`| Total Backend LOC         | ${MONOLITHIC_BASELINE.totalBackendLOC}          | ${totalMicroservicesLOC}          | ${totalMicroservicesLOC > MONOLITHIC_BASELINE.totalBackendLOC ? 'More code (expected)' : 'Less code'} |`);
    console.log(`| Coupling                  | ${MONOLITHIC_BASELINE.couplingScore}           | ${Math.round(avgCoupling)}/100       | ${avgCoupling < 50 ? 'Improved' : 'Similar'} |`);
    console.log(`| Cohesion                  | ${MONOLITHIC_BASELINE.cohesionScore}            | ${Math.round(avgCohesion)}%          | ${avgCohesion > 50 ? 'Improved' : 'Similar'} |`);

    // Assessment
    console.log('\n### Assessment\n');

    let assessment = '✅ GOOD';
    if (largestController.loc > 500 || avgCohesion < 30) assessment = '🔴 POOR';
    else if (largestController.loc > 300 || avgCohesion < 50) assessment = '⚠️ NEEDS IMPROVEMENT';

    console.log(`Largest Controller: ${largestController.name} (${largestController.loc} LOC)`);
    console.log(`Average Coupling Score: ${Math.round(avgCoupling)}/100 (lower is better)`);
    console.log(`Average Cohesion Score: ${Math.round(avgCohesion)}% (higher is better)`);
    console.log(`Overall Assessment: ${assessment}`);

    // Key Findings
    console.log('\n### Key Findings\n');

    if (largestController.loc < MONOLITHIC_BASELINE.flightControllerLOC) {
        console.log('✅ Controllers are significantly smaller than monolithic version');
    }

    const lowCohesionServices = serviceAnalyses.filter(s => s.cohesionScore < 50);
    if (lowCohesionServices.length === 0) {
        console.log('✅ All services maintain good cohesion');
    } else {
        console.log(`⚠️ Services with low cohesion: ${lowCohesionServices.map(s => s.name).join(', ')}`);
    }

    const highCouplingServices = serviceAnalyses.filter(s => s.couplingScore > 50);
    if (highCouplingServices.length === 0) {
        console.log('✅ All services have low coupling');
    } else {
        console.log(`⚠️ Services with high coupling: ${highCouplingServices.map(s => s.name).join(', ')}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log(`Analysis completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));

    return { serviceAnalyses, assessment, avgCoupling, avgCohesion };
}

// Run if executed directly
if (require.main === module) {
    runModifiabilityAnalysis()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Modifiability analysis failed:', err);
            process.exit(1);
        });
}

module.exports = { runModifiabilityAnalysis };
