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

  /* ===== PART 3: reorder columns → Class Attendance | Code | Name ===== */
  let codeTries = 0;
  const CODE_MAX = 25;
  const codeWait = setInterval(() => {
    codeTries++;
    const tables = document.querySelectorAll('table');
    let found = false;

    tables.forEach(table => {
      if (found) return;
      const firstRow = table.rows[0];
      if (!firstRow) return;

      let codeIdx = -1;
      let nameIdx = -1;
      let classAttIdx = -1;

      [...firstRow.cells].forEach((cell, i) => {
        const text = cell.textContent.trim();
        if (text === 'Code') codeIdx = i;
        if (text === 'Name') nameIdx = i;
        if (text === 'Class Attendance') classAttIdx = i;
      });

      // Only act when Code is to the right of Name
      if (codeIdx > nameIdx && nameIdx >= 0) {
        found = true;
        clearInterval(codeWait);
        const maxIdx = Math.max(codeIdx, classAttIdx);

        [...table.rows].forEach(row => {
          if (row.cells.length <= maxIdx) return;

          // Grab references before any DOM moves
          const nameCell = row.cells[nameIdx];
          const codeCell = row.cells[codeIdx];
          const classAttCell = classAttIdx >= 0 ? row.cells[classAttIdx] : null;

          // 1. Move Code before Name
          nameCell.parentElement.insertBefore(codeCell, nameCell);

          // 2. Move Class Attendance before Code
          if (classAttCell) {
            codeCell.parentElement.insertBefore(classAttCell, codeCell);
          }
        });
      }
    });

    if (codeTries > CODE_MAX && !found) clearInterval(codeWait);
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
