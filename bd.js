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

            var data = localStorage.getItem(idBD);
            if (data != null) {
                this.Import(data).then(() => okey()).catch(error);

            } else okey();

        });
    }
    Save() {
        return new Promise((okey, error) => {
            this.Export()
                .then(data => {
                    localStorage.setItem(this.IdBD, data);
                    okey();
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
            for (var i = 0; i < localStorage.length; i++) {
                key = String(localStorage.key(i));
                if (key.startsWith(BD.HEADERLOCALHOST)) {

                    bds.push(new BD(key));
                    initBDS.push(bds[bds.length - 1].Init);
                }
            }
            Promise.all(initBDS).then(() => okey(bds)).catch(error);

        });
    }

    static SaveAll(...bds) {
        return new Promise((okey, error) => {
            var savs = [];
            for (i in bds) {
                savs.push(bds[i].Save());
            }
            Promise.all(savs).then(() => okey()).catch(error);

        });
    }

}