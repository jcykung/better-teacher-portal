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

  // Confetti from latest update dot
  const latestDot = document.querySelector('.timeline-item.latest .timeline-dot');
  if (latestDot && typeof confetti === 'function') {
    setTimeout(() => {
      const rect = latestDot.getBoundingClientRect();
      const x = (rect.left + rect.width / 2) / window.innerWidth;
      const y = (rect.top + rect.height / 2) / window.innerHeight;
      
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { x, y }
      });
    }, 450); // slight delay to allow page fade-in animation to finish
  }
});
