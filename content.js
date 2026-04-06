function runBookmarklet() {
  /* ===== PART 1: run immediately ===== */
  document.querySelectorAll('div,table').forEach(c=>{
    if(c.scrollWidth > c.clientWidth){
      c.style.overflowX = 'auto';
      c.style.position = 'relative';
    }
  });

  document.querySelectorAll('table').forEach(t=>{
    const rows = t.rows;
    if(!rows.length) return;
    for(let r=0; r<rows.length; r++){
      const cell = rows[r].cells[0];
      if(!cell) continue;
      cell.style.position = 'sticky';
      cell.style.left = '0';
      cell.style.zIndex = '3';
      cell.style.background = getComputedStyle(cell).backgroundColor || '#fff';
    }
    if(t.tHead && t.tHead.rows.length){
      const h = t.tHead.rows[0].cells[0];
      if(h){
        h.style.position = 'sticky';
        h.style.left = '0';
        h.style.zIndex = '4';
        h.style.background = getComputedStyle(h).backgroundColor || '#fff';
      }
    }
  });

  /* ===== PART 2: wait for Aspen, then run ===== */
  let tries = 0;
  const MAX = 25;
  const wait = setInterval(()=>{
    tries++;
    const totalsDiv = document.querySelector('#div3');
    if(!totalsDiv){
      if(tries > MAX) clearInterval(wait);
      return;
    }
    const totalsTD = totalsDiv.closest('td');
    const row = totalsTD?.parentElement;
    if(!row){
      if(tries > MAX) clearInterval(wait);
      return;
    }
    const tds = [...row.children];
    if(tds.length < 3){
      if(tries > MAX) clearInterval(wait);
      return;
    }
    clearInterval(wait);
    
    const namesTD  = tds[0];
    const middleTD = tds[1];
    
    // Prevent adding the style multiple times if toggled more than once without refreshing
    if(!document.getElementById('myed-style')){
      const style = document.createElement('style');
      style.id = 'myed-style';
      style.textContent = `
        .myed-freeze > * {
          position: sticky;
          left: 0;
          z-index: 10;
          background: #fff;
        }
        .myed-freeze-2 > * {
          position: sticky;
          left: 180px;
          z-index: 10;
          background: #fff;
        }
        .myed-scroll {
          overflow-x: auto;
        }
      `;
      document.head.appendChild(style);
    }
    row.insertBefore(totalsTD, namesTD.nextSibling);
    namesTD.classList.add('myed-freeze');
    totalsTD.classList.add('myed-freeze-2');
    middleTD.classList.add('myed-scroll');
  }, 200);
}

// Check initial state from storage to auto-inject if it was previously left ON
chrome.storage.sync.get(['showAttendance'], (result) => {
  if (result.showAttendance) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runBookmarklet);
    } else {
      runBookmarklet();
    }
  }
});

// Listen for messages from the popup toggle switch
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleAttendance") {
    if (request.state) {
      // Toggle ON: Inject exactly like the bookmarklet
      runBookmarklet();
      sendResponse({status: "applied"});
    } else {
      // Toggle OFF: Just refresh the page
      window.location.reload();
      sendResponse({status: "removed"});
    }
  }
  return true;
});
