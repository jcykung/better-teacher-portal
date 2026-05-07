const enableBtn = document.getElementById('enableBtn');
const launchBtn = document.getElementById('launchBtn');
const mainState = document.getElementById('main-state');
const successState = document.getElementById('success-state');

const MYED_PATTERN = "https://*.myeducation.gov.bc.ca/*";

enableBtn.addEventListener('click', () => {
    chrome.permissions.request({
        origins: [MYED_PATTERN]
    }, (granted) => {
        if (granted) {
            // Register scripts via background script
            chrome.runtime.sendMessage({ action: 'registerScripts' });


            // Show success state
            mainState.style.display = 'none';
            successState.style.display = 'block';

            // Refresh existing MyEd tabs to apply changes immediately
            chrome.tabs.query({ url: MYED_PATTERN }, (tabs) => {
                tabs.forEach(tab => chrome.tabs.reload(tab.id));
            });
        } else {
            alert('Better MyEd needs permission to run on MyEducation BC to function. Please try again!');
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
