document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggleAttendance');
  const statusEl = document.getElementById('statusMessage');
  const tipBtn = document.getElementById('tipBtn');

  // Open Ko-Fi in a new tab
  tipBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://ko-fi.com/coolpuddytat' });
  });

  // Load the saved state from storage
  chrome.storage.sync.get(['showAttendance'], (result) => {
    toggle.checked = result.showAttendance || false;
  });

  // Listen for the toggle action
  toggle.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    
    // Save to Google Chrome sync storage
    chrome.storage.sync.set({ showAttendance: isChecked }, () => {
      // Send message to the active tab to execute or undo the injection instantly
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: "toggleAttendance", 
            state: isChecked 
          }, (response) => {
            if (chrome.runtime.lastError) {
              // The content script isn't loaded (e.g. they are on google.com instead of MyEd)
              statusEl.style.color = '#e74c3c';
              statusEl.innerText = "Please open MyEd BC to use this.";
            } else if (response && response.status === 'wrong_page') {
              statusEl.style.color = '#e74c3c';
              statusEl.innerText = "Only active on Attendance Input pages.";
            } else {
              statusEl.style.color = '#27ae60';
              statusEl.innerText = `Feature ${isChecked ? 'enabled' : 'disabled'}!`;
              setTimeout(() => {
                statusEl.style.color = '#95a5a6';
                statusEl.innerText = "Settings auto-save for future visits.";
              }, 3000);
            }
          });
        }
      });
    });
  });
});
