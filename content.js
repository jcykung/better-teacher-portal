(function() {
// Helper to check if the extension context is still valid
function isContextValid() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  } catch (e) {
    return false;
  }
}

function runBookmarklet() {
  // Do not run on specific popups where layout is easily broken
  if (window.location.href.includes('studentMassEmail.do')) {
    return;
  }

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
      table tbody tr.listCell:hover td, table tbody tr.listCellAlt:hover td {
        box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.07) !important;
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
    // Only apply sticky columns to actual data lists, not layout tables
    if(!t.querySelector('tr.listCell, tr.listCellAlt')) return;
    
    // Skip sticky columns on attendance pages as requested (user wants names to scroll too)
    if (window.location.href.includes('attendance') || 
        window.location.href.includes('ClassroomAttendanceInput')) return;
    
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
  const urlStr = window.location.href || '';
  const isTrendsPage = urlStr.includes('attendance.period.classes.trends') || 
                       urlStr.includes('periodTrendsClassroomInput.do');

  if (isTrendsPage) {
    let tries = 0;
    const MAX = 25; // We will check 25 times (for 5 seconds) before giving up.
    const wait = setInterval(()=>{
      if (!isContextValid()) {
        clearInterval(wait);
        return;
      }
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
          background-clip: border-box !important;
        }
        #div3 {
          /* Apply the border to the internal div to ensure it stays pinned to the totals section */
          border-right: 1.5px solid #000 !important;
          box-sizing: border-box;
        }
        tr.myed-row-hover #myed-totals-column {
          box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.07) !important;
        }
        /* ensure children of frozen columns also have solid background if body is transparent */
        .myed-freeze > * {
          background-color: inherit;
        }
        .myed-scroll {
          overflow-x: auto;
        }
        /* Unified row highlighting for Trends */
        tr.myed-row-hover td {
          box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.07) !important;
        }
      `;
      document.head.appendChild(style);
    }
    // Move the totals column next to the names column
    row.insertBefore(totalsTD, namesTD.nextSibling);
    
    // Force the table to be compact and collapse borders to remove gaps
    const table = row.closest('table');
    if (table) {
      table.style.width = 'auto';
      table.style.borderCollapse = 'collapse';
      table.style.borderSpacing = '0';
    }
    
    // Ensure frozen columns are compact and clean
    namesTD.style.padding = '0';
    namesTD.style.border = 'none';
    
    totalsTD.id = 'myed-totals-column';
    totalsTD.style.width = '1px';
    totalsTD.style.whiteSpace = 'nowrap';
    totalsTD.style.padding = '0';
    totalsTD.style.border = 'none';
    
    let stickyRaf;
    function updateStickyColumns() {
      if (!chrome.runtime?.id) return;
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
          
          // Ensure background is opaque to hide data passing behind
          let bg = getComputedStyle(cell).backgroundColor;
          if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
            bg = '#fff';
          }
          cell.style.backgroundColor = bg;
          cell.style.background = bg; // Force solid background
          
          currentLeft += width;
        }
      });
    }

    updateStickyColumns();
    middleTD.classList.add('myed-scroll');

    // 4. Watch for dynamic content loading in (like new columns popping up late)
    // We only track direct children (childList) to prevent infinite loops causing lag
    const observer = new MutationObserver(() => {
      if (!isContextValid() || window._betterMyEdLastScriptId !== currentScriptId) {
        observer.disconnect();
        return;
      }
      updateStickyColumns();
    });
    observer.observe(row, { childList: true });
    
    // OPTIMIZATION: Track observer instances to prevent memory leaks if script runs multiple times
    if (window._myedObserver) window._myedObserver.disconnect();
    window._myedObserver = observer;
    
    if (window.ResizeObserver) {
      const resizeOb = new ResizeObserver(() => {
        if (!isContextValid() || window._betterMyEdLastScriptId !== currentScriptId) {
          resizeOb.disconnect();
          return;
        }
        updateStickyColumns();
      });
      resizeOb.observe(row);
      // Clean up previous instances
      if (window._myedResizeOb) window._myedResizeOb.disconnect();
      window._myedResizeOb = resizeOb;
    }
    
    // 5. Synchronized Row Highlighting
    // Since Names, Totals, and Data are in separate tables, we sync them by rowIndex
    function syncRowHover(e) {
      const hoveredRow = e.target.closest('tr');
      if (!hoveredRow || !hoveredRow.classList.contains('listCell') && !hoveredRow.classList.contains('listCellAlt')) return;
      
      const idx = hoveredRow.rowIndex;
      const isEnter = e.type === 'mouseover' || e.type === 'mouseenter';
      
      // Find all tables involved in the Trends view
      const tables = [namesTD, totalsTD, middleTD].map(td => td.querySelector('table')).filter(Boolean);
      
      tables.forEach(t => {
        const targetRow = t.rows[idx];
        if (targetRow) {
          if (isEnter) targetRow.classList.add('myed-row-hover');
          else targetRow.classList.remove('myed-row-hover');
        }
      });
    }

    [namesTD, totalsTD, middleTD].forEach(container => {
      container.addEventListener('mouseover', syncRowHover);
      container.addEventListener('mouseout', syncRowHover);
    });
    
  }, 200);
  }

  /**
   * ===== PART 3: THE "ROSTER/ATTENDANCE" PAGE =====
   * This logic automatically moves formatting around for general rosters:
   * 1. Moves Class Code closer to names
   * 2. Moves Class Attendance directly beside names
   * 3. Formats names nicely
    * 4. Adds custom colorful badges for "A" (Absent) and "L" (Late)
    */
  let codeTries = 0;
  const CODE_MAX = 25;
  const ATTENDANCE_ORDER_KEY = 'myed_attendance_column_order';

  const codeWait = setInterval(() => {
    if (!isContextValid()) {
      clearInterval(codeWait);
      return;
    }
    codeTries++;
    const tables = document.querySelectorAll('table');
    let found = false;

    tables.forEach(table => {
      if (found) return;
      const firstRow = table.rows[0];
      if (!firstRow) return;

      // Identify columns
      const headers = [...firstRow.cells].map(c => c.textContent.trim());
      const nameIdx = headers.indexOf('Name');
      const codeIdx = headers.indexOf('Code');

      // Only act on the main attendance table
      if (nameIdx >= 0 && codeIdx >= 0) {
        found = true;
        clearInterval(codeWait);

        // Load order and apply enhancements
        chrome.storage.sync.get([ATTENDANCE_ORDER_KEY], (res) => {
          if (!isContextValid()) return;
          const savedOrder = res[ATTENDANCE_ORDER_KEY];
          enhanceAttendanceTable(table, savedOrder);
        });
      }
    });

    if (codeTries > CODE_MAX && !found) clearInterval(codeWait);
  }, 200);

  function enhanceAttendanceTable(table, desiredOrder) {
    // 1. Initial Styles
    table.style.width = 'auto';
    table.style.tableLayout = 'auto';
    table.style.borderCollapse = 'collapse';

    // 2. Define Default Order if none saved
    if (!desiredOrder) {
      desiredOrder = ['Name', 'Class Attendance', 'Daily Attendance', 'Code'];
    }

    function applyOrderAndStyles(currentOrder) {
      const rows = [...table.rows];
      const headers = [...rows[0].cells].map(c => c.textContent.trim());
      
      // Map names to current physical indices
      const map = {};
      headers.forEach((h, i) => map[h] = i);

      // Determine final index sequence
      const finalIndices = [];
      const usedIndices = new Set();

      currentOrder.forEach(name => {
        const originalIdx = headers.findIndex(h => h === name);
        if (originalIdx !== -1 && !usedIndices.has(originalIdx)) {
          finalIndices.push(originalIdx);
          usedIndices.add(originalIdx);
        }
      });

      // Add remaining columns that weren't in the order list
      headers.forEach((_, i) => {
        if (!usedIndices.has(i)) finalIndices.push(i);
      });

      // Reorder every row
      rows.forEach(row => {
        const cells = [...row.cells];
        if (cells.length < finalIndices.length) return;
        
        // Clear and re-append
        while (row.firstChild) row.removeChild(row.firstChild);
        finalIndices.forEach(idx => {
          if (cells[idx]) row.appendChild(cells[idx]);
        });

        // Styling and Badges
        if (row.rowIndex === 0) {
          // Header styling
          [...row.cells].forEach((cell, idx) => {
            cell.draggable = true;
            cell.style.cursor = 'grab';
            cell.style.padding = '10px 12px';
            cell.style.backgroundColor = '#f1f5f9';
            cell.style.borderBottom = '2px solid #cbd5e1';
            cell.style.textAlign = 'center';
            cell.style.position = 'relative';
            
            // Add visual grab handle (3 dots)
            if (!cell.querySelector('.myed-grab-handle')) {
              const handle = document.createElement('div');
              handle.className = 'myed-grab-handle';
              handle.innerHTML = '<span>&bull;</span><span>&bull;</span><span>&bull;</span>';
              Object.assign(handle.style, {
                display: 'flex',
                justifyContent: 'center',
                gap: '3px',
                fontSize: '14px',
                color: '#94a3b8',
                marginBottom: '4px',
                lineHeight: '0.5',
                opacity: '0.8',
                userSelect: 'none'
              });
              cell.prepend(handle);
            }

            // Drag and Drop Listeners
            cell.ondragstart = (e) => {
              e.dataTransfer.setData('text/plain', idx);
              cell.style.opacity = '0.4';
              cell.style.cursor = 'grabbing';
            };
            cell.ondragend = () => {
              cell.style.opacity = '1';
              cell.style.cursor = 'grab';
            };
            cell.ondragover = (e) => e.preventDefault();
            cell.ondrop = (e) => {
              e.preventDefault();
              const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
              const toIdx = idx;
              if (fromIdx === toIdx) return;

              const updatedHeaders = [...row.parentElement.rows[0].cells].map(c => {
                // Get clean text without the handle dots
                const clone = c.cloneNode(true);
                const h = clone.querySelector('.myed-grab-handle');
                if (h) h.remove();
                return clone.textContent.trim();
              });
              const movedItem = updatedHeaders.splice(fromIdx, 1)[0];
              updatedHeaders.splice(toIdx, 0, movedItem);

              chrome.storage.sync.set({ [ATTENDANCE_ORDER_KEY]: updatedHeaders }, () => {
                applyOrderAndStyles(updatedHeaders);
              });
            };
          });
        } else {
          // Data row styling
          const rowHeaders = [...table.rows[0].cells].map(c => c.textContent.trim());
          [...row.cells].forEach((cell, cellIdx) => {
            const headerName = rowHeaders[cellIdx];
            cell.style.padding = '4px 10px';
            cell.style.whiteSpace = 'nowrap';

            if (headerName === 'Name' || headerName === 'Code') {
              cell.style.backgroundColor = '#f9f9f9';
              if (headerName === 'Name') {
                const nameTarget = cell.querySelector('a') || cell;
                const text = nameTarget.textContent;
                if (text.includes(',')) {
                  const parts = text.split(',');
                  const lastName = parts[0].trim();
                  const firstName = parts.slice(1).join(',').trim();
                  nameTarget.innerHTML = `${lastName}, <strong>${firstName}</strong>`;
                }
              }
            }

            // Attendance Badges (Class & Daily)
            if (headerName === 'Class Attendance' || headerName === 'Daily Attendance') {
              const input = cell.querySelector('input[type="text"]');
              if (input) {
                const applyInputBadge = (val) => {
                  if (val === 'L' || val === 'A') {
                    input.style.backgroundColor = val === 'L' ? '#ffd866' : '#ff6188';
                    input.style.color = val === 'L' ? '#d25a00' : '#7c1a3b';
                    input.style.fontWeight = 'bold';
                    input.style.textAlign = 'center';
                    input.style.borderRadius = '4px';
                  } else {
                    input.style.backgroundColor = '';
                    input.style.color = '';
                  }
                };
                applyInputBadge(input.value.trim().toUpperCase());
                input.oninput = () => applyInputBadge(input.value.trim().toUpperCase());
              } else {
                const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
                const nodesToReplace = [];
                let textNode;
                while ((textNode = walker.nextNode())) {
                  const val = textNode.nodeValue.trim().toUpperCase();
                  if (val === 'L' || val === 'A') nodesToReplace.push({ node: textNode, val });
                }
                nodesToReplace.forEach(({ node, val }) => {
                  const badgeColor = val === 'L' ? '#ffd866' : '#ff6188';
                  const textColor = val === 'L' ? '#d25a00' : '#7c1a3b';
                  const span = document.createElement('span');
                  Object.assign(span.style, {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '22px', height: '22px', borderRadius: '4px',
                    backgroundColor: badgeColor, color: textColor,
                    fontWeight: 'bold', fontSize: '12px', marginRight: '4px'
                  });
                  span.textContent = val;
                  node.parentNode.replaceChild(span, node);
                });
              }
            }
          });
        }
      });
    }

    applyOrderAndStyles(desiredOrder);
  }

  /**
   * ===== PART 4: POST STATUS INDICATOR =====
   * Adds a visual "Not Posted" / "Posted" badge next to the Post (saveButton) button.
   * Detects existing post status by checking for "Posted" text in the page's
   * status cell (via XPath). Toggles to green "Posted" when the button is clicked.
   */
  let postTries = 0;
  const POST_MAX = 25;
  const postWait = setInterval(() => {
    if (!isContextValid()) {
      clearInterval(postWait);
      return;
    }
    postTries++;

    // Only show the badge on the attendance page — identified by this status element
    const statusXPath = '//*[@id="contentArea"]/table[2]/tbody/tr[1]/td[2]/table[2]/tbody/tr[2]/td[2]';
    const statusNode = document.evaluate(statusXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!statusNode) {
      if (postTries > POST_MAX) clearInterval(postWait);
      return;
    }

    const saveBtn = document.getElementById('saveButton');
    if (!saveBtn) {
      if (postTries > POST_MAX) clearInterval(postWait);
      return;
    }
    clearInterval(postWait);

    // Don't add the badge twice
    if (document.getElementById('myed-post-status')) return;

    // Check if attendance was already posted
    const alreadyPosted = /posted/i.test(statusNode.textContent);

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

    // Expose so other parts of the script can update the badge
    window._myedApplyPostedState = applyPostedState;

    // Set initial state from the page's own status element
    applyPostedState(alreadyPosted);

    // Place the badge right after the button
    saveBtn.parentElement.insertBefore(badge, saveBtn.nextSibling);

    // Toggle to "Posted" on click
    saveBtn.addEventListener('click', () => {
      applyPostedState(true);
    });

    // Flip badge to "Not Posted" when any attendance input is clicked
    // Uses event delegation so it works even for dynamically-loaded inputs
    const area = document.getElementById('contentArea');
    if (area) {
      area.addEventListener('click', (e) => {
        const input = e.target.closest('input');
        if (input && input !== saveBtn) {
          applyPostedState(false);
        }
      });
    }
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
      if (!isContextValid() || window._betterMyEdLastScriptId !== currentScriptId) {
        disableObserver.disconnect();
        return;
      }
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
 * ===== PART 6: BETTER GRADES =====
 * Automatically save report card comments to chrome.storage.local
 */
let lastProcessedStdId = null;

function applyReadOnlyStyles() {
  if (document.getElementById('myed-readonly-applied')) return;
  const FONT_SIZE_KEY = 'myed_comment_font_size';
  const pre = document.querySelector('.blobTextReadOnly');
  if (!pre) return;

  const marker = document.createElement('div');
  marker.id = 'myed-readonly-applied';
  marker.style.display = 'none';
  document.body.appendChild(marker);

  // 1. Fix the text wrapping and overflow
  Object.assign(pre.style, {
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    width: '100%',
    height: 'auto',
    minHeight: '120px',
    maxHeight: '500px',
    boxSizing: 'border-box',
    padding: '15px',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    lineHeight: '1.6',
    color: '#333',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
    overflowX: 'hidden',
    overflowY: 'auto'
  });

  // 2. Set popup size and layout
  Object.assign(document.body.style, {
    width: '560px',
    height: 'auto',
    padding: '20px',
    margin: '0',
    backgroundColor: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  });
  
  const popupTable = document.getElementById('popupWindow');
  if (popupTable) {
    Object.assign(popupTable.style, {
      width: '100%',
      maxWidth: '560px',
      margin: '0',
      borderCollapse: 'collapse'
    });
  }

  // 3. Style the student info header
  const detailContainer = document.querySelector('.detailContainer');
  if (detailContainer) {
    Object.assign(detailContainer.style, {
      backgroundColor: '#ffffff',
      padding: '12px 18px',
      borderRadius: '8px',
      border: '1px solid #e0e0e0',
      margin: '0'
    });
    const label = detailContainer.querySelector('.detailProperty');
    if (label) {
      label.style.backgroundColor = 'transparent';
      label.style.color = '#64748b';
      label.style.fontWeight = 'bold';
      label.style.fontSize = '12px';
    }
  }

  // 4. Style the Close/Cancel button
  const cancelBtn = document.getElementById('cancelButton');
  if (cancelBtn) {
    Object.assign(cancelBtn.style, {
      padding: '10px 24px',
      borderRadius: '6px',
      fontWeight: '600',
      cursor: 'pointer',
      backgroundColor: '#3b82f6',
      color: 'white',
      border: 'none',
      margin: '0',
      transition: 'background-color 0.2s',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '13px',
      alignSelf: 'flex-start'
    });
    cancelBtn.onmouseover = () => cancelBtn.style.backgroundColor = '#2563eb';
    cancelBtn.onmouseout = () => cancelBtn.style.backgroundColor = '#3b82f6';
  }

  // 5. Apply saved font size and Resize Window
  if (isContextValid()) {
    chrome.storage.sync.get([FONT_SIZE_KEY], (res) => {
      if (isContextValid()) {
        if (res[FONT_SIZE_KEY]) {
          const savedSize = res[FONT_SIZE_KEY] + 'px';
          pre.style.fontSize = savedSize;
          const studentName = document.querySelector('.detailValue');
          if (studentName) studentName.style.fontSize = savedSize;
        }

        // Wait for font application and layout to settle before resizing
        setTimeout(() => {
          try {
            const contentHeight = document.documentElement.scrollHeight;
            window.resizeTo(600, contentHeight + 60);
          } catch (e) {}
        }, 100);
      }
    });
  }
}

function runBetterGrades() {
  if (!isContextValid() || window._betterMyEdLastScriptId !== currentScriptId) return;
  if (!window.location.href.includes('textCommentEdit.do')) {
    return;
  }

  // Handle Read-Only Popup (only if the editable textarea is missing)
  if (document.querySelector('input[name="readOnly"][value="true"]') && !document.getElementById('textComment')) {
    applyReadOnlyStyles();
    return;
  }

  const checkAndInject = () => {
    if (!isContextValid() || window._betterMyEdLastScriptId !== currentScriptId) return;
    const textArea = document.getElementById('textComment');
    if (!textArea) return;

    const urlParams = new URLSearchParams(window.location.search);
    
    // Look for student ID in hidden inputs (standard in MyEd forms) OR URL
    const stdInput = document.querySelector('input[name="stdOID"]') || 
                     document.querySelector('input[name="studentOid"]') ||
                     document.querySelector('input[name="std"]');
    const stdId = (stdInput ? stdInput.value : null) || urlParams.get('std');
    
    if (!stdId) return;

    // If student ID changed OR UI is missing (e.g. after AJAX refresh), re-inject
    const sidebarExists = document.getElementById('myed-grades-sidebar');
    if (stdId !== lastProcessedStdId || !sidebarExists) {
      if (!isContextValid() || window._betterMyEdLastScriptId !== currentScriptId) return;
      lastProcessedStdId = stdId;
      injectBetterGradesUI(textArea, stdId);
    }
  };

  // Run once and then poll to handle AJAX-based student switching
  checkAndInject();
  const intervalId = setInterval(() => {
    if (!isContextValid() || window._betterMyEdLastScriptId !== currentScriptId) {
      clearInterval(intervalId);
      return;
    }
    checkAndInject();
  }, 1000);

  // Store for cleanup
  if (window._myedGradesInterval) clearInterval(window._myedGradesInterval);
  window._myedGradesInterval = intervalId;
}

function injectBetterGradesUI(textArea, stdId) {
  if (!isContextValid() || window._betterMyEdLastScriptId !== currentScriptId) return;
  
  // Clean up any stale UI
  document.querySelectorAll('.myed-grades-ui').forEach(el => el.remove());

  const storageKey = `myed_comment_${stdId}`;
  const FONT_SIZE_KEY = 'myed_comment_font_size';
  const RED = '#ff4757';
  const GREEN = '#2ed573';
  const GREY = '#ccc';

  // --- LAYOUT ---
  // Create a sidebar to the left of the text area
  const sidebar = document.createElement('div');
  sidebar.id = 'myed-grades-sidebar';
  sidebar.className = 'myed-grades-ui';
  Object.assign(sidebar.style, {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRight: '1px solid #ddd',
    minWidth: '120px',
    maxWidth: '120px',
    fontFamily: 'sans-serif',
    boxSizing: 'border-box'
  });

  const mainFlex = document.createElement('div');
  mainFlex.id = 'myed-grades-main-flex';
  mainFlex.className = 'myed-grades-ui';
  Object.assign(mainFlex.style, {
    display: 'flex',
    width: '100%',
    border: '1px solid #ccc',
    borderRadius: '6px',
    overflow: 'hidden',
    marginTop: '10px',
    boxSizing: 'border-box'
  });

  // Move textArea into the flex container
  textArea.parentNode.insertBefore(mainFlex, textArea);
  mainFlex.appendChild(sidebar);
  mainFlex.appendChild(textArea);
  
  Object.assign(textArea.style, {
    flex: '1',
    border: 'none',
    borderRadius: '0',
    padding: '12px',
    margin: '0',
    outline: 'none',
    resize: 'none',
    minHeight: '200px'
  });

  // --- TOP SECTION (Font Size) ---
  const topSection = document.createElement('div');
  Object.assign(topSection.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  });
  
  const fontLabel = document.createElement('div');
  fontLabel.innerText = 'Font Size';
  Object.assign(fontLabel.style, {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase'
  });
  
  const fontControls = document.createElement('div');
  Object.assign(fontControls.style, {
    display: 'flex',
    gap: '6px'
  });

  const createBtn = (text, onClick) => {
    const btn = document.createElement('div');
    btn.innerText = text;
    Object.assign(btn.style, {
      width: '30px',
      height: '30px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px solid #ccc',
      borderRadius: '4px',
      cursor: 'pointer',
      backgroundColor: '#fff',
      fontWeight: 'bold',
      userSelect: 'none',
      color: '#333',
      fontSize: '16px'
    });
    btn.onmouseover = () => btn.style.backgroundColor = '#e9ecef';
    btn.onmouseout = () => btn.style.backgroundColor = '#fff';
    btn.onclick = (e) => { e.preventDefault(); onClick(); };
    return btn;
  };

  const updateFontSize = (delta) => {
    if (!isContextValid()) return;
    chrome.storage.sync.get([FONT_SIZE_KEY], (res) => {
      if (!isContextValid()) return;
      let currentSize = res[FONT_SIZE_KEY] || 12;
      currentSize = Math.max(8, Math.min(48, currentSize + delta));
      if (!isContextValid()) return;
      chrome.storage.sync.set({ [FONT_SIZE_KEY]: currentSize }, () => {
        if (!isContextValid()) return;
        textArea.style.fontSize = currentSize + 'px';
      });
    });
  };

  topSection.appendChild(fontLabel);
  fontControls.appendChild(createBtn('-', () => updateFontSize(-1)));
  fontControls.appendChild(createBtn('+', () => updateFontSize(1)));
  topSection.appendChild(fontControls);
  sidebar.appendChild(topSection);

  // --- BOTTOM SECTION (Status & Badge) ---
  const bottomSection = document.createElement('div');
  Object.assign(bottomSection.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  });

  const statusRow = document.createElement('div');
  Object.assign(statusRow.style, {
    display: 'flex',
    alignItems: 'center',
    fontSize: '11px',
    color: '#444',
    fontWeight: '600'
  });
  
  const indicator = document.createElement('div');
  Object.assign(indicator.style, {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: GREY,
    marginRight: '6px',
    boxShadow: '0 0 2px rgba(0,0,0,0.1)'
  });
  
  const statusLabel = document.createElement('span');
  statusLabel.innerText = 'Ready';
  
  statusRow.appendChild(indicator);
  statusRow.appendChild(statusLabel);

  const badge = document.createElement('div');
  Object.assign(badge.style, {
    padding: '4px 0',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    border: '1px solid transparent'
  });

  function updateUI(state) {
    if (state === 'typing') {
      statusLabel.innerText = 'Typing...';
      indicator.style.backgroundColor = RED;
      badge.textContent = 'Not Posted';
      badge.style.backgroundColor = '#fde8e8';
      badge.style.color = '#b91c1c';
      badge.style.borderColor = '#f5c6c6';
    } else if (state === 'draft') {
      statusLabel.innerText = 'Draft Saved';
      indicator.style.backgroundColor = GREEN;
      badge.textContent = 'Not Posted';
      badge.style.backgroundColor = '#fde8e8';
      badge.style.color = '#b91c1c';
      badge.style.borderColor = '#f5c6c6';
    } else {
      statusLabel.innerText = 'Synced';
      indicator.style.backgroundColor = GREEN;
      badge.textContent = 'Posted';
      badge.style.backgroundColor = '#dcfce7';
      badge.style.color = '#166534';
      badge.style.borderColor = '#bbf7d0';
    }
  }

  bottomSection.appendChild(statusRow);
  bottomSection.appendChild(badge);
  sidebar.appendChild(bottomSection);

  // --- INITIAL DATA LOAD ---
  if (isContextValid()) {
    chrome.storage.sync.get([FONT_SIZE_KEY], (res) => {
      if (!isContextValid()) return;
      if (res[FONT_SIZE_KEY]) textArea.style.fontSize = res[FONT_SIZE_KEY] + 'px';
    });
  }

  if (isContextValid()) {
    chrome.storage.local.get([storageKey], (result) => {
      if (!isContextValid()) return;
      if (result[storageKey] !== undefined && result[storageKey] !== textArea.value) {
        textArea.value = result[storageKey];
        updateUI('draft');
      } else {
        updateUI('posted');
      }
    });
  }

  // --- LISTENERS ---
  // Only attach listeners once per textArea element
  if (textArea._myedGradesListenersAttached) return;
  textArea._myedGradesListenersAttached = true;

  let timeoutId = null;
  textArea.addEventListener('input', () => {
    if (!isContextValid() || window._betterMyEdLastScriptId !== currentScriptId) return;
    updateUI('typing');
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      if (!isContextValid()) return;
      chrome.storage.local.set({ [storageKey]: textArea.value }, () => {
        if (!isContextValid()) return;
        updateUI('draft');
      });
    }, 500);
  });

  const clearStorage = () => {
    if (!isContextValid()) return;
    chrome.storage.local.remove(storageKey);
    updateUI('posted');
  };

  ['saveButton', 'saveAndPreviousButton', 'saveAndNextButton', 'cancelButton'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', clearStorage);
  });
}

/**
 * ===== INITIALIZATION SCRIPTS =====
 * Setup based on the Chrome Extension toggle switches in the popup.
 */
// Ensure script features don't get accidentally duplicated while allowing new versions to run
const currentScriptId = Math.random().toString(36).substring(2, 9);
window._betterMyEdLastScriptId = currentScriptId;

function initBetterMyEd() {
  if (!isContextValid()) return;
  
  chrome.storage.sync.get(['showAttendance', 'celebrationMode', 'betterGrades'], (result) => {
    if (!isContextValid()) return;
    // If a newer script has started, this one should stop
    if (window._betterMyEdLastScriptId !== currentScriptId) return;

    if (result.showAttendance) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runBookmarklet);
      } else {
        runBookmarklet();
      }
    }

    if (result.celebrationMode) {
      const celebrationListener = (e) => {
        if (!isContextValid()) {
          document.removeEventListener('click', celebrationListener);
          return;
        }
        if (window._betterMyEdLastScriptId !== currentScriptId) {
          document.removeEventListener('click', celebrationListener);
          return;
        }
        let target = e.target;
        while (target && target !== document) {
          if ((target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'SPAN') && target.textContent) {
            const text = target.textContent.trim();
            if (text === 'Post' || text === 'Post Grades...') {
              if (typeof confetti === 'function') {
                const rect = target.getBoundingClientRect();
                const x = (rect.left + rect.width / 2) / window.innerWidth;
                const y = (rect.top + rect.height / 2) / window.innerHeight;
                confetti({ particleCount: 150, spread: 70, origin: { x, y } });
              }
              break;
            }
          }
          target = target.parentNode;
        }
      };

      // Clean up previous listener if it exists
      if (window._myedCelebrationListener) {
        document.removeEventListener('click', window._myedCelebrationListener);
      }
      window._myedCelebrationListener = celebrationListener;
      document.addEventListener('click', celebrationListener);
    }

    if (result.betterGrades) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runBetterGrades);
      } else {
        runBetterGrades();
      }
    }
  });
}

initBetterMyEd();
})();
