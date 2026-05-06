chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.sync.set({
      showAttendance: true,
      celebrationMode: true,
      betterGrades: true,
      firstRun: true
    });

    // Open onboarding page
    chrome.tabs.create({ url: 'onboarding.html' });
  }
});

// Handle messages from onboarding or popup if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkPermissions') {
    chrome.permissions.contains({
      origins: ['https://*.myeducation.gov.bc.ca/*']
    }, (result) => {
      sendResponse({ hasPermission: result });
    });
    return true; // Keep channel open
  }
});
