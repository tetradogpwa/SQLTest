Import("bd.js");
Import("sw.js");

function Import(file) {
    //source:http://www.forosdelweb.com/f13/importar-archivo-js-dentro-javascript-387358/
    document.write('<script language=\"JavaScript\" type=\"text/JavaScript\" src=' + file + '></script>');
}

const SQLSENTENCE = "sql sentence";
//asi si le cambio el nombre no tendré problemas :)
var lstBDId = "lstBD";
var txtSqlId = "txtSql";
var txtResultId = "txtResult";
var loaderId = "loader";
var contentBoxId = "contentBox";
var postLoaderClass = "postLoader";
var hSelectedBDId = "hSelectedBD";

//inicializo la lista
var dataBaseList = [];

var selectedBD;

window.onload = () => {
    if ('serviceWorker' in navigator) {
        selectedBD = null;
        navigator.serviceWorker.register('/SQLTest/sw.js');
        BD.Header = "BD_SQLTester";
        document.getElementById(txtSqlId).value = localStorage[SQLSENTENCE] != undefined ? localStorage[SQLSENTENCE] : "";
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
                selectedIndex = 0;
                UpdateSelectedBD();
            });



        }).catch(alert);
    } else alert("Imposible work in this Browser!!");


};
window.onunload = () => {
    SaveAll();
}

function UpdateSelectedBD() {
    selectedBD = dataBaseList[selectedIndex];
    document.getElementById(hSelectedBDId).innerHTML = selectedBD.Name;

}


function ChangeText() {
    const OCULTO = "oculto";
    var sqlText = document.getElementById("sqlText");
    var outPutText = document.getElementById("outPutText");
    var hText = document.getElementById("hText");

    if (sqlText.classList.contains(OCULTO)) {
        sqlText.classList.remove(OCULTO);
        outPutText.classList.add(OCULTO);
        hText.innerHTML = "SQL:";
    } else {
        outPutText.classList.remove(OCULTO);
        sqlText.classList.add(OCULTO);
        hText.innerHTML = "OutPut:";
    }
}

function DataBase() {
    return selectedBD;
}


function NewBD() {
    //crea una BD nueva y la añade a la lista
    var bd = new BD();
    return bd.Init.then(() => {
        AddToList(bd);
    });
}

function Clone() {
    //clona la BD actual y la añade a la lista
    return DataBase().Clone().then((db) => db.Save()).then(AddToList);
}

function AddToList(bd) {
    //añade a la lista y al cm
    var ulBD = document.createElement("ul");
    ulBD.setAttribute("IdBD", bd.IdBD);
    ulBD.innerHTML = bd.Name;
    ulBD.onclick = (e) => {
        var encontrado = false;
        var idBD = e.target.getAttribute("IdBD");
        for (var index = 0; index < dataBaseList.length && !encontrado; index++) {
            encontrado = dataBaseList[index].IdBD == idBD;
            if (encontrado)
                selectedIndex = index;
        }
        if (encontrado)
            UpdateSelectedBD();

    }
    document.getElementById(lstBDId).appendChild(ulBD);
    ArrayUtils.Add(dataBaseList, bd);
}

function Delete() {
    //elimino la BD actual
    var lst = document.getElementById(lstBDId);
    var db = DataBase();
    var ulBD = null;

    for (var i = 0; i < lst.childNodes.length && ulBD == null; i++)
        if (lst.childNodes[i].getAttribute("IdBD") == bd.IdBD)
            ulBD = lst.childNodes[i];



    if (ulBD != null) {
        BD.DeleteFromCache(db)
            .then(() => ArrayUtils.Remove(dataBaseList, db))
            .then(() => {
                ulBD.remove();
                if (dataBaseList.length == 0) {
                    NewBD().then(() => SaveAll());
                }
            });
    }
}

function Save() {
    DataBase().Save().then((bd) => alert("saved successfully bd=" + bd.Name));
}

function UpLoad() {
    //pide unos archivos miro si son SQLite y luego los añado

}

function Download() {
    _Download(DataBase());
}

function _Download(bd) {

    bd.Export().then((data) => {
        DownloadFile(bd.Name + ".sqlite", data, "application/octet-stream");

    });
}

function SaveAll() {
    BD.SaveAll(dataBaseList).then(() => alert("all saved successfully "));
}

function DownloadAll() {
    for (var i = 0; i < dataBaseList.length; i++)
        _Download(dataBaseList[i]);
}

function ExecuteSQL() {
    var txtSQLSentence = document.getElementById(txtSqlId);
    var txtResult = document.getElementById(txtResultId);
    var selectedBD = DataBase();
    localStorage.setItem(SQLSENTENCE, txtSQLSentence.value);
    selectedBD.Execute(txtSQLSentence.value)
        .then((result) => {
            console.log(result);
            txtResult.value = "BD='" + selectedBD.Name + "' result:'" + BD.ResultToString(result) + "'";

        }).catch((error) => {
            txtResult.value = "BD='" + selectedBD.Name + "' '" + error + "'";
        });

}

function Clear() {
    document.getElementById(txtSqlId).value = "";
}