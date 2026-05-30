const enableBtn = document.getElementById('enableBtn');
const launchBtn = document.getElementById('launchBtn');
const mainState = document.getElementById('main-state');
const successState = document.getElementById('success-state');

const PORTAL_PATTERN = "https://*.myeducation.gov.bc.ca/*";

enableBtn.addEventListener('click', () => {
    chrome.permissions.request({
        origins: [PORTAL_PATTERN]
    }, (granted) => {
        if (granted) {
            // Register scripts via background script
            chrome.runtime.sendMessage({ action: 'registerScripts' });


            // Show success state
            mainState.style.display = 'none';
            successState.style.display = 'block';

            // Refresh existing portal tabs to apply changes immediately
            chrome.tabs.query({ url: PORTAL_PATTERN }, (tabs) => {
                tabs.forEach(tab => chrome.tabs.reload(tab.id));
            });
        } else {
            alert('Better Teacher Portal needs permission to run on the student information portal to function. Please try again!');
        }
    });
});

launchBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.myeducation.gov.bc.ca/aspen/logon.do' });
    window.close();
});

// Tip Me functionality
document.querySelectorAll('.tipBtn').forEach(btn => {
    btn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://ko-fi.com/coolpuddytat' });
    });
});
