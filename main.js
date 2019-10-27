Import("bd.js");
Import("sw.js");

function Import(file) {
    //source:http://www.forosdelweb.com/f13/importar-archivo-js-dentro-javascript-387358/
    document.write('<script language=\"JavaScript\" type=\"text/JavaScript\" src=' + file + '></script>');
}

//asi si le cambio el nombre no tendré problemas :)
var cmbBDId = "cmbBD";
var txtSqlId = "txtSql";
var txtResultId = "txtResult";
var loaderId = "loader";
var contentBoxId = "contentBox";
var postLoaderClass = "postLoader";
//inicializo la lista
var dataBaseList = [];

window.onload = () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/SQLTest/sw.js');
        BD.Header = "BD_SQLTester";
        BD.LoadAll().then((bds) => {
            var promesa;

            if (bds.length == 0)
                promesa = NewBD();
            else {
                promesa = new Promise((okey, error) => {
                    for (var i = 0; i < bds.length; i++)
                        AddToList(bds[i]);
                    okey();
                });
            }
            promesa.then(() => {
                //quito el loader :)
                document.getElementById(loaderId).remove();
                document.getElementById(contentBoxId).classList.remove(postLoaderClass);
            });



        });
    } else alert("Imposible work in this Browser!!");


};

function DataBase() {
    return dataBaseList[document.getElementById(cmbBDId).selectedIndex];
}

function NewBD() {
    //crea una BD nueva y la añade a la lista
    var bd = new BD();
    return bd.Init.then(() => {
        AddToList(bd);
    });
}

function CloneBD() {
    //clona la BD actual y la añade a la lista
    return DataBase().Clone().then(AddToList);
}

function AddToList(bd) {
    //añade a la lista y al cm
    var cmb = document.getElementById(cmbBDId);
    SelectUtils.Add(cmb, bd.IdBD, bd.Name);
    ArrayUtils.Add(dataBaseList, bd);
}

function DeleteBD() {
    //elimino la BD actual
    var cmb = document.getElementById(cmbBDId);
    var db = DataBase();
    var pos = SelectUtils.FindPositions(cmb, db.IdBD)[0];

    if (pos > -1) {
        BD.DeleteFromCache(db);
        ArrayUtils.RemoveAt(dataBaseList, db);
        SelectUtils.RemoveAt(cmb, pos);
    }
}

function Save() {
    DataBase().Save().then((bd) => alert("saved successfully bd=" + bd.Name));
}

function UpLoadBD() {
    //pide unos archivos miro si son SQLite y luego los añado

}

function DownloadBD() {
    Download(DataBase());
}

function Download(bd) {

    bd.Export().then((data) => {
        DownloadFile(bd.Name + ".sqlite", data, "application/octet-stream");

    });
}

function SaveAll() {
    BD.SaveAll(dataBaseList).then(() => alert("all saved successfully "));
}

function DownloadAllBD() {
    for (var i = 0; i < dataBaseList.length; i++)
        Download(dataBaseList[i]);
}

function ExecuteSQL() {
    var SQLSentence = document.getElementById(txtSqlId).innerText;
    var txtResult = document.getElementById(txtResultId);
    var selectedBD = DataBase();
    selectedBD.Execute(SQLSentence)
        .then((result) => {
            txtResult.value = "BD='" + selectedBD.Name + "' result:'" + BD.ResultToString(result) + "'";
            localStorage.setItem(SQLSENTENCE, SQLSentence);
        }).catch((error) => {
            txtResult.value = "BD='" + selectedBD.Name + "' '" + error + "'";
        });

}

function Clear() {
    document.getElementById(txtSqlId).innerText = "";
}