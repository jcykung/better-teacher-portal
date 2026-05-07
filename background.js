const MYED_PATTERN = "https://*.myeducation.gov.bc.ca/*";

async function registerBetterMyEdScripts() {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    if (scripts.some(s => s.id === 'better-myed-script')) {
      await chrome.scripting.unregisterContentScripts({ ids: ['better-myed-script'] });
    }
    await chrome.scripting.registerContentScripts([{
      id: 'better-myed-script',
      js: ['canvas-confetti.js', 'content.js'],
      matches: [MYED_PATTERN],
      runAt: 'document_idle',
      allFrames: true
    }]);
    console.log("Scripts registered successfully.");
  } catch (err) {
    console.error("Failed to register scripts:", err);
  }
}

async function unregisterBetterMyEdScripts() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['better-myed-script'] });
    console.log("Scripts unregistered successfully.");
  } catch (err) {
    console.error("Failed to unregister scripts:", err);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      showAttendance: true,
      celebrationMode: true,
      betterGrades: true,
      firstRun: true
    });
    chrome.tabs.create({ url: 'onboarding.html' });
  } else if (details.reason === 'update') {
    // On update, re-register scripts if features are enabled
    chrome.storage.sync.get(['showAttendance', 'celebrationMode', 'betterGrades'], async (result) => {
      if (result.showAttendance !== false || result.celebrationMode !== false || result.betterGrades !== false) {
        await registerBetterMyEdScripts();
        
        // Hot Injection: Inject into existing tabs
        const tabs = await chrome.tabs.query({ url: MYED_PATTERN });
        for (const tab of tabs) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ['canvas-confetti.js', 'content.js']
          }).catch(err => console.log("Tab was not ready for injection:", err));
        }
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkPermissions') {
    chrome.permissions.contains({ origins: [MYED_PATTERN] }, (result) => {
      sendResponse({ hasPermission: result });
    });
    return true;
  }
  
  if (request.action === 'registerScripts') {
    registerBetterMyEdScripts().then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.action === 'unregisterScripts') {
    unregisterBetterMyEdScripts().then(() => sendResponse({ success: true }));
    return true;
  }
});

