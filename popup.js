document.addEventListener('DOMContentLoaded', () => {
  const toggleAttendance = document.getElementById('toggleAttendance');
  const toggleCelebration = document.getElementById('toggleCelebration');
  const statusEl = document.getElementById('statusMessage');
  const tipBtn = document.getElementById('tipBtn');

  const MYED_PATTERN = "https://*.myeducation.gov.bc.ca/*";

  // Open Ko-Fi in a new tab
  tipBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://ko-fi.com/coolpuddytat' });
  });

  // Load the saved states from storage
  chrome.storage.sync.get(['showAttendance', 'celebrationMode'], (result) => {
    toggleAttendance.checked = result.showAttendance || false;
    toggleCelebration.checked = result.celebrationMode || false;
  });

  async function registerScript() {
    try {
      const scripts = await chrome.scripting.getRegisteredContentScripts();
      if (!scripts.some(s => s.id === 'better-myed-script')) {
        await chrome.scripting.registerContentScripts([{
          id: 'better-myed-script',
          js: ['canvas-confetti.js', 'content.js'],
          matches: [MYED_PATTERN],
          runAt: 'document_idle',
          allFrames: true
        }]);
      } else {
        // Unregister and reregister to ensure both scripts are present
        await chrome.scripting.unregisterContentScripts({ ids: ['better-myed-script'] });
        await chrome.scripting.registerContentScripts([{
          id: 'better-myed-script',
          js: ['canvas-confetti.js', 'content.js'],
          matches: [MYED_PATTERN],
          runAt: 'document_idle',
          allFrames: true
        }]);
      }
    } catch (err) {
      console.error("Failed to register script:", err);
    }
  }

  async function unregisterScript() {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: ['better-myed-script'] });
    } catch (err) {
      // Might not be registered, that's fine
    }
  }

  async function handleToggleChange() {
    const showAttendance = toggleAttendance.checked;
    const celebrationMode = toggleCelebration.checked;
    
    if (showAttendance || celebrationMode) {
      // Request specific host permission
      chrome.permissions.request({ origins: [MYED_PATTERN] }, async (granted) => {
        if (granted) {
          await registerScript();
          chrome.storage.sync.set({ showAttendance, celebrationMode });

          // Try to inject immediately into the current tab
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && (tabs[0].url || '').includes('myeducation.gov.bc.ca')) {
              chrome.scripting.executeScript({
                target: { tabId: tabs[0].id, allFrames: true },
                files: ['canvas-confetti.js', 'content.js']
              }).catch(err => console.log("Already injected or wrong page:", err));
              
              statusEl.style.color = '#27ae60';
              statusEl.innerText = "Enabled! Refreshing MyEd...";
              setTimeout(() => {
                chrome.tabs.reload(tabs[0].id);
              }, 1000);
            } else {
              statusEl.style.color = '#27ae60';
              statusEl.innerText = "Enabled! Open MyEd to see changes.";
            }
          });
        } else {
          // User cancelled the permission dialog
          chrome.storage.sync.get(['showAttendance', 'celebrationMode'], (result) => {
            toggleAttendance.checked = result.showAttendance || false;
            toggleCelebration.checked = result.celebrationMode || false;
          });
          statusEl.style.color = '#e74c3c';
          statusEl.innerText = "Permission needed.";
        }
      });
    } else {
      // Both are OFF
      chrome.storage.sync.set({ showAttendance: false, celebrationMode: false }, async () => {
        await unregisterScript();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length > 0 && (tabs[0].url || '').includes('myeducation.gov.bc.ca')) {
            chrome.tabs.reload(tabs[0].id);
          }
        });
        statusEl.style.color = '#95a5a6';
        statusEl.innerText = "Features disabled.";
      });
    }
  }

  toggleAttendance.addEventListener('change', handleToggleChange);
  toggleCelebration.addEventListener('change', handleToggleChange);
});
