/**
 * QAirLine Modifiability Analysis Script
 * Static Code Analysis for Quality Attribute: Modifiability
 * 
 * Metrics:
 * 1. COUPLING - Dependencies between modules (afferent/efferent)
 * 2. COHESION - Relatedness of functions within modules
 * 3. SCOPE OF INFLUENCE - Impact analysis for changes
 * 
 * Methodology:
 * - Parse import/export statements
 * - Build dependency graph
 * - Calculate coupling metrics (Ca, Ce, Instability)
 * - Analyze function distribution for cohesion
 * - Compute change impact scores
 */

const fs = require('fs');
const path = require('path');

// ==================== CONFIGURATION ====================
const CONFIG = {
    BACKEND_SRC: 'd:/Software Achitecture/BTL/QAirLine_chua_cai_tien/backend/src',
    FRONTEND_SRC: 'd:/Software Achitecture/BTL/QAirLine_chua_cai_tien/frontend/app',
    FILE_EXTENSIONS: ['.ts', '.tsx', '.js', '.jsx'],
    EXCLUDE_DIRS: ['node_modules', '.next', 'dist', 'build']
};

// ==================== DATA STRUCTURES ====================
const modules = {};  // Map: filepath -> module info
const dependencyGraph = {}; // Map: filepath -> { imports: [], importedBy: [] }

// ==================== FILE SCANNER ====================
function getAllFiles(dir, fileList = []) {
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                if (!CONFIG.EXCLUDE_DIRS.includes(file)) {
                    getAllFiles(filePath, fileList);
                }
            } else if (CONFIG.FILE_EXTENSIONS.some(ext => file.endsWith(ext))) {
                fileList.push(filePath);
            }
        }
    } catch (err) {
        // Directory doesn't exist or not accessible
    }
    return fileList;
}

// ==================== IMPORT PARSER ====================
function parseImports(content, filePath) {
    const imports = [];
    const baseDir = path.dirname(filePath);

    // Match ES6 imports: import X from 'path'
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;

    // Match require statements: require('path')
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match;

    while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('.')) {
            // Resolve relative path
            let resolved = path.resolve(baseDir, importPath);
            // Try adding extensions
            for (const ext of CONFIG.FILE_EXTENSIONS) {
                if (fs.existsSync(resolved + ext)) {
                    resolved = resolved + ext;
                    break;
                }
                if (fs.existsSync(resolved + '/index' + ext)) {
                    resolved = resolved + '/index' + ext;
                    break;
                }
            }
            imports.push(resolved.replace(/\\/g, '/'));
        } else {
            // External module (npm package)
            imports.push(`external:${importPath}`);
        }
    }

    while ((match = requireRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('.')) {
            let resolved = path.resolve(baseDir, importPath);
            for (const ext of CONFIG.FILE_EXTENSIONS) {
                if (fs.existsSync(resolved + ext)) {
                    resolved = resolved + ext;
                    break;
                }
            }
            imports.push(resolved.replace(/\\/g, '/'));
        } else {
            imports.push(`external:${importPath}`);
        }
    }

    return imports;
}

// ==================== FUNCTION COUNTER ====================
function countFunctions(content) {
    const patterns = [
        /function\s+\w+\s*\(/g,                    // function declarations
        /const\s+\w+\s*=\s*(?:async\s*)?\(/g,      // arrow functions
        /const\s+\w+\s*=\s*(?:async\s*)?function/g, // function expressions
        /\w+\s*:\s*(?:async\s*)?\([^)]*\)\s*=>/g,  // object method arrows
        /(?:async\s+)?\w+\s*\([^)]*\)\s*\{/g       // method definitions
    ];

    let count = 0;
    for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) count += matches.length;
    }

    return count;
}

// ==================== EXPORT COUNTER ====================
function countExports(content) {
    const patterns = [
        /export\s+(?:default\s+)?(?:const|function|class|let|var)/g,
        /export\s+\{[^}]+\}/g,
        /module\.exports/g,
        /exports\.\w+/g
    ];

    let count = 0;
    for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) count += matches.length;
    }

    return count;
}

// ==================== FILE ANALYZER ====================
function analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const normalizedPath = filePath.replace(/\\/g, '/');

    const imports = parseImports(content, filePath);
    const internalImports = imports.filter(i => !i.startsWith('external:'));
    const externalImports = imports.filter(i => i.startsWith('external:')).map(i => i.replace('external:', ''));

    modules[normalizedPath] = {
        path: normalizedPath,
        name: path.basename(filePath),
        lines: content.split('\n').length,
        functions: countFunctions(content),
        exports: countExports(content),
        internalImports: internalImports,
        externalImports: externalImports,
        importedBy: []
    };

    // Build dependency graph
    dependencyGraph[normalizedPath] = {
        imports: internalImports,
        importedBy: []
    };

    return modules[normalizedPath];
}

// ==================== COUPLING CALCULATOR ====================
function calculateCoupling() {
    const results = [];

    // Build importedBy relationships
    for (const [modulePath, graph] of Object.entries(dependencyGraph)) {
        for (const importPath of graph.imports) {
            if (dependencyGraph[importPath]) {
                dependencyGraph[importPath].importedBy.push(modulePath);
            }
        }
    }

    // Calculate metrics for each module
    for (const [modulePath, moduleInfo] of Object.entries(modules)) {
        const graph = dependencyGraph[modulePath];

        // Ce (Efferent Coupling) - outgoing dependencies
        const ce = graph.imports.length;

        // Ca (Afferent Coupling) - incoming dependencies
        const ca = graph.importedBy.length;

        // Instability = Ce / (Ca + Ce)
        // 0 = completely stable, 1 = completely unstable
        const instability = (ca + ce) > 0 ? ce / (ca + ce) : 0;

        // Total coupling = Ca + Ce
        const totalCoupling = ca + ce;

        results.push({
            module: moduleInfo.name,
            path: modulePath,
            efferentCoupling: ce,     // Dependencies TO other modules
            afferentCoupling: ca,      // Dependencies FROM other modules
            totalCoupling: totalCoupling,
            instability: Math.round(instability * 100) / 100,
            externalDeps: moduleInfo.externalImports.length
        });
    }

    return results.sort((a, b) => b.totalCoupling - a.totalCoupling);
}

// ==================== COHESION CALCULATOR ====================
function calculateCohesion() {
    const results = [];

    for (const [modulePath, moduleInfo] of Object.entries(modules)) {
        // Simple cohesion metric: functions per export ratio
        // High ratio = many internal functions supporting exports (good cohesion)
        // Low ratio = few functions per export (may indicate low cohesion)

        const functionsPerExport = moduleInfo.exports > 0
            ? moduleInfo.functions / moduleInfo.exports
            : moduleInfo.functions;

        // Lines per function - high values may indicate low cohesion
        const linesPerFunction = moduleInfo.functions > 0
            ? moduleInfo.lines / moduleInfo.functions
            : moduleInfo.lines;

        // Cohesion score (simplified LCOM-like metric)
        // Based on: fewer exports with more supporting functions = better cohesion
        // Normalized 0-1 scale (1 = highly cohesive)
        let cohesionScore;
        if (moduleInfo.exports === 0) {
            cohesionScore = moduleInfo.functions > 0 ? 0.5 : 0;
        } else if (moduleInfo.exports === 1) {
            cohesionScore = 1.0; // Single responsibility
        } else {
            cohesionScore = Math.max(0, Math.min(1, 1 - (moduleInfo.exports - 1) / 10));
        }

        // Cohesion type classification
        let cohesionType;
        if (cohesionScore >= 0.8) {
            cohesionType = 'Functional'; // Best
        } else if (cohesionScore >= 0.6) {
            cohesionType = 'Sequential';
        } else if (cohesionScore >= 0.4) {
            cohesionType = 'Communicational';
        } else if (cohesionScore >= 0.2) {
            cohesionType = 'Procedural';
        } else {
            cohesionType = 'Coincidental'; // Worst
        }

        results.push({
            module: moduleInfo.name,
            path: modulePath,
            lines: moduleInfo.lines,
            functions: moduleInfo.functions,
            exports: moduleInfo.exports,
            linesPerFunction: Math.round(linesPerFunction * 10) / 10,
            cohesionScore: Math.round(cohesionScore * 100) / 100,
            cohesionType: cohesionType
        });
    }

    return results.sort((a, b) => a.cohesionScore - b.cohesionScore);
}

// ==================== SCOPE OF INFLUENCE CALCULATOR ====================
function calculateScopeOfInfluence() {
    const results = [];

    // For each module, calculate how many modules would be affected by changes
    for (const [modulePath, moduleInfo] of Object.entries(modules)) {
        const graph = dependencyGraph[modulePath];

        // Direct influence: modules that directly depend on this module
        const directInfluence = new Set(graph.importedBy);

        // Transitive influence: all modules affected (BFS)
        const transitiveInfluence = new Set();
        const queue = [...directInfluence];

        while (queue.length > 0) {
            const current = queue.shift();
            if (!transitiveInfluence.has(current)) {
                transitiveInfluence.add(current);
                if (dependencyGraph[current]) {
                    for (const dep of dependencyGraph[current].importedBy) {
                        if (!transitiveInfluence.has(dep)) {
                            queue.push(dep);
                        }
                    }
                }
            }
        }

        // Impact score: weighted combination
        // Direct influence is weighted more heavily
        const impactScore = directInfluence.size * 2 + transitiveInfluence.size;

        // Risk level based on impact
        let riskLevel;
        if (impactScore >= 10) {
            riskLevel = 'HIGH';
        } else if (impactScore >= 5) {
            riskLevel = 'MEDIUM';
        } else {
            riskLevel = 'LOW';
        }

        results.push({
            module: moduleInfo.name,
            path: modulePath,
            directInfluence: directInfluence.size,
            transitiveInfluence: transitiveInfluence.size,
            totalInfluence: transitiveInfluence.size,
            impactScore: impactScore,
            riskLevel: riskLevel,
            dependents: Array.from(directInfluence).map(p => path.basename(p))
        });
    }

    return results.sort((a, b) => b.impactScore - a.impactScore);
}

// ==================== RESULTS DISPLAY ====================
function printCouplingResults(coupling) {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('1️⃣  COUPLING ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    console.log('┌─────────────────────────────┬──────┬──────┬───────┬─────────────┬──────────┐');
    console.log('│ Module                      │ Ce   │ Ca   │ Total │ Instability │ External │');
    console.log('├─────────────────────────────┼──────┼──────┼───────┼─────────────┼──────────┤');

    for (const c of coupling.slice(0, 15)) {
        const name = c.module.padEnd(27).substring(0, 27);
        console.log(`│ ${name} │ ${String(c.efferentCoupling).padStart(4)} │ ${String(c.afferentCoupling).padStart(4)} │ ${String(c.totalCoupling).padStart(5)} │ ${String(c.instability).padStart(11)} │ ${String(c.externalDeps).padStart(8)} │`);
    }

    console.log('└─────────────────────────────┴──────┴──────┴───────┴─────────────┴──────────┘');
    console.log('\n   Ce = Efferent Coupling (dependencies TO other modules)');
    console.log('   Ca = Afferent Coupling (dependencies FROM other modules)');
    console.log('   Instability = Ce/(Ca+Ce) [0=stable, 1=unstable]');
}

function printCohesionResults(cohesion) {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('2️⃣  COHESION ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    console.log('┌─────────────────────────────┬───────┬───────┬─────────┬───────┬─────────────────┐');
    console.log('│ Module                      │ Lines │ Funcs │ Exports │ Score │ Type            │');
    console.log('├─────────────────────────────┼───────┼───────┼─────────┼───────┼─────────────────┤');

    for (const c of cohesion.slice(0, 15)) {
        const name = c.module.padEnd(27).substring(0, 27);
        const type = c.cohesionType.padEnd(15);
        console.log(`│ ${name} │ ${String(c.lines).padStart(5)} │ ${String(c.functions).padStart(5)} │ ${String(c.exports).padStart(7)} │ ${String(c.cohesionScore).padStart(5)} │ ${type} │`);
    }

    console.log('└─────────────────────────────┴───────┴───────┴─────────┴───────┴─────────────────┘');
}

function printInfluenceResults(influence) {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('3️⃣  SCOPE OF INFLUENCE ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    console.log('┌─────────────────────────────┬────────┬────────────┬───────┬────────┐');
    console.log('│ Module                      │ Direct │ Transitive │ Score │ Risk   │');
    console.log('├─────────────────────────────┼────────┼────────────┼───────┼────────┤');

    for (const i of influence.slice(0, 15)) {
        const name = i.module.padEnd(27).substring(0, 27);
        const risk = i.riskLevel.padEnd(6);
        console.log(`│ ${name} │ ${String(i.directInfluence).padStart(6)} │ ${String(i.transitiveInfluence).padStart(10)} │ ${String(i.impactScore).padStart(5)} │ ${risk} │`);
    }

    console.log('└─────────────────────────────┴────────┴────────────┴───────┴────────┘');
}

// ==================== MAIN ====================
async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   QAirLine Modifiability Analysis - Static Code Analysis   ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📋 Metrics to measure:');
    console.log('   1. Coupling - Dependencies between modules');
    console.log('   2. Cohesion - Relatedness within modules');
    console.log('   3. Scope of Influence - Change impact analysis\n');

    // Scan backend files
    console.log('📂 Scanning Backend...');
    const backendFiles = getAllFiles(CONFIG.BACKEND_SRC);
    console.log(`   Found ${backendFiles.length} source files`);

    for (const file of backendFiles) {
        analyzeFile(file);
    }

    // Scan frontend files
    console.log('📂 Scanning Frontend...');
    const frontendFiles = getAllFiles(CONFIG.FRONTEND_SRC);
    console.log(`   Found ${frontendFiles.length} source files`);

    for (const file of frontendFiles) {
        analyzeFile(file);
    }

    console.log(`\n📊 Total modules analyzed: ${Object.keys(modules).length}`);

    // Calculate metrics
    console.log('\n⏳ Calculating metrics...');

    const couplingResults = calculateCoupling();
    const cohesionResults = calculateCohesion();
    const influenceResults = calculateScopeOfInfluence();

    // Print results
    printCouplingResults(couplingResults);
    printCohesionResults(cohesionResults);
    printInfluenceResults(influenceResults);

    // Summary statistics
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('📈 MODIFIABILITY SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const avgCoupling = couplingResults.reduce((a, b) => a + b.totalCoupling, 0) / couplingResults.length;
    const avgCohesion = cohesionResults.reduce((a, b) => a + b.cohesionScore, 0) / cohesionResults.length;
    const highRiskModules = influenceResults.filter(i => i.riskLevel === 'HIGH');

    console.log(`   Average Coupling: ${avgCoupling.toFixed(2)} dependencies per module`);
    console.log(`   Average Cohesion Score: ${avgCohesion.toFixed(2)} (0-1 scale)`);
    console.log(`   High-Risk Modules: ${highRiskModules.length} (large scope of influence)`);

    // Export results
    const results = {
        timestamp: new Date().toISOString(),
        summary: {
            totalModules: Object.keys(modules).length,
            avgCoupling: Math.round(avgCoupling * 100) / 100,
            avgCohesion: Math.round(avgCohesion * 100) / 100,
            highRiskCount: highRiskModules.length
        },
        coupling: couplingResults,
        cohesion: cohesionResults,
        scopeOfInfluence: influenceResults
    };

    fs.writeFileSync('modifiability-results.json', JSON.stringify(results, null, 2));
    console.log('\n📁 Results saved to: modifiability-results.json');

    console.log('\n✅ Modifiability analysis complete!\n');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
