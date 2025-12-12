/**
 * QAirLine Security Analysis Script
 * Measures Security Quality Attribute with 5 Elements:
 * 1. CONFIDENTIALITY - Data protection, encryption
 * 2. INTEGRITY - Data validation, tampering prevention
 * 3. AVAILABILITY - DoS protection, error handling
 * 4. AUTHENTICATION - Login security, identity verification
 * 5. NON-REPUDIATION - Audit logging, action tracking
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = 'd:/Software Achitecture/BTL/QAirLine_chua_cai_tien';

// ==================== SECURITY CRITERIA ====================
const SECURITY_ELEMENTS = {
    CONFIDENTIALITY: { weight: 20, checks: [] },
    INTEGRITY: { weight: 20, checks: [] },
    AVAILABILITY: { weight: 20, checks: [] },
    AUTHENTICATION: { weight: 20, checks: [] },
    NON_REPUDIATION: { weight: 20, checks: [] }
};

// ==================== UTILITIES ====================
function readFile(filePath) {
    try { return fs.readFileSync(filePath, 'utf-8'); } catch { return ''; }
}

function getAllFiles(dir, ext = ['.ts', '.tsx', '.js']) {
    const files = [];
    try {
        fs.readdirSync(dir).forEach(item => {
            const full = path.join(dir, item);
            if (fs.statSync(full).isDirectory() && !['node_modules', '.next'].includes(item)) {
                files.push(...getAllFiles(full, ext));
            } else if (ext.some(e => item.endsWith(e))) {
                files.push(full);
            }
        });
    } catch { }
    return files;
}

// ==================== 1. CONFIDENTIALITY ====================
function analyzeConfidentiality(files) {
    const result = { score: 0, findings: [], vulnerabilities: [] };
    let points = 0;

    let hasPasswordHashing = false;
    let hasEnvSecrets = false;
    let hasDataEncryption = false;
    let hasSecureTransmission = false;
    let hardcodedSecrets = [];

    for (const file of files) {
        const content = readFile(file);
        const name = path.basename(file);

        // Password hashing
        if (/bcrypt|argon2|scrypt|hashPassword|hash\(/gi.test(content)) {
            hasPasswordHashing = true;
        }

        // Environment secrets
        if (/process\.env\./g.test(content)) {
            hasEnvSecrets = true;
        }

        // Data encryption
        if (/crypto|encrypt|decrypt|aes|rsa/gi.test(content)) {
            hasDataEncryption = true;
        }

        // HTTPS
        if (/https|ssl|tls/gi.test(content)) {
            hasSecureTransmission = true;
        }

        // Hardcoded secrets (vulnerability)
        const secretPatterns = [
            /['"]password['"]\s*[:=]\s*['"][^'"]+['"]/gi,
            /['"]secret['"]\s*[:=]\s*['"][^'"]+['"]/gi,
            /['"]apikey['"]\s*[:=]\s*['"][^'"]+['"]/gi
        ];

        for (const pattern of secretPatterns) {
            if (pattern.test(content) && !content.includes('process.env')) {
                hardcodedSecrets.push({ file: name, issue: 'Potential hardcoded secret' });
            }
        }
    }

    // Check .env file
    const envPath = path.join(ROOT_DIR, 'backend', '.env');
    if (fs.existsSync(envPath)) {
        hasEnvSecrets = true;
    }

    // Scoring
    if (hasPasswordHashing) { points += 5; result.findings.push('✅ Password hashing (bcrypt) implemented'); }
    else { result.findings.push('❌ No password hashing found'); result.vulnerabilities.push('Passwords may not be hashed'); }

    if (hasEnvSecrets) { points += 5; result.findings.push('✅ Environment variables for secrets'); }
    else { result.findings.push('❌ Secrets not in environment'); }

    if (hasDataEncryption) { points += 5; result.findings.push('✅ Data encryption available'); }
    else { result.findings.push('⚠️ No explicit data encryption'); points += 2; }

    if (hasSecureTransmission) { points += 5; result.findings.push('✅ HTTPS/TLS capable'); }
    else { result.findings.push('⚠️ HTTPS not explicitly configured'); points += 2; }

    if (hardcodedSecrets.length === 0) { result.findings.push('✅ No hardcoded secrets detected'); }
    else {
        result.findings.push(`⚠️ ${hardcodedSecrets.length} potential hardcoded secrets`);
        result.vulnerabilities.push(...hardcodedSecrets);
        points -= 2;
    }

    result.score = Math.max(0, Math.min(20, points));
    return result;
}

// ==================== 2. INTEGRITY ====================
function analyzeIntegrity(files) {
    const result = { score: 0, findings: [], vulnerabilities: [] };
    let points = 0;

    let hasInputValidation = false;
    let hasSQLParameterization = false;
    let hasXSSProtection = false;
    let hasCSRFProtection = false;

    for (const file of files) {
        const content = readFile(file);

        // Input validation
        if (/validate|sanitize|joi|yup|zod|express-validator|isEmail|isLength/gi.test(content)) {
            hasInputValidation = true;
        }

        // SQL parameterization (protection against SQL injection)
        if (/\?\s*,|\$\d+|prepared|parameterized|query\s*\([^)]*\?/gi.test(content)) {
            hasSQLParameterization = true;
        }

        // Raw SQL detection (vulnerability)
        if (/`[^`]*\${.*}[^`]*`.*query/gi.test(content)) {
            result.vulnerabilities.push({ file: path.basename(file), issue: 'Potential SQL injection' });
        }

        // XSS protection
        if (/escape|sanitize|dangerouslySetInnerHTML|xss/gi.test(content)) {
            hasXSSProtection = true;
        }

        // CSRF
        if (/csrf|csurf|x-csrf-token/gi.test(content)) {
            hasCSRFProtection = true;
        }
    }

    // Scoring
    if (hasInputValidation) { points += 5; result.findings.push('✅ Input validation present'); }
    else { result.findings.push('⚠️ Limited input validation'); points += 2; }

    if (hasSQLParameterization) { points += 5; result.findings.push('✅ SQL parameterization used'); }
    else { result.findings.push('⚠️ SQL parameterization unclear'); points += 2; }

    if (hasXSSProtection) { points += 5; result.findings.push('✅ XSS protection measures'); }
    else { result.findings.push('⚠️ No explicit XSS protection'); points += 2; }

    if (hasCSRFProtection) { points += 5; result.findings.push('✅ CSRF protection enabled'); }
    else { result.findings.push('⚠️ No CSRF tokens'); points += 1; }

    result.score = Math.max(0, Math.min(20, points));
    return result;
}

// ==================== 3. AVAILABILITY ====================
function analyzeAvailability(files) {
    const result = { score: 0, findings: [], vulnerabilities: [] };
    let points = 0;

    let hasErrorHandling = false;
    let hasRateLimiting = false;
    let hasTimeout = false;
    let hasHealthCheck = false;

    for (const file of files) {
        const content = readFile(file);

        // Error handling
        if (/try\s*{|catch\s*\(|\.catch\(|error\s*=>/gi.test(content)) {
            hasErrorHandling = true;
        }

        // Rate limiting
        if (/rate[_-]?limit|express-rate-limit|throttle/gi.test(content)) {
            hasRateLimiting = true;
        }

        // Timeout
        if (/timeout|setTimeout|setInterval/gi.test(content)) {
            hasTimeout = true;
        }

        // Health check
        if (/health|\/health|healthcheck|readiness|liveness/gi.test(content)) {
            hasHealthCheck = true;
        }
    }

    // Scoring
    if (hasErrorHandling) { points += 5; result.findings.push('✅ Error handling implemented'); }
    else { result.findings.push('❌ Poor error handling'); }

    if (hasRateLimiting) { points += 5; result.findings.push('✅ Rate limiting enabled'); }
    else { result.findings.push('❌ No rate limiting (DoS vulnerable)'); result.vulnerabilities.push('No rate limiting'); }

    if (hasTimeout) { points += 5; result.findings.push('✅ Timeout handling'); }
    else { result.findings.push('⚠️ No timeout configuration'); points += 2; }

    if (hasHealthCheck) { points += 5; result.findings.push('✅ Health check endpoint'); }
    else { result.findings.push('⚠️ No health check endpoint'); points += 1; }

    result.score = Math.max(0, Math.min(20, points));
    return result;
}

// ==================== 4. AUTHENTICATION ====================
function analyzeAuthentication(files) {
    const result = { score: 0, findings: [], vulnerabilities: [] };
    let points = 0;

    let hasJWT = false;
    let hasSecureJWTSecret = false;
    let hasPasswordPolicy = false;
    let hasRoleBasedAccess = false;
    let hasSessionManagement = false;

    for (const file of files) {
        const content = readFile(file);
        const name = path.basename(file);

        // JWT
        if (/jsonwebtoken|jwt\.sign|jwt\.verify/gi.test(content)) {
            hasJWT = true;

            // Check for secure secret
            if (/process\.env.*secret|process\.env.*jwt/gi.test(content)) {
                hasSecureJWTSecret = true;
            }

            // Check for hardcoded secret (vulnerability)
            if (/jwt\.sign\([^)]*['"][^'"]{5,}['"]/gi.test(content)) {
                result.vulnerabilities.push({ file: name, issue: 'Possible hardcoded JWT secret' });
            }
        }

        // Password policy
        if (/password.*length|minLength|strongPassword|isStrongPassword/gi.test(content)) {
            hasPasswordPolicy = true;
        }

        // Role-based access
        if (/isAdmin|role|permission|authorize|rbac/gi.test(content)) {
            hasRoleBasedAccess = true;
        }

        // Session
        if (/session|express-session|cookie-session/gi.test(content)) {
            hasSessionManagement = true;
        }
    }

    // Scoring
    if (hasJWT) { points += 5; result.findings.push('✅ JWT authentication implemented'); }
    else { result.findings.push('❌ No JWT authentication'); }

    if (hasSecureJWTSecret) { points += 4; result.findings.push('✅ JWT secret from environment'); }
    else { result.findings.push('⚠️ JWT secret may not be secure'); points += 1; }

    if (hasPasswordPolicy) { points += 3; result.findings.push('✅ Password policy enforced'); }
    else { result.findings.push('⚠️ No password policy'); points += 1; }

    if (hasRoleBasedAccess) { points += 5; result.findings.push('✅ Role-based access control (Admin/User)'); }
    else { result.findings.push('❌ No RBAC'); }

    if (hasSessionManagement) { points += 3; result.findings.push('✅ Session management'); }
    else { result.findings.push('⚠️ Stateless auth only'); points += 2; }

    result.score = Math.max(0, Math.min(20, points));
    return result;
}

// ==================== 5. NON-REPUDIATION ====================
function analyzeNonRepudiation(files) {
    const result = { score: 0, findings: [], vulnerabilities: [] };
    let points = 0;

    let hasLogging = false;
    let hasAuditTrail = false;
    let hasTimestamps = false;
    let hasUserTracking = false;

    for (const file of files) {
        const content = readFile(file);

        // Logging
        if (/console\.log|winston|pino|morgan|logger/gi.test(content)) {
            hasLogging = true;
        }

        // Audit trail
        if (/audit|log\s*\(|history|changelog|activity/gi.test(content)) {
            hasAuditTrail = true;
        }

        // Timestamps
        if (/createdAt|updatedAt|timestamp|Date\.now|new Date/gi.test(content)) {
            hasTimestamps = true;
        }

        // User tracking
        if (/userId|user_id|createdBy|modifiedBy|userID/gi.test(content)) {
            hasUserTracking = true;
        }
    }

    // Check database for audit fields
    const sqlFile = path.join(ROOT_DIR, 'backend', 'src', 'database', 'create-database.sql');
    if (fs.existsSync(sqlFile)) {
        const sql = readFile(sqlFile);
        if (/created_at|updated_at|timestamp/gi.test(sql)) {
            hasTimestamps = true;
        }
    }

    // Scoring
    if (hasLogging) { points += 5; result.findings.push('✅ Application logging enabled'); }
    else { result.findings.push('❌ No logging'); }

    if (hasAuditTrail) { points += 5; result.findings.push('✅ Audit trail capabilities'); }
    else { result.findings.push('⚠️ No formal audit trail'); points += 2; }

    if (hasTimestamps) { points += 5; result.findings.push('✅ Timestamp tracking on records'); }
    else { result.findings.push('⚠️ No timestamp tracking'); points += 1; }

    if (hasUserTracking) { points += 5; result.findings.push('✅ User action tracking (UserID references)'); }
    else { result.findings.push('⚠️ Limited user tracking'); points += 2; }

    result.score = Math.max(0, Math.min(20, points));
    return result;
}

// ==================== MAIN ====================
function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   QAirLine Security Analysis - 5 Security Elements         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📋 Security Elements to analyze:');
    console.log('   1. Confidentiality - Data protection');
    console.log('   2. Integrity - Data validation');
    console.log('   3. Availability - Service resilience');
    console.log('   4. Authentication - Identity verification');
    console.log('   5. Non-Repudiation - Audit logging\n');

    const files = [
        ...getAllFiles(path.join(ROOT_DIR, 'backend', 'src')),
        ...getAllFiles(path.join(ROOT_DIR, 'frontend', 'app'))
    ];

    console.log(`📂 Analyzing ${files.length} source files...\n`);

    // Run all analyses
    const results = {
        confidentiality: analyzeConfidentiality(files),
        integrity: analyzeIntegrity(files),
        availability: analyzeAvailability(files),
        authentication: analyzeAuthentication(files),
        nonRepudiation: analyzeNonRepudiation(files)
    };

    // Print results
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('📊 SECURITY ASSESSMENT RESULTS');
    console.log('═══════════════════════════════════════════════════════════════════════');

    const elements = [
        { name: '1️⃣ CONFIDENTIALITY', key: 'confidentiality' },
        { name: '2️⃣ INTEGRITY', key: 'integrity' },
        { name: '3️⃣ AVAILABILITY', key: 'availability' },
        { name: '4️⃣ AUTHENTICATION', key: 'authentication' },
        { name: '5️⃣ NON-REPUDIATION', key: 'nonRepudiation' }
    ];

    let totalScore = 0;

    for (const elem of elements) {
        const r = results[elem.key];
        console.log(`\n${elem.name} (${r.score}/20)`);
        console.log('─'.repeat(60));
        for (const f of r.findings) {
            console.log(`   ${f}`);
        }
        if (r.vulnerabilities.length > 0) {
            console.log('   ⚠️ Vulnerabilities:');
            for (const v of r.vulnerabilities.slice(0, 3)) {
                console.log(`      - ${v.issue || v}`);
            }
        }
        totalScore += r.score;
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('📈 SECURITY SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    console.log('┌─────────────────────────┬────────┬───────────────────────────────┐');
    console.log('│ Element                 │ Score  │ Assessment                    │');
    console.log('├─────────────────────────┼────────┼───────────────────────────────┤');

    for (const elem of elements) {
        const r = results[elem.key];
        const name = elem.name.replace(/\d️⃣\s*/, '').padEnd(23);
        const score = `${r.score}/20`.padStart(6);
        const status = r.score >= 15 ? '✅ Good' : r.score >= 10 ? '⚠️ Moderate' : '🔴 Poor';
        console.log(`│ ${name} │ ${score} │ ${status.padEnd(29)} │`);
    }

    console.log('├─────────────────────────┼────────┼───────────────────────────────┤');
    console.log(`│ ${'TOTAL SECURITY SCORE'.padEnd(23)} │ ${(totalScore + '/100').padStart(6)} │ ${(totalScore >= 75 ? '✅ Good' : totalScore >= 50 ? '⚠️ Moderate' : '🔴 Poor').padEnd(29)} │`);
    console.log('└─────────────────────────┴────────┴───────────────────────────────┘');

    console.log(`\n   ⭐ OVERALL SECURITY SCORE: ${totalScore}/100`);

    if (totalScore >= 80) {
        console.log('   ✅ Excellent - Strong security posture');
    } else if (totalScore >= 60) {
        console.log('   ⚠️ Good - Adequate security with some gaps');
    } else if (totalScore >= 40) {
        console.log('   🟡 Moderate - Security improvements needed');
    } else {
        console.log('   🔴 Poor - Significant security vulnerabilities');
    }

    // Save results
    const output = {
        timestamp: new Date().toISOString(),
        summary: { totalScore, maxScore: 100 },
        elements: results
    };

    fs.writeFileSync(
        path.join(ROOT_DIR, 'backend', 'security-results.json'),
        JSON.stringify(output, null, 2)
    );
    console.log('\n📁 Results saved to: security-results.json');
    console.log('\n✅ Security analysis complete!\n');
}

main();
