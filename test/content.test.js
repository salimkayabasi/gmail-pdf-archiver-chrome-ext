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
      
      jest.useRealTimers();
    });
    
    it('should create and display an error toast', () => {
      showToast('Error message', true);
      const toast = document.querySelector('.scrapper-toast.error');
      expect(toast).not.toBeNull();
      expect(toast.innerText).toBe('Error message');
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
      updateProgressToast('Done', true);
      const pToast = document.querySelector('.scrapper-toast.success.show');
      expect(pToast).not.toBeNull();
      expect(pToast.innerHTML).toBe('Done');
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
  });
});
