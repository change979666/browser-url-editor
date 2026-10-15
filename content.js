/**
 * @description 内容脚本，负责页面DOM操作和消息发送
 */

// 全局配置对象
let config = {
    browserId: null,
    isConnected: false,
    messageTemplate: "默认消息模板",
    sendInterval: 5,
    idPattern: "\\d+",
    idSource: "manual",
    minDelay: 0.5,
    maxDelay: 3,
    baseUrl: '',
    isRunning: false
};

// 全局状态
let isRunning = false;
let currentConfig = null;
let messageQueue = [];
let processingQueue = false;
let autoSendInterval = null;
let isInitialized = false;

// 调试信息
console.log('content script 已加载，浏览器ID:', config.browserId);

/**
 * @description 从Python程序读取配置
 * @returns {Promise<boolean>} 是否加载成功
 */
async function loadConfigFromPython() {
    try {
        const response = await fetch('http://localhost:5000/config', {
            headers: {
                'X-Browser-ID': config.browserId
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        config = data;
        console.log('配置已更新:', config);
        return true;
    } catch (error) {
        console.error('读取配置失败:', error);
        return false;
    }
}

/**
 * @description 查找页面中的输入框
 * @returns {HTMLElement|null}
 */
function findInputElement() {
    console.log('正在查找输入框...');
    // 豆包AI特定的选择器
    const selectors = [
        // 豆包AI特定的选择器
        '.chat-input-box textarea',
        '.chat-input-box [contenteditable="true"]',
        '.chat-input-box .input-area',
        // 通用选择器
        'textarea',
        'input[type="text"]',
        '[contenteditable="true"]',
        '.chat-input',
        '#message-input',
        '.input-box',
        '.message-input',
        '.chat-box textarea',
        '.chat-box input',
        '.message-box textarea',
        '.message-box input',
        'form textarea',
        'form input[type="text"]',
        '[role="textbox"]',
        '[aria-label*="消息"]',
        '[aria-label*="输入"]',
        '[placeholder*="消息"]',
        '[placeholder*="输入"]',
        '.editor',
        '.message-editor',
        '.chat-editor'
    ];

    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
            // 检查元素是否可见且可交互
            if (element.offsetParent !== null && 
                !element.disabled && 
                element.style.display !== 'none' && 
                element.style.visibility !== 'hidden') {
                console.log('找到输入框:', selector);
                return element;
            }
        }
    }
    console.log('未找到输入框');
    return null;
}

/**
 * @description 生成随机延迟时间
 * @returns {number}
 */
function getRandomDelay() {
    const delay = Math.random() * (config.maxDelay - config.minDelay) + config.minDelay;
    console.log('生成随机延迟:', delay);
    return delay;
}

/**
 * @description 替换消息模板中的变量
 * @param {string} template - 消息模板
 * @returns {string}
 */
function replaceTemplateVariables(template) {
    console.log('替换模板变量:', template);
    const now = new Date();
    const result = template
        .replace('{{DATE}}', now.toLocaleDateString())
        .replace('{{TIME}}', now.toLocaleTimeString());
    console.log('替换结果:', result);
    return result;
}

/**
 * @description 模拟输入
 * @param {HTMLElement} element - 输入框元素
 * @param {string} text - 要输入的文本
 * @returns {Promise<void>}
 */
async function simulateTyping(element, text) {
    console.log('模拟输入:', text);
    
    // 清空输入框
    element.value = '';
    element.textContent = '';
    
    // 触发输入事件
    const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: text
    });
    
    // 设置值
    if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
        element.value = text;
        // 触发 input 事件
        element.dispatchEvent(inputEvent);
        // 触发 change 事件
        element.dispatchEvent(new Event('change', { bubbles: true }));
        // 触发 keydown 事件
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    } else {
        element.textContent = text;
        // 对于 contenteditable 元素，触发 input 事件
        element.dispatchEvent(inputEvent);
        // 触发 keydown 事件
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    }
    
    // 等待一小段时间确保输入完成
    await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * @description 检查元素是否可见且可交互
 * @param {HTMLElement} element - 要检查的元素
 * @returns {boolean} 是否可见且可交互
 */
function isElementVisible(element) {
    return element.offsetParent !== null && 
        !element.disabled && 
        element.style.display !== 'none' && 
        element.style.visibility !== 'hidden';
}

/**
 * @description 查找发送按钮
 * @returns {HTMLElement|null}
 */
function findSendButton() {
    console.log('正在查找发送按钮...');
    // 豆包AI特定的选择器
    const selectors = [
        '.chat-input-box .send-button',
        '.chat-input-box button[type="submit"]',
        '.chat-input-box .submit-button',
        // 通用选择器
        'button[type="submit"]',
        'button.send',
        'button.submit',
        'button[class*="send"]',
        'button[class*="submit"]',
        'input[type="submit"]',
        'button:not([type="button"])',
        'form button',
        'button[aria-label*="发送"]',
        'button[title*="发送"]',
        'button[data-action*="send"]',
        'button[data-action*="submit"]'
    ];

    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
            if (element.offsetParent !== null && 
                !element.disabled && 
                element.style.display !== 'none' && 
                element.style.visibility !== 'hidden') {
                console.log('找到发送按钮:', selector);
                return element;
            }
        }
    }
    console.log('未找到发送按钮');
    return null;
}

/**
 * @description 发送消息
 * @param {string} message 要发送的消息
 * @returns {Promise<boolean>} 是否发送成功
 */
async function sendMessage(message) {
    try {
        // 查找输入框
        const inputElement = findInputElement();
        if (!inputElement) {
            console.error('未找到输入框');
            return false;
        }

        // 查找发送按钮
        const sendButton = findSendButton();
        if (!sendButton) {
            console.error('未找到发送按钮');
            return false;
        }

        // 模拟输入
        await simulateTyping(inputElement, message);

        // 发送消息
        if (sendButton.tagName.toLowerCase() === 'form') {
            // 如果是表单，提交表单
            sendButton.submit();
        } else {
            // 如果是按钮，触发点击事件
            sendButton.click();
            // 触发回车键事件
            inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }

        // 等待消息发送完成
        await new Promise(resolve => setTimeout(resolve, 1000));

        return true;
    } catch (error) {
        console.error('发送消息失败:', error);
        return false;
    }
}

/**
 * @description 开始自动发送消息
 */
async function startAutoSend() {
    console.log('开始自动发送...');
    await loadConfigFromPython();
    
    if (autoSendInterval) {
        clearInterval(autoSendInterval);
    }
    
    autoSendInterval = setInterval(async () => {
        console.log('执行定时发送...');
        const message = config.messageTemplate;
        await sendMessage(message);
        const delay = config.sendInterval * 1000;
        console.log('等待下一次发送:', delay);
        await new Promise(resolve => setTimeout(resolve, delay));
    }, config.sendInterval * 1000);

    console.log('自动发送已启动，间隔:', config.sendInterval);
}

/**
 * @description 停止自动发送消息
 */
function stopAutoSend() {
    console.log('停止自动发送...');
    if (autoSendInterval) {
        clearInterval(autoSendInterval);
        autoSendInterval = null;
        console.log('自动发送已停止');
    }
}

/**
 * @description 初始化配置
 */
async function initializeConfig() {
    try {
        console.log('正在初始化配置...');
        const result = await chrome.storage.local.get('config');
        if (result.config) {
            currentConfig = result.config;
            console.log('配置初始化成功:', currentConfig);
        } else {
            console.log('未找到保存的配置');
        }
    } catch (error) {
        console.error('初始化配置失败:', error);
    }
}

/**
 * @description 处理消息队列
 */
async function processMessageQueue() {
    if (processingQueue || !isRunning || messageQueue.length === 0) {
        return;
    }

    processingQueue = true;
    console.log('开始处理消息队列...');

    try {
        while (messageQueue.length > 0 && isRunning) {
            const message = messageQueue.shift();
            console.log('处理消息:', message);
            
            // 发送消息
            await sendMessage(message);
            
            // 随机延迟
            const delay = Math.random() * (currentConfig.maxDelay - currentConfig.minDelay) + currentConfig.minDelay;
            console.log(`等待 ${delay.toFixed(2)} 秒...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
    } catch (error) {
        console.error('处理消息队列时出错:', error);
    } finally {
        processingQueue = false;
        console.log('消息队列处理完成');
    }
}

/**
 * @description 生成消息
 * @returns {string}
 */
function generateMessage() {
    if (!currentConfig) {
        throw new Error('配置未初始化');
    }

    try {
        console.log('生成消息...');
        let message = currentConfig.messageTemplate;
        
        // 替换ID
        if (currentConfig.idPattern && currentConfig.idSource === 'manual') {
            const match = message.match(new RegExp(currentConfig.idPattern));
            if (match) {
                const id = parseInt(match[1]) + 1;
                message = message.replace(new RegExp(currentConfig.idPattern), `/ID${id}/`);
            }
        }
        
        console.log('生成的消息:', message);
        return message;
    } catch (error) {
        console.error('生成消息失败:', error);
        throw error;
    }
}

// 初始化函数
async function initialize() {
    console.log('Content script 开始初始化...');
    
    // 尝试加载配置
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
        console.log(`尝试从Python程序读取配置 (第${retryCount + 1}次)...`);
        
        if (await loadConfigFromPython()) {
            console.log('配置加载成功');
            break;
        }
        
        retryCount++;
        if (retryCount < maxRetries) {
            console.log(`等待1000ms后重试...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    if (retryCount >= maxRetries) {
        console.error('无法从Python程序加载配置，使用默认配置');
    }
    
    // 通知background.js内容脚本已准备就绪
    chrome.runtime.sendMessage({ type: 'contentScriptReady', browserId: config.browserId });
}

// 生成唯一的浏览器ID
function generateBrowserId() {
    return 'browser_' + Math.random().toString(36).substr(2, 9);
}

// 从localStorage获取或生成新的浏览器ID
function getOrCreateBrowserId() {
    let browserId = localStorage.getItem('browserId');
    if (!browserId) {
        browserId = generateBrowserId();
        localStorage.setItem('browserId', browserId);
    }
    return browserId;
}

// 初始化浏览器ID
const browserId = getOrCreateBrowserId();

/**
 * @description 更新连接状态显示
 * @param {boolean} isConnected - 是否已连接
 */
function updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = isConnected ? '已连接' : '未连接';
        statusElement.className = isConnected ? 'connected' : 'disconnected';
    }
}

/**
 * @description 更新浏览器ID显示
 */
function updateBrowserIdDisplay() {
    const idElement = document.getElementById('browser-id');
    if (idElement) {
        idElement.textContent = browserId;
    }
}

/**
 * @description 检查与Python程序的连接状态
 * @returns {Promise<void>}
 */
async function checkPythonConnection() {
    try {
        const response = await fetch('http://localhost:5000/browser_status', {
            method: 'GET',
            headers: {
                'X-Browser-ID': config.browserId
            }
        });
        
        const data = await response.json();
        
        if (data.status === 'ok') {
            config.isConnected = true;
            updateConnectionStatus(true);
        } else {
            config.isConnected = false;
            updateConnectionStatus(false);
        }
    } catch (error) {
        console.error('检查Python连接状态时出错:', error);
        config.isConnected = false;
        updateConnectionStatus(false);
    }
}

/**
 * @description 初始化页面状态显示
 */
function initializeStatusDisplay() {
    // 创建状态显示容器
    const statusContainer = document.createElement('div');
    statusContainer.id = 'status-container';
    statusContainer.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        padding: 10px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        z-index: 9999;
        font-family: Arial, sans-serif;
    `;
    
    // 创建状态显示元素
    const statusElement = document.createElement('div');
    statusElement.id = 'connection-status';
    statusElement.style.cssText = `
        margin-bottom: 5px;
        font-weight: bold;
        padding: 5px;
        border-radius: 3px;
    `;
    
    // 创建浏览器ID显示元素
    const idElement = document.createElement('div');
    idElement.id = 'browser-id';
    idElement.style.cssText = `
        font-size: 12px;
        color: #666;
        padding: 5px;
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .connected {
            background-color: #e6ffe6;
            color: #006600;
        }
        .disconnected {
            background-color: #ffe6e6;
            color: #cc0000;
        }
    `;
    document.head.appendChild(style);
    
    // 组装DOM
    statusContainer.appendChild(statusElement);
    statusContainer.appendChild(idElement);
    document.body.appendChild(statusContainer);
    
    // 初始化状态
    updateConnectionStatus(config.isConnected);
    document.getElementById('browser-id').textContent = `浏览器ID: ${config.browserId}`;
}

/**
 * @description 初始化页面
 */
function initializePage() {
    if (isInitialized) return;
    
    // 初始化状态显示
    initializeStatusDisplay();
    
    // 定期检查连接状态
    setInterval(checkPythonConnection, 5000);
    
    // 通知background script内容脚本已准备就绪
    chrome.runtime.sendMessage({
        type: 'contentScriptReady',
        browserId: config.browserId
    });
    
    isInitialized = true;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initializePage);

// 通知background script内容脚本已就绪
chrome.runtime.sendMessage({
    type: 'contentScriptReady',
    browserId: browserId
}, response => {
    if (response && response.status === 'ok') {
        console.log('内容脚本已就绪，浏览器ID:', browserId);
    }
});

// 监听来自background script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('收到消息:', message);
    
    if (message.type === 'ping') {
        sendResponse({ status: 'ok', browserId: browserId });
        return true;
    }
    
    if (message.type === 'sendMessage') {
        // 处理发送消息的逻辑
        console.log('准备发送消息:', message);
        sendResponse({ status: 'ok' });
        return true;
    }
    
    if (message.type === 'navigate') {
        // 处理导航请求
        if (message.url) {
            window.location.href = message.url;
            sendResponse({ status: 'ok' });
        } else {
            sendResponse({ status: 'error', error: '未提供URL' });
        }
        return true;
    }
    
    return true;
});

// 定期发送浏览器状态
let retryCount = 0;
const maxRetries = 3;

// 定期更新浏览器状态
function updateBrowserStatus() {
    const browserId = localStorage.getItem('browserId');
    if (browserId) {
        fetch('http://localhost:5000/browser_status', {
            method: 'GET',
            headers: {
                'X-Browser-ID': browserId,
                'Content-Type': 'application/json'
            },
            mode: 'cors',
            credentials: 'omit'
        })
        .then(response => response.json())
        .then(data => {
            console.log('浏览器状态更新:', data);
        })
        .catch(error => {
            console.error('更新浏览器状态失败:', error);
        });
    }
}

// 发送浏览器状态
async function sendBrowserStatus() {
    try {
        const response = await fetch('http://localhost:5000/browser_status', {
            method: 'GET',
            headers: {
                'X-Browser-ID': config.browserId,
                'Content-Type': 'application/json'
            },
            mode: 'cors',
            credentials: 'omit'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('浏览器状态已更新:', data);
        retryCount = 0; // 重置重试计数
        
    } catch (error) {
        console.error('发送浏览器状态失败:', error);
        retryCount++;
        
        if (retryCount >= maxRetries) {
            console.error('达到最大重试次数，停止发送状态');
            return;
        }
        
        // 指数退避重试
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        console.log(`将在 ${delay}ms 后重试...`);
        setTimeout(sendBrowserStatus, delay);
    }
}

// 每5秒发送一次状态
setInterval(sendBrowserStatus, 5000);

// 初始化时立即发送一次状态
sendBrowserStatus();

// 页面加载完成后再次检查初始化状态
if (document.readyState === 'complete') {
    if (!isInitialized) {
        initialize();
    }
} else {
    window.addEventListener('load', () => {
        if (!isInitialized) {
            initialize();
        }
    });
}

/**
 * 处理来自popup的消息
 * @param {Object} request - 请求消息
 * @param {Object} sender - 发送者信息
 * @param {Function} sendResponse - 响应回调函数
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('收到消息:', request);
    
    switch (request.type) {
        case 'ping':
            sendResponse({status: 'ok'});
            break;
            
        case 'getBrowserId':
            sendResponse({browserId: config.browserId});
            break;
            
        default:
            sendResponse({status: 'error', error: '未知的消息类型'});
    }
    
    return true; // 保持消息通道开放
});

// 监听来自Python程序的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('收到消息:', message);
    
    if (message.type === 'sendMessage') {
        // 处理发送消息请求
        const { url, message: messageText } = message;
        
        // 如果URL不同，先导航到新URL
        if (url && url !== window.location.href) {
            window.location.href = url;
            // 等待页面加载完成后发送消息
            window.addEventListener('load', () => {
                setTimeout(() => {
                    sendMessage(messageText);
                }, 2000); // 等待2秒确保页面完全加载
            });
        } else {
            // 直接发送消息
            sendMessage(messageText);
        }
        
        sendResponse({status: 'ok'});
    } else if (message.type === 'navigate') {
        // 处理URL导航请求
        const { url } = message;
        
        if (url && url !== window.location.href) {
            window.location.href = url;
            sendResponse({status: 'ok', message: '正在导航到新URL'});
        } else {
            sendResponse({status: 'ok', message: '已在目标URL'});
        }
    }
    
    return true; // 保持消息通道开放
});

// 初始化
function init() {
    // 生成并保存浏览器ID
    let browserId = localStorage.getItem('browserId');
    if (!browserId) {
        browserId = generateBrowserId();
        localStorage.setItem('browserId', browserId);
    }
    
    // 定期更新浏览器状态
    setInterval(updateBrowserStatus, 5000);
    
    // 立即更新一次状态
    updateBrowserStatus();
}

// 启动初始化
init();

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('收到消息:', message);
    
    if (message.type === 'ping') {
        sendResponse({status: 'ok'});
        return true;
    }
    
    if (message.type === 'getBrowserId') {
        const browserId = localStorage.getItem('browserId');
        sendResponse({browserId: browserId});
        return true;
    }
    
    if (message.type === 'copyBrowserId') {
        const browserId = localStorage.getItem('browserId');
        navigator.clipboard.writeText(browserId)
            .then(() => {
                sendResponse({status: 'ok'});
            })
            .catch(error => {
                console.error('复制失败:', error);
                sendResponse({status: 'error', error: error.message});
            });
        return true;
    }
    
    if (message.type === 'sendMessage') {
        // 处理发送消息的逻辑
        sendResponse({status: 'ok'});
        return true;
    }
}); 