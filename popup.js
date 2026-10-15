/**
 * @description 弹出窗口脚本，负责用户界面交互
 */

// 获取DOM元素
const statusText = document.getElementById('statusText');
const browserIdText = document.getElementById('browserIdText');

// 调试信息
console.log('popup.js 已加载');

/**
 * @description 检查内容脚本状态
 * @returns {Promise<boolean>} 内容脚本是否就绪
 */
async function checkContentScript() {
    try {
        // 获取当前活动标签页
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            console.log('没有活动标签页');
            updateStatus(false);
            return false;
        }
        
        // 发送ping消息
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
        console.log('Ping响应:', response);
        
        if (response && response.status === 'ok' && response.browserId) {
            updateStatus(true, response.browserId);
            return true;
        }
        
        updateStatus(false);
        return false;
    } catch (error) {
        console.error('检查内容脚本状态失败:', error);
        updateStatus(false);
        return false;
    }
}

/**
 * @description 更新状态显示
 * @param {boolean} isConnected 是否已连接
 * @param {string} [browserId] 浏览器ID
 */
function updateStatus(isConnected, browserId) {
    if (isConnected) {
        statusText.textContent = '已连接';
        statusText.className = 'status connected';
        browserIdText.textContent = browserId || '未获取';
        browserIdText.className = 'browser-id';
        
        // 添加点击事件
        browserIdText.onclick = async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) {
                    console.log('没有活动标签页');
                    return;
                }
                
                const response = await chrome.tabs.sendMessage(tab.id, { type: 'copyBrowserId' });
                if (response && response.status === 'ok') {
                    browserIdText.textContent = '已复制!';
                    setTimeout(() => {
                        browserIdText.textContent = browserId;
                    }, 1000);
                }
            } catch (error) {
                console.error('复制浏览器ID失败:', error);
            }
        };
    } else {
        statusText.textContent = '未连接';
        statusText.className = 'status disconnected';
        browserIdText.textContent = '未获取';
        browserIdText.className = 'browser-id';
        browserIdText.onclick = null;
    }
}

/**
 * @description 初始化弹出窗口
 */
async function initPopup() {
    console.log('初始化弹出窗口...');
    
    // 检查内容脚本状态
    await checkContentScript();
    
    // 定期检查状态
    setInterval(checkContentScript, 5000);
}

// 初始化弹出窗口
document.addEventListener('DOMContentLoaded', initPopup); 