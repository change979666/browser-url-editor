/**
 * @description 后台服务脚本，负责处理扩展的生命周期和全局状态管理
 */

// 存储当前活动标签页的状态
const activeTabs = new Map();
const BROWSER_TIMEOUT = 30000; // 30秒超时

/**
 * @description 初始化扩展
 */
chrome.runtime.onInstalled.addListener(() => {
    console.log('扩展已安装/更新');
    // 清理所有状态
    activeTabs.clear();
});

/**
 * @description 定期清理不活跃的标签页
 */
setInterval(() => {
    const now = Date.now();
    for (const [tabId, info] of activeTabs.entries()) {
        if (now - info.lastUpdate > BROWSER_TIMEOUT) {
            console.log('清理不活跃标签页:', tabId);
            activeTabs.delete(tabId);
        }
    }
}, 10000); // 每10秒检查一次

/**
 * @description 处理标签页更新
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        console.log('标签页更新完成:', tabId);
        
        // 检查内容脚本是否已注入
        chrome.tabs.sendMessage(tabId, { type: 'ping' }, response => {
            if (chrome.runtime.lastError) {
                console.log('内容脚本未就绪，等待注入...');
                return;
            }
            
            if (response && response.status === 'ok') {
                console.log('内容脚本已就绪，浏览器ID:', response.browserId);
                activeTabs.set(tabId, {
                    url: tab.url,
                    browserId: response.browserId,
                    lastUpdate: Date.now()
                });
            }
        });
    }
});

/**
 * @description 处理标签页关闭
 */
chrome.tabs.onRemoved.addListener((tabId) => {
    console.log('标签页已关闭:', tabId);
    if (activeTabs.has(tabId)) {
        const info = activeTabs.get(tabId);
        console.log('移除标签页:', tabId, '浏览器ID:', info.browserId);
        activeTabs.delete(tabId);
    }
});

/**
 * @description 处理来自content script的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('收到消息:', message);
    
    if (message.type === 'contentScriptReady') {
        const tabId = sender.tab.id;
        activeTabs.set(tabId, {
            url: sender.tab.url,
            browserId: message.browserId,
            lastUpdate: Date.now()
        });
        console.log('内容脚本就绪，浏览器ID:', message.browserId);
        sendResponse({ status: 'ok' });
        return true;
    }
    
    if (message.type === 'getBrowserId') {
        const tabId = sender.tab.id;
        const tabInfo = activeTabs.get(tabId);
        if (tabInfo) {
            // 更新最后活动时间
            tabInfo.lastUpdate = Date.now();
            sendResponse({ browserId: tabInfo.browserId });
        } else {
            sendResponse({ browserId: null });
        }
        return true;
    }
    
    return true;
});

// 监听来自Python程序的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('收到消息:', message);
    
    if (message.type === 'sendMessage') {
        // 获取当前活动标签页
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs.length > 0) {
                const tabId = tabs[0].id;
                const tabInfo = activeTabs.get(tabId);
                
                if (!tabInfo) {
                    sendResponse({status: 'error', error: '标签页未注册'});
                    return;
                }
                
                // 检查标签页是否活跃
                if (Date.now() - tabInfo.lastUpdate > BROWSER_TIMEOUT) {
                    sendResponse({status: 'error', error: '标签页不活跃'});
                    return;
                }
                
                // 转发消息到content script
                chrome.tabs.sendMessage(tabId, message, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error('发送消息失败:', chrome.runtime.lastError);
                        sendResponse({status: 'error', error: chrome.runtime.lastError.message});
                    } else {
                        // 更新最后活动时间
                        tabInfo.lastUpdate = Date.now();
                        sendResponse(response);
                    }
                });
            } else {
                sendResponse({status: 'error', error: '没有活动标签页'});
            }
        });
        return true;
    } else if (message.type === 'navigate') {
        // 获取当前活动标签页
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs.length > 0) {
                // 转发导航消息到content script
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'navigate',
                    url: message.url
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error('导航失败:', chrome.runtime.lastError);
                        sendResponse({status: 'error', error: chrome.runtime.lastError.message});
                    } else {
                        sendResponse(response);
                    }
                });
            } else {
                sendResponse({status: 'error', error: '没有活动标签页'});
            }
        });
        return true; // 保持消息通道开放
    }
}); 