function runBookmarklet() {
  /** 
   * ===== PART 1: GLOBAL FIXES =====
   * These run immediately across all tables on the page.
   * 1. Injects global hover states for data rows
   * 2. Adds horizontal scrolling for wide tables
   * 3. Makes the first column (usually Names) sticky so it stays visible while scrolling
   */
  // 1. Inject custom CSS styles globally. We check if it exists so we don't accidentally add it twice.
  // Feel free to change the RGBA values below to customize the hover color!
  if(!document.getElementById('myed-global-hover')){
    const hoverStyle = document.createElement('style');
    hoverStyle.id = 'myed-global-hover';
    hoverStyle.textContent = `
      table tbody tr.listCell td, table tbody tr.listCellAlt td {
        position: relative;
      }
      table tbody tr.listCell:hover td::after, table tbody tr.listCellAlt:hover td::after {
        content: '';
        position: absolute;
        inset: 0;
        background-color: rgba(200, 200, 200, 0.3);
        pointer-events: none;
        z-index: 1;
      }
    `;
    document.head.appendChild(hoverStyle);
  }

  document.querySelectorAll('div,table').forEach(c=>{
    if(c.scrollWidth > c.clientWidth){
      c.style.overflowX = 'auto';
      c.style.position = 'relative';
    }
  });

  // 3. Make the first column on EVERY table "sticky" (it stays visible when scrolling right)
  document.querySelectorAll('table').forEach(t=>{
    const rows = t.rows;
    if(!rows.length) return;
    
    // We separate reading styles and writing styles. Doing these at the same time causes 
    // "layout thrashing" and makes the browser laggy.
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

  /**
   * ===== PART 2: THE "TRENDS" PAGE (TOTALS COLUMN REORDER & FREEZING) =====
   * This part specifically looks for the Aspen "Trends/Totals" screen.
   * It moves the Totals column next to the Names, and makes both sticky.
   */
  let tries = 0;
  const MAX = 25; // We will check 25 times (for 5 seconds) before giving up.
  const wait = setInterval(()=>{
    tries++;
    // #div3 usually contains the totals data on MyEd Trends view
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

    // 4. Watch for dynamic content loading in (like new columns popping up late)
    // We only track direct children (childList) to prevent infinite loops causing lag
    const observer = new MutationObserver(updateStickyColumns);
    observer.observe(row, { childList: true });
    
    // OPTIMIZATION: Track observer instances to prevent memory leaks if script runs multiple times
    if (window._myedObserver) window._myedObserver.disconnect();
    window._myedObserver = observer;
    
    if (window.ResizeObserver) {
      const resizeOb = new ResizeObserver(updateStickyColumns);
      resizeOb.observe(row);
      // Clean up previous instances
      if (window._myedResizeOb) window._myedResizeOb.disconnect();
      window._myedResizeOb = resizeOb;
    }
    
  }, 200);

  /**
   * ===== PART 3: THE "ROSTER/ATTENDANCE" PAGE =====
   * This logic automatically moves formatting around for general rosters:
   * 1. Moves Class Code closer to names
   * 2. Moves Class Attendance directly beside names
   * 3. Formats names nicely
   * 4. Adds custom colorful badges for "A" (Absent) and "L" (Late)
   */
  let codeTries = 0;
  const CODE_MAX = 25; // Wait max 5 seconds again
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
            
            // 5. Style Attendance Badges
            if (classAttCell) {
              const input = classAttCell.querySelector('input[type="text"]');
              if (input) {
                const val = input.value.trim().toUpperCase();
                if (val === 'L' || val === 'A') {
                  input.style.backgroundColor = val === 'L' ? '#ffd866' : '#ff6188';
                  input.style.color = val === 'L' ? '#d25a00' : '#7c1a3b';
                  input.style.fontWeight = 'bold';
                  input.style.textAlign = 'center';
                  input.style.borderRadius = '4px';
                }
              } else {
                // Find pure text nodes to avoid destroying sibling elements like [edit] links
                const walker = document.createTreeWalker(classAttCell, NodeFilter.SHOW_TEXT, null, false);
                const nodesToReplace = [];
                let textNode;
                while ((textNode = walker.nextNode())) {
                  const val = textNode.nodeValue.trim().toUpperCase();
                  if (val === 'L' || val === 'A') {
                    nodesToReplace.push({ node: textNode, val });
                  }
                }
                
                nodesToReplace.forEach(({ node, val }) => {
                  const badgeColor = val === 'L' ? '#ffd866' : '#ff6188';
                  const textColor = val === 'L' ? '#d25a00' : '#7c1a3b';
                  const span = document.createElement('span');
                  span.style.display = 'inline-flex';
                  span.style.alignItems = 'center';
                  span.style.justifyContent = 'center';
                  span.style.width = '22px';
                  span.style.height = '22px';
                  span.style.borderRadius = '4px';
                  span.style.backgroundColor = badgeColor;
                  span.style.color = textColor;
                  span.style.fontWeight = 'bold';
                  span.style.fontSize = '13px';
                  span.style.marginRight = '6px';
                  span.textContent = val;
                  node.parentNode.replaceChild(span, node);
                });
              }
            }
          }
        });
      }
    });

    if (codeTries > CODE_MAX && !found) clearInterval(codeWait);
  }, 200);

  /**
   * ===== PART 4: POST STATUS INDICATOR =====
   * Adds a visual "Not Posted" / "Posted" badge next to the Post (saveButton) button.
   * Detects existing post status by checking for "Posted" text in the page's
   * status cell (via XPath). Toggles to green "Posted" when the button is clicked.
   */
  let postTries = 0;
  const POST_MAX = 25;
  const postWait = setInterval(() => {
    postTries++;
    const saveBtn = document.querySelector('button[name="saveButton"]');
    if (!saveBtn) {
      if (postTries > POST_MAX) clearInterval(postWait);
      return;
    }
    clearInterval(postWait);

    // Don't add the badge twice
    if (document.getElementById('myed-post-status')) return;

    // Check the page's own status cell to see if attendance was already posted
    const statusXPath = '//*[@id="contentArea"]/table[2]/tbody/tr[1]/td[2]/table[2]/tbody/tr[2]/td[2]';
    const statusNode = document.evaluate(statusXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    const alreadyPosted = statusNode ? /posted/i.test(statusNode.textContent) : false;

    const badge = document.createElement('span');
    badge.id = 'myed-post-status';
    Object.assign(badge.style, {
      display:        'inline-flex',
      alignItems:     'center',
      marginLeft:     '10px',
      padding:        '3px 10px',
      borderRadius:   '4px',
      fontSize:       '12px',
      fontWeight:     '600',
      letterSpacing:  '0.3px',
      transition:     'all 0.3s ease',
      verticalAlign:  'middle',
    });

    // Helper to apply the correct visual state
    function applyPostedState(posted) {
      if (posted) {
        badge.textContent = 'Posted';
        badge.style.backgroundColor = '#dcfce7';
        badge.style.color           = '#166534';
        badge.style.border          = '1px solid #bbf7d0';
      } else {
        badge.textContent = 'Not Posted';
        badge.style.backgroundColor = '#fde8e8';
        badge.style.color           = '#b91c1c';
        badge.style.border          = '1px solid #f5c6c6';
      }
    }

    // Set initial state from the page's own status element
    applyPostedState(alreadyPosted);

    // Place the badge right after the button
    saveBtn.parentElement.insertBefore(badge, saveBtn.nextSibling);

    // Toggle to "Posted" on click
    saveBtn.addEventListener('click', () => {
      applyPostedState(true);
    });
  }, 200);

  /**
   * ===== PART 5: KEEP ATTENDANCE INPUTS ENABLED =====
   * After posting, MyEd disables the A/L/P attendance code inputs.
   * This observer watches for the "disabled" attribute being added to any
   * input inside the content area and immediately removes it, so teachers
   * can still switch between A, L, and P without extra clicks.
   */
  const contentArea = document.getElementById('contentArea');
  if (contentArea) {
    // Initial sweep: re-enable any inputs that arrived already disabled from the server
    contentArea.querySelectorAll('input[disabled]').forEach(input => {
      input.disabled = false;
      input.removeAttribute('disabled');
    });

    const disableObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
          const el = mutation.target;
          if (el.tagName === 'INPUT' && el.disabled) {
            el.disabled = false;
            el.removeAttribute('disabled');
          }
        }
      }
    });
    disableObserver.observe(contentArea, {
      subtree:         true,
      attributes:      true,
      attributeFilter: ['disabled'],
    });

    // Clean up previous instance to prevent memory leaks
    if (window._myedDisableObserver) window._myedDisableObserver.disconnect();
    window._myedDisableObserver = disableObserver;
  }
}

/**
 * ===== INITIALIZATION SCRIPTS =====
 * Setup based on the Chrome Extension toggle switches in the popup.
 */
// Ensure script features don't get accidentally duplicated
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
      // Create a single global event listener. Reusing one listener instead of attaching 
      // to every button saves massive amounts of browser memory!
      document.addEventListener('click', (e) => {
        let target = e.target;
        // Bubble up from the click target to find the actual button/link element
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
