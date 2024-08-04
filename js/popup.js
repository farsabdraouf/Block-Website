const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', function() {
  let sitesTextArea = document.getElementById('sitesList');
  let updateButton = document.getElementById('updateButton');
  let blockModeSelect = document.getElementById('blockMode');
  let toggleExtensionButton = document.getElementById('toggleExtension');
  let addCurrentSiteDiv = document.getElementById('addCurrentSite');
  let notificationDiv = document.getElementById('notification');
  let currentUrl, currentDomain;

  // Load saved data
  browserAPI.storage.sync.get(['blockedSites', 'allowedSites', 'blockMode', 'isEnabled'], function(result) {
    updateSitesList(result);
    updateToggleButton(result.isEnabled);
    updateBlockModeSelect(result.blockMode);
  });

  // Get current tab URL
  browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0] && tabs[0].url) {
      currentUrl = getUrlWithoutProtocol(tabs[0].url);
      currentDomain = getDomain(tabs[0].url);
      if (isRegularWebPage(tabs[0].url)) {
        updateAddCurrentSiteButtons();
      } else {
        addCurrentSiteDiv.style.display = 'none';
      }
    }
  });

  function isRegularWebPage(url) {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  function updateSitesList(result) {
    if (result.blockMode === 'allow') {
      sitesTextArea.value = (result.allowedSites || []).join('\n');
      blockModeSelect.value = 'allow';
    } else {
      sitesTextArea.value = (result.blockedSites || []).join('\n');
      blockModeSelect.value = 'block';
    }
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0] && tabs[0].url && isRegularWebPage(tabs[0].url)) {
        updateAddCurrentSiteButtons();
      } else {
        addCurrentSiteDiv.style.display = 'none';
      }
    });
  }

  function updateAddCurrentSiteButtons() {
    chrome.storage.sync.get('blockMode', function(result) {
      const blockMode = result.blockMode || 'block';
      addCurrentSiteDiv.innerHTML = `
        <p class="mb-2">هل تريد إضافة الموقع الحالي إلى القائمة؟</p>
        <div class="btn-group-vertical w-100" role="group">
          ${blockMode === 'block' ? `
            <button id="addPageToBlock" class="btn btn-outline-danger btn-sm mb-1">
              <i class="fas fa-ban me-1"></i> إضافة الصفحة للحظر
            </button>
            <button id="addSiteToBlock" class="btn btn-outline-danger btn-sm mb-1">
              <i class="fas fa-globe me-1"></i> إضافة الموقع للحظر
            </button>
          ` : `
            <button id="addPageToAllow" class="btn btn-outline-success btn-sm mb-1">
              <i class="fas fa-check-circle me-1"></i> إضافة الصفحة للسماح
            </button>
            <button id="addSiteToAllow" class="btn btn-outline-success btn-sm mb-1">
              <i class="fas fa-globe me-1"></i> إضافة الموقع للسماح
            </button>
          `}
          <button id="dontAdd" class="btn btn-outline-secondary btn-sm">
            <i class="fas fa-times me-1"></i> لا شكرًا
          </button>
        </div>
      `;
      addCurrentSiteDiv.style.display = 'block';

      if (blockMode === 'block') {
        document.getElementById('addPageToBlock').addEventListener('click', () => addSiteToList(currentUrl, 'block'));
        document.getElementById('addSiteToBlock').addEventListener('click', () => addSiteToList(currentDomain, 'block'));
      } else {
        document.getElementById('addPageToAllow').addEventListener('click', () => addSiteToList(currentUrl, 'allow'));
        document.getElementById('addSiteToAllow').addEventListener('click', () => addSiteToList(currentDomain, 'allow'));
      }
      document.getElementById('dontAdd').addEventListener('click', () => addCurrentSiteDiv.style.display = 'none');
    });
  }

  function updateToggleButton(isEnabled) {
    toggleExtensionButton.className = isEnabled ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-success';
    toggleExtensionButton.innerHTML = isEnabled ? 
      '<i class="fas fa-power-off me-1"></i> إيقاف' : 
      '<i class="fas fa-power-off me-1"></i> تشغيل';
  }

  function updateBlockModeSelect(mode) {
    blockModeSelect.value = mode;
  }

  function addSiteToList(site, listType) {
    chrome.storage.sync.get(['blockedSites', 'allowedSites', 'blockMode'], function(result) {
      let sites = listType === 'block' ? result.blockedSites || [] : result.allowedSites || [];
      if (!sites.includes(site)) {
        sites.push(site);
        let updateObj = {};
        updateObj[listType === 'block' ? 'blockedSites' : 'allowedSites'] = sites;
        
        chrome.storage.sync.set(updateObj, function() {
          updateSitesList({
            blockedSites: listType === 'block' ? sites : result.blockedSites,
            allowedSites: listType === 'allow' ? sites : result.allowedSites,
            blockMode: listType
          });
          showNotification(`تمت إضافة ${site} إلى قائمة ${listType === 'block' ? 'الحظر' : 'السماح'}.`, 'success');
        });
      } else {
        showNotification(`${site} موجود بالفعل في القائمة.`, 'warning');
      }
    });
  }
  // Update button click handler
  updateButton.addEventListener('click', function() {
    let sites = sitesTextArea.value.split('\n')
      .map(site => site.trim())
      .filter(site => site !== '');
    
    let mode = blockModeSelect.value;

    let sitesWithPaths = sites.filter(site => site.includes('/'));
    if (sitesWithPaths.length > 0) {
      showConfirmDialog('تم العثور على روابط تحتوي على مسارات محددة. هل تريد تطبيق القواعد على النطاقات الرئيسية فقط؟', function(confirmed) {
        if (confirmed) {
          sites = sites.map(site => {
            try {
              let url = new URL(site.startsWith('http') ? site : 'http://' + site);
              return url.hostname.replace(/^www\./, '');
            } catch (e) {
              return site;
            }
          });
        }
        sites = [...new Set(sites)];
        updateSites(sites, mode);
      });
    } else {
      updateSites(sites, mode);
    }
  });

  function updateSites(sites, mode) {
    browserAPI.runtime.sendMessage({action: "updateSites", sites: sites, mode: mode}, function(response) {
      if (response && response.success) {
        updateSitesList({
          blockedSites: mode === 'block' ? sites : [],
          allowedSites: mode === 'allow' ? sites : [],
          blockMode: mode
        });
        showNotification('تم تحديث القائمة بنجاح!', 'success');
      } else {
        showNotification('حدث خطأ أثناء تحديث القائمة.', 'danger');
      }
    });
  }

  // Toggle extension
  toggleExtensionButton.addEventListener('click', function() {
    browserAPI.storage.sync.get('isEnabled', function(result) {
      let newState = !result.isEnabled;
      browserAPI.storage.sync.set({isEnabled: newState}, function() {
        updateToggleButton(newState);
        browserAPI.runtime.sendMessage({action: "toggleExtension", isEnabled: newState});
        showNotification(newState ? 'تم تفعيل الإضافة' : 'تم إيقاف الإضافة', newState ? 'success' : 'warning');
      });
    });
  });

  function showNotification(message, type = 'info') {
    notificationDiv.className = `alert alert-${type}`;
    notificationDiv.textContent = message;
    notificationDiv.style.display = 'block';
    setTimeout(() => {
      notificationDiv.style.display = 'none';
    }, 3000);
  }

  function showConfirmDialog(message, callback) {
    let dialog = document.createElement('div');
    dialog.className = 'modal fade show';
    dialog.style.display = 'block';
    dialog.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">تأكيد</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p>${message}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">لا</button>
            <button type="button" class="btn btn-primary">نعم</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    dialog.querySelector('.btn-close').addEventListener('click', () => {
      dialog.remove();
      callback(false);
    });
    
    dialog.querySelector('.btn-secondary').addEventListener('click', () => {
      dialog.remove();
      callback(false);
    });
    
    dialog.querySelector('.btn-primary').addEventListener('click', () => {
      dialog.remove();
      callback(true);
    });
  }

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

  // إضافة مستمع لتغيير وضع الحظر
  blockModeSelect.addEventListener('change', function() {
    chrome.storage.sync.get(['blockedSites', 'allowedSites'], function(result) {
      updateSitesList({
        blockedSites: result.blockedSites,
        allowedSites: result.allowedSites,
        blockMode: blockModeSelect.value
      });
      chrome.storage.sync.set({blockMode: blockModeSelect.value});
    });
  });
});