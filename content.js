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
    // Only apply sticky columns to actual data lists, not layout tables
    if(!t.querySelector('tr.listCell, tr.listCellAlt')) return;
    
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
  const CODE_MAX = 25; // Wait max 5 seconds again
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

function runBetterGrades() {
  if (!isContextValid() || window._betterMyEdLastScriptId !== currentScriptId) return;
  if (!window.location.href.includes('textCommentEdit.do')) {
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
    if (!isContextValid()) {
      clearInterval(intervalId);
      return;
    }
    checkAndInject();
  }, 1000);
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
      document.addEventListener('click', (e) => {
        if (!isContextValid()) return;
        if (window._betterMyEdLastScriptId !== currentScriptId) return;
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
      });
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
