class Logger {
    constructor(containerId = null) {
        this.containerId = containerId;
    }

    // 添加日志到UI
    log(message, type = 'info') {
        // 控制台输出
        switch (type) {
            case 'error':
                console.error(message);
                break;
            case 'success':
                console.log('%c' + message, 'color: green');
                break;
            case 'warn':
                console.warn(message);
                break;
            default:
                console.log(message);
        }

        // UI输出
        if (this.containerId) {
            const container = document.getElementById(this.containerId);
            if (container) {
                const logEntry = document.createElement('div');
                logEntry.className = `log-entry ${type}`;
                
                // 修改时间戳格式为：YYYY-MM-DD HH:mm:ss.SSS
                const now = new Date();
                const timestamp = now.getFullYear() + '-' +
                    String(now.getMonth() + 1).padStart(2, '0') + '-' +
                    String(now.getDate()).padStart(2, '0') + ' ' +
                    String(now.getHours()).padStart(2, '0') + ':' +
                    String(now.getMinutes()).padStart(2, '0') + ':' +
                    String(now.getSeconds()).padStart(2, '0') + '.' +
                    String(now.getMilliseconds()).padStart(3, '0');
                
                logEntry.textContent = `[${timestamp}] ${message}`;
                container.appendChild(logEntry);
                container.scrollTop = container.scrollHeight;
            }
        }
    }

    // 清除日志
    clear() {
        if (this.containerId) {
            const container = document.getElementById(this.containerId);
            if (container) {
                container.innerHTML = '';
                this.log('日志已清除');
            }
        }
    }

    // 导出日志
    export() {
        if (this.containerId) {
            const container = document.getElementById(this.containerId);
            if (container) {
                const logs = Array.from(container.children)
                    .map(entry => entry.textContent)
                    .join('\n');
                
                const blob = new Blob([logs], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `local_action_bridge_log_${new Date().toISOString().slice(0,10)}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                
                this.log('日志已导出', 'success');
            }
        }
    }

    // 便捷方法
    info(message) {
        this.log(message, 'info');
    }

    success(message) {
        this.log(message, 'success');
    }

    error(message) {
        this.log(message, 'error');
    }

    warn(message) {
        this.log(message, 'warn');
    }
}

// 创建全局日志实例
const logger = new Logger('logContainer');

// 导出
export default logger; 
