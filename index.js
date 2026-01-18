const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

const AIO_URL = "https://aiometadata.stremio.ru/stremio/13771301-c143-4a9a-9c9c-d588609a944c";
const TMDB_API_KEY = process.env.TMDB_API_KEY || "c5ac73f999688f3863fbe5c6c905a189";

// Simple cache to reduce TMDB calls
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getTMDBInfo(imdbId, title, type) {
    const cacheKey = imdbId || title;
    const cached = cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    
    try {
        let tmdbData = null;
        
        // Try by IMDb ID first
        if (imdbId && imdbId.startsWith('tt')) {
            const response = await axios.get(
                `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
                { timeout: 5000 }
            );
            
            const results = response.data.tv_results || response.data.movie_results;
            if (results && results.length > 0) {
                tmdbData = results[0];
            }
        }
        
        // If not found by IMDb, try search by title
        if (!tmdbData && title) {
            const searchType = type === 'series' ? 'tv' : 'movie';
            const searchResponse = await axios.get(
                `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`,
                { timeout: 5000 }
            );
            
            if (searchResponse.data.results && searchResponse.data.results.length > 0) {
                // Get the first result (most popular)
                const tmdbId = searchResponse.data.results[0].id;
                const detailsResponse = await axios.get(
                    `https://api.themoviedb.org/3/${searchType}/${tmdbId}?api_key=${TMDB_API_KEY}`,
                    { timeout: 5000 }
                );
                tmdbData = detailsResponse.data;
            }
        }
        
        if (tmdbData) {
            cache.set(cacheKey, {
                data: tmdbData,
                timestamp: Date.now()
            });
        }
        
        return tmdbData;
        
    } catch (error) {
        console.error('TMDB API Error:', error.message);
        return null;
    }
}

function shouldFilter(item, tmdbData) {
    if (!item) return false;
    
    // If no TMDB data, fallback to simple checks
    if (!tmdbData) {
        const text = (item.name + ' ' + (item.description || '')).toLowerCase();
        return text.includes('k-drama') || 
               text.includes('korean drama') ||
               text.includes('chinese drama') ||
               text.includes('bollywood');
    }
    
    // Use TMDB data for accurate filtering
    const countries = tmdbData.production_countries || tmdbData.origin_country || [];
    const genres = tmdbData.genres || [];
    const genreNames = genres.map(g => g.name);
    
    // Check if Korean content
    const isKorean = countries.some(c => 
        (c.iso_3166_1 === 'KR') || (c === 'KR') || 
        (typeof c === 'string' && c.includes('Korea'))
    );
    
    // Check if Chinese content
    const isChinese = countries.some(c => 
        (c.iso_3166_1 === 'CN') || (c === 'CN') || 
        (typeof c === 'string' && (c.includes('China') || c.includes('Taiwan') || c.includes('Hong Kong')))
    );
    
    // Check if Indian content
    const isIndian = countries.some(c => 
        (c.iso_3166_1 === 'IN') || (c === 'IN') || 
        (typeof c === 'string' && c.includes('India'))
    );
    
    // Block all Chinese/Indian content
    if (isChinese || isIndian) {
        console.log(`Blocking ${item.name} - Country: ${JSON.stringify(countries)}`);
        return true;
    }
    
    // Smart Korean filtering
    if (isKorean) {
        const hasDrama = genreNames.includes('Drama');
        const kdramaSubgenres = ['Romance', 'Comedy', 'Family', 'Medical'];
        const kdramaCount = genreNames.filter(g => kdramaSubgenres.includes(g)).length;
        
        const isKdrama = hasDrama && kdramaCount >= 2;
        
        if (isKdrama) {
            console.log(`Blocking Korean drama: ${item.name}, Genres: ${genreNames.join(', ')}`);
        } else {
            console.log(`Allowing Korean non-drama: ${item.name}, Genres: ${genreNames.join(', ')}`);
        }
        
        return isKdrama;
    }
    
    return false;
}

const builder = new addonBuilder({
    id: 'org.stremio.removit',
    version: '1.1.0',
    name: 'Removit TMDB Filter',
    description: 'Smart filtering using TMDB metadata',
    resources: ['catalog', 'meta'],
    types: ['movie', 'series'],
    catalogs: []
});

builder.defineCatalogHandler(async ({type, id}) => {
    try {
        const response = await axios.get(`${AIO_URL}/catalog/${type}/${id}.json`);
        const items = response.data.metas || [];
        
        console.log(`Processing ${items.length} items from AIO`);
        
        // Process items in parallel with rate limiting
        const filteredItems = [];
        for (const item of items) {
            const tmdbData = await getTMDBInfo(item.imdb_id, item.name, type);
            if (!shouldFilter(item, tmdbData)) {
                filteredItems.push(item);
            }
        }
        
        console.log(`Filtered ${items.length} → ${filteredItems.length} items`);
        return { metas: filteredItems };
        
    } catch (error) {
        console.error('Catalog Error:', error.message);
        return { metas: [] };
    }
});

builder.defineMetaHandler(async ({type, id}) => {
    try {
        const response = await axios.get(`${AIO_URL}/meta/${type}/${id}.json`);
        const meta = response.data.meta;
        
        if (!meta) return { meta: null };
        
        const tmdbData = await getTMDBInfo(meta.imdb_id, meta.name, type);
        if (shouldFilter(meta, tmdbData)) {
            console.log(`Filtering meta: ${meta.name}`);
            return { meta: null };
        }
        
        return { meta };
        
    } catch (error) {
        console.error('Meta Error:', error.message);
        return { meta: null };
    }
});

serveHTTP(builder.getInterface(), { port: 7000 });
console.log('Removit TMDB Filter running');
console.log('TMDB API Key:', TMDB_API_KEY ? 'Loaded' : 'Missing');
