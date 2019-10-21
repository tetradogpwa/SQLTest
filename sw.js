const CACHE_VERSION_ANTERIOR = 1; //subo aqui para no tener problemas :D
const CACHE_VERSION = CACHE_VERSION_ANTERIOR + 1;

const CACHE_INMUTABLE = "CACHE_INMUTABLE_SQLTest";
const CACHE_SHELL = "CACHE_SHELL_SQLTest";
const CACHE_DINAMICO = "CACHE_DINAMICO_SQLTest";
const INMUTABLES = [

    "sql-wasm.js",
    "sql-wasm.wasm",




];
const SHELL = [

    "index.html",
    "style.css",
    "main.js",
    "bd.js",
    "utils.js",
    "manifest.json"

];


self.addEventListener('install', e => {

    var inmutables = self.FetchCache(CACHE_INMUTABLE + CACHE_VERSION, INMUTABLES);
    var shell = self.FetchCache(CACHE_SHELL + CACHE_VERSION, SHELL);
    console.log("installing version " + CACHE_VERSION);
    e.waitUntil(Promise.all(inmutables, shell));

});


self.addEventListener('activate', e => {
    console.log("uninstalling version " + CACHE_VERSION_ANTERIOR);
    e.waitUntil(Promise.all(caches.delete(CACHE_INMUTABLE + CACHE_VERSION_ANTERIOR),
        caches.delete(CACHE_SHELL + CACHE_VERSION_ANTERIOR)));

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



function FetchCache(cache_name, urls) {
    return caches.open(cache_name)
        .then(cache => {

            cache.addAll(urls);

        });
}