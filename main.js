Import("bd.js");
Import("sw.js");

function Import(file) {
    //source:http://www.forosdelweb.com/f13/importar-archivo-js-dentro-javascript-387358/
    document.write('<script language=\"JavaScript\" type=\"text/JavaScript\" src=' + file + '></script>');
}

const SQLSENTENCE = "sqlSentence";

var selectedBD;
var dbs;

window.onload = () => {

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/SQLTest/sw.js');
    }

    BD.LoadAll().then((bds) => {

            dbs = bds;
            if (dbs.length == 0) {
                dbs = [new BD()];
                dbs[0].Init.then(_LoadBDS);
            } else _LoadBDS();

        }
    });


function _LoadBDS() {
    return new Promise((okey, error) => {
        var selector = document.getElementById("cmbBDs");
        var elements;

        for (i in dbs) {

            selector.appendChild(GetOption(dbs[i], i));
        }
        ChangeBD(0);

        document.getElementById("inpSQLSentence").value = localStorage.getItem(SQLSENTENCE);
        document.getElementById("loader").remove();
        elements = document.getElementsByClassName("unloaded");
        for (var i = 0; i < elements.length; i++)
            elements[i].removeAttribute("class");

        okey();
    });
}

function GetOption(bd, i) {
    var option;
    option = document.createElement("option");
    option.setAttribute("value", i);
    option.innerHTML = bd.IdBD;
    return option;
}

function ChangeBD(index) {
    selectedBD = dbs[index];

}

function NewBD() {
    SetNewBD(new BD());
}

function CloneBD() {
    if (selectedBD != null)
        selectedBD.Clone().then((bd) => SetNewBD(bd));
    else alert("Please select one first");
}

function SetNewBD(bd) {

    var cmbBD = document.getElementById("cmbBDs");
    bd.Init.then(() => {
        dbs.push(bd);
        cmbBD.appendChild(GetOption(bd, cmbBD.length));
        ChangeBD(cmbBD.length - 1);
    });
}

function DeleteBD() {
    var found = false;
    var i;
    var selector;
    if (selectedBD != null) {

        for (i = 0; i < dbs.length && !found; i++) {
            found = selectedBD.IdBD == dbs[i].IdBD;
        }
        i--;
        dbs.splice(i);
        selector = document.getElementById("cmbBDs");
        selector.children[i].remove();
        localStorage.removeItem(selectedBD.IdBD);
        selectedBD = null;

        if (dbs.length == 0)
            NewBD();
        else ChangeBD(0);

    } else alert("Please select one first");
}

function Clear() {
    document.getElementById("inpSQLSentence").value = "";
    localStorage.removeItem(SQLSENTENCE);
}

function ExecuteSQL() {
    var SQLSentence = document.getElementById("inpSQLSentence").value;
    var inpResult = document.getElementById("inpSQLResult");
    if (selectedBD != null) {
        selectedBD.Execute(SQLSentence)
            .then((resultado) => {

                inpResult.value = "BD='" + selectedBD.IdBD + "' result:'" + BD.ResultToString(resultado) + "'";
                localStorage.setItem(SQLSENTENCE, SQLSentence);
            }).catch((error) => {
                inpResult.value = "BD='" + selectedBD.IdBD + "' error:'" + error + "'";
            });
    } else alert("Please select one first");
}

function SaveAll() {
    BD.SaveAll(dbs).then(() => alert("Saved successfully")).catch(() => alert("Error on save BDS"));

}

function Save() {
    if (selectedBD != null)
        selectedBD.Save().then(() => alert("Saved successfully")).catch(() => alert("Error on save BD:" + selectedBD.IdBD));
    else alert("Please select one first");
}