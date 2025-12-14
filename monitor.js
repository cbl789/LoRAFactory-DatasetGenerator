/**
 * LoRAFactory - Comprehensive Monitoring & Logging
 * Tracks all API calls, errors, state changes, and performance metrics
 */

class Monitor {
    constructor() {
        this.logs = [];
        this.errors = [];
        this.apiCalls = [];
        this.startTime = Date.now();
        this.enabled = true;
        this.fileLoggingEnabled = true;
        this.logServerUrl = 'http://localhost:3101/log';

        // Store original console methods to prevent recursion
        this.originalConsole = {
            log: console.log.bind(console),
            error: console.error.bind(console),
            warn: console.warn.bind(console)
        };

        // Intercept console methods
        this._interceptConsole();

        // Track unhandled errors
        window.addEventListener('error', (e) => this.logError('UNHANDLED', e.error));
        window.addEventListener('unhandledrejection', (e) => this.logError('PROMISE_REJECTION', e.reason));

        // Test connection to log server
        this._testLogServer();
    }

    async _testLogServer() {
        try {
            await fetch(this.logServerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timestamp: Date.now(),
                    type: 'SYSTEM',
                    message: 'Monitor initialized'
                })
            });
            this.originalConsole.log('📁 File logging enabled → logs/lorafactory_*.log');
        } catch (e) {
            this.fileLoggingEnabled = false;
            this.originalConsole.warn('⚠️ File logging unavailable (log server not running)');
        }
    }

    async _writeToFile(log) {
        if (!this.fileLoggingEnabled) return;

        try {
            await fetch(this.logServerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(log)
            });
        } catch (e) {
            // Silently fail - don't spam console with logging errors
        }
    }

    _interceptConsole() {
        const originalError = console.error;
        const originalWarn = console.warn;

        console.error = (...args) => {
            this.logError('CONSOLE', args.join(' '));
            originalError.apply(console, args);
        };

        console.warn = (...args) => {
            this.logWarning(args.join(' '));
            originalWarn.apply(console, args);
        };
    }

    logApiCall(provider, method, params, result, error = null) {
        const log = {
            timestamp: Date.now(),
            elapsed: Date.now() - this.startTime,
            type: 'API_CALL',
            provider: provider,
            method: method,
            params: this._sanitize(params),
            result: error ? null : this._sanitize(result),
            error: error ? String(error) : null,
            success: !error
        };

        this.apiCalls.push(log);
        this.logs.push(log);
        this._writeToFile(log); // Write to file

        if (this.enabled) {
            const icon = error ? '❌' : '✅';
            const color = error ? 'color: red' : 'color: green';
            this.originalConsole.log(
                `%c${icon} [API] ${provider}.${method}`,
                color,
                error ? `ERROR: ${error}` : 'SUCCESS'
            );
            if (params) this.originalConsole.log('  📤 Request:', params);
            if (result) this.originalConsole.log('  📥 Response:', result);
            if (error) this.originalConsole.error('  ⚠️ Error:', error);
        }

        return log;
    }

    logError(source, error) {
        const log = {
            timestamp: Date.now(),
            elapsed: Date.now() - this.startTime,
            type: 'ERROR',
            source: source,
            message: error?.message || String(error),
            stack: error?.stack
        };

        this.errors.push(log);
        this.logs.push(log);
        this._writeToFile(log); // Write to file

        if (this.enabled) {
            this.originalConsole.error(`🔴 [ERROR] ${source}:`, error);
        }
    }

    logWarning(message) {
        const log = {
            timestamp: Date.now(),
            elapsed: Date.now() - this.startTime,
            type: 'WARNING',
            message: message
        };

        this.logs.push(log);
    }

    logEvent(category, action, details = null) {
        const log = {
            timestamp: Date.now(),
            elapsed: Date.now() - this.startTime,
            type: 'EVENT',
            category: category,
            action: action,
            details: details
        };

        this.logs.push(log);

        if (this.enabled) {
            this.originalConsole.log(`📍 [${category}] ${action}`, details || '');
        }
    }

    _sanitize(obj) {
        if (!obj) return obj;

        // Don't log huge base64 strings
        const str = JSON.stringify(obj);
        if (str.length > 10000) {
            return { _truncated: true, size: str.length, preview: str.substring(0, 200) + '...' };
        }

        return obj;
    }

    getStats() {
        const totalCalls = this.apiCalls.length;
        const successCalls = this.apiCalls.filter(c => c.success).length;
        const failedCalls = this.apiCalls.filter(c => !c.success).length;

        const byProvider = {};
        this.apiCalls.forEach(call => {
            if (!byProvider[call.provider]) {
                byProvider[call.provider] = { total: 0, success: 0, failed: 0 };
            }
            byProvider[call.provider].total++;
            if (call.success) {
                byProvider[call.provider].success++;
            } else {
                byProvider[call.provider].failed++;
            }
        });

        return {
            uptime: Date.now() - this.startTime,
            totalLogs: this.logs.length,
            totalErrors: this.errors.length,
            apiCalls: {
                total: totalCalls,
                success: successCalls,
                failed: failedCalls,
                successRate: totalCalls > 0 ? ((successCalls / totalCalls) * 100).toFixed(1) + '%' : 'N/A',
                byProvider: byProvider
            }
        };
    }

    printStats() {
        const stats = this.getStats();
        this.originalConsole.log('\n' + '='.repeat(60));
        this.originalConsole.log('📊 LORAFACTORY MONITORING STATS');
        this.originalConsole.log('='.repeat(60));
        this.originalConsole.log(`⏱️  Uptime: ${(stats.uptime / 1000).toFixed(1)}s`);
        this.originalConsole.log(`📝 Total Logs: ${stats.totalLogs}`);
        this.originalConsole.log(`❌ Total Errors: ${stats.totalErrors}`);
        this.originalConsole.log(`\n🌐 API Calls:`);
        this.originalConsole.log(`   Total: ${stats.apiCalls.total}`);
        this.originalConsole.log(`   Success: ${stats.apiCalls.success}`);
        this.originalConsole.log(`   Failed: ${stats.apiCalls.failed}`);
        this.originalConsole.log(`   Success Rate: ${stats.apiCalls.successRate}`);
        this.originalConsole.log(`\n📍 By Provider:`);
        Object.entries(stats.apiCalls.byProvider).forEach(([provider, data]) => {
            this.originalConsole.log(`   ${provider}: ${data.success}/${data.total} (${((data.success/data.total)*100).toFixed(0)}%)`);
        });
        this.originalConsole.log('='.repeat(60) + '\n');
    }

    getRecentErrors(count = 10) {
        return this.errors.slice(-count);
    }

    getRecentApiCalls(count = 10) {
        return this.apiCalls.slice(-count);
    }

    clear() {
        this.logs = [];
        this.errors = [];
        this.apiCalls = [];
        this.originalConsole.log('🧹 Monitor cleared');
    }

    enable() {
        this.enabled = true;
        this.originalConsole.log('👁️ Monitor enabled');
    }

    disable() {
        this.enabled = false;
        this.originalConsole.log('🙈 Monitor disabled');
    }
}

// Global monitor instance
window.monitor = new Monitor();

// Helper functions
window.printStats = () => monitor.printStats();
window.showErrors = () => monitor.originalConsole.table(monitor.getRecentErrors());
window.showApiCalls = () => monitor.originalConsole.table(monitor.getRecentApiCalls());
window.clearMonitor = () => monitor.clear();

monitor.originalConsole.log('👁️ Monitor initialized. Available commands:');
monitor.originalConsole.log('  monitor.printStats()  - Show statistics');
monitor.originalConsole.log('  monitor.getRecentErrors()  - Get recent errors');
monitor.originalConsole.log('  monitor.getRecentApiCalls()  - Get recent API calls');
monitor.originalConsole.log('  printStats()  - Shortcut for stats');
monitor.originalConsole.log('  showErrors()  - Show errors table');
monitor.originalConsole.log('  showApiCalls()  - Show API calls table');
