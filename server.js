const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory Search Cache (NEVER caches empty results)
const searchCache = new Map();
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_SEARCH_CACHE_SIZE = 500;

// In-memory Pin Registry for instant in-site lookup (/api/pin/:id)
const pinRegistry = new Map();
const MAX_REGISTRY_SIZE = 3000;

// In-memory Image Cache for fast proxy streaming (Nitter style)
const imageCache = new Map();
const MAX_IMAGE_CACHE_SIZE = 300;

function getCachedSearch(key) {
  const item = searchCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return item.data;
}

function setCachedSearch(key, data) {
  if (!data || !data.pins || data.pins.length === 0) return;

  if (searchCache.size >= MAX_SEARCH_CACHE_SIZE) {
    const oldestKey = searchCache.keys().next().value;
    searchCache.delete(oldestKey);
  }
  searchCache.set(key, { timestamp: Date.now(), data });
}

function registerPin(pin) {
  if (!pin || !pin.id) return;
  if (pinRegistry.size >= MAX_REGISTRY_SIZE) {
    const oldest = pinRegistry.keys().next().value;
    pinRegistry.delete(oldest);
  }
  pinRegistry.set(String(pin.id), pin);
}

function toProxyUrl(externalUrl) {
  if (!externalUrl || typeof externalUrl !== 'string') return '';
  if (externalUrl.startsWith('/api/image?url=') || externalUrl.startsWith('/api/video?url=')) return externalUrl;
  return `/api/image?url=${encodeURIComponent(externalUrl)}`;
}

function formatDuration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Low-level fetch to Pinterest's BaseSearchResource
async function rawPinterestFetch(query, bookmark = '') {
  const cleanBm = (bookmark && !bookmark.startsWith('bm_pg_') && !bookmark.startsWith('cloud_') && bookmark !== '-end-')
    ? bookmark
    : '';

  const args = {
    options: {
      query: query.trim(),
      scope: 'pins',
      bookmarks: [cleanBm]
    },
    context: {}
  };

  const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?data=${encodeURIComponent(JSON.stringify(args))}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Pinterest-AppState': 'active',
    'X-Pinterest-Source-Url': '/ideas/',
    'X-Pinterest-PWS-Handler': 'www/ideas.js',
    'Referer': 'https://www.pinterest.com/ideas/'
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) return { rawResults: [], nextBookmark: null, rankedGuides: [] };
    const json = await response.json();
    const resourceData = json.resource_response?.data || {};
    const rawBm = json.resource_response?.bookmark || json.resource?.options?.bookmarks?.[0] || null;
    return {
      rawResults: resourceData.results || [],
      nextBookmark: (rawBm && rawBm !== '-end-') ? rawBm : null,
      rankedGuides: resourceData.rankedGuides || []
    };
  } catch (err) {
    console.error(`rawPinterestFetch error for "${query}":`, err.message);
    return { rawResults: [], nextBookmark: null, rankedGuides: [] };
  }
}

// Secondary exact-match Pinterest search via Bing Image index (site:pinterest.com)
async function bingPinterestFetch(query, pageNum = 1) {
  const first = Math.max(0, (pageNum - 1) * 28);
  const searchQ = `${query.trim()} site:pinterest.com`;
  const url = `https://www.bing.com/images/async?q=${encodeURIComponent(searchQ)}&first=${first}&count=35&mmasync=1`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8'
      }
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results = [];
    const regex = /m="(\{[^"]*pinimg\.com[^"]*\})"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        const decoded = match[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#39;/g, "'");
        const meta = JSON.parse(decoded);
        const imgUrl = meta.murl;
        if (!imgUrl || !imgUrl.includes('pinimg.com')) continue;

        const origUrl = imgUrl.replace(/\/(236x|474x|564x|736x)\//, '/originals/');
        const medUrl = imgUrl.replace(/\/(originals|736x)\//, '/474x/');
        const pinPage = meta.purl || '';
        const pinIdMatch = pinPage.match(/\/pin\/(\d+)/);
        const pinId = pinIdMatch ? pinIdMatch[1] : `bpin_${getImageHash(origUrl).substring(0, 14)}`;
        const cleanTitle = (meta.t || meta.desc || query).replace(/[\uE000-\uF8FF]/g, '').replace(/\s*\|\s*Pinterest.*$/i, '').trim();

        results.push({
          id: pinId,
          title: cleanTitle || query,
          description: (meta.desc || cleanTitle || '').replace(/[\uE000-\uF8FF]/g, '').trim(),
          dominant_color: '#374151',
          images: {
            orig: { url: origUrl, width: 736, height: 980 },
            '736x': { url: imgUrl, width: 736, height: 980 },
            '474x': { url: medUrl, width: 474, height: 630 },
            '236x': { url: medUrl, width: 236, height: 315 }
          },
          pinner: {
            username: 'pinterest_creator',
            full_name: 'Pinterest Creator'
          },
          board: {
            id: null,
            name: query
          },
          domain: 'pinterest.com',
          link: pinPage || `https://www.pinterest.com/pin/${pinId}/`
        });
      } catch {
        // ignore malformed block
      }
    }
    return results;
  } catch (err) {
    console.error(`bingPinterestFetch error for "${query}":`, err.message);
    return [];
  }
}

// Extract normalized unique image signature/hash from Pinterest image URLs
function getImageHash(url) {
  if (!url || typeof url !== 'string') return '';
  const decoded = url.includes('/api/image?url=') ? decodeURIComponent(url.split('/api/image?url=')[1]) : url;
  const match = decoded.match(/\/([a-f0-9]{20,40}|[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{20,40})\.(jpg|png|webp|gif)/i);
  if (match) return match[1].replace(/\//g, '');
  const clean = decoded.split('?')[0].split('/').pop();
  return clean || '';
}

// Comprehensive AI Art / AI Generated pin detector
function isAiGeneratedPin(item, p = {}) {
  if (!item) return false;
  // 1. Explicit Pinterest AI disclosure or sensitivity flags
  if (item.is_ai_generated || item.ai_generated || item.is_ai || item.ai_disclosure) return true;
  if (typeof item.content_sensitivity === 'string' && item.content_sensitivity.toLowerCase().includes('ai')) return true;

  // 2. Known AI generation domains or source links
  const aiDomains = [
    'midjourney.com', 'civitai.com', 'leonardo.ai', 'nightcafe.studio',
    'prompthero.com', 'tensor.art', 'seaart.ai', 'artbreeder.com',
    'lexica.art', 'playgroundai.com', 'ideogram.ai', 'getimg.ai',
    'novelai.net', 'openart.ai', 'craiyon.com', 'klingai.com', 'luma.ai'
  ];
  const domain = (p.domain || item.domain || '').toLowerCase();
  const link = (p.sourceLink || item.link || '').toLowerCase();
  if (aiDomains.some(d => domain.includes(d) || link.includes(d))) return true;

  // 3. Text analysis on Title, Description, Alt text, and Tags
  const corpus = [
    p.title,
    item.title,
    item.grid_title,
    p.description,
    item.description,
    item.seo_alt_text,
    p.seoAltText,
    Array.isArray(item.tags) ? item.tags.map(t => t.name || t).join(' ') : ''
  ].filter(Boolean).join(' ').toLowerCase();

  const aiPatterns = [
    /\b(ai|aiart|aigenerated|midjourney|dalle|dall-e|stablediffusion|novelai|civitai|ideogram|flux\.1|comfyui|generativeai)\b/i,
    /\b(ai\s*(art|artwork|generated|illustration|portrait|anime|drawing|photo|filter|image))\b/i,
    /\b(stable\s*diffusion|bing\s*image\s*creator|chatgpt\s*dall-e|adobe\s*firefly)\b/i,
    /(#aiart|#ai|#midjourney|#dalle|#stablediffusion|#aigenerated|#novelai|#flux)/i,
    /(ai\s*그림|ai\s*일러스트|ai\s*생성|인공지능\s*그림|인공지능\s*생성|ai\s*아트|ai\s*보정|ai\s*사진)/i
  ];

  return aiPatterns.some(regex => regex.test(corpus));
}

// Convert raw pin items from Pinterest into sanitized local pin objects with Video support
function formatPin(item) {
  if (!item || !item.images) return null;

  const images = item.images;
  const orig = images.orig || images['736x'] || images['474x'] || images['236x'];
  if (!orig || !orig.url) return null;

  const large = images['736x'] || orig;
  const medium = images['474x'] || images['236x'] || large;
  const small = images['236x'] || images['170x'] || medium;

  const width = orig.width || medium.width || 600;
  const height = orig.height || medium.height || 900;
  const aspectRatio = width && height ? Number((width / height).toFixed(3)) : 0.67;

  const title = (
    item.title ||
    item.grid_title ||
    item.auto_alt_text ||
    item.seo_alt_text ||
    item.board?.name ||
    ''
  ).trim();

  const pinId = String(item.id || `pin_${Math.random().toString(36).substring(2, 9)}`);
  const avatarRaw = item.pinner?.image_medium_url || item.pinner?.image_small_url || '';

  // Video Detection (HLS or MP4)
  let isVideo = false;
  let videoStreamUrl = null;
  let videoDurationSec = 0;
  let videoWidth = width;
  let videoHeight = height;

  if (item.videos?.video_list) {
    const vl = item.videos.video_list;
    const vCandidate = vl.V_HLSV4 || vl.V_HLSV3_MOBILE || vl.V_720P || vl.V_EXP7 || Object.values(vl)[0];
    if (vCandidate && vCandidate.url) {
      isVideo = true;
      videoStreamUrl = vCandidate.url;
      videoDurationSec = Math.round((vCandidate.duration || 0) / 1000);
      videoWidth = vCandidate.width || width;
      videoHeight = vCandidate.height || height;
    }
  } else if (item.story_pin_data?.pages) {
    for (const page of item.story_pin_data.pages) {
      for (const block of (page.blocks || [])) {
        if (block.video?.video_list) {
          const vl = block.video.video_list;
          const vCandidate = vl.V_HLSV4 || vl.V_HLSV3_MOBILE || vl.V_720P || Object.values(vl)[0];
          if (vCandidate && vCandidate.url) {
            isVideo = true;
            videoStreamUrl = vCandidate.url;
            videoDurationSec = Math.round((vCandidate.duration || 0) / 1000);
            videoWidth = vCandidate.width || width;
            videoHeight = vCandidate.height || height;
            break;
          }
        }
      }
      if (isVideo) break;
    }
  }

  const isAi = isAiGeneratedPin(item, {
    title,
    description: (item.description || item.closeup_unified_description || '').trim(),
    seoAltText: item.seo_alt_text || '',
    domain: item.domain || '',
    sourceLink: item.link || ''
  });

  const pinObj = {
    id: pinId,
    title: title || '제목 없는 핀',
    description: (item.description || item.closeup_unified_description || '').trim(),
    dominantColor: item.dominant_color || '#374151',
    aspectRatio,
    width,
    height,
    isVideo,
    isAi,
    imageHash: getImageHash(orig.url || large.url || medium.url || ''),
    video: isVideo ? {
      streamUrl: `/api/video?url=${encodeURIComponent(videoStreamUrl)}`,
      rawUrl: videoStreamUrl,
      durationSec: videoDurationSec,
      durationFormatted: formatDuration(videoDurationSec),
      width: videoWidth,
      height: videoHeight
    } : null,
    images: {
      orig: toProxyUrl(orig.url),
      large: toProxyUrl(large.url),
      medium: toProxyUrl(medium.url),
      small: toProxyUrl(small.url)
    },
    rawImages: {
      orig: orig.url,
      large: large.url,
      medium: medium.url,
      small: small.url
    },
    pinner: {
      username: item.pinner?.username || 'Pinterest User',
      fullName: item.pinner?.full_name || item.pinner?.username || 'Pinterest User',
      avatar: avatarRaw ? toProxyUrl(avatarRaw) : ''
    },
    board: {
      id: item.board?.id ? String(item.board.id) : null,
      name: item.board?.name || 'Board',
      url: item.board?.url || null
    },
    seoAltText: item.seo_alt_text || '',
    domain: item.domain || 'pinterest.com',
    sourceLink: item.link || null,
    inSitePinUrl: `#/pin/${pinId}`,
    externalPinterestUrl: `https://www.pinterest.com/pin/${pinId}/`
  };

  registerPin(pinObj);
  return pinObj;
}

// In-memory Bookmark Registry for sub-query pagination
const bookmarkRegistry = new Map();

// Generate strictly relevant visual sub-queries that ALWAYS preserve 100% of the user's search subject
function generateFallbackQueries(query) {
  const q = query.trim();
  const candidates = [];

  if (q.includes(' ')) {
    candidates.push(q.replace(/\s+/g, ''));
  }

  // Only visual qualifiers that keep the ENTIRE user query intact (never split out adjectives or add blog spam)
  const visualExpansions = ['사진', '고화질', '화보', '배경화면', '일러스트', 'photo', 'aesthetic'];
  for (const exp of visualExpansions) {
    if (!q.toLowerCase().includes(exp)) {
      candidates.push(`${q} ${exp}`);
    }
  }

  return Array.from(new Set(candidates.filter(c => c && c !== q)));
}

// Search Pinterest with 100% Strict Query Relevance, Deduplication, and Infinite Novelty
async function searchPinterest(query, bookmark = '', page = 1, filterType = 'all', excludeAi = false) {
  const cleanQuery = query.trim();
  const pageNum = parseInt(page, 10) || 1;
  const isVideoOnly = filterType === 'video';
  const isImageOnly = filterType === 'image';

  const cacheKey = `${cleanQuery.toLowerCase()}::${bookmark || ''}::p${pageNum}::f${filterType}::ai${excludeAi ? 1 : 0}`;
  const cached = getCachedSearch(cacheKey);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const startTime = Date.now();
  let pins = [];
  const seenIds = new Set();
  const seenHashes = new Set();
  let guides = [];
  let nextBookmark = null;
  let expandedQuery = null;

  function pushPinIfValid(formatted) {
    if (!formatted || !formatted.id) return false;
    if (excludeAi && formatted.isAi) return false;
    if (isVideoOnly && !formatted.isVideo) return false;
    if (isImageOnly && formatted.isVideo) return false;

    const hash = formatted.imageHash;
    if (seenIds.has(formatted.id)) return false;
    if (hash && seenHashes.has(hash)) return false;

    seenIds.add(formatted.id);
    if (hash) seenHashes.add(hash);
    pins.push(formatted);
    return true;
  }

  // If video-only filter is requested and query doesn't specify video, enhance search target
  const targetQuery = (isVideoOnly && !cleanQuery.includes('동영상') && !cleanQuery.includes('영상') && !cleanQuery.toLowerCase().includes('video'))
    ? `${cleanQuery} 동영상`
    : cleanQuery;

  const mainBmKey = `${targetQuery.toLowerCase()}::main_bm`;
  const effectiveBookmark = (bookmark && !bookmark.startsWith('bm_pg_') && !bookmark.startsWith('cloud_'))
    ? bookmark
    : (pageNum > 1 ? (bookmarkRegistry.get(mainBmKey) || '') : '');

  // 1. Fetch exact target query from Pinterest BaseSearchResource
  if (effectiveBookmark || pageNum === 1) {
    const first = await rawPinterestFetch(targetQuery, effectiveBookmark);
    for (const item of first.rawResults) {
      const formatted = formatPin(item);
      pushPinIfValid(formatted);
    }
    guides = first.rankedGuides || [];
    nextBookmark = first.nextBookmark;
    if (nextBookmark) {
      bookmarkRegistry.set(mainBmKey, nextBookmark);
    }
  }

  // 2. If more exact pins are needed (e.g. multi-word query or deep page), fetch exact query from Bing Pinterest Index
  if (pins.length < 12 && !isVideoOnly) {
    const bingItems = await bingPinterestFetch(targetQuery, pageNum);
    for (const item of bingItems) {
      const formatted = formatPin(item);
      pushPinIfValid(formatted);
    }
  }

  // 3. Visual subject-preserving expansion when pagination needs even more pins
  if (pins.length < 10) {
    const fallbacks = generateFallbackQueries(targetQuery);
    if (fallbacks.length > 0) {
      const candidateIdx = (pageNum - 1) % fallbacks.length;
      const primaryCandidate = fallbacks[candidateIdx];
      const secondaryCandidate = fallbacks[(candidateIdx + 1) % fallbacks.length];
      const chosenCandidates = [primaryCandidate, secondaryCandidate].filter(Boolean);

      for (const altQuery of chosenCandidates) {
        const candidateBmKey = `${altQuery.toLowerCase()}::bm`;
        const candidateBookmark = pageNum > 1 ? (bookmarkRegistry.get(candidateBmKey) || '') : '';

        const altResult = await rawPinterestFetch(altQuery, candidateBookmark);
        if (!guides.length && altResult.rankedGuides?.length) {
          guides = altResult.rankedGuides;
        }

        if (altResult.nextBookmark) {
          bookmarkRegistry.set(candidateBmKey, altResult.nextBookmark);
        }

        let addedFromCandidate = 0;
        for (const item of altResult.rawResults) {
          const formatted = formatPin(item);
          if (pushPinIfValid(formatted)) {
            addedFromCandidate++;
          }
        }

        if (addedFromCandidate > 0) {
          expandedQuery = altQuery;
        }

        if (pins.length >= 18) {
          if (!nextBookmark && altResult.nextBookmark) {
            nextBookmark = altResult.nextBookmark;
          }
          break;
        }
      }
    }
  }

  const formattedGuides = guides.map(g => ({
    term: g.term || g.display,
    display: g.display || g.term,
    dominantColor: g.dominant_color || '#4b5563',
    thumbnail: g.image_medium_url ? toProxyUrl(g.image_medium_url) : ''
  }));

  const queryTimeMs = Date.now() - startTime;
  const resultPayload = {
    query: cleanQuery,
    count: pins.length,
    pins,
    guides: formattedGuides,
    nextBookmark: nextBookmark || '',
    hasMore: true,
    page: pageNum,
    filterType,
    expandedQuery,
    queryTimeMs,
    fromCache: false
  };

  setCachedSearch(cacheKey, resultPayload);
  return resultPayload;
}

// --- API Endpoints ---

// 1. Search API
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const bookmark = req.query.bookmark || '';
  const page = req.query.page || 1;
  const filterType = req.query.filter || 'all'; // 'all' | 'video' | 'image'
  const excludeAi = req.query.excludeAi === 'true';

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: '검색어를 입력해주세요 (q parameter required)' });
  }

  try {
    const result = await searchPinterest(query, bookmark, page, filterType, excludeAi);
    res.json(result);
  } catch (err) {
    console.error('Pinterest Search Error:', err);
    res.status(500).json({
      error: '핀터레스트에서 실시간 결과를 가져오는 중 문제가 발생했습니다.',
      details: err.message
    });
  }
});

// 1.5 Viewing History-Based Personalized Algorithm Feed API (/api/algorithm-feed)
app.get('/api/algorithm-feed', async (req, res) => {
  const topicsParam = req.query.topics || '';
  const page = parseInt(req.query.page, 10) || 1;
  const filterType = req.query.filter || 'all';
  const excludeAi = req.query.excludeAi === 'true';

  let userTopics = [];
  if (topicsParam && typeof topicsParam === 'string') {
    userTopics = topicsParam.split(',').map(t => t.trim()).filter(Boolean);
  }

  // Curated starter blend if user hasn't browsed anything yet
  const defaultAestheticTopics = [
    '감성 인테리어', '귀여운 고양이', '데일리룩 코디', '아이폰 고화질 배경화면', '디저트 카페', '미니멀 데스크테리어'
  ];

  const targetTopics = userTopics.length > 0 ? userTopics : defaultAestheticTopics;

  const feedPins = [];
  const seenIds = new Set();
  const seenHashes = new Set();

  try {
    // Pick topics to fetch for this page (rotate window for pagination)
    const topicCount = targetTopics.length;
    const startIndex = ((page - 1) * 3) % topicCount;
    const selectedTopics = [];
    for (let i = 0; i < Math.min(4, topicCount); i++) {
      selectedTopics.push(targetTopics[(startIndex + i) % topicCount]);
    }

    const topicResults = await Promise.all(
      selectedTopics.map(async (topic) => {
        const result = await searchPinterest(topic, '', page, filterType, excludeAi);
        return { topic, pins: result.pins || [] };
      })
    );

    // Round-robin interleaving of pins from different user interest topics
    const maxLen = Math.max(...topicResults.map(r => r.pins.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const res of topicResults) {
        if (i < res.pins.length) {
          const p = res.pins[i];
          if (excludeAi && p.isAi) continue;
          if (!seenIds.has(p.id) && (!p.imageHash || !seenHashes.has(p.imageHash))) {
            seenIds.add(p.id);
            if (p.imageHash) seenHashes.add(p.imageHash);
            feedPins.push(p);
          }
        }
      }
      if (feedPins.length >= 24) break;
    }

    res.json({
      pins: feedPins,
      count: feedPins.length,
      page,
      basedOnTopics: userTopics,
      isPersonalized: userTopics.length > 0,
      hasMore: true
    });
  } catch (err) {
    console.error('Algorithm feed error:', err);
    res.status(500).json({ error: '알고리즘 피드를 불러오는데 실패했습니다.' });
  }
});

// 2. In-Site Single Pin Detail API (/api/pin/:id)
app.get('/api/pin/:id', (req, res) => {
  const pinId = String(req.params.id);
  const pin = pinRegistry.get(pinId);
  if (pin) {
    return res.json({ pin });
  }
  res.status(404).json({ error: '핀 정보를 찾을 수 없습니다.' });
});

// Generic Pinterest Resource Fetcher
async function fetchPinterestResource(resourceName, options = {}) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Pinterest-AppState': 'active',
    'X-Pinterest-Source-Url': '/ideas/',
    'X-Pinterest-PWS-Handler': 'www/ideas.js',
    'Referer': 'https://www.pinterest.com/'
  };

  const url = `https://www.pinterest.com/resource/${resourceName}/get/?data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const json = await res.json();
    return json.resource_response?.data || null;
  } catch (err) {
    console.error(`fetchPinterestResource error for ${resourceName}:`, err.message);
    return null;
  }
}

// 3. User Profile API (/api/user/:username)
app.get('/api/user/:username', async (req, res) => {
  const username = req.params.username;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  try {
    const uData = await fetchPinterestResource('UserResource', { username });
    if (!uData || !uData.username) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    const avatarRaw = uData.image_xlarge_url || uData.image_large_url || uData.image_medium_url || '';
    const profileCover = uData.profile_cover?.images?.orig?.url || '';

    const profile = {
      username: uData.username,
      fullName: uData.full_name || uData.username,
      about: (uData.about || uData.seo_description || '').trim(),
      avatar: avatarRaw ? toProxyUrl(avatarRaw) : '',
      cover: profileCover ? toProxyUrl(profileCover) : '',
      followerCount: uData.follower_count || 0,
      followingCount: uData.following_count || 0,
      pinCount: uData.pin_count || 0,
      boardCount: uData.board_count || 0,
      websiteUrl: uData.website_url || null,
      pinterestUrl: `https://www.pinterest.com/${uData.username}/`
    };

    res.json({ profile });
  } catch (err) {
    console.error('User profile error:', err);
    res.status(500).json({ error: '프로필을 불러오는 데 실패했습니다.' });
  }
});

// 4. User Pins API (/api/user/:username/pins)
app.get('/api/user/:username/pins', async (req, res) => {
  const username = req.params.username;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  try {
    const rawPins = await fetchPinterestResource('UserPinsResource', { username });
    const pins = [];
    if (Array.isArray(rawPins)) {
      for (const item of rawPins) {
        const p = formatPin(item);
        if (p) pins.push(p);
      }
    }
    res.json({ pins });
  } catch (err) {
    console.error('User pins error:', err);
    res.status(500).json({ error: '사용자의 핀을 불러오는 데 실패했습니다.' });
  }
});

// 5. User Boards API (/api/user/:username/boards)
app.get('/api/user/:username/boards', async (req, res) => {
  const username = req.params.username;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  try {
    const rawBoards = await fetchPinterestResource('BoardsResource', { username, field_set_key: 'grid_item' });
    const boards = [];
    if (Array.isArray(rawBoards)) {
      for (const b of rawBoards) {
        if (!b || !b.id) continue;
        const coverRaw = b.image_cover_url || b.image_cover_hd_url || b.cover_images?.['236x']?.url || '';
        const thumbs = (b.pin_thumbnail_urls || []).map(toProxyUrl);
        boards.push({
          id: String(b.id),
          name: b.name || '보드',
          url: b.url || null,
          pinCount: b.pin_count || thumbs.length || 0,
          description: b.description || '',
          cover: coverRaw ? toProxyUrl(coverRaw) : (thumbs[0] || ''),
          thumbnails: thumbs
        });
      }
    }
    res.json({ boards });
  } catch (err) {
    console.error('User boards error:', err);
    res.status(500).json({ error: '사용자의 보드를 불러오는 데 실패했습니다.' });
  }
});

// 6. Board Pins API (/api/board/:id/pins)
app.get('/api/board/:id/pins', async (req, res) => {
  const boardId = req.params.id;
  if (!boardId) return res.status(400).json({ error: 'Board ID is required' });

  try {
    const rawPins = await fetchPinterestResource('BoardFeedResource', { board_id: boardId });
    const pins = [];
    if (Array.isArray(rawPins)) {
      for (const item of rawPins) {
        const p = formatPin(item);
        if (p) pins.push(p);
      }
    }
    res.json({ pins });
  } catch (err) {
    console.error('Board pins error:', err);
    res.status(500).json({ error: '보드 핀을 불러오는 데 실패했습니다.' });
  }
});

// 7. Truly Relevant Related Pins API (/api/related)
app.get('/api/related', async (req, res) => {
  const pinId = req.query.pinId || '';
  const boardId = req.query.boardId || '';
  const query = req.query.q || '';
  const title = req.query.title || '';
  const currentImage = req.query.currentImage || '';
  const excludeAi = req.query.excludeAi === 'true';

  const relatedPins = [];
  const seenIds = new Set();
  const seenHashes = new Set();
  const seenTitles = new Set();

  if (pinId) seenIds.add(String(pinId));
  if (currentImage) {
    const origHash = getImageHash(currentImage);
    if (origHash) seenHashes.add(origHash);
  }
  if (title && title.length > 3 && title !== '제목 없는 핀') {
    seenTitles.add(title.toLowerCase().trim());
  }

  function addPinIfUnique(p) {
    if (!p || !p.id) return false;
    if (excludeAi && p.isAi) return false;
    if (seenIds.has(String(p.id))) return false;

    const hash = p.imageHash || getImageHash(p.images?.orig || p.images?.large || '');
    if (hash && seenHashes.has(hash)) return false;

    const normTitle = (p.title || '').toLowerCase().trim();
    if (normTitle && normTitle !== '제목 없는 핀' && seenTitles.has(normTitle)) return false;

    seenIds.add(String(p.id));
    if (hash) seenHashes.add(hash);
    if (normTitle && normTitle !== '제목 없는 핀') seenTitles.add(normTitle);
    relatedPins.push(p);
    return true;
  }

  try {
    // 1. Same-Board Human-Curated Pins (100% relevant context!)
    if (boardId) {
      const boardData = await fetchPinterestResource('BoardFeedResource', { board_id: boardId });
      if (Array.isArray(boardData)) {
        for (const item of boardData) {
          const p = formatPin(item);
          if (p) addPinIfUnique(p);
          if (relatedPins.length >= 10) break;
        }
      }
    }

    // 2. Intelligent Visual/Semantic Search Analysis
    if (relatedPins.length < 18) {
      // Clean stop words and extract core subject tokens
      const textToAnalyze = [title, query].filter(Boolean).join(' ');
      const subjectTokens = textToAnalyze
        .replace(/\b(a|an|the|is|are|was|were|of|in|on|at|by|with|to|from|and|or|for|as|into|next|its|it's|their|his|her|my|your)\b/gi, ' ')
        .replace(/\b(sitting|laying|standing|looking|holding|wearing|facing|giving|front|background|photo|image|picture|wallpaper)\b/gi, ' ')
        .replace(/[^a-zA-Z0-9가-힣\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2);

      // Select high-specificity terms
      const searchTerms = [];
      if (query && query.trim()) searchTerms.push(query.trim());
      if (subjectTokens.length > 0) searchTerms.push(subjectTokens.slice(0, 2).join(' '));

      for (const term of searchTerms) {
        if (!term) continue;
        const searchResults = await searchPinterest(term, '', 1, 'all', excludeAi);
        for (const p of (searchResults.pins || [])) {
          addPinIfUnique(p);
          if (relatedPins.length >= 18) break;
        }
        if (relatedPins.length >= 18) break;
      }
    }

    res.json({ pins: relatedPins.slice(0, 18) });
  } catch (err) {
    console.error('Related pins error:', err);
    res.json({ pins: relatedPins });
  }
});

// 4. Video Proxy API (/api/video?url=...)
// Proxies Pinterest HLS .m3u8 playlists and video segments (.cmfv, .ts, .mp4)
app.get('/api/video', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('Video URL is required');
  }

  try {
    const parsed = new URL(targetUrl);
    if (!parsed.hostname.endsWith('pinimg.com')) {
      return res.status(403).send('Only Pinterest CDN videos can be proxied.');
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.pinterest.com/'
    };

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const response = await fetch(targetUrl, { headers });
    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch video stream');
    }

    const isM3U8 = targetUrl.includes('.m3u8') || response.headers.get('content-type')?.includes('mpegurl');

    if (isM3U8) {
      const text = await response.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

      // Rewrite relative URLs to local /api/video?url=...
      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith('#')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
            const absolute = p1.startsWith('http') ? p1 : baseUrl + p1;
            return `URI="/api/video?url=${encodeURIComponent(absolute)}"`;
          });
        }
        const absolute = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
        return `/api/video?url=${encodeURIComponent(absolute)}`;
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=600');
      return res.send(rewritten);
    } else {
      // Binary video or audio segment
      let contentType = response.headers.get('content-type');
      if (!contentType || contentType === 'application/octet-stream') {
        if (targetUrl.includes('.cmfa')) contentType = 'audio/mp4';
        else if (targetUrl.includes('.cmfv') || targetUrl.includes('.mp4')) contentType = 'video/mp4';
        else if (targetUrl.includes('.ts')) contentType = 'video/mp2t';
        else contentType = 'video/mp4';
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

      if (response.headers.has('content-length')) {
        res.setHeader('Content-Length', response.headers.get('content-length'));
      }
      if (response.headers.has('content-range')) {
        res.setHeader('Content-Range', response.headers.get('content-range'));
        res.status(206);
      }

      const arrayBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }
  } catch (err) {
    console.error('Video proxy error:', err.message);
    res.status(500).send('Error streaming video');
  }
});

// Default Fallback Avatar SVG
const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="75" height="75" viewBox="0 0 75 75"><rect width="75" height="75" fill="#e2e8f0"/><circle cx="37.5" cy="28" r="14" fill="#94a3b8"/><path d="M15 62c0-12 10-18 22.5-18s22.5 6 22.5 18z" fill="#94a3b8"/></svg>`;

// 5. Image Proxy API (/api/image?url=...)
app.get('/api/image', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('Image URL is required');
  }

  try {
    const parsed = new URL(targetUrl);
    if (!parsed.hostname.endsWith('pinimg.com')) {
      return res.status(403).send('Only Pinterest CDN images can be proxied.');
    }

    const cached = imageCache.get(targetUrl);
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      return res.send(cached.buffer);
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.pinterest.com/'
      }
    });

    if (!response.ok) {
      if (targetUrl.includes('images/user') || targetUrl.includes('75x75') || targetUrl.includes('avatar')) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(DEFAULT_AVATAR_SVG);
      }
      return res.status(response.status).send('Failed to fetch image');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (imageCache.size >= MAX_IMAGE_CACHE_SIZE) {
      const oldestKey = imageCache.keys().next().value;
      imageCache.delete(oldestKey);
    }
    imageCache.set(targetUrl, { contentType, buffer });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.send(buffer);
  } catch (err) {
    if (targetUrl.includes('images/user') || targetUrl.includes('75x75') || targetUrl.includes('avatar')) {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(DEFAULT_AVATAR_SVG);
    }
    res.status(500).send('Error streaming image');
  }
});

// 6. Download Media Proxy API (handles both Images and Videos)
app.get('/api/download', async (req, res) => {
  let mediaUrl = req.query.url;
  const rawFilename = req.query.filename || 'pinterest-media';

  if (!mediaUrl) {
    return res.status(400).send('Media URL is required');
  }

  if (mediaUrl.startsWith('/api/image?url=') || mediaUrl.startsWith('/api/video?url=')) {
    mediaUrl = decodeURIComponent(mediaUrl.replace(/^\/api\/(image|video)\?url=/, ''));
  }

  try {
    const parsed = new URL(mediaUrl);
    if (!parsed.hostname.endsWith('pinimg.com')) {
      return res.status(403).send('Only Pinterest CDN media can be downloaded.');
    }

    const response = await fetch(mediaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.pinterest.com/'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch media from Pinterest');
    }

    let ext = 'jpg';
    if (mediaUrl.includes('.mp4')) ext = 'mp4';
    else if (mediaUrl.includes('.m3u8')) ext = 'm3u8';
    else if (mediaUrl.endsWith('.png')) ext = 'png';
    else if (mediaUrl.endsWith('.webp')) ext = 'webp';
    else if (mediaUrl.endsWith('.gif')) ext = 'gif';

    const safeFilename = encodeURIComponent(rawFilename.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')) + '.' + ext;

    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).send('Error downloading media');
  }
});

// 7. Search Autocomplete / Suggestions API
const POPULAR_TOPICS = [
  '감성 인테리어', '원룸 인테리어', '미니멀 데스크테리어',
  '미니멀 배경화면', '아이폰 고화질 배경화면', '풍경 일러스트',
  '사이버펑크 일러스트', '애니메이션 캐릭터', '귀여운 고양이',
  '귀여운 고양이 동영상', '강아지 릴스 동영상', '디저트 레시피 영상',
  '홈카페 감성', '데일리룩 코디', '스트릿 패션', '3D 렌더링 아트'
];

app.get('/api/suggestions', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) {
    return res.json({ suggestions: POPULAR_TOPICS.slice(0, 8) });
  }

  const matches = POPULAR_TOPICS.filter(t => t.toLowerCase().includes(q));
  if (matches.length < 5) {
    matches.push(`${q} 배경화면`, `${q} 일러스트`, `${q} 동영상`, `${q} 감성`);
  }
  const unique = Array.from(new Set(matches)).slice(0, 8);
  res.json({ suggestions: unique });
});

// 8. Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'PinSearch · Video Player & Infinite Load More Enabled',
    uptime: process.uptime(),
    registeredPins: pinRegistry.size,
    cachedImages: imageCache.size
  });
});

// SPA Catch-all: serve index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 [동영상 재생 & 무한 더 불러오기 탑재] PinSearch 가동!`);
  console.log(`🎬 사이트 내 동영상 스트리밍 및 플레이어 지원 (/api/video)`);
  console.log(`🔄 끊김 없는 지능형 '더 불러오기' 지원`);
  console.log(`🌐 로컬 접속 주소: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
