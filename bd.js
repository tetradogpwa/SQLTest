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
            this.Init = Load(this.IdBD);
        } else {
            this.Init = initSqlJs().then(SQL => {
                this._bd = new SQL.Database();
                this.IdBD = BD.HEADERLOCALHOST + new Date().getTime();
            });
        }
    }

    //propiedades
    get IdBD() {
        return this._idBD;
    }
    set IdBD(id) {
            this._idBD = id;
        }
        //metodos cargar/guardar
    Load(idBD) {
        return new Promise((okey, error) => {
            try {
                var data = localStorage.getItem(idBD);
                if (data != null) {
                    this.Import(data).then(() => okey());

                } else okey();
            } catch (ex) {
                error(ex);
            }
        });
    }
    Save() {
        return new Promise((okey, error) => {
            try {
                this.Export().then(data => localStorage.setItem(this.IdBD, data));
                okey();
            } catch (ex) {
                error(ex);
            }
        });
    }
    Export() {
        return new Promise((okey, error) => {

            try {
                okey(ByteArrayUtils.ToByteArray(this._bd.export()));
            } catch (ex) {
                error(ex);
            }
        });
    }
    Import(dataBD) {
            return new Promise((okey, error) => {

                try {
                    initSqlJs().then(SQL => {
                        this._bd = new SQL.Database(new Uint8Array(ByteArrayUtils.ToBase64(dataBD)));
                        okey(this);
                    });
                } catch (ex) {
                    error(ex);
                }
            });
        }
        //SQL
    Eject(strSQL, ...args) {
        return new Promise((okey, error) => {

            try {
                okey(this._bd.exec(StringUtils.Format(strSQL, args)));
            } catch (ex) {
                error(ex);
            }
        });

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
                var clon;
                try {
                    clon = new BD();
                    this.Export().then(e => clon.Import(e))
                        .then(() => okey(clon));
                } catch (ex) {
                    error(ex);
                }
            });

        }
        //cargar/guardar
    static LoadAllBD() {
        return new Promise((okey, error) => {
            var bds;
            var initBDS;
            try {
                bds = [];
                initBDS = [];
                for (var i = 0; i < localStorage.lenght; i++) {
                    if (String(localStorage[i]).startsWith(BD.HEADERLOCALHOST)) {

                        bds.push(new BD(String(localStorage[i])));
                        initBDS.push(bds[bds.length - 1].Init);
                    }
                }
                Promise.all(initBDS).then(() => okey(bds));
            } catch (ex) {
                error(ex);
            }
        });
    }

    static SaveAllBD(...bds) {
        return new Promise((okey, error) => {
            var savs = []
            try {

                for (i in bds) {
                    savs.push(bds[i].Save());
                }
                Promise.all(savs).then(() => okey());
            } catch (ex) {
                error(ex);
            }
        });
    }

}