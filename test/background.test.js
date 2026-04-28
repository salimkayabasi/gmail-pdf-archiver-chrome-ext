// We don't need to import specific functions, just requiring the file
// will execute the addListener calls which we can intercept

describe('Gmail Scraper Background Script', () => {
  let onMessageListener;
  let onDeterminingFilenameListener;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // We isolate modules to ensure background.js is re-evaluated for each test
    // and registers listeners cleanly.
    jest.isolateModules(() => {
      require('../src/background.js');
      
      // Extract the registered listeners
      if (chrome.runtime.onMessage.addListener.mock.calls.length > 0) {
        onMessageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      }
      
      if (chrome.downloads.onDeterminingFilename.addListener.mock.calls.length > 0) {
        onDeterminingFilenameListener = chrome.downloads.onDeterminingFilename.addListener.mock.calls[0][0];
      }
    });
  });

  describe('DOWNLOAD_FILE message', () => {
    it('should call chrome.downloads.download', () => {
      const sendResponse = jest.fn();
      
      onMessageListener(
        { type: 'DOWNLOAD_FILE', url: 'http://test.com/file', filename: 'test.pdf' },
        {},
        sendResponse
      );
      
      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://test.com/file',
          filename: 'test.pdf'
        }),
        expect.any(Function)
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true, downloadId: 123 });
    });

    it('should handle error when downloading file', () => {
      const sendResponse = jest.fn();
      chrome.runtime.lastError = { message: 'Network error' };
      
      onMessageListener(
        { type: 'DOWNLOAD_FILE', url: 'http://test.com/file', filename: 'test.pdf' },
        {},
        sendResponse
      );
      
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Network error' });
      chrome.runtime.lastError = null;
    });
  });

  describe('GENERATE_PDF message', () => {
    it('should create a tab and attach debugger', () => {
      jest.useFakeTimers();
      const sendResponse = jest.fn();
      
      onMessageListener(
        { type: 'GENERATE_PDF', url: 'http://test.com', filename: 'thread.pdf' },
        {},
        sendResponse
      );
      
      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'http://test.com', active: false }),
        expect.any(Function)
      );
      
      const onUpdatedListener = chrome.tabs.onUpdated.addListener.mock.calls.find(call => typeof call[0] === 'function')[0];
      onUpdatedListener(1, { status: 'complete' });
      jest.advanceTimersByTime(2500);
      
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
      jest.useRealTimers();
    });

    it('should handle debugger attach error', () => {
      const sendResponse = jest.fn();
      
      onMessageListener(
        { type: 'GENERATE_PDF', url: 'http://test.com', filename: 'thread.pdf' },
        {},
        sendResponse
      );
      
      chrome.runtime.lastError = { message: 'Attach error' };
      const onUpdatedListener = chrome.tabs.onUpdated.addListener.mock.calls.find(call => typeof call[0] === 'function')[0];
      onUpdatedListener(1, { status: 'complete' });
      
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Attach error' });
      chrome.runtime.lastError = null;
    });

    it('should ignore tab updates for wrong tab or incomplete status', () => {
      const sendResponse = jest.fn();
      
      onMessageListener(
        { type: 'GENERATE_PDF', url: 'http://test.com', filename: 'thread.pdf' },
        {},
        sendResponse
      );
      
      const onUpdatedListener = chrome.tabs.onUpdated.addListener.mock.calls.find(call => typeof call[0] === 'function')[0];
      onUpdatedListener(999, { status: 'complete' }); // wrong tab id
      onUpdatedListener(1, { status: 'loading' }); // wrong status
      
      expect(chrome.debugger.attach).not.toHaveBeenCalled();
    });

    it('should handle printToPDF returning no data', () => {
      jest.useFakeTimers();
      const sendResponse = jest.fn();
      
      // Override sendCommand mock temporarily to return null result
      chrome.debugger.sendCommand.mockImplementationOnce((target, method, params, callback) => {
        if (callback) callback(null);
      });
      
      onMessageListener(
        { type: 'GENERATE_PDF', url: 'http://test.com', filename: 'thread.pdf' },
        {},
        sendResponse
      );
      
      const onUpdatedListener = chrome.tabs.onUpdated.addListener.mock.calls.find(call => typeof call[0] === 'function')[0];
      onUpdatedListener(1, { status: 'complete' });
      jest.advanceTimersByTime(2500);
      
      expect(chrome.downloads.download).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
      jest.useRealTimers();
    });

    it('should handle printToPDF error', () => {
      jest.useFakeTimers();
      const sendResponse = jest.fn();
      
      onMessageListener(
        { type: 'GENERATE_PDF', url: 'http://test.com', filename: 'thread.pdf' },
        {},
        sendResponse
      );
      
      const onUpdatedListener = chrome.tabs.onUpdated.addListener.mock.calls.find(call => typeof call[0] === 'function')[0];
      onUpdatedListener(1, { status: 'complete' });
      
      chrome.runtime.lastError = { message: 'Print error' };
      jest.advanceTimersByTime(2500);
      
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
      chrome.runtime.lastError = null;
      jest.useRealTimers();
    });
  });

  describe('DOWNLOAD_ATTACHMENT message', () => {
    it('should queue the attachment and download it without filename', () => {
      const sendResponse = jest.fn();
      
      onMessageListener(
        { type: 'DOWNLOAD_ATTACHMENT', url: 'http://test.com/att', subfolder: 'folder' },
        {},
        sendResponse
      );
      
      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://test.com/att',
          conflictAction: 'uniquify'
        }),
        expect.any(Function)
      );
      
      expect(sendResponse).toHaveBeenCalledWith({ success: true, downloadId: 123 });
      
      // Simulate onDeterminingFilename
      const suggest = jest.fn();
      onDeterminingFilenameListener(
        { url: 'http://test.com/att', filename: 'actual_name.pdf' },
        suggest
      );
      
      expect(suggest).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'folder/actual_name.pdf'
        })
      );
    });

    it('should handle error when downloading attachment', () => {
      const sendResponse = jest.fn();
      chrome.runtime.lastError = { message: 'Network error' };
      
      onMessageListener(
        { type: 'DOWNLOAD_ATTACHMENT', url: 'http://test.com/att2', subfolder: 'folder' },
        {},
        sendResponse
      );
      
      expect(sendResponse).toHaveBeenCalledWith({ success: false });
      chrome.runtime.lastError = null;
    });
  });

  describe('DOWNLOAD_TEXT message', () => {
    it('should download a text file', () => {
      const sendResponse = jest.fn();
      
      const mockReadAsDataURL = jest.fn(function() {
        this.result = 'data:text/plain;base64,mock';
        this.onload();
      });
      global.FileReader = jest.fn(() => ({
        readAsDataURL: mockReadAsDataURL,
      }));
      global.Blob = jest.fn();

      onMessageListener(
        { type: 'DOWNLOAD_TEXT', text: 'Hello', filename: 'hello.txt' },
        {},
        sendResponse
      );
      
      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'hello.txt'
        }),
        expect.any(Function)
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true, downloadId: 123 });
    });

    it('should handle error when downloading text file', () => {
      const sendResponse = jest.fn();
      chrome.runtime.lastError = { message: 'Network error' };
      
      const mockReadAsDataURL = jest.fn(function() {
        this.result = 'data:text/plain;base64,mock';
        this.onload();
      });
      global.FileReader = jest.fn(() => ({
        readAsDataURL: mockReadAsDataURL,
      }));
      global.Blob = jest.fn();

      onMessageListener(
        { type: 'DOWNLOAD_TEXT', text: 'Hello', filename: 'hello.txt' },
        {},
        sendResponse
      );
      
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Network error' });
      chrome.runtime.lastError = null;
    });
  });

  describe('onDeterminingFilenameListener', () => {
    it('should intercept PDF filename from pending queue', () => {
      jest.useFakeTimers();
      const sendResponse = jest.fn();
      
      onMessageListener(
        { type: 'GENERATE_PDF', url: 'http://test.com', filename: 'intercept.pdf' },
        {},
        sendResponse
      );
      
      const onUpdatedListener = chrome.tabs.onUpdated.addListener.mock.calls.find(call => typeof call[0] === 'function')[0];
      onUpdatedListener(1, { status: 'complete' });
      jest.advanceTimersByTime(2500);
      jest.useRealTimers();
      
      const suggest = jest.fn();
      const handled = onDeterminingFilenameListener(
        { url: 'data:application/pdf;base64,mock', filename: 'random.pdf' },
        suggest
      );
      
      expect(handled).toBe(true);
      expect(suggest).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'intercept.pdf' })
      );
      
      const handledNormal = onDeterminingFilenameListener(
        { url: 'http://normal.com', filename: 'normal.pdf' },
        suggest
      );
      expect(handledNormal).toBe(false);
    });
  });

  describe('Unknown message', () => {
    it('should ignore unknown message types', () => {
      const sendResponse = jest.fn();
      const result = onMessageListener(
        { type: 'UNKNOWN_TYPE' },
        {},
        sendResponse
      );
      expect(result).toBeUndefined(); // Does not return true for async
    });
  });
});
