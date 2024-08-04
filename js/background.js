let blockedSites = [];
let allowedSites = [];
let blockMode = 'block'; // 'block' or 'allow'
let isEnabled = true;

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.storage.sync.get(['blockedSites', 'allowedSites', 'blockMode', 'isEnabled'], function(result) {
  blockedSites = result.blockedSites || [];
  allowedSites = result.allowedSites || [];
  blockMode = result.blockMode || 'block';
  isEnabled = result.isEnabled !== undefined ? result.isEnabled : true;
});

function getUrlWithoutProtocol(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash;
  } catch (e) {
    return url;
  }
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return url;
  }
}

browserAPI.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (!isEnabled) {
      return {cancel: false};
    }

    let url = getUrlWithoutProtocol(details.url);
    let domain = getDomain(details.url);
    
    // Allow requests from the extension itself
    if (details.url.startsWith(browserAPI.runtime.getURL(''))) {
      return {cancel: false};
    }

    // Allow requests to CDNs used by the extension
    if (domain === 'cdn.jsdelivr.net' || domain === 'cdnjs.cloudflare.com') {
      return {cancel: false};
    }

    if (blockMode === 'block') {
      if (blockedSites.some(site => url.startsWith(site) || domain === site)) {
        return {cancel: true};
      }
    } else if (blockMode === 'allow') {
      if (!allowedSites.some(site => url.startsWith(site) || domain === site)) {
        // Check if the request is for the extension's popup or other extension pages
        if (details.url.startsWith(browserAPI.runtime.getURL(''))) {
          return {cancel: false};
        }
        return {cancel: true};
      }
    }

    return {cancel: false};
  },
  {urls: ["<all_urls>"]},
  ["blocking"]
);

browserAPI.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action === "updateSites") {
      if (request.mode === 'block') {
        blockedSites = request.sites;
        browserAPI.storage.sync.set({blockedSites: blockedSites});
      } else {
        allowedSites = request.sites;
        browserAPI.storage.sync.set({allowedSites: allowedSites});
      }
      blockMode = request.mode;
      browserAPI.storage.sync.set({blockMode: blockMode});
      sendResponse({success: true, sites: request.sites});
    } else if (request.action === "toggleExtension") {
      isEnabled = request.isEnabled;
      browserAPI.storage.sync.set({isEnabled: isEnabled});
    }
  }
);

// Optional: Add badge to show current state
function updateBadge() {
  const text = isEnabled ? (blockMode === 'block' ? 'OFF' : 'ALW') : 'ON';
  const color = isEnabled ? '#f44336' : '#4CAF50';
  browserAPI.browserAction.setBadgeText({text: text});
  browserAPI.browserAction.setBadgeBackgroundColor({color: color});
}

// Call updateBadge whenever the state changes
browserAPI.storage.onChanged.addListener(function(changes, namespace) {
  for (let key in changes) {
    if (key === 'isEnabled' || key === 'blockMode') {
      updateBadge();
      break;
    }
  }
});