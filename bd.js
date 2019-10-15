//import
importScripts("utils.js");
importScripts("sql-wasm.js");

class BD {
    static HEADERLOCALHOST = "BDSQL";
    //constructores

    constructor(idBD = "") {
        this._idBD = idBD;
        Load(this._idBD).then(() => {
            if (this._bd == null)
                this.Init();
        });
    }
    Init() {
        this._bd = new SQL.Database();
        this._idBD = new Date().getTime();
    }

    //propiedades
    get IdBD() {
            return this._idBD;
        }
        //metodos cargar/guardar
    Load(idBD) {
        return new Promise((okey, error) => {
            try {
                var bdJSON = localStorage.getItem(idBD);
                if (bdJSON != null) {
                    this.Import(JSON.parse(bdJSON)).then(() => okey());

                } else okey();
            } catch (ex) {
                error(ex);
            }
        });
    }
    Save() {
        return new Promise((okey, error) => {
            try {
                this.Import().then(data => localStorage.setItem(this._idBD, JSON.stringify(data)));
                okey();
            } catch (ex) {
                error(ex);
            }
        });
    }
    Export() {
        return new Promise((okey, error) => {
            var
            try {
                okey(this._bd.export());
            } catch (ex) {
                error(ex);
            }
        });
    }
    Import(bdBin) {
            return new Promise((okey, error) => {

                try {
                    this._bd = new SQL.Database(new Uint8Array(bdBin));
                    okey(this);
                } catch (ex) {
                    error(ex);
                }
            });
        }
        //SQL
    Eject(strSQL, ...args) {
        return new Promise((okey, error) => {

            try {
                okey(this._bd.exec(strSQL));
            } catch (ex) {
                error(ex);
            }
        });

    }
    Run(strSQL, ...args) {
        return new Promise((okey, error) => {

            try {
                strSQL = strSQL.Format(args);
                this._bd.run(strSQL);
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
            try {
                bds = [];
                for (var i = 0; i < localStorage.lenght; i++) {
                    if (String(localStorage[i]).startsWith(HEADERLOCALHOST)) {

                        bds.push(new BD(String(localStorage[i]).replace(this.HEADERLOCALHOST, "")));

                    }
                }
                okey(bds);
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