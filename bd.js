//import
Import("utils.js");
Import("sql-wasm.js");



function Import(file) {
    //source:http://www.forosdelweb.com/f13/importar-archivo-js-dentro-javascript-387358/
    document.write('<script language=\"JavaScript\" type=\"text/JavaScript\" src=' + file + '></script>');
}


class BD {

    static get HEADERLOCALHOST() { return "BDSQL" };

    //constructores

    constructor(idBD = "") {

        this.IdBD = idBD;
        if (this.IdBD != "") {
            this.Init = this.Load(this.IdBD);
        } else {
            this.Init = initSqlJs().then(SQL => {
                this._bd = new SQL.Database();
                this.IdBD = BD.HEADERLOCALHOST + new Date().getTime();
            });
        }
    }
    static set CacheName(cacheBD) {
        if (BD._CacheName && caches.has(BD_CacheName)) {
            caches.open(BD._CacheName).then((cacheOut) => {

                caches.delete(BD._CacheName).finally(() => {
                    caches.delete(cacheBD).finally(() => {
                        BD._CacheName = cacheBD;
                        caches.open(BD._CacheName).then((cacheIn) => {

                            cacheOut.keys().then((keys) => {
                                for (k in keys) {
                                    cacheIn.put(keys[k], cacheOut[keys[k]]);
                                }
                            });

                        });
                    });
                });
            });
        } else BD._CacheName = cacheBD;

    }
    static get CacheName() {
            if (!BD._CacheName)
                BD._CacheName = "CACHE_BD";
            return BD._CacheName;
        }
        //propiedades
    get IdBD() {
        return this._idBD;
    }
    set IdBD(id) {
            this._isChanged = false;
            caches.open(BD.CacheName).then((cache) => {
                if (this._idBD in cache) {
                    {
                        cache.delete(this._idBD);
                    }
                    this._idBD = id;
                }
            }).finally(() => this._isChanged = true);
        }
        //metodos cargar/guardar
    Load(idBD) {
        return new Promise((okey, error) => {
            caches.open(BD.CacheName).then((cache) => {
                while (!this._isChanged);
                if (idBD in cache) {
                    this.Import(cache[idBD]).then(() => okey()).catch(error);

                } else okey();

            })


        });
    }
    Save() {
        return new Promise((okey, error) => {
            this.Export()
                .then(data => {
                    caches.open(BD.CacheName).then((cache) => {
                        while (!this._isChanged);
                        cache[this.IdBD] = data;
                        okey();
                    });
                }).catch(error);
        });
    }
    Export() {
        return new Promise((okey, error) => okey(ByteArrayUtils.ToHex(this._bd.export())).catch(error));
    }

    Import(dataBD) {
        return new Promise((okey, error) => initSqlJs().then(SQL => {
            this._bd = new SQL.Database(ByteArrayUtils.ToByteArray(dataBD));
            okey(this);
        }).catch(error));
    }

    ExecuteURL(url, args, tratarRespuestaFetch = (r) => r.text()) {
            return fetch(url).then((result) => {
                if (result.ok)
                    return tratarRespuestaFetch(result);
                else throw "No se puede obtener url=" + url;
            }).then((data) => this.Execute(data, args));
        }
        //SQL
    Execute(strSQL, ...args) {
        return new Promise((okey, error) => okey(this._bd.exec(StringUtils.Format(strSQL, args))).catch(error));
    }

    Run(strSQL, ...args) {
        return new Promise((okey, error) => {

            try {
                this._bd.run(StringUtils.Format(strSQL, args));
                okey();
            } catch (ex) {
                error(ex);
            }
        });

    }
    Delete(tableName) {
        return this.Run("delete table " + tableName + ";");
    }
    Drop(tableName) {
        return this.Run("drop table " + tableName + ";");
    }
    Clone() {
            return new Promise((okey, error) => {
                var clon = new BD();
                this.Export().then(e => clon.Import(e))
                    .then(() => okey(clon)).catch(error);

            });
        }
        //cargar/guardar
    static LoadAll() {
        return new Promise((okey, error) => {
            var bds = [];
            var initBDS = [];
            var key;
            caches.open(BD.CacheName).then((cache) => {
                cache.keys().then((keys) => {
                    for (var i = 0; i < keys.length; i++) {
                        key = String(keys[i]);
                        if (key.startsWith(BD.HEADERLOCALHOST)) {

                            bds.push(new BD(key));
                            initBDS.push(bds[bds.length - 1].Init);
                        }
                    }
                    Promise.all(initBDS).then(() => okey(bds)).catch(error);

                });
            });

        });
    }

    static SaveAll(...bds) {
        return new Promise((okey, error) => {
            var savs = [];
            bds = ArrayUtils.Root(bds);
            for (var i = 0; i < bds.length; i++) {
                savs.push(bds[i].Save());
            }
            Promise.all(savs).then(() => okey()).catch(error);

        });
    }

    static ResultToString(result) {
        var text = "";
        if (result.length != 0) {
            for (var j = 0; j < result.length; j++) {
                text += j + ":" + BD._filaToString(result[j].columns);
                for (i in result[j].values)
                    text += BD._filaToString(result[j].values[i]);
            }
        } else text = "No result from SQLite!";

        return text;
    }

    static _filaToString(array) {
        var fila = "";
        for (var i = 0; i < array.length; i++) {
            fila += "\t" + array[i];
        }
        fila += "\n";

        return fila;
    }

}