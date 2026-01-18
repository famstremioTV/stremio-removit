const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Your AIO instance URL
const AIO_URL = "https://aiometadata.stremio.ru/stremio/13771301-c143-4a9a-9c9c-d588609a944c";

// Filter rules
const filterRules = {
    blockCountries: ['China', 'India', 'South Korea', 'Taiwan', 'Hong Kong'],
    blockKeywords: [
        'k-drama', 'kdrama', 'korean drama', 
        'chinese drama', 'cdrama', 'historical drama',
        'bollywood', 'tollywood', 'indian cinema',
        '한국 드라마', '중국 드라마', '印度电影'
    ],
    blockGenres: ['Korean Drama', 'Chinese Drama', 'Indian Cinema'],
    allowKoreanGenres: ['Thriller', 'Horror', 'Sci-Fi', 'Action', 'Crime']
};

// Smart Korean content filtering
function isUnwantedKorean(item) {
    if (!item.country || !item.country.includes('South Korea')) return false;
    
    const genres = item.genres || [];
    const hasDrama = genres.includes('Drama');
    const kdramaSubgenres = ['Romance', 'Comedy', 'Medical', 'Legal', 'Family', 'Melodrama'];
    const kdramaCount = genres.filter(g => kdramaSubgenres.includes(g)).length;
    
    // If it's Drama + 2+ typical K-drama subgenres → filter
    if (hasDrama && kdramaCount >= 2) return true;
    
    // Check title/description for K-drama patterns
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();
    const kdramaPatterns = [
        /episode \d+/, /season \d+/, /^.*\d{4}$/,
        /hospital|doctor|lawyer|ceo|prosecutor/,
        /fated|destiny|first love|contract marriage/
    ];
    
    return kdramaPatterns.filter(p => p.test(text)).length >= 2;
}

function shouldFilter(item) {
    if (!item) return false;
    
    // 1. Block all Chinese/Indian content
    if (item.country && filterRules.blockCountries.some(c => 
        item.country.includes(c))) {
        // Check if Korean (needs special handling)
        if (item.country.includes('South Korea')) {
            return isUnwantedKorean(item);
        }
        // Chinese/Indian - always block
        return true;
    }
    
    // 2. Keyword blocking
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();
    if (filterRules.blockKeywords.some(kw => text.includes(kw))) return true;
    
    // 3. Genre blocking
    if (item.genres && filterRules.blockGenres.some(g => 
        item.genres.includes(g))) return true;
    
    return false;
}

const builder = new addonBuilder({
    id: 'org.stremio.removit',
    version: '1.0.2',
    name: 'Removit AIO Filter',
    description: 'Filters Korean dramas, Chinese & Indian content from AIO',
    resources: ['catalog', 'meta'],
    types: ['movie', 'series'],
    catalogs: []
});

// Proxy to AIO
builder.defineCatalogHandler(async ({type, id, extra}) => {
    try {
        const response = await axios.get(`${AIO_URL}/catalog/${type}/${id}.json`);
        console.log(`Filtering catalog ${type}/${id}, received ${response.data.metas?.length || 0} items`);
        const filtered = response.data.metas.filter(item => !shouldFilter(item));
        console.log(`Filtered to ${filtered.length} items`);
        return { metas: filtered };
    } catch (error) {
        console.error('AIO Catalog Error:', error.message);
        return { metas: [] };
    }
});

builder.defineMetaHandler(async ({type, id}) => {
    try {
        const response = await axios.get(`${AIO_URL}/meta/${type}/${id}.json`);
        const meta = response.data.meta;
        const filter = shouldFilter(meta);
        console.log(`Meta check ${type}/${id}: ${filter ? 'FILTERED' : 'ALLOWED'}`);
        if (filter) {
            return { meta: null };
        }
        return { meta };
    } catch (error) {
        console.error('AIO Meta Error:', error.message);
        return { meta: null };
    }
});

serveHTTP(builder.getInterface(), { port: 7000 });
console.log('Removit AIO Filter running on port 7000');
console.log('Filtering from:', AIO_URL);
console.log('Filter rules loaded:', Object.keys(filterRules).join(', '));
