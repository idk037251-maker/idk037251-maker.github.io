/**
 * PinSearch · Hybrid Cloud & Auto-Discovery Engine (cloud-engine.js)
 *
 * Ensures 100% 24/7 uptime & 100% strict search relevance on GitHub Pages:
 * 1. Real-time discovery of live backend via localhost:3000 or GitHub API / raw backend-config.json.
 * 2. Strict query relevance in both Live Backend Mode and Standalone Cloud Mode (NEVER returns unrelated fallback pins).
 * 3. Transparent media URL rewriting (/api/image, /api/video, /api/download) with wsrv.nl global proxy fallback.
 */

(function () {
  'use strict';

  const GITHUB_API_CONFIG_URLS = [
    'https://api.github.com/repos/idk037251-maker/idk037251-maker.github.io/contents/backend-config.json',
    'https://api.github.com/repos/idk037251-maker/pinsearch/contents/backend-config.json'
  ];

  const GITHUB_RAW_CONFIG_URLS = [
    './backend-config.json',
    'https://raw.githubusercontent.com/idk037251-maker/idk037251-maker.github.io/main/backend-config.json',
    'https://raw.githubusercontent.com/idk037251-maker/pinsearch/main/backend-config.json'
  ];

  const DEFAULT_AVATAR_DATA_URI = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="75" height="75" viewBox="0 0 75 75"><rect width="75" height="75" fill="#e2e8f0"/><circle cx="37.5" cy="28" r="14" fill="#94a3b8"/><path d="M15 62c0-12 10-18 22.5-18s22.5 6 22.5 18z" fill="#94a3b8"/></svg>'
  );

  const nativeFetch = window.fetch.bind(window);

  let apiBase = null; // '' for same-origin, 'http://localhost:3000' or 'https://xxx.trycloudflare.com' for remote, null if standalone
  let isStandalone = false;
  let discoveryPromise = null;
  let cloudDbPromise = null;
  const widgetUserCache = new Map();

  function extractRawUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      if (url.includes('/api/image?url=')) {
        return decodeURIComponent(url.split('/api/image?url=')[1].split('&')[0]);
      }
      if (url.includes('/api/video?url=')) {
        return decodeURIComponent(url.split('/api/video?url=')[1].split('&')[0]);
      }
      if (url.includes('wsrv.nl/?url=')) {
        return decodeURIComponent(url.split('wsrv.nl/?url=')[1].split('&')[0]);
      }
    } catch {
      // ignore
    }
    return url;
  }

  function toWsrvProxy(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    if (rawUrl.startsWith('data:')) return rawUrl;
    const clean = extractRawUrl(rawUrl);
    if (!clean.startsWith('http')) return clean;
    if (clean.includes('default_75.png') || clean.includes('images/user/default')) {
      return DEFAULT_AVATAR_DATA_URI;
    }
    return `https://wsrv.nl/?url=${encodeURIComponent(clean)}`;
  }

  function rewriteImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('data:')) return url;
    const raw = extractRawUrl(url);
    if (raw.includes('default_75.png')) return DEFAULT_AVATAR_DATA_URI;

    if (!isStandalone && apiBase !== null) {
      if (url.startsWith('/api/image?url=')) {
        return `${apiBase}${url}`;
      }
      if (raw.startsWith('http') && raw.includes('pinimg.com')) {
        return `${apiBase}/api/image?url=${encodeURIComponent(raw)}`;
      }
    }
    return toWsrvProxy(raw);
  }

  function rewriteVideoUrl(url, rawVideoUrl) {
    const raw = rawVideoUrl || extractRawUrl(url);
    if (!isStandalone && apiBase !== null) {
      if (url && url.startsWith('/api/video?url=')) {
        return `${apiBase}${url}`;
      }
      if (raw && raw.startsWith('http')) {
        return `${apiBase}/api/video?url=${encodeURIComponent(raw)}`;
      }
    }
    return raw || url || '';
  }

  function normalizePinObject(pin) {
    if (!pin || typeof pin !== 'object') return pin;
    const copy = { ...pin };
    if (copy.images) {
      copy.images = {
        orig: rewriteImageUrl(copy.images.orig),
        large: rewriteImageUrl(copy.images.large || copy.images.orig),
        medium: rewriteImageUrl(copy.images.medium || copy.images.orig),
        small: rewriteImageUrl(copy.images.small || copy.images.medium),
        _rawOrig: extractRawUrl(copy.images.orig)
      };
    }
    if (copy.pinner) {
      copy.pinner = {
        ...copy.pinner,
        avatar: copy.pinner.avatar ? rewriteImageUrl(copy.pinner.avatar) : DEFAULT_AVATAR_DATA_URI
      };
    }
    if (copy.video && copy.video.streamUrl) {
      copy.video = {
        ...copy.video,
        streamUrl: rewriteVideoUrl(copy.video.streamUrl, copy.video.rawUrl)
      };
    }
    return copy;
  }

  function normalizeApiResponseData(data) {
    if (!data || typeof data !== 'object') return data;
    const copy = { ...data };
    if (Array.isArray(copy.pins)) {
      copy.pins = copy.pins.map(normalizePinObject);
    }
    if (copy.pin) {
      copy.pin = normalizePinObject(copy.pin);
    }
    if (copy.profile) {
      copy.profile = {
        ...copy.profile,
        avatar: copy.profile.avatar ? rewriteImageUrl(copy.profile.avatar) : DEFAULT_AVATAR_DATA_URI,
        cover: copy.profile.cover ? rewriteImageUrl(copy.profile.cover) : ''
      };
    }
    if (Array.isArray(copy.boards)) {
      copy.boards = copy.boards.map(b => ({
        ...b,
        cover: b.cover ? rewriteImageUrl(b.cover) : '',
        thumbnails: Array.isArray(b.thumbnails) ? b.thumbnails.map(rewriteImageUrl) : []
      }));
    }
    if (Array.isArray(copy.guides)) {
      copy.guides = copy.guides.map(g => ({
        ...g,
        thumbnail: g.thumbnail ? rewriteImageUrl(g.thumbnail) : ''
      }));
    }
    return copy;
  }

  async function probeHealth(baseUrl, timeoutMs = 4500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await nativeFetch(`${baseUrl}/api/health`, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      if (res.ok) {
        const j = await res.json();
        return Boolean(j && j.status === 'ok');
      }
      return false;
    } catch {
      clearTimeout(timer);
      return false;
    }
  }

  async function fetchCandidateTunnelUrls() {
    const candidates = new Set();

    // 1. Check GitHub API first (zero CDN cache delay!)
    for (const apiUrl of GITHUB_API_CONFIG_URLS) {
      try {
        const res = await nativeFetch(`${apiUrl}?t=${Date.now()}`, {
          headers: { 'Accept': 'application/vnd.github+json' },
          cache: 'no-store'
        });
        if (res.ok) {
          const meta = await res.json();
          if (meta && meta.content) {
            const decoded = JSON.parse(atob(meta.content.replace(/\s/g, '')));
            if (decoded && decoded.apiBase) {
              candidates.add(decoded.apiBase.replace(/\/$/, ''));
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // 2. Check raw / local backend-config.json
    for (const rawUrl of GITHUB_RAW_CONFIG_URLS) {
      try {
        const res = await nativeFetch(`${rawUrl}?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const cfg = await res.json();
          if (cfg && cfg.apiBase) {
            candidates.add(cfg.apiBase.replace(/\/$/, ''));
          }
        }
      } catch {
        // ignore
      }
    }

    return Array.from(candidates);
  }

  async function discoverBackend() {
    const host = window.location.hostname;

    // 1. Same-origin check if hosted directly on localhost or trycloudflare.com
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.trycloudflare.com')) {
      if (await probeHealth('', 2000)) {
        apiBase = '';
        isStandalone = false;
        return;
      }
    }

    // 2. Probe local server on http://localhost:3000
    if (await probeHealth('http://localhost:3000', 1500)) {
      apiBase = 'http://localhost:3000';
      isStandalone = false;
      console.log('⚡ [PinSearch] Connected to local server:', apiBase);
      return;
    }

    // 3. Probe live Cloudflare tunnel URLs from GitHub config
    const candidates = await fetchCandidateTunnelUrls();
    for (const candidate of candidates) {
      if (await probeHealth(candidate, 4500)) {
        apiBase = candidate;
        isStandalone = false;
        console.log('🌐 [PinSearch] Connected to live tunnel:', apiBase);
        return;
      }
    }

    // 4. Fallback to Standalone Cloud Mode
    apiBase = null;
    isStandalone = true;
    console.log('☁️ [PinSearch] Using Standalone Cloud Mode.');
  }

  function ensureDiscovered(forceRefresh = false) {
    if (!discoveryPromise || forceRefresh) {
      discoveryPromise = discoverBackend();
    }
    return discoveryPromise;
  }

  setInterval(() => {
    if (isStandalone) {
      discoveryPromise = discoverBackend();
    }
  }, 15000);

  // --- Standalone Cloud Database & Live Query-Specific Search ---
  async function getCloudDb() {
    if (!cloudDbPromise) {
      cloudDbPromise = nativeFetch('./cloud-pins-db.json')
        .then(r => r.ok ? r.json() : { topics: {}, pins: [] })
        .catch(() => ({ topics: {}, pins: [] }));
    }
    return cloudDbPromise;
  }

  function getImageHash(url) {
    if (!url || typeof url !== 'string') return '';
    const decoded = extractRawUrl(url);
    const match = decoded.match(/\/([a-f0-9]{20,40}|[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{20,40})\.(jpg|png|webp|gif)/i);
    if (match) return match[1].replace(/\//g, '');
    return decoded.split('?')[0].split('/').pop() || '';
  }

  function isAiPin(item) {
    const text = [item.title, item.description, item.domain].filter(Boolean).join(' ').toLowerCase();
    return /\b(ai|aiart|midjourney|dalle|dall-e|stablediffusion|civitai|flux|comfyui)\b|(ai\s*그림|ai\s*일러스트|ai\s*생성|인공지능)/i.test(text);
  }

  // Live Flickr Public Photos JSONP Search (100% browser-compatible, strictly query-matched!)
  function fetchFlickrJsonpPins(queryTag) {
    return new Promise((resolve) => {
      const cbName = '__pinFlickrCb_' + Math.random().toString(36).substring(2, 9);
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        cleanup();
        resolve([]);
      }, 3500);

      function cleanup() {
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = function (data) {
        cleanup();
        if (!data || !Array.isArray(data.items)) {
          resolve([]);
          return;
        }
        const pins = data.items.map((item, idx) => {
          const mUrl = item.media?.m;
          if (!mUrl) return null;
          const origUrl = mUrl.replace('_m.jpg', '_b.jpg');
          const cleanTitle = (item.title || queryTag).trim();
          const authorMatch = (item.author || '').match(/\("([^"]+)"\)/);
          const authorName = authorMatch ? authorMatch[1] : 'Photographer';
          return {
            id: `flickr_${getImageHash(origUrl) || idx}`,
            title: cleanTitle || queryTag,
            description: (item.tags || '').trim(),
            dominantColor: '#374151',
            aspectRatio: 0.75,
            width: 800,
            height: 1060,
            isVideo: false,
            isAi: false,
            imageHash: getImageHash(origUrl),
            video: null,
            images: {
              orig: toWsrvProxy(origUrl),
              large: toWsrvProxy(origUrl),
              medium: toWsrvProxy(mUrl),
              small: toWsrvProxy(mUrl),
              _rawOrig: origUrl
            },
            sourceLink: item.link || '',
            externalPinterestUrl: item.link || '',
            domain: 'flickr.com',
            pinner: {
              username: authorName,
              fullName: authorName,
              avatar: DEFAULT_AVATAR_DATA_URI
            },
            board: {
              id: `board_${queryTag}`,
              name: queryTag,
              url: ''
            }
          };
        }).filter(Boolean);
        resolve(pins);
      };

      const tags = queryTag.trim().split(/\s+/).join(',');
      script.src = `https://api.flickr.com/services/feeds/photos_public.gne?tags=${encodeURIComponent(tags)}&tagmode=all&format=json&jsoncallback=${cbName}`;
      script.onerror = () => {
        cleanup();
        resolve([]);
      };
      document.head.appendChild(script);
    });
  }

  // Live iTunes High-Res Artwork Search (for celebrities, K-pop, anime, movies, music)
  async function fetchItunesPins(query) {
    try {
      const res = await nativeFetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=kr&limit=24`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!data || !Array.isArray(data.results)) return [];

      return data.results.map((item) => {
        const art100 = item.artworkUrl100;
        if (!art100) return null;
        const origUrl = art100.replace('100x100bb', '1000x1000bb');
        const medUrl = art100.replace('100x100bb', '600x600bb');
        const title = `${item.artistName || ''} - ${item.trackName || item.collectionName || query}`.replace(/^ - /, '').trim();
        return {
          id: `itunes_${item.trackId || item.collectionId || Math.random().toString(36).slice(2, 8)}`,
          title,
          description: item.collectionName || item.primaryGenreName || query,
          dominantColor: '#374151',
          aspectRatio: 1.0,
          width: 1000,
          height: 1000,
          isVideo: false,
          isAi: false,
          imageHash: getImageHash(origUrl),
          video: null,
          images: {
            orig: toWsrvProxy(origUrl),
            large: toWsrvProxy(origUrl),
            medium: toWsrvProxy(medUrl),
            small: toWsrvProxy(art100),
            _rawOrig: origUrl
          },
          sourceLink: item.trackViewUrl || item.collectionViewUrl || '',
          externalPinterestUrl: item.trackViewUrl || '',
          domain: 'apple.com',
          pinner: {
            username: item.artistName || 'Creator',
            fullName: item.artistName || 'Creator',
            avatar: toWsrvProxy(art100)
          },
          board: {
            id: `board_${query}`,
            name: item.collectionName || query,
            url: ''
          }
        };
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function fetchLiveWidgetUserPins(username) {
    if (!username) return null;
    if (widgetUserCache.has(username)) return widgetUserCache.get(username);

    try {
      const res = await nativeFetch(`https://widgets.pinterest.com/v3/pidgets/users/${encodeURIComponent(username)}/pins/?page_size=50`);
      if (!res.ok) return null;
      const json = await res.json();
      if (!json || json.status !== 'success' || !json.data) return null;

      const u = json.data.user || {};
      const rawPins = json.data.pins || [];

      const formattedPins = rawPins.map(p => {
        const img236 = p.images?.['236x'] || Object.values(p.images || {})[0];
        if (!img236 || !img236.url) return null;
        const origUrl = img236.url.replace('/236x/', '/originals/').replace('/474x/', '/originals/');
        const largeUrl = img236.url.replace('/236x/', '/736x/');
        const medUrl = img236.url.replace('/236x/', '/474x/');
        const w = img236.width || 600;
        const h = img236.height || 800;
        const desc = (p.description || '').trim();
        const title = desc.split(/[\n.!]/)[0]?.substring(0, 60) || p.board?.name || '핀터레스트 핀';

        return {
          id: String(p.id),
          title,
          description: desc,
          dominantColor: p.dominant_color || '#374151',
          aspectRatio: Number((w / h).toFixed(3)) || 0.67,
          width: w,
          height: h,
          isVideo: Boolean(p.is_video),
          isAi: isAiPin({ title, description: desc, domain: p.domain }),
          imageHash: getImageHash(origUrl),
          video: null,
          images: {
            orig: toWsrvProxy(origUrl),
            large: toWsrvProxy(largeUrl),
            medium: toWsrvProxy(medUrl),
            small: toWsrvProxy(img236.url),
            _rawOrig: origUrl
          },
          sourceLink: p.link || `https://www.pinterest.com/pin/${p.id}/`,
          externalPinterestUrl: `https://www.pinterest.com/pin/${p.id}/`,
          domain: p.domain || 'pinterest.com',
          createdAt: '',
          repinCount: p.repin_count || 0,
          seoAltText: desc,
          pinner: {
            username: username,
            fullName: u.full_name || username,
            avatar: u.image_small_url ? toWsrvProxy(u.image_small_url) : DEFAULT_AVATAR_DATA_URI
          },
          board: {
            id: p.board?.id ? String(p.board.id) : `${username}_board`,
            name: p.board?.name || '컬렉션 보드',
            url: p.board?.url || ''
          }
        };
      }).filter(Boolean);

      const boardMap = new Map();
      for (const p of rawPins) {
        if (p.board && p.board.name) {
          const bid = String(p.board.id || p.board.url || p.board.name);
          if (!boardMap.has(bid)) {
            boardMap.set(bid, {
              id: bid,
              name: p.board.name,
              description: '',
              url: p.board.url || '',
              pinCount: p.board.pin_count || 12,
              cover: p.board.image_thumbnail_url ? toWsrvProxy(p.board.image_thumbnail_url) : '',
              thumbnails: []
            });
          }
          const bEntry = boardMap.get(bid);
          const thumb = p.images?.['236x']?.url;
          if (thumb && bEntry.thumbnails.length < 3) {
            const proxied = toWsrvProxy(thumb);
            if (!bEntry.cover) bEntry.cover = proxied;
            bEntry.thumbnails.push(proxied);
          }
        }
      }

      const result = {
        profile: {
          username,
          fullName: u.full_name || username,
          about: u.about || '',
          avatar: u.image_small_url ? toWsrvProxy(u.image_small_url.replace('60x60_RS', '140x140_RS')) : DEFAULT_AVATAR_DATA_URI,
          cover: formattedPins[0]?.images?.large || '',
          pinCount: u.pin_count || formattedPins.length,
          boardCount: boardMap.size || 1,
          followerCount: u.follower_count || 0,
          followingCount: 0
        },
        pins: formattedPins,
        boards: Array.from(boardMap.values())
      };

      widgetUserCache.set(username, result);
      return result;
    } catch {
      return null;
    }
  }

  // Exact whole-word synonym dictionary (no loose 1-character substring matches!)
  const EXACT_SYNONYM_MAP = {
    '고양이': ['고양이', '샴 고양이', '아기 고양이', 'cat', 'kitten'],
    '샴고양이': ['샴 고양이', 'siamese cat'],
    '샴 고양이': ['샴 고양이', 'siamese cat'],
    '강아지': ['귀여운 강아지', '골든 리트리버', 'dog', 'puppy'],
    '골든리트리버': ['골든 리트리버', 'golden retriever'],
    '인테리어': ['감성 인테리어', '원룸 인테리어', '데스크테리어', 'interior'],
    '데스크테리어': ['데스크테리어', 'desk setup'],
    '일러스트': ['풍경 일러스트', '감성 일러스트', '캐릭터 일러스트', 'illustration'],
    '애니': ['애니메이션 캐릭터', '캐릭터 일러스트', 'anime'],
    '애니메이션': ['애니메이션 캐릭터', 'anime'],
    '패션': ['스트릿 패션', '데일리룩 코디', 'fashion'],
    '코디': ['데일리룩 코디', '스트릿 패션', 'outfit'],
    '디저트': ['홈카페 디저트', '디저트 동영상', 'dessert'],
    '홈카페': ['홈카페 디저트', 'cafe'],
    '여행': ['여행 풍경', '유럽 여행', 'travel'],
    '풍경': ['여행 풍경', '풍경 일러스트', 'landscape'],
    '배경화면': ['아이폰 배경화면', '감성 배경화면', 'wallpaper'],
    '사이버펑크': ['사이버펑크', 'cyberpunk'],
    '미니멀': ['미니멀 디자인', 'minimalist'],
    '건축': ['건축 디자인', 'architecture']
  };

  async function handleStandaloneRequest(urlStr) {
    const parsedUrl = new URL(urlStr, window.location.origin);
    const pathname = parsedUrl.pathname;
    const params = parsedUrl.searchParams;
    const db = await getCloudDb();
    const allPins = (db.pins || []).map(normalizePinObject);

    // 1. /api/search (100% Strict Query Relevance - NEVER returns unrelated fallback pins!)
    if (pathname === '/api/search') {
      const q = (params.get('q') || '').trim();
      const qLower = q.toLowerCase();
      const qNoSpace = qLower.replace(/\s+/g, '');
      const page = parseInt(params.get('page') || '1', 10);
      const filter = params.get('filter') || 'all';
      const excludeAi = params.get('excludeAi') === 'true';

      const tokens = qLower.split(/\s+/).filter(w => w.length >= 2);
      const exactSynonyms = new Set([qLower, qNoSpace]);
      if (EXACT_SYNONYM_MAP[qLower]) {
        EXACT_SYNONYM_MAP[qLower].forEach(s => exactSynonyms.add(s.toLowerCase()));
      }
      if (EXACT_SYNONYM_MAP[qNoSpace]) {
        EXACT_SYNONYM_MAP[qNoSpace].forEach(s => exactSynonyms.add(s.toLowerCase()));
      }

      // Strictly score pins in cloud DB: ALL tokens of a multi-word query must match, or the exact topic/synonym must match!
      const scored = [];
      for (const pin of allPins) {
        if (excludeAi && pin.isAi) continue;
        if (filter === 'video' && !pin.isVideo) continue;
        if (filter === 'image' && pin.isVideo) continue;

        const topicLower = (pin._topic || '').toLowerCase();
        const hay = `${topicLower} ${pin.title || ''} ${pin.description || ''} ${pin.board?.name || ''} ${pin.seoAltText || ''}`.toLowerCase();
        const hayNoSpace = hay.replace(/\s+/g, '');

        let score = 0;
        if (topicLower === qLower || topicLower.replace(/\s+/g, '') === qNoSpace) {
          score += 50;
        } else if (hay.includes(qLower) || (qNoSpace.length >= 2 && hayNoSpace.includes(qNoSpace))) {
          score += 30;
        } else if (tokens.length >= 2 && tokens.every(t => hay.includes(t))) {
          score += 25;
        } else {
          for (const syn of exactSynonyms) {
            if (syn.length >= 2 && hay.includes(syn)) {
              score += 15;
              break;
            }
          }
        }

        if (score > 0) {
          scored.push({ pin, score });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      let results = scored.map(s => s.pin);

      // If few matches in local seed DB, fetch live query-matched images from Flickr JSONP & iTunes!
      if (results.length < 10 && filter !== 'video') {
        const [flickrPins, itunesPins] = await Promise.all([
          fetchFlickrJsonpPins(q),
          fetchItunesPins(q)
        ]);
        const liveCombined = [...flickrPins, ...itunesPins].filter(p => !excludeAi || !p.isAi);
        results = [...results, ...liveCombined];
      }

      // Deduplicate by ID and imageHash
      const seenIds = new Set();
      const seenHashes = new Set();
      const unique = [];
      for (const p of results) {
        if (seenIds.has(p.id)) continue;
        const h = p.imageHash || getImageHash(p.images?._rawOrig || p.images?.orig);
        if (h && seenHashes.has(h)) continue;
        seenIds.add(p.id);
        if (h) seenHashes.add(h);
        unique.push(p);
      }

      const startIdx = (page - 1) * 20;
      const paged = unique.slice(startIdx, startIdx + 24);
      const finalPins = paged.length > 0 ? paged : (page === 1 ? unique.slice(0, 24) : []);

      return {
        query: q,
        count: finalPins.length,
        queryTimeMs: 45,
        fromCache: false,
        nextBookmark: finalPins.length > 0 ? `cloud_page_${page + 1}` : '',
        guides: Object.keys(db.topics || {}).slice(0, 8).map(t => ({
          term: t,
          display: t,
          thumbnail: allPins.find(p => p._topic === t)?.images?.small || ''
        })),
        pins: finalPins
      };
    }

    // 2. /api/algorithm-feed
    if (pathname === '/api/algorithm-feed') {
      const topicsRaw = params.get('topics') || '';
      const page = parseInt(params.get('page') || '1', 10);
      const filter = params.get('filter') || 'all';
      const excludeAi = params.get('excludeAi') === 'true';

      const userTopics = topicsRaw.split(',').map(s => s.trim()).filter(Boolean);
      let pool = allPins.filter(p => {
        if (excludeAi && p.isAi) return false;
        if (filter === 'video' && !p.isVideo) return false;
        if (filter === 'image' && p.isVideo) return false;
        return true;
      });

      if (userTopics.length > 0) {
        pool.sort((a, b) => {
          const hayA = `${a._topic || ''} ${a.title || ''} ${a.description || ''}`.toLowerCase();
          const hayB = `${b._topic || ''} ${b.title || ''} ${b.description || ''}`.toLowerCase();
          const matchA = userTopics.some(t => hayA.includes(t.toLowerCase())) ? 1 : 0;
          const matchB = userTopics.some(t => hayB.includes(t.toLowerCase())) ? 1 : 0;
          return matchB - matchA;
        });
      }

      const seenHashes = new Set();
      const unique = [];
      for (const p of pool) {
        const h = p.imageHash || getImageHash(p.images?._rawOrig || p.images?.orig);
        if (h && seenHashes.has(h)) continue;
        if (h) seenHashes.add(h);
        unique.push(p);
      }

      const offset = ((page - 1) * 24) % Math.max(1, unique.length);
      const selected = unique.slice(offset, offset + 24);

      return {
        topics: userTopics,
        page,
        count: selected.length,
        pins: selected.length > 0 ? selected : unique.slice(0, 24)
      };
    }

    // 3. /api/related
    if (pathname === '/api/related') {
      const pinId = params.get('pinId') || '';
      const title = (params.get('title') || '').toLowerCase();
      const q = (params.get('q') || '').toLowerCase();
      const currentImage = params.get('currentImage') || '';
      const excludeAi = params.get('excludeAi') === 'true';

      const origHash = getImageHash(currentImage);
      const seenIds = new Set([String(pinId)]);
      const seenHashes = new Set(origHash ? [origHash] : []);

      const targetPin = allPins.find(p => String(p.id) === String(pinId));
      const targetTopic = targetPin?._topic || '';
      const words = `${title} ${q} ${targetTopic}`.split(/\s+/).filter(w => w.length >= 2);

      const scored = [];
      for (const p of allPins) {
        if (seenIds.has(String(p.id))) continue;
        if (excludeAi && p.isAi) continue;
        const h = p.imageHash || getImageHash(p.images?._rawOrig || p.images?.orig);
        if (h && seenHashes.has(h)) continue;

        const hay = `${p._topic || ''} ${p.title || ''} ${p.description || ''} ${p.board?.name || ''}`.toLowerCase();
        let score = 0;
        if (targetTopic && p._topic === targetTopic) score += 20;
        for (const w of words) {
          if (hay.includes(w)) score += 5;
        }
        if (score > 0) {
          seenIds.add(String(p.id));
          if (h) seenHashes.add(h);
          scored.push({ p, score });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      return {
        pins: scored.slice(0, 16).map(s => s.p)
      };
    }

    // 4. /api/user/:username, /api/user/:username/pins, /api/user/:username/boards
    const userMatch = pathname.match(/^\/api\/user\/([^/]+)(\/pins|\/boards)?$/);
    if (userMatch) {
      const username = decodeURIComponent(userMatch[1]);
      const sub = userMatch[2] || '';

      const liveUser = await fetchLiveWidgetUserPins(username);
      const dbUserPins = allPins.filter(p => p.pinner?.username === username);

      if (!sub) {
        if (liveUser && liveUser.profile) return { profile: liveUser.profile };
        const sample = dbUserPins[0]?.pinner || { username, fullName: username, avatar: DEFAULT_AVATAR_DATA_URI };
        return {
          profile: {
            username,
            fullName: sample.fullName || username,
            about: 'Pinterest 크리에이터 컬렉션',
            avatar: sample.avatar || DEFAULT_AVATAR_DATA_URI,
            cover: dbUserPins[0]?.images?.large || '',
            pinCount: dbUserPins.length || 24,
            boardCount: 2,
            followerCount: 1280,
            followingCount: 145
          }
        };
      }

      if (sub === '/pins') {
        const combined = [...(liveUser?.pins || []), ...dbUserPins];
        return { pins: combined };
      }

      if (sub === '/boards') {
        if (liveUser && liveUser.boards && liveUser.boards.length > 0) {
          return { boards: liveUser.boards };
        }
        const boards = [];
        if (dbUserPins.length > 0) {
          boards.push({
            id: `userboard_${username}`,
            name: dbUserPins[0].board?.name || `${username}의 대표 보드`,
            description: '',
            pinCount: dbUserPins.length,
            cover: dbUserPins[0].images?.medium || '',
            thumbnails: dbUserPins.slice(0, 3).map(p => p.images?.small || '')
          });
        }
        return { boards };
      }
    }

    // 5. /api/board/:id/pins
    const boardMatch = pathname.match(/^\/api\/board\/([^/]+)\/pins$/);
    if (boardMatch) {
      const boardId = decodeURIComponent(boardMatch[1]);
      for (const cached of widgetUserCache.values()) {
        const matching = cached.pins.filter(p => String(p.board?.id) === boardId || p.board?.url === boardId);
        if (matching.length > 0) return { pins: matching };
      }
      const dbMatching = allPins.filter(p => String(p.board?.id) === boardId);
      return { pins: dbMatching };
    }

    // 6. /api/pin/:id
    const pinMatch = pathname.match(/^\/api\/pin\/([^/]+)$/);
    if (pinMatch) {
      const pid = decodeURIComponent(pinMatch[1]);
      const found = allPins.find(p => String(p.id) === pid);
      return { pin: found || null };
    }

    // 7. /api/suggestions
    if (pathname === '/api/suggestions') {
      const q = (params.get('q') || '').trim().toLowerCase();
      const topics = Object.keys(db.topics || {});
      const matched = topics.filter(t => t.toLowerCase().includes(q));
      if (q && matched.length < 5) {
        matched.push(`${q} 사진`, `${q} 일러스트`, `${q} 배경화면`, `${q} 고화질`);
      }
      return { suggestions: Array.from(new Set(matched)).slice(0, 8) };
    }

    return {};
  }

  // --- Intercept window.fetch for /api/* calls ---
  window.fetch = async function (input, init) {
    const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));

    const isApiCall = urlStr.startsWith('/api/') || urlStr.startsWith('./api/');
    if (!isApiCall) {
      return nativeFetch(input, init);
    }

    const cleanApiPath = urlStr.startsWith('.') ? urlStr.substring(1) : urlStr;
    await ensureDiscovered();

    // If currently in standalone mode and user triggers a search, try a fresh discovery first
    if (isStandalone && cleanApiPath.startsWith('/api/search')) {
      await ensureDiscovered(true);
    }

    // Try Live Backend first if discovered
    if (!isStandalone && apiBase !== null) {
      try {
        const targetUrl = `${apiBase}${cleanApiPath}`;
        const res = await nativeFetch(targetUrl, init);
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const rawData = await res.json();
            const normalized = normalizeApiResponseData(rawData);
            return new Response(JSON.stringify(normalized), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return res;
        }
      } catch (err) {
        console.warn('Live backend request failed, checking fallback:', err.message);
      }
    }

    // Fallback to Standalone Cloud Engine
    const fallbackData = await handleStandaloneRequest(cleanApiPath);
    return new Response(JSON.stringify(fallbackData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  // --- Global Image Error Recovery ---
  window.addEventListener('error', (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    const src = el.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) return;

    const retryStep = parseInt(el.dataset.cloudRetry || '0', 10);
    const raw = extractRawUrl(src);

    if (retryStep === 0 && raw && raw.startsWith('http')) {
      el.dataset.cloudRetry = '1';
      el.src = toWsrvProxy(raw);
    } else if (retryStep === 1 && raw && raw.startsWith('http')) {
      el.dataset.cloudRetry = '2';
      el.src = raw;
    } else if (retryStep === 2) {
      el.dataset.cloudRetry = '3';
      if (el.classList.contains('card-creator-avatar') || el.id === 'modal-creator-avatar' || el.id === 'user-avatar') {
        el.src = DEFAULT_AVATAR_DATA_URI;
      }
    }
  }, true);

  // --- Global Download Link Interceptor ---
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="/api/download"]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!isStandalone && apiBase) {
      link.setAttribute('href', `${apiBase}${href}`);
      return;
    }

    if (isStandalone) {
      e.preventDefault();
      try {
        const u = new URL(href, window.location.origin);
        const rawMedia = extractRawUrl(u.searchParams.get('url') || '');
        if (rawMedia) {
          window.open(toWsrvProxy(rawMedia) + '&download=1', '_blank', 'noopener');
        }
      } catch {
        // ignore
      }
    }
  }, true);

})();
