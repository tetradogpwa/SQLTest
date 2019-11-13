const CACHE_VERSION_ANTERIOR = 32; //subo aqui para no tener problemas :D
const CACHE_VERSION = CACHE_VERSION_ANTERIOR + 1;
const APP = "SQLTest";
const CACHE_INMUTABLE = "CACHE_INMUTABLE_" + APP;
const CACHE_SHELL = "CACHE_SHELL_" + APP;
const CACHE_DINAMICO = "CACHE_DINAMICO_" + APP;
const INMUTABLES = [
    //como no va cambiar mejor que se descargue solo una vez :)
    ROOT + "BDSql/sql-wasm.js",
    ROOT + "BDSql/sql-wasm.wasm",

];
const SHELL = [

    "index.html",
    "style.css",
    "images/icons/icon-144x144.png",
    "images/icons/icon-512x512.png",
    "sw.js",
    "main.js",
    "manifest.json",


    ROOT + "BDSql/bd.js",

    ROOT + "Utils/Utils.js",
    ROOT + "Utils/IndexedBDUtils.js",
    ROOT + "Utils/NodeListUtils.js",
    ROOT + "Utils/SelectUtils.js",
    ROOT + "Utils/ArrayUtils.js",
    ROOT + "Utils/ByteArrayUtils.js",
    ROOT + "Utils/CacheUtils.js",
    ROOT + "Utils/StringUtils.js",
    ROOT + "Utils/ZipUtils.js",

];


self.addEventListener('install', e => {

    var inmutables = self.FetchCache(CACHE_INMUTABLE, INMUTABLES, true);
    var shell = self.FetchCache(CACHE_SHELL + CACHE_VERSION, SHELL);
    console.log("installing version " + CACHE_VERSION);
    e.waitUntil(Promise.all([inmutables, shell]));

});


self.addEventListener('activate', e => {
    console.log("uninstalling version " + CACHE_VERSION_ANTERIOR);
    e.waitUntil(Promise.all([
        caches.delete(CACHE_SHELL + CACHE_VERSION_ANTERIOR),
        caches.delete(CACHE_DINAMICO + CACHE_VERSION_ANTERIOR)
    ]));

});

self.addEventListener('fetch', e => {

    e.respondWith(caches.match(e.request).then(resp => {
        var respuesta;
        if (resp)
            respuesta = resp;
        else {
            respuesta = fetch(e.request)
                .then(data => {
                    return caches.open(CACHE_DINAMICO + CACHE_VERSION)
                        .then(cache => {
                            cache.put(e.request, data.clone());
                            return data;
                        });
                });
        }
        return respuesta;

    }));

});



function FetchCache(cache_name, urls, ifNotExist = false) {
    return caches.open(cache_name)
        .then(cache => {
            if (ifNotExist)
                cache.match(urls[0]).then((match) => { if (!match) cache.addAll(urls); });
            else cache.addAll(urls);
        });
}
