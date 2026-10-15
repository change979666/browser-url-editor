/**
 * @description 日志工具类，用于记录扩展运行状态和错误信息
 */

class Logger {
    /**
     * @description 日志级别
     * @type {Object}
     */
    static LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3
    };

    /**
     * @description 当前日志级别
     * @type {number}
     */
    static currentLevel = Logger.LEVELS.INFO;

    /**
     * @description 日志存储
     * @type {Array<Object>}
     */
    static logs = [];

    /**
     * @description 最大日志数量
     * @type {number}
     */
    static MAX_LOGS = 1000;

    /**
     * @description 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     * @param {Object} [data] - 附加数据
     */
    static log(level, message, data = null) {
        if (level < Logger.currentLevel) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            level: Object.keys(Logger.LEVELS)[level],
            message,
            data
        };

        Logger.logs.push(logEntry);
        if (Logger.logs.length > Logger.MAX_LOGS) {
            Logger.logs.shift();
        }

        // 控制台输出
        const consoleMethod = level === Logger.LEVELS.ERROR ? 'error' :
                            level === Logger.LEVELS.WARN ? 'warn' :
                            level === Logger.LEVELS.INFO ? 'info' : 'debug';
        console[consoleMethod](`[${logEntry.level}] ${message}`, data || '');

        // 保存到存储
        this.saveToStorage();
    }

    /**
     * @description 记录调试信息
     * @param {string} message - 日志消息
     * @param {Object} [data] - 附加数据
     */
    static debug(message, data = null) {
        Logger.log(Logger.LEVELS.DEBUG, message, data);
    }

    /**
     * @description 记录一般信息
     * @param {string} message - 日志消息
     * @param {Object} [data] - 附加数据
     */
    static info(message, data = null) {
        Logger.log(Logger.LEVELS.INFO, message, data);
    }

    /**
     * @description 记录警告信息
     * @param {string} message - 日志消息
     * @param {Object} [data] - 附加数据
     */
    static warn(message, data = null) {
        Logger.log(Logger.LEVELS.WARN, message, data);
    }

    /**
     * @description 记录错误信息
     * @param {string} message - 日志消息
     * @param {Object} [data] - 附加数据
     */
    static error(message, data = null) {
        Logger.log(Logger.LEVELS.ERROR, message, data);
    }

    /**
     * @description 保存日志到存储
     */
    static async saveToStorage() {
        try {
            await chrome.storage.local.set({ logs: Logger.logs });
        } catch (error) {
            console.error('保存日志失败:', error);
        }
    }

    /**
     * @description 从存储加载日志
     */
    static async loadFromStorage() {
        try {
            const result = await chrome.storage.local.get('logs');
            if (result.logs) {
                Logger.logs = result.logs;
            }
        } catch (error) {
            console.error('加载日志失败:', error);
        }
    }

    /**
     * @description 清除日志
     */
    static async clear() {
        Logger.logs = [];
        await this.saveToStorage();
    }

    /**
     * @description 获取所有日志
     * @returns {Array<Object>}
     */
    static getLogs() {
        return Logger.logs;
    }

    /**
     * @description 获取指定级别的日志
     * @param {number} level - 日志级别
     * @returns {Array<Object>}
     */
    static getLogsByLevel(level) {
        return Logger.logs.filter(log => Logger.LEVELS[log.level] === level);
    }
}

export default Logger; 