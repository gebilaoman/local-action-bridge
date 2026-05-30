let port = null;
let isOpen = false;
let isConnected = false;
let heartbeatInterval = null;
let isManualDisconnect = false;
let cachedWindowInfo = null;
let suppressNextDisconnectReconnect = false;

const NATIVE_HOST_NAME = 'com.localaction.bridge';
const HEARTBEAT_INTERVAL = 5000;
const HEARTBEAT_TIMEOUT = 3000;
const INIT_TIMEOUT = 60000;
const RECONNECT_DELAY = 10000;
const MAX_RECONNECT_ATTEMPTS = 3;

const DEFAULT_OPERATION_SETTINGS = {
  targetWindowTitle: '',
  genericActions: {
    click_center: [
      { type: 'click', coordinate_mode: 'window', x: 400, y: 300 }
    ]
  }
};

let operationSettings = { ...DEFAULT_OPERATION_SETTINGS };

function mergeSettings(settings = {}) {
  return {
    ...DEFAULT_OPERATION_SETTINGS,
    ...settings,
    genericActions: {
      ...DEFAULT_OPERATION_SETTINGS.genericActions,
      ...(settings.genericActions || {})
    }
  };
}

function initializeSettings() {
  chrome.storage.local.get(['operationSettings'], (result) => {
    operationSettings = mergeSettings(result.operationSettings);
    if (!result.operationSettings) {
      chrome.storage.local.set({ operationSettings });
    }
  });
}

function getTargetWindowTitle(overrideTitle = null) {
  return overrideTitle || operationSettings.targetWindowTitle || '';
}

function getActionSteps(actionKey, directSteps = null) {
  if (Array.isArray(directSteps) && directSteps.length > 0) {
    return directSteps;
  }
  return operationSettings.genericActions?.[actionKey] || null;
}

function notifyConnectionStatus(status, error = null, windowInfo = null) {
  chrome.runtime.sendMessage({
    action: 'connection_status',
    status,
    error,
    window_info: windowInfo
  });
}

function notifyOperationResult(success, operation, error = null, extra = {}) {
  chrome.runtime.sendMessage({
    action: 'operation_result',
    success,
    operation,
    error,
    ...extra
  });
}

function cleanupConnection(suppressReconnect = false) {
  if (port) {
    suppressNextDisconnectReconnect = suppressReconnect;
    port.disconnect();
    port = null;
  }
  isConnected = false;
  stopHeartbeat();
  if (isManualDisconnect) {
    cachedWindowInfo = null;
  }
}

function triggerReconnect(errorDetails) {
  if (isManualDisconnect) {
    notifyConnectionStatus('disconnected', '已断开连接');
    return;
  }

  notifyConnectionStatus('reconnecting', `${errorDetails} (尝试重连中...)`);

  if (!isConnected) {
    const success = connectNativePort({
      isReconnect: true,
      cachedWindowInfo
    });

    if (!success) {
      setTimeout(() => {
        if (!isConnected && !isManualDisconnect) {
          connectNativePort({
            isReconnect: true,
            cachedWindowInfo
          });
        }
      }, RECONNECT_DELAY);
    }
  }
}

const connectNativePort = (() => {
  let reconnectCount = 0;

  return function connectNativePort(options = {}) {
    const {
      isReconnect = false,
      cachedWindowInfo: requestedCachedWindowInfo = null,
      targetWindowTitle = null,
      onInitResult = null
    } = options;

    reconnectCount = isReconnect ? reconnectCount + 1 : 0;

    try {
      if (reconnectCount >= MAX_RECONNECT_ATTEMPTS) {
        const error = '达到最大重连次数，请检查本地程序是否正常运行';
        notifyConnectionStatus('disconnected', error);
        onInitResult?.({ success: false, connected: false, error });
        return false;
      }

      const windowTitle = getTargetWindowTitle(targetWindowTitle);
      if (!windowTitle && !requestedCachedWindowInfo) {
        const error = '请先配置目标窗口标题';
        notifyConnectionStatus('disconnected', error);
        onInitResult?.({ success: false, connected: false, error });
        return false;
      }

      notifyConnectionStatus('connecting');

      if (port) {
        port.disconnect();
        port = null;
      }

      isConnected = false;
      port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

      let initTimeout = null;
      port.onMessage.addListener((msg) => {
        if (msg.action === 'init_response') {
          clearTimeout(initTimeout);

          if (msg.status === 'success') {
            reconnectCount = 0;
            isConnected = true;
            startHeartbeat();

            if (msg.window_info) {
              cachedWindowInfo = msg.window_info;
              const cacheTime = new Date().toLocaleString('zh-CN', { hour12: false });
              chrome.storage.local.set({
                cachedWindowInfo: msg.window_info,
                cacheTime
              });
            }

            notifyConnectionStatus('connected', null, msg.window_info);
            onInitResult?.({
              success: true,
              connected: true,
              window_info: msg.window_info
            });
          } else {
            cleanupConnection(true);
            notifyConnectionStatus('disconnected', msg.message);
            onInitResult?.({
              success: false,
              connected: false,
              error: msg.message
            });
          }
          return;
        }

        if (msg.action === 'heartbeat_response') {
          return;
        }

        if (msg.action === 'execute_actions_response') {
          notifyOperationResult(
            msg.status === 'success',
            msg.action_key || 'execute_actions',
            msg.status === 'success' ? null : msg.message,
            { message: msg.message, timestamp: msg.timestamp }
          );
          return;
        }

        chrome.runtime.sendMessage({
          action: 'native_message',
          message: msg
        });
      });

      port.onDisconnect.addListener(() => {
        stopHeartbeat();
        if (suppressNextDisconnectReconnect) {
          suppressNextDisconnectReconnect = false;
          port = null;
          isConnected = false;
          return;
        }
        const errorDetails = chrome.runtime.lastError
          ? chrome.runtime.lastError.message
          : '连接已断开';
        port = null;
        isConnected = false;
        triggerReconnect(errorDetails);
      });

      port.postMessage({
        action: 'init',
        cached_window_info: requestedCachedWindowInfo,
        target_window_title: windowTitle
      });

      initTimeout = setTimeout(() => {
        if (!isConnected && port) {
          const error = '连接初始化超时';
          cleanupConnection(true);
          notifyConnectionStatus('disconnected', error);
          onInitResult?.({ success: false, connected: false, error });
        }
      }, INIT_TIMEOUT);

      return true;
    } catch (error) {
      cleanupConnection();
      notifyConnectionStatus('disconnected', error.message);
      onInitResult?.({ success: false, connected: false, error: error.message });
      return false;
    }
  };
})();

function startHeartbeat() {
  stopHeartbeat();

  heartbeatInterval = setInterval(() => {
    if (!port || !isConnected) {
      stopHeartbeat();
      return;
    }

    let heartbeatReceived = false;
    const heartbeatTimeout = setTimeout(() => {
      if (!heartbeatReceived && isConnected) {
        cleanupConnection();
        triggerReconnect('心跳超时');
      }
    }, HEARTBEAT_TIMEOUT);

    const heartbeatListener = (msg) => {
      if (msg.action === 'heartbeat_response') {
        heartbeatReceived = true;
        clearTimeout(heartbeatTimeout);
        port.onMessage.removeListener(heartbeatListener);
      }
    };

    try {
      port.onMessage.addListener(heartbeatListener);
      port.postMessage({ action: 'heartbeat' });
    } catch (error) {
      clearTimeout(heartbeatTimeout);
      cleanupConnection();
      triggerReconnect(error.message);
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function connectWithStoredCache(sendResponse, targetWindowTitle = null) {
  chrome.storage.local.get(['cachedWindowInfo'], (result) => {
    const windowTitle = getTargetWindowTitle(targetWindowTitle);
    const cachedInfo = result.cachedWindowInfo;
    const canUseCache = cachedInfo && (
      !windowTitle ||
      cachedInfo.target_window_title === windowTitle ||
      cachedInfo.title?.includes(windowTitle)
    );

    connectNativePort({
      cachedWindowInfo: canUseCache ? cachedInfo : null,
      targetWindowTitle: windowTitle,
      onInitResult: sendResponse
    });
  });
}

function executeActions(actionKey, steps, sendResponse) {
  if (!port || !isConnected) {
    const error = '未连接到本地程序';
    notifyOperationResult(false, actionKey || 'execute_actions', error);
    sendResponse({ success: false, error, timestamp: Date.now() });
    return;
  }

  const resolvedSteps = getActionSteps(actionKey, steps);
  if (!resolvedSteps) {
    const error = `未找到动作配置: ${actionKey}`;
    notifyOperationResult(false, actionKey || 'execute_actions', error);
    sendResponse({ success: false, error, timestamp: Date.now() });
    return;
  }

  try {
    port.postMessage({
      action: 'execute_actions',
      action_key: actionKey || 'direct',
      steps: resolvedSteps
    });
    notifyOperationResult(true, actionKey || 'execute_actions');
    sendResponse({ success: true, message: 'Action sent', timestamp: Date.now() });
  } catch (error) {
    notifyOperationResult(false, actionKey || 'execute_actions', error.message);
    sendResponse({ success: false, error: error.message, timestamp: Date.now() });
  }
}

initializeSettings();
chrome.storage.local.get(['cachedWindowInfo'], (result) => {
  cachedWindowInfo = result.cachedWindowInfo || null;
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (isOpen) {
      chrome.runtime.sendMessage({ action: 'close_sidepanel' });
      isOpen = false;
    } else {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      isOpen = true;
    }
  } catch (error) {
    isOpen = false;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'connect':
      isManualDisconnect = false;
      connectWithStoredCache(sendResponse, message.target_window_title);
      return true;

    case 'disconnect':
      isManualDisconnect = true;
      if (port) {
        port.postMessage({ action: 'exit' });
        setTimeout(() => {
          port?.disconnect();
          port = null;
          isConnected = false;
          notifyConnectionStatus('disconnected', '已断开连接');
          sendResponse({ connected: false });
        }, 500);
      } else {
        notifyConnectionStatus('disconnected', '已断开连接');
        sendResponse({ connected: false });
      }
      return true;

    case 'check_connection':
      sendResponse({ connected: isConnected });
      return true;

    case 'clear_cache':
      chrome.storage.local.remove(['cachedWindowInfo', 'cacheTime'], () => {
        cachedWindowInfo = null;
        chrome.runtime.sendMessage({ action: 'cache_cleared' });
        sendResponse({ success: true });
      });
      return true;

    case 'execute_action':
      executeActions(message.action_key, message.steps, sendResponse);
      return true;

    case 'update_settings':
      operationSettings = mergeSettings({ ...operationSettings, ...message.settings });
      chrome.storage.local.set({ operationSettings }, () => {
        sendResponse({ success: true, settings: operationSettings });
      });
      return true;

    case 'sidepanel_closed':
      isOpen = false;
      sendResponse({ success: true });
      return true;

    default:
      sendResponse({ success: false, error: `Unknown action: ${message.action}` });
      return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  isOpen = false;
  isConnected = false;
  if (port) {
    port.disconnect();
    port = null;
  }
  await chrome.action.setPopup({ popup: '' });
  initializeSettings();
});

chrome.runtime.onStartup.addListener(() => {
  isOpen = false;
  isConnected = false;
  if (port) {
    port.disconnect();
    port = null;
  }
  initializeSettings();
});

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  const type = request?.type;

  if (type === 'PING') {
    chrome.runtime.sendMessage({
      action: 'web_result',
      success: true,
      operation: 'PING',
      message: { type, sender: sender.url, timestamp: Date.now() }
    });

    sendResponse({
      success: true,
      message: 'PONG',
      connected: isConnected,
      timestamp: Date.now()
    });
    return;
  }

  if (type === 'CONNECT_APP') {
    if (request.targetWindowTitle) {
      operationSettings = mergeSettings({
        ...operationSettings,
        targetWindowTitle: request.targetWindowTitle
      });
      chrome.storage.local.set({ operationSettings });
    }

    isManualDisconnect = false;
    connectWithStoredCache((response) => {
      chrome.runtime.sendMessage({
        action: 'web_result',
        success: response.success,
        operation: 'CONNECT_APP',
        message: { type, sender: sender.url, timestamp: Date.now() },
        error: response.error
      });
      sendResponse({
        success: response.success,
        connected: response.connected,
        error: response.error,
        window_info: response.window_info,
        timestamp: Date.now()
      });
    }, request.targetWindowTitle);
    return true;
  }

  if (type === 'EXECUTE_ACTION') {
    executeActions(request.actionKey, request.steps, (response) => {
      chrome.runtime.sendMessage({
        action: 'web_result',
        success: response.success,
        operation: 'EXECUTE_ACTION',
        message: {
          actionKey: request.actionKey,
          hasDirectSteps: Array.isArray(request.steps),
          timestamp: Date.now()
        },
        error: response.error
      });
      sendResponse(response);
    });
    return true;
  }

  sendResponse({
    success: false,
    error: `Unsupported message type: ${type}`,
    timestamp: Date.now()
  });
});
