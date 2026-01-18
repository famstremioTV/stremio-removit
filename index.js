const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Filter configuration
const FILTER_CONFIG = {
    // Block these countries completely
    blockedCountries: ['China', 'India', 'Hong Kong', 'Taiwan'],
    
    // Korean content rules
    koreanRules: {
        blockedGenres: ['Drama', 'Romance', 'Comedy'],
        // Korean drama is usually Drama + at least one of these
        kdramaCombos: [['Drama', 'Romance'], ['Drama', 'Comedy'], ['Drama', 'Medical']],
        keepGenres: ['Thriller', 'Horror', 'Sci-Fi', 'Action', 'Crime']
    },
    
    // Keywords to block (case insensitive)
    blockedKeywords: [
        'k-drama', 'kdrama', 'korean drama',
        'cdrama', 'chinese drama',
        'bollywood', 'tollywood', 'kollywood'
    ]
};

// Smart Korean content filter
function isUnwantedKorean(item) {
    const genres = item.genres || [];
    const country = item.country || [];
    
    // Only apply to Korean content
    if (!country.includes('South Korea') && !country.includes('Korea')) {
        return false;
    }
    
    // Always keep thrillers/horror/sci-fi
    const hasGoodGenre = FILTER_CONFIG.koreanRules.keepGenres.some(g => genres.includes(g));
    if (hasGoodGenre) return false;
    
    // Check for K-drama combos
    const comboMatch = FILTER_CONFIG.koreanRules.kdramaCombos.some(combo => 
        combo.every(genre => genres.includes(genre))
    );
    
    if (comboMatch) return true;
    
    // Check title/description for K-drama indicators
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();
    const hasDrama = text.includes('drama') && text.includes('korean');
    const hasEpisodeNumbers = /\b(episode|ep\.?|第)\s*\d+/i.test(text);
    
    return hasDrama || hasEpisodeNumbers;
}

// Main filter function
function shouldFilterItem(item) {
    // Check country block
    const country = item.country || [];
    const hasBlockedCountry = FILTER_CONFIG.blockedCountries.some(c => country.includes(c));
    if (hasBlockedCountry) return true;
    
    // Check Korean content
    if (isUnwantedKorean(item)) return true;
    
    // Check keywords
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();
    const hasBlockedKeyword = FILTER_CONFIG.blockedKeywords.some(kw => text.includes(kw));
    if (hasBlockedKeyword) return true;
    
    return false;
}

// Proxy to real addons
const UPSTREAM_ADDONS = [
    'https://v3-cinemeta.strem.io',
    // Add your other addon URLs here
];

async function fetchFromUpstream(type, id) {
    for (const baseUrl of UPSTREAM_ADDONS) {
        try {
            const url = `${baseUrl}/${type}/${id}.json`;
            console.log('Fetching from:', url);
            const response = await axios.get(url, { timeout: 5000 });
            if (response.data && response.data.metas) {
                return response.data;
            }
        } catch (err) {
            console.log('Failed to fetch from', baseUrl, err.message);
            continue;
        }
    }
    return { metas: [] };
}

// Create addon
const builder = new addonBuilder({
    id: 'org.stremio.removit',
    version: '1.0.0',
    name: 'Removit Content Filter',
    description: 'Filters unwanted content from your catalogs',
    resources: ['catalog', 'meta'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb']
});

// Catalog handler
builder.defineCatalogHandler(async ({ type, id, extra }) => {
    console.log('Catalog request:', { type, id, extra });
    
    const upstreamData = await fetchFromUpstream('catalog', `${type}/${id}`);
    
    if (!upstreamData.metas) {
        return { metas: [] };
    }
    
    // Filter items
    const filteredMetas = upstreamData.metas.filter(item => !shouldFilterItem(item));
    
    console.log(`Filtered ${upstreamData.metas.length - filteredMetas.length} items`);
    
    return {
        metas: filteredMetas,
        cacheMaxAge: 3600
    };
});

// Meta handler (for individual item details)
builder.defineMetaHandler(async ({ type, id }) => {
    console.log('Meta request:', { type, id });
    
    const upstreamData = await fetchFromUpstream('meta', `${type}/${id}`);
    
    if (!upstreamData.meta || shouldFilterItem(upstreamData.meta)) {
        return { meta: null };
    }
    
    return {
        meta: upstreamData.meta,
        cacheMaxAge: 3600
    };
});

// Start server
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 }, (err, url) => {
    if (err) {
        console.error('Error starting server:', err);
        process.exit(1);
    }
    console.log('Removit Filter running on:', url);
    console.log('Configured to filter:', FILTER_CONFIG);
});
