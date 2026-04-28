// Mock Chrome Extension API
global.chrome = {
  runtime: {
    sendMessage: jest.fn((message, callback) => {
      if (callback) callback({});
    }),
    lastError: null,
    onMessage: {
      addListener: jest.fn()
    }
  },
  tabs: {
    create: jest.fn((options, callback) => {
      if (callback) callback({ id: 1 });
    }),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    remove: jest.fn()
  },
  debugger: {
    attach: jest.fn((target, version, callback) => {
      if (callback) callback();
    }),
    sendCommand: jest.fn((target, method, params, callback) => {
      if (callback) callback({ data: 'mock-base64-pdf-data' });
    }),
    detach: jest.fn()
  },
  downloads: {
    download: jest.fn((options, callback) => {
      if (callback) callback(123);
    }),
    onDeterminingFilename: {
      addListener: jest.fn()
    }
  }
};

// Mock fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    text: () => Promise.resolve('<html><head></head><body><a href="?view=att&th=123&attid=456">Attachment</a></body></html>'),
  })
);

Object.defineProperty(global.Element.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(value) {
    this.textContent = value;
  }
});
