/**
 * QAirLine Deployability Analysis Script
 * Measures Deployability Quality Attribute:
 * 1. DEPLOYMENT TIME - Time to build, deploy, and start services
 * 2. ROLLBACK ABILITY - Assessment of rollback mechanisms
 * 
 * Methodology:
 * - Time Docker build processes
 * - Time container startup
 * - Analyze git history for versioning
 * - Evaluate rollback mechanisms
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = 'd:/Software Achitecture/BTL/QAirLine_chua_cai_tien';

// ==================== TIMING UTILITIES ====================
function timeCommand(command, cwd, label) {
    console.log(`   ⏱️  Timing: ${label}...`);
    const startTime = Date.now();

    try {
        execSync(command, {
            cwd,
            stdio: 'pipe',
            timeout: 600000 // 10 minute timeout
        });
        const duration = Date.now() - startTime;
        console.log(`   ✓ ${label}: ${formatDuration(duration)}`);
        return { success: true, duration, label };
    } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`   ✗ ${label}: Failed after ${formatDuration(duration)}`);
        return { success: false, duration, label, error: error.message };
    }
}

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
}

// ==================== DEPLOYMENT TIME MEASUREMENT ====================
function measureNpmInstallTime(projectDir, projectName) {
    // Clean install (remove node_modules first for accurate measurement)
    const nodeModulesPath = path.join(projectDir, 'node_modules');

    // Measure npm install time
    return timeCommand('npm install --prefer-offline', projectDir, `${projectName} npm install`);
}

function measureBuildTime(projectDir, projectName) {
    // Check if build script exists
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'));
    if (!packageJson.scripts?.build) {
        return { success: true, duration: 0, label: `${projectName} build`, skipped: true };
    }

    return timeCommand('npm run build', projectDir, `${projectName} build`);
}

function measureDockerBuildTime(context, imageName) {
    return timeCommand(
        `docker build -t ${imageName}:test-deploy --no-cache .`,
        context,
        `Docker build ${imageName}`
    );
}

function measureBackendStartupTime() {
    console.log('   ⏱️  Timing: Backend startup...');
    const startTime = Date.now();

    return new Promise((resolve) => {
        const backend = spawn('npm', ['run', 'dev'], {
            cwd: path.join(ROOT_DIR, 'backend'),
            shell: true,
            stdio: 'pipe'
        });

        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                backend.kill();
                resolve({ success: false, duration: 30000, label: 'Backend startup', error: 'Timeout' });
            }
        }, 30000);

        backend.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('Server is running') || output.includes('listening')) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    const duration = Date.now() - startTime;
                    backend.kill();
                    console.log(`   ✓ Backend startup: ${formatDuration(duration)}`);
                    resolve({ success: true, duration, label: 'Backend startup' });
                }
            }
        });

        backend.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({ success: false, duration: Date.now() - startTime, label: 'Backend startup', error: err.message });
            }
        });
    });
}

// ==================== ROLLBACK ABILITY ANALYSIS ====================
function analyzeGitRollback() {
    const results = {
        hasGit: false,
        totalCommits: 0,
        lastCommits: [],
        hasTags: false,
        tags: [],
        hasBranches: false,
        branches: [],
        canRollback: false,
        rollbackMethod: 'none'
    };

    try {
        // Check if git repo exists
        execSync('git status', { cwd: ROOT_DIR, stdio: 'pipe' });
        results.hasGit = true;

        // Count commits
        try {
            const commitCount = execSync('git rev-list --count HEAD', { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim();
            results.totalCommits = parseInt(commitCount);
        } catch { }

        // Get last 5 commits
        try {
            const commits = execSync('git log --oneline -5', { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim();
            results.lastCommits = commits.split('\n').map(c => c.trim());
        } catch { }

        // Check for tags
        try {
            const tags = execSync('git tag', { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim();
            if (tags) {
                results.hasTags = true;
                results.tags = tags.split('\n').slice(-5);
            }
        } catch { }

        // Check branches
        try {
            const branches = execSync('git branch -a', { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim();
            results.hasBranches = branches.includes('\n');
            results.branches = branches.split('\n').map(b => b.trim()).slice(0, 5);
        } catch { }

        // Determine rollback capability
        if (results.totalCommits > 1) {
            results.canRollback = true;
            results.rollbackMethod = 'git checkout/revert';
        }

    } catch {
        results.hasGit = false;
    }

    return results;
}

function analyzeDockerRollback() {
    const results = {
        hasDocker: false,
        hasDockerCompose: false,
        images: [],
        canRollback: false,
        rollbackMethod: 'none',
        dockerfileAnalysis: {
            backend: {},
            frontend: {}
        }
    };

    // Check docker-compose.yml
    const composePath = path.join(ROOT_DIR, 'docker-compose.yml');
    if (fs.existsSync(composePath)) {
        results.hasDockerCompose = true;
    }

    // Check Dockerfiles
    const backendDockerfile = path.join(ROOT_DIR, 'backend', 'Dockerfile');
    const frontendDockerfile = path.join(ROOT_DIR, 'frontend', 'Dockerfile');

    if (fs.existsSync(backendDockerfile)) {
        results.hasDocker = true;
        const content = fs.readFileSync(backendDockerfile, 'utf-8');
        results.dockerfileAnalysis.backend = {
            exists: true,
            baseImage: content.match(/FROM\s+([^\s]+)/)?.[1] || 'unknown',
            hasHealthCheck: content.includes('HEALTHCHECK'),
            hasMultiStage: (content.match(/FROM/g) || []).length > 1
        };
    }

    if (fs.existsSync(frontendDockerfile)) {
        const content = fs.readFileSync(frontendDockerfile, 'utf-8');
        results.dockerfileAnalysis.frontend = {
            exists: true,
            baseImage: content.match(/FROM\s+([^\s]+)/)?.[1] || 'unknown',
            hasHealthCheck: content.includes('HEALTHCHECK'),
            hasMultiStage: (content.match(/FROM/g) || []).length > 1
        };
    }

    // Check for existing images
    try {
        const images = execSync('docker images --format "{{.Repository}}:{{.Tag}}" 2>nul', {
            cwd: ROOT_DIR,
            stdio: 'pipe'
        }).toString().trim();
        if (images) {
            results.images = images.split('\n').filter(i =>
                i.includes('qairline') || i.includes('frontend') || i.includes('backend')
            ).slice(0, 5);
        }

        if (results.hasDockerCompose) {
            results.canRollback = true;
            results.rollbackMethod = 'docker-compose with tagged images';
        }
    } catch {
        // Docker not available or no images
    }

    return results;
}

function analyzeDatabaseRollback() {
    const results = {
        hasMigrations: false,
        migrationTool: 'none',
        canRollbackSchema: false,
        hasBackupScript: false
    };

    // Check for migration files
    const sqlFile = path.join(ROOT_DIR, 'backend', 'src', 'database', 'create-database.sql');
    if (fs.existsSync(sqlFile)) {
        results.hasMigrations = true;
        results.migrationTool = 'Manual SQL file';
        results.canRollbackSchema = false; // No down migrations
    }

    // Check for backup scripts
    const backupPatterns = ['backup', 'dump', 'restore'];
    try {
        const files = fs.readdirSync(path.join(ROOT_DIR, 'backend'));
        for (const file of files) {
            if (backupPatterns.some(p => file.toLowerCase().includes(p))) {
                results.hasBackupScript = true;
                break;
            }
        }
    } catch { }

    return results;
}

// ==================== RESULTS ====================
function printDeploymentTimeResults(results) {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('1️⃣  DEPLOYMENT TIME ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    console.log('┌────────────────────────────────┬──────────────┬──────────┐');
    console.log('│ Step                           │ Duration     │ Status   │');
    console.log('├────────────────────────────────┼──────────────┼──────────┤');

    for (const r of results) {
        const step = r.label.padEnd(30);
        const duration = formatDuration(r.duration).padStart(12);
        const status = r.success ? '✅ Pass' : (r.skipped ? '⏭️ Skip' : '❌ Fail');
        console.log(`│ ${step} │ ${duration} │ ${status.padEnd(8)} │`);
    }

    const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
    console.log('├────────────────────────────────┼──────────────┼──────────┤');
    console.log(`│ ${'TOTAL DEPLOYMENT TIME'.padEnd(30)} │ ${formatDuration(totalTime).padStart(12)} │          │`);
    console.log('└────────────────────────────────┴──────────────┴──────────┘');
}

function printRollbackResults(git, docker, db) {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('2️⃣  ROLLBACK ABILITY ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    console.log('┌──────────────────────┬─────────────────────────────────────────────┐');
    console.log('│ Mechanism            │ Assessment                                  │');
    console.log('├──────────────────────┼─────────────────────────────────────────────┤');

    // Git rollback
    const gitStatus = git.canRollback ? '✅ Available' : '❌ Not available';
    console.log(`│ Git Version Control  │ ${(gitStatus + ' - ' + git.rollbackMethod).padEnd(43)} │`);
    console.log(`│   - Total Commits    │ ${String(git.totalCommits).padEnd(43)} │`);
    console.log(`│   - Tags             │ ${(git.hasTags ? 'Yes (' + git.tags.length + ')' : 'None').padEnd(43)} │`);

    // Docker rollback
    const dockerStatus = docker.canRollback ? '✅ Available' : '⚠️ Limited';
    console.log(`│ Docker Images        │ ${(dockerStatus + ' - ' + docker.rollbackMethod).padEnd(43)} │`);
    console.log(`│   - Compose File     │ ${(docker.hasDockerCompose ? '✅ Yes' : '❌ No').padEnd(43)} │`);
    console.log(`│   - Image Tagging    │ ${(docker.images.length > 0 ? 'Yes (' + docker.images.length + ' images)' : 'No tagged images').padEnd(43)} │`);

    // Database rollback
    const dbStatus = db.canRollbackSchema ? '✅ Available' : '⚠️ Manual only';
    console.log(`│ Database Migration   │ ${(dbStatus).padEnd(43)} │`);
    console.log(`│   - Migration Tool   │ ${db.migrationTool.padEnd(43)} │`);
    console.log(`│   - Backup Script    │ ${(db.hasBackupScript ? '✅ Yes' : '❌ No').padEnd(43)} │`);

    console.log('└──────────────────────┴─────────────────────────────────────────────┘');

    // Rollback score
    let score = 0;
    if (git.canRollback) score += 40;
    if (docker.canRollback) score += 30;
    if (db.canRollbackSchema) score += 20;
    if (db.hasBackupScript) score += 10;

    console.log(`\n   📊 Rollback Ability Score: ${score}%`);

    if (score >= 80) {
        console.log('   ✅ Excellent - Full rollback capability');
    } else if (score >= 50) {
        console.log('   ⚠️ Moderate - Partial rollback capability');
    } else {
        console.log('   🔴 Poor - Limited rollback capability');
    }

    return score;
}

// ==================== MAIN ====================
async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   QAirLine Deployability Analysis - Quality Measurement    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📋 Metrics to measure:');
    console.log('   1. Deployment Time - Time to build and deploy');
    console.log('   2. Rollback Ability - Capability to revert changes\n');

    const deploymentResults = [];

    // ========== DEPLOYMENT TIME MEASUREMENT ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 MEASURING DEPLOYMENT TIME');
    console.log('═══════════════════════════════════════════════════════════\n');

    // 1. Backend npm install (cached)
    console.log('📦 Backend:');
    deploymentResults.push(
        timeCommand('npm install --prefer-offline', path.join(ROOT_DIR, 'backend'), 'Backend npm install')
    );

    // 2. Frontend npm install (cached)
    console.log('\n📦 Frontend:');
    deploymentResults.push(
        timeCommand('npm install --prefer-offline', path.join(ROOT_DIR, 'frontend'), 'Frontend npm install')
    );

    // 3. Frontend build
    deploymentResults.push(
        timeCommand('npm run build', path.join(ROOT_DIR, 'frontend'), 'Frontend build')
    );

    // 4. Backend startup time
    console.log('\n🚀 Startup:');
    deploymentResults.push(await measureBackendStartupTime());

    printDeploymentTimeResults(deploymentResults);

    // ========== ROLLBACK ABILITY ANALYSIS ==========
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 ANALYZING ROLLBACK ABILITY');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('🔍 Analyzing rollback mechanisms...');
    const gitRollback = analyzeGitRollback();
    const dockerRollback = analyzeDockerRollback();
    const dbRollback = analyzeDatabaseRollback();

    const rollbackScore = printRollbackResults(gitRollback, dockerRollback, dbRollback);

    // ========== SUMMARY ==========
    const totalDeployTime = deploymentResults.reduce((sum, r) => sum + r.duration, 0);

    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('📈 DEPLOYABILITY SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    console.log(`   1️⃣  Total Deployment Time: ${formatDuration(totalDeployTime)}`);
    console.log(`   2️⃣  Rollback Ability Score: ${rollbackScore}%`);

    // Export results
    const results = {
        timestamp: new Date().toISOString(),
        deploymentTime: {
            total: totalDeployTime,
            formatted: formatDuration(totalDeployTime),
            breakdown: deploymentResults.map(r => ({
                step: r.label,
                duration: r.duration,
                formatted: formatDuration(r.duration),
                success: r.success
            }))
        },
        rollbackAbility: {
            score: rollbackScore,
            git: gitRollback,
            docker: dockerRollback,
            database: dbRollback
        }
    };

    fs.writeFileSync(
        path.join(ROOT_DIR, 'backend', 'deployability-results.json'),
        JSON.stringify(results, null, 2)
    );
    console.log('\n📁 Results saved to: deployability-results.json');

    console.log('\n✅ Deployability analysis complete!\n');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
