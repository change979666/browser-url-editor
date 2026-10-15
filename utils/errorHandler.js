/**
 * @description 错误处理工具类，用于统一处理扩展中的错误
 */

import Logger from './logger';

class ErrorHandler {
    /**
     * @description 错误类型枚举
     * @type {Object}
     */
    static ERROR_TYPES = {
        CONFIG: 'CONFIG_ERROR',
        NETWORK: 'NETWORK_ERROR',
        DOM: 'DOM_ERROR',
        STORAGE: 'STORAGE_ERROR',
        PERMISSION: 'PERMISSION_ERROR',
        UNKNOWN: 'UNKNOWN_ERROR'
    };

    /**
     * @description 错误处理配置
     * @type {Object}
     */
    static config = {
        retryAttempts: 3,
        retryDelay: 1000,
        showNotifications: true
    };

    /**
     * @description 处理错误
     * @param {Error} error - 错误对象
     * @param {string} context - 错误发生的上下文
     * @param {Object} [options] - 处理选项
     * @returns {Promise<void>}
     */
    static async handle(error, context, options = {}) {
        const errorType = this.getErrorType(error);
        const errorInfo = {
            type: errorType,
            message: error.message,
            context,
            stack: error.stack,
            timestamp: new Date().toISOString()
        };

        // 记录错误日志
        Logger.error(`[${errorType}] ${error.message}`, errorInfo);

        // 根据错误类型采取不同的处理措施
        switch (errorType) {
            case this.ERROR_TYPES.CONFIG:
                await this.handleConfigError(error, context, options);
                break;
            case this.ERROR_TYPES.NETWORK:
                await this.handleNetworkError(error, context, options);
                break;
            case this.ERROR_TYPES.DOM:
                await this.handleDOMError(error, context, options);
                break;
            case this.ERROR_TYPES.STORAGE:
                await this.handleStorageError(error, context, options);
                break;
            case this.ERROR_TYPES.PERMISSION:
                await this.handlePermissionError(error, context, options);
                break;
            default:
                await this.handleUnknownError(error, context, options);
        }

        // 显示错误通知
        if (this.config.showNotifications) {
            this.showErrorNotification(error, context);
        }
    }

    /**
     * @description 获取错误类型
     * @param {Error} error - 错误对象
     * @returns {string}
     */
    static getErrorType(error) {
        if (error.name.includes('Config')) return this.ERROR_TYPES.CONFIG;
        if (error.name.includes('Network')) return this.ERROR_TYPES.NETWORK;
        if (error.name.includes('DOM')) return this.ERROR_TYPES.DOM;
        if (error.name.includes('Storage')) return this.ERROR_TYPES.STORAGE;
        if (error.name.includes('Permission')) return this.ERROR_TYPES.PERMISSION;
        return this.ERROR_TYPES.UNKNOWN;
    }

    /**
     * @description 处理配置错误
     * @param {Error} error - 错误对象
     * @param {string} context - 错误发生的上下文
     * @param {Object} options - 处理选项
     */
    static async handleConfigError(error, context, options) {
        // 尝试重置配置到默认值
        try {
            await chrome.storage.local.set({
                config: {
                    messageTemplate: '您好！这是一条自动消息。发送时间：{{TIME}}',
                    sendInterval: 5,
                    idPattern: '/ID(\\d+)/',
                    idSource: 'manual',
                    minDelay: 0.5,
                    maxDelay: 3
                }
            });
            Logger.info('配置已重置为默认值');
        } catch (resetError) {
            Logger.error('重置配置失败', resetError);
        }
    }

    /**
     * @description 处理网络错误
     * @param {Error} error - 错误对象
     * @param {string} context - 错误发生的上下文
     * @param {Object} options - 处理选项
     */
    static async handleNetworkError(error, context, options) {
        const { retryAttempts = this.config.retryAttempts } = options;
        let attempts = 0;

        while (attempts < retryAttempts) {
            try {
                await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                // 这里可以添加重试逻辑
                attempts++;
            } catch (retryError) {
                Logger.warn(`重试失败 (${attempts}/${retryAttempts})`, retryError);
            }
        }
    }

    /**
     * @description 处理DOM错误
     * @param {Error} error - 错误对象
     * @param {string} context - 错误发生的上下文
     * @param {Object} options - 处理选项
     */
    static async handleDOMError(error, context, options) {
        // 可以添加DOM元素检查和恢复逻辑
        Logger.warn('DOM操作失败，可能需要刷新页面', { context });
    }

    /**
     * @description 处理存储错误
     * @param {Error} error - 错误对象
     * @param {string} context - 错误发生的上下文
     * @param {Object} options - 处理选项
     */
    static async handleStorageError(error, context, options) {
        // 尝试清理存储空间
        try {
            await chrome.storage.local.clear();
            Logger.info('存储已清理');
        } catch (clearError) {
            Logger.error('清理存储失败', clearError);
        }
    }

    /**
     * @description 处理权限错误
     * @param {Error} error - 错误对象
     * @param {string} context - 错误发生的上下文
     * @param {Object} options - 处理选项
     */
    static async handlePermissionError(error, context, options) {
        // 可以添加权限请求逻辑
        Logger.warn('权限不足，请检查扩展权限设置', { context });
    }

    /**
     * @description 处理未知错误
     * @param {Error} error - 错误对象
     * @param {string} context - 错误发生的上下文
     * @param {Object} options - 处理选项
     */
    static async handleUnknownError(error, context, options) {
        // 记录详细信息以便调试
        Logger.error('发生未知错误', {
            error,
            context,
            options,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * @description 显示错误通知
     * @param {Error} error - 错误对象
     * @param {string} context - 错误发生的上下文
     */
    static showErrorNotification(error, context) {
        // 创建通知
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '错误通知',
            message: `${context}: ${error.message}`,
            priority: 2
        });
    }
}

export default ErrorHandler; 