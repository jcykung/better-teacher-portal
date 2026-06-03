document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('closeBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.close();
    });
  }

  // Tip Me button click handler
  document.querySelectorAll('.idTipBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://ko-fi.com/coolpuddytat' });
    });
  });
});
