/**
 * PinSearch · Client Application
 * Nitter-style 100% In-Site Real-time Pinterest Search Engine
 * Features: Video Player & Infinite Load More with Smart Expansion
 */

(function () {
  'use strict';

  // --- State ---
  const state = {
    currentQuery: '',
    currentBookmark: '',
    currentPage: 1,
    currentFilter: 'all', // 'all' | 'video' | 'image'
    hasMore: true,
    isLoading: false,
    isFirstSearchDone: false,
    currentPins: [],
    savedPins: JSON.parse(localStorage.getItem('pinsearch_saved_pins') || '[]'),
    recentQueries: JSON.parse(localStorage.getItem('pinsearch_recent_queries') || '[]'),
    activePinIndex: -1,
    activePin: null,
    isSavedViewActive: false,
    excludeAi: localStorage.getItem('pinsearch_exclude_ai') === 'true',
    isAlgorithmFeedActive: false,
    algorithmPage: 1,
    userInterests: JSON.parse(localStorage.getItem('pinsearch_user_interests') || '{}')
  };

  // --- DOM Elements ---
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-btn');
  const suggestionsPopover = document.getElementById('suggestions-popover');
  const suggestionsList = document.getElementById('suggestions-list');
  const recentQueriesList = document.getElementById('recent-queries-list');
  const brandLogo = document.getElementById('brand-logo');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeIconSun = document.getElementById('theme-icon-sun');
  const themeIconMoon = document.getElementById('theme-icon-moon');
  const navAlgorithmBtn = document.getElementById('nav-algorithm-btn');
  const navSavedBtn = document.getElementById('nav-saved-btn');
  const savedCounter = document.getElementById('saved-counter');

  const heroSection = document.getElementById('hero-section');
  const statusBar = document.getElementById('status-bar');
  const statusQueryText = document.getElementById('status-query-text');
  const statusCount = document.getElementById('status-count');
  const statusSpeed = document.getElementById('status-speed');
  const statusCacheBadge = document.getElementById('status-cache-badge');
  const guidesBar = document.getElementById('guides-bar');
  const guidesList = document.getElementById('guides-list');
  const trendingChips = document.getElementById('trending-chips');
  const chipAlgorithm = document.getElementById('chip-algorithm');

  // Filter Tabs
  const filterTabs = document.getElementById('filter-tabs');
  const filterAllBtn = document.getElementById('filter-all-btn');
  const filterVideoBtn = document.getElementById('filter-video-btn');
  const filterImageBtn = document.getElementById('filter-image-btn');
  const filterAiBtn = document.getElementById('filter-ai-btn');
  const aiStatusPill = document.getElementById('ai-status-pill');
  const countAll = document.getElementById('count-all');
  const countVideo = document.getElementById('count-video');
  const countImage = document.getElementById('count-image');

  const loadingSpinner = document.getElementById('loading-spinner');
  const errorBanner = document.getElementById('error-banner');
  const errorMessage = document.getElementById('error-message');
  const retryBtn = document.getElementById('retry-btn');
  const emptyBanner = document.getElementById('empty-banner');

  const resultsSection = document.getElementById('results-section');
  const pinsGrid = document.getElementById('pins-grid');
  const loadMoreContainer = document.getElementById('load-more-container');
  const loadMoreBtn = document.getElementById('load-more-btn');

  const savedSection = document.getElementById('saved-section');
  const savedGrid = document.getElementById('saved-grid');
  const savedEmpty = document.getElementById('saved-empty');
  const clearSavedBtn = document.getElementById('clear-saved-btn');
  const backToSearchBtn = document.getElementById('back-to-search-btn');

  // Modal elements
  const pinModal = document.getElementById('pin-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalImgWrapper = document.getElementById('modal-img-wrapper');
  const modalImg = document.getElementById('modal-img');
  const modalVideo = document.getElementById('modal-video');
  const modalZoomHint = document.getElementById('modal-zoom-hint');
  const modalVideoSoundBtn = document.getElementById('modal-video-sound-btn');
  const modalTypeBadge = document.getElementById('modal-type-badge');
  const modalTitle = document.getElementById('modal-title');
  const modalDesc = document.getElementById('modal-desc');
  const modalCreatorAvatar = document.getElementById('modal-creator-avatar');
  const modalCreatorName = document.getElementById('modal-creator-name');
  const modalBoardName = document.getElementById('modal-board-name');
  const modalDimensions = document.getElementById('modal-dimensions');
  const modalColorSwatch = document.getElementById('modal-color-swatch');
  const modalColorHex = document.getElementById('modal-color-hex');
  const modalSaveBtn = document.getElementById('modal-save-btn');
  const modalSaveText = document.getElementById('modal-save-text');
  const modalDownloadBtn = document.getElementById('modal-download-btn');
  const modalPinterestLink = document.getElementById('modal-pinterest-link');
  const modalSourceLink = document.getElementById('modal-source-link');
  const modalSourceDomain = document.getElementById('modal-source-domain');
  const modalCopyInsiteBtn = document.getElementById('modal-copy-insite-btn');
  const modalRelatedGrid = document.getElementById('modal-related-grid');
  const relatedLoadingSpinner = document.getElementById('related-loading-spinner');

  // User Profile Modal elements
  const userProfileModal = document.getElementById('user-profile-modal');
  const userModalCloseBtn = document.getElementById('user-modal-close-btn');
  const userCoverBanner = document.getElementById('user-cover-banner');
  const userAvatar = document.getElementById('user-avatar');
  const userFullname = document.getElementById('user-fullname');
  const userUsername = document.getElementById('user-username');
  const userAbout = document.getElementById('user-about');
  const statPins = document.getElementById('stat-pins');
  const statBoards = document.getElementById('stat-boards');
  const statFollowers = document.getElementById('stat-followers');
  const statFollowing = document.getElementById('stat-following');
  const userTabPins = document.getElementById('user-tab-pins');
  const userTabBoards = document.getElementById('user-tab-boards');
  const userTabPinsCount = document.getElementById('user-tab-pins-count');
  const userTabBoardsCount = document.getElementById('user-tab-boards-count');
  const boardDrilldownHeader = document.getElementById('board-drilldown-header');
  const boardBackBtn = document.getElementById('board-back-btn');
  const boardActiveName = document.getElementById('board-active-name');
  const boardActiveCount = document.getElementById('board-active-count');
  const userModalLoading = document.getElementById('user-modal-loading');
  const userPinsGrid = document.getElementById('user-pins-grid');
  const userBoardsGrid = document.getElementById('user-boards-grid');
  const modalCreatorProfileBtn = document.getElementById('modal-creator-profile-btn');

  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  let currentHls = null;

  // --- Initialization ---
  initTheme();
  initAiFilter();
  updateSavedBadge();
  setupEventListeners();
  renderRecentQueries();
  checkInitialRoute();

  // --- Theme Handler ---
  function initTheme() {
    const savedTheme = localStorage.getItem('pinsearch_theme') || 'theme-light';
    document.body.className = savedTheme;
    updateThemeIcons(savedTheme);
  }

  function toggleTheme() {
    const isDark = document.body.classList.contains('theme-dark');
    const newTheme = isDark ? 'theme-light' : 'theme-dark';
    document.body.className = newTheme;
    localStorage.setItem('pinsearch_theme', newTheme);
    updateThemeIcons(newTheme);
  }

  function updateThemeIcons(theme) {
    if (theme === 'theme-dark') {
      themeIconSun.classList.remove('hidden');
      themeIconMoon.classList.add('hidden');
    } else {
      themeIconSun.classList.add('hidden');
      themeIconMoon.classList.remove('hidden');
    }
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    themeToggleBtn.addEventListener('click', toggleTheme);

    brandLogo.addEventListener('click', (e) => {
      e.preventDefault();
      resetToHome();
    });

    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = searchInput.value.trim();
      if (q) performSearch(q, false);
      hideSuggestions();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.isComposing) return;
        e.preventDefault();
        const q = searchInput.value.trim();
        if (q) performSearch(q, false);
        hideSuggestions();
      }
    });

    searchInput.addEventListener('input', () => {
      const val = searchInput.value.trim();
      if (val) {
        clearBtn.classList.remove('hidden');
        debounceFetchSuggestions(val);
      } else {
        clearBtn.classList.add('hidden');
        showRecentSuggestions();
      }
    });

    searchInput.addEventListener('focus', () => {
      const val = searchInput.value.trim();
      if (val) debounceFetchSuggestions(val);
      else showRecentSuggestions();
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.classList.add('hidden');
      searchInput.focus();
      showRecentSuggestions();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        hideSuggestions();
      }
    });

    trendingChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip) {
        const query = chip.dataset.query;
        searchInput.value = query;
        clearBtn.classList.remove('hidden');
        performSearch(query, false);
      }
    });

    retryBtn.addEventListener('click', () => {
      if (state.isAlgorithmFeedActive) loadAlgorithmFeed(false);
      else if (state.currentQuery) performSearch(state.currentQuery, false);
    });

    // Unstoppable "더 불러오기" Button Click
    loadMoreBtn.addEventListener('click', () => {
      if (!state.isLoading) {
        if (state.isAlgorithmFeedActive) {
          state.algorithmPage++;
          loadAlgorithmFeed(true);
        } else {
          state.currentPage++;
          performSearch(state.currentQuery, true);
        }
      }
    });

    // Navigation & Algorithm feed
    if (navAlgorithmBtn) {
      navAlgorithmBtn.addEventListener('click', () => {
        toggleSavedView(false);
        loadAlgorithmFeed(false);
      });
    }

    if (chipAlgorithm) {
      chipAlgorithm.addEventListener('click', () => {
        loadAlgorithmFeed(false);
      });
    }

    // AI Filter toggle
    if (filterAiBtn) {
      filterAiBtn.addEventListener('click', () => {
        toggleAiFilter();
      });
    }

    // Saved Pins view toggles
    navSavedBtn.addEventListener('click', () => {
      toggleSavedView();
    });

    backToSearchBtn.addEventListener('click', () => {
      toggleSavedView(false);
    });

    clearSavedBtn.addEventListener('click', () => {
      if (confirm('저장된 보관함의 모든 핀을 삭제하시겠습니까?')) {
        state.savedPins = [];
        savePinsToStorage();
        renderSavedGrid();
        updateSavedBadge();
        showToast('보관함이 비워졌습니다.');
      }
    });

    // Filter Tabs Event Listeners
    if (filterAllBtn) filterAllBtn.addEventListener('click', () => setFilter('all'));
    if (filterVideoBtn) filterVideoBtn.addEventListener('click', () => setFilter('video'));
    if (filterImageBtn) filterImageBtn.addEventListener('click', () => setFilter('image'));

    // Video Sound Toggle Overlay Button
    if (modalVideoSoundBtn) {
      modalVideoSoundBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modalVideo.muted = !modalVideo.muted;
        const icon = modalVideoSoundBtn.querySelector('.sound-icon');
        const label = modalVideoSoundBtn.querySelector('.sound-label');
        if (modalVideo.muted) {
          icon.textContent = '🔇';
          label.textContent = '소리 켜기';
          showToast('음소거되었습니다.');
        } else {
          icon.textContent = '🔊';
          label.textContent = '소리 끄기';
          showToast('소리가 켜졌습니다!');
        }
      });
    }

    // Modal Events
    modalCloseBtn.addEventListener('click', () => closeModal());
    pinModal.addEventListener('click', (e) => {
      if (e.target === pinModal) closeModal();
    });

    modalImgWrapper.addEventListener('click', (e) => {
      // If clicking video sound button, handled above
      if (e.target.closest('#modal-video-sound-btn')) return;
      // If clicking on video itself, toggle play/pause smoothly
      if (e.target === modalVideo) {
        if (modalVideo.paused) modalVideo.play().catch(() => {});
        else modalVideo.pause();
        return;
      }
      if (modalImg.classList.contains('hidden')) return;

      const isZoomed = modalImgWrapper.classList.contains('zoomed');
      if (!isZoomed) {
        // Precise close-up at mouse click coordinate
        const rect = modalImg.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const pctX = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
        const pctY = Math.max(0, Math.min(100, (clickY / rect.height) * 100));

        modalImg.style.transformOrigin = `${pctX.toFixed(2)}% ${pctY.toFixed(2)}%`;
        modalImgWrapper.classList.add('zoomed');
        if (modalZoomHint) modalZoomHint.textContent = '🔍 클릭하여 축소 (마우스 이동 시 탐색)';
      } else {
        // Zoom out to normal
        modalImgWrapper.classList.remove('zoomed');
        modalImg.style.transformOrigin = 'center center';
        if (modalZoomHint) modalZoomHint.textContent = '🔍 클릭한 위치로 고화질 확대';
      }
    });

    // While zoomed in, smoothly glide and explore details with mouse movements
    modalImgWrapper.addEventListener('mousemove', (e) => {
      if (!modalImgWrapper.classList.contains('zoomed') || modalImg.classList.contains('hidden')) return;
      const wrapperRect = modalImgWrapper.getBoundingClientRect();
      const mouseX = e.clientX - wrapperRect.left;
      const mouseY = e.clientY - wrapperRect.top;
      const pctX = Math.max(0, Math.min(100, (mouseX / wrapperRect.width) * 100));
      const pctY = Math.max(0, Math.min(100, (mouseY / wrapperRect.height) * 100));
      modalImg.style.transformOrigin = `${pctX.toFixed(2)}% ${pctY.toFixed(2)}%`;
    });

    modalSaveBtn.addEventListener('click', () => {
      if (!state.activePin) return;
      togglePinSaved(state.activePin);
      updateModalSaveButton(state.activePin);
    });

    modalCopyInsiteBtn.addEventListener('click', () => {
      if (!state.activePin) return;
      const insiteUrl = `${window.location.origin}${window.location.pathname}#pin/${state.activePin.id}`;
      navigator.clipboard.writeText(insiteUrl).then(() => {
        showToast('사이트 내 핀 링크가 복사되었습니다! (외부 차단 없이 접속 가능)');
      }).catch(() => {
        showToast('링크 복사 실패');
      });
    });

    // Modal Creator Row Click -> Open In-Site Profile
    if (modalCreatorProfileBtn) {
      modalCreatorProfileBtn.addEventListener('click', () => {
        if (state.activePin?.pinner?.username) {
          openUserProfile(state.activePin.pinner.username);
        }
      });
    }

    // User Profile Modal Events
    if (userModalCloseBtn) userModalCloseBtn.addEventListener('click', closeUserProfileModal);
    if (userProfileModal) {
      userProfileModal.addEventListener('click', (e) => {
        if (e.target === userProfileModal) closeUserProfileModal();
      });
    }
    if (userTabPins) userTabPins.addEventListener('click', () => switchUserTab('pins'));
    if (userTabBoards) userTabBoards.addEventListener('click', () => switchUserTab('boards'));
    if (boardBackBtn) {
      boardBackBtn.addEventListener('click', () => {
        boardDrilldownHeader.classList.add('hidden');
        userPinsGrid.classList.add('hidden');
        userBoardsGrid.classList.remove('hidden');
      });
    }

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (userProfileModal && !userProfileModal.classList.contains('hidden')) {
          closeUserProfileModal();
          return;
        }
        if (!pinModal.classList.contains('hidden')) {
          closeModal();
          return;
        }
      }
      if (!pinModal.classList.contains('hidden')) {
        if (e.key === 'ArrowRight') navigateModal(1);
        if (e.key === 'ArrowLeft') navigateModal(-1);
      }
    });

    // Hash routing listener for deep-linking
    window.addEventListener('hashchange', checkInitialRoute);

    // Infinite scroll observer
    const scrollObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !state.isLoading && state.isFirstSearchDone && !state.isSavedViewActive) {
        if (state.isAlgorithmFeedActive) {
          state.algorithmPage++;
          loadAlgorithmFeed(true);
        } else if (state.currentQuery) {
          state.currentPage++;
          performSearch(state.currentQuery, true);
        }
      }
    }, { rootMargin: '400px' });
    scrollObserver.observe(loadMoreContainer);
  }

  // --- Hash Route Checker (Deep Link #pin/:id or Initial Algorithm Feed) ---
  async function checkInitialRoute() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#pin/')) {
      const pinId = hash.replace('#pin/', '').trim();
      if (!pinId) return;

      let pin = state.currentPins.find(p => p.id === pinId) || state.savedPins.find(p => p.id === pinId);
      if (pin) {
        openModal(pin, state.currentPins.indexOf(pin), false);
        return;
      }

      try {
        const res = await fetch(`/api/pin/${pinId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.pin) {
            openModal(data.pin, -1, false);
          }
        }
      } catch {
        // ignore
      }
    } else {
      if (!pinModal.classList.contains('hidden')) {
        closeModal(false);
      }
      if (!state.isFirstSearchDone && !state.currentQuery) {
        loadAlgorithmFeed(false);
      }
    }
  }

  // --- Reset to Home (Switches to Personalized Algorithm Feed) ---
  function resetToHome() {
    state.currentQuery = '';
    state.currentBookmark = '';
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    toggleSavedView(false);
    if (window.location.hash) {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    loadAlgorithmFeed(false);
  }

  // --- Real-time Search Execution with Infinite Load More & Strict Deduplication ---
  async function performSearch(query, isPagination = false) {
    if (!query || state.isLoading) return;

    state.isLoading = true;
    state.isSavedViewActive = false;
    state.isAlgorithmFeedActive = false;
    if (navAlgorithmBtn) navAlgorithmBtn.classList.remove('active');
    savedSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    if (!isPagination) {
      recordUserInterest(query, 3);
      state.currentQuery = query;
      state.currentBookmark = '';
      state.currentPage = 1;
      state.currentPins = [];
      pinsGrid.innerHTML = '';
      heroSection.classList.add('hidden');
      errorBanner.classList.add('hidden');
      emptyBanner.classList.add('hidden');
      loadingSpinner.classList.remove('hidden');
      guidesBar.classList.add('hidden');
      loadMoreContainer.classList.add('hidden');
      addRecentQuery(query);
    } else {
      loadMoreBtn.querySelector('.btn-text').textContent = '새로운 정보를 더 불러오는 중...';
      const spinner = loadMoreBtn.querySelector('.btn-spinner');
      if (spinner) spinner.classList.remove('hidden');
    }

    try {
      const url = `/api/search?q=${encodeURIComponent(query)}&bookmark=${encodeURIComponent(state.currentBookmark || '')}&page=${state.currentPage}&filter=${state.currentFilter}&excludeAi=${state.excludeAi}`;
      const res = await fetch(url);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `서버 오류 (${res.status})`);
      }

      const data = await res.json();
      loadingSpinner.classList.add('hidden');

      if (!isPagination && (!data.pins || data.pins.length === 0)) {
        emptyBanner.classList.remove('hidden');
        statusBar.classList.add('hidden');
        return;
      }

      // Filter out duplicate pins strictly (both ID and image hash)
      const existingIds = new Set(state.currentPins.map(p => p.id));
      const existingHashes = new Set(state.currentPins.map(p => p.imageHash || getImageHash(p.images?.orig)).filter(Boolean));
      
      const freshPins = (data.pins || []).filter(p => {
        if (existingIds.has(p.id)) return false;
        const hash = p.imageHash || getImageHash(p.images?.orig);
        if (hash && existingHashes.has(hash)) return false;
        if (state.excludeAi && p.isAi) return false;
        return true;
      });

      if (isPagination) {
        if (freshPins.length === 0) {
          // If all pins in this response were duplicates, automatically fetch next page to keep seeking fresh content
          state.currentPage++;
          performSearch(state.currentQuery, true);
          return;
        }
        state.isFirstSearchDone = true;
        state.currentBookmark = data.nextBookmark || '';
        state.hasMore = true;
        state.currentPins.push(...freshPins);

        let toRender = freshPins;
        if (state.excludeAi) toRender = toRender.filter(p => !p.isAi);
        if (state.currentFilter === 'video') {
          toRender = freshPins.filter(p => p.isVideo);
        } else if (state.currentFilter === 'image') {
          toRender = freshPins.filter(p => !p.isVideo);
        }
        if (toRender.length > 0) {
          renderPins(toRender);
        }
      } else {
        state.isFirstSearchDone = true;
        state.currentBookmark = data.nextBookmark || '';
        state.hasMore = true;
        let pinsToKeep = freshPins.length > 0 ? freshPins : (data.pins || []);
        if (state.excludeAi) pinsToKeep = pinsToKeep.filter(p => !p.isAi);
        state.currentPins = pinsToKeep;
        applyFilterToGrid();
      }

      updateFilterCounts();

      // Render Status Bar
      renderStatusBar(data, isPagination);

      // Render Guides Pills if available
      if (!isPagination && data.guides && data.guides.length > 0) {
        renderGuides(data.guides);
      }

      // Always show Load More button so the user can continuously fetch more pins
      loadMoreContainer.classList.remove('hidden');
      loadMoreBtn.querySelector('.btn-text').textContent = '새로운 핀 더 불러오기 (Load More)';
      const spinner = loadMoreBtn.querySelector('.btn-spinner');
      if (spinner) spinner.classList.add('hidden');

      if (isPagination && data.expandedQuery) {
        showToast(`'${data.expandedQuery}' 관련 새로운 핀 ${freshPins.length}개를 추가로 불러왔습니다!`);
      }

    } catch (err) {
      console.error('Search failed:', err);
      loadingSpinner.classList.add('hidden');
      if (!isPagination) {
        errorBanner.classList.remove('hidden');
        errorMessage.textContent = err.message || '핀터레스트에서 실시간 결과를 가져오는 중 문제가 발생했습니다.';
      } else {
        showToast('추가 결과를 불러오는 데 실패했습니다.');
        loadMoreBtn.querySelector('.btn-text').textContent = '다시 시도';
        const spinner = loadMoreBtn.querySelector('.btn-spinner');
        if (spinner) spinner.classList.add('hidden');
      }
    } finally {
      state.isLoading = false;
    }
  }

  // --- Filter Management ---
  function setFilter(filterType) {
    if (state.currentFilter === filterType) return;
    state.currentFilter = filterType;

    // Update active tab styles
    [filterAllBtn, filterVideoBtn, filterImageBtn].forEach(btn => {
      if (!btn) return;
      if (btn.dataset.filter === filterType) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    // If user selects 'video' but there are few videos loaded, search specifically for videos
    const videoCount = state.currentPins.filter(p => p.isVideo).length;
    if (filterType === 'video' && videoCount < 4 && state.currentQuery) {
      performSearch(state.currentQuery, false);
      return;
    }

    applyFilterToGrid();
  }

  function updateFilterCounts() {
    const total = state.currentPins.length;
    const videoTotal = state.currentPins.filter(p => p.isVideo).length;
    const imageTotal = total - videoTotal;

    if (countAll) countAll.textContent = total;
    if (countVideo) countVideo.textContent = videoTotal;
    if (countImage) countImage.textContent = imageTotal;
  }

  function applyFilterToGrid() {
    pinsGrid.innerHTML = '';
    let filtered = state.currentPins;
    if (state.excludeAi) {
      filtered = filtered.filter(p => !p.isAi);
    }
    if (state.currentFilter === 'video') {
      filtered = filtered.filter(p => p.isVideo);
    } else if (state.currentFilter === 'image') {
      filtered = filtered.filter(p => !p.isVideo);
    }

    if (filtered.length === 0) {
      if (state.currentFilter === 'video') {
        pinsGrid.innerHTML = `
          <div style="column-span: all; text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <div style="font-size: 40px; margin-bottom: 12px;">🎬</div>
            <h3 style="font-size: 18px; color: var(--text-main); margin-bottom: 6px;">현재 불러온 핀 중 동영상이 없습니다</h3>
            <p style="font-size: 14px;">하단의 '새로운 핀 더 불러오기'를 누르시면 자동으로 관련 동영상들을 추가 탐색합니다.</p>
          </div>
        `;
      } else if (state.excludeAi) {
        pinsGrid.innerHTML = `
          <div style="column-span: all; text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <div style="font-size: 40px; margin-bottom: 12px;">🛡️</div>
            <h3 style="font-size: 18px; color: var(--text-main); margin-bottom: 6px;">AI 핀을 제외하고 나니 표시할 핀이 없습니다</h3>
            <p style="font-size: 14px;">하단의 '새로운 핀 더 불러오기'를 누르면 실제 사진과 비AI 핀을 계속 추가 수집합니다.</p>
          </div>
        `;
      }
    } else {
      renderPins(filtered);
    }
  }

  // --- Render Status Bar ---
  function renderStatusBar(data, isPagination) {
    statusBar.classList.remove('hidden');
    statusQueryText.textContent = `"${state.currentQuery}"`;
    statusCount.textContent = `${state.currentPins.length}개 핀 수집됨`;
    statusSpeed.textContent = `${data.queryTimeMs || 350}ms`;

    if (data.fallbackUsed || data.expandedQuery) {
      statusCacheBadge.textContent = '스마트 다중 키워드 최적화';
      statusCacheBadge.classList.remove('hidden');
    } else if (data.fromCache) {
      statusCacheBadge.textContent = '캐시 로드';
      statusCacheBadge.classList.remove('hidden');
    } else {
      statusCacheBadge.classList.add('hidden');
    }
  }

  // --- Render Guides (Pinterest Subtopics) ---
  function renderGuides(guides) {
    guidesList.innerHTML = '';
    guides.forEach(g => {
      const pill = document.createElement('div');
      pill.className = 'guide-pill';
      pill.innerHTML = `
        ${g.thumbnail ? `<img src="${g.thumbnail}" class="guide-thumb" alt="${g.display}">` : ''}
        <span>${escapeHtml(g.display)}</span>
      `;
      pill.addEventListener('click', () => {
        searchInput.value = g.term;
        clearBtn.classList.remove('hidden');
        performSearch(g.term, false);
      });
      guidesList.appendChild(pill);
    });
    guidesBar.classList.remove('hidden');
  }

  // --- Render Pins to Masonry Grid (with Video Badge support) ---
  function renderPins(pins, targetGrid = pinsGrid, isInsideModal = false) {
    const fragment = document.createDocumentFragment();

    pins.forEach((pin) => {
      const isSaved = isPinSaved(pin.id);

      const card = document.createElement('div');
      card.className = 'pin-card';
      card.dataset.id = pin.id;

      const aspectRatio = pin.aspectRatio || 0.67;
      const paddingBottom = `${(1 / aspectRatio) * 100}%`;
      const dominantBg = pin.dominantColor || '#374151';

      card.innerHTML = `
        <div class="pin-image-wrapper" style="padding-bottom: ${paddingBottom}; background-color: ${dominantBg};">
          ${pin.isVideo ? `
            <div class="video-badge" title="🎬 동영상 핀 (클릭 시 재생)">
              <span class="video-play-icon">▶</span>
              <span class="video-text-tag">동영상</span>
              <span class="video-duration-tag">${escapeHtml(pin.video?.durationFormatted || '재생')}</span>
            </div>
            <div class="pin-video-center-play" title="동영상 재생">
              <svg viewBox="0 0 24 24" width="22" height="22"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </div>
          ` : ''}
          ${(!state.excludeAi && pin.isAi) ? `
            <div class="card-ai-badge" title="AI 생성 이미지 (AI 필터 활성화 시 숨김 가능)">
              <span class="card-ai-icon">🤖</span>
              <span>AI</span>
            </div>
          ` : ''}
          <img 
            class="pin-image" 
            src="${pin.images?.medium || pin.images?.orig}" 
            alt="${escapeHtml(pin.title)}"
            loading="lazy"
          />
          <div class="pin-overlay">
            <div class="overlay-top">
              <button class="overlay-btn save-btn ${isSaved ? 'is-saved' : ''}" title="보관함에 저장" data-action="save">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
              </button>
              <button class="overlay-btn" title="사이트 내에서 크게 보기" data-action="view">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  <line x1="11" y1="8" x2="11" y2="14"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
              </button>
            </div>
            <div class="overlay-bottom">
              <div class="overlay-title">${escapeHtml(pin.title)}</div>
              <div class="overlay-meta">
                <span class="overlay-domain">${pin.isVideo ? '🎬 동영상' : (escapeHtml(pin.domain || '핀터레스트 핀'))}</span>
                <a href="/api/download?url=${encodeURIComponent(pin.isVideo ? (pin.video?.rawUrl || '') : (pin.images?.orig || ''))}&filename=${encodeURIComponent(pin.title)}" class="overlay-btn" title="다운로드" data-action="download">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
        <div class="pin-card-footer">
          <div class="card-footer-top-row">
            ${pin.isVideo ? `<span class="card-type-pill video">🎬 동영상</span>` : `<span class="card-type-pill image">📷 사진</span>`}
            <div class="card-footer-title">${escapeHtml(pin.title)}</div>
          </div>
          <div class="card-footer-creator" data-action="creator" title="크리에이터 프로필 & 컬렉션 보드 보기">
            ${pin.pinner?.avatar ? `<img src="${pin.pinner.avatar}" class="card-creator-avatar" alt="${escapeHtml(pin.pinner.fullName)}">` : ''}
            <span class="card-creator-name">${escapeHtml(pin.pinner?.fullName || pin.pinner?.username || 'Pinterest User')}</span>
          </div>
        </div>
      `;

      const img = card.querySelector('.pin-image');
      img.onload = () => img.classList.add('loaded');
      img.onerror = () => {
        if (img.src !== pin.images?.orig) {
          img.src = pin.images?.orig;
        }
      };

      card.addEventListener('click', (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (actionEl) {
          const action = actionEl.dataset.action;
          if (action === 'creator') {
            e.stopPropagation();
            const username = pin.pinner?.username;
            if (username) {
              openUserProfile(username);
            }
            return;
          }
          if (action === 'save') {
            e.stopPropagation();
            togglePinSaved(pin);
            updateCardSaveBtn(actionEl, pin);
            return;
          }
          if (action === 'download') {
            e.stopPropagation();
            return;
          }
        }
        openModal(pin, state.currentPins.indexOf(pin));
      });

      fragment.appendChild(card);
    });

    targetGrid.appendChild(fragment);
  }

  // --- Modal Logic (with Video Playback & Hls.js support) ---
  function openModal(pin, index, updateHash = true) {
    state.activePin = pin;
    state.activePinIndex = index;
    modalImgWrapper.classList.remove('zoomed');
    modalImg.style.transformOrigin = 'center center';
    if (modalZoomHint) modalZoomHint.textContent = '🔍 클릭한 위치로 고화질 확대';

    if (updateHash && pin.id) {
      window.location.hash = `pin/${pin.id}`;
    }

    const scrollArea = pinModal.querySelector('.modal-scroll-area');
    if (scrollArea) scrollArea.scrollTop = 0;

    // Reset previous video playback
    if (currentHls) {
      currentHls.destroy();
      currentHls = null;
    }
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modalVideo.load();

    // Video vs Image display
    if (pin.isVideo && pin.video?.streamUrl) {
      modalImg.classList.add('hidden');
      modalZoomHint.classList.add('hidden');
      modalVideo.classList.remove('hidden');

      if (modalTypeBadge) {
        modalTypeBadge.className = 'modal-type-badge video';
        modalTypeBadge.innerHTML = '<span class="type-icon">🎬</span><span class="type-text">실시간 동영상</span>';
      }

      if (modalVideoSoundBtn) {
        modalVideoSoundBtn.classList.remove('hidden');
        modalVideoSoundBtn.querySelector('.sound-icon').textContent = '🔇';
        modalVideoSoundBtn.querySelector('.sound-label').textContent = '소리 켜기';
      }

      modalVideo.muted = true; // Essential for modern browser unblocked autoplay!
      modalVideo.setAttribute('playsinline', '');

      const videoStreamUrl = pin.video.streamUrl;

      if (window.Hls && Hls.isSupported() && videoStreamUrl.includes('.m3u8')) {
        currentHls = new Hls({
          enableWorker: false,
          lowLatencyMode: false,
          backBufferLength: 90
        });
        currentHls.loadSource(videoStreamUrl);
        currentHls.attachMedia(modalVideo);
        currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
          modalVideo.play().catch(err => {
            console.log('Autoplay deferred, user interaction required:', err);
          });
        });
        currentHls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                currentHls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                currentHls.recoverMediaError();
                break;
              default:
                currentHls.destroy();
                break;
            }
          }
        });
      } else if (modalVideo.canPlayType('application/vnd.apple.mpegurl')) {
        modalVideo.src = videoStreamUrl;
        modalVideo.play().catch(() => {});
      } else {
        modalVideo.src = videoStreamUrl;
      }

      modalDownloadBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>고화질 동영상 다운로드 (Stream)</span>
      `;
      modalDownloadBtn.href = `/api/download?url=${encodeURIComponent(pin.video.rawUrl)}&filename=${encodeURIComponent(pin.title || 'pinterest-video')}`;
    } else {
      modalVideo.classList.add('hidden');
      modalImg.classList.remove('hidden');
      modalZoomHint.classList.remove('hidden');
      if (modalVideoSoundBtn) modalVideoSoundBtn.classList.add('hidden');

      if (modalTypeBadge) {
        if (pin.isAi) {
          modalTypeBadge.className = 'modal-type-badge ai';
          modalTypeBadge.innerHTML = '<span class="type-icon">🤖</span><span class="type-text">AI 생성 이미지</span>';
        } else {
          modalTypeBadge.className = 'modal-type-badge image';
          modalTypeBadge.innerHTML = '<span class="type-icon">📷</span><span class="type-text">고화질 사진</span>';
        }
      }

      modalImg.src = pin.images?.large || pin.images?.orig;
      modalImg.alt = pin.title;

      modalDownloadBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>고화질 원본 다운로드</span>
      `;
      modalDownloadBtn.href = `/api/download?url=${encodeURIComponent(pin.images?.orig || '')}&filename=${encodeURIComponent(pin.title || 'pinterest-image')}`;
    }

    modalTitle.textContent = pin.title || '제목 없는 핀';
    modalDesc.textContent = pin.description || '';

    // Creator
    modalCreatorAvatar.src = pin.pinner?.avatar || '/api/image?url=https%3A%2F%2Fs.pinimg.com%2Fimages%2Fuser%2Fdefault_75.png';
    modalCreatorName.textContent = pin.pinner?.fullName || pin.pinner?.username || 'Pinterest User';
    modalBoardName.textContent = pin.board?.name ? `보드: ${pin.board.name}` : '핀터레스트 보드';

    // Meta (dimensions & color)
    modalDimensions.textContent = `${pin.width || '원본'} × ${pin.height || '고화질'}${pin.isVideo ? ' (동영상)' : ''}`;
    modalColorHex.textContent = pin.dominantColor || '#333333';
    modalColorSwatch.style.backgroundColor = pin.dominantColor || '#333333';

    modalPinterestLink.href = pin.externalPinterestUrl || `https://www.pinterest.com/pin/${pin.id}/`;

    if (pin.sourceLink && !pin.sourceLink.includes('pinterest.com')) {
      modalSourceLink.href = pin.sourceLink;
      modalSourceDomain.textContent = pin.domain || '원문 출처 웹사이트';
      modalSourceLink.classList.remove('hidden');
    } else {
      modalSourceLink.classList.add('hidden');
    }

    updateModalSaveButton(pin);

    // Record interest for personalized feed algorithm
    recordPinView(pin);

    // Show modal
    pinModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Fetch in-site related pins
    fetchRelatedPins(pin);
  }

  function closeModal(updateHash = true) {
    if (currentHls) {
      currentHls.destroy();
      currentHls = null;
    }
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modalVideo.load();
    modalVideo.classList.add('hidden');
    if (modalVideoSoundBtn) modalVideoSoundBtn.classList.add('hidden');
    modalImg.classList.remove('hidden');
    modalImgWrapper.classList.remove('zoomed');
    modalImg.style.transformOrigin = 'center center';
    if (modalZoomHint) modalZoomHint.textContent = '🔍 클릭한 위치로 고화질 확대';

    pinModal.classList.add('hidden');
    modalImg.src = '';
    state.activePin = null;
    state.activePinIndex = -1;
    document.body.style.overflow = '';
    modalRelatedGrid.innerHTML = '';

    if (updateHash && window.location.hash.startsWith('#pin/')) {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
  }

  function navigateModal(direction) {
    const list = state.isSavedViewActive ? state.savedPins : state.currentPins;
    if (!list || list.length === 0) return;

    let newIndex = state.activePinIndex + direction;
    if (newIndex < 0) newIndex = list.length - 1;
    if (newIndex >= list.length) newIndex = 0;

    openModal(list[newIndex], newIndex);
  }

  // --- Fetch In-Site Truly Relevant Related Pins (100% Strict Deduplication) ---
  let currentRelatedFetchId = 0;
  async function fetchRelatedPins(pin) {
    const fetchId = ++currentRelatedFetchId;
    modalRelatedGrid.innerHTML = '';
    relatedLoadingSpinner.classList.remove('hidden');

    const origImage = pin.images?.orig || pin.images?.large || '';
    const origHash = pin.imageHash || getImageHash(origImage);

    const params = new URLSearchParams();
    if (pin.id) params.set('pinId', pin.id);
    if (pin.board?.id) params.set('boardId', pin.board.id);
    if (pin.title && pin.title !== '제목 없는 핀') params.set('title', pin.title);
    if (pin.seoAltText) params.set('alt', pin.seoAltText);
    if (state.currentQuery) params.set('q', state.currentQuery);
    if (origImage) params.set('currentImage', origImage);
    if (state.excludeAi) params.set('excludeAi', 'true');

    try {
      const res = await fetch(`/api/related?${params.toString()}`);
      if (fetchId !== currentRelatedFetchId) return; // Stale request cancelled
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (fetchId !== currentRelatedFetchId) return;
      relatedLoadingSpinner.classList.add('hidden');

      const seenIds = new Set([String(pin.id)]);
      const seenHashes = new Set();
      if (origHash) seenHashes.add(origHash);

      const filtered = [];
      for (const p of (data.pins || [])) {
        if (!p || !p.id) continue;
        const pid = String(p.id);
        if (seenIds.has(pid)) continue;
        seenIds.add(pid);

        const pHash = p.imageHash || getImageHash(p.images?.orig || p.images?.medium);
        if (pHash && seenHashes.has(pHash)) continue;
        if (pHash) seenHashes.add(pHash);

        if (state.excludeAi && p.isAi) continue;
        filtered.push(p);
      }

      if (filtered.length > 0) {
        renderPins(filtered, modalRelatedGrid, true);
      } else {
        modalRelatedGrid.innerHTML = `
          <div style="column-span: all; text-align: center; padding: 24px 0; color: var(--text-muted); font-size: 13px;">
            유사한 연관 핀을 모두 확인했습니다.
          </div>
        `;
      }
    } catch {
      if (fetchId === currentRelatedFetchId) {
        relatedLoadingSpinner.classList.add('hidden');
      }
    }
  }

  function updateModalSaveButton(pin) {
    const isSaved = isPinSaved(pin.id);
    if (isSaved) {
      modalSaveBtn.classList.add('is-saved');
      modalSaveText.textContent = '저장됨 ✓';
    } else {
      modalSaveBtn.classList.remove('is-saved');
      modalSaveText.textContent = '저장';
    }
  }

  function updateCardSaveBtn(btn, pin) {
    const isSaved = isPinSaved(pin.id);
    if (isSaved) {
      btn.classList.add('is-saved');
      btn.querySelector('svg').setAttribute('fill', 'currentColor');
    } else {
      btn.classList.remove('is-saved');
      btn.querySelector('svg').setAttribute('fill', 'none');
    }
  }

  // --- Saved Pins (Favorites) Management ---
  function isPinSaved(pinId) {
    return state.savedPins.some(p => p.id === pinId);
  }

  function togglePinSaved(pin) {
    const idx = state.savedPins.findIndex(p => p.id === pin.id);
    if (idx >= 0) {
      state.savedPins.splice(idx, 1);
      showToast('보관함에서 제거되었습니다.');
    } else {
      state.savedPins.unshift(pin);
      showToast('보관함에 저장되었습니다!');
    }
    savePinsToStorage();
    updateSavedBadge();

    document.querySelectorAll(`.pin-card[data-id="${pin.id}"] .save-btn`).forEach(b => {
      updateCardSaveBtn(b, pin);
    });

    if (state.isSavedViewActive) {
      renderSavedGrid();
    }
  }

  function savePinsToStorage() {
    localStorage.setItem('pinsearch_saved_pins', JSON.stringify(state.savedPins));
  }

  function updateSavedBadge() {
    const count = state.savedPins.length;
    if (count > 0) {
      savedCounter.textContent = count > 99 ? '99+' : count;
      savedCounter.classList.remove('hidden');
    } else {
      savedCounter.classList.add('hidden');
    }
  }

  function toggleSavedView(forceState) {
    state.isSavedViewActive = forceState !== undefined ? forceState : !state.isSavedViewActive;

    if (state.isSavedViewActive) {
      heroSection.classList.add('hidden');
      statusBar.classList.add('hidden');
      guidesBar.classList.add('hidden');
      resultsSection.classList.add('hidden');
      errorBanner.classList.add('hidden');
      emptyBanner.classList.add('hidden');
      savedSection.classList.remove('hidden');
      renderSavedGrid();
    } else {
      savedSection.classList.add('hidden');
      if (state.isFirstSearchDone) {
        resultsSection.classList.remove('hidden');
        statusBar.classList.remove('hidden');
        if (guidesList.children.length > 0) guidesBar.classList.remove('hidden');
      } else {
        heroSection.classList.remove('hidden');
      }
    }
  }

  function renderSavedGrid() {
    savedGrid.innerHTML = '';
    if (state.savedPins.length === 0) {
      savedEmpty.classList.remove('hidden');
      return;
    }
    savedEmpty.classList.add('hidden');
    renderPins(state.savedPins, savedGrid);
  }

  // --- Search Suggestions & Recent History ---
  let debounceTimer = null;
  function debounceFetchSuggestions(q) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchSuggestions(q);
    }, 180);
  }

  async function fetchSuggestions(q) {
    try {
      const res = await fetch(`/api/suggestions?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = await res.json();
      renderSuggestions(data.suggestions || []);
    } catch {
      // ignore
    }
  }

  function renderSuggestions(list) {
    suggestionsList.innerHTML = '';
    if (list.length === 0) {
      hideSuggestions();
      return;
    }

    list.forEach(item => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span>${escapeHtml(item)}</span>
      `;
      div.addEventListener('click', () => {
        searchInput.value = item;
        clearBtn.classList.remove('hidden');
        hideSuggestions();
        performSearch(item, false);
      });
      suggestionsList.appendChild(div);
    });

    suggestionsPopover.classList.remove('hidden');
  }

  function showRecentSuggestions() {
    if (state.recentQueries.length === 0) {
      hideSuggestions();
      return;
    }
    renderRecentQueries();
    suggestionsList.innerHTML = '';
    suggestionsPopover.classList.remove('hidden');
  }

  function hideSuggestions() {
    suggestionsPopover.classList.add('hidden');
  }

  function addRecentQuery(q) {
    state.recentQueries = [q, ...state.recentQueries.filter(item => item !== q)].slice(0, 10);
    localStorage.setItem('pinsearch_recent_queries', JSON.stringify(state.recentQueries));
    renderRecentQueries();
  }

  function renderRecentQueries() {
    recentQueriesList.innerHTML = '';
    state.recentQueries.forEach(q => {
      const tag = document.createElement('button');
      tag.className = 'recent-tag';
      tag.textContent = q;
      tag.addEventListener('click', () => {
        searchInput.value = q;
        clearBtn.classList.remove('hidden');
        hideSuggestions();
        performSearch(q, false);
      });
      recentQueriesList.appendChild(tag);
    });
  }

  // --- In-Site Creator Profile & Collections/Boards System ---
  let activeProfileUser = null;
  let activeProfilePins = [];
  let activeProfileBoards = [];
  let currentUserActiveTab = 'pins'; // 'pins' | 'boards'

  async function openUserProfile(username) {
    if (!username) return;
    activeProfileUser = username;
    currentUserActiveTab = 'pins';

    // Show modal & set loading state
    userProfileModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    userModalLoading.classList.remove('hidden');
    boardDrilldownHeader.classList.add('hidden');
    userPinsGrid.innerHTML = '';
    userBoardsGrid.innerHTML = '';
    userTabPins.classList.add('active');
    userTabBoards.classList.remove('active');
    userPinsGrid.classList.remove('hidden');
    userBoardsGrid.classList.add('hidden');

    userUsername.textContent = `@${username}`;
    userFullname.textContent = username;
    userAbout.textContent = '';
    userAvatar.src = '/api/image?url=https%3A%2F%2Fs.pinimg.com%2Fimages%2Fuser%2Fdefault_75.png';
    userCoverBanner.style.backgroundImage = '';
    statPins.textContent = '-';
    statBoards.textContent = '-';
    statFollowers.textContent = '-';
    statFollowing.textContent = '-';
    userTabPinsCount.textContent = '0';
    userTabBoardsCount.textContent = '0';

    try {
      // 1. Fetch user profile metadata
      const profilePromise = fetch(`/api/user/${encodeURIComponent(username)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data || !data.profile) return;
          const p = data.profile;
          userFullname.textContent = p.fullName || p.username;
          userUsername.textContent = `@${p.username}`;
          if (p.avatar) userAvatar.src = p.avatar;
          if (p.cover) userCoverBanner.style.backgroundImage = `url('${p.cover}')`;
          userAbout.textContent = p.about || '';
          statPins.textContent = formatStatNumber(p.pinCount);
          statBoards.textContent = formatStatNumber(p.boardCount);
          statFollowers.textContent = formatStatNumber(p.followerCount);
          statFollowing.textContent = formatStatNumber(p.followingCount);
          userTabPinsCount.textContent = formatStatNumber(p.pinCount);
          userTabBoardsCount.textContent = formatStatNumber(p.boardCount);
        })
        .catch(err => console.error('Profile info error:', err));

      // 2. Fetch user's created pins
      const pinsPromise = fetch(`/api/user/${encodeURIComponent(username)}/pins`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          activeProfilePins = data?.pins || [];
          if (currentUserActiveTab === 'pins') {
            renderPins(activeProfilePins, userPinsGrid, true);
          }
          if (activeProfilePins.length > 0 && statPins.textContent === '-') {
            statPins.textContent = formatStatNumber(activeProfilePins.length);
            userTabPinsCount.textContent = formatStatNumber(activeProfilePins.length);
          }
        })
        .catch(err => console.error('Profile pins error:', err));

      // 3. Fetch user's boards
      const boardsPromise = fetch(`/api/user/${encodeURIComponent(username)}/boards`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          activeProfileBoards = data?.boards || [];
          renderBoards(activeProfileBoards, userBoardsGrid);
          if (activeProfileBoards.length > 0 && statBoards.textContent === '-') {
            statBoards.textContent = formatStatNumber(activeProfileBoards.length);
            userTabBoardsCount.textContent = formatStatNumber(activeProfileBoards.length);
          }
        })
        .catch(err => console.error('Profile boards error:', err));

      await Promise.allSettled([profilePromise, pinsPromise, boardsPromise]);
    } catch (err) {
      console.error('User profile overall error:', err);
    } finally {
      userModalLoading.classList.add('hidden');
    }
  }

  function renderBoards(boards, container) {
    container.innerHTML = '';
    if (!boards || boards.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 50px 0;">
          <div style="font-size: 32px; margin-bottom: 8px;">📂</div>
          <div style="font-size: 15px; font-weight: 700;">생성된 공개 보드가 없습니다.</div>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    boards.forEach(b => {
      const card = document.createElement('div');
      card.className = 'board-card';
      const mainCover = b.cover || (b.thumbnails && b.thumbnails[0]) || '';
      const thumb1 = b.thumbnails && b.thumbnails[1] ? b.thumbnails[1] : '';
      const thumb2 = b.thumbnails && b.thumbnails[2] ? b.thumbnails[2] : '';

      card.innerHTML = `
        <div class="board-card-collage">
          ${mainCover ? `<img src="${mainCover}" class="board-collage-main" alt="${escapeHtml(b.name)}" loading="lazy">` : `<div class="board-collage-main" style="background:#ddd;"></div>`}
          <div class="board-collage-side">
            ${thumb1 ? `<img src="${thumb1}" class="board-collage-thumb" alt="" loading="lazy">` : `<div style="background:#e8e8e8;"></div>`}
            ${thumb2 ? `<img src="${thumb2}" class="board-collage-thumb" alt="" loading="lazy">` : `<div style="background:#eee;"></div>`}
          </div>
        </div>
        <div class="board-card-info">
          <div class="board-card-title">${escapeHtml(b.name)}</div>
          <div class="board-card-count">${formatStatNumber(b.pinCount)}개의 핀 · 클릭하여 열람</div>
        </div>
      `;

      card.addEventListener('click', () => {
        openBoardPins(b.id, b.name, b.pinCount);
      });

      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  }

  async function openBoardPins(boardId, boardName, pinCount) {
    boardDrilldownHeader.classList.remove('hidden');
    boardActiveName.textContent = boardName;
    boardActiveCount.textContent = `${formatStatNumber(pinCount)}개의 핀`;

    userBoardsGrid.classList.add('hidden');
    userPinsGrid.classList.remove('hidden');
    userPinsGrid.innerHTML = '';
    userModalLoading.classList.remove('hidden');

    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}/pins`);
      if (res.ok) {
        const data = await res.json();
        const pins = data.pins || [];
        if (pins.length === 0) {
          userPinsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 50px 0;">
              <div style="font-size: 32px; margin-bottom: 8px;">📌</div>
              <div style="font-size: 15px; font-weight: 700;">이 보드에 포함된 핀이 없습니다.</div>
            </div>
          `;
        } else {
          renderPins(pins, userPinsGrid, true);
        }
      }
    } catch (err) {
      console.error('Error fetching board pins:', err);
    } finally {
      userModalLoading.classList.add('hidden');
    }
  }

  function switchUserTab(tab) {
    currentUserActiveTab = tab;
    boardDrilldownHeader.classList.add('hidden');

    if (tab === 'pins') {
      userTabPins.classList.add('active');
      userTabBoards.classList.remove('active');
      userBoardsGrid.classList.add('hidden');
      userPinsGrid.classList.remove('hidden');
      if (activeProfilePins.length > 0) {
        renderPins(activeProfilePins, userPinsGrid, true);
      }
    } else {
      userTabBoards.classList.add('active');
      userTabPins.classList.remove('active');
      userPinsGrid.classList.add('hidden');
      userBoardsGrid.classList.remove('hidden');
      if (activeProfileBoards.length > 0) {
        renderBoards(activeProfileBoards, userBoardsGrid);
      }
    }
  }

  function closeUserProfileModal() {
    userProfileModal.classList.add('hidden');
    if (pinModal.classList.contains('hidden')) {
      document.body.style.overflow = '';
    }
  }

  function formatStatNumber(num) {
    if (num == null) return '0';
    const n = Number(num);
    if (isNaN(n)) return String(num);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString();
  }

  // --- Image Hash Extraction for Client-Side Deduplication ---
  function getImageHash(url) {
    if (!url || typeof url !== 'string') return '';
    const decoded = url.includes('/api/image?url=') ? decodeURIComponent(url.split('/api/image?url=')[1]) : url;
    const match = decoded.match(/\/([a-f0-9]{20,40}|[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{20,40})\.(jpg|png|webp|gif)/i);
    if (match) return match[1].replace(/\//g, '');
    const clean = decoded.split('?')[0].split('/').pop();
    return clean || '';
  }

  // --- AI Filter Management ---
  function initAiFilter() {
    updateAiFilterUI();
  }

  function toggleAiFilter() {
    state.excludeAi = !state.excludeAi;
    localStorage.setItem('pinsearch_exclude_ai', state.excludeAi);
    updateAiFilterUI();

    if (state.excludeAi) {
      showToast('🛡️ AI 생성 이미지를 제외하고 실제 사진/창작물만 표시합니다.');
    } else {
      showToast('AI 필터가 해제되었습니다 (전체 핀 표시).');
    }

    if (state.isAlgorithmFeedActive) {
      loadAlgorithmFeed(false);
    } else if (state.currentQuery) {
      performSearch(state.currentQuery, false);
    } else {
      loadAlgorithmFeed(false);
    }
  }

  function updateAiFilterUI() {
    if (!filterAiBtn || !aiStatusPill) return;
    if (state.excludeAi) {
      filterAiBtn.classList.add('active-ai');
      aiStatusPill.textContent = 'ON';
    } else {
      filterAiBtn.classList.remove('active-ai');
      aiStatusPill.textContent = 'OFF';
    }
  }

  // --- User Viewing History & Interest Profiling ---
  function recordUserInterest(term, weight = 1) {
    if (!term || typeof term !== 'string') return;
    const clean = term.replace(/[#@]/g, '').trim();
    if (clean.length < 2) return;
    if (['추천', '모음', '인기', '꿀팁', '사진', '이미지', '동영상', 'wallpaper', 'photo'].includes(clean)) return;

    state.userInterests[clean] = (state.userInterests[clean] || 0) + weight;
    const entries = Object.entries(state.userInterests);
    if (entries.length > 40) {
      entries.sort((a, b) => b[1] - a[1]);
      state.userInterests = Object.fromEntries(entries.slice(0, 40));
    }
    localStorage.setItem('pinsearch_user_interests', JSON.stringify(state.userInterests));
  }

  function recordPinView(pin) {
    if (!pin) return;
    if (pin.title && pin.title !== '제목 없는 핀') {
      const words = pin.title.split(/\s+/).filter(w => w.length >= 2);
      if (words.length > 0) {
        recordUserInterest(words.slice(0, 2).join(' '), 2);
      }
    }
    if (pin.board?.name && pin.board.name !== 'Board') {
      recordUserInterest(pin.board.name, 2);
    }
  }

  function getUserTopInterests(limit = 4) {
    const entries = Object.entries(state.userInterests || {});
    if (entries.length === 0) return [];
    entries.sort((a, b) => b[1] - a[1]);
    return entries.slice(0, limit).map(e => e[0]);
  }

  // --- Personalized Algorithm Feed ---
  async function loadAlgorithmFeed(isAppend = false) {
    if (state.isLoading) return;
    state.isLoading = true;
    state.isAlgorithmFeedActive = true;
    state.isSavedViewActive = false;
    state.currentQuery = '';
    searchInput.value = '';
    clearBtn.classList.add('hidden');

    if (navAlgorithmBtn) navAlgorithmBtn.classList.add('active');
    savedSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    guidesBar.classList.add('hidden');

    if (!isAppend) {
      state.algorithmPage = 1;
      state.currentPins = [];
      pinsGrid.innerHTML = '';
      heroSection.classList.add('hidden');
      errorBanner.classList.add('hidden');
      emptyBanner.classList.add('hidden');
      loadingSpinner.classList.remove('hidden');
      loadMoreContainer.classList.add('hidden');
    } else {
      loadMoreBtn.querySelector('.btn-text').textContent = '맞춤 알고리즘 핀을 더 불러오는 중...';
      const spinner = loadMoreBtn.querySelector('.btn-spinner');
      if (spinner) spinner.classList.remove('hidden');
    }

    const topTopics = getUserTopInterests(4);
    const topicsParam = encodeURIComponent(topTopics.join(','));

    try {
      const url = `/api/algorithm-feed?topics=${topicsParam}&page=${state.algorithmPage}&filter=${state.currentFilter}&excludeAi=${state.excludeAi}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('알고리즘 피드 로드 실패');
      const data = await res.json();
      loadingSpinner.classList.add('hidden');

      state.isFirstSearchDone = true;
      state.hasMore = true;

      const existingIds = new Set(state.currentPins.map(p => p.id));
      const existingHashes = new Set(state.currentPins.map(p => p.imageHash).filter(Boolean));
      const freshPins = (data.pins || []).filter(p => {
        if (state.excludeAi && p.isAi) return false;
        if (existingIds.has(p.id)) return false;
        if (p.imageHash && existingHashes.has(p.imageHash)) return false;
        return true;
      });

      if (isAppend) {
        state.currentPins.push(...freshPins);
        let toRender = freshPins;
        if (state.currentFilter === 'video') toRender = freshPins.filter(p => p.isVideo);
        else if (state.currentFilter === 'image') toRender = freshPins.filter(p => !p.isVideo);
        if (toRender.length > 0) renderPins(toRender);
      } else {
        state.currentPins = freshPins.length > 0 ? freshPins : (data.pins || []);
        applyFilterToGrid();
      }

      updateFilterCounts();

      // Render personalized status bar
      statusBar.classList.remove('hidden');
      if (topTopics.length > 0) {
        statusQueryText.innerHTML = `<span class="algorithm-active-tag">🎯 맞춤 알고리즘</span> "${topTopics.slice(0, 3).join(', ')}" 기반`;
        statusCount.textContent = `${state.currentPins.length}개 핀 추천됨 (시청 기록 분석)`;
      } else {
        statusQueryText.innerHTML = `<span class="algorithm-active-tag">✨ 탐색 피드</span> 트렌딩 컬렉션`;
        statusCount.textContent = `${state.currentPins.length}개 핀 추천됨 (핀을 클릭할수록 내 취향으로 학습)`;
      }
      statusSpeed.textContent = `실시간 피드`;
      statusCacheBadge.classList.add('hidden');

      // Show load more
      loadMoreContainer.classList.remove('hidden');
      loadMoreBtn.querySelector('.btn-text').textContent = '새로운 맞춤 핀 더 불러오기 (Load More)';
      const spinner = loadMoreBtn.querySelector('.btn-spinner');
      if (spinner) spinner.classList.add('hidden');

      if (isAppend) {
        showToast(`맞춤 추천 핀 ${freshPins.length}개를 추가로 불러왔습니다!`);
      }
    } catch (err) {
      console.error('Algorithm feed error:', err);
      loadingSpinner.classList.add('hidden');
      if (!isAppend) {
        errorBanner.classList.remove('hidden');
        errorMessage.textContent = '맞춤 알고리즘 피드를 불러오는 데 실패했습니다.';
      } else {
        showToast('추가 피드를 불러오지 못했습니다.');
      }
    } finally {
      state.isLoading = false;
    }
  }

  // --- Toast Helper ---
  let toastTimer = null;
  function showToast(msg) {
    toastMessage.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2400);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
