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
    // separated into read and write phases to prevent layout thrashing
    const cellStyles = [];
    for(let r=0; r<rows.length; r++){
      const cell = rows[r].cells[0];
      if(cell){
        let bg = getComputedStyle(cell).backgroundColor;
        if (!bg) bg = '#fff';
        cellStyles.push({ cell, bg });
      }
    }
    for(const {cell, bg} of cellStyles){
      cell.style.position = 'sticky';
      cell.style.left = '0';
      cell.style.zIndex = '3';
      cell.style.background = bg;
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
    
    // Prevent adding the style multiple times
    if(!document.getElementById('myed-style')){
      const style = document.createElement('style');
      style.id = 'myed-style';
      style.textContent = `
        .myed-freeze {
          position: sticky !important;
          z-index: 10 !important;
          background-clip: padding-box;
        }
        /* ensure children of frozen columns also have solid background if body is transparent */
        .myed-freeze > * {
          background-color: inherit;
        }
        .myed-scroll {
          overflow-x: auto;
        }
      `;
      document.head.appendChild(style);
    }
    // Move the totals column next to the names column
    row.insertBefore(totalsTD, namesTD.nextSibling);
    
    let stickyRaf;
    function updateStickyColumns() {
      cancelAnimationFrame(stickyRaf);
      stickyRaf = requestAnimationFrame(() => {
        // Phase 1: Read metrics (prevents forced layout thrashing)
        const freezeData = [];
        for (const cell of Array.from(row.children)) {
          if (cell === middleTD) break; // Everything up to the middle container becomes frozen
          freezeData.push({ cell, width: cell.offsetWidth || cell.getBoundingClientRect().width });
        }
        
        // Phase 2: Write styles
        let currentLeft = 0;
        for (const { cell, width } of freezeData) {
          if (!cell.classList.contains('myed-freeze')) {
            cell.classList.add('myed-freeze');
          }
          const newLeft = currentLeft + 'px';
          if (cell.style.left !== newLeft) {
            cell.style.left = newLeft;
          }
          currentLeft += width;
        }
      });
    }

    updateStickyColumns();
    middleTD.classList.add('myed-scroll');

    // Watch for dynamic insertions like the "Class Code" column popping up
    // Removed attributes and subtree tracking to prevent infinite loops causing lag
    const observer = new MutationObserver(updateStickyColumns);
    observer.observe(row, { childList: true });
    
    if (window.ResizeObserver) {
      new ResizeObserver(updateStickyColumns).observe(row);
    }
    
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

        // Stop the table from stretching to fill the page
        table.style.width = 'auto';
        table.style.tableLayout = 'auto';

        [...table.rows].forEach(row => {
          if (row.cells.length <= maxIdx) return;

          // Grab references before any DOM moves
          const nameCell = row.cells[nameIdx];
          const codeCell = row.cells[codeIdx];
          const classAttCell = classAttIdx >= 0 ? row.cells[classAttIdx] : null;

          // 1. Move Code before Name
          nameCell.parentElement.insertBefore(codeCell, nameCell.nextSibling);

          // 2. Move Class Attendance before Code
          if (classAttCell) {
            codeCell.parentElement.insertBefore(classAttCell, codeCell.nextSibling);
          }

          // 3. Compact every cell in the row
          [...row.cells].forEach(cell => {
            cell.style.width = 'auto';
            cell.style.whiteSpace = 'nowrap';
            cell.style.padding = '0 10px';
          });

          // 4. Add subtle backgrounds and bold first names
          if (row.rowIndex > 0) {
            codeCell.style.backgroundColor = '#f9f9f9';
            nameCell.style.backgroundColor = '#f9f9f9';

            const nameTarget = nameCell.querySelector('a') || nameCell;
            const text = nameTarget.textContent;
            if (text.includes(',')) {
              const parts = text.split(',');
              if (parts.length >= 2) {
                const lastName = parts[0].trim();
                const firstName = parts.slice(1).join(',').trim();
                nameTarget.innerHTML = `${lastName}, <strong>${firstName}</strong>`;
              }
            }
          }
        });
      }
    });

    if (codeTries > CODE_MAX && !found) clearInterval(codeWait);
  }, 200);
}

// Initialize script features based on user settings
if (!window.betterMyEdLoaded) {
  window.betterMyEdLoaded = true;

  function initBetterMyEd() {
    chrome.storage.sync.get(['showAttendance', 'celebrationMode'], (result) => {
    // Both toggles default to false right after install, but user will manually enable them.
    if (result.showAttendance) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runBookmarklet);
      } else {
        runBookmarklet();
      }
    }

    if (result.celebrationMode) {
      document.addEventListener('click', (e) => {
        let target = e.target;
        while (target && target !== document) {
          if ((target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'SPAN') && target.textContent) {
            const text = target.textContent.trim();
            if (text === 'Post' || text === 'Post Grades...') {
              if (typeof confetti === 'function') {
                const rect = target.getBoundingClientRect();
                const x = (rect.left + rect.width / 2) / window.innerWidth;
                const y = (rect.top + rect.height / 2) / window.innerHeight;
                
                confetti({
                  particleCount: 150,
                  spread: 70,
                  origin: { x, y }
                });
              }
              break;
            }
          }
          target = target.parentNode;
        }
      });
    }
    });
  }

  initBetterMyEd();
}
