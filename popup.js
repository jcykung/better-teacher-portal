document.addEventListener('DOMContentLoaded', () => {
  const toggleAttendance = document.getElementById('toggleAttendance');
  const toggleCelebration = document.getElementById('toggleCelebration');
  const toggleGrades = document.getElementById('toggleGrades');
  const statusEl = document.getElementById('statusMessage');
  const tipBtn = document.getElementById('tipBtn');

  const PORTAL_PATTERN = "https://*.myeducation.gov.bc.ca/*";

  // Open Ko-Fi in a new tab
  tipBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://ko-fi.com/coolpuddytat' });
  });

  // Load the saved states from storage
  chrome.storage.sync.get(['showAttendance', 'celebrationMode', 'betterGrades'], (result) => {
    toggleAttendance.checked = result.showAttendance !== false;
    toggleCelebration.checked = result.celebrationMode !== false;
    toggleGrades.checked = result.betterGrades !== false;
  });

  // Add a way to re-open the welcome page
  const welcomeLink = document.createElement('a');
  welcomeLink.href = '#';
  welcomeLink.textContent = 'Show Welcome Screen';
  welcomeLink.style.display = 'block';
  welcomeLink.style.marginTop = '15px';
  welcomeLink.style.fontSize = '12px';
  welcomeLink.style.color = '#64748b';
  welcomeLink.style.textDecoration = 'none';
  welcomeLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'onboarding.html' });
  });
  statusEl.parentNode.appendChild(welcomeLink);

  async function registerScript() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'registerScripts' }, resolve);
    });
  }

  async function unregisterScript() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'unregisterScripts' }, resolve);
    });
  }


  async function handleToggleChange() {
    const showAttendance = toggleAttendance.checked;
    const celebrationMode = toggleCelebration.checked;
    const betterGrades = toggleGrades.checked;
    
    if (showAttendance || celebrationMode || betterGrades) {
      // Request specific host permission
      chrome.permissions.request({ origins: [PORTAL_PATTERN] }, async (granted) => {
        if (granted) {
          await registerScript();
          chrome.storage.sync.set({ showAttendance, celebrationMode, betterGrades });

          // Try to inject immediately into the current tab
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && (tabs[0].url || '').includes('myeducation.gov.bc.ca')) {
              chrome.scripting.executeScript({
                target: { tabId: tabs[0].id, allFrames: true },
                files: ['canvas-confetti.js', 'content.js']
              }).catch(err => console.log("Already injected or wrong page:", err));
              
              statusEl.style.color = '#27ae60';
              statusEl.innerText = "Enabled! Refreshing Portal...";
              setTimeout(() => {
                chrome.tabs.reload(tabs[0].id);
              }, 1000);
            } else {
              statusEl.style.color = '#27ae60';
              statusEl.innerText = "Enabled! Open Portal to see changes.";
            }
          });
        } else {
          // User cancelled the permission dialog
          chrome.storage.sync.get(['showAttendance', 'celebrationMode', 'betterGrades'], (result) => {
            toggleAttendance.checked = result.showAttendance || false;
            toggleCelebration.checked = result.celebrationMode || false;
            toggleGrades.checked = result.betterGrades || false;
          });
          statusEl.style.color = '#e74c3c';
          statusEl.innerText = "Permission needed.";
        }
      });
    } else {
      // All are OFF
      chrome.storage.sync.set({ showAttendance: false, celebrationMode: false, betterGrades: false }, async () => {
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
  toggleGrades.addEventListener('change', handleToggleChange);

  // Set version number
  const versionEl = document.createElement('a');
  versionEl.href = '#';
  versionEl.textContent = `v. ${chrome.runtime.getManifest().version}`;
  Object.assign(versionEl.style, {
    position: 'absolute',
    bottom: '8px',
    right: '12px',
    fontSize: '9px',
    color: '#95a5a6',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'color 0.2s ease, text-decoration 0.2s ease'
  });
  versionEl.addEventListener('mouseenter', () => {
    versionEl.style.color = '#3b82f6';
    versionEl.style.textDecoration = 'underline';
  });
  versionEl.addEventListener('mouseleave', () => {
    versionEl.style.color = '#95a5a6';
    versionEl.style.textDecoration = 'none';
  });
  versionEl.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'changelog.html' });
  });
  document.body.appendChild(versionEl);
});
