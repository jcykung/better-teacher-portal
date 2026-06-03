const PORTAL_PATTERN = "https://*.myeducation.gov.bc.ca/*";

async function registerScripts() {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    if (scripts.some(s => s.id === 'better-teacher-portal-script')) {
      await chrome.scripting.unregisterContentScripts({ ids: ['better-teacher-portal-script'] });
    }
    await chrome.scripting.registerContentScripts([{
      id: 'better-teacher-portal-script',
      js: ['canvas-confetti.js', 'content.js'],
      matches: [PORTAL_PATTERN],
      runAt: 'document_idle',
      allFrames: true
    }]);
    console.log("Scripts registered successfully.");
  } catch (err) {
    console.error("Failed to register scripts:", err);
  }
}

async function unregisterScripts() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['better-teacher-portal-script'] });
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
    // Automatically open the changelog page on update
    chrome.tabs.create({ url: 'changelog.html' });

    // On update, re-register scripts if features are enabled
    chrome.storage.sync.get(['showAttendance', 'celebrationMode', 'betterGrades'], async (result) => {
      if (result.showAttendance !== false || result.celebrationMode !== false || result.betterGrades !== false) {
        await registerScripts();
        
        // Hot Injection: Inject into existing tabs
        const tabs = await chrome.tabs.query({ url: PORTAL_PATTERN });
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
    chrome.permissions.contains({ origins: [PORTAL_PATTERN] }, (result) => {
      sendResponse({ hasPermission: result });
    });
    return true;
  }
  
  if (request.action === 'registerScripts') {
    registerScripts().then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.action === 'unregisterScripts') {
    unregisterScripts().then(() => sendResponse({ success: true }));
    return true;
  }
});
