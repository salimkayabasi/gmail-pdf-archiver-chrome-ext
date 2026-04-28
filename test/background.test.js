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
    });
  });

  describe('GENERATE_PDF message', () => {
    it('should create a tab and attach debugger', () => {
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
      
      // Further logic requires triggering tabs.onUpdated...
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
  });

  describe('DOWNLOAD_TEXT message', () => {
    it('should download a text file', () => {
      const sendResponse = jest.fn();
      
      // Mock FileReader in jest.setup.js or inline
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
    });
  });

  // Note: Data URI interception is difficult to unit test completely 
  // because pendingPdfFilenames is a private variable and relies on
  // chrome.tabs.onUpdated events to populate.
});
