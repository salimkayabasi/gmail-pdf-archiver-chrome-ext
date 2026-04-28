chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "DOWNLOAD_FILE") {
        const { url, filename } = request;
        chrome.downloads.download({
            url: url,
            filename: filename,
            conflictAction: 'uniquify'
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error("Download Error:", chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId });
            }
        });
        return true; // Keeps channel open for sendResponse
    } else if (request.type === "DOWNLOAD_TEXT") {
        const { text, filename } = request;
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const reader = new FileReader();
        reader.onload = function() {
            chrome.downloads.download({
                url: reader.result,
                filename: filename,
                conflictAction: 'uniquify'
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error("Download Error:", chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ success: true, downloadId });
                }
            });
        };
        reader.readAsDataURL(blob);
        return true; // Keeps channel open for sendResponse
    } else if (request.type === "GENERATE_PDF") {
        const { url, filename } = request;
        
        chrome.tabs.create({ url: url, active: false }, (tab) => {
            const tabId = tab.id;
            
            // Wait for tab to finish loading
            chrome.tabs.onUpdated.addListener(function listener(tId, info) {
                if (tId === tabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    
                    // Attach debugger immediately
                    chrome.debugger.attach({ tabId: tabId }, "1.3", () => {
                        if (chrome.runtime.lastError) {
                            console.error("Debugger Attach Error:", chrome.runtime.lastError.message);
                            chrome.tabs.remove(tabId);
                            sendResponse({ success: false, error: chrome.runtime.lastError.message });
                            return;
                        }
                        
                        // Small buffer specifically for Gmail's internal image rendering
                        setTimeout(() => {
                            chrome.debugger.sendCommand({ tabId: tabId }, "Page.printToPDF", {
                                displayHeaderFooter: false,
                                printBackground: true
                            }, (result) => {
                                if (chrome.runtime.lastError) {
                                    console.error("PrintToPDF Error:", chrome.runtime.lastError.message);
                                } else if (result && result.data) {
                                    pendingPdfFilenames.push(filename);
                                    chrome.downloads.download({
                                        url: "data:application/pdf;base64," + result.data,
                                        filename: filename,
                                        conflictAction: 'uniquify'
                                    });
                                }
                                
                                // Cleanup tab tracking
                                chrome.debugger.detach({ tabId: tabId });
                                chrome.tabs.remove(tabId);
                                sendResponse({ success: true });
                            });
                        }, 2500); 
                    });
                }
            });
        });
        
        return true; 
    } else if (request.type === "DOWNLOAD_ATTACHMENT") {
        const { url, subfolder } = request;
        
        // Track the target folder for this URL
        pendingAttachments.set(url, subfolder);
        
        chrome.downloads.download({
            url: url,
            conflictAction: 'uniquify'
            // Deliberately DO NOT pass filename, so Chrome fetches the actual file name from Google's native HTTP headers
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error("Attachment Download Error:", chrome.runtime.lastError);
                sendResponse({ success: false });
            } else {
                sendResponse({ success: true, downloadId });
            }
        });
        return true;
    }
});

const pendingAttachments = new Map();
const pendingPdfFilenames = [];

// Hook into Chrome's download resolution pipeline
// This fires when Chrome downloads a file and determines what its actual "filename" should be based on HTTP headers
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    if (pendingAttachments.has(item.url)) {
        const folder = pendingAttachments.get(item.url);
        // We take the TRUE filename provided by the Google Server (item.filename)
        // and aggressively prepend our folder architecture format in front of it!
        suggest({
            filename: `${folder}/${item.filename}`,
            conflictAction: 'uniquify' // Ensure it doesn't collide
        });
        
        // Don't leak memory, remove the tracked URL
        pendingAttachments.delete(item.url);
        return true;
    } else if (item.url.startsWith("data:application/pdf") && pendingPdfFilenames.length > 0) {
        // Chrome ignores the filename parameter for data URIs, so we intercept it here
        const filename = pendingPdfFilenames.shift();
        suggest({
            filename: filename,
            conflictAction: 'uniquify'
        });
        return true;
    }
    return false; // Tells Chrome to handle it normally
});
