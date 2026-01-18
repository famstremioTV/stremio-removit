const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Your filter rules
const filterRules = {
    blockCountries: ['China', 'India', 'South Korea'],
    blockKeywords: ['k-drama', 'kdrama', 'chinese drama', 'bollywood', 'tollywood'],
    allowKoreanGenres: ['Thriller', 'Horror', 'Sci-Fi', 'Action']
};

const builder = new addonBuilder({
    id: 'org.stremio.removit',
    version: '1.0.0',
    name: 'Removit Filter',
    description: 'Filters unwanted content',
    resources: ['catalog', 'meta'],
    types: ['movie', 'series'],
    catalogs: []
});

// Filtering logic
function shouldFilter(item) {
    if (!item) return false;
    
    // Check country
    if (item.country && filterRules.blockCountries.some(c => 
        item.country.includes(c))) return true;
    
    // Check title/description
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();
    if (filterRules.blockKeywords.some(kw => text.includes(kw))) return true;
    
    return false;
}

// Proxy handler
builder.defineCatalogHandler(async ({type, id, extra}) => {
    try {
        // Forward to Cinemeta (change to your AIO URL if needed)
        const response = await axios.get(`https://v3-cinemeta.strem.io/catalog/${type}/${id}.json`);
        const filtered = response.data.metas.filter(item => !shouldFilter(item));
        return { metas: filtered };
    } catch (error) {
        console.error('Error:', error.message);
        return { metas: [] };
    }
});

builder.defineMetaHandler(async ({type, id}) => {
    try {
        const response = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`);
        const meta = response.data.meta;
        if (shouldFilter(meta)) {
            return { meta: null }; // Filter out
        }
        return { meta };
    } catch (error) {
        return { meta: null };
    }
});

serveHTTP(builder.getInterface(), { port: 7000 });
console.log('Removit filter running on port 7000');
