//import
Import("utils.js");
Import("sql-wasm.js");



function Import(file) {
    //source:http://www.forosdelweb.com/f13/importar-archivo-js-dentro-javascript-387358/
    document.write('<script language=\"JavaScript\" type=\"text/JavaScript\" src=' + file + '></script>');
}


class BD {

    static get Header() {
        if (!BD._Header)
            BD._Header = "BDSQL";
        return BD._Header;
    }
    static set Header(header) {
        BD._Header = header;
    }

    //constructores

    constructor(idBD = "") {

        this.IdBD = idBD;
        if (this.IdBD != "") {
            this.Init = this.Load(this.IdBD);
        } else {
            this.Init = initSqlJs().then(SQL => {
                this._bd = new SQL.Database();
                this.IdBD = BD.Header + new Date().getTime();
            });
        }
    }



    static get CacheNameBD() {
        return caches.open("BD.Name");
    }

    static get CacheDataBD() {
        return caches.open("BD.Data");
    }



    get Name() {
        if (!this._name)
            this._name = "BDName" + new Date().getTime();
        return this._name;
    }
    set Name(name) {
        this._name = name;

    }


    //metodos cargar/guardar
    Load(idBD) {
        return new Promise((okey, error) => {
            BD.CacheDataBD.then((cache) => {

                if (idBD in cache) {
                    this.Import(cache[idBD]).then(() => {

                        BD.CacheNameBD.then((cacheName) => {
                            this.Name = cacheName[idBD];
                            okey(this);
                        });


                    }).catch(error);

                } else error("imposible load id='" + idBD + "' not found.");

            });


        });
    }
    Save() {
        return new Promise((okey, error) => {
            this.Export()
                .then(data => {
                    BD.CacheDataBD.then((cache) => {
                        //set data
                        cache.put(this.idBD, data);
                        BD.CacheNameBD.then((cacheNames) => {
                            //set name
                            cacheNames.put(this.IdBD, this.Name);
                            okey(this);
                        })

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
                    .then(() => { clon.Name = this.Name + "_Clon";
                        okey(clon); }).catch(error);

            });
        }
        //cargar/guardar
    static LoadAll() {
        return new Promise((okey, error) => {
            var bds = [];
            var initBDS = [];
            var key;
            BD.CacheDataBD.then((cache) => {
                cache.keys().then((keys) => {
                    for (var i = 0; i < keys.length; i++) {
                        key = String(keys[i]);
                        if (key.startsWith(BD.Header)) {

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
    static DeleteFromCache(...bds) {
        bds = ArrayUtils.Root(bds);
        return BD.CacheDataBD.then((cacheData) => {
            BD.CacheNameBD.then((cacheName) => {
                for (i in bds) {
                    cacheData.Delete(bds[i].IdBD);
                    cacheName.Delete(bds[i].IdBD);
                }

            });

        });
    }


    //string result part
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