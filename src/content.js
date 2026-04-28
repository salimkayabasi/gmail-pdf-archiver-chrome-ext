// Inject download button next to Gmail search bar using CSS classes for robust placement
function injectDownloadButton() {
    // Try multiple selectors just in case Gmail changed its DOM
    let searchForm = document.querySelector('form[role="search"]');

    if (!searchForm) {
        const searchInput = document.querySelector('input[name="q"]');
        if (searchInput) searchForm = searchInput.closest('form') || searchInput.parentElement;
    }

    if (!searchForm) {
        return;
    }

    let btn = document.getElementById('scrapper-download-btn');
    if (!btn) {
        const btnContainer = document.createElement('div');
        btnContainer.innerHTML = `
          <div role="button" id="scrapper-download-btn" title="Download Selected Emails" class="scrapper-dl-btn">
              <svg style="width: 24px; height: 24px;" fill="#444" focusable="false" viewBox="0 0 24 24">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path>
              </svg>
          </div>
        `;
        btn = btnContainer.firstElementChild;
        btn.addEventListener('click', onDownloadClicked);
        document.body.appendChild(btn);
    }

    // Keep it continuously aligned dynamically
    const rect = searchForm.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        btn.style.display = 'flex';
        btn.style.top = (rect.top + (rect.height - 40) / 2) + 'px';
        btn.style.left = (rect.right + 15) + 'px';
    } else {
        btn.style.display = 'none';
    }
}

// Observe DOM modifications AND resize/scroll to reinject/re-position the button
if (typeof jest === 'undefined') {
    const observer = new MutationObserver(() => injectDownloadButton());
    window.addEventListener('resize', injectDownloadButton);
    observer.observe(document.body, { childList: true, subtree: true });
    injectDownloadButton(); // Initial check
}

function showToast(message, isError = false) {
    let toastContainer = document.getElementById('scrapper-toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'scrapper-toast-container';
        toastContainer.className = 'scrapper-toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `scrapper-toast ${isError ? 'error' : 'success'}`;
    toast.innerText = message;

    toastContainer.appendChild(toast);

    // Animate in
    setTimeout(() => { toast.classList.add('show'); }, 10);

    // Animate out
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function updateProgressToast(message, isCompleted = false) {
    let toastContainer = document.getElementById('scrapper-toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'scrapper-toast-container';
        toastContainer.className = 'scrapper-toast-container';
        document.body.appendChild(toastContainer);
    }

    let pToast = document.getElementById('scrapper-progress-toast');
    if (!pToast) {
        pToast = document.createElement('div');
        pToast.id = 'scrapper-progress-toast';
        pToast.className = 'scrapper-toast progress';
        toastContainer.appendChild(pToast);
        
        // Animate in
        setTimeout(() => { pToast.classList.add('show'); }, 10);
    }

    // Update text content with class-based spinner
    pToast.innerHTML = isCompleted ? message : `<div class="scrapper-spinner"></div>${message}`;

    if (isCompleted) {
        pToast.id = ""; // remove ID so it doesn't get updated anymore
        pToast.className = 'scrapper-toast success show'; // Switch to default success/dark mode with show
        
        // Animate out after completion display
        setTimeout(() => {
            pToast.classList.remove('show');
            setTimeout(() => pToast.remove(), 300);
        }, 4000);
    }
}

async function onDownloadClicked() {
    const rows = document.querySelectorAll('tr.zA');
    const selectedRows = [];
    rows.forEach(row => {
        const checkbox = row.querySelector('div[role="checkbox"]');
        if (checkbox && checkbox.getAttribute('aria-checked') === 'true') {
            selectedRows.push(row);
        }
    });

    if (selectedRows.length === 0) {
        // Check if user is currently reading an email (inside a thread)
        let activeThreadId = null;
        
        const hash = window.location.hash;
        const isLikelyReadingView = hash && hash.split('/').length > 1;
        const threadSubjectEl = document.querySelector('h2.hP');

        if (isLikelyReadingView || threadSubjectEl) {
            // 1. Try to get the legacy thread ID from the DOM (required for Print View fetching attachments)
            // The URL hash often contains a new message ID (e.g. FMfcg...) which breaks the ?th= print view endpoint.
            const threadEl = document.querySelector('div[role="main"] [data-legacy-thread-id]') || document.querySelector('[data-legacy-thread-id]');
            if (threadEl) {
                activeThreadId = threadEl.getAttribute('data-legacy-thread-id');
            }

            // 2. Fallback to URL if DOM fails
            if (!activeThreadId && isLikelyReadingView) {
                const parts = hash.split('/');
                let possibleId = parts[parts.length - 1];
                if (possibleId) {
                    possibleId = possibleId.split('?')[0];
                    if (possibleId.length > 10 && /^[0-9a-zA-Z]+$/.test(possibleId)) {
                        activeThreadId = possibleId;
                    }
                }
            }
        }

        // If we found an active thread and we are likely in reading view
        if (activeThreadId) {
            let subject = "No Subject";
            if (threadSubjectEl) {
                subject = threadSubjectEl.innerText;
            } else {
                subject = document.title.split(' - ')[0] || "No Subject";
            }

            const pseudoRow = document.createElement('div');
            pseudoRow.setAttribute('data-legacy-thread-id', activeThreadId);
            const bogusSpan = document.createElement('span');
            bogusSpan.className = 'bog';
            bogusSpan.innerText = subject;
            pseudoRow.appendChild(bogusSpan);
            
            selectedRows.push(pseudoRow);
        }
    }

    if (selectedRows.length === 0) {
        showToast("Please select at least one email to download.", true);
        return;
    }

    const timestamp = Date.now();
    let processed = 0;
    const total = selectedRows.length;

    updateProgressToast(`Starting to process ${total} emails...`, false);

    for (let row of selectedRows) {
        let threadId = row.getAttribute('data-legacy-thread-id');
        if (!threadId) {
            const innerElement = row.querySelector('[data-legacy-thread-id]');
            if (innerElement) threadId = innerElement.getAttribute('data-legacy-thread-id');
        }
        if (!threadId) {
            const innerMsgElement = row.querySelector('[data-legacy-message-id]');
            if (innerMsgElement) threadId = innerMsgElement.getAttribute('data-legacy-message-id');
            // Sometimes it's inside the span id e.g., <span id="bg_18abc123...">
            else if (row.id) threadId = row.id.split('_').pop();
        }
        
        // ULTIMATE FALLBACK: Extract from the actual email link!
        if (!threadId) {
            // Gmail links usually look like #inbox/12345, #search/query/12345, #all/12345, #label/
            const linkEls = row.querySelectorAll('a[href*="#"]');
            for (let link of linkEls) {
                const href = link.getAttribute('href');
                if (href && (href.includes('#inbox/') || href.includes('#search/') || href.includes('#all/') || href.includes('#label/'))) {
                    const parts = href.split('/');
                    const possibleId = parts[parts.length - 1];
                    // thread ids are usually long hex 16 chars
                    if (possibleId && possibleId.length > 10) {
                        threadId = possibleId;
                        break;
                    }
                }
            }
        }

        if (!threadId) {
            console.error("[Gmail Scraper] Could not extract thread/message ID for row", row);
            processed++; // Count it as attempt to avoid getting stuck
            updateProgressToast(`Processed (${processed}/${total}): Skipped unknown row`, false);
            continue;
        }

        let subject = "No Subject";
        const subjectEl = row.querySelector('span.bog');
        if (subjectEl) subject = subjectEl.innerText.replace(/[/\\?%*:|"<>]/g, '-').trim();

        updateProgressToast(`Processing (${processed + 1}/${total}): ${subject}...`, false);
        const baseFolder = `Gmail/${timestamp}`;

        row.style.backgroundColor = "#e8eaed";

        try {
            const baseUrl = window.location.origin + window.location.pathname;
            // 1. Silent PDF Print via Chrome Debugger Background Execution
            await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: "GENERATE_PDF",
                    url: `${baseUrl}?ui=2&view=pt&search=all&th=${threadId}`,
                    filename: `${baseFolder}/${subject}.pdf`
                }, (response) => {
                    if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
                    resolve();
                });
            });

            // 2. Fetch Print view to grab attachments securely since Basic HTML was deprecated
            const htmlRes = await fetch(`${baseUrl}?ui=2&view=pt&search=all&th=${threadId}`);
            let htmlText = await htmlRes.text();
            
            // Fix: DOMParser uses about:blank by default which breaks relative hrefs. We inject the dynamic origin!
            htmlText = htmlText.replace('<head>', `<head><base href="${window.location.origin}/">`);
            const htmlDoc = new DOMParser().parseFromString(htmlText, 'text/html');

            const links = Array.from(htmlDoc.querySelectorAll('a[href*="view=att"]'));
            const attachments = {}; // uniqueKey -> href

            for (let link of links) {
                try {
                    // Safe URL parsing
                    const urlObj = new URL(link.href, window.location.origin);
                    const attid = urlObj.searchParams.get('attid');
                    const msgId = urlObj.searchParams.get('th'); // msg id is in 'th'
                    if (!attid) continue;

                    const uniqueKey = msgId ? `${msgId}_${attid}` : attid;

                    // Save just the underlying raw URL mapping uniquely
                    if (!attachments[uniqueKey]) {
                        urlObj.searchParams.set('disp', 'safe');
                        attachments[uniqueKey] = urlObj.toString();
                    }
                } catch(e) {}
            }

            for (let uniqueKey in attachments) {
                // Let Chrome's Background determine the TRUE filename natively using the DOWNLOAD_ATTACHMENT target!
                chrome.runtime.sendMessage({
                    type: "DOWNLOAD_ATTACHMENT",
                    url: attachments[uniqueKey],
                    subfolder: `${baseFolder}/${subject}`
                });
            }

        } catch (e) {
            console.error("Failed to process thread:", threadId, e);
        }

        row.style.backgroundColor = "";
        processed++;
    }

    // Unchecking rows at the end to clean state
    selectedRows.forEach(row => {
        const checkbox = row.querySelector('div[role="checkbox"]');
        if (checkbox) checkbox.click(); // Simulated click to deselect
    });

    updateProgressToast(`Successfully processed ${processed} emails!`, true);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        injectDownloadButton,
        showToast,
        updateProgressToast,
        onDownloadClicked
    };
}