const {
  injectDownloadButton,
  showToast,
  updateProgressToast,
  onDownloadClicked
} = require('../src/content.js');

describe('Gmail Scraper Content Script', () => {
  beforeEach(() => {
    // Clear the DOM and mock functions before each test
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('injectDownloadButton', () => {
    it('should inject download button if search form exists', () => {
      document.body.innerHTML = '<form role="search"></form>';
      injectDownloadButton();
      
      const btn = document.getElementById('scrapper-download-btn');
      expect(btn).not.toBeNull();
      expect(btn.classList.contains('scrapper-dl-btn')).toBe(true);
    });

    it('should not inject button if search form does not exist', () => {
      injectDownloadButton();
      
      const btn = document.getElementById('scrapper-download-btn');
      expect(btn).toBeNull();
    });

    it('should inject button based on input[name="q"] inside a parent element', () => {
      document.body.innerHTML = '<div><input name="q"></input></div>';
      injectDownloadButton();
      
      const btn = document.getElementById('scrapper-download-btn');
      expect(btn).not.toBeNull();
    });

    it('should inject button based on input[name="q"] inside a form', () => {
      document.body.innerHTML = '<form><input name="q"></input></form>';
      injectDownloadButton();
      
      const btn = document.getElementById('scrapper-download-btn');
      expect(btn).not.toBeNull();
    });

    it('should not inject button twice if it already exists', () => {
      document.body.innerHTML = '<form role="search"></form>';
      injectDownloadButton();
      const initialBtnCount = document.querySelectorAll('#scrapper-download-btn').length;
      injectDownloadButton(); // Call again
      const finalBtnCount = document.querySelectorAll('#scrapper-download-btn').length;
      expect(initialBtnCount).toBe(1);
      expect(finalBtnCount).toBe(1);
    });

    it('should position the button next to search form', () => {
      document.body.innerHTML = '<form role="search"></form>';
      const searchForm = document.querySelector('form[role="search"]');
      
      // Mock getBoundingClientRect
      searchForm.getBoundingClientRect = jest.fn(() => ({
        top: 10,
        right: 100,
        width: 200,
        height: 40
      }));

      injectDownloadButton();
      
      const btn = document.getElementById('scrapper-download-btn');
      expect(btn.style.display).toBe('flex');
      expect(btn.style.top).toBe('10px');
      expect(btn.style.left).toBe('115px');
    });
  });

  describe('showToast', () => {
    it('should create and display a success toast', () => {
      jest.useFakeTimers();
      showToast('Success message');
      
      const container = document.getElementById('scrapper-toast-container');
      expect(container).not.toBeNull();
      
      const toast = container.querySelector('.scrapper-toast.success');
      expect(toast).not.toBeNull();
      expect(toast.innerText).toBe('Success message');
      
      jest.advanceTimersByTime(20);
      expect(toast.classList.contains('show')).toBe(true);
      
      jest.advanceTimersByTime(4000);
      expect(toast.classList.contains('show')).toBe(false);
      
      jest.advanceTimersByTime(300);
      expect(document.querySelector('.scrapper-toast.success')).toBeNull();
      
      jest.useRealTimers();
    });
    
    it('should create and display an error toast', () => {
      showToast('Error message', true);
      const toast = document.querySelector('.scrapper-toast.error');
      expect(toast).not.toBeNull();
      expect(toast.innerText).toBe('Error message');
    });

    it('should reuse existing toast container', () => {
      document.body.innerHTML = '<div id="scrapper-toast-container"></div>';
      showToast('Message');
      const containers = document.querySelectorAll('#scrapper-toast-container');
      expect(containers.length).toBe(1);
    });
  });

  describe('updateProgressToast', () => {
    it('should show progress spinner when not completed', () => {
      updateProgressToast('Processing...');
      const pToast = document.getElementById('scrapper-progress-toast');
      expect(pToast).not.toBeNull();
      expect(pToast.classList.contains('progress')).toBe(true);
      expect(pToast.innerHTML).toContain('scrapper-spinner');
    });

    it('should show completion state without spinner', () => {
      jest.useFakeTimers();
      updateProgressToast('Done', true);
      const pToast = document.querySelector('.scrapper-toast.success.show');
      expect(pToast).not.toBeNull();
      expect(pToast.innerHTML).toBe('Done');
      
      jest.advanceTimersByTime(4000);
      expect(pToast.classList.contains('show')).toBe(false);
      
      jest.advanceTimersByTime(300);
      expect(document.getElementById('scrapper-progress-toast')).toBeNull();
      jest.useRealTimers();
    });
  });

  describe('onDownloadClicked', () => {
    it('should show error toast if no emails are selected', async () => {
      document.body.innerHTML = '<table><tr class="zA"><td><div role="checkbox" aria-checked="false"></div></td></tr></table>';
      
      await onDownloadClicked();
      
      const toast = document.querySelector('.scrapper-toast.error');
      expect(toast).not.toBeNull();
      expect(toast.innerText).toBe('Please select at least one email to download.');
    });

    it('should process explicitly selected emails', async () => {
      document.body.innerHTML = `
        <table>
          <tr class="zA" data-legacy-thread-id="12345">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td><span class="bog">Test Email Subject</span></td>
          </tr>
        </table>
      `;
      
      await onDownloadClicked();
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GENERATE_PDF' }),
        expect.any(Function)
      );
      
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('th=12345'));
    });
    
    it('should fall back to reading view context if no emails selected', async () => {
      // Simulate reading view
      window.history.pushState({}, 'Test Title', '#inbox/1234567890abcdef');
      document.body.innerHTML = `
        <div role="main">
          <h2 class="hP">Reading View Subject</h2>
          <div data-legacy-thread-id="abcdef123456"></div>
        </div>
      `;
      
      await onDownloadClicked();
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GENERATE_PDF' }),
        expect.any(Function)
      );
    });

    it('should extract thread ID from URL links if no data attributes exist', async () => {
      document.body.innerHTML = `
        <table>
          <tr class="zA">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td><a href="#inbox/abcde1234567890">Link</a></td>
            <td><span class="bog">Link Subject</span></td>
          </tr>
        </table>
      `;
      
      await onDownloadClicked();
      
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('th=abcde1234567890'));
    });

    it('should skip row if no thread ID can be extracted', async () => {
      // Suppress expected console.error to keep test output clean
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      document.body.innerHTML = `
        <table>
          <tr class="zA">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td><span class="bog">No ID Subject</span></td>
          </tr>
        </table>
      `;
      
      await onDownloadClicked();
      
      // Fetch shouldn't be called if we couldn't extract an ID
      expect(global.fetch).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not extract thread/message ID'),
        expect.any(Object)
      );
      
      consoleSpy.mockRestore();
    });

    it('should fall back to URL parsing if DOM thread ID fails and handle empty title', async () => {
      window.history.pushState({}, 'Test Title', '#inbox/1234567890abcdef');
      document.title = ''; // Cover || "No Subject"
      document.body.innerHTML = `
        <div role="main">
        </div>
      `;
      
      await onDownloadClicked();
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GENERATE_PDF' }),
        expect.any(Function)
      );
    });

    it('should ignore reading view fallback if ID is too short', async () => {
      // Suppress expected console.error to keep test output clean
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      window.history.pushState({}, 'Test Title', '#inbox/short123');
      document.body.innerHTML = `
        <div role="main">
        </div>
        <table>
          <tr class="zA">
            <td><div role="checkbox" aria-checked="true"></div></td>
          </tr>
        </table>
      `;
      
      await onDownloadClicked();
      
      expect(global.fetch).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle reading view fallback with empty ID or query params and invalid characters', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      window.history.pushState({}, 'Test Title', '#inbox/'); // Empty possibleId
      document.body.innerHTML = `<div role="main"></div>`;
      await onDownloadClicked();
      
      window.history.pushState({}, 'Test Title', '#inbox/1234567890-invalid'); // Fails regex
      document.body.innerHTML = `<div role="main"></div>`;
      await onDownloadClicked();
      
      window.history.pushState({}, 'Test Title', '#inbox/1234567890abcdef?view=pt'); // ID with query params
      document.body.innerHTML = `<div role="main"></div>`;
      await onDownloadClicked();
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GENERATE_PDF' }),
        expect.any(Function)
      );
      consoleSpy.mockRestore();
    });

    it('should handle fetch errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      document.body.innerHTML = `
        <table>
          <tr class="zA" data-legacy-thread-id="12345">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td><span class="bog">Test Email Subject</span></td>
          </tr>
        </table>
      `;
      global.fetch.mockImplementationOnce(() => Promise.reject(new Error('Network Error')));
      
      await onDownloadClicked();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process thread:'),
        '12345',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('should extract thread ID from URL links, ignoring invalid links, and break loop', async () => {
      document.body.innerHTML = `
        <table>
          <tr class="zA">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td>
              <a href="">Empty Href</a>
              <a>No Href</a>
              <a href="https://google.com">External Link</a>
              <a href="#other/link">Other Hash Link</a>
              <a href="#inbox/short">Link</a>
              <a href="#inbox/abcde1234567890">ValidLink</a>
            </td>
          </tr>
          <tr class="zA">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td><a href="#search/query/search1234567890">SearchLink</a></td>
          </tr>
          <tr class="zA">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td><a href="#all/all1234567890">AllLink</a></td>
          </tr>
          <tr class="zA">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td><a href="#label/label1234567890">LabelLink</a></td>
          </tr>
        </table>
      `;
      
      await onDownloadClicked();
      
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('th=abcde1234567890'));
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('th=search1234567890'));
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('th=all1234567890'));
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('th=label1234567890'));
    });

    it('should extract thread ID from inner element data attributes', async () => {
      document.body.innerHTML = `
        <table>
          <tr class="zA">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td><div data-legacy-thread-id="inner_1234567890"></div></td>
          </tr>
          <tr class="zA">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td><div data-legacy-message-id="inner_msg_1234567890"></div></td>
          </tr>
        </table>
      `;
      await onDownloadClicked();
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('th=inner_1234567890'));
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('th=inner_msg_1234567890'));
    });

    it('should extract thread ID from row ID if no data attributes exist', async () => {
      document.body.innerHTML = `
        <table>
          <tr class="zA" id="bg_1234567890abcdef">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td><span class="bog">ID Subject</span></td>
          </tr>
        </table>
      `;
      await onDownloadClicked();
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('th=1234567890abcdef'));
    });

    it('should handle duplicate attachments with the same uniqueKey', async () => {
      document.body.innerHTML = `
        <table>
          <tr class="zA" data-legacy-thread-id="12345">
            <td><div role="checkbox" aria-checked="true"></div></td>
            <td><span class="bog">Subject</span></td>
          </tr>
        </table>
      `;
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          text: () => Promise.resolve('<html><head></head><body><a href="?view=att&th=123&attid=456">Att 1</a><a href="?view=att&th=123&attid=456">Att 2 duplicate</a><a href="?view=att&th=123">No attid</a><a href="?view=att&attid=789">No msgid</a></body></html>'),
        })
      );
      
      await onDownloadClicked();
      
      const calls = chrome.runtime.sendMessage.mock.calls.filter(call => call[0].type === 'DOWNLOAD_ATTACHMENT');
      expect(calls.length).toBe(2);
    });

    it('should handle runtime.lastError in GENERATE_PDF callback and handle attachment parse error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      document.body.innerHTML = `
        <table>
          <tr class="zA" data-legacy-thread-id="12345">
            <td><div role="checkbox" aria-checked="true"></div></td>
          </tr>
        </table>
      `;
      
      chrome.runtime.sendMessage.mockImplementationOnce((msg, callback) => {
        chrome.runtime.lastError = { message: 'PDF Generation Failed' };
        callback({});
        chrome.runtime.lastError = null;
      });

      // Provide an invalid URL to trigger try-catch block
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          text: () => Promise.resolve('<html><head></head><body><a href="http://%invalid?view=att">Att</a></body></html>'),
        })
      );
      
      await onDownloadClicked();
      
      expect(consoleSpy).toHaveBeenCalledWith({ message: 'PDF Generation Failed' });
      consoleSpy.mockRestore();
    });
  });
});
