/**
 * Resilient selectors and DOM patterns for Google Flow / Veo VideoFX UI
 * Grouped logically with fallback chains to accommodate Google UI updates.
 */

export const FlowSelectors = {
  // Authentication & User indicators
  auth: {
    userAvatar: [
      'a[href*="SignOutOptions" i]',
      'a[href*="Logout" i]',
      'a[aria-label*="Google Account" i]',
      'button[aria-label*="Google Account" i]',
      'a[aria-label*="Tài khoản Google" i]',
      'button[aria-label*="Tài khoản Google" i]',
      'img[src*="googleusercontent.com"]',
      'button:has-text("Start Creating")',
      'a:has-text("Start Creating")',
      'div:has-text("PRO")',
    ],
    signInButton: [
      'a:has-text("Sign in")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'a:has-text("Get started")',
    ],
    appHeader: [
      'header',
      '[role="banner"]',
      'nav',
      '[data-testid="flow-nav"]',
    ],
  },

  // Credit balance display
  credits: {
    badgeContainer: [
      '[data-testid="credit-balance"]',
      '[aria-label*="credit" i]',
      '[aria-label*="token" i]',
      'button:has-text("Credits")',
      'div:has-text("Credits")',
      'span:has-text("Credits")',
    ],
    balancePattern: /(\d+[\d,]*)\s*(?:credits?|créditos?|credit|tokens?)/i,
  },

  // Prompt input
  prompt: {
    inputs: [
      'textarea[placeholder*="Describe" i]',
      'textarea[placeholder*="prompt" i]',
      'textarea[placeholder*="tạo gì" i]',
      'textarea[aria-label*="prompt" i]',
      'textarea[aria-label*="tạo gì" i]',
      '[contenteditable="true"][aria-label*="prompt" i]',
      '[contenteditable="true"][aria-label*="tạo gì" i]',
      '[contenteditable="true"][data-placeholder*="tạo gì" i]',
      '[role="textbox"][aria-label*="tạo gì" i]',
      'div.ProseMirror',
      'rich-textarea'
    ],
  },

  // Model selection
  model: {
    dropdownTriggers: [
      'button[aria-haspopup="listbox"]:has-text("Veo")',
      'button[aria-label*="Model" i]',
      'button:has-text("Model")',
      '[data-testid="model-selector"]',
    ],
    optionFast: [
      'div[role="option"]:has-text("Fast")',
      'li:has-text("Fast")',
      'button:has-text("Veo 3.1 Fast")',
      'button:has-text("Fast")',
    ],
    optionQuality: [
      'div[role="option"]:has-text("Quality")',
      'li:has-text("Quality")',
      'button:has-text("Veo 3.1 Quality")',
      'button:has-text("Quality")',
    ],
  },

  // Aspect ratio selection
  aspectRatio: {
    ratio916: [
      'button[aria-label*="9:16"]',
      'button:has-text("9:16")',
      'button:has-text("Portrait")',
      '[data-value="9:16"]',
      '[data-testid="aspect-9-16"]',
    ],
    ratio169: [
      'button[aria-label*="16:9"]',
      'button:has-text("16:9")',
      'button:has-text("Landscape")',
      '[data-value="16:9"]',
      '[data-testid="aspect-16-9"]',
    ],
    ratio11: [
      'button[aria-label*="1:1"]',
      'button:has-text("1:1")',
      'button:has-text("Square")',
      '[data-value="1:1"]',
      '[data-testid="aspect-1-1"]',
    ],
  },

  // Generation submission
  generate: {
    submitButtons: [
      'button[type="submit"]:not([disabled])',
      'button:has-text("Generate"):not([disabled])',
      'button:has-text("Create"):not([disabled])',
      'button[aria-label*="Generate" i]:not([disabled])',
      'button[aria-label*="Create video" i]:not([disabled])',
      'button[aria-label*="Send" i]:not([disabled])',
      'button[aria-label*="Gửi" i]:not([disabled])',
      'button:has-text("Submit"):not([disabled])',
      'button:has(:text("arrow_forward")):not([disabled])',
      'button:has(:text("send")):not([disabled])',
    ],
    approveButtons: [
      'button:has-text("Luôn phê duyệt")',
      'button:has-text("Always approve")',
      'button:has-text("Phê duyệt")',
      'button:has-text("Approve")',
      'div[role="button"]:has-text("Luôn phê duyệt")',
      'div[role="button"]:has-text("Always approve")',
      'div[role="button"]:has-text("Phê duyệt")',
      'div[role="button"]:has-text("Approve")',
      'div.button-content:has-text("Luôn phê duyệt")',
      'div.button-content:has-text("Phê duyệt")'
    ],
  },

  // Generation progress & completion
  generationStatus: {
    generatingIndicators: [
      '[role="progressbar"]',
      '.spinner',
      '[data-testid="generating-indicator"]',
      ':has-text("Generating...")',
      ':has-text("Creating video...")',
      ':has-text("Rendering...")',
    ],
    completedVideo: [
      'video[src]:not([src=""])',
      'video source[src]',
      '[data-testid="generated-video-player"] video',
      'video',
    ],
    downloadButtons: [
      'a[download]',
      'button[aria-label*="Download" i]',
      'button:has-text("Download")',
      '[data-testid="download-video-button"]',
      'button:has(svg[aria-label*="Download" i])',
    ],
    // NOT '.error-message': Flow uses it inside <flow-error-tile> for ONE failed clip, which must not abort a whole batch
    errorMessage: [
      '[role="alert"]',
      ':has-text("Generation failed")',
      ':has-text("Policy violation")',
      ':has-text("Unable to generate")',
    ],
  },
};
