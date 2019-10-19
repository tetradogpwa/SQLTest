const CACHE_VERSION = 1.0;
const CACHE_INMUTABLE = "CACHE_INMUTABLE_SQLTest";
const CACHE_DINAMICO = "CACHE_DINAMICO_SQLTest";
const INMUTABLES = [];


self.addEventListener('install', e => {

    e.waitUntil(caches.open(CACHE_INMUTABLE)
        .then(cache => {

            return cache.addAll(INMUTABLES);

        }));

});

self.addEventListener('activate', e => {

    e.waitUntil(Promise.all([DeleteCache(CACHE_INMUTABLE), DeleteCache(CACHE_DINAMICO)]));



});

self.addEventListener('fetch', e => {

    e.respondWith(caches.match(e.request).then(resp => {
        var respuesta;
        if (resp)
            respuesta = resp;
        else {
            respuesta = fetch(e.request)
                .then(data => {
                    return caches.open(CACHE_DINAMICO)
                        .then(cache => {
                            cache.put(e.request, data.clone());
                            return data;
                        });
                });
        }
        return respuesta;

    }));

});

function DeleteCache(name) {
    return new Promise((okey, error) => {
        caches.open(name).then(cache => {

            cache.keys().then(keys => keys.forEach(
                key => {
                    cache.delete(key);

                }
            ));
        });
        okey();
    });

}