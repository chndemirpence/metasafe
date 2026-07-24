/**
 * MetaSafe URL/Link Cleaner
 * Removes tracking parameters from URLs to protect user privacy
 * 
 * Supports:
 * - Google Analytics (UTM parameters)
 * - Facebook/Meta (fbclid, fb_*)
 * - Twitter/X (twclid, s, t)
 * - Microsoft/Bing (msclkid)
 * - TikTok (ttclid)
 * - Amazon (tag, ref, pd_rd_*)
 * - YouTube (si, feature, pp)
 * - LinkedIn (trackingId, src)
 * - Mailchimp (mc_*)
 * - HubSpot (hsa_*, __hstc, __hssc)
 * - General tracking (ref, source, via, etc.)
 */

// ===== Tracking Parameter Database =====
const TRACKING_PARAMS = {
  // Google Analytics / UTM
  google: [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
    'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'gad_source'
  ],
  
  // Facebook / Meta
  facebook: [
    'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
    'fb_beacon_info', 'fb_comment_id', 'fb_dtsg', 'fb_dtsg_ag',
    'hrc', 'fref', 'igshid', 'igsh'
  ],
  
  // Twitter / X
  twitter: [
    'twclid', 's', 't', 'ref_src', 'ref_url', 'src'
  ],
  
  // Microsoft / Bing
  microsoft: [
    'msclkid', 'mkt_tok', 'cvid'
  ],
  
  // TikTok
  tiktok: [
    'ttclid', 'tt_medium', 'tt_content', 'share_item_id', 'share_app_id',
    '_r', 'u_code', 'preview_pb', 'language', 'timestamp', 'is_from_webapp',
    'sender_device', 'enter_from'
  ],
  
  // Amazon
  amazon: [
    'tag', 'ref', 'ref_', 'pf_rd_*', 'pd_rd_*', 'qid', 'sr', 'keywords',
    'content-id', 'psc', 'smid', 'spIA', 'linkCode', 'th', 'dib_tag', 'dib'
  ],
  
  // YouTube
  youtube: [
    'si', 'feature', 'pp', 'embeds_referring_euri', 'source_ve_path',
    'ab_channel', 'list', 'index', 'start', 't'
  ],
  
  // LinkedIn
  linkedin: [
    'trackingId', 'lipi', 'lici', 'trk', 'trkEmail', 'trkInfo',
    'connectionId', 'rcm'
  ],
  
  // Email Marketing
  email: [
    // Mailchimp
    'mc_cid', 'mc_eid', 'mc_tc',
    // HubSpot
    'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad', 'hsa_src', 'hsa_tgt',
    'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver', 'hsa_la', 'hsa_ol',
    '__hstc', '__hssc', '__hsfp', 'hsCtaTracking',
    // Marketo
    'mkt_tok',
    // Klaviyo
    '_kx',
    // SendGrid
    'sg_',
    // Generic email
    'email_source', 'email_campaign', 'e_src', 'e_cid'
  ],
  
  // Social Media General
  social: [
    'share', 'shared', 'share_id', 'social_source', 'via',
    'spm', 'scm', 'pvid', 'algo_expid', 'algo_pvid', 'btsid'
  ],
  
  // Analytics & Tracking General
  analytics: [
    '_ga', '_gl', '_hsenc', '_openstat', 'yclid', 'ymclid',
    'wickedid', 'wickedsource', 'rb_clickid', 'mc_tc',
    'ns_*', 'browser_id', 'session_id', 'visitor_id', 'tracking_id',
    'trk_*', 'click_id', 'cid', 'campaign_id'
  ],
  
  // Affiliate & Referral
  affiliate: [
    'aff_id', 'affiliate_id', 'aff_sub*', 'affid', 'affiliate',
    'partner', 'partner_id', 'ref_id', 'refid', 'referrer',
    'siteID', 'ICID', 'irgwc', 'clickref'
  ],
  
  // News & Media Sites
  media: [
    // News sites
    'ncid', 'ocid', 'mod', 'sec', 'subsec', 'pos',
    // Reddit
    'share_id', 'utm_name', 'context', 'correlation_id',
    // Pinterest
    'e_t', 'lp', 'ptl',
    // Snapchat
    'sc_*'
  ],
  
  // Chinese Platforms
  chinese: [
    // Weibo
    'weibo_id', 'weiboauthoruid',
    // WeChat
    'wechat_redirect', 'from', 'isappinstalled',
    // Alibaba/Taobao
    'spm', 'scm', 'pvid', 'algo_expid', 'algo_pvid', 'btsid',
    'ns_*', '_p_tr_v', 'tpp_rcmd_*'
  ],
  
  // E-commerce
  ecommerce: [
    'variant', 'variant_id', 'currency', 'discount', 'coupon',
    'promo', 'promo_code', 'sale_source'
  ]
};

// Parameters that should NEVER be removed (functional)
const PRESERVE_PARAMS = [
  'v', 'id', 'q', 'search', 'query', 'page', 'p', 'sort', 'order',
  'filter', 'category', 'cat', 'lang', 'language', 'locale',
  'token', 'auth', 'key', 'access_token', 'code', 'state',
  'redirect', 'return', 'next', 'callback', 'continue',
  'start_time', 'end_time', 'date', 'from', 'to'
];

// ===== URL Cleaning Functions =====

/**
 * Analyze a URL and identify tracking parameters
 * @param {string} urlString - The URL to analyze
 * @returns {Object} Analysis result with identified trackers
 */
function analyzeURL(urlString) {
  try {
    const url = new URL(urlString);
    const params = new URLSearchParams(url.search);
    const hash = url.hash;
    
    const result = {
      original: urlString,
      domain: url.hostname,
      path: url.pathname,
      trackingParams: [],
      preservedParams: [],
      hashTracking: [],
      riskScore: 0
    };
    
    // Analyze query parameters
    for (const [key, value] of params.entries()) {
      const trackingInfo = identifyTrackingParam(key, value);
      
      if (trackingInfo) {
        result.trackingParams.push({
          name: key,
          value: truncateValue(value),
          category: trackingInfo.category,
          platform: trackingInfo.platform,
          risk: trackingInfo.risk
        });
        result.riskScore += trackingInfo.risk === 'high' ? 3 : trackingInfo.risk === 'medium' ? 2 : 1;
      } else {
        result.preservedParams.push({ name: key, value: truncateValue(value) });
      }
    }
    
    // Analyze hash for tracking
    if (hash && hash.length > 1) {
      const hashContent = hash.substring(1);
      
      // Check for Facebook hash tracking
      if (hashContent.includes('=')) {
        const hashParams = new URLSearchParams(hashContent);
        for (const [key, value] of hashParams.entries()) {
          const trackingInfo = identifyTrackingParam(key, value);
          if (trackingInfo) {
            result.hashTracking.push({
              name: key,
              value: truncateValue(value),
              category: trackingInfo.category
            });
            result.riskScore += 1;
          }
        }
      }
    }
    
    return result;
  } catch (e) {
    return {
      error: 'Invalid URL',
      original: urlString
    };
  }
}

/**
 * Identify if a parameter is a tracking parameter
 * @param {string} key - Parameter name
 * @param {string} value - Parameter value
 * @returns {Object|null} Tracking info or null
 */
function identifyTrackingParam(key, value) {
  const keyLower = key.toLowerCase();
  
  // Check if it should be preserved
  if (PRESERVE_PARAMS.some(p => keyLower === p.toLowerCase())) {
    return null;
  }
  
  // Check each category
  for (const [platform, params] of Object.entries(TRACKING_PARAMS)) {
    for (const param of params) {
      // Exact match
      if (param === keyLower) {
        return {
          category: 'tracking',
          platform: platform,
          risk: getParamRisk(platform, keyLower)
        };
      }
      
      // Wildcard match (e.g., 'fb_*')
      if (param.endsWith('*')) {
        const prefix = param.slice(0, -1);
        if (keyLower.startsWith(prefix)) {
          return {
            category: 'tracking',
            platform: platform,
            risk: getParamRisk(platform, keyLower)
          };
        }
      }
    }
  }
  
  // Heuristic detection for unknown trackers
  if (looksLikeTracker(keyLower, value)) {
    return {
      category: 'suspected',
      platform: 'unknown',
      risk: 'low'
    };
  }
  
  return null;
}

/**
 * Heuristic detection for tracking-like parameters
 */
function looksLikeTracker(key, value) {
  // Common tracking patterns
  const trackingPatterns = [
    /^(click|track|campaign|source|ref|ad|promo|affiliate)/i,
    /(id|token|hash|signature|sig)$/i,
    /^_[a-z]{2,}$/i,  // Underscore prefix (common in analytics)
    /^[a-z]+clid$/i   // *clid pattern (click IDs)
  ];
  
  if (trackingPatterns.some(p => p.test(key))) {
    return true;
  }
  
  // Check for encoded/hashed values (often tracking)
  if (value && value.length > 20 && /^[a-zA-Z0-9_-]+$/.test(value)) {
    return true;
  }
  
  return false;
}

/**
 * Get risk level for a tracking parameter
 */
function getParamRisk(platform, param) {
  // High risk: user-identifiable tracking
  const highRisk = ['fbclid', 'gclid', 'msclkid', 'ttclid', 'twclid', '_ga', '_gl', 'mc_eid'];
  if (highRisk.includes(param)) return 'high';
  
  // Medium risk: campaign tracking
  const mediumRisk = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
  if (mediumRisk.includes(param)) return 'medium';
  
  return 'low';
}

/**
 * Clean a URL by removing tracking parameters
 * @param {string} urlString - The URL to clean
 * @param {Object} options - Cleaning options
 * @returns {Object} Cleaned URL and removal report
 */
function cleanURL(urlString, options = {}) {
  const {
    removeAll = true,        // Remove all tracking params
    preserveHash = false,    // Keep hash fragment
    aggressiveMode = false   // Also remove suspected trackers
  } = options;
  
  try {
    const url = new URL(urlString);
    const originalParams = new URLSearchParams(url.search);
    const cleanParams = new URLSearchParams();
    const removed = [];
    
    for (const [key, value] of originalParams.entries()) {
      const trackingInfo = identifyTrackingParam(key, value);
      
      if (trackingInfo) {
        if (removeAll || (aggressiveMode && trackingInfo.category === 'suspected')) {
          removed.push({
            name: key,
            value: truncateValue(value),
            category: trackingInfo.category,
            platform: trackingInfo.platform
          });
          continue;
        }
      }
      
      cleanParams.append(key, value);
    }
    
    // Build clean URL
    let cleanURLString = url.origin + url.pathname;
    
    const cleanSearch = cleanParams.toString();
    if (cleanSearch) {
      cleanURLString += '?' + cleanSearch;
    }
    
    // Handle hash
    if (preserveHash && url.hash && !url.hash.includes('=')) {
      cleanURLString += url.hash;
    }
    
    return {
      success: true,
      original: urlString,
      cleaned: cleanURLString,
      removed: removed,
      removedCount: removed.length,
      sizeSaved: urlString.length - cleanURLString.length
    };
  } catch (e) {
    return {
      success: false,
      error: 'Invalid URL: ' + e.message,
      original: urlString
    };
  }
}

/**
 * Clean multiple URLs at once
 * @param {string[]} urls - Array of URLs to clean
 * @returns {Object[]} Array of cleaning results
 */
function cleanURLs(urls, options = {}) {
  return urls.map(url => cleanURL(url, options));
}

/**
 * Extract and clean URLs from text
 * @param {string} text - Text containing URLs
 * @returns {Object} Extraction and cleaning results
 */
function cleanURLsInText(text, options = {}) {
  // URL regex pattern
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const urls = text.match(urlPattern) || [];
  
  const results = {
    originalText: text,
    cleanedText: text,
    foundUrls: urls.length,
    cleanedUrls: []
  };
  
  for (const url of urls) {
    const cleanResult = cleanURL(url, options);
    if (cleanResult.success && cleanResult.removed.length > 0) {
      results.cleanedText = results.cleanedText.replace(url, cleanResult.cleaned);
      results.cleanedUrls.push(cleanResult);
    }
  }
  
  return results;
}

/**
 * Generate a privacy report for a URL
 */
function generatePrivacyReport(urlString) {
  const analysis = analyzeURL(urlString);
  
  if (analysis.error) {
    return { error: analysis.error };
  }
  
  const cleanResult = cleanURL(urlString);
  
  return {
    domain: analysis.domain,
    trackingFound: analysis.trackingParams.length,
    riskScore: analysis.riskScore,
    riskLevel: analysis.riskScore > 5 ? 'high' : analysis.riskScore > 2 ? 'medium' : 'low',
    trackers: analysis.trackingParams,
    hashTracking: analysis.hashTracking,
    cleanedUrl: cleanResult.cleaned,
    sizeSaved: cleanResult.sizeSaved,
    platforms: [...new Set(analysis.trackingParams.map(t => t.platform))]
  };
}

// ===== Utility Functions =====

function truncateValue(value, maxLength = 30) {
  if (!value) return '';
  return value.length > maxLength ? value.substring(0, maxLength) + '...' : value;
}

/**
 * Check if a URL contains any tracking parameters
 */
function hasTracking(urlString) {
  const analysis = analyzeURL(urlString);
  return !analysis.error && analysis.trackingParams.length > 0;
}

/**
 * Get a list of all known tracking parameters
 */
function getKnownTrackers() {
  const all = [];
  for (const [platform, params] of Object.entries(TRACKING_PARAMS)) {
    for (const param of params) {
      all.push({ param, platform });
    }
  }
  return all;
}

// ===== Export =====
export {
  analyzeURL,
  cleanURL,
  cleanURLs,
  cleanURLsInText,
  generatePrivacyReport,
  hasTracking,
  getKnownTrackers,
  TRACKING_PARAMS,
  PRESERVE_PARAMS
};
